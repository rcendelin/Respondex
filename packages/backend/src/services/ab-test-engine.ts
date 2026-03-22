/**
 * A/B Test Engine: compares simulation algorithms by analyzing response
 * distributions across arms (variance modes).
 *
 * Two modes:
 * 1. Reference mode: if questionnaire questions match reference IDs,
 *    compare against known Czech population distributions (ESS/CVVM).
 * 2. Inter-arm mode: compare arms against each other using the first arm
 *    (baseline) as reference. Measures variance, distribution differences.
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
  varianceRatio as computeVR,
  meanAbsoluteError,
  pearsonCorrelation,
  compositeFidelityScore,
} from './distribution-metrics.js'

const NUMERIC_TYPES = new Set([
  QuestionType.LIKERT, QuestionType.NUMBER, QuestionType.NPS, QuestionType.SEMANTIC_DIFF,
])

// ── Inter-arm comparison (no ground truth needed) ────────────────────────

/**
 * Compute per-question metrics for one arm by comparing its response
 * distribution against a baseline arm's distribution.
 */
function computeInterArmQuestionMetric(
  question: Question,
  armResponses: SimulationResponse[],
  baselineResponses: SimulationResponse[],
): QuestionMetric {
  const armValid = armResponses.filter((r) => r.question_id === question.id && r.valid)
  const baseValid = baselineResponses.filter((r) => r.question_id === question.id && r.valid)

  if (NUMERIC_TYPES.has(question.type)) {
    const armVals = armValid.map((r) => Number(r.answer)).filter((v) => !isNaN(v))
    const baseVals = baseValid.map((r) => Number(r.answer)).filter((v) => !isNaN(v))

    const armMean = armVals.length > 0 ? avg(armVals) : 0
    const baseMean = baseVals.length > 0 ? avg(baseVals) : 0
    const armSd = armVals.length > 1 ? sd(armVals) : 0
    const baseSd = baseVals.length > 1 ? sd(baseVals) : 0

    // Histogram comparison
    const scaleMin = question.scale_min ?? Math.min(...armVals, ...baseVals, 0)
    const scaleMax = question.scale_max ?? Math.max(...armVals, ...baseVals, 10)
    const bins = Math.max(2, Math.min(scaleMax - scaleMin + 1, 20))
    const armHist = histogram(armVals, scaleMin, scaleMax, bins)
    const baseHist = histogram(baseVals, scaleMin, scaleMax, bins)

    const jsd = jensenShannonDivergence(armHist, baseHist)
    const mae = baseSd > 0 ? Math.abs(armMean - baseMean) / baseSd : Math.abs(armMean - baseMean)
    const vr = computeVR(armSd, baseSd)
    const emd = earthMoversDistance(armHist, baseHist)

    return {
      question_id: question.id,
      question_text: question.text,
      domain: 'simulation',
      jsd: round3(jsd),
      mae: round3(mae),
      variance_ratio: round3(vr),
      subgroup_diff_correlation: 0,
      emd: round3(emd),
    }
  }

  // Categorical
  const allOptions = new Set<string>()
  for (const r of [...armValid, ...baseValid]) {
    const vals = Array.isArray(r.answer) ? r.answer : [String(r.answer)]
    vals.forEach((v) => allOptions.add(v))
  }
  const options = [...allOptions].sort()

  const armCounts = countAnswers(armValid)
  const baseCounts = countAnswers(baseValid)
  const armTotal = armValid.length || 1
  const baseTotal = baseValid.length || 1

  const armDist = options.map((o) => (armCounts.get(o) ?? 0) / armTotal)
  const baseDist = options.map((o) => (baseCounts.get(o) ?? 0) / baseTotal)

  const jsd = jensenShannonDivergence(armDist, baseDist)
  const mae = meanAbsoluteError(armDist, baseDist)

  return {
    question_id: question.id,
    question_text: question.text,
    domain: 'simulation',
    jsd: round3(jsd),
    mae: round3(mae),
    variance_ratio: 1.0,
    subgroup_diff_correlation: 0,
  }
}

/**
 * Compute arm metrics by comparing against baseline arm's distribution.
 */
export function computeArmMetricsInterArm(
  armResponses: SimulationResponse[],
  baselineResponses: SimulationResponse[],
  questions: Question[],
): ABTestMetrics {
  const perQuestion: QuestionMetric[] = questions.map((q) =>
    computeInterArmQuestionMetric(q, armResponses, baselineResponses)
  )

  return {
    per_question: perQuestion,
    aggregate: computeAggregateMetrics(perQuestion),
  }
}

// ── Reference-based comparison (with ground truth) ───────────────────────

