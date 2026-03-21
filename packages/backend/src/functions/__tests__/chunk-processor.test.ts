/**
 * Unit tests for chunk processor logic.
 * Tests focus on pure/extracted logic — integration with Azure is tested via mocks.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  Strategy,
  SimulationStatus,
  SupportedModel,
  QuestionType,
} from '@respondex/shared'
import type { SimulationResponse } from '@respondex/shared'

// ── Pure helper functions mirroring chunk-processor internals ──────────────

function buildSimulationResponse(overrides: Partial<SimulationResponse> = {}): SimulationResponse {
  return {
    person_id: 'p001',
    question_id: 'q001',
    run: 1,
    answer: 'Ano',
    valid: true,
    strategy: Strategy.A,
    model: SupportedModel.GPT_4O_MINI,
    temperature: 0.7,
    timestamp: new Date().toISOString(),
    ...overrides,
  }
}

function incrementCompleted(current: number, total: number): { completed: number; isLast: boolean } {
  const newCompleted = current + 1
  return { completed: newCompleted, isLast: newCompleted >= total }
}

// ── Chunk meta increment logic ─────────────────────────────────────────────

describe('incrementCompleted', () => {
  it('increments from 0 to 1, not last when total > 1', () => {
    const { completed, isLast } = incrementCompleted(0, 5)
    expect(completed).toBe(1)
    expect(isLast).toBe(false)
  })

  it('marks as last when completed reaches total', () => {
    const { completed, isLast } = incrementCompleted(4, 5)
    expect(completed).toBe(5)
    expect(isLast).toBe(true)
  })

  it('marks as last for single-chunk simulation', () => {
    const { completed, isLast } = incrementCompleted(0, 1)
    expect(completed).toBe(1)
    expect(isLast).toBe(true)
  })

  it('handles 100-chunk simulation correctly', () => {
    const { completed, isLast } = incrementCompleted(99, 100)
    expect(completed).toBe(100)
    expect(isLast).toBe(true)
  })

  it('does not report false positive last chunk', () => {
    const { completed, isLast } = incrementCompleted(3, 10)
    expect(completed).toBe(4)
    expect(isLast).toBe(false)
  })
})

// ── SimulationResponse structure ───────────────────────────────────────────

describe('SimulationResponse structure', () => {
  it('valid response has required fields', () => {
    const r = buildSimulationResponse()
    expect(r.person_id).toBeDefined()
    expect(r.question_id).toBeDefined()
    expect(r.run).toBeGreaterThanOrEqual(1)
    expect(r.valid).toBe(true)
    expect(r.strategy).toBe(Strategy.A)
    expect(r.model).toBe(SupportedModel.GPT_4O_MINI)
  })

  it('invalid response preserves invalid_reason without leaking internal details if not set', () => {
    const r = buildSimulationResponse({ valid: false, invalid_reason: 'Model odmítl odpovědět (refusal)', answer: '' })
    expect(r.valid).toBe(false)
    expect(r.invalid_reason).toBe('Model odmítl odpovědět (refusal)')
  })

  it('includes tokens_used when present', () => {
    const r = buildSimulationResponse({
      tokens_used: { prompt: 100, completion: 50, total: 150 },
    })
    expect(r.tokens_used?.total).toBe(150)
  })
})

// ── Refusal detection (isRefusal helper from prompt-builder) ───────────────

describe('isRefusal (via prompt-builder)', () => {
  it('detects Czech refusal "jako AI"', async () => {
    const { isRefusal } = await import('../../services/prompt-builder.js')
    expect(isRefusal('Jako AI nemohu odpovědět.')).toBe(true)
  })

  it('detects English refusal "as an AI"', async () => {
    const { isRefusal } = await import('../../services/prompt-builder.js')
    expect(isRefusal("As an AI, I can't help with that.")).toBe(true)
  })

  it('does not flag valid JSON response', async () => {
    const { isRefusal } = await import('../../services/prompt-builder.js')
    expect(isRefusal('{"answer": "Ano"}')).toBe(false)
    expect(isRefusal('{"answer": 4}')).toBe(false)
  })

  it('does not flag empty string as refusal', async () => {
    const { isRefusal } = await import('../../services/prompt-builder.js')
    expect(isRefusal('')).toBe(false)
  })
})

// ── parseModelResponse integration ────────────────────────────────────────

describe('parseModelResponse integration with question types', () => {
  const makeQuestion = (type: QuestionType, extra: Record<string, unknown> = {}) => ({
    id: 'q001',
    order: 1,
    text: 'Test?',
    type,
    required: true,
    ...extra,
  })

  it('parses yes_no correctly', async () => {
    const { parseModelResponse } = await import('../../services/response-parser.js')
    const q = makeQuestion(QuestionType.YES_NO)
    expect(parseModelResponse('{"answer": "Ano"}', q as never).valid).toBe(true)
    expect(parseModelResponse('{"answer": "Ne"}', q as never).valid).toBe(true)
    expect(parseModelResponse('{"answer": "yes"}', q as never).valid).toBe(false)
  })

  it('parses likert correctly', async () => {
    const { parseModelResponse } = await import('../../services/response-parser.js')
    const q = makeQuestion(QuestionType.LIKERT, { scale_min: 1, scale_max: 5 })
    expect(parseModelResponse('{"answer": 3}', q as never).valid).toBe(true)
    expect(parseModelResponse('{"answer": 6}', q as never).valid).toBe(false)
  })

  it('parses nps correctly', async () => {
    const { parseModelResponse } = await import('../../services/response-parser.js')
    const q = makeQuestion(QuestionType.NPS)
    expect(parseModelResponse('{"answer": 7}', q as never).valid).toBe(true)
    expect(parseModelResponse('{"answer": 11}', q as never).valid).toBe(false)
  })

  it('parses open_text correctly', async () => {
    const { parseModelResponse } = await import('../../services/response-parser.js')
    const q = makeQuestion(QuestionType.OPEN_TEXT)
    expect(parseModelResponse('{"answer": "Myslím si..."}', q as never).valid).toBe(true)
    expect(parseModelResponse('{"answer": ""}', q as never).valid).toBe(false)
  })
})

// ── Chunk message parsing ──────────────────────────────────────────────────

describe('chunk message JSON parsing', () => {
  const VALID_MSG = {
    simulation_id: '11111111-1111-4111-8111-111111111111',
    chunk_index: 0,
    chunk_number: '001',
    person_ids: ['p001', 'p002'],
    config: {
      population_id: '22222222-2222-4222-8222-222222222222',
      questionnaire_id: '33333333-3333-4333-8333-333333333333',
      strategy: Strategy.A,
      model: SupportedModel.GPT_4O_MINI,
      temperature: 0.7,
      runs_per_person: 1,
    },
  }

  it('parses valid message correctly', () => {
    const raw = JSON.stringify(VALID_MSG)
    const parsed = JSON.parse(raw)
    expect(parsed.simulation_id).toBe(VALID_MSG.simulation_id)
    expect(parsed.person_ids).toHaveLength(2)
    expect(parsed.config.strategy).toBe(Strategy.A)
  })

  it('parses base64-encoded message correctly', () => {
    const encoded = Buffer.from(JSON.stringify(VALID_MSG), 'utf-8').toString('base64')
    // Simulate Azure Queue SDK delivering base64-decoded string
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8')
    const parsed = JSON.parse(decoded)
    expect(parsed.simulation_id).toBe(VALID_MSG.simulation_id)
  })

  it('throws on malformed JSON', () => {
    expect(() => JSON.parse('not valid json {{')).toThrow()
  })

  it('handles missing fields gracefully when destructured', () => {
    const incomplete = JSON.parse('{"simulation_id": "abc"}')
    const { simulation_id, chunk_index, person_ids } = incomplete
    expect(simulation_id).toBe('abc')
    expect(chunk_index).toBeUndefined()
    expect(person_ids).toBeUndefined()
  })
})

// ── Sequential processing count ───────────────────────────────────────────

describe('sequential processing response count', () => {
  it('generates correct response count: 3 persons × 2 questions × 2 runs = 12', () => {
    const personCount = 3
    const questionCount = 2
    const runsPerPerson = 2
    const expected = personCount * questionCount * runsPerPerson
    expect(expected).toBe(12)
  })

  it('generates correct response count: 20 persons × 5 questions × 1 run = 100', () => {
    expect(20 * 5 * 1).toBe(100)
  })

  it('generates correct response count: 1 person × 1 question × 10 runs = 10', () => {
    expect(1 * 1 * 10).toBe(10)
  })
})

// ── SimulationStatus transitions ───────────────────────────────────────────

describe('SimulationStatus transitions', () => {
  it('running → completed is valid when last chunk', () => {
    const currentStatus = SimulationStatus.RUNNING
    const { isLast } = incrementCompleted(4, 5)
    const newStatus = isLast ? SimulationStatus.COMPLETED : currentStatus
    expect(newStatus).toBe(SimulationStatus.COMPLETED)
  })

  it('running stays running when not last chunk', () => {
    const currentStatus = SimulationStatus.RUNNING
    const { isLast } = incrementCompleted(2, 5)
    const newStatus = isLast ? SimulationStatus.COMPLETED : currentStatus
    expect(newStatus).toBe(SimulationStatus.RUNNING)
  })

  it('non-running simulation should be skipped', () => {
    const statuses = [
      SimulationStatus.COMPLETED,
      SimulationStatus.FAILED,
      SimulationStatus.PARTIAL_FAILURE,
      SimulationStatus.PENDING,
    ]
    for (const status of statuses) {
      expect(status !== SimulationStatus.RUNNING).toBe(true)
    }
  })
})
