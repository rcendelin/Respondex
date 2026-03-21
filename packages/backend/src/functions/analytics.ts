import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { BlobStorageService } from '../services/storage.js'
import { computeAnalytics, computeCrossTabs } from '../services/analytics.js'
import { generateResultsXlsx } from '@respondex/shared'
import { SimulationStatus } from '@respondex/shared'
import type { SimulationResponse, SimulationMeta, Question, Person, AnalyticsResult } from '@respondex/shared'
import { NotFoundError, ValidationError, ConflictError, errorResponse, requireUUID } from '../lib/errors.js'

/** Allowed demographic group-by values */
const ALLOWED_GROUP_BY = new Set([
  'Pohlavi',
  'VekovaSkupina',
  'Vzdelani',
  'Region',
  'Zamestnani',
  'RodinnyStav',
  'PrijmoveRozpeti',
])

function storage() {
  return new BlobStorageService()
}

/**
 * Load all chunk responses for a simulation.
 * Throws if any chunk fails to load — partial analytics are worse than none.
 */
async function loadAllResponses(
  svc: BlobStorageService,
  simulationId: string,
  ctx: InvocationContext
): Promise<SimulationResponse[]> {
  const blobs = await svc.listBlobs(`data/simulations/${simulationId}/responses/`)
  const chunkBlobs = blobs
    .filter((b) => b.includes('/responses/chunk-') && b.endsWith('.json'))
    .sort()

  const results = await Promise.allSettled(
    chunkBlobs.map((p) => svc.readJson<SimulationResponse[]>(p))
  )

  const failedChunks: string[] = []
  const arrays: SimulationResponse[][] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!
    if (result.status === 'fulfilled') {
      arrays.push(result.value)
    } else {
      const path = chunkBlobs[i] ?? `chunk[${i}]`
      ctx.error(`Analytics: failed to load chunk ${path}: ${String(result.reason)}`)
      failedChunks.push(path)
    }
  }

  if (failedChunks.length > 0) {
    throw new Error(`Nepodařilo se načíst ${failedChunks.length} chunk(ů) — analytika nelze dokončit`)
  }

  return arrays.flat()
}

/**
 * Read simulation meta and validate referenced IDs.
 * Returns meta + validated blob paths for questions and persons.
 */
async function loadSimulationMeta(
  svc: BlobStorageService,
  simulationId: string
): Promise<{ meta: SimulationMeta; questionsPath: string; personsPath: string }> {
  const meta = await svc.readJson<SimulationMeta>(`data/simulations/${simulationId}/meta.json`)

  // Validate sub-IDs read from stored meta to prevent path traversal
  const questionnaireId = requireUUID(meta.config.questionnaire_id, 'questionnaire_id')
  const populationId = requireUUID(meta.config.population_id, 'population_id')

  return {
    meta,
    questionsPath: `data/questionnaires/${questionnaireId}/questions.json`,
    personsPath: `data/populations/${populationId}/persons.json`,
  }
}

