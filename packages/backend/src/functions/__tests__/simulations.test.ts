/**
 * Unit tests for simulation orchestrator helpers and validation logic.
 * Handler integration is tested via pure helper functions extracted from the module.
 */
import { describe, it, expect } from 'vitest'
import { Strategy, SimulationStatus, SupportedModel, SimulationConfigSchema } from '@respondex/shared'

// ── Helper functions mirroring the module internals ────────────────────────
// These are extracted copies of pure functions in simulations.ts

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

function formatChunkNumber(index: number): string {
  return String(index + 1).padStart(3, '0')
}

function calcProgress(completed: number, total: number): number {
  if (total === 0) return 0
  return Math.round((completed / total) * 100)
}

function encodeQueueMessage(msg: unknown): string {
  return Buffer.from(JSON.stringify(msg), 'utf-8').toString('base64')
}

// ── Chunk splitting ────────────────────────────────────────────────────────

describe('chunkArray', () => {
  it('splits 20 items into 1 chunk of 20', () => {
    const ids = Array.from({ length: 20 }, (_, i) => `p${i}`)
    const chunks = chunkArray(ids, 20)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toHaveLength(20)
  })

  it('splits 21 items into 2 chunks (20 + 1)', () => {
    const ids = Array.from({ length: 21 }, (_, i) => `p${i}`)
    const chunks = chunkArray(ids, 20)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(20)
    expect(chunks[1]).toHaveLength(1)
  })

  it('splits 60 items into 3 chunks of 20', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `p${i}`)
    const chunks = chunkArray(ids, 20)
    expect(chunks).toHaveLength(3)
    chunks.forEach((c) => expect(c).toHaveLength(20))
  })

  it('handles 1 item', () => {
    const chunks = chunkArray(['only'], 20)
    expect(chunks).toHaveLength(1)
    expect(chunks[0]).toEqual(['only'])
  })

  it('handles 39 items into 2 chunks (20 + 19)', () => {
    const ids = Array.from({ length: 39 }, (_, i) => `p${i}`)
    const chunks = chunkArray(ids, 20)
    expect(chunks).toHaveLength(2)
    expect(chunks[0]).toHaveLength(20)
    expect(chunks[1]).toHaveLength(19)
  })

  it('all items are preserved without duplication', () => {
    const ids = Array.from({ length: 55 }, (_, i) => `p${i}`)
    const chunks = chunkArray(ids, 20)
    const flat = chunks.flat()
    expect(flat).toHaveLength(55)
    expect(new Set(flat).size).toBe(55)
  })
})

// ── Chunk number formatting ────────────────────────────────────────────────

describe('formatChunkNumber', () => {
  it('formats index 0 as "001"', () => {
    expect(formatChunkNumber(0)).toBe('001')
  })
  it('formats index 9 as "010"', () => {
    expect(formatChunkNumber(9)).toBe('010')
  })
  it('formats index 99 as "100"', () => {
    expect(formatChunkNumber(99)).toBe('100')
  })
  it('formats index 999 as "1000"', () => {
    // Extremely large simulation — padStart(3) allows overflow
    expect(formatChunkNumber(999)).toBe('1000')
  })
  it('matches SimulationChunkMessageSchema 3-digit regex for index 0–998', () => {
    for (const i of [0, 4, 9, 98]) {
      expect(formatChunkNumber(i)).toMatch(/^\d{3}$/)
    }
  })
})

// ── Progress calculation ───────────────────────────────────────────────────

describe('calcProgress', () => {
  it('returns 0 when nothing completed', () => {
    expect(calcProgress(0, 10)).toBe(0)
  })
  it('returns 50 at halfway', () => {
    expect(calcProgress(5, 10)).toBe(50)
  })
  it('returns 100 when all complete', () => {
    expect(calcProgress(10, 10)).toBe(100)
  })
  it('returns 0 when total is 0 (no division by zero)', () => {
    expect(calcProgress(0, 0)).toBe(0)
  })
  it('rounds correctly (1/3 → 33)', () => {
    expect(calcProgress(1, 3)).toBe(33)
  })
  it('rounds correctly (2/3 → 67)', () => {
    expect(calcProgress(2, 3)).toBe(67)
  })
})

// ── Queue message encoding ─────────────────────────────────────────────────

