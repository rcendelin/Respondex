import * as XLSX from 'xlsx'
import type { Person, PersonMetadata } from '../types/person.js'
import { computeExpectedScore, scoreToLevel } from '../numeracy-assigner.js'

// M3: Sanitize string values to prevent formula injection in Excel.
// Strip embedded newlines (bypass vector), then prefix-escape formula-starting chars.
function sanitizeForExcel(val: string): string {
  const stripped = val.replace(/[\r\n]/g, ' ')
  const formulaChars = ['=', '+', '-', '@', '\t']
  if (formulaChars.some((c) => stripped.startsWith(c))) {
    return `'${stripped}`
  }
  return stripped
}

// Fixed column names used in export — custom fields must not collide with these
const FIXED_COLUMN_NAMES = new Set([
  'ID', 'Věk', 'Pohlaví', 'Národnost', 'Vzdělání', 'Stav', 'Partner', 'Status', 'Příjem', 'Kraj',
  'PIAAC skóre', 'PIAAC úroveň', 'Životní příběh',
])

/**
 * Export a population to XLSX buffer (mirrors the import format).
 * Resulting file can be re-imported without data loss.
 */
export function generatePopulationXlsx(persons: Person[], metadata?: Partial<PersonMetadata>): Buffer {
  const MAX_CUSTOM_FIELDS = 50

  const rows = persons.map((p) => {
    const customFields = p.demographics?.custom_fields ?? {}
    const sanitizedCustom: Record<string, string | number | boolean> = {}
    let customCount = 0
    for (const [k, v] of Object.entries(customFields)) {
      if (customCount >= MAX_CUSTOM_FIELDS) break
      // Sanitize both key (becomes column header) and string values
      const safeKey = sanitizeForExcel(k)
      // Skip custom fields that collide with fixed column names to prevent data corruption on roundtrip
      if (FIXED_COLUMN_NAMES.has(safeKey)) continue
      sanitizedCustom[safeKey] = typeof v === 'string' ? sanitizeForExcel(v) : v
      customCount++
    }
    return {
      ID: sanitizeForExcel(p.id),
      'Věk': p.age,
      // Enum values are sanitized defensively (could come from non-parser sources)
      'Pohlaví': sanitizeForExcel(p.gender),
      'Národnost': sanitizeForExcel(p.demographics?.nationality ?? 'ČR'),
      'Vzdělání': sanitizeForExcel(p.demographics?.education ?? ''),
      'Stav': sanitizeForExcel(p.demographics?.marital_status ?? ''),
      'Partner':
        p.demographics?.has_partner === undefined
          ? ''
          : p.demographics.has_partner
            ? 'Ano'
            : 'Ne',
      'Status': sanitizeForExcel(p.demographics?.employment_status ?? ''),
      'Příjem': sanitizeForExcel(p.demographics?.income_level ?? ''),
      'Kraj': sanitizeForExcel(p.demographics?.region ?? ''),
      'PIAAC skóre': p.demographics?.piaac_score ?? Math.round(computeExpectedScore(p)),
      'PIAAC úroveň': sanitizeForExcel(
        scoreToLevel(Math.round(p.demographics?.piaac_score ?? computeExpectedScore(p)))
      ),
      'Životní příběh': p.life_story ? sanitizeForExcel(p.life_story) : '',
      // Flatten sanitized custom fields (capped at MAX_CUSTOM_FIELDS)
      ...sanitizedCustom,
    }
  })

  const metaRows = [
    { Pole: 'Název', Hodnota: metadata?.name ?? 'Populace Respondex' },
    { Pole: 'Popis', Hodnota: metadata?.description ?? '' },
    { Pole: 'PočetOsob', Hodnota: persons.length },
    { Pole: 'ExportovánoVe', Hodnota: new Date().toISOString() },
    { Pole: 'Verze', Hodnota: '1.0' },
  ]

  const wb = XLSX.utils.book_new()
  const wsOsoby = XLSX.utils.json_to_sheet(rows)
  const wsMeta = XLSX.utils.json_to_sheet(metaRows)

  wsOsoby['!cols'] = [
    { wch: 8 },  // ID
    { wch: 6 },  // Věk
    { wch: 8 },  // Pohlaví
    { wch: 12 }, // Národnost
    { wch: 22 }, // Vzdělání
    { wch: 20 }, // Stav
    { wch: 8 },  // Partner
    { wch: 30 }, // Status
    { wch: 18 }, // Příjem
    { wch: 20 }, // Kraj
    { wch: 12 }, // PIAAC skóre
    { wch: 16 }, // PIAAC úroveň
    { wch: 60 }, // Životní příběh
  ]

  XLSX.utils.book_append_sheet(wb, wsOsoby, 'Osoby')
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata')

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)
}
