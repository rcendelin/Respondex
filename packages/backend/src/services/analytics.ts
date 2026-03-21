/**
 * Analytics service: computes frequency tables, descriptive statistics, and cross-tabs
 * from simulation responses.
 */
import type { SimulationResponse } from '@respondex/shared'
import type { Question } from '@respondex/shared'
import type { Person } from '@respondex/shared'
import type {
  FrequencyEntry,
  FrequencyTable,
  DescriptiveStats,
  CrossTab,
  CrossTabRow,
  CrossTabCell,
  AnalyticsResult,
} from '@respondex/shared'
import { QuestionType } from '@respondex/shared'

// ── Frequency tables ───────────────────────────────────────────────────────

/**
 * Compute frequency distribution for each question.
 * Only includes valid responses.
 */
export function computeFrequencyTables(
  responses: SimulationResponse[],
  questions: Question[]
): FrequencyTable[] {
  return questions.map((question) => {
    const qResponses = responses.filter((r) => r.question_id === question.id && r.valid)

    const counts = new Map<string, number>()
    for (const r of qResponses) {
      const values = Array.isArray(r.answer) ? r.answer : [String(r.answer)]
      for (const v of values) {
        counts.set(v, (counts.get(v) ?? 0) + 1)
      }
    }

    const total = qResponses.length
    const entries: FrequencyEntry[] = []
    for (const [value, count] of counts.entries()) {
      entries.push({
        value,
        count,
        percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
      })
    }

    // Sort by count descending, then value ascending for stability
    entries.sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value)))

    return {
      question_id: question.id,
      question_text: question.text,
      total_responses: responses.filter((r) => r.question_id === question.id).length,
      valid_responses: total,
      entries,
    }
  })
}

// ── Descriptive statistics ─────────────────────────────────────────────────

const NUMERIC_TYPES = new Set<QuestionType>([
  QuestionType.LIKERT,
  QuestionType.NUMBER,
  QuestionType.NPS,
  QuestionType.SEMANTIC_DIFF,
])

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0)
}

function stdDev(values: number[], mean: number): number {
  if (values.length < 2) return 0
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (values.length - 1)
  return Math.round(Math.sqrt(variance) * 1000) / 1000
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor((p / 100) * (sorted.length - 1))
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0
}

/**
 * Compute descriptive statistics for each question.
 * Numeric questions get mean/median/SD/percentiles.
 * Categorical questions get mode (most frequent answer).
 */
export function computeDescriptiveStats(
  responses: SimulationResponse[],
  questions: Question[]
): DescriptiveStats[] {
  return questions.map((question) => {
    const qResponses = responses.filter((r) => r.question_id === question.id && r.valid)
    const n = qResponses.length

    if (NUMERIC_TYPES.has(question.type)) {
      const values = qResponses
        .map((r) => Number(r.answer))
        .filter((v) => !isNaN(v) && isFinite(v))
        .sort((a, b) => a - b)

      if (values.length === 0) {
        return { question_id: question.id, question_text: question.text, n }
      }

      const mean = Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 100) / 100
      const med = median(values)
      const sd = stdDev(values, mean)
      const min = values[0] ?? 0
      const max = values[values.length - 1] ?? 0
      const p25 = percentile(values, 25)
      const p75 = percentile(values, 75)

      // Mode: most frequent numeric value
      const numCounts = new Map<number, number>()
      for (const v of values) numCounts.set(v, (numCounts.get(v) ?? 0) + 1)
      const modeEntry = [...numCounts.entries()].sort((a, b) => b[1] - a[1])[0]
      const mode = modeEntry?.[0]

      return {
        question_id: question.id,
        question_text: question.text,
        n,
        mean,
        median: med,
        std_dev: sd,
        min,
        max,
        p25,
        p75,
        ...(mode !== undefined ? { mode } : {}),
      }
    }

    // Categorical: compute mode
    const catCounts = new Map<string, number>()
    for (const r of qResponses) {
      const values = Array.isArray(r.answer) ? r.answer : [String(r.answer)]
      for (const v of values) {
        catCounts.set(v, (catCounts.get(v) ?? 0) + 1)
      }
    }
    const modeCatEntry = [...catCounts.entries()].sort((a, b) => b[1] - a[1])[0]
    const modeCat = modeCatEntry?.[0]

    return {
      question_id: question.id,
      question_text: question.text,
      n,
      ...(modeCat !== undefined ? { mode: modeCat } : {}),
    }
  })
}

