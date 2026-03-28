import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions'
import { randomUUID } from 'crypto'
import { BlobStorageService } from '../services/storage.js'
import { computeAndCompareArms } from '../services/ab-test-engine.js'
import type {
  ABTestConfig,
  ABTestComparison,
  SimulationResponse,
  Question,
  Person,
} from '@respondex/shared'
import { REFERENCE_QUESTIONS } from '@respondex/shared'

function storage() {
  return new BlobStorageService()
}

// ── GET /api/ab-tests ────────────────────────────────────────────────────
async function listABTests(_req: HttpRequest): Promise<HttpResponseInit> {
  const svc = storage()
  try {
    const blobs = await svc.listBlobs('data/ab-tests/')
    const configBlobs = blobs.filter((b) => b.endsWith('/config.json'))
    const configs = await Promise.all(configBlobs.map((b) => svc.readJson<ABTestConfig>(b)))
    configs.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return { status: 200, jsonBody: configs }
  } catch {
    return { status: 200, jsonBody: [] }
  }
}

// ── GET /api/ab-tests/{id} ───────────────────────────────────────────────
async function getABTest(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params['id']
  if (!id) return { status: 400, jsonBody: { error: 'Chybí ID testu' } }
  const svc = storage()
  try {
    const config = await svc.readJson<ABTestConfig>(`data/ab-tests/${id}/config.json`)
    return { status: 200, jsonBody: config }
  } catch {
    return { status: 404, jsonBody: { error: 'A/B test nenalezen' } }
  }
}

// ── GET /api/ab-tests/{id}/results ───────────────────────────────────────
async function getABTestResults(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params['id']
  if (!id) return { status: 400, jsonBody: { error: 'Chybí ID testu' } }
  const svc = storage()

  try {
    // Try to load cached comparison
    const comparison = await svc.readJson<ABTestComparison>(`data/ab-tests/${id}/comparison.json`)
    return { status: 200, jsonBody: comparison }
  } catch {
    // Not yet computed — compute now
    try {
      const configPath = `data/ab-tests/${id}/config.json`
      const config = await svc.readJson<ABTestConfig>(configPath)

      const questionsPath = `data/questionnaires/${config.questionnaire_id}/questions.json`
      const personsPath = `data/populations/${config.population_id}/persons.json`

      let questions: Question[]
      let persons: Person[]
      try {
        ;[questions, persons] = await Promise.all([
          svc.readJson<Question[]>(questionsPath),
          svc.readJson<Person[]>(personsPath),
        ])
      } catch (err) {
        const msg = err instanceof Error ? err.message : ''
        if (msg.includes(config.questionnaire_id) || msg.includes('questionnaires')) {
          return { status: 400, jsonBody: { error: `Dotazník ${config.questionnaire_id} nenalezen (${questionsPath})` } }
        }
        return { status: 400, jsonBody: { error: `Populace ${config.population_id} nenalezena (${personsPath})` } }
      }

      // Load responses for each arm
      const armData: { arm_id: string; arm_name: string; responses: SimulationResponse[] }[] = []

      await Promise.all(config.arms.map(async (arm) => {
        const simChunks = await Promise.all(arm.simulation_ids.map(async (simId) => {
          try {
            const chunkBlobs = await svc.listBlobs(`data/simulations/${simId}/responses/`)
            const chunks = await Promise.all(chunkBlobs.map((blob) => svc.readJson<SimulationResponse[]>(blob)))
            return chunks.flat()
          } catch {
            return [] as SimulationResponse[]
          }
        }))
        const allResponses = simChunks.flat()
        if (allResponses.length > 0) {
          armData.push({ arm_id: arm.id, arm_name: arm.name, responses: allResponses })
        }
      }))

      if (armData.length < 2) {
        return { status: 400, jsonBody: { error: `Nedostatek dokončených ramen pro srovnání (${armData.length} z ${config.arms.length})` } }
      }

      // Prefer 'standard' arm as baseline; fall back to first arm
      const standardArm = config.arms.find((a) => a.config_override.variance_mode === 'standard')
      const baselineArmId = standardArm?.id ?? config.arms[0]?.id ?? armData[0]!.arm_id
      const { armMetrics, comparison } = computeAndCompareArms(
        armData, questions, persons, config.reference_questions, baselineArmId,
      )
      comparison.test_id = id

      // Update arm metrics in config
      for (const am of armMetrics) {
        const arm = config.arms.find((a) => a.id === am.arm_id)
        if (arm) arm.metrics = am.metrics
      }

      // Cache results
      await Promise.all([
        svc.writeJson(`data/ab-tests/${id}/comparison.json`, comparison),
        svc.writeJson(`data/ab-tests/${id}/config.json`, config), // updated with arm metrics
      ])

      return { status: 200, jsonBody: comparison }
    } catch (err) {
      return { status: 500, jsonBody: { error: `Chyba výpočtu: ${err instanceof Error ? err.message : 'unknown'}` } }
    }
  }
}

