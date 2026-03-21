import * as XLSX from 'xlsx'
import type { Person, PersonMetadata } from '../types/person.js'

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
      sanitizedCustom[safeKey] = typeof v === 'string' ? sanitizeForExcel(v) : v
      customCount++
    }
    return {
      ID: sanitizeForExcel(p.id),
      Vek: p.age,
      // Enum values are sanitized defensively (could come from non-parser sources)
      Pohlavi: sanitizeForExcel(p.gender),
      Vzdelani: sanitizeForExcel(p.demographics?.education ?? ''),
      RodinnyStav: sanitizeForExcel(p.demographics?.marital_status ?? ''),
      MaPartnera:
        p.demographics?.has_partner === undefined
          ? ''
          : p.demographics.has_partner
            ? 'Ano'
            : 'Ne',
      ZaměstnaneckyStatus: sanitizeForExcel(p.demographics?.employment_status ?? ''),
      PrijmoveRozpeti: sanitizeForExcel(p.demographics?.income_level ?? ''),
      Kraj: sanitizeForExcel(p.demographics?.region ?? ''),
      ZivotniPribeh: p.life_story ? sanitizeForExcel(p.life_story) : '',
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
    { wch: 8 }, { wch: 6 }, { wch: 8 }, { wch: 18 }, { wch: 20 },
    { wch: 10 }, { wch: 30 }, { wch: 16 }, { wch: 20 }, { wch: 60 },
  ]

  XLSX.utils.book_append_sheet(wb, wsOsoby, 'Osoby')
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata')

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)
}
