import * as XLSX from 'xlsx'
import type { SimulationResponse, SimulationMeta } from '../types/simulation.js'
import type { Question } from '../types/questionnaire.js'
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

  // ── Sheet 1: Raw Data ──────────────────────────────────────────────────────
  const rawRows = data.responses.map((r) => {
    const question = data.questions.find((q) => q.id === r.question_id)
    const answerStr = Array.isArray(r.answer) ? r.answer.join('; ') : String(r.answer)
    return {
      PersonID: sanitizeForExcel(r.person_id),
      QuestionID: sanitizeForExcel(r.question_id),
      QuestionText: sanitizeForExcel(question?.text ?? ''),
      Run: r.run,
      Answer: sanitizeForExcel(answerStr),
      Valid: r.valid ? 'Ano' : 'Ne',
      InvalidReason: r.invalid_reason ? sanitizeForExcel(r.invalid_reason) : '',
      Strategy: r.strategy,
      Model: r.model,
      Temperature: r.temperature,
      TokensTotal: r.tokens_used?.total ?? '',
      Timestamp: r.timestamp,
    }
  })

  const wsRaw = XLSX.utils.json_to_sheet(rawRows)
  wsRaw['!cols'] = [
    { wch: 10 }, { wch: 8 }, { wch: 50 }, { wch: 5 }, { wch: 30 },
    { wch: 6 }, { wch: 20 }, { wch: 10 }, { wch: 15 }, { wch: 12 },
    { wch: 12 }, { wch: 22 },
  ]
  XLSX.utils.book_append_sheet(wb, wsRaw, 'Raw Data')

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
