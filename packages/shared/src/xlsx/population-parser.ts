import * as XLSX from 'xlsx'
import type { Person, Demographics } from '../types/person.js'
import {
  Gender,
  Education,
  MaritalStatus,
  EmploymentStatus,
  IncomeLevel,
  Region,
} from '../types/person.js'
import { PersonSchema } from '../validation/person.schema.js'
import type { ParseResult, ParseError } from './parse-result.js'
import { parseSuccess, parseFailure } from './parse-result.js'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_ROWS = 10_000

// Known column names and their mappings to Person fields
const REQUIRED_COLUMNS = ['ID', 'Vek', 'Pohlavi'] as const
const KNOWN_COLUMNS: Record<string, keyof Person | keyof Demographics | 'skip'> = {
  ID: 'id',
  Vek: 'age',
  Pohlavi: 'gender',
  Vzdelani: 'education',
  RodinnyStav: 'marital_status',
  MaPartnera: 'has_partner',
  ZaměstnaneckyStatus: 'employment_status',
  PrijmoveRozpeti: 'income_level',
  Kraj: 'region',
  ZivotniPribeh: 'life_story',
}

const DEMOGRAPHIC_FIELDS = new Set([
  'education',
  'marital_status',
  'has_partner',
  'employment_status',
  'income_level',
  'region',
])

function toGender(val: string, row: number): { value?: Gender; error?: ParseError } {
  const normalized = val.trim()
  if (normalized === 'Muž' || normalized === 'Muz') return { value: Gender.MALE }
  if (normalized === 'Žena' || normalized === 'Zena') return { value: Gender.FEMALE }
  return {
    error: {
      row,
      column: 'Pohlavi',
      message: `Řádek ${row}: Pohlaví musí být "Muž" nebo "Žena", nalezeno: "${normalized}"`,
    },
  }
}

function toBoolean(val: string | number | boolean): boolean {
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') return val !== 0
  const s = String(val).trim().toLowerCase()
  return s === 'ano' || s === 'yes' || s === '1' || s === 'true'
}

function toEnum<T extends string>(
  enumObj: Record<string, T>,
  val: string,
  row: number,
  column: string
): { value?: T; error?: ParseError } {
  const values = Object.values(enumObj) as T[]
  const normalized = val.trim()
  if (values.includes(normalized as T)) return { value: normalized as T }
  return {
    error: {
      row,
      column,
      message: `Řádek ${row}: Neplatná hodnota sloupce "${column}": "${normalized}". Povolené hodnoty: ${values.join(', ')}`,
    },
  }
}

/**
 * Parse a population XLSX buffer into an array of Person objects.
 * Sheet must be named "Osoby" (or first sheet).
 */
