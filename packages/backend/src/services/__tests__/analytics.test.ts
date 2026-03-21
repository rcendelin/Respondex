/**
 * Unit tests for analytics service.
 * Tests pure computation functions — no Azure mocks needed.
 */
import { describe, it, expect } from 'vitest'
import {
  computeFrequencyTables,
  computeDescriptiveStats,
  computeCrossTabs,
} from '../analytics.js'
import { Strategy, SimulationStatus, SupportedModel, QuestionType, Gender, Education, Region } from '@respondex/shared'
import type { SimulationResponse, Question, Person } from '@respondex/shared'

// ── Test fixtures ──────────────────────────────────────────────────────────

function makeResponse(overrides: Partial<SimulationResponse>): SimulationResponse {
  return {
    person_id: 'p001',
    question_id: 'q001',
    run: 1,
    answer: 'Ano',
    valid: true,
    strategy: Strategy.A,
    model: SupportedModel.GPT_4O_MINI,
    temperature: 0.7,
    timestamp: '2026-03-21T10:00:00.000Z',
    ...overrides,
  }
}

const YES_NO_Q: Question = {
  id: 'q001',
  order: 1,
  text: 'Hlasoval/a jste?',
  type: QuestionType.YES_NO,
  required: true,
}

const LIKERT_Q: Question = {
  id: 'q002',
  order: 2,
  text: 'Spokojenost (1–5)',
  type: QuestionType.LIKERT,
  required: true,
  scale_min: 1,
  scale_max: 5,
}

const SINGLE_Q: Question = {
  id: 'q003',
  order: 3,
  text: 'Priorita?',
  type: QuestionType.SINGLE_CHOICE,
  required: true,
  options: ['Ekonomika', 'Zdravotnictví', 'Vzdělání'],
}

const NPS_Q: Question = {
  id: 'q004',
  order: 4,
  text: 'Doporučení (0–10)',
  type: QuestionType.NPS,
  required: true,
}

function makePersons(): Person[] {
  return [
    {
      id: 'p001', age: 30, gender: Gender.MALE,
      demographics: { education: Education.UNIVERSITY, region: Region.PRAGUE },
    },
    {
      id: 'p002', age: 45, gender: Gender.FEMALE,
      demographics: { education: Education.SECONDARY, region: Region.CENTRAL_BOHEMIA },
    },
    {
      id: 'p003', age: 62, gender: Gender.MALE,
      demographics: { education: Education.VOCATIONAL, region: Region.PRAGUE },
    },
    {
      id: 'p004', age: 28, gender: Gender.FEMALE,
      demographics: { education: Education.UNIVERSITY },
    },
  ]
}

// ── computeFrequencyTables ─────────────────────────────────────────────────

