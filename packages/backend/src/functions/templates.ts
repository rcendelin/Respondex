import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { readFileSync } from 'fs'
import { join } from 'path'
import { BlobStorageService } from '../services/storage.js'
import { errorResponse } from '../lib/errors.js'

/**
 * Try to serve template from Blob Storage first (uploaded copy),
 * fallback to local file system (for local development with func start).
 */
async function serveTemplate(
  blobPath: string,
  localRelativePath: string,
  filename: string
): Promise<HttpResponseInit> {
  let buffer: Buffer | null = null

  // Try Blob Storage first (production)
  if (process.env['AZURE_STORAGE_CONNECTION_STRING']) {
    try {
      const svc = new BlobStorageService()
      buffer = await svc.downloadBlob(blobPath)
    } catch {
      // fall through to local file
    }
  }

  // Fallback: local filesystem (development)
  if (!buffer) {
    try {
      const localPath = join(__dirname, '..', '..', '..', '..', localRelativePath)
      buffer = readFileSync(localPath)
    } catch {
      return { status: 404, jsonBody: { error: `Šablona "${filename}" nebyla nalezena` } }
    }
  }

  return {
    status: 200,
    body: buffer,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    },
  }
}

// ── GET /api/templates/population ─────────────────────────────────────────
async function getPopulationTemplate(_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    return await serveTemplate(
      'data/templates/sample-population.xlsx',
      'templates/sample-population.xlsx',
      'vzorova-populace.xlsx'
    )
  } catch (err) {
    return errorResponse(err)
  }
}

// ── GET /api/templates/questionnaire ──────────────────────────────────────
async function getQuestionnaireTemplate(_req: HttpRequest, _ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    return await serveTemplate(
      'data/templates/sample-questionnaire.xlsx',
      'templates/sample-questionnaire.xlsx',
      'vzorovy-dotaznik.xlsx'
    )
  } catch (err) {
    return errorResponse(err)
  }
}

// ── Register routes ────────────────────────────────────────────────────────
app.http('templates-population', {
  methods: ['GET'],
  route: 'templates/population',
  authLevel: 'anonymous',
  handler: getPopulationTemplate,
})

app.http('templates-questionnaire', {
  methods: ['GET'],
  route: 'templates/questionnaire',
  authLevel: 'anonymous',
  handler: getQuestionnaireTemplate,
})