export function parsePopulationXlsx(buffer: Buffer | ArrayBuffer): ParseResult<Person[]> {
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

  // Find the data sheet (prefer "Osoby", fallback to first sheet)
  const sheetName = wb.SheetNames.includes('Osoby') ? 'Osoby' : wb.SheetNames[0]
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
    return parseFailure([{ message: 'List "Osoby" neobsahuje žádná data.' }])
  }

  // H2: Limit row count to prevent memory exhaustion
  if (rows.length > MAX_ROWS) {
    return parseFailure([{ message: `Soubor obsahuje příliš mnoho řádků. Maximum je ${MAX_ROWS}.` }])
  }

  // Validate required columns exist
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

  const persons: Person[] = []
  const errors: ParseError[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    if (!row) continue
    const rowNum = i + 2 // header is row 1, data starts at row 2
    const rowErrors: ParseError[] = []

    // --- Parse ID ---
    const idRaw = String(row['ID'] ?? '').trim()
    if (!idRaw) {
      rowErrors.push({ row: rowNum, column: 'ID', message: `Řádek ${rowNum}: ID nesmí být prázdné` })
    }

    // --- Parse Vek ---
    const ageRaw = Number(row['Vek'])
    if (isNaN(ageRaw) || !Number.isInteger(ageRaw)) {
      rowErrors.push({ row: rowNum, column: 'Vek', message: `Řádek ${rowNum}: Sloupec "Vek" musí být celé číslo` })
    } else if (ageRaw < 18 || ageRaw > 100) {
      rowErrors.push({ row: rowNum, column: 'Vek', message: `Řádek ${rowNum}: Věk musí být 18–100, nalezeno: ${ageRaw}` })
    }

    // --- Parse Pohlavi ---
    const genderResult = toGender(String(row['Pohlavi'] ?? ''), rowNum)
    if (genderResult.error) rowErrors.push(genderResult.error)

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      continue
    }

    // --- Parse optional demographic fields ---
    const demographics: Demographics = {}
    let hasDemographics = false

    for (const [xlsxCol, fieldName] of Object.entries(KNOWN_COLUMNS)) {
      if (REQUIRED_COLUMNS.includes(xlsxCol as (typeof REQUIRED_COLUMNS)[number])) continue
      const rawVal = row[xlsxCol]
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue

      const strVal = String(rawVal).trim()

      if (fieldName === 'education') {
        const result = toEnum(Education, strVal, rowNum, xlsxCol)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.education = result.value!; hasDemographics = true }
      } else if (fieldName === 'marital_status') {
        const result = toEnum(MaritalStatus, strVal, rowNum, xlsxCol)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.marital_status = result.value!; hasDemographics = true }
      } else if (fieldName === 'employment_status') {
        const result = toEnum(EmploymentStatus, strVal, rowNum, xlsxCol)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.employment_status = result.value!; hasDemographics = true }
      } else if (fieldName === 'income_level') {
        const result = toEnum(IncomeLevel, strVal, rowNum, xlsxCol)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.income_level = result.value!; hasDemographics = true }
      } else if (fieldName === 'region') {
        const result = toEnum(Region, strVal, rowNum, xlsxCol)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.region = result.value!; hasDemographics = true }
      } else if (fieldName === 'has_partner') {
        demographics.has_partner = toBoolean(strVal)
        hasDemographics = true
      }
    }

    // --- Collect custom fields (any unrecognized column) ---
    const MAX_CUSTOM_FIELDS = 50
    const customFields: Record<string, string | number | boolean> = {}
    let hasCustom = false
    let customCount = 0
    for (const col of headers) {
      if (col in KNOWN_COLUMNS) continue
      if (customCount >= MAX_CUSTOM_FIELDS) break
      const val = row[col]
      if (val === undefined || val === null || String(val).trim() === '') continue
      const numVal = Number(val)
      customFields[col] = isNaN(numVal) ? String(val) : numVal
      hasCustom = true
      customCount++
    }
    if (hasCustom) {
      demographics.custom_fields = customFields
      hasDemographics = true
    }

    // --- Build Person object ---
    const lifeStoryRaw = String(row['ZivotniPribeh'] ?? '').trim()

    // Use unknown cast to avoid exactOptionalPropertyTypes issues with conditional spread;
    // Zod validation below enforces the correct shape.
    const personCandidate: unknown = {
      id: idRaw,
      age: ageRaw,
      gender: genderResult.value!,
      ...(hasDemographics ? { demographics } : {}),
      ...(lifeStoryRaw ? { life_story: lifeStoryRaw } : {}),
    }

    // Final Zod validation (catches any edge cases)
    const zodResult = PersonSchema.safeParse(personCandidate)
    if (!zodResult.success) {
      for (const issue of zodResult.error.issues) {
        errors.push({
          row: rowNum,
          message: `Řádek ${rowNum}: ${issue.message}`,
        })
      }
      continue
    }

    persons.push(zodResult.data as Person)
  }

  if (errors.length > 0 && persons.length === 0) {
    return parseFailure(errors)
  }

  // Return partial success with errors if some rows failed
  return {
    success: persons.length > 0,
    data: persons,
    errors,
  }
}
