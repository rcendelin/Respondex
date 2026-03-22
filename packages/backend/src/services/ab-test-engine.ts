/**
 * A/B Test Engine: orchestrates comparison of simulation algorithms
 * against ground truth reference distributions.
 *
 * Computes per-question and aggregate metrics (JSD, MAE, variance ratio,
 * subgroup correlation, composite fidelity score).
 */

import type {
  SimulationResponse,
  Question,
  Person,
  ABTestMetrics,
  QuestionMetric,
  AggregateMetric,
  ReferenceQuestion,
  ABTestComparison,
  PairwiseComparison,
} from '@respondex/shared'
import { QuestionType } from '@respondex/shared'
import {
  jensenShannonDivergence,
  earthMoversDistance,
  varianceRatio,
  meanAbsoluteError,
  pearsonCorrelation,
  compositeFidelityScore,
} from './distribution-metrics.js'

const NUMERIC_TYPES = new Set([
  QuestionType.LIKERT, QuestionType.NUMBER, QuestionType.NPS, QuestionType.SEMANTIC_DIFF,
])

// ── Per-question metric computation ──────────────────────────────────────

/**
 * Compute metrics for a single question given simulated responses and reference distribution.
 */
export function computeQuestionMetric(
  questionId: string,
  questionText: string,
  questionType: QuestionType,
  domain: string,
  responses: SimulationResponse[],
  reference: ReferenceQuestion,
  persons?: Person[],
): QuestionMetric {
  const validResponses = responses.filter((r) => r.question_id === questionId && r.valid)

  if (NUMERIC_TYPES.has(questionType) && reference.reference_distribution.mean !== undefined) {
    return computeNumericMetric(questionId, questionText, domain, validResponses, reference, persons)
  }

  return computeCategoricalMetric(questionId, questionText, domain, validResponses, reference, persons)
}

function computeNumericMetric(
  questionId: string,
  questionText: string,
  domain: string,
  responses: SimulationResponse[],
  reference: ReferenceQuestion,
  persons?: Person[],
): QuestionMetric {
  const values = responses.map((r) => Number(r.answer)).filter((v) => !isNaN(v))
  const refMean = reference.reference_distribution.mean ?? 0
  const refSd = reference.reference_distribution.std_dev ?? 1

  // Simulated stats
  const simMean = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
  const simSd = values.length > 1 ? sd(values) : 0

  // MAE on mean
  const mae = Math.abs(simMean - refMean) / (refSd || 1)

  // Variance ratio
  const vr = varianceRatio(simSd, refSd)

  // For JSD: bin into histogram and compare
  const scaleMin = reference.scale_min ?? 0
  const scaleMax = reference.scale_max ?? 10
  const bins = scaleMax - scaleMin + 1
  const simHist = histogram(values, scaleMin, scaleMax, bins)
  // Generate reference histogram from Normal(mean, sd)
  const refHist = normalHistogram(refMean, refSd, scaleMin, scaleMax, bins)
  const jsd = jensenShannonDivergence(simHist, refHist)

  // EMD for ordinal
  const emd = earthMoversDistance(simHist, refHist)

  // Subgroup correlation (if persons available)
  let sgc = 0
  if (persons && persons.length > 0) {
    sgc = computeSubgroupCorrelation(responses, reference, persons)
  }

  return {
    question_id: questionId,
    question_text: questionText,
    domain,
    jsd,
    mae: Math.round(mae * 1000) / 1000,
    variance_ratio: Math.round(vr * 1000) / 1000,
    subgroup_diff_correlation: Math.round(sgc * 1000) / 1000,
    emd: Math.round(emd * 1000) / 1000,
    accuracy_delta: reference.has_correct_answer
      ? Math.round(Math.abs(simMean - refMean) * 10) / 10
      : undefined,
  }
}