// ── Cross-tabs ─────────────────────────────────────────────────────────────

type DemographicGrouper = (person: Person) => string | undefined

const DEMOGRAPHIC_GROUPERS: Record<string, DemographicGrouper> = {
  Pohlavi: (p) => p.gender,
  Vzdelani: (p) => p.demographics?.education,
  Region: (p) => p.demographics?.region,
  Zamestnani: (p) => p.demographics?.employment_status,
  RodinnyStav: (p) => p.demographics?.marital_status,
  PrijmoveRozpeti: (p) => p.demographics?.income_level,
}

// Age groups
function ageGroup(age: number): string {
  if (age < 25) return '18–24'
  if (age < 35) return '25–34'
  if (age < 45) return '35–44'
  if (age < 55) return '45–54'
  if (age < 65) return '55–64'
  return '65+'
}

/**
 * Compute cross-tabulation of responses by demographic group.
 * @param groupBy - demographic field name (e.g. "Pohlavi", "VekovaSkupina")
 */
export function computeCrossTabs(
  responses: SimulationResponse[],
  questions: Question[],
  persons: Person[],
  groupBy: string
): CrossTab[] {
  const grouper: DemographicGrouper =
    groupBy === 'VekovaSkupina'
      ? (p) => ageGroup(p.age)
      : (DEMOGRAPHIC_GROUPERS[groupBy] ?? (() => undefined))

  // Build O(1) lookup: person_id → group value (single pass over persons)
  const personGroupMap = new Map<string, string>()
  for (const person of persons) {
    const g = grouper(person)
    if (g !== undefined) personGroupMap.set(person.id, g)
  }

  // Collect all unique group values in sorted order
  const groupValues = [...new Set(personGroupMap.values())].sort()

  return questions.map((question) => {
    const qResponses = responses.filter((r) => r.question_id === question.id && r.valid)

    // Collect all unique answer values
    const allAnswers = new Set<string>()
    for (const r of qResponses) {
      const vals = Array.isArray(r.answer) ? r.answer : [String(r.answer)]
      vals.forEach((v) => allAnswers.add(v))
    }
    const answerValues = [...allAnswers].sort()

    // Pre-group responses by group value (single pass per question)
    const responsesByGroup = new Map<string, SimulationResponse[]>()
    for (const groupValue of groupValues) responsesByGroup.set(groupValue, [])
    for (const r of qResponses) {
      const g = personGroupMap.get(r.person_id)
      if (g !== undefined) responsesByGroup.get(g)?.push(r)
    }

    const rows: CrossTabRow[] = answerValues.map((answerValue) => {
      const cells: CrossTabCell[] = groupValues.map((groupValue) => {
        const groupResponses = responsesByGroup.get(groupValue) ?? []
        const matchCount = groupResponses.filter((r) => {
          const vals = Array.isArray(r.answer) ? r.answer : [String(r.answer)]
          return vals.includes(answerValue)
        }).length
        const pct =
          groupResponses.length > 0
            ? Math.round((matchCount / groupResponses.length) * 1000) / 10
            : 0
        return { group_value: groupValue, count: matchCount, percentage: pct }
      })
      return { answer_value: answerValue, cells }
    })

    return {
      question_id: question.id,
      question_text: question.text,
      group_by: groupBy,
      rows,
    }
  })
}

// ── Full analytics computation ─────────────────────────────────────────────

/**
 * Compute complete analytics for a simulation.
 * Called by chunk processor after last chunk, or on-demand via API.
 */
export function computeAnalytics(
  simulationId: string,
  responses: SimulationResponse[],
  questions: Question[],
  persons: Person[]
): AnalyticsResult {
  const frequency_tables = computeFrequencyTables(responses, questions)
  const descriptive_stats = computeDescriptiveStats(responses, questions)
  // Default cross-tab: by gender (most commonly requested)
  const cross_tabs = computeCrossTabs(responses, questions, persons, 'Pohlavi')

  return {
    simulation_id: simulationId,
    computed_at: new Date().toISOString(),
    frequency_tables,
    descriptive_stats,
    cross_tabs,
  }
}
