/**
 * Distribution-Level Calibrated Ensemble (DLCE) — Algorithm 3
 *
 * Post-hoc calibration engine that corrects aggregate response distributions
 * after simulation completes. Does NOT modify individual LLM responses during
 * generation — works entirely on stored results.
 *
 * Scientific basis:
 * - Cao et al. (NAACL 2025): "Calibrate at the distribution level"
 * - Bisbee et al. (2024): LLM responses have ~50% of real human SD
 * - Iterative Proportional Fitting (IPF): standard survey weighting technique
 */

import type { SimulationResponse, Question, Person } from '@respondex/shared'
import { QuestionType } from '@respondex/shared'
import { numeracyToTheta } from './irt-engine.js'

// ── Types ────────────────────────────────────────────────────────────────

export interface CalibratedResponse extends SimulationResponse {
  /** Post-hoc calibrated answer (original preserved in `answer`) */
  calibrated_answer: string | number | string[]
  /** Calibration weight applied to this response */
  weight: number
}

export interface CalibrationReport {
  simulation_id: string
  calibrated_at: string
  /** Per-question calibration summary */
  questions: QuestionCalibrationSummary[]
  /** Overall statistics */
  total_responses: number
  total_calibrated: number
  mean_expansion_factor: number
}

export interface QuestionCalibrationSummary {
  question_id: string
  original_mean?: number | undefined
  calibrated_mean?: number | undefined
  original_sd?: number | undefined
  calibrated_sd?: number | undefined
  expansion_factor: number
  responses_modified: number
}

export interface CoherenceReport {
  simulation_id: string
  checked_at: string
  /** Per-question coherence check: does numeracy level correlate with answer patterns? */
  questions: QuestionCoherenceCheck[]
  overall_coherent: boolean
}

export interface QuestionCoherenceCheck {
  question_id: string
  /** Correlation between numeracy theta and numeric answer value (for numeric questions) */
  numeracy_answer_correlation?: number
  /** Whether the differentiation is in the expected direction */
  coherent: boolean
  note: string
}

// ── Variance Expansion ──────────────────────────────────────────────────

/** Expected variance ratio by question type (Bisbee et al. 2024 baseline × type factor) */
const EXPECTED_VARIANCE_RATIO: Partial<Record<QuestionType, number>> = {
  [QuestionType.YES_NO]:        0.55,
  [QuestionType.SINGLE_CHOICE]: 0.45,
  [QuestionType.MULTI_CHOICE]:  0.45,
  [QuestionType.LIKERT]:        0.40,
  [QuestionType.NUMBER]:        0.35,
  [QuestionType.NPS]:           0.42,
  [QuestionType.SEMANTIC_DIFF]: 0.40,
  [QuestionType.RANKING]:       0.50,
  [QuestionType.OPEN_TEXT]:     0.60,
  [QuestionType.MATRIX]:        0.45,
}

const NUMERIC_TYPES = new Set([
  QuestionType.LIKERT, QuestionType.NUMBER, QuestionType.NPS, QuestionType.SEMANTIC_DIFF,
])

/**
 * Apply variance expansion to simulation responses.
 * For numeric questions: pull answers away from mean proportional to distance.
 * For categorical questions: flatten distribution slightly toward uniform.
 */
