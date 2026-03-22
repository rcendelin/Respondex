import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { randomUUID } from 'crypto'
import { QueueServiceClient } from '@azure/storage-queue'
import { BlobStorageService } from '../services/storage.js'
import { SimulationConfigSchema } from '@respondex/shared'
import type { Person, SimulationConfig, SimulationChunkMessage, SimulationMeta, SimulationResponse } from '@respondex/shared'
import { SimulationStatus } from '@respondex/shared'
import { NotFoundError, ValidationError, errorResponse, requireUUID } from '../lib/errors.js'

const CHUNK_SIZE = 20
const QUEUE_NAME = 'simulation-chunks'
/** Maximum persons per simulation (resource exhaustion guard) */
const MAX_PERSONS = 1_000
/** Maximum questions per questionnaire in a simulation (cost exhaustion guard).
 *  At max load: 1000 persons × 100 questions × 10 runs = 1 000 000 API calls. */
const MAX_QUESTIONS = 100
/** Maximum request body size for JSON config in bytes (8 KB is generous for a config object) */
const MAX_CONFIG_BODY_BYTES = 8 * 1024

function storage() {
  return new BlobStorageService()
}

function queueClient(): QueueServiceClient {
  const connectionString = process.env['AZURE_STORAGE_CONNECTION_STRING']
  if (!connectionString) {
    throw new Error('AZURE_STORAGE_CONNECTION_STRING environment variable is not set')
  }
  return QueueServiceClient.fromConnectionString(connectionString)
}

/** Encode queue message as base64 JSON (Azure Queue requires base64) */
function encodeMessage(msg: SimulationChunkMessage): string {
  return Buffer.from(JSON.stringify(msg), 'utf-8').toString('base64')
}