// ── GET /api/analytics/{simulationId}/summary ──────────────────────────────
async function getSummary(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const simulationId = requireUUID(req.params['simulationId'], 'simulationId')
    const svc = storage()

    const metaExists = await svc.blobExists(`data/simulations/${simulationId}/meta.json`)
    if (!metaExists) throw new NotFoundError('Simulace nebyla nalezena')

    // Try cached analytics first (only valid if simulation is completed)
    const analyticsPath = `data/simulations/${simulationId}/analytics.json`
    const hasCache = await svc.blobExists(analyticsPath)
    if (hasCache) {
      const cached = await svc.readJson<AnalyticsResult>(analyticsPath)
      return { status: 200, jsonBody: cached }
    }

    const { meta, questionsPath, personsPath } = await loadSimulationMeta(svc, simulationId)

    // Only compute analytics for completed simulations
    if (meta.status !== SimulationStatus.COMPLETED) {
      throw new ConflictError(
        `Analytika je dostupná pouze pro dokončené simulace (aktuální stav: ${meta.status})`
      )
    }

    const [responses, questions, persons] = await Promise.all([
      loadAllResponses(svc, simulationId, ctx),
      svc.readJson<Question[]>(questionsPath),
      svc.readJson<Person[]>(personsPath),
    ])

    const analytics = computeAnalytics(simulationId, responses, questions, persons)
    // Cache for subsequent requests
    await svc.writeJson(analyticsPath, analytics)

    return { status: 200, jsonBody: analytics }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/analytics/{simulationId}/crosstabs?by=Pohlavi ────────────────
async function getCrosstabs(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const simulationId = requireUUID(req.params['simulationId'], 'simulationId')
    const url = new URL(req.url)
    const groupBy = url.searchParams.get('by') ?? 'Pohlavi'

    if (!ALLOWED_GROUP_BY.has(groupBy)) {
      throw new ValidationError(
        `Neplatná hodnota parametru "by". Povolené hodnoty: ${[...ALLOWED_GROUP_BY].join(', ')}`
      )
    }

    const svc = storage()
    const metaExists = await svc.blobExists(`data/simulations/${simulationId}/meta.json`)
    if (!metaExists) throw new NotFoundError('Simulace nebyla nalezena')

    const { meta, questionsPath, personsPath } = await loadSimulationMeta(svc, simulationId)

    if (meta.status !== SimulationStatus.COMPLETED) {
      throw new ConflictError(
        `Analytika je dostupná pouze pro dokončené simulace (aktuální stav: ${meta.status})`
      )
    }

    const [responses, questions, persons] = await Promise.all([
      loadAllResponses(svc, simulationId, ctx),
      svc.readJson<Question[]>(questionsPath),
      svc.readJson<Person[]>(personsPath),
    ])

    const crossTabs = computeCrossTabs(responses, questions, persons, groupBy)
    return {
      status: 200,
      jsonBody: {
        simulation_id: simulationId,
        group_by: groupBy,
        cross_tabs: crossTabs,
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/analytics/{simulationId}/export ──────────────────────────────
async function exportXlsx(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const simulationId = requireUUID(req.params['simulationId'], 'simulationId')
    const svc = storage()

    const metaExists = await svc.blobExists(`data/simulations/${simulationId}/meta.json`)
    if (!metaExists) throw new NotFoundError('Simulace nebyla nalezena')

    const { meta, questionsPath, personsPath } = await loadSimulationMeta(svc, simulationId)

    if (meta.status !== SimulationStatus.COMPLETED) {
      throw new ConflictError(
        `Export je dostupný pouze pro dokončené simulace (aktuální stav: ${meta.status})`
      )
    }

    const [responses, questions, persons] = await Promise.all([
      loadAllResponses(svc, simulationId, ctx),
      svc.readJson<Question[]>(questionsPath),
      svc.readJson<Person[]>(personsPath),
    ])

    // Compute analytics (use cache if available)
    const analyticsPath = `data/simulations/${simulationId}/analytics.json`
    const hasCache = await svc.blobExists(analyticsPath)
    let analytics: AnalyticsResult
    if (hasCache) {
      analytics = await svc.readJson<AnalyticsResult>(analyticsPath)
    } else {
      analytics = computeAnalytics(simulationId, responses, questions, persons)
      await svc.writeJson(analyticsPath, analytics)
    }

    const buffer = generateResultsXlsx({
      simulationMeta: meta,
      responses,
      questions,
      frequencyTables: analytics.frequency_tables,
      descriptiveStats: analytics.descriptive_stats,
      crossTabs: analytics.cross_tabs,
    })

    const filename = `simulation-${simulationId.substring(0, 8)}-results.xlsx`
    ctx.log(`XLSX export generated for simulation ${simulationId}: ${buffer.length} bytes`)

    return {
      status: 200,
      body: buffer,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'no-store',
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── Route registrations ────────────────────────────────────────────────────
app.http('getAnalyticsSummary', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'analytics/{simulationId}/summary',
  handler: getSummary,
})

app.http('getAnalyticsCrosstabs', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'analytics/{simulationId}/crosstabs',
  handler: getCrosstabs,
})

app.http('exportAnalyticsXlsx', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'analytics/{simulationId}/export',
  handler: exportXlsx,
})
