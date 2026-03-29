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
import { parseFailure } from './parse-result.js'

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_ROWS = 10_000

type FieldName = keyof Person | keyof Demographics | 'skip'

// Map of all accepted column names (new human-readable + legacy technical) to field names
const KNOWN_COLUMNS: Record<string, FieldName> = {
  // New human-readable Czech names (preferred)
  ID: 'id',
  'Věk': 'age',
  'Pohlaví': 'gender',
  'Národnost': 'nationality',
  'Vzdělání': 'education',
  'Stav': 'marital_status',
  'Partner': 'has_partner',
  'Status': 'employment_status',
  'Příjem': 'income_level',
  'Kraj': 'region',
  'Životní příběh': 'life_story',
  // Legacy technical names (backward compatibility)
  Vek: 'age',
  Pohlavi: 'gender',
  Vzdelani: 'education',
  RodinnyStav: 'marital_status',
  MaPartnera: 'has_partner',
  ZamestnaneckyStatus: 'employment_status',
  ZaměstnaneckyStatus: 'employment_status', // legacy variant with diacritic
  PrijmoveRozpeti: 'income_level',
  ZivotniPribeh: 'life_story',
  Narodnost: 'nationality',
}


function toGender(val: string, row: number): { value?: Gender; error?: ParseError } {
  const normalized = val.trim()
  if (normalized === 'Muž' || normalized === 'Muz') return { value: Gender.MALE }
  if (normalized === 'Žena' || normalized === 'Zena') return { value: Gender.FEMALE }
  return {
    error: {
      row,
      column: 'Pohlaví',
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

// Alias maps: common alternative spellings / phrasings → canonical enum values.
// Allows importing real-world datasets that use different terminology.
const EDUCATION_ALIASES: Record<string, string> = {
  // ČSÚ / MPSV / school-registry terminology
  'základní vzdělání':                         'Základní',
  'základní (vč. neukončeného)':               'Základní',
  'neúplné základní vzdělání':                 'Základní',
  'bez vzdělání':                              'Bez vzdělání',
  'nezjištěno':                                'Nezjištěno',
  'střední bez maturity':                      'Vyučení',
  'střední bez maturity (vč. vyučení)':        'Vyučení',
  'vyučení bez maturity':                      'Vyučení',
  'střední odborné bez maturity':              'Vyučení',
  'vyučen/a':                                  'Vyučení',
  'úplné střední s maturitou':                 'S maturitou',
  'úplné střední s maturitou (vč. nástavb.)':  'S maturitou',
  'střední s maturitou':                       'S maturitou',
  'maturita':                                  'S maturitou',
  'středoškolské s maturitou':                 'S maturitou',
  'vyšší odborné (vošs)':                      'Vyšší odborné',
  'vyšší odborná škola':                       'Vyšší odborné',
  'voš':                                       'Vyšší odborné',
  'konzervatoř':                               'Vyšší odborné / konzervatoř',
  'vyšší odborné / konzervatoř':               'Vyšší odborné / konzervatoř',
  'vysokoškolské (bc.)':                       'Vysokoškolské',
  'vysokoškolské (mgr./ing. a výše)':          'Vysokoškolské',
  'vysokoškolské vzdělání':                    'Vysokoškolské',
  'vš':                                        'Vysokoškolské',
  'univerzitní':                               'Vysokoškolské',
}

const EMPLOYMENT_ALIASES: Record<string, string> = {
  'zaměstnanec/kyně':                          'Zaměstnaný/á',
  'zaměstnanec':                               'Zaměstnaný/á',
  'zaměstnaná':                                'Zaměstnaný/á',
  'zaměstnaný':                                'Zaměstnaný/á',
  'živnostník/ce':                             'Podnikatel/ka (OSVČ)',
  'osvč':                                      'Podnikatel/ka (OSVČ)',
  'podnikatel':                                'Podnikatel/ka (OSVČ)',
  'podnikatelka':                              'Podnikatel/ka (OSVČ)',
  'nezaměstnaný':                              'Nezaměstnaný/á',
  'nezaměstnaná':                              'Nezaměstnaný/á',
  'uchazeč o zaměstnání':                      'Nezaměstnaný/á',
  'student':                                   'Student/ka',
  'studentka':                                 'Student/ka',
  'žák/žákyně':                                'Student/ka',
  'v důchodu':                                 'Důchodce/kyně',
  'důchodce':                                  'Důchodce/kyně',
  'důchodkyně':                                'Důchodce/kyně',
  'starobní důchodce':                         'Důchodce/kyně',
  'starobní důchodkyně':                       'Důchodce/kyně',
  'invalidní důchodce':                        'Důchodce/kyně',
  'na mateřské':                               'Mateřská/rodičovská dovolená',
  'na rodičovské':                             'Mateřská/rodičovská dovolená',
  'mateřská dovolená':                         'Mateřská/rodičovská dovolená',
  'rodičovská dovolená':                       'Mateřská/rodičovská dovolená',
  'md/rd':                                     'Mateřská/rodičovská dovolená',
  'ekonomicky neaktivní':                        'Ekonomicky neaktivní jinak',
  'neaktivní':                                   'Ekonomicky neaktivní jinak',
}

const INCOME_ALIASES: Record<string, string> = {
  'nízký příjem':        'Nízký',
  'nízké příjmy':        'Nízký',
  'pod průměrem':        'Spíše nižší',
  'spíše nižší příjem':  'Spíše nižší',
  'průměrný příjem':     'Střední',
  'střední příjem':      'Střední',
  'průměr':              'Střední',
  'spíše vyšší příjem':  'Spíše vyšší',
  'nadprůměrný příjem':  'Spíše vyšší',
  'vysoký příjem':       'Vysoký',
  'nadprůměr':           'Vysoký',
}

const MARITAL_ALIASES: Record<string, string> = {
  'svobodný':              'Svobodný/á',
  'svobodná':              'Svobodný/á',
  'ženatý':                'Ženatý/Vdaná',
  'vdaná':                 'Ženatý/Vdaná',
  'ženatý/vdaná':          'Ženatý/Vdaná',
  'manžel/ka':             'Ženatý/Vdaná',
  'rozvedený':             'Rozvedený/á',
  'rozvedená':             'Rozvedený/á',
  'ovdovělý':              'Ovdovělý/á',
  'ovdovělá':              'Ovdovělý/á',
  'vdovec':                'Ovdovělý/á',
  'vdova':                 'Ovdovělý/á',
  'registrované partnerství': 'Registrované partnerství',
  'partner/ka':            'Registrované partnerství',
}

// Unified alias lookup: tries aliases first, then falls back to exact enum match.
function resolveAlias(aliases: Record<string, string>, val: string): string {
  return aliases[val.toLowerCase()] ?? val
}

function toEnum<T extends string>(
  enumObj: Record<string, T>,
  val: string,
  row: number,
  column: string,
  aliases?: Record<string, string>
): { value?: T; error?: ParseError } {
  const values = Object.values(enumObj) as T[]
  const normalized = aliases ? resolveAlias(aliases, val.trim()) : val.trim()
  if (values.includes(normalized as T)) return { value: normalized as T }
  return {
    error: {
      row,
      column,
      message: `Řádek ${row}: Neplatná hodnota sloupce "${column}": "${val.trim()}". Povolené hodnoty: ${values.join(', ')}`,
    },
  }
}

/**
 * Find actual header name in row for a given field name.
 * Handles both new Czech names and legacy technical names.
 */
function findColumnForField(headers: string[], fieldName: FieldName): string | undefined {
  for (const [col, fn] of Object.entries(KNOWN_COLUMNS)) {
    if (fn === fieldName && headers.includes(col)) return col
  }
  return undefined
}

/**
 * Parse a population XLSX buffer into an array of Person objects.
 * Sheet must be named "Osoby" (or first sheet).
 * Accepts both new human-readable column names (Věk, Pohlaví, etc.)
 * and legacy technical names (Vek, Pohlavi, etc.).
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

  // Detect headers
  const headers = Object.keys(rows[0] ?? {})

  // Validate required columns — each required field must have at least one accepted column name present
  const missingRequired: string[] = []
  const ageCol = findColumnForField(headers, 'age')
  const genderCol = findColumnForField(headers, 'gender')
  if (!headers.includes('ID')) missingRequired.push('ID')
  if (!ageCol) missingRequired.push('Věk (nebo Vek)')
  if (!genderCol) missingRequired.push('Pohlaví (nebo Pohlavi)')

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

    // --- Parse Věk (or legacy Vek) ---
    const ageRaw = Number(row[ageCol!])
    if (isNaN(ageRaw) || !Number.isInteger(ageRaw)) {
      rowErrors.push({ row: rowNum, column: ageCol!, message: `Řádek ${rowNum}: Sloupec "${ageCol}" musí být celé číslo` })
    } else if (ageRaw < 18 || ageRaw > 100) {
      rowErrors.push({ row: rowNum, column: ageCol!, message: `Řádek ${rowNum}: Věk musí být 18–100, nalezeno: ${ageRaw}` })
    }

    // --- Parse Pohlaví (or legacy Pohlavi) ---
    const genderResult = toGender(String(row[genderCol!] ?? ''), rowNum)
    if (genderResult.error) rowErrors.push(genderResult.error)

    if (rowErrors.length > 0) {
      errors.push(...rowErrors)
      continue
    }

    // --- Parse optional demographic fields ---
    // Resolve canonical column for each field (new name preferred over legacy) to avoid
    // double-write when both naming conventions appear in the same file.
    const demographics: Demographics = {}
    let hasDemographics = false

    // --- Parse nationality (string, default 'ČR') ---
    const nationalityCol = findColumnForField(headers, 'nationality')
    const nationalityRaw = nationalityCol ? String(row[nationalityCol] ?? '').trim() : ''
    demographics.nationality = nationalityRaw || 'ČR'
    hasDemographics = true

    const optionalFields = [
      'education', 'marital_status', 'employment_status', 'income_level', 'region', 'has_partner',
    ] as const

    for (const fieldName of optionalFields) {
      const xlsxCol = findColumnForField(headers, fieldName)
      if (!xlsxCol) continue
      const rawVal = row[xlsxCol]
      if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') continue

      const strVal = String(rawVal).trim()

      if (fieldName === 'education') {
        const result = toEnum(Education, strVal, rowNum, xlsxCol, EDUCATION_ALIASES)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.education = result.value!; hasDemographics = true }
      } else if (fieldName === 'marital_status') {
        const result = toEnum(MaritalStatus, strVal, rowNum, xlsxCol, MARITAL_ALIASES)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.marital_status = result.value!; hasDemographics = true }
      } else if (fieldName === 'employment_status') {
        const result = toEnum(EmploymentStatus, strVal, rowNum, xlsxCol, EMPLOYMENT_ALIASES)
        if (result.error) errors.push(result.error)
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        else { demographics.employment_status = result.value!; hasDemographics = true }
      } else if (fieldName === 'income_level') {
        const result = toEnum(IncomeLevel, strVal, rowNum, xlsxCol, INCOME_ALIASES)
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
    const lifeStoryCol = findColumnForField(headers, 'life_story')
    const lifeStoryRaw = lifeStoryCol ? String(row[lifeStoryCol] ?? '').trim() : ''

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
