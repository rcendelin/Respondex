import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseQuestionnaireXlsx } from '../questionnaire-parser.js'
import { QuestionType } from '../../types/questionnaire.js'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '../../../../..', 'templates')

describe('parseQuestionnaireXlsx', () => {
  let sampleBuffer: Buffer

  beforeAll(() => {
    sampleBuffer = readFileSync(join(TEMPLATES_DIR, 'sample-questionnaire.xlsx'))
  })

  it('parses the sample template successfully', () => {
    const result = parseQuestionnaireXlsx(sampleBuffer)
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.questions.length).toBe(10)
  })

  it('parses metadata from Metadata sheet', () => {
    const result = parseQuestionnaireXlsx(sampleBuffer)
    expect(result.data!.metadata.title).toBe('Vzorový dotazník Respondex')
    expect(result.data!.metadata.language).toBe('cs')
  })

  it('parses question types correctly', () => {
    const result = parseQuestionnaireXlsx(sampleBuffer)
    const q = result.data!.questions
    expect(q.find((x) => x.id === 'Q01')?.type).toBe(QuestionType.LIKERT)
    expect(q.find((x) => x.id === 'Q02')?.type).toBe(QuestionType.YES_NO)
    expect(q.find((x) => x.id === 'Q03')?.type).toBe(QuestionType.SINGLE_CHOICE)
    expect(q.find((x) => x.id === 'Q04')?.type).toBe(QuestionType.NUMBER)
    expect(q.find((x) => x.id === 'Q05')?.type).toBe(QuestionType.MULTI_CHOICE)
  })

  it('parses options by splitting on semicolon', () => {
    const result = parseQuestionnaireXlsx(sampleBuffer)
    const q03 = result.data!.questions.find((q) => q.id === 'Q03')
    expect(q03?.options).toBeDefined()
    expect(q03!.options!.length).toBe(5)
    expect(q03!.options![0]).toBe('Ekonomika a životní úroveň')
  })

  it('parses scale values for likert questions', () => {
    const result = parseQuestionnaireXlsx(sampleBuffer)
    const q01 = result.data!.questions.find((q) => q.id === 'Q01')
    expect(q01?.scale_min).toBe(1)
    expect(q01?.scale_max).toBe(5)
  })

  it('parses skip logic', () => {
    const result = parseQuestionnaireXlsx(sampleBuffer)
    const q03 = result.data!.questions.find((q) => q.id === 'Q03')
    expect(q03?.skip_logic).toBeDefined()
    expect(q03!.skip_logic!.question_id).toBe('Q02')
    expect(q03!.skip_logic!.show_if_answer).toBe('Ano')
  })

  it('fails on invalid XLSX data', () => {
    const result = parseQuestionnaireXlsx(Buffer.from('not-an-xlsx'))
    expect(result.success).toBe(false)
  })

  it('fails on missing required columns', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([{ Text: 'Otázka', Typ: 'yes_no' }])
    XLSX.utils.book_append_sheet(wb, ws, 'Otazky')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)

    const result = parseQuestionnaireXlsx(buf)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.column === 'ID')).toBe(true)
  })

  it('fails on invalid question type', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([
      { ID: 'Q01', Poradi: 1, Text: 'Test', Typ: 'invalid_type', Povinne: 'Ano' },
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Otazky')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)

    const result = parseQuestionnaireXlsx(buf)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.column === 'Typ')).toBe(true)
  })

  it('fails when single_choice has no options', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([
      { ID: 'Q01', Poradi: 1, Text: 'Vyberte možnost', Typ: 'single_choice', Moznosti: '', Povinne: 'Ano' },
    ])
    XLSX.utils.book_append_sheet(wb, ws, 'Otazky')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)

    const result = parseQuestionnaireXlsx(buf)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.message.includes('možnost'))).toBe(true)
  })

  it('accepts custom questionnaire ID', () => {
    const result = parseQuestionnaireXlsx(sampleBuffer, 'my-custom-id')
    expect(result.data!.metadata.id).toBe('my-custom-id')
  })
})