function computeCategoricalMetric(
  questionId: string,
  questionText: string,
  domain: string,
  responses: SimulationResponse[],
  reference: ReferenceQuestion,
  persons?: Person[],
): QuestionMetric {
  const refFreqs = reference.reference_distribution.frequencies ?? {}
  const allOptions = Object.keys(refFreqs)

  // Count simulated responses
  const counts = new Map<string, number>()
  for (const r of responses) {
    const vals = Array.isArray(r.answer) ? r.answer : [String(r.answer)]
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const total = responses.length || 1

  // Build aligned arrays
  const simDist = allOptions.map((opt) => (counts.get(opt) ?? 0) / total)
  const refDist = allOptions.map((opt) => refFreqs[opt] ?? 0)

  const jsd = jensenShannonDivergence(simDist, refDist)
  const mae = meanAbsoluteError(simDist, refDist)

  // Subgroup correlation
  let sgc = 0
  if (persons && persons.length > 0) {
    sgc = computeSubgroupCorrelation(responses, reference, persons)
  }

  return {
    question_id: questionId,
    question_text: questionText,
    domain,
    jsd: Math.round(jsd * 1000) / 1000,
    mae: Math.round(mae * 1000) / 1000,
    variance_ratio: 1.0, // not meaningful for binary/categorical
    subgroup_diff_correlation: Math.round(sgc * 1000) / 1000,
  }
}

// ── Aggregate metrics ────────────────────────────────────────────────────

export function computeAggregateMetrics(questions: QuestionMetric[]): AggregateMetric {
  if (questions.length === 0) {
    return { mean_jsd: 1, median_jsd: 1, mean_mae: 1, mean_variance_ratio: 0, mean_subgroup_correlation: 0, fidelity_score: 0 }
  }

  const jsds = questions.map((q) => q.jsd).sort((a, b) => a - b)
  const mean_jsd = avg(jsds)
  const median_jsd = jsds[Math.floor(jsds.length / 2)] ?? 0
  const mean_mae = avg(questions.map((q) => q.mae))
  const vrs = questions.map((q) => q.variance_ratio).filter((v) => v !== 1.0 || questions.length < 5)
  const mean_variance_ratio = vrs.length > 0 ? avg(vrs) : 1.0
  const mean_subgroup_correlation = avg(questions.map((q) => q.subgroup_diff_correlation))
  const fidelity = compositeFidelityScore(mean_jsd, mean_mae, mean_variance_ratio, mean_subgroup_correlation)

  return {
    mean_jsd: round3(mean_jsd),
    median_jsd: round3(median_jsd),
    mean_mae: round3(mean_mae),
    mean_variance_ratio: round3(mean_variance_ratio),
    mean_subgroup_correlation: round3(mean_subgroup_correlation),
    fidelity_score: fidelity,
  }
}

/**
 * Compute full A/B test metrics for one arm.
 */
export function computeArmMetrics(
  responses: SimulationResponse[],
  referenceQuestions: ReferenceQuestion[],
  questions: Question[],
  persons: Person[],
): ABTestMetrics {
  const questionMap = new Map(questions.map((q) => [q.id, q]))

  const perQuestion: QuestionMetric[] = referenceQuestions.map((ref) => {
    const question = questionMap.get(ref.id)
    return computeQuestionMetric(
      ref.id,
      ref.text,
      (question?.type ?? ref.type) as QuestionType,
      ref.domain,
      responses,
      ref,
      persons,
    )
  })

  return {
    per_question: perQuestion,
    aggregate: computeAggregateMetrics(perQuestion),
  }
}

/**
 * Compare multiple arms and produce pairwise comparisons and ranking.
 */
export function compareArms(
  armResults: { arm_id: string; arm_name: string; metrics: ABTestMetrics }[],
  baselineArmId: string,
): ABTestComparison {
  const baseline = armResults.find((a) => a.arm_id === baselineArmId)

  const pairwise: PairwiseComparison[] = armResults
    .filter((a) => a.arm_id !== baselineArmId)
    .map((arm) => {
      const delta = arm.metrics.aggregate.fidelity_score - (baseline?.metrics.aggregate.fidelity_score ?? 0)
      // Bootstrap CI approximation (simplified: ±1.5× per-question JSD spread)
      const jsdSpread = sd(arm.metrics.per_question.map((q) => q.jsd))
      const ci = jsdSpread * 15 // rough 95% CI half-width

      let improved = 0, tied = 0, degraded = 0
      for (let i = 0; i < arm.metrics.per_question.length; i++) {
        const armQ = arm.metrics.per_question[i]
        const baseQ = baseline?.metrics.per_question[i]
        if (!armQ || !baseQ) continue
        const diff = baseQ.jsd - armQ.jsd
        if (diff > 0.02) improved++
        else if (diff < -0.02) degraded++
        else tied++
      }

      return {
        arm_id: arm.arm_id,
        arm_name: arm.arm_name,
        baseline_arm_id: baselineArmId,
        fidelity_delta: round3(delta),
        fidelity_ci_lower: round3(delta - ci),
        fidelity_ci_upper: round3(delta + ci),
        questions_improved: improved,
        questions_tied: tied,
        questions_degraded: degraded,
      }
    })

  const ranking = armResults
    .map((a) => ({
      arm_id: a.arm_id,
      arm_name: a.arm_name,
      mean_fidelity: a.metrics.aggregate.fidelity_score,
      ci_lower: a.metrics.aggregate.fidelity_score - 5, // simplified CI
      ci_upper: a.metrics.aggregate.fidelity_score + 5,
    }))
    .sort((a, b) => b.mean_fidelity - a.mean_fidelity)

  // Find most divergent questions
  const divergent = (armResults[0]?.metrics.per_question ?? []).map((q, i) => {
    const scores: Record<string, number> = {}
    for (const arm of armResults) {
      const aq = arm.metrics.per_question[i]
      if (aq) scores[arm.arm_name] = aq.jsd
    }
    return { question_id: q.question_id, question_text: q.question_text, arm_scores: scores }
  })
    .sort((a, b) => {
      const aRange = range(Object.values(a.arm_scores))
      const bRange = range(Object.values(b.arm_scores))
      return bRange - aRange
    })
    .slice(0, 5)

  return {
    test_id: '',
    computed_at: new Date().toISOString(),
    pairwise,
    ranking,
    divergent_questions: divergent,
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function histogram(values: number[], min: number, max: number, bins: number): number[] {
  const hist = new Array(bins).fill(0) as number[]
  const total = values.length || 1
  for (const v of values) {
    const idx = Math.max(0, Math.min(bins - 1, Math.round(v - min)))
    hist[idx] = (hist[idx] ?? 0) + 1
  }
  return hist.map((c) => c / total)
}

function normalHistogram(mean: number, stdDev: number, min: number, max: number, bins: number): number[] {
  const hist = new Array(bins).fill(0) as number[]
  let total = 0
  for (let i = 0; i < bins; i++) {
    const x = min + i
    const z = (x - mean) / (stdDev || 1)
    const p = Math.exp(-0.5 * z * z) / (stdDev * Math.sqrt(2 * Math.PI))
    hist[i] = p
    total += p
  }
  return total > 0 ? hist.map((p) => p / total) : hist
}

function computeSubgroupCorrelation(
  responses: SimulationResponse[],
  reference: ReferenceQuestion,
  persons: Person[],
): number {
  if (!reference.subgroup_distributions) return 0

  const personMap = new Map(persons.map((p) => [p.id, p]))
  const subgroups = Object.keys(reference.subgroup_distributions)
  if (subgroups.length < 2) return 0

  const simMeans: number[] = []
  const refMeans: number[] = []

  for (const sg of subgroups) {
    const refDist = reference.subgroup_distributions[sg]
    if (!refDist?.mean) continue

    // Find simulated responses for this subgroup
    const sgResponses = responses.filter((r) => {
      const p = personMap.get(r.person_id)
      if (!p) return false
      return String(p.gender) === sg || String(p.demographics?.education) === sg
    })

    if (sgResponses.length < 5) continue

    const vals = sgResponses.map((r) => Number(r.answer)).filter((v) => !isNaN(v))
    if (vals.length === 0) continue

    simMeans.push(vals.reduce((s, v) => s + v, 0) / vals.length)
    refMeans.push(refDist.mean)
  }

  return pearsonCorrelation(simMeans, refMeans)
}

function sd(values: number[]): number {
  if (values.length < 2) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  return Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1))
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function range(values: number[]): number {
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
