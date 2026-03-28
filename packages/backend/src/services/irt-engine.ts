/**
 * IRT-Inspired Competence Modulation Engine (Algorithm 2)
 *
 * Uses the Item Response Theory 2-Parameter Logistic model to estimate
 * P(correct | person_ability, item_difficulty) for each person × question pair.
 * Replaces the TWO_STEP competence probe (which requires an extra LLM call)
 * with a purely computational approach at zero additional cost.
 *
 * Scientific basis:
 * - Lord (1980): IRT 2PL model
 * - Liu et al. (BJET 2025): IRT applied to LLM respondents
 * - Krosnick (1991): Satisficing as interaction of ability × task difficulty
 */

import type { Question } from '@respondex/shared'
import { QuestionType, NumeracyLevel } from '@respondex/shared'

// ── IRT Parameters ───────────────────────────────────────────────────────

export interface ItemParams {
  /** Item difficulty (b): higher = harder. Centered at 0. */
  difficulty: number
  /** Item discrimination (a): how much ability matters for this item */
  discrimination: number
}

/** Map PIAAC numeracy levels to IRT ability theta (θ ~ N(0,1)) */
export const THETA_MAP: Record<NumeracyLevel, number> = {
  [NumeracyLevel.BELOW_1]: -2.0,
  [NumeracyLevel.LEVEL_1]: -1.0,
  [NumeracyLevel.LEVEL_2]:  0.0,   // modal Czech, anchor
  [NumeracyLevel.LEVEL_3]:  0.7,
  [NumeracyLevel.LEVEL_4]:  1.5,
  [NumeracyLevel.LEVEL_5]:  2.5,
}

/**
 * Base difficulty by question type.
 *
 * Calibrated so that a modal Czech adult (PIAAC Level 2, θ≈0) has:
 *   - ~90% on YES_NO
 *   - ~65% on basic NUMBER (single-step arithmetic)
 *   - ~40% on hard NUMBER (multi-step, compound interest)
 *
 * PIAAC 2023 CZ reference: 47% correct on probability (Q01-type),
 * 65% on discount (Q02-type), 53% on fractions (Q03-type).
 */
const DIFFICULTY_BASE: Record<string, number> = {
  [QuestionType.YES_NO]:        -1.0,
  [QuestionType.SINGLE_CHOICE]:  0.0,
  [QuestionType.MULTI_CHOICE]:   0.5,
  [QuestionType.LIKERT]:        -0.5,
  [QuestionType.NUMBER]:         0.2,   // was 1.0 — far too high, caused P≈5% for average person
  [QuestionType.NPS]:           -0.3,
  [QuestionType.OPEN_TEXT]:      0.3,
  [QuestionType.RANKING]:        1.5,
  [QuestionType.SEMANTIC_DIFF]: -0.3,
  [QuestionType.MATRIX]:         0.8,
}

/** Base discrimination by question type */
const DISCRIMINATION_BASE: Record<string, number> = {
  [QuestionType.NUMBER]:         1.0,   // was 1.5 — too steep, small θ differences → huge P swings
  [QuestionType.RANKING]:        1.5,
  [QuestionType.MATRIX]:         1.0,
  [QuestionType.MULTI_CHOICE]:   0.9,
  [QuestionType.OPEN_TEXT]:      0.8,
  [QuestionType.SINGLE_CHOICE]:  0.7,
  [QuestionType.YES_NO]:         0.5,
  [QuestionType.LIKERT]:         0.5,
  [QuestionType.NPS]:            0.5,
  [QuestionType.SEMANTIC_DIFF]:  0.5,
}

/** Regex patterns for difficulty modifiers */
const NUMERIC_CONTENT = /\d+\s*%|\d+[.,]\d+/
const CONDITIONAL_NEGATION = /pokud|jestliže|kdyby|ne[bv]|kromě|s\s+výjimkou/i

// ── Core Functions ───────────────────────────────────────────────────────

/**
 * Estimate question difficulty and discrimination from question metadata.
 * No LLM call needed — purely rule-based.
 */