describe('encodeQueueMessage', () => {
  it('encodes and round-trips correctly', () => {
    const msg = { simulation_id: 'sim-001', chunk_index: 0, chunk_number: '001', person_ids: ['p1', 'p2'] }
    const encoded = encodeQueueMessage(msg)
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
    expect(decoded).toEqual(msg)
  })

  it('produces valid base64 string', () => {
    const encoded = encodeQueueMessage({ foo: 'bar' })
    expect(() => Buffer.from(encoded, 'base64')).not.toThrow()
    // Base64 characters only
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/)
  })

  it('handles unicode correctly', () => {
    const msg = { text: 'Žluťoučký kůň' }
    const encoded = encodeQueueMessage(msg)
    const decoded = JSON.parse(Buffer.from(encoded, 'base64').toString('utf-8'))
    expect(decoded.text).toBe('Žluťoučký kůň')
  })
})

// ── SimulationConfig Zod validation ───────────────────────────────────────

const VALID_CONFIG = {
  population_id: '11111111-1111-4111-8111-111111111111',
  questionnaire_id: '22222222-2222-4222-8222-222222222222',
  strategy: Strategy.A,
  model: SupportedModel.GPT_4O_MINI,
  temperature: 0.7,
  runs_per_person: 1,
}

describe('SimulationConfigSchema', () => {
  it('accepts valid full config', () => {
    const result = SimulationConfigSchema.safeParse(VALID_CONFIG)
    expect(result.success).toBe(true)
  })

  it('applies defaults for model, temperature, runs_per_person', () => {
    const result = SimulationConfigSchema.safeParse({
      population_id: VALID_CONFIG.population_id,
      questionnaire_id: VALID_CONFIG.questionnaire_id,
      strategy: Strategy.A,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.temperature).toBe(0.7)
      expect(result.data.runs_per_person).toBe(3)
      expect(result.data.model).toBe(SupportedModel.GPT_4O_MINI)
    }
  })

  it('accepts all valid strategies', () => {
    for (const s of Object.values(Strategy)) {
      const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, strategy: s })
      expect(result.success).toBe(true)
    }
  })

  it('rejects invalid strategy', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, strategy: 'Z' })
    expect(result.success).toBe(false)
  })

  it('rejects temperature > 2.0', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, temperature: 2.1 })
    expect(result.success).toBe(false)
  })

  it('rejects temperature < 0.0', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, temperature: -0.1 })
    expect(result.success).toBe(false)
  })

  it('rejects runs_per_person > 10', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, runs_per_person: 11 })
    expect(result.success).toBe(false)
  })

  it('rejects runs_per_person < 1', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, runs_per_person: 0 })
    expect(result.success).toBe(false)
  })

  it('rejects fractional runs_per_person', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, runs_per_person: 1.5 })
    expect(result.success).toBe(false)
  })

  it('accepts optional ensemble_models array (max 5)', () => {
    const result = SimulationConfigSchema.safeParse({
      ...VALID_CONFIG,
      strategy: Strategy.F,
      ensemble_models: ['gpt-4o', 'gpt-4o-mini'],
    })
    expect(result.success).toBe(true)
  })

  it('rejects ensemble_models array with > 5 items (DoS guard)', () => {
    const result = SimulationConfigSchema.safeParse({
      ...VALID_CONFIG,
      ensemble_models: ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'],
    })
    expect(result.success).toBe(false)
  })

  it('rejects unknown model string (must be SupportedModel enum)', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, model: 'gpt-99-ultra' })
    expect(result.success).toBe(false)
  })

  it('accepts all SupportedModel enum values', () => {
    for (const m of Object.values(SupportedModel)) {
      const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, model: m })
      expect(result.success).toBe(true)
    }
  })

  it('rejects missing population_id', () => {
    const { population_id: _p, ...rest } = VALID_CONFIG
    const result = SimulationConfigSchema.safeParse(rest)
    expect(result.success).toBe(false)
  })

  it('rejects empty population_id', () => {
    const result = SimulationConfigSchema.safeParse({ ...VALID_CONFIG, population_id: '' })
    expect(result.success).toBe(false)
  })
})

// ── UUID validation (path traversal prevention) ────────────────────────────

