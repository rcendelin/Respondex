import * as XLSX from 'xlsx'
import type { SimulationResponse, SimulationMeta } from '../types/simulation.js'
import type { Question } from '../types/questionnaire.js'
import type { Person } from '../types/person.js'
import type { FrequencyTable, DescriptiveStats, CrossTab } from '../types/analytics.js'

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

export interface ResultsExportData {
  simulationMeta: SimulationMeta
  responses: SimulationResponse[]
  questions: Question[]
  persons?: Person[]
  frequencyTables?: FrequencyTable[]
  descriptiveStats?: DescriptiveStats[]
  crossTabs?: CrossTab[]
}

/**
 * Generate a 5-sheet XLSX results export.
 * All exported files include a Metadata sheet clearly marking data as AI-generated.
 */
export function generateResultsXlsx(data: ResultsExportData): Buffer {
  const wb = XLSX.utils.book_new()

  // ── Sheet 1: Odpovědi (one row per respondent, questions as columns) ───────
  const personMap = new Map((data.persons ?? []).map(p => [p.id, p]))
  const sortedQuestions = [...data.questions].sort((a, b) => a.order - b.order)

  // Build lookup: person_id → question_id → answer (prefer first valid response)
  const answerMap = new Map<string, Map<string, string>>()
  const validSet = new Set<string>() // tracks "person:question" pairs with a valid answer stored
  for (const r of data.responses) {
    if (!answerMap.has(r.person_id)) answerMap.set(r.person_id, new Map())
    const qMap = answerMap.get(r.person_id)!
    const key = `${r.person_id}:${r.question_id}`
    const hasValid = validSet.has(key)
    // Skip if we already have a valid answer for this pair
    if (hasValid) continue
    const answerStr = Array.isArray(r.answer) ? r.answer.join('; ') : String(r.answer)
    qMap.set(r.question_id, answerStr)
    if (r.valid) validSet.add(key)
  }

  // Unique person IDs preserving response order
  const personIds: string[] = []
  const seen = new Set<string>()
  for (const r of data.responses) {
    if (!seen.has(r.person_id)) {
      seen.add(r.person_id)
      personIds.push(r.person_id)
    }
  }

  // Build header: demographics + question columns
  const odpovediRows: Record<string, unknown>[] = []
  for (const pid of personIds) {
    const person = personMap.get(pid)
    const answers = answerMap.get(pid) ?? new Map<string, string>()

    const row: Record<string, unknown> = {
      PersonID: sanitizeForExcel(pid),
      Vek: person?.age ?? '',
      Pohlavi: person?.gender ?? '',
      Vzdelani: person?.demographics?.education ?? '',
      Kraj: person?.demographics?.region ?? '',
      RodinnyStav: person?.demographics?.marital_status ?? '',
      Zamestnani: person?.demographics?.employment_status ?? '',
      PrijmoveRozpeti: person?.demographics?.income_level ?? '',
    }

    for (const q of sortedQuestions) {
      const colName = sanitizeForExcel(q.id)
      row[colName] = answers.has(q.id) ? sanitizeForExcel(answers.get(q.id)!) : ''
    }

    odpovediRows.push(row)
  }

  const wsOdpovedi = XLSX.utils.json_to_sheet(odpovediRows)

  // Column widths: 8 demo cols + question cols
  const demoCols = [
    { wch: 10 }, { wch: 5 }, { wch: 8 }, { wch: 18 }, { wch: 18 },
    { wch: 16 }, { wch: 22 }, { wch: 14 },
  ]
  const qCols = sortedQuestions.map(() => ({ wch: 16 }))
  wsOdpovedi['!cols'] = [...demoCols, ...qCols]

  XLSX.utils.book_append_sheet(wb, wsOdpovedi, 'Odpovědi')

  // ── Sheet 1b: Klíč otázek (question ID → full text mapping) ───────────────
  const keyRows = sortedQuestions.map(q => ({
    ID: sanitizeForExcel(q.id),
    Pořadí: q.order,
    Text: sanitizeForExcel(q.text),
    Typ: q.type,
    Možnosti: q.options ? q.options.map(o => sanitizeForExcel(o)).join('; ') : '',
  }))
  const wsKey = XLSX.utils.json_to_sheet(keyRows)
  wsKey['!cols'] = [{ wch: 8 }, { wch: 7 }, { wch: 60 }, { wch: 14 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, wsKey, 'Klíč otázek')

  // ── Sheet 2: Summary ───────────────────────────────────────────────────────
  const summaryRows: Record<string, unknown>[] = []

  if (data.frequencyTables && data.descriptiveStats) {
    for (const ft of data.frequencyTables) {
      const stats = data.descriptiveStats.find((s) => s.question_id === ft.question_id)
      const question = data.questions.find((q) => q.id === ft.question_id)

      summaryRows.push({
        QuestionID: sanitizeForExcel(ft.question_id),
        QuestionText: sanitizeForExcel(ft.question_text),
        Typ: sanitizeForExcel(question?.type ?? ''),
        N: ft.total_responses,
        ValidN: ft.valid_responses,
        Mean: stats?.mean ?? '',
        Median: stats?.median ?? '',
        Mode: stats?.mode !== undefined ? sanitizeForExcel(String(stats.mode)) : '',
        StdDev: stats?.std_dev ?? '',
        Min: stats?.min ?? '',
        Max: stats?.max ?? '',
        Distribuce: ft.entries
          .map((e) => `${sanitizeForExcel(String(e.value))}: ${e.count} (${e.percentage.toFixed(1)}%)`)
          .join(' | '),
      })
    }
  } else {
    // Placeholder when analytics haven't been computed yet
    summaryRows.push({ Info: 'Analytické výsledky budou dostupné po dokončení simulace.' })
  }

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows)
  wsSummary['!cols'] = [
    { wch: 10 }, { wch: 50 }, { wch: 14 }, { wch: 6 }, { wch: 8 },
    { wch: 8 }, { wch: 8 }, { wch: 15 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 60 },
  ]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary')

  // ── Sheet 3: Cross-tabs ────────────────────────────────────────────────────
  const crossTabRows: Record<string, unknown>[] = []
  if (data.crossTabs && data.crossTabs.length > 0) {
    for (const ct of data.crossTabs) {
      crossTabRows.push({
        QuestionID: sanitizeForExcel(ct.question_id),
        QuestionText: sanitizeForExcel(ct.question_text),
        GroupBy: sanitizeForExcel(ct.group_by),
      })
      for (const ctRow of ct.rows) {
        const rowData: Record<string, unknown> = { Odpověď: sanitizeForExcel(String(ctRow.answer_value)) }
        for (const cell of ctRow.cells) {
          // Sanitize group_value used as column header key
          const safeKey = sanitizeForExcel(cell.group_value)
          rowData[safeKey] = `${cell.count} (${cell.percentage.toFixed(1)}%)`
        }
        crossTabRows.push(rowData)
      }
      crossTabRows.push({}) // blank separator
    }
  } else {
    crossTabRows.push({ Info: 'Křížové tabulky budou dostupné po výpočtu analytiky.' })
  }

  const wsCrossTabs = XLSX.utils.json_to_sheet(crossTabRows)
  XLSX.utils.book_append_sheet(wb, wsCrossTabs, 'Cross-tabs')

  // ── Sheet 4: Calibration ───────────────────────────────────────────────────
  const calibrationRows = [{ Info: 'CZ-CalibrationEngine bude dostupný ve Fázi 2.' }]
  const wsCalibration = XLSX.utils.json_to_sheet(calibrationRows)
  XLSX.utils.book_append_sheet(wb, wsCalibration, 'Calibration')

  // ── Sheet 5: Metadata (IMPORTANT: marks data as AI-generated) ─────────────
  const now = new Date().toISOString()
  const metaRows = [
    { Pole: 'UPOZORNĚNÍ', Hodnota: 'TATO DATA JSOU AI-GENEROVANÉ SYNTETICKÉ ODPOVĚDI. NEJDE O REÁLNÁ DATA.' },
    { Pole: '', Hodnota: '' },
    { Pole: 'SimulationID', Hodnota: data.simulationMeta.id },
    { Pole: 'Strategie', Hodnota: data.simulationMeta.config.strategy },
    { Pole: 'Model', Hodnota: data.simulationMeta.config.model },
    { Pole: 'Temperature', Hodnota: data.simulationMeta.config.temperature },
    { Pole: 'RunsPerPerson', Hodnota: data.simulationMeta.config.runs_per_person },
    { Pole: 'PopulaceID', Hodnota: data.simulationMeta.config.population_id },
    { Pole: 'DotaznikID', Hodnota: data.simulationMeta.config.questionnaire_id },
    { Pole: 'PocetOsob', Hodnota: new Set(data.responses.map((r) => r.person_id)).size },
    { Pole: 'PocetOtazek', Hodnota: data.questions.length },
    { Pole: 'PocetOdpovedi', Hodnota: data.responses.length },
    { Pole: 'StartovánoVe', Hodnota: data.simulationMeta.started_at },
    { Pole: 'DokončenoVe', Hodnota: data.simulationMeta.completed_at ?? '' },
    { Pole: 'ExportovánoVe', Hodnota: now },
    { Pole: 'Platform', Hodnota: 'Respondex v0.1.0' },
  ]

  const wsMeta = XLSX.utils.json_to_sheet(metaRows)
  wsMeta['!cols'] = [{ wch: 20 }, { wch: 70 }]
  XLSX.utils.book_append_sheet(wb, wsMeta, 'Metadata')

  return Buffer.from(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as ArrayBuffer)
}