// ── POST /api/ab-tests ───────────────────────────────────────────────────
async function createABTest(req: HttpRequest): Promise<HttpResponseInit> {
  try {
    const body = await req.json() as {
      name?: string
      description?: string
      population_id?: string
      questionnaire_id?: string
      arms?: { name: string; variance_mode: string; simulation_id: string }[]
      simulation_ids?: string[]
    }

    if (!body.name || !body.population_id || !body.questionnaire_id) {
      return { status: 400, jsonBody: { error: 'Povinná pole: name, population_id, questionnaire_id' } }
    }

    const id = randomUUID()
    const config: ABTestConfig = {
      id,
      name: String(body.name).trim(),
      description: body.description ? String(body.description).trim() : undefined,
      created_at: new Date().toISOString(),
      population_id: body.population_id,
      questionnaire_id: body.questionnaire_id,
      reference_questions: REFERENCE_QUESTIONS,
      arms: (body.arms ?? []).map((a, i) => ({
        id: `arm-${i}`,
        name: a.name,
        description: `Variance mode: ${a.variance_mode}`,
        config_override: { variance_mode: a.variance_mode as any },
        simulation_ids: a.simulation_id ? [a.simulation_id] : [],
      })),
      base_config: {
        population_id: body.population_id,
        questionnaire_id: body.questionnaire_id,
        strategy: 'A' as any,
        model: 'gpt-5.4-mini',
        temperature: 0.7,
        runs_per_person: 3,
      },
      runs_per_person: 3,
      replications: 1,
      status: 'completed',
    }

    const svc = storage()
    await svc.writeJson(`data/ab-tests/${id}/config.json`, config)

    return { status: 201, jsonBody: { id, name: config.name, status: config.status } }
  } catch (err) {
    return { status: 500, jsonBody: { error: `Chyba: ${err instanceof Error ? err.message : 'unknown'}` } }
  }
}

// ── DELETE /api/ab-tests/{id} ─────────────────────────────────────────────
async function deleteABTest(req: HttpRequest): Promise<HttpResponseInit> {
  const id = req.params['id']
  if (!id) return { status: 400, jsonBody: { error: 'Chybí ID testu' } }
  const svc = storage()
  try {
    await svc.deletePrefix(`data/ab-tests/${id}/`)
    return { status: 204 }
  } catch {
    return { status: 404, jsonBody: { error: 'A/B test nenalezen' } }
  }
}

// ── GET /api/reference-questions ─────────────────────────────────────────
async function getReferenceQuestions(_req: HttpRequest): Promise<HttpResponseInit> {
  return { status: 200, jsonBody: REFERENCE_QUESTIONS }
}

// ── Register endpoints ───────────────────────────────────────────────────

app.http('listABTests', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ab-tests',
  handler: listABTests,
})

app.http('getABTest', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ab-tests/{id}',
  handler: getABTest,
})

app.http('getABTestResults', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'ab-tests/{id}/results',
  handler: getABTestResults,
})

app.http('createABTest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ab-tests',
  handler: createABTest,
})

app.http('deleteABTest', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'ab-tests/{id}',
  handler: deleteABTest,
})

app.http('getReferenceQuestions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reference/questions',
  handler: getReferenceQuestions,
})
