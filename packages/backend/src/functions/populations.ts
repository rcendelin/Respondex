import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions'
import { randomUUID } from 'crypto'
import { BlobStorageService } from '../services/storage.js'
import { parsePopulationXlsx, generatePopulationXlsx } from '@respondex/shared'
import type { Person, PersonMetadata } from '@respondex/shared'
import { NotFoundError, ValidationError, errorResponse, requireUUID, requireUploadSize } from '../lib/errors.js'

interface PopulationMeta {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  person_count: number
}

function storage() {
  return new BlobStorageService()
}

// ── POST /api/populations ──────────────────────────────────────────────────
async function createPopulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const body = await req.json() as { name?: string; description?: string }
    if (!body.name || String(body.name).trim() === '') {
      throw new ValidationError('Pole "name" je povinné')
    }
    const name = String(body.name).trim().substring(0, 200)
    const description = body.description ? String(body.description).trim().substring(0, 500) : undefined
    const id = randomUUID()
    const now = new Date().toISOString()
    const meta: PopulationMeta = {
      id,
      name,
      created_at: now,
      updated_at: now,
      person_count: 0,
      ...(description !== undefined ? { description } : {}),
    }
    const svc = storage()
    await svc.writeJson(`data/populations/${id}/meta.json`, meta)
    await svc.writeJson<Person[]>(`data/populations/${id}/persons.json`, [])
    return { status: 201, jsonBody: meta }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/populations ───────────────────────────────────────────────────
async function listPopulations(_req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const svc = storage()
    const blobs = await svc.listBlobs('data/populations/')
    const metaBlobs = blobs.filter((b) => b.endsWith('/meta.json'))
    const metas = await Promise.all(
      metaBlobs.map((path) => svc.readJson<PopulationMeta>(path).catch(() => null))
    )
    const valid = metas.filter((m): m is PopulationMeta => m !== null)
    valid.sort((a, b) => b.created_at.localeCompare(a.created_at))
    return { status: 200, jsonBody: { populations: valid, total: valid.length } }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/populations/{id} ──────────────────────────────────────────────
async function getPopulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/populations/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError(`Populace "${id}" nebyla nalezena`)
    const meta = await svc.readJson<PopulationMeta>(`data/populations/${id}/meta.json`)
    return { status: 200, jsonBody: meta }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── POST /api/populations/{id}/import ─────────────────────────────────────
async function importPopulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/populations/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError(`Populace "${id}" nebyla nalezena`)

    const arrayBuffer = await req.arrayBuffer()
    requireUploadSize(arrayBuffer.byteLength)

    const buffer = Buffer.from(arrayBuffer)
    const result = parsePopulationXlsx(buffer)
    if (!result.success || !result.data || result.data.length === 0) {
      return {
        status: 422,
        jsonBody: { error: 'XLSX soubor obsahuje chyby', errors: result.errors },
      }
    }

    const meta = await svc.readJson<PopulationMeta>(`data/populations/${id}/meta.json`)
    meta.person_count = result.data.length
    meta.updated_at = new Date().toISOString()

    // Write persons first, then meta — so a crash mid-way leaves meta pointing to old state
    await svc.writeJson<Person[]>(`data/populations/${id}/persons.json`, result.data)
    await svc.writeJson<PopulationMeta>(`data/populations/${id}/meta.json`, meta)
    // Upload original XLSX separately (non-critical)
    svc.uploadBlob(`uploads/populations/${id}/original.xlsx`, buffer).catch((e) =>
      ctx.warn('Failed to upload original XLSX:', String(e))
    )

    return {
      status: 200,
      jsonBody: {
        imported: result.data.length,
        warnings: result.errors.length > 0 ? result.errors : undefined,
        meta,
      },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/populations/{id}/persons ─────────────────────────────────────
async function getPersons(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const exists = await svc.blobExists(`data/populations/${id}/persons.json`)
    if (!exists) throw new NotFoundError(`Populace "${id}" nebyla nalezena`)

    const persons = await svc.readJson<Person[]>(`data/populations/${id}/persons.json`)
    const offset = Math.max(0, parseInt(req.query.get('offset') ?? '0', 10) || 0)
    const limit = Math.min(100, Math.max(1, parseInt(req.query.get('limit') ?? '50', 10) || 50))
    const page = persons.slice(offset, offset + limit)
    return {
      status: 200,
      jsonBody: { persons: page, total: persons.length, offset, limit },
    }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── GET /api/populations/{id}/export ──────────────────────────────────────
async function exportPopulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const exists = await svc.blobExists(`data/populations/${id}/meta.json`)
    if (!exists) throw new NotFoundError(`Populace "${id}" nebyla nalezena`)

    const [persons, meta] = await Promise.all([
      svc.readJson<Person[]>(`data/populations/${id}/persons.json`),
      svc.readJson<PopulationMeta>(`data/populations/${id}/meta.json`),
    ])

    const personMeta: Partial<PersonMetadata> = {
      name: meta.name,
      ...(meta.description !== undefined ? { description: meta.description } : {}),
    }
    const buffer = generatePopulationXlsx(persons, personMeta)
    const filename = `populace-${id.substring(0, 8)}.xlsx`

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

// ── DELETE /api/populations/{id} ──────────────────────────────────────────
async function deletePopulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const exists = await svc.blobExists(`data/populations/${id}/meta.json`)
    if (!exists) throw new NotFoundError(`Populace "${id}" nebyla nalezena`)
    await svc.deletePrefix(`data/populations/${id}/`)
    svc.deletePrefix(`uploads/populations/${id}/`).catch((e) =>
      ctx.warn('Failed to delete uploads:', String(e))
    )
    return { status: 204 }
  } catch (err) {
    return errorResponse(err, ctx)
  }
}

// ── Register routes ────────────────────────────────────────────────────────
app.http('populations-create', {
  methods: ['POST'],
  route: 'populations',
  authLevel: 'anonymous',
  handler: createPopulation,
})

app.http('populations-list', {
  methods: ['GET'],
  route: 'populations',
  authLevel: 'anonymous',
  handler: listPopulations,
})

app.http('populations-get', {
  methods: ['GET'],
  route: 'populations/{id}',
  authLevel: 'anonymous',
  handler: getPopulation,
})

app.http('populations-import', {
  methods: ['POST'],
  route: 'populations/{id}/import',
  authLevel: 'anonymous',
  handler: importPopulation,
})

app.http('populations-persons', {
  methods: ['GET'],
  route: 'populations/{id}/persons',
  authLevel: 'anonymous',
  handler: getPersons,
})

app.http('populations-export', {
  methods: ['GET'],
  route: 'populations/{id}/export',
  authLevel: 'anonymous',
  handler: exportPopulation,
})

app.http('populations-delete', {
  methods: ['DELETE'],
  route: 'populations/{id}',
  authLevel: 'anonymous',
  handler: deletePopulation,
})