export function computeArmMetricsWithReference(
  responses: SimulationResponse[],
  referenceQuestions: ReferenceQuestion[],
  questions: Question[],
  persons: Person[],
): ABTestMetrics {
  const questionMap = new Map(questions.map((q) => [q.id, q]))

  // Only use reference questions that exist in the questionnaire
  const matched = referenceQuestions.filter((ref) => questionMap.has(ref.id))
  if (matched.length === 0) return { per_question: [], aggregate: emptyAggregate() }

  const perQuestion: QuestionMetric[] = matched.map((ref) => {
    const question = questionMap.get(ref.id)!
    return computeReferenceQuestionMetric(question, responses, ref, persons)
  })

  return {
    per_question: perQuestion,
    aggregate: computeAggregateMetrics(perQuestion),
  }
}

function computeReferenceQuestionMetric(
  question: Question,
  responses: SimulationResponse[],
  reference: ReferenceQuestion,
  persons: Person[],
): QuestionMetric {
  const valid = responses.filter((r) => r.question_id === question.id && r.valid)

  if (NUMERIC_TYPES.has(question.type) && reference.reference_distribution.mean !== undefined) {
    const values = valid.map((r) => Number(r.answer)).filter((v) => !isNaN(v))
    const refMean = reference.reference_distribution.mean
    const refSd = reference.reference_distribution.std_dev ?? 1

    const simMean = values.length > 0 ? avg(values) : 0
    const simSd = values.length > 1 ? sd(values) : 0
    const mae = refSd > 0 ? Math.abs(simMean - refMean) / refSd : Math.abs(simMean - refMean)
    const vr = computeVR(simSd, refSd)

    const scaleMin = question.scale_min ?? 0
    const scaleMax = question.scale_max ?? 10
    const bins = scaleMax - scaleMin + 1
    const simHist = histogram(values, scaleMin, scaleMax, bins)
    const refHist = normalHistogram(refMean, refSd, scaleMin, scaleMax, bins)
    const jsd = jensenShannonDivergence(simHist, refHist)
    const emd = earthMoversDistance(simHist, refHist)

    return {
      question_id: question.id, question_text: question.text, domain: reference.domain,
      jsd: round3(jsd), mae: round3(mae), variance_ratio: round3(vr),
      subgroup_diff_correlation: 0, emd: round3(emd),
    }
  }

  // Categorical
  const refFreqs = reference.reference_distribution.frequencies ?? {}
  const allOptions = Object.keys(refFreqs)
  const counts = countAnswers(valid)
  const total = valid.length || 1
  const simDist = allOptions.map((o) => (counts.get(o) ?? 0) / total)
  const refDist = allOptions.map((o) => refFreqs[o] ?? 0)
  const jsd = jensenShannonDivergence(simDist, refDist)
  const mae = meanAbsoluteError(simDist, refDist)

  return {
    question_id: question.id, question_text: question.text, domain: reference.domain,
    jsd: round3(jsd), mae: round3(mae), variance_ratio: 1.0, subgroup_diff_correlation: 0,
  }
}

// ── Aggregate metrics ────────────────────────────────────────────────────

export function computeAggregateMetrics(questions: QuestionMetric[]): AggregateMetric {
  if (questions.length === 0) return emptyAggregate()

  const jsds = questions.map((q) => q.jsd).sort((a, b) => a - b)
  const mean_jsd = avg(jsds)
  const median_jsd = jsds[Math.floor(jsds.length / 2)] ?? 0
  const mean_mae = avg(questions.map((q) => q.mae))
  const vrs = questions.map((q) => q.variance_ratio).filter((v) => v !== 1.0)
  const mean_variance_ratio = vrs.length > 0 ? avg(vrs) : 1.0
  const mean_sgc = avg(questions.map((q) => q.subgroup_diff_correlation))
  const fidelity = compositeFidelityScore(mean_jsd, mean_mae, mean_variance_ratio, mean_sgc)

  return {
    mean_jsd: round3(mean_jsd),
    median_jsd: round3(median_jsd),
    mean_mae: round3(mean_mae),
    mean_variance_ratio: round3(mean_variance_ratio),
    mean_subgroup_correlation: round3(mean_sgc),
    fidelity_score: fidelity,
  }
}

function emptyAggregate(): AggregateMetric {
  return { mean_jsd: 1, median_jsd: 1, mean_mae: 1, mean_variance_ratio: 0, mean_subgroup_correlation: 0, fidelity_score: 0 }
}

// ── Main comparison orchestrator ─────────────────────────────────────────

/**
 * Compare arms. Uses reference questions if any match the questionnaire,
 * otherwise falls back to inter-arm comparison.
 */
