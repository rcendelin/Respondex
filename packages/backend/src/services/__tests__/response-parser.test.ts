import { describe, it, expect } from 'vitest'
import { parseModelResponse } from '../response-parser.js'
import { QuestionType } from '@respondex/shared'
import type { Question } from '@respondex/shared'

const yesNo: Question = { id: 'Q01', order: 1, text: 'Test?', type: QuestionType.YES_NO, required: true }
const likert: Question = { id: 'Q02', order: 2, text: 'Test?', type: QuestionType.LIKERT, required: true, scale_min: 1, scale_max: 5 }
const single: Question = { id: 'Q03', order: 3, text: 'Test?', type: QuestionType.SINGLE_CHOICE, required: true, options: ['A', 'B', 'C'] }
const number: Question = { id: 'Q04', order: 4, text: 'Test?', type: QuestionType.NUMBER, required: true }
const nps: Question = { id: 'Q05', order: 5, text: 'Test?', type: QuestionType.NPS, required: true }
const openText: Question = { id: 'Q06', order: 6, text: 'Test?', type: QuestionType.OPEN_TEXT, required: true }

describe('parseModelResponse — yes_no', () => {
  it('parses valid Ano', () => {
    const r = parseModelResponse('{"answer": "Ano"}', yesNo)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe('Ano')
  })
  it('parses valid Ne', () => {
    const r = parseModelResponse('{"answer": "Ne"}', yesNo)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe('Ne')
  })
  it('rejects invalid value', () => {
    const r = parseModelResponse('{"answer": "yes"}', yesNo)
    expect(r.valid).toBe(false)
  })
})

describe('parseModelResponse — likert', () => {
  it('parses valid scale value', () => {
    const r = parseModelResponse('{"answer": 4}', likert)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe(4)
  })
  it('rejects out of range value', () => {
    const r = parseModelResponse('{"answer": 6}', likert)
    expect(r.valid).toBe(false)
    expect(r.invalid_reason).toContain('mimo rozsah')
  })
  it('rejects non-numeric', () => {
    const r = parseModelResponse('{"answer": "medium"}', likert)
    expect(r.valid).toBe(false)
  })
})

describe('parseModelResponse — single_choice', () => {
  it('accepts valid option', () => {
    const r = parseModelResponse('{"answer": "B"}', single)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe('B')
  })
  it('rejects invalid option', () => {
    const r = parseModelResponse('{"answer": "D"}', single)
    expect(r.valid).toBe(false)
  })
})

describe('parseModelResponse — number', () => {
  it('parses integer', () => {
    const r = parseModelResponse('{"answer": 42}', number)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe(42)
  })
  it('parses float', () => {
    const r = parseModelResponse('{"answer": 3.14}', number)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe(3.14)
  })
})

describe('parseModelResponse — NPS', () => {
  it('accepts 0', () => {
    const r = parseModelResponse('{"answer": 0}', nps)
    expect(r.valid).toBe(true)
  })
  it('accepts 10', () => {
    const r = parseModelResponse('{"answer": 10}', nps)
    expect(r.valid).toBe(true)
  })
  it('rejects 11', () => {
    const r = parseModelResponse('{"answer": 11}', nps)
    expect(r.valid).toBe(false)
  })
})

describe('parseModelResponse — open_text', () => {
  it('parses text answer', () => {
    const r = parseModelResponse('{"answer": "Myslím si, že je to důležité."}', openText)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe('Myslím si, že je to důležité.')
  })
  it('rejects empty string', () => {
    const r = parseModelResponse('{"answer": ""}', openText)
    expect(r.valid).toBe(false)
  })
})

describe('parseModelResponse — JSON extraction', () => {
  it('extracts JSON from prose wrapping', () => {
    const r = parseModelResponse('Here is my answer: {"answer": "Ano"} Thank you.', yesNo)
    expect(r.valid).toBe(true)
    expect(r.answer).toBe('Ano')
  })
  it('handles empty response', () => {
    const r = parseModelResponse('', yesNo)
    expect(r.valid).toBe(false)
  })
  it('handles non-JSON response', () => {
    const r = parseModelResponse('Jako AI nemohu odpovědět.', yesNo)
    expect(r.valid).toBe(false)
  })
  it('handles missing answer key', () => {
    const r = parseModelResponse('{"result": "Ano"}', yesNo)
    expect(r.valid).toBe(false)
  })
})