// ── POST /api/simulations ──────────────────────────────────────────────────
async function createSimulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    // Guard request body size before parsing (prevents memory exhaustion via huge JSON body)
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > MAX_CONFIG_BODY_BYTES) {
      throw new ValidationError(`Tělo požadavku je příliš velké (max ${MAX_CONFIG_BODY_BYTES / 1024} KB)`)
    }

    const body = await req.json()

    // Validate config with Zod schema (applies defaults, enforces model whitelist, bounds checks)
    const parseResult = SimulationConfigSchema.safeParse(body)
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]
      throw new ValidationError(firstError?.message ?? 'Neplatná konfigurace simulace')
    }
    const config = parseResult.data

    // Validate referenced population exists (UUID v4 check prevents path traversal)
    const populationId = requireUUID(config.population_id, 'population_id')
    const svc = storage()
    const populationExists = await svc.blobExists(`data/populations/${populationId}/meta.json`)
    if (!populationExists) {
      throw new NotFoundError('Populace nebyla nalezena')
    }

    // Validate referenced questionnaire exists
    const questionnaireId = requireUUID(config.questionnaire_id, 'questionnaire_id')
    const questionnaireExists = await svc.blobExists(`data/questionnaires/${questionnaireId}/meta.json`)
    if (!questionnaireExists) {
      throw new NotFoundError('Dotazník nebyl nalezen')
    }

    // Load questions and persons in parallel (independent resources)
    const [questions, persons] = await Promise.all([
      svc.readJson<unknown[]>(`data/questionnaires/${questionnaireId}/questions.json`),
      svc.readJson<Person[]>(`data/populations/${populationId}/persons.json`),
    ])

    if (!Array.isArray(questions) || questions.length === 0) {
      throw new ValidationError('Dotazník neobsahuje žádné otázky')
    }
    if (questions.length > MAX_QUESTIONS) {
      throw new ValidationError(`Dotazník obsahuje ${questions.length} otázek — maximum je ${MAX_QUESTIONS}`)
    }
    if (!Array.isArray(persons) || persons.length === 0) {
      throw new ValidationError('Populace neobsahuje žádné osoby')
    }
    if (persons.length > MAX_PERSONS) {
      throw new ValidationError(`Simulace podporuje maximálně ${MAX_PERSONS} osob (populace obsahuje ${persons.length})`)
    }

    // Split persons into chunks
    const personIds = persons.map((p) => p.id)
    const chunks: string[][] = []
    for (let i = 0; i < personIds.length; i += CHUNK_SIZE) {
      chunks.push(personIds.slice(i, i + CHUNK_SIZE))
    }
    const totalChunks = chunks.length

    // Build config without undefined optional fields (exactOptionalPropertyTypes requirement)
    const safeConfig: SimulationConfig = {
      population_id: config.population_id,
      questionnaire_id: config.questionnaire_id,
      strategy: config.strategy,
      model: config.model,
      temperature: config.temperature,
      runs_per_person: config.runs_per_person,
      ...(config.variance_mode !== undefined ? { variance_mode: config.variance_mode } : {}),
      ...(config.run_calibration === true ? { run_calibration: true } : {}),
      ...(config.ensemble_models !== undefined ? { ensemble_models: config.ensemble_models } : {}),
    }

    const simulationId = randomUUID()
    const now = new Date().toISOString()
    const meta: SimulationMeta = {
      id: simulationId,
      config: safeConfig,
      status: SimulationStatus.RUNNING,
      total_chunks: totalChunks,
      completed_chunks: 0,
      started_at: now,
    }

    // Persist meta before enqueue — status starts as RUNNING
    await svc.writeJson(`data/simulations/${simulationId}/meta.json`, meta)

    // Enqueue chunk messages; on partial failure, mark simulation as FAILED
    const queueSvc = queueClient()
    const queueRef = queueSvc.getQueueClient(QUEUE_NAME)
    await queueRef.createIfNotExists()

    try {
      await Promise.all(
        chunks.map((chunkPersonIds, i) => {
          if (!chunkPersonIds) return Promise.resolve()
          const chunkNumber = String(i + 1).padStart(3, '0')
          const msg: SimulationChunkMessage = {
            simulation_id: simulationId,
            chunk_index: i,
            chunk_number: chunkNumber,
            person_ids: chunkPersonIds,
            config: safeConfig,
          }
          return queueRef.sendMessage(encodeMessage(msg))
        })
      )
    } catch (enqueueErr) {
      // Partial enqueue — mark simulation as failed so it doesn't stay "running" forever
      const failedMeta: SimulationMeta = {
        ...meta,
        status: SimulationStatus.FAILED,
        error: 'Chyba při zařazení do fronty — simulace nebyla spuštěna',
      }
      await svc.writeJson(`data/simulations/${simulationId}/meta.json`, failedMeta).catch(() => {
        // Best effort — if this also fails, log only
        ctx.error(`Failed to update meta for simulation ${simulationId} after enqueue failure`)
      })
      throw enqueueErr
    }

    ctx.log(
      `Simulation ${simulationId} started: ${persons.length} persons, ${totalChunks} chunks, strategy ${config.strategy}`
    )

    return {
      status: 202,
      jsonBody: {
        simulation_id: simulationId,
        status: SimulationStatus.RUNNING,
        total_chunks: totalChunks,
        person_count: persons.length,
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/simulations ───────────────────────────────────────────────────
async function listSimulations(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const url = new URL(req.url)
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? 20), 1), 100)
    const offset = Math.max(Number(url.searchParams.get('offset') ?? 0), 0)

    const svc = storage()
    const blobs = await svc.listBlobs('data/simulations/')
    const metaBlobs = blobs.filter((b) => b.endsWith('/meta.json'))
    // Sort by path descending (newest first by UUID is arbitrary, but consistent)
    metaBlobs.sort((a, b) => b.localeCompare(a))
    const page = metaBlobs.slice(offset, offset + limit)

    const metas = await Promise.all(
      page.map((path) => svc.readJson<SimulationMeta>(path).catch(() => null))
    )
    const valid = metas.filter((m): m is SimulationMeta => m !== null)
    valid.sort((a, b) => b.started_at.localeCompare(a.started_at))
    return {
      status: 200,
      jsonBody: { simulations: valid, total: metaBlobs.length, limit, offset },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/simulations/{id}/status ──────────────────────────────────────
async function getSimulationStatus(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/simulations/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError('Simulace nebyla nalezena')

    const meta = await svc.readJson<SimulationMeta>(`data/simulations/${id}/meta.json`)

    const progressPct =
      meta.total_chunks > 0
        ? Math.round((meta.completed_chunks / meta.total_chunks) * 100)
        : 0

    return {
      status: 200,
      jsonBody: {
        simulation_id: meta.id,
        status: meta.status,
        total_chunks: meta.total_chunks,
        completed_chunks: meta.completed_chunks,
        progress_pct: progressPct,
        started_at: meta.started_at,
        ...(meta.completed_at !== undefined ? { completed_at: meta.completed_at } : {}),
        ...(meta.error !== undefined ? { error: meta.error } : {}),
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/simulations/{id} ──────────────────────────────────────────────
async function getSimulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/simulations/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError('Simulace nebyla nalezena')
    const meta = await svc.readJson<SimulationMeta>(`data/simulations/${id}/meta.json`)
    return { status: 200, jsonBody: meta }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── DELETE /api/simulations/{id} ───────────────────────────────────────────
async function deleteSimulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/simulations/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError('Simulace nebyla nalezena')

    // Refuse to delete a running simulation to prevent orphaned queue consumers
    const meta = await svc.readJson<SimulationMeta>(`data/simulations/${id}/meta.json`)
    if (meta.status === SimulationStatus.RUNNING) {
      throw new ValidationError('Nelze smazat probíhající simulaci (status: running)')
    }

    await svc.deletePrefix(`data/simulations/${id}/`)
    ctx.log(`Simulation ${id} deleted`)
    return { status: 204 }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/simulations/{id}/results ─────────────────────────────────────
async function getSimulationResults(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/simulations/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError('Simulace nebyla nalezena')

    const meta = await svc.readJson<SimulationMeta>(`data/simulations/${id}/meta.json`)

    // List all chunk result files
    const blobs = await svc.listBlobs(`data/simulations/${id}/responses/`)
    const chunkBlobs = blobs.filter((b) => b.includes('/responses/chunk-') && b.endsWith('.json'))
    chunkBlobs.sort() // sort by chunk number (chunk-001, chunk-002, ...)

    // Load and merge all chunk results
    const chunkArrays = await Promise.all(
      chunkBlobs.map((path) =>
        svc.readJson<SimulationResponse[]>(path).catch(() => [] as SimulationResponse[])
      )
    )
    const allResponses = chunkArrays.flat()

    // Optional pagination
    const url = new URL(req.url)
    const limitParam = url.searchParams.get('limit')
    const offsetParam = url.searchParams.get('offset')
    const limit = limitParam !== null ? Math.min(Math.max(Number(limitParam), 1), 1000) : undefined
    const offset = offsetParam !== null ? Math.max(Number(offsetParam), 0) : 0

    const pagedResponses = limit !== undefined
      ? allResponses.slice(offset, offset + limit)
      : allResponses.slice(offset)

    return {
      status: 200,
      jsonBody: {
        simulation_id: id,
        status: meta.status,
        total_responses: allResponses.length,
        responses: pagedResponses,
        ...(limit !== undefined ? { limit, offset } : {}),
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── Route registrations ────────────────────────────────────────────────────
app.http('createSimulation', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'simulations',
  handler: createSimulation,
})

app.http('listSimulations', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'simulations',
  handler: listSimulations,
})

app.http('getSimulation', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'simulations/{id}',
  handler: getSimulation,
})

app.http('getSimulationStatus', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'simulations/{id}/status',
  handler: getSimulationStatus,
})

app.http('deleteSimulation', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'simulations/{id}',
  handler: deleteSimulation,
})

app.http('getSimulationResults', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'simulations/{id}/results',
  handler: getSimulationResults,
})