export function estimateQuestionDifficulty(question: Question): ItemParams {
  let b = DIFFICULTY_BASE[question.type] ?? 0.0
  const a = DISCRIMINATION_BASE[question.type] ?? 0.7

  // Difficulty modifiers based on question content.
  // Modifiers are smaller and capped so they don't stack to absurd levels.
  let modifiers = 0

  const optCount = question.options?.length ?? 0
  if (optCount > 5) modifiers += 0.2

  if (question.text.length > 200) modifiers += 0.15

  if (NUMERIC_CONTENT.test(question.text)) modifiers += 0.3

  if (CONDITIONAL_NEGATION.test(question.text)) modifiers += 0.2

  // Scale range modifier — only for non-numeric questions (NUMBER already has base difficulty)
  if (question.type !== QuestionType.NUMBER) {
    const scaleRange = (question.scale_max ?? 0) - (question.scale_min ?? 0)
    if (scaleRange > 7) modifiers += 0.15
  }

  // Cap total modifiers to prevent runaway difficulty
  b += Math.min(modifiers, 0.6)

  // For NUMBER questions with is_numeric: use correct_answer complexity as difficulty signal
  if (question.type === QuestionType.NUMBER && question.is_numeric && question.correct_answer != null) {
    // Multi-step problems (compound interest, fractions) are harder
    // Heuristic: long text + numbers in text = multi-step
    const numberCount = (question.text.match(/\d+/g) ?? []).length
    if (numberCount >= 4) b += 0.3  // compound/multi-step (e.g., Q04 compound interest)
  }

  return { difficulty: b, discrimination: a }
}

/**
 * Map PIAAC numeracy level to IRT ability theta.
 */
export function numeracyToTheta(level?: NumeracyLevel): number {
  if (!level) return 0.0 // default to Level 2 (modal Czech)
  return THETA_MAP[level] ?? 0.0
}

/**
 * IRT 2PL model: compute P(correct response) given person ability and item parameters.
 *
 * P(θ, a, b) = 1 / (1 + exp(-a × (θ - b)))
 */
export function computeCompetenceProbability(theta: number, item: ItemParams): number {
  return 1.0 / (1.0 + Math.exp(-item.discrimination * (theta - item.difficulty)))
}

/**
 * Generate a Czech-language competence hint based on IRT probability.
 * Format matches the existing extractCompetenceHint() output so it can be used
 * as a drop-in replacement in the chunk processor.
 */
export function generateIRTHint(probability: number, level?: NumeracyLevel): string {
  const levelLabel = level ?? 'neznámá'

  if (probability < 0.20) {
    return `KOMPETENCE RESPONDENTA (PIAAC ${levelLabel}, P=${Math.round(probability * 100)}%): Tento respondent s největší pravděpodobností nezvládne tuto otázku správně. Odpověď bude pravděpodobně chybná — tipuje, odpovídá prvním číslem co ho napadne, zaokrouhluje na desítky/stovky, nebo otázku nepochopí. Odpověz TAK, JAK BY ODPOVĚDĚL ON — pravděpodobně špatně.`
  }
  if (probability < 0.40) {
    return `KOMPETENCE RESPONDENTA (PIAAC ${levelLabel}, P=${Math.round(probability * 100)}%): Respondent bude mít s touto otázkou potíže. Odpověď bude pravděpodobně přibližná nebo obsahovat systematickou chybu (záměna procent s absolutními čísly, ignorování base rate, špatné zaokrouhlení).`
  }
  if (probability < 0.60) {
    return `KOMPETENCE RESPONDENTA (PIAAC ${levelLabel}, P=${Math.round(probability * 100)}%): Respondent si není jistý, ale může odpovědět přibližně správně. Očekávejte mírné nepřesnosti — zaokrouhlení, menší odchylky, ale celkový směr bude spíše správný.`
  }
  if (probability < 0.80) {
    return `KOMPETENCE RESPONDENTA (PIAAC ${levelLabel}, P=${Math.round(probability * 100)}%): Respondent pravděpodobně odpoví správně nebo téměř správně. Může se dopustit drobné nepřesnosti z nepozornosti.`
  }
  return `KOMPETENCE RESPONDENTA (PIAAC ${levelLabel}, P=${Math.round(probability * 100)}%): Respondent s velkou pravděpodobností odpoví přesně a správně.`
}