describe('computeFrequencyTables', () => {
  it('counts yes/no answers correctly', () => {
    const responses = [
      makeResponse({ answer: 'Ano' }),
      makeResponse({ answer: 'Ano' }),
      makeResponse({ answer: 'Ne' }),
    ]
    const [table] = computeFrequencyTables(responses, [YES_NO_Q])
    expect(table?.question_id).toBe('q001')
    expect(table?.valid_responses).toBe(3)
    const ano = table?.entries.find((e) => e.value === 'Ano')
    const ne = table?.entries.find((e) => e.value === 'Ne')
    expect(ano?.count).toBe(2)
    expect(ne?.count).toBe(1)
  })

  it('calculates percentages correctly (2/3 = 66.7%)', () => {
    const responses = [
      makeResponse({ answer: 'Ano' }),
      makeResponse({ answer: 'Ano' }),
      makeResponse({ answer: 'Ne' }),
    ]
    const [table] = computeFrequencyTables(responses, [YES_NO_Q])
    const ano = table?.entries.find((e) => e.value === 'Ano')
    expect(ano?.percentage).toBeCloseTo(66.7, 0)
  })

  it('excludes invalid responses', () => {
    const responses = [
      makeResponse({ answer: 'Ano' }),
      makeResponse({ answer: 'Ne', valid: false }),
    ]
    const [table] = computeFrequencyTables(responses, [YES_NO_Q])
    expect(table?.valid_responses).toBe(1)
    expect(table?.total_responses).toBe(2)
  })

  it('returns empty entries for question with no responses', () => {
    const [table] = computeFrequencyTables([], [YES_NO_Q])
    expect(table?.valid_responses).toBe(0)
    expect(table?.entries).toHaveLength(0)
  })

  it('sorts entries by count descending', () => {
    const responses = [
      makeResponse({ answer: 'Ne' }),
      makeResponse({ answer: 'Ano' }),
      makeResponse({ answer: 'Ano' }),
      makeResponse({ answer: 'Ano' }),
    ]
    const [table] = computeFrequencyTables(responses, [YES_NO_Q])
    expect(table?.entries[0]?.value).toBe('Ano')
    expect(table?.entries[1]?.value).toBe('Ne')
  })

  it('handles multi-choice (array answers) by counting each value', () => {
    const multiQ: Question = { id: 'q001', order: 1, text: '?', type: QuestionType.MULTI_CHOICE, required: true }
    const responses = [
      makeResponse({ answer: ['A', 'B'] }),
      makeResponse({ answer: ['B', 'C'] }),
    ]
    const [table] = computeFrequencyTables(responses, [multiQ])
    const bEntry = table?.entries.find((e) => e.value === 'B')
    expect(bEntry?.count).toBe(2)
  })

  it('handles multiple questions independently', () => {
    const responses = [
      makeResponse({ question_id: 'q001', answer: 'Ano' }),
      makeResponse({ question_id: 'q002', answer: 3 }),
    ]
    const tables = computeFrequencyTables(responses, [YES_NO_Q, LIKERT_Q])
    expect(tables).toHaveLength(2)
    expect(tables[0]?.question_id).toBe('q001')
    expect(tables[1]?.question_id).toBe('q002')
    expect(tables[0]?.valid_responses).toBe(1)
    expect(tables[1]?.valid_responses).toBe(1)
  })
})

// ── computeDescriptiveStats ────────────────────────────────────────────────

describe('computeDescriptiveStats', () => {
  it('computes mean and median for likert responses', () => {
    const responses = [1, 2, 3, 4, 5].map((v) =>
      makeResponse({ question_id: 'q002', answer: v })
    )
    const [stats] = computeDescriptiveStats(responses, [LIKERT_Q])
    expect(stats?.mean).toBe(3)
    expect(stats?.median).toBe(3)
  })

  it('computes standard deviation', () => {
    // SD of [1,2,3,4,5] = sqrt(10/4) ≈ 1.581
    const responses = [1, 2, 3, 4, 5].map((v) =>
      makeResponse({ question_id: 'q002', answer: v })
    )
    const [stats] = computeDescriptiveStats(responses, [LIKERT_Q])
    expect(stats?.std_dev).toBeCloseTo(1.581, 1)
  })

  it('computes min and max', () => {
    const responses = [1, 3, 5].map((v) => makeResponse({ question_id: 'q002', answer: v }))
    const [stats] = computeDescriptiveStats(responses, [LIKERT_Q])
    expect(stats?.min).toBe(1)
    expect(stats?.max).toBe(5)
  })

  it('computes p25 and p75', () => {
    const responses = [1, 2, 3, 4].map((v) => makeResponse({ question_id: 'q002', answer: v }))
    const [stats] = computeDescriptiveStats(responses, [LIKERT_Q])
    expect(stats?.p25).toBeDefined()
    expect(stats?.p75).toBeDefined()
  })

  it('computes mode for numeric question', () => {
    const responses = [1, 3, 3, 5].map((v) => makeResponse({ question_id: 'q002', answer: v }))
    const [stats] = computeDescriptiveStats(responses, [LIKERT_Q])
    expect(stats?.mode).toBe(3)
  })

  it('computes mode for categorical question', () => {
    const responses = [
      makeResponse({ question_id: 'q003', answer: 'Ekonomika' }),
      makeResponse({ question_id: 'q003', answer: 'Zdravotnictví' }),
      makeResponse({ question_id: 'q003', answer: 'Zdravotnictví' }),
    ]
    const [stats] = computeDescriptiveStats(responses, [SINGLE_Q])
    expect(stats?.mode).toBe('Zdravotnictví')
  })

  it('excludes invalid responses from computation', () => {
    const responses = [
      makeResponse({ question_id: 'q002', answer: 1 }),
      makeResponse({ question_id: 'q002', answer: 5, valid: false }),
    ]
    const [stats] = computeDescriptiveStats(responses, [LIKERT_Q])
    expect(stats?.n).toBe(1)
    expect(stats?.mean).toBe(1)
  })

  it('returns n=0 for empty question', () => {
    const [stats] = computeDescriptiveStats([], [LIKERT_Q])
    expect(stats?.n).toBe(0)
    expect(stats?.mean).toBeUndefined()
  })

  it('handles NPS (0-10 scale) correctly', () => {
    const responses = [0, 5, 10].map((v) => makeResponse({ question_id: 'q004', answer: v }))
    const [stats] = computeDescriptiveStats(responses, [NPS_Q])
    expect(stats?.mean).toBeCloseTo(5, 0)
    expect(stats?.min).toBe(0)
    expect(stats?.max).toBe(10)
  })
})