export function expandVariance(
  responses: SimulationResponse[],
  questions: Question[],
): CalibratedResponse[] {
  const questionMap = new Map(questions.map((q) => [q.id, q]))
  const calibrated: CalibratedResponse[] = []

  // Group responses by question
  const byQuestion = new Map<string, SimulationResponse[]>()
  for (const r of responses) {
    if (!r.valid) {
      calibrated.push({ ...r, calibrated_answer: r.answer, weight: 1.0 })
      continue
    }
    const list = byQuestion.get(r.question_id) ?? []
    list.push(r)
    byQuestion.set(r.question_id, list)
  }

  for (const [qId, qResponses] of byQuestion) {
    const question = questionMap.get(qId)
    if (!question) {
      for (const r of qResponses) {
        calibrated.push({ ...r, calibrated_answer: r.answer, weight: 1.0 })
      }
      continue
    }

    const expectedVR = EXPECTED_VARIANCE_RATIO[question.type] ?? 0.50
    const expansionFactor = 1.0 / Math.sqrt(expectedVR)

    if (NUMERIC_TYPES.has(question.type)) {
      // Numeric expansion
      const values = qResponses.map((r) => Number(r.answer)).filter((v) => !isNaN(v))
      if (values.length === 0) {
        for (const r of qResponses) {
          calibrated.push({ ...r, calibrated_answer: r.answer, weight: 1.0 })
        }
        continue
      }

      const mean = values.reduce((s, v) => s + v, 0) / values.length
      const scaleMin = question.scale_min ?? -Infinity
      const scaleMax = question.scale_max ?? Infinity
      const isInteger = question.type === QuestionType.LIKERT ||
                        question.type === QuestionType.NPS ||
                        question.type === QuestionType.SEMANTIC_DIFF

      for (const r of qResponses) {
        const original = Number(r.answer)
        if (isNaN(original)) {
          calibrated.push({ ...r, calibrated_answer: r.answer, weight: 1.0 })
          continue
        }

        let expanded = mean + (original - mean) * expansionFactor
        expanded = Math.max(scaleMin, Math.min(scaleMax, expanded))
        if (isInteger) expanded = Math.round(expanded)

        calibrated.push({ ...r, calibrated_answer: expanded, weight: expansionFactor })
      }
    } else {
      // Categorical: no individual-level expansion, just pass through with weight
      // Distribution broadening happens at the analytics level, not per-response
      for (const r of qResponses) {
        calibrated.push({ ...r, calibrated_answer: r.answer, weight: 1.0 })
      }
    }
  }

  return calibrated
}

// ── Coherence Check ─────────────────────────────────────────────────────

/**
 * Check whether numeracy differentiation is working:
 * Do low-numeracy personas answer differently than high-numeracy personas?
 */
export function checkCoherence(
  responses: SimulationResponse[],
  questions: Question[],
  persons: Person[],
): CoherenceReport {
  const personMap = new Map(persons.map((p) => [p.id, p]))
  const questionMap = new Map(questions.map((q) => [q.id, q]))
  const checks: QuestionCoherenceCheck[] = []

  // Group by question
  const byQuestion = new Map<string, SimulationResponse[]>()
  for (const r of responses) {
    if (!r.valid) continue
    const list = byQuestion.get(r.question_id) ?? []
    list.push(r)
    byQuestion.set(r.question_id, list)
  }

  for (const [qId, qResponses] of byQuestion) {
    const question = questionMap.get(qId)
    if (!question || !NUMERIC_TYPES.has(question.type)) {
      checks.push({ question_id: qId, coherent: true, note: 'Nenumerická otázka — skip' })
      continue
    }

    // Compute correlation between numeracy theta and answer value
    const pairs: { theta: number; answer: number }[] = []
    for (const r of qResponses) {
      const person = personMap.get(r.person_id)
      if (!person) continue
      const theta = numeracyToTheta(person.demographics?.numeracy_level)
      const answer = Number(r.answer)
      if (!isNaN(answer)) pairs.push({ theta, answer })
    }

    if (pairs.length < 10) {
      checks.push({ question_id: qId, coherent: true, note: 'Nedostatek dat pro koherenční analýzu' })
      continue
    }

    // Simple Pearson correlation
    const thetas = pairs.map((p) => p.theta)
    const answers = pairs.map((p) => p.answer)
    const corr = pearsonCorr(thetas, answers)

    // For most questions, we expect some correlation (positive or negative depending on topic)
    // The key check: is the absolute correlation > 0?
    const coherent = Math.abs(corr) > 0.05

    checks.push({
      question_id: qId,
      numeracy_answer_correlation: Math.round(corr * 1000) / 1000,
      coherent,
      note: coherent
        ? `Numeracy diferenciace funguje (r=${corr.toFixed(3)})`
        : `Slabá/žádná numeracy diferenciace (r=${corr.toFixed(3)}) — zvažte vyladění promptů`,
    })
  }

  return {
    simulation_id: '',
    checked_at: new Date().toISOString(),
    questions: checks,
    overall_coherent: checks.filter((c) => !c.coherent).length < checks.length / 2,
  }
}

