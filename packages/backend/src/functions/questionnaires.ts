import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { BlobStorageService } from '../services/storage.js'
import { parseQuestionnaireXlsx, QuestionSchema } from '@respondex/shared'
import { NotFoundError, ValidationError, errorResponse, requireUUID, requireUploadSize } from '../lib/errors.js'

function storage() {
  return new BlobStorageService()
}

// ── POST /api/questionnaires ───────────────────────────────────────────────
async function createQuestionnaire(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await req.json() as { name?: string; description?: string }
    if (!body.name || String(body.name).trim() === '') {
      throw new ValidationError('Pole "name" je povinné')
    }
    const name = String(body.name).trim().substring(0, 200)
    const description = body.description ? String(body.description).trim().substring(0, 500) : undefined
    const id = randomUUID()
    const now = new Date().toISOString()
    const meta = {
      id,
      name,
      created_at: now,
      updated_at: now,
      question_count: 0,
      ...(description !== undefined ? { description } : {}),
    }
    const svc = storage()
    await svc.writeJson(`data/questionnaires/${id}/meta.json`, meta)
    await svc.writeJson(`data/questionnaires/${id}/questions.json`, [])
    return { status: 201, jsonBody: meta }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── POST /api/questionnaires/{id}/import ──────────────────────────────────
async function importQuestionnaire(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/questionnaires/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError(`Dotazník "${id}" nebyl nalezen`)

    const arrayBuffer = await req.arrayBuffer()
    requireUploadSize(arrayBuffer.byteLength)

    const buffer = Buffer.from(arrayBuffer)
    const result = parseQuestionnaireXlsx(buffer, id)
    if (!result.success || !result.data) {
      return {
        status: 422,
        jsonBody: { error: 'XLSX soubor obsahuje chyby', errors: result.errors },
      }
    }

    const meta = await svc.readJson<Record<string, unknown>>(`data/questionnaires/${id}/meta.json`)
    meta['question_count'] = result.data.questions.length
    meta['updated_at'] = new Date().toISOString()
    if (result.data.metadata.title !== 'Dotazník bez názvu') {
      meta['title'] = result.data.metadata.title
    }
    if (result.data.metadata.language) {
      meta['language'] = result.data.metadata.language
    }

    // Write questions first, then meta (safer ordering)
    await svc.writeJson(`data/questionnaires/${id}/questions.json`, result.data.questions)
    await svc.writeJson(`data/questionnaires/${id}/meta.json`, meta)
    svc.uploadBlob(`uploads/questionnaires/${id}/original.xlsx`, buffer).catch((e) =>
      ctx.warn('Failed to upload original XLSX:', String(e))
    )

    return {
      status: 200,
      jsonBody: {
        imported: result.data.questions.length,
        warnings: result.errors.length > 0 ? result.errors : undefined,
        meta,
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/questionnaires ────────────────────────────────────────────────
async function listQuestionnaires(_req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const svc = storage()
    const blobs = await svc.listBlobs('data/questionnaires/')
    const metaBlobs = blobs.filter((b) => b.endsWith('/meta.json'))
    const metas = await Promise.all(
      metaBlobs.map((path) => svc.readJson<Record<string, unknown>>(path).catch(() => null))
    )
    const valid = metas.filter((m): m is Record<string, unknown> => m !== null)
    valid.sort((a, b) =>
      String(b['created_at'] ?? '').localeCompare(String(a['created_at'] ?? ''))
    )
    return { status: 200, jsonBody: { questionnaires: valid, total: valid.length } }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/questionnaires/{id} ───────────────────────────────────────────
async function getQuestionnaire(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const exists = await svc.blobExists(`data/questionnaires/${id}/meta.json`)
    if (!exists) throw new NotFoundError(`Dotazník "${id}" nebyl nalezen`)
    const [meta, questions] = await Promise.all([
      svc.readJson<Record<string, unknown>>(`data/questionnaires/${id}/meta.json`),
      svc.readJson<unknown[]>(`data/questionnaires/${id}/questions.json`),
    ])
    return { status: 200, jsonBody: { ...meta, questions } }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/questionnaires/{id}/export ───────────────────────────────────
async function exportQuestionnaire(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const exists = await svc.blobExists(`uploads/questionnaires/${id}/original.xlsx`)
    if (!exists) throw new NotFoundError('XLSX export není k dispozici — nejprve importujte dotazník')
    const buffer = await svc.downloadBlob(`uploads/questionnaires/${id}/original.xlsx`)
    const filename = `dotaznik-${id.substring(0, 8)}.xlsx`
    return {
      status: 200,
      body: buffer,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── DELETE /api/questionnaires/{id} ───────────────────────────────────────
async function deleteQuestionnaire(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const exists = await svc.blobExists(`data/questionnaires/${id}/meta.json`)
    if (!exists) throw new NotFoundError(`Dotazník "${id}" nebyl nalezen`)
    await svc.deletePrefix(`data/questionnaires/${id}/`)
    svc.deletePrefix(`uploads/questionnaires/${id}/`).catch((e) =>
      ctx.warn('Failed to delete uploads:', String(e))
    )
    return { status: 204 }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── PUT /api/questionnaires/{id}/questions ────────────────────────────────
async function saveQuestionsJson(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const exists = await svc.blobExists(`data/questionnaires/${id}/meta.json`)
    if (!exists) throw new NotFoundError(`Dotazník "${id}" nebyl nalezen`)

    const body = await req.json() as unknown
    const result = z.array(QuestionSchema).max(500, 'Dotazník může mít nejvýše 500 otázek').safeParse(body)
    if (!result.success) {
      return {
        status: 422,
        jsonBody: { error: 'Neplatné otázky', errors: result.error.issues },
      }
    }

    await svc.writeJson(`data/questionnaires/${id}/questions.json`, result.data)
    const meta = await svc.readJson<Record<string, unknown>>(`data/questionnaires/${id}/meta.json`)
    meta['question_count'] = result.data.length
    meta['updated_at'] = new Date().toISOString()
    await svc.writeJson(`data/questionnaires/${id}/meta.json`, meta)

    return { status: 200, jsonBody: { saved: result.data.length, meta } }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── Register routes ────────────────────────────────────────────────────────
app.http('questionnaires-create', {
  methods: ['POST'],
  route: 'questionnaires',
  authLevel: 'anonymous',
  handler: createQuestionnaire,
})

app.http('questionnaires-list', {
  methods: ['GET'],
  route: 'questionnaires',
  authLevel: 'anonymous',
  handler: listQuestionnaires,
})

app.http('questionnaires-get', {
  methods: ['GET'],
  route: 'questionnaires/{id}',
  authLevel: 'anonymous',
  handler: getQuestionnaire,
})

app.http('questionnaires-import', {
  methods: ['POST'],
  route: 'questionnaires/{id}/import',
  authLevel: 'anonymous',
  handler: importQuestionnaire,
})

app.http('questionnaires-export', {
  methods: ['GET'],
  route: 'questionnaires/{id}/export',
  authLevel: 'anonymous',
  handler: exportQuestionnaire,
})

app.http('questionnaires-delete', {
  methods: ['DELETE'],
  route: 'questionnaires/{id}',
  authLevel: 'anonymous',
  handler: deleteQuestionnaire,
})

app.http('questionnaires-save-questions', {
  methods: ['PUT'],
  route: 'questionnaires/{id}/questions',
  authLevel: 'anonymous',
  handler: saveQuestionsJson,
})
