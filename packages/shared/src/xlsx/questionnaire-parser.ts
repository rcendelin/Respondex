import * as XLSX from 'xlsx'
import type { Question, Questionnaire, QuestionnaireMetadata, SkipLogic } from '../types/questionnaire.js'
import { QuestionType } from '../types/questionnaire.js'
import { QuestionSchema } from '../validation/questionnaire.schema.js'
import type { ParseResult, ParseError } from './parse-result.js'
import { parseSuccess, parseFailure } from './parse-result.js'

const REQUIRED_COLUMNS = ['ID', 'Poradi', 'Text', 'Typ', 'Povinne'] as const
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_ROWS = 1_000 // questionnaires rarely exceed this

function parseBoolean(val: string): boolean {
  return String(val).trim().toLowerCase() === 'ano' || String(val).trim() === '1'
}

function parseSkipLogic(val: string): SkipLogic | undefined {
  const trimmed = val.trim()
  if (!trimmed) return undefined
  // Format: "Q02=Ano"
  const eqIndex = trimmed.indexOf('=')
  if (eqIndex === -1) return undefined
  return {
    question_id: trimmed.substring(0, eqIndex).trim(),
    show_if_answer: trimmed.substring(eqIndex + 1).trim(),
  }
}

function parseQuestionType(val: string, row: number): { value?: QuestionType; error?: ParseError } {
  const normalized = val.trim().toLowerCase()
  const valid = Object.values(QuestionType) as string[]
  if (valid.includes(normalized)) return { value: normalized as QuestionType }
  return {
    error: {
      row,
      column: 'Typ',
      message: `Řádek ${row}: Neplatný typ otázky "${val}". Povolené typy: ${valid.join(', ')}`,
    },
  }
}

/**
 * Parse a questionnaire XLSX buffer into a Questionnaire object.
 * Sheet must be named "Otazky" (or first sheet).
 * Metadata read from "Metadata" sheet if present.
 */