function pearsonCorr(x: number[], y: number[]): number {
  const n = x.length
  if (n < 2) return 0
  const mx = x.reduce((s, v) => s + v, 0) / n
  const my = y.reduce((s, v) => s + v, 0) / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) {
    const dx = (x[i] ?? 0) - mx
    const dy = (y[i] ?? 0) - my
    num += dx * dy
    dx2 += dx * dx
    dy2 += dy * dy
  }
  const den = Math.sqrt(dx2 * dy2)
  return den === 0 ? 0 : num / den
}

// ── Build Calibration Report ─────────────────────────────────────────────

export function buildCalibrationReport(
  simulationId: string,
  original: SimulationResponse[],
  calibrated: CalibratedResponse[],
  questions: Question[],
): CalibrationReport {
  const questionMap = new Map(questions.map((q) => [q.id, q]))
  const summaries: QuestionCalibrationSummary[] = []

  for (const question of questions) {
    const origQ = original.filter((r) => r.question_id === question.id && r.valid)
    const calQ = calibrated.filter((r) => r.question_id === question.id && r.valid)

    if (!NUMERIC_TYPES.has(question.type)) {
      summaries.push({
        question_id: question.id,
        expansion_factor: 1.0,
        responses_modified: 0,
      })
      continue
    }

    const origValues = origQ.map((r) => Number(r.answer)).filter((v) => !isNaN(v))
    const calValues = calQ.map((r) => Number(r.calibrated_answer)).filter((v) => !isNaN(v))

    const origMean = origValues.length > 0 ? origValues.reduce((s, v) => s + v, 0) / origValues.length : undefined
    const calMean = calValues.length > 0 ? calValues.reduce((s, v) => s + v, 0) / calValues.length : undefined
    const origSd = origValues.length > 1 ? sd(origValues) : undefined
    const calSd = calValues.length > 1 ? sd(calValues) : undefined

    const expectedVR = EXPECTED_VARIANCE_RATIO[question.type] ?? 0.50
    const ef = 1.0 / Math.sqrt(expectedVR)

    const modified = calQ.filter((r, i) => {
      const orig = origQ[i]
      return orig && r.calibrated_answer !== orig.answer
    }).length

    summaries.push({
      question_id: question.id,
      original_mean: origMean !== undefined ? Math.round(origMean * 100) / 100 : undefined,
      calibrated_mean: calMean !== undefined ? Math.round(calMean * 100) / 100 : undefined,
      original_sd: origSd !== undefined ? Math.round(origSd * 1000) / 1000 : undefined,
      calibrated_sd: calSd !== undefined ? Math.round(calSd * 1000) / 1000 : undefined,
      expansion_factor: Math.round(ef * 1000) / 1000,
      responses_modified: modified,
    })
  }

  const factors = summaries.map((s) => s.expansion_factor)
  const meanEF = factors.length > 0 ? factors.reduce((s, v) => s + v, 0) / factors.length : 1.0

  return {
    simulation_id: simulationId,
    calibrated_at: new Date().toISOString(),
    questions: summaries,
    total_responses: original.length,
    total_calibrated: calibrated.filter((r) => r.calibrated_answer !== r.answer).length,
    mean_expansion_factor: Math.round(meanEF * 1000) / 1000,
  }
}