// ── computeCrossTabs ───────────────────────────────────────────────────────

describe('computeCrossTabs', () => {
  it('groups by gender correctly', () => {
    const persons = makePersons()
    const responses = [
      makeResponse({ person_id: 'p001', question_id: 'q001', answer: 'Ano' }), // Muž
      makeResponse({ person_id: 'p002', question_id: 'q001', answer: 'Ne' }),  // Žena
      makeResponse({ person_id: 'p003', question_id: 'q001', answer: 'Ano' }), // Muž
      makeResponse({ person_id: 'p004', question_id: 'q001', answer: 'Ano' }), // Žena
    ]
    const [tab] = computeCrossTabs(responses, [YES_NO_Q], persons, 'Pohlavi')
    expect(tab?.group_by).toBe('Pohlavi')
    expect(tab?.rows.length).toBeGreaterThan(0)
    const anoRow = tab?.rows.find((r) => r.answer_value === 'Ano')
    expect(anoRow).toBeDefined()
  })

  it('groups by age group correctly', () => {
    const persons = makePersons() // ages: 30, 45, 62, 28
    const responses = persons.map((p) => makeResponse({ person_id: p.id, answer: 'Ano' }))
    const [tab] = computeCrossTabs(responses, [YES_NO_Q], persons, 'VekovaSkupina')
    expect(tab?.group_by).toBe('VekovaSkupina')
    const groupValues = tab?.rows[0]?.cells.map((c) => c.group_value) ?? []
    expect(groupValues.some((g) => g.includes('25–34'))).toBe(true)
  })

  it('returns empty rows for question with no responses', () => {
    const persons = makePersons()
    const [tab] = computeCrossTabs([], [YES_NO_Q], persons, 'Pohlavi')
    expect(tab?.rows).toHaveLength(0)
  })

  it('handles persons without the grouped demographic (region undefined)', () => {
    const persons = makePersons() // p004 has no region
    const responses = persons.map((p) => makeResponse({ person_id: p.id }))
    // Should not throw for persons missing region
    expect(() => computeCrossTabs(responses, [YES_NO_Q], persons, 'Region')).not.toThrow()
  })
})

// ── Age grouping edge cases ────────────────────────────────────────────────

describe('age group boundaries', () => {
  // Test that boundary ages land in correct groups
  const testAges: Array<[number, string]> = [
    [18, '18–24'], [24, '18–24'],
    [25, '25–34'], [34, '25–34'],
    [35, '35–44'], [44, '35–44'],
    [45, '45–54'], [54, '45–54'],
    [55, '55–64'], [64, '55–64'],
    [65, '65+'], [99, '65+'],
  ]

  // We test via computeCrossTabs by checking group values
  for (const [age, expectedGroup] of testAges) {
    it(`age ${age} → group "${expectedGroup}"`, () => {
      const persons: Person[] = [{ id: 'p1', age, gender: Gender.MALE }]
      const responses = [makeResponse({ person_id: 'p1' })]
      const [tab] = computeCrossTabs(responses, [YES_NO_Q], persons, 'VekovaSkupina')
      const groupValues = tab?.rows[0]?.cells.map((c) => c.group_value) ?? []
      expect(groupValues).toContain(expectedGroup)
    })
  }
})