export function computeAndCompareArms(
  armData: { arm_id: string; arm_name: string; responses: SimulationResponse[] }[],
  questions: Question[],
  persons: Person[],
  referenceQuestions: ReferenceQuestion[],
  baselineArmId: string,
): { armMetrics: { arm_id: string; arm_name: string; metrics: ABTestMetrics }[]; comparison: ABTestComparison } {

  const questionIds = new Set(questions.map((q) => q.id))
  const matchedRefs = referenceQuestions.filter((r) => questionIds.has(r.id))
  const hasReferenceMatch = matchedRefs.length >= 2

  const baselineArm = armData.find((a) => a.arm_id === baselineArmId) ?? armData[0]
  if (!baselineArm) throw new Error('No baseline arm found')

  const armMetrics = armData.map((arm) => {
    let metrics: ABTestMetrics

    if (hasReferenceMatch) {
      metrics = computeArmMetricsWithReference(arm.responses, matchedRefs, questions, persons)
    } else {
      // Inter-arm: baseline gets perfect scores (comparing with itself)
      if (arm.arm_id === baselineArm.arm_id) {
        metrics = {
          per_question: questions.map((q) => ({
            question_id: q.id, question_text: q.text, domain: 'simulation',
            jsd: 0, mae: 0, variance_ratio: 1.0, subgroup_diff_correlation: 1.0,
          })),
          aggregate: { mean_jsd: 0, median_jsd: 0, mean_mae: 0, mean_variance_ratio: 1, mean_subgroup_correlation: 1, fidelity_score: 100 },
        }
      } else {
        metrics = computeArmMetricsInterArm(arm.responses, baselineArm.responses, questions)
      }
    }

    return { arm_id: arm.arm_id, arm_name: arm.arm_name, metrics }
  })

  const comparison = buildComparison(armMetrics, baselineArm.arm_id)
  return { armMetrics, comparison }
}

function buildComparison(
  armResults: { arm_id: string; arm_name: string; metrics: ABTestMetrics }[],
  baselineArmId: string,
): ABTestComparison {
  const baseline = armResults.find((a) => a.arm_id === baselineArmId)

  const pairwise: PairwiseComparison[] = armResults
    .filter((a) => a.arm_id !== baselineArmId)
    .map((arm) => {
      const delta = arm.metrics.aggregate.fidelity_score - (baseline?.metrics.aggregate.fidelity_score ?? 0)
      const jsdSpread = sd(arm.metrics.per_question.map((q) => q.jsd))
      const ci = jsdSpread * 15

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
        arm_id: arm.arm_id, arm_name: arm.arm_name, baseline_arm_id: baselineArmId,
        fidelity_delta: round3(delta),
        fidelity_ci_lower: round3(delta - ci), fidelity_ci_upper: round3(delta + ci),
        questions_improved: improved, questions_tied: tied, questions_degraded: degraded,
      }
    })

  const ranking = armResults
    .map((a) => ({
      arm_id: a.arm_id, arm_name: a.arm_name,
      mean_fidelity: a.metrics.aggregate.fidelity_score,
      ci_lower: a.metrics.aggregate.fidelity_score - 5,
      ci_upper: a.metrics.aggregate.fidelity_score + 5,
    }))
    .sort((a, b) => b.mean_fidelity - a.mean_fidelity)

  const divergent = (armResults[0]?.metrics.per_question ?? []).map((q, i) => {
    const scores: Record<string, number> = {}
    for (const arm of armResults) {
      const aq = arm.metrics.per_question[i]
      if (aq) scores[arm.arm_name] = aq.jsd
    }
    return { question_id: q.question_id, question_text: q.question_text, arm_scores: scores }
  })
    .sort((a, b) => rangeOf(Object.values(b.arm_scores)) - rangeOf(Object.values(a.arm_scores)))
    .slice(0, 5)

  return { test_id: '', computed_at: new Date().toISOString(), pairwise, ranking, divergent_questions: divergent }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function countAnswers(responses: SimulationResponse[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const r of responses) {
    const vals = Array.isArray(r.answer) ? r.answer : [String(r.answer)]
    for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return counts
}

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
    const p = Math.exp(-0.5 * z * z) / ((stdDev || 1) * Math.sqrt(2 * Math.PI))
    hist[i] = p
    total += p
  }
  return total > 0 ? hist.map((p) => p / total) : hist
}

function sd(values: number[]): number {
  if (values.length < 2) return 0
  const m = avg(values)
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1))
}

function avg(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0
}

function rangeOf(values: number[]): number {
  if (values.length === 0) return 0
  return Math.max(...values) - Math.min(...values)
}

function round3(v: number): number {
  return Math.round(v * 1000) / 1000
}
