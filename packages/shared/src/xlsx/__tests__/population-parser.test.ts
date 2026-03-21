import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parsePopulationXlsx } from '../population-parser.js'
import { generatePopulationXlsx } from '../population-export.js'
import { Gender, Education, Region } from '../../types/person.js'
import * as XLSX from 'xlsx'

const __dirname = dirname(fileURLToPath(import.meta.url))
const TEMPLATES_DIR = join(__dirname, '../../../../..', 'templates')

describe('parsePopulationXlsx', () => {
  let sampleBuffer: Buffer

  beforeAll(() => {
    sampleBuffer = readFileSync(join(TEMPLATES_DIR, 'sample-population.xlsx'))
  })

  it('parses the sample template successfully', () => {
    const result = parsePopulationXlsx(sampleBuffer)
    expect(result.success).toBe(true)
    expect(result.data).toBeDefined()
    expect(result.data!.length).toBe(20)
  })

  it('parses required fields correctly', () => {
    const result = parsePopulationXlsx(sampleBuffer)
    const p001 = result.data!.find((p) => p.id === 'P001')
    expect(p001).toBeDefined()
    expect(p001!.age).toBe(34)
    expect(p001!.gender).toBe(Gender.MALE)
  })

  it('parses optional demographic fields', () => {
    const result = parsePopulationXlsx(sampleBuffer)
    const p001 = result.data!.find((p) => p.id === 'P001')
    expect(p001!.demographics?.education).toBe(Education.UNIVERSITY)
    expect(p001!.demographics?.region).toBe(Region.PRAGUE)
  })

  it('parses life_story for persons with backstory', () => {
    const result = parsePopulationXlsx(sampleBuffer)
    const p001 = result.data!.find((p) => p.id === 'P001')
    expect(p001!.life_story).toBeTruthy()
    expect(p001!.life_story!.length).toBeGreaterThan(10)
  })

  it('returns empty life_story as undefined', () => {
    const result = parsePopulationXlsx(sampleBuffer)
    const p003 = result.data!.find((p) => p.id === 'P003')
    expect(p003!.life_story).toBeUndefined()
  })

  it('fails on invalid XLSX data', () => {
    const result = parsePopulationXlsx(Buffer.from('not-an-xlsx'))
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('fails on missing required columns', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([{ Jmeno: 'Test', Vek: 30 }])
    XLSX.utils.book_append_sheet(wb, ws, 'Osoby')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)

    const result = parsePopulationXlsx(buf)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.column === 'ID')).toBe(true)
    expect(result.errors.some((e) => e.column === 'Pohlavi')).toBe(true)
  })

  it('fails on invalid age', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([{ ID: 'T001', Vek: 15, Pohlavi: 'Muž' }])
    XLSX.utils.book_append_sheet(wb, ws, 'Osoby')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)

    const result = parsePopulationXlsx(buf)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.message.includes('18'))).toBe(true)
  })

  it('fails on invalid gender', () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet([{ ID: 'T001', Vek: 30, Pohlavi: 'Unknown' }])
    XLSX.utils.book_append_sheet(wb, ws, 'Osoby')
    const buf = Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)

    const result = parsePopulationXlsx(buf)
    expect(result.success).toBe(false)
    expect(result.errors.some((e) => e.column === 'Pohlavi')).toBe(true)
  })

  it('roundtrip: import → export → import produces identical data', () => {
    const first = parsePopulationXlsx(sampleBuffer)
    expect(first.data).toBeDefined()

    const exported = generatePopulationXlsx(first.data!)
    const second = parsePopulationXlsx(exported)

    expect(second.success).toBe(true)
    expect(second.data!.length).toBe(first.data!.length)

    for (const original of first.data!) {
      const roundtripped = second.data!.find((p) => p.id === original.id)
      expect(roundtripped).toBeDefined()
      expect(roundtripped!.age).toBe(original.age)
      expect(roundtripped!.gender).toBe(original.gender)
    }
  })
})