function sd(values: number[]): number {
  const n = values.length
  if (n < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / n
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
  return Math.sqrt(variance)
}

// ── Reference Distribution Correction (Layer 2) ─────────────────────────

export interface DistributionCorrectionSummary {
  question_id: string
  has_reference: boolean
  responses_corrected: number
  original_distribution: Record<string, number>
  target_distribution: Record<string, number>
  final_distribution: Record<string, number>
}

export interface DistributionCorrectionResult {
  responses: CalibratedResponse[]
  corrections: DistributionCorrectionSummary[]
}

/**
 * Adjust response distributions to match reference_distribution on each question.
 * Randomly reassigns over-represented answers to under-represented ones.
 * Preserves total response count per question.
 */
export function applyReferenceDistributionCorrection(
  responses: SimulationResponse[],
  questions: Question[],
): DistributionCorrectionResult {
  const questionMap = new Map(questions.map(q => [q.id, q]))
  const calibrated: CalibratedResponse[] = responses.map(r => ({
    ...r,
    calibrated_answer: (r as CalibratedResponse).calibrated_answer ?? r.answer,
    weight: (r as CalibratedResponse).weight ?? 1.0,
  }))

  const corrections: DistributionCorrectionSummary[] = []

  for (const question of questions) {
    if (!question.reference_distribution || Object.keys(question.reference_distribution).length === 0) {
      corrections.push({
        question_id: question.id,
        has_reference: false,
        responses_corrected: 0,
        original_distribution: {},
        target_distribution: {},
        final_distribution: {},
      })
      continue
    }

    const refDist = question.reference_distribution
    const qResponses = calibrated.filter(r => r.question_id === question.id && r.valid)
    const N = qResponses.length
    if (N === 0) continue

    // Count current distribution
    const currentCounts: Record<string, number> = {}
    for (const r of qResponses) {
      const key = String(r.calibrated_answer)
      currentCounts[key] = (currentCounts[key] ?? 0) + 1
    }

    // Compute original proportions
    const originalDist: Record<string, number> = {}
    for (const [k, v] of Object.entries(currentCounts)) {
      originalDist[k] = Math.round((v / N) * 1000) / 1000
    }

    // Compute target counts
    const targetCounts: Record<string, number> = {}
    let assigned = 0
    const sortedEntries = Object.entries(refDist).sort((a, b) => b[1] - a[1])
    for (let i = 0; i < sortedEntries.length; i++) {
      const [key, proportion] = sortedEntries[i]!
      if (i === sortedEntries.length - 1) {
        targetCounts[key] = N - assigned // remainder to avoid rounding drift
      } else {
        targetCounts[key] = Math.round(proportion * N)
        assigned += targetCounts[key]
      }
    }

    // Find over-represented and under-represented categories
    const overRepresented: { key: string; excess: number }[] = []
    const underRepresented: { key: string; deficit: number }[] = []

    for (const [key, target] of Object.entries(targetCounts)) {
      const current = currentCounts[key] ?? 0
      if (current > target) {
        overRepresented.push({ key, excess: current - target })
      } else if (current < target) {
        underRepresented.push({ key, deficit: target - current })
      }
    }

    // Reassign: pick responses from over-represented, change to under-represented
    let correctedCount = 0
    const shuffledQResponses = [...qResponses].sort(() => Math.random() - 0.5)

    for (const over of overRepresented) {
      let remaining = over.excess
      for (const r of shuffledQResponses) {
        if (remaining <= 0) break
        if (String(r.calibrated_answer) !== over.key) continue

        // Find an under-represented category that still needs responses
        const target = underRepresented.find(u => u.deficit > 0)
        if (!target) break

        // Reassign this response
        r.calibrated_answer = isNaN(Number(target.key)) ? target.key : Number(target.key)
        r.weight = refDist[target.key]! / (originalDist[over.key] || 0.01)
        target.deficit--
        remaining--
        correctedCount++
      }
    }

    // Compute final distribution
    const finalCounts: Record<string, number> = {}
    for (const r of qResponses) {
      const key = String(r.calibrated_answer)
      finalCounts[key] = (finalCounts[key] ?? 0) + 1
    }
    const finalDist: Record<string, number> = {}
    for (const [k, v] of Object.entries(finalCounts)) {
      finalDist[k] = Math.round((v / N) * 1000) / 1000
    }

    corrections.push({
      question_id: question.id,
      has_reference: true,
      responses_corrected: correctedCount,
      original_distribution: originalDist,
      target_distribution: refDist,
      final_distribution: finalDist,
    })
  }

  return { responses: calibrated, corrections }
}
