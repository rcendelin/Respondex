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

// ── Statistical person generator ──────────────────────────────────────────
// Czech demographic distributions based on ČSÚ 2021 data. No AI involved.

const REGIONS: string[] = [
  'Praha', 'Středočeský', 'Jihočeský', 'Plzeňský', 'Karlovarský',
  'Ústecký', 'Liberecký', 'Královéhradecký', 'Pardubický', 'Kraj Vysočina',
  'Jihomoravský', 'Olomoucký', 'Zlínský', 'Moravskoslezský',
]

function weightedPick<T>(items: [T, ...T[]], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < items.length; i++) {
    r -= weights[i] ?? 0
    if (r <= 0) return items[i] as T
  }
  return items[items.length - 1] as T
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

interface GenerateOptions {
  count: number
  male_pct: number
  age_min: number
  age_max: number
  region?: string
}

function generatePersons(opts: GenerateOptions): Person[] {
  const { count, male_pct, age_min, age_max, region } = opts
  const persons: Person[] = []

  const incomeWeights: Record<string, number[]> = {
    'Základní':       [0.40, 0.35, 0.18, 0.05, 0.02],
    'Vyučení':        [0.20, 0.35, 0.30, 0.12, 0.03],
    'S maturitou':    [0.10, 0.25, 0.38, 0.20, 0.07],
    'Vyšší odborné':  [0.06, 0.18, 0.38, 0.26, 0.12],
    'Vysokoškolské':  [0.03, 0.10, 0.30, 0.32, 0.25],
  }

  for (let i = 0; i < count; i++) {
    const gender = Math.random() * 100 < male_pct ? 'Muž' : 'Žena'
    const age = randInt(age_min, age_max)

    const education = weightedPick(
      ['Základní', 'Vyučení', 'S maturitou', 'Vyšší odborné', 'Vysokoškolské'],
      [0.10, 0.35, 0.32, 0.07, 0.16]
    )

    let employment: string
    if (age <= 26) {
      employment = weightedPick(
        ['Student/ka', 'Zaměstnaný/á', 'Nezaměstnaný/á'],
        [0.55, 0.35, 0.10]
      )
    } else if (age <= 60) {
      employment = weightedPick(
        ['Zaměstnaný/á', 'Podnikatel/ka (OSVČ)', 'Nezaměstnaný/á', 'Mateřská/rodičovská dovolená', 'Jiné'],
        [0.68, 0.15, 0.07, 0.07, 0.03]
      )
    } else {
      employment = weightedPick(
        ['Důchodce/kyně', 'Zaměstnaný/á', 'Jiné'],
        [0.80, 0.15, 0.05]
      )
    }

    const income = weightedPick(
      ['Nízký', 'Spíše nižší', 'Střední', 'Spíše vyšší', 'Vysoký'],
      incomeWeights[education] ?? [0.20, 0.25, 0.30, 0.15, 0.10]
    )

    let marital: string
    if (age <= 25) {
      marital = weightedPick(['Svobodný/á', 'Ženatý/Vdaná', 'Rozvedený/á'], [0.88, 0.10, 0.02])
    } else if (age <= 40) {
      marital = weightedPick(['Svobodný/á', 'Ženatý/Vdaná', 'Rozvedený/á', 'Registrované partnerství'], [0.32, 0.52, 0.14, 0.02])
    } else if (age <= 60) {
      marital = weightedPick(['Svobodný/á', 'Ženatý/Vdaná', 'Rozvedený/á', 'Ovdovělý/á'], [0.15, 0.58, 0.22, 0.05])
    } else {
      marital = weightedPick(['Svobodný/á', 'Ženatý/Vdaná', 'Rozvedený/á', 'Ovdovělý/á'], [0.10, 0.50, 0.18, 0.22])
    }

    const has_partner = marital === 'Ženatý/Vdaná' || marital === 'Registrované partnerství'
      ? true
      : marital === 'Svobodný/á'
        ? Math.random() < 0.45
        : Math.random() < 0.30

    const fallbackRegion = REGIONS[randInt(0, REGIONS.length - 1)] ?? 'Praha'
    const personRegion: string = region
      ? (Math.random() < 0.70 ? region : (REGIONS[randInt(0, REGIONS.length - 1)] ?? 'Praha'))
      : fallbackRegion

    // Use explicit type cast via unknown to satisfy exactOptionalPropertyTypes
    // All string values are valid enum literals from @respondex/shared
    const demographics = {
      education,
      marital_status: marital,
      has_partner,
      employment_status: employment,
      income_level: income,
      region: personRegion,
    } as unknown as NonNullable<Person['demographics']>

    const p: Person = {
      id: randomUUID(),
      age,
      gender: gender as Person['gender'],
      demographics,
    }
    persons.push(p)
  }

  return persons
}

// ── POST /api/populations/{id}/generate ───────────────────────────────────
async function generatePopulation(req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> {
  try {
    const id = requireUUID(req.params['id'])
    const svc = storage()
    const metaExists = await svc.blobExists(`data/populations/${id}/meta.json`)
    if (!metaExists) throw new NotFoundError(`Populace "${id}" nebyla nalezena`)

    const body = await req.json() as {
      count?: unknown
      male_pct?: unknown
      age_min?: unknown
      age_max?: unknown
      region?: unknown
    }

    const count = Number(body.count)
    const male_pct = Number(body.male_pct ?? 49)
    const age_min = Number(body.age_min ?? 18)
    const age_max = Number(body.age_max ?? 80)
    const region = typeof body.region === 'string' && body.region.trim() !== '' ? body.region.trim() : undefined

    if (!Number.isInteger(count) || count < 10 || count > 500) {
      throw new ValidationError('count musí být celé číslo 10–500')
    }
    if (!Number.isFinite(male_pct) || male_pct < 0 || male_pct > 100) {
      throw new ValidationError('male_pct musí být 0–100')
    }
    if (!Number.isInteger(age_min) || age_min < 18 || age_min > 99) {
      throw new ValidationError('age_min musí být 18–99')
    }
    if (!Number.isInteger(age_max) || age_max < 19 || age_max > 100) {
      throw new ValidationError('age_max musí být 19–100')
    }
    if (age_min >= age_max) {
      throw new ValidationError('age_min musí být menší než age_max')
    }

    const genOpts: GenerateOptions = { count, male_pct, age_min, age_max }
    if (region !== undefined) genOpts.region = region
    const newPersons = generatePersons(genOpts)
    const existing = await svc.readJson<Person[]>(`data/populations/${id}/persons.json`)
    const merged = [...existing, ...newPersons]
    const meta = await svc.readJson<PopulationMeta>(`data/populations/${id}/meta.json`)
    meta.person_count = merged.length
    meta.updated_at = new Date().toISOString()

    await svc.writeJson<Person[]>(`data/populations/${id}/persons.json`, merged)
    await svc.writeJson<PopulationMeta>(`data/populations/${id}/meta.json`, meta)

    ctx.log(`Generated ${newPersons.length} persons for population ${id}, total: ${merged.length}`)
    return { status: 200, jsonBody: { generated: newPersons.length, meta } }
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

app.http('populations-generate', {
  methods: ['POST'],
  route: 'populations/{id}/generate',
  authLevel: 'anonymous',
  handler: generatePopulation,
})