export function parseQuestionnaireXlsx(
  buffer: Buffer | ArrayBuffer,
  questionnaireId?: string
): ParseResult<Questionnaire> {
  // H1: Limit file size to prevent zip bomb / memory exhaustion DoS
  const byteLength = buffer instanceof ArrayBuffer ? buffer.byteLength : buffer.length
  if (byteLength > MAX_FILE_SIZE_BYTES) {
    return parseFailure([{ message: `Soubor je příliš velký. Maximum je ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.` }])
  }

  let wb: XLSX.WorkBook
  try {
    // M4: Disable formula evaluation to prevent formula injection
    wb = XLSX.read(buffer, { type: 'buffer', codepage: 65001, cellFormula: false })
  } catch {
    return parseFailure([{ message: 'Soubor nelze přečíst jako platný XLSX soubor.' }])
  }

  // Find questions sheet
  const sheetName = wb.SheetNames.includes('Otazky')
    ? 'Otazky'
    : wb.SheetNames[0]
  if (!sheetName) {
    return parseFailure([{ message: 'XLSX soubor neobsahuje žádný list.' }])
  }

  const ws = wb.Sheets[sheetName]
  if (!ws) {
    return parseFailure([{ message: `List "${sheetName}" nebyl nalezen.` }])
  }

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, {
    defval: '',
    raw: false,
  })

  if (rows.length === 0) {
    return parseFailure([{ message: 'List s otázkami neobsahuje žádná data.' }])
  }

  // H2: Limit row count to prevent memory exhaustion
  if (rows.length > MAX_ROWS) {
    return parseFailure([{ message: `Soubor obsahuje příliš mnoho řádků. Maximum je ${MAX_ROWS}.` }])
  }

  // Check required columns
  const headers = Object.keys(rows[0] ?? {})
  const missingRequired = REQUIRED_COLUMNS.filter((col) => !headers.includes(col))
  if (missingRequired.length > 0) {
    return parseFailure(
      missingRequired.map((col) => ({
        column: col,
        message: `Chybí povinný sloupec: "${col}"`,
      }))
    )
  }

  // Parse metadata sheet if present
  let title = 'Dotazník bez názvu'
  let description: string | undefined
  let language = 'cs'

  if (wb.SheetNames.includes('Metadata')) {
    const metaWs = wb.Sheets['Metadata']!
    const metaRows = XLSX.utils.sheet_to_json<{ Pole: string; Hodnota: string }>(metaWs, { defval: '' })
    for (const metaRow of metaRows) {
      const pole = String(metaRow.Pole ?? '').trim()
      const hodnota = String(metaRow.Hodnota ?? '').substring(0, 1000).trim() // cap at 1000 chars
      if (pole === 'Název' && hodnota) title = hodnota.substring(0, 200)
      if (pole === 'Popis' && hodnota) description = hodnota
      // Validate language is a simple BCP 47-like tag (2-5 alphanumeric chars)
      if (pole === 'Jazyk' && /^[a-zA-Z]{2,5}(-[a-zA-Z]{2,4})?$/.test(hodnota)) language = hodnota
    }
  }

  const questions: Question[] = []
  const errors: ParseError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const rowNum = i + 2

    // Parse required fields
    const id = String(row['ID'] ?? '').trim()
    if (!id) {
      errors.push({ row: rowNum, column: 'ID', message: `Řádek ${rowNum}: ID otázky nesmí být prázdné` })
      continue
    }

    const orderRaw = Number(row['Poradi'])
    if (isNaN(orderRaw) || orderRaw < 1) {
      errors.push({ row: rowNum, column: 'Poradi', message: `Řádek ${rowNum}: Pořadí musí být kladné číslo` })
      continue
    }

    const text = String(row['Text'] ?? '').trim()
    if (!text) {
      errors.push({ row: rowNum, column: 'Text', message: `Řádek ${rowNum}: Text otázky nesmí být prázdný` })
      continue
    }

    const typResult = parseQuestionType(String(row['Typ'] ?? ''), rowNum)
    if (typResult.error) { errors.push(typResult.error); continue }

    const required = parseBoolean(String(row['Povinne'] ?? 'Ano'))

    // Parse options (split by semicolon)
    const moznostiRaw = String(row['Moznosti'] ?? '').trim()
    const options = moznostiRaw
      ? moznostiRaw.split(';').map((o) => o.trim()).filter(Boolean)
      : undefined

    // Parse scale fields
    const skalaMin = row['SkalaMin'] !== '' ? Number(row['SkalaMin']) : undefined
    const skalaMax = row['SkalaMax'] !== '' ? Number(row['SkalaMax']) : undefined
    const skalaMinPopisek = String(row['SkalaMinPopisek'] ?? '').trim() || undefined
    const skalaMaxPopisek = String(row['SkalaMaxPopisek'] ?? '').trim() || undefined

    // Parse skip logic
    const skipLogicRaw = String(row['SkipLogic'] ?? '').trim()
    const skip_logic = parseSkipLogic(skipLogicRaw)

    // Parse piping
    const pipingFrom = String(row['PipingFrom'] ?? '').trim() || undefined

    // Parse numeric question fields
    const jeNumerickaRaw = String(row['JeNumericka'] ?? '').trim()
    const is_numeric = jeNumerickaRaw ? parseBoolean(jeNumerickaRaw) : undefined
    const spravnaOdpovedRaw = String(row['SpravnaOdpoved'] ?? '').trim()
    const correct_answer = spravnaOdpovedRaw ? Number(spravnaOdpovedRaw) : undefined
    const spravnostCsuRaw = String(row['SpravnostCSU'] ?? row['CorrectRate'] ?? '').trim()
    const correct_rate = spravnostCsuRaw ? Number(spravnostCsuRaw) : undefined

    // Parse reference distribution (format: "Ano:0.60;Ne:0.40")
    const refDistRaw = String(row['RefDistribuce'] ?? row['ReferenceDistribution'] ?? '').trim()
    let reference_distribution: Record<string, number> | undefined
    if (refDistRaw) {
      const dist: Record<string, number> = {}
      for (const pair of refDistRaw.split(';').map(p => p.trim()).filter(Boolean)) {
        const colonIdx = pair.lastIndexOf(':')
        if (colonIdx === -1) continue
        const key = pair.substring(0, colonIdx).trim()
        const val = Number(pair.substring(colonIdx + 1).trim())
        if (key && !isNaN(val) && val >= 0 && val <= 1) dist[key] = val
      }
      if (Object.keys(dist).length > 0) reference_distribution = dist
    }

    const question: Question = {
      id,
      order: Math.round(orderRaw),
      text,
      type: typResult.value!,
      required,
      ...(options && options.length > 0 ? { options } : {}),
      ...(skalaMin !== undefined && !isNaN(skalaMin) ? { scale_min: skalaMin } : {}),
      ...(skalaMax !== undefined && !isNaN(skalaMax) ? { scale_max: skalaMax } : {}),
      ...(skalaMinPopisek ? { scale_min_label: skalaMinPopisek } : {}),
      ...(skalaMaxPopisek ? { scale_max_label: skalaMaxPopisek } : {}),
      ...(is_numeric != null ? { is_numeric } : {}),
      ...(correct_answer !== undefined && !isNaN(correct_answer) ? { correct_answer } : {}),
      ...(correct_rate !== undefined && !isNaN(correct_rate) && correct_rate > 0 && correct_rate < 1 ? { correct_rate } : {}),
      ...(skip_logic ? { skip_logic } : {}),
      ...(pipingFrom ? { piping_from: pipingFrom } : {}),
      ...(reference_distribution ? { reference_distribution } : {}),
    }

    // Zod validation (validates cross-field rules)
    const zodResult = QuestionSchema.safeParse(question)
    if (!zodResult.success) {
      for (const issue of zodResult.error.issues) {
        const colName = typeof issue.path[0] === 'string' ? issue.path[0] : undefined
        const err: ParseError = { row: rowNum, message: `Řádek ${rowNum}: ${issue.message}` }
        if (colName !== undefined) err.column = colName
        errors.push(err)
      }
      continue
    }

    questions.push(zodResult.data as Question)
  }

  if (questions.length === 0) {
    return parseFailure([
      { message: 'Žádné platné otázky nebyly nalezeny.' },
      ...errors,
    ])
  }

  const metadata: QuestionnaireMetadata = {
    id: questionnaireId ?? crypto.randomUUID(),
    title,
    language,
    created_at: new Date().toISOString(),
    ...(description ? { description } : {}),
  }

  const questionnaire: Questionnaire = { metadata, questions }

  return {
    success: true,
    data: questionnaire,
    errors,
  }
}
