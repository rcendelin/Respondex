import { app, type InvocationContext } from '@azure/functions'
import { BlobStorageService } from '../services/storage.js'
import { OpenAIService } from '../services/openai.js'
import { buildPrompt, isRefusal, REFUSAL_FALLBACK, buildCompetenceProbe, extractCompetenceHint, isNumericQuestion } from '../services/prompt-builder.js'
import { estimateQuestionDifficulty, numeracyToTheta, computeCompetenceProbability, generateIRTHint } from '../services/irt-engine.js'
import { generateStochasticAnswer } from '../services/stochastic-numeric-generator.js'
import { expandVariance, checkCoherence, buildCalibrationReport } from '../services/calibration.js'
import { parseModelResponse } from '../services/response-parser.js'
import type {
  Person,
  Question,
  SimulationChunkMessage,
  SimulationMeta,
  SimulationResponse,
  SupportedModel,
} from '@respondex/shared'
import { SimulationStatus, Strategy, VarianceMode, assignNumeracyProfile } from '@respondex/shared'
import { parseChunkMessage } from '../lib/queue.js'

/** Max OpenAI call retries for refusals */
const MAX_REFUSAL_RETRIES = 2

function storage() {
  return new BlobStorageService()
}

/**
 * Queue trigger: processSimulationChunk
 * Triggered by messages on the 'simulation-chunks' queue.
 * For each chunk: iterates persons × questions × runs, calls OpenAI, saves results.
 */
async function processSimulationChunk(
  messageText: unknown,
  ctx: InvocationContext
): Promise<void> {
  // Deserialize and validate queue message with Zod schema.
  // This enforces UUID format on all ID fields (prevents path traversal) and validates
  // chunk_number format, model whitelist, and all config bounds. Invalid messages are
  // thrown to trigger Azure dead-letter (maxDequeueCount = 5).
  const { msg: parsedMsg } = parseChunkMessage(messageText)
  if (!parsedMsg) {
    const err = new Error('Invalid chunk message format')
    ctx.error('Failed to parse/validate chunk message — moving to dead letter:', err.message)
    throw err
  }
  const msg: SimulationChunkMessage = parsedMsg

  const { simulation_id, chunk_index, chunk_number, person_ids, config } = msg
  const svc = storage()

  // Verify simulation still exists and is in RUNNING state
  const metaPath = `data/simulations/${simulation_id}/meta.json`
  let meta: SimulationMeta
  try {
    meta = await svc.readJson<SimulationMeta>(metaPath)
  } catch {
    ctx.warn(`Simulation ${simulation_id} meta not found — skipping chunk ${chunk_number}`)
    return
  }

  if (meta.status !== SimulationStatus.RUNNING) {
    ctx.warn(
      `Simulation ${simulation_id} status is "${meta.status}" — skipping chunk ${chunk_number}`
    )
    return
  }

  // Load persons for this chunk
  const allPersons = await svc.readJson<Person[]>(
    `data/populations/${config.population_id}/persons.json`
  )
  const chunkPersons = allPersons.filter((p) => person_ids.includes(p.id))
  if (chunkPersons.length === 0) {
    ctx.warn(`No persons found for chunk ${chunk_number} in simulation ${simulation_id}`)
    return
  }

  // Load questionnaire questions
  const questions = await svc.readJson<Question[]>(
    `data/questionnaires/${config.questionnaire_id}/questions.json`
  )
  if (!Array.isArray(questions) || questions.length === 0) {
    ctx.warn(`No questions found for simulation ${simulation_id}`)
    return
  }

  // Assign PIAAC numeracy profile to persons that don't have one yet
  for (const person of chunkPersons) {
    if (!person.demographics) person.demographics = {} as Person['demographics'] & {}
    if (person.demographics!.numeracy_level == null || person.demographics!.piaac_score == null) {
      const profile = assignNumeracyProfile(person)
      person.demographics!.numeracy_level = profile.level
      person.demographics!.piaac_score = profile.score
    }
  }

  const openai = new OpenAIService()
  const responses: SimulationResponse[] = []

  // Process sequentially: person × question × run (respects OpenAI rate limits)
  for (const person of chunkPersons) {
    for (const question of questions) {
      for (let run = 1; run <= config.runs_per_person; run++) {
        let response: SimulationResponse | null = null

        try {
          response = await callWithRefusalRetry(
            openai,
            person,
            question,
            config.strategy as Strategy,
            config.model as SupportedModel, // guaranteed by SimulationChunkMessageSchema.safeParse above
            config.temperature,
            (config.variance_mode as VarianceMode) ?? VarianceMode.STANDARD,
            run,
            ctx
          )
        } catch (err) {
          // Log error without full person data (avoid PII in logs)
          // Error message from OpenAI SDK is safe to log (no user content)
          ctx.error(
            `OpenAI call failed for question=${question.id} run=${run}:`,
            err instanceof Error ? err.message : 'unknown error'
          )
          response = {
            person_id: person.id,
            question_id: question.id,
            run,
            answer: '',
            valid: false,
            invalid_reason: 'OpenAI volání selhalo',
            strategy: config.strategy as Strategy,
            model: config.model,
            temperature: config.temperature,
            timestamp: new Date().toISOString(),
          }
        }

        if (response) responses.push(response)
      }
    }
  }

  // Save chunk results
  const chunkResultPath = `data/simulations/${simulation_id}/responses/chunk-${chunk_number}.json`
  await svc.writeJson(chunkResultPath, responses)

  ctx.log(
    `Chunk ${chunk_number} of simulation ${simulation_id}: ${responses.length} responses saved`
  )

  // Atomically increment completed_chunks in meta.json
  await incrementCompletedChunks(svc, simulation_id, meta, ctx)
}