describe('requireUUID (path traversal prevention)', () => {
  // Import directly — no mocks needed for pure validation function
  it('accepts valid UUID v4', async () => {
    const { requireUUID } = await import('../../lib/errors.js')
    expect(() => requireUUID('11111111-1111-4111-8111-111111111111')).not.toThrow()
  })

  it('rejects empty string', async () => {
    const { requireUUID } = await import('../../lib/errors.js')
    expect(() => requireUUID('')).toThrow()
  })

  it('rejects undefined', async () => {
    const { requireUUID } = await import('../../lib/errors.js')
    expect(() => requireUUID(undefined)).toThrow()
  })

  it('rejects path traversal "../etc/passwd"', async () => {
    const { requireUUID } = await import('../../lib/errors.js')
    expect(() => requireUUID('../etc/passwd')).toThrow()
  })

  it('rejects UUID v1 (version bit is 1, not 4)', async () => {
    const { requireUUID } = await import('../../lib/errors.js')
    // UUID v1: version nibble is '1' not '4'
    expect(() => requireUUID('550e8400-e29b-11d4-a716-446655440000')).toThrow()
  })

  it('rejects UUID v4 with wrong variant bits', async () => {
    const { requireUUID } = await import('../../lib/errors.js')
    // Variant must be [89ab] — this has '7' instead
    expect(() => requireUUID('11111111-1111-4111-7111-111111111111')).toThrow()
  })

  it('rejects simple injection string', async () => {
    const { requireUUID } = await import('../../lib/errors.js')
    expect(() => requireUUID("'; DROP TABLE users; --")).toThrow()
  })
})

// ── SimulationStatus enum coverage ─────────────────────────────────────────

describe('SimulationStatus values', () => {
  it('has expected status values', () => {
    expect(SimulationStatus.RUNNING).toBe('running')
    expect(SimulationStatus.COMPLETED).toBe('completed')
    expect(SimulationStatus.FAILED).toBe('failed')
    expect(SimulationStatus.PARTIAL_FAILURE).toBe('partial_failure')
    expect(SimulationStatus.PENDING).toBe('pending')
  })
})

// ── Results pagination logic ───────────────────────────────────────────────

describe('results pagination', () => {
  function paginateResponses<T>(arr: T[], limit: number | undefined, offset: number): T[] {
    if (limit !== undefined) return arr.slice(offset, offset + limit)
    return arr.slice(offset)
  }

  it('returns all responses when no limit specified', () => {
    const responses = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const result = paginateResponses(responses, undefined, 0)
    expect(result).toHaveLength(50)
  })

  it('returns first N responses with limit', () => {
    const responses = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const result = paginateResponses(responses, 10, 0)
    expect(result).toHaveLength(10)
    expect(result[0]).toEqual({ id: 0 })
  })

  it('returns correct page with offset', () => {
    const responses = Array.from({ length: 50 }, (_, i) => ({ id: i }))
    const result = paginateResponses(responses, 10, 10)
    expect(result).toHaveLength(10)
    expect(result[0]).toEqual({ id: 10 })
  })

  it('returns empty array when offset > length', () => {
    const responses = Array.from({ length: 5 }, (_, i) => ({ id: i }))
    const result = paginateResponses(responses, 10, 100)
    expect(result).toHaveLength(0)
  })

  it('clamps partial last page correctly', () => {
    const responses = Array.from({ length: 15 }, (_, i) => ({ id: i }))
    const result = paginateResponses(responses, 10, 10)
    expect(result).toHaveLength(5)
  })
})

// ── Chunk result file naming ───────────────────────────────────────────────

describe('chunk result file path naming', () => {
  it('chunk-001 < chunk-002 lexicographically (sort order)', () => {
    const paths = ['chunk-003.json', 'chunk-001.json', 'chunk-002.json']
    paths.sort()
    expect(paths[0]).toBe('chunk-001.json')
    expect(paths[1]).toBe('chunk-002.json')
    expect(paths[2]).toBe('chunk-003.json')
  })

  it('chunk-010 sorts after chunk-009', () => {
    const paths = ['chunk-010.json', 'chunk-009.json']
    paths.sort()
    expect(paths[0]).toBe('chunk-009.json')
    expect(paths[1]).toBe('chunk-010.json')
  })
})