/** Truncate invalid_reason to prevent excessive blob sizes */
function safeInvalidReason(reason: string): string {
  return reason.substring(0, 500)
}

/**
 * Call OpenAI with refusal detection and retry.
 * On refusal, appends REFUSAL_FALLBACK instruction and retries (up to MAX_REFUSAL_RETRIES).
 *
 * NOTE on prompt injection: person.life_story and question.text are user-provided strings
 * that enter the prompt by design — this is a simulation platform. The model output is
 * never executed as code. open_text answers are truncated to 2000 chars in parseModelResponse.
 * All other answer types are validated against expected formats/ranges.
 */
async function callWithRefusalRetry(
  openai: OpenAIService,
  person: Person,
  question: Question,
  strategy: Strategy,
  model: SupportedModel,
  temperature: number,
  varianceMode: VarianceMode,
  run: number,
  ctx: InvocationContext
): Promise<SimulationResponse> {
  const timestamp = new Date().toISOString()

  // Stochastic bypass: numeric questions with correct answers skip LLM entirely
  if (question.is_numeric && question.correct_answer != null) {
    const piaacScore = person.demographics?.piaac_score ?? 267
    const itemParams = estimateQuestionDifficulty(question)
    const result = generateStochasticAnswer(piaacScore, question, itemParams)

    return {
      person_id: person.id,
      question_id: question.id,
      run,
      answer: result.answer,
      valid: true,
      strategy,
      model: 'stochastic-piaac' as SupportedModel,
      temperature: 0,
      timestamp,
    }
  }

  let { system, user } = buildPrompt(person, question, strategy, varianceMode)

  // Layer 3a: IRT-based competence modulation (Algorithm 2) — zero extra LLM calls
  if ((varianceMode === VarianceMode.IRT_MODULATED || varianceMode === VarianceMode.DLCE) && isNumericQuestion(question)) {
    const theta = numeracyToTheta(person.demographics?.numeracy_level)
    const itemParams = estimateQuestionDifficulty(question)
    const pCorrect = computeCompetenceProbability(theta, itemParams)
    const hint = generateIRTHint(pCorrect, person.demographics?.numeracy_level)
    user = `${user}\n\n${hint}`
  }

  // Layer 3b: Two-step competence probe for numeric questions (legacy — extra LLM call)
  if (varianceMode === VarianceMode.TWO_STEP && isNumericQuestion(question)) {
    try {
      const probeResult = await openai.callModel({
        model,
        systemPrompt: system,
        userPrompt: buildCompetenceProbe(person, question),
        temperature: 0.3,
      })
      const hint = extractCompetenceHint(probeResult.content)
      user = `${user}\n\nKOMPETENCE RESPONDENTA PRO TUTO OTÁZKU: ${hint}`
    } catch (err) {
      ctx.warn(`Competence probe failed for question=${question.id} run=${run}: ${err instanceof Error ? err.message : 'unknown'}`)
      // Continue without probe — Layer 1+2 still active
    }
  }

  for (let attempt = 0; attempt <= MAX_REFUSAL_RETRIES; attempt++) {
    const result = await openai.callModel({
      model, // validated as SupportedModel via SimulationChunkMessageSchema at deserialization
      systemPrompt: system,
      userPrompt: user,
      temperature,
    })

    if (isRefusal(result.content)) {
      // Log question and run, but not person.id (avoid PII in Application Insights logs)
      ctx.warn(
        `Refusal detected for question=${question.id} run=${run} attempt=${attempt + 1}`
      )
      if (attempt < MAX_REFUSAL_RETRIES) {
        // Append refusal fallback to user message and retry
        user = `${user}\n\n${REFUSAL_FALLBACK}`
        continue
      }
      // Exhausted retries — mark as invalid
      return {
        person_id: person.id,
        question_id: question.id,
        run,
        answer: '',
        valid: false,
        invalid_reason: safeInvalidReason('Model odmítl odpovědět (refusal)'),
        strategy,
        model,
        temperature,
        timestamp,
        tokens_used: {
          prompt: result.usage.input_tokens,
          completion: result.usage.output_tokens,
          total: result.usage.total_tokens,
        },
      }
    }

    // Parse and validate response
    const parsed = parseModelResponse(result.content, question)

    const baseResponse: SimulationResponse = {
      person_id: person.id,
      question_id: question.id,
      run,
      answer: parsed.answer,
      valid: parsed.valid,
      strategy,
      model,
      temperature,
      timestamp,
      tokens_used: {
        prompt: result.usage.input_tokens,
        completion: result.usage.output_tokens,
        total: result.usage.total_tokens,
      },
    }

    if (!parsed.valid && parsed.invalid_reason !== undefined) {
      return { ...baseResponse, invalid_reason: safeInvalidReason(parsed.invalid_reason) }
    }

    return baseResponse
  }

  // Should never reach here
  return {
    person_id: person.id,
    question_id: question.id,
    run,
    answer: '',
    valid: false,
    invalid_reason: 'Nečekaná chyba při volání modelu',
    strategy,
    model,
    temperature,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Best-effort increment of meta.completed_chunks.
 * On the last chunk, sets status to COMPLETED and records completed_at.
 *
 * NOTE on race condition: Azure Blob Storage does not support atomic compare-and-swap.
 * Concurrent chunk processors could both read the same completed_chunks value and
 * both write (N+1). For MVP single-simulation workloads this is acceptable — chunk
 * messages are processed sequentially by Azure Functions consumption plan by default.
 * For Phase 2 high-throughput scenarios, use Azure Cosmos DB or Redis for atomic counters.
 */
async function incrementCompletedChunks(
  svc: BlobStorageService,
  simulationId: string,
  previousMeta: SimulationMeta,
  ctx: InvocationContext
): Promise<void> {
  const metaPath = `data/simulations/${simulationId}/meta.json`

  // Re-read meta immediately before write to minimize stale-read window
  let currentMeta: SimulationMeta
  try {
    currentMeta = await svc.readJson<SimulationMeta>(metaPath)
  } catch {
    ctx.error(`Failed to re-read meta for simulation ${simulationId} before increment`)
    currentMeta = previousMeta
  }

  const newCompleted = currentMeta.completed_chunks + 1
  const isLastChunk = newCompleted >= currentMeta.total_chunks

  const updatedMeta: SimulationMeta = {
    ...currentMeta,
    completed_chunks: newCompleted,
    ...(isLastChunk
      ? {
          status: SimulationStatus.COMPLETED,
          completed_at: new Date().toISOString(),
        }
      : {}),
  }

  await svc.writeJson(metaPath, updatedMeta)

  if (isLastChunk) {
    ctx.log(
      `Simulation ${simulationId} COMPLETED: ${newCompleted}/${currentMeta.total_chunks} chunks`
    )

    // DLCE post-hoc calibration: run after all chunks are done
    if (currentMeta.config.variance_mode === VarianceMode.DLCE) {
      try {
        ctx.log(`Simulation ${simulationId}: starting DLCE calibration...`)
        // Load all responses
        const chunkBlobs = await svc.listBlobs(`data/simulations/${simulationId}/responses/`)
        const allResponses: import('@respondex/shared').SimulationResponse[] = []
        for (const blobPath of chunkBlobs) {
          const chunk = await svc.readJson<import('@respondex/shared').SimulationResponse[]>(blobPath)
          allResponses.push(...chunk)
        }
        // Load questions and persons
        const questions = await svc.readJson<import('@respondex/shared').Question[]>(
          `data/questionnaires/${currentMeta.config.questionnaire_id}/questions.json`
        )
        const persons = await svc.readJson<import('@respondex/shared').Person[]>(
          `data/populations/${currentMeta.config.population_id}/persons.json`
        )
        // Run calibration
        const calibrated = expandVariance(allResponses, questions)
        const report = buildCalibrationReport(simulationId, allResponses, calibrated, questions)
        const coherence = checkCoherence(allResponses, questions, persons)
        coherence.simulation_id = simulationId
        // Save calibrated results
        await svc.writeJson(`data/simulations/${simulationId}/calibrated/responses.json`, calibrated)
        await svc.writeJson(`data/simulations/${simulationId}/calibrated/calibration-report.json`, report)
        await svc.writeJson(`data/simulations/${simulationId}/calibrated/coherence-report.json`, coherence)
        ctx.log(`Simulation ${simulationId}: DLCE calibration complete — ${report.total_calibrated} responses modified`)
      } catch (err) {
        ctx.error(`DLCE calibration failed for ${simulationId}: ${err instanceof Error ? err.message : 'unknown'}`)
        // Non-fatal: raw results are still available
      }
    }
  } else {
    ctx.log(
      `Simulation ${simulationId} progress: ${newCompleted}/${currentMeta.total_chunks} chunks`
    )
  }
}

// ── Queue trigger registration ─────────────────────────────────────────────
app.storageQueue('processSimulationChunk', {
  queueName: 'simulation-chunks',
  connection: 'AZURE_STORAGE_CONNECTION_STRING',
  handler: processSimulationChunk,
})
