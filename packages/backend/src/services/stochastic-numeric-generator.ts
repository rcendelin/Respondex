/**
 * Stochastic Numeric Answer Generator
 *
 * Bypasses LLM for questions with a known correct answer (is_numeric=true).
 * Uses the person's continuous PIAAC score to compute P(correct) via IRT 2PL,
 * then generates realistic error patterns matching real-world distributions.
 *
 * Motivation: LLMs answer math questions with SD=0 (100% accuracy),
 * while real Czech population (PIAAC 2023) has 35–53% error rates on
 * basic numeracy. This module produces human-like variance.
 */

import type { Question, ErrorAttractor } from '@respondex/shared'
import { NumeracyLevel } from '@respondex/shared'
import { computeCompetenceProbability, type ItemParams } from './irt-engine.js'
import { resolveAttractors } from './attractor-detector.js'

// ── Types ────────────────────────────────────────────────────────────────

export enum ErrorType {
  CORRECT = 'correct',
  ATTRACTOR = 'attractor',
  ROUNDING = 'rounding',
  MAGNITUDE = 'magnitude',
  COMPLEMENT = 'complement',
  RANDOM_GUESS = 'random_guess',
  ANCHOR = 'anchor',
  DONT_KNOW = 'dont_know',
}

export interface StochasticResult {
  answer: number
  errorType: ErrorType
  /** If errorType is ATTRACTOR, which attractor was selected */
  attractorLabel?: string
}

// ── Error type probabilities by competence tier ──────────────────────────

interface ErrorWeights {
  [ErrorType.ROUNDING]: number
  [ErrorType.MAGNITUDE]: number
  [ErrorType.COMPLEMENT]: number
  [ErrorType.RANDOM_GUESS]: number
  [ErrorType.ANCHOR]: number
  [ErrorType.DONT_KNOW]: number
}

/** Low competence: Below 1, Level 1 (PIAAC score < 226) */
const ERROR_WEIGHTS_LOW: ErrorWeights = {
  [ErrorType.ROUNDING]: 0.15,
  [ErrorType.MAGNITUDE]: 0.25,
  [ErrorType.COMPLEMENT]: 0.20,
  [ErrorType.RANDOM_GUESS]: 0.25,
  [ErrorType.ANCHOR]: 0.05,
  [ErrorType.DONT_KNOW]: 0.10,
}

/** Medium competence: Level 2 (PIAAC score 226–276) */
const ERROR_WEIGHTS_MID: ErrorWeights = {
  [ErrorType.ROUNDING]: 0.35,
  [ErrorType.MAGNITUDE]: 0.15,
  [ErrorType.COMPLEMENT]: 0.25,
  [ErrorType.RANDOM_GUESS]: 0.10,
  [ErrorType.ANCHOR]: 0.10,
  [ErrorType.DONT_KNOW]: 0.05,
}

/** High competence: Level 3+ (PIAAC score > 276) */
const ERROR_WEIGHTS_HIGH: ErrorWeights = {
  [ErrorType.ROUNDING]: 0.50,
  [ErrorType.MAGNITUDE]: 0.05,
  [ErrorType.COMPLEMENT]: 0.30,
  [ErrorType.RANDOM_GUESS]: 0.00,
  [ErrorType.ANCHOR]: 0.15,
  [ErrorType.DONT_KNOW]: 0.00,
}

// ── Main function ────────────────────────────────────────────────────────

/**
 * Generate a stochastic numeric answer based on person's PIAAC score
 * and question difficulty. Completely bypasses LLM.
 */
export function generateStochasticAnswer(
  piaacScore: number,
  question: Question,
  itemParams: ItemParams,
): StochasticResult {
  const correctAnswer = question.correct_answer!
  const theta = piaacScoreToTheta(piaacScore)
  const pCorrect = computeCompetenceProbability(theta, itemParams)

  // Roll correct/incorrect
  if (Math.random() < pCorrect) {
    return { answer: correctAnswer, errorType: ErrorType.CORRECT }
  }

  // Try attractor-based error generation first
  const attractors = resolveAttractors(question)
  if (attractors.length > 0) {
    return generateAttractorAnswer(correctAnswer, question, piaacScore, attractors)
  }

  // Fallback: generic error system (for questions without detectable pattern)
  return generateIncorrectAnswer(correctAnswer, question, piaacScore)
}

/**
 * Convert continuous PIAAC score (0–500) to IRT theta.
 * Centered on Czech mean (267), using within-group SD (~48 points per level).
 */
export function piaacScoreToTheta(score: number): number {
  return (score - 267) / 48
}

// ── Attractor-based error generation ─────────────────────────────────────

type CompetenceTier = 'low' | 'mid' | 'high'

function getTier(piaacScore: number): CompetenceTier {
  if (piaacScore < 226) return 'low'
  if (piaacScore < 276) return 'mid'
  return 'high'
}

function weightedSample(attractors: ErrorAttractor[]): ErrorAttractor {
  const totalWeight = attractors.reduce((s, a) => s + (a.weight ?? 1), 0)
  let r = Math.random() * totalWeight
  for (const a of attractors) {
    r -= (a.weight ?? 1)
    if (r <= 0) return a
  }
  return attractors[attractors.length - 1]!
}

function generateAttractorAnswer(
  correctAnswer: number,
  question: Question,
  piaacScore: number,
  attractors: ErrorAttractor[],
): StochasticResult {
  const tier = getTier(piaacScore)
  const applicable = attractors.filter(
    a => !a.tiers || a.tiers.length === 0 || a.tiers.includes(tier),
  )

  if (applicable.length === 0) {
    // No attractors for this tier — fall back to generic
    return generateIncorrectAnswer(correctAnswer, question, piaacScore)
  }

  const selected = weightedSample(applicable)

  // Apply ±2% jitter so answers aren't identical across respondents
  const jitter = 1 + (Math.random() - 0.5) * 0.04
  let answer = selected.value * jitter
  answer = roundToReasonablePrecision(answer, correctAnswer)

  const scaleMin = question.scale_min ?? 0
  const scaleMax = question.scale_max ?? correctAnswer * 10
  answer = Math.max(scaleMin, Math.min(scaleMax, answer))

  // Ensure different from correct
  if (answer === correctAnswer) {
    const offset = correctAnswer > 0 ? Math.ceil(correctAnswer * 0.05) : 1
    answer = Math.max(scaleMin, Math.min(scaleMax, correctAnswer + offset))
  }

  return { answer, errorType: ErrorType.ATTRACTOR, attractorLabel: selected.label }
}

// ── Generic incorrect answer generation (fallback) ───────────────────────

function generateIncorrectAnswer(
  correctAnswer: number,
  question: Question,
  piaacScore: number,
): StochasticResult {
  const weights = getErrorWeights(piaacScore)
  const errorType = sampleErrorType(weights)
  const scaleMin = question.scale_min ?? 0
  const scaleMax = question.scale_max ?? correctAnswer * 10

  // Compute a "reasonable" error range around the correct answer.
  // The full scale_max (e.g., 1,000,000 for Q01) produces absurd errors
  // like 999,900 or 500,000. Real humans err within ~5× of the correct answer.
  const reasonableRange = computeReasonableErrorRange(correctAnswer, scaleMin, scaleMax)

  let answer: number

  switch (errorType) {
    case ErrorType.ROUNDING:
      answer = generateRoundingError(correctAnswer)
      break
    case ErrorType.MAGNITUDE:
      answer = generateMagnitudeError(correctAnswer)
      break
    case ErrorType.COMPLEMENT:
      answer = generateComplementError(correctAnswer, question.text)
      break
    case ErrorType.RANDOM_GUESS:
      answer = generateRandomGuess(reasonableRange.min, reasonableRange.max)
      break
    case ErrorType.ANCHOR:
      answer = generateAnchorError(question.text, correctAnswer, reasonableRange.min, reasonableRange.max)
      break
    case ErrorType.DONT_KNOW:
      answer = generateDontKnow(reasonableRange.min, reasonableRange.max)
      break
    default:
      answer = generateRoundingError(correctAnswer)
  }

  // Clamp to actual scale bounds (not reasonable range — some errors like MAGNITUDE can exceed it)
  answer = Math.max(scaleMin, Math.min(scaleMax, answer))
  answer = roundToReasonablePrecision(answer, correctAnswer)

  // Ensure incorrect answer differs from correct
  if (answer === correctAnswer) {
    const offset = correctAnswer > 0 ? Math.ceil(correctAnswer * 0.1) : 1
    answer = Math.max(scaleMin, Math.min(scaleMax, correctAnswer + offset))
  }

  return { answer, errorType }
}

/**
 * Compute a reasonable error range for random/anchor/don't-know errors.
 * Real humans don't guess uniformly across [0, 1,000,000] — they stay
 * within a plausible neighborhood of the correct answer.
 */
function computeReasonableErrorRange(
  correctAnswer: number,
  scaleMin: number,
  scaleMax: number,
): { min: number; max: number } {
  const magnitude = Math.abs(correctAnswer) || 1
  // Reasonable range: correct ± 3× magnitude, but at least 20% of scale
  const halfRange = Math.max(magnitude * 3, (scaleMax - scaleMin) * 0.1)
  return {
    min: Math.max(scaleMin, correctAnswer - halfRange),
    max: Math.min(scaleMax, correctAnswer + halfRange),
  }
}

// ── Error generators ─────────────────────────────────────────────────────

function generateRoundingError(correctAnswer: number): number {
  const magnitude = Math.abs(correctAnswer) || 1
  let roundTo: number
  if (magnitude >= 1000) roundTo = 100
  else if (magnitude >= 100) roundTo = 50
  else if (magnitude >= 10) roundTo = 10
  else roundTo = 5

  // Round to nearest multiple, then add small noise
  const rounded = Math.round(correctAnswer / roundTo) * roundTo
  const noise = (Math.random() - 0.5) * roundTo * 0.5
  return rounded + noise
}

function generateMagnitudeError(correctAnswer: number): number {
  // Off by a factor of 10 (either direction)
  if (correctAnswer === 0) return Math.random() < 0.5 ? 10 : -10
  return Math.random() < 0.5 ? correctAnswer * 10 : correctAnswer / 10
}

function generateComplementError(
  correctAnswer: number,
  questionText: string,
): number {
  // For percentage/discount questions: confuse "discount amount" with "final price"
  // E.g., 50% off 300 = 150 correct → return 150 (the discount amount = same, but we
  // can try base - correct or confuse proportions)
  const percentMatch = questionText.match(/(\d+)\s*%/)
  const baseMatch = questionText.match(/(\d+)\s*(?:Kč|kč|korun|CZK)/i)

  if (percentMatch && baseMatch) {
    const percent = parseInt(percentMatch[1]!, 10)
    const base = parseInt(baseMatch[1]!, 10)
    const discountAmount = base * percent / 100
    const finalPrice = base - discountAmount
    // Return the "other" answer
    if (Math.abs(correctAnswer - finalPrice) < 1) return discountAmount
    if (Math.abs(correctAnswer - discountAmount) < 1) return finalPrice
    // Fallback: return the base value (common confusion)
    return base
  }

  // For fraction questions (e.g., "2/3 of X = 6000, find X"):
  // Common error: multiply instead of divide, or vice versa
  const fractionMatch = questionText.match(/(\d+)\s*\/\s*(\d+)/)
  if (fractionMatch) {
    const num = parseInt(fractionMatch[1]!, 10)
    const den = parseInt(fractionMatch[2]!, 10)
    // If correct = base / (num/den), common error is base * (num/den)
    return Math.round(correctAnswer * (num / den) * (num / den))
  }

  // Generic complement: use the correct answer's "inverse" within a plausible range
  // E.g., for probability 100 out of 1000, return 900 (complement to 1000)
  // Extract the largest round number from the question as the "whole"
  const numbers = (questionText.match(/\d+/g) ?? [])
    .map(Number)
    .filter(n => n > correctAnswer && n <= correctAnswer * 20)
    .sort((a, b) => a - b)

  if (numbers.length > 0) {
    // Complement relative to the most likely "whole" number
    return numbers[0]! - correctAnswer
  }

  // Last resort: off by a factor that makes sense (e.g., ×2 or ÷2)
  return Math.random() < 0.5
    ? Math.round(correctAnswer * 2)
    : Math.round(correctAnswer / 2)
}

function generateRandomGuess(scaleMin: number, scaleMax: number): number {
  const range = scaleMax - scaleMin
  // Bias toward round numbers
  const roundTo = range >= 100 ? 10 : range >= 10 ? 5 : 1
  const raw = scaleMin + Math.random() * range
  return Math.round(raw / roundTo) * roundTo
}

function generateAnchorError(
  questionText: string,
  correctAnswer: number,
  scaleMin: number,
  scaleMax: number,
): number {
  // Extract salient numbers from question text
  const numbers = extractSalientNumbers(questionText)
    .filter((n) => n !== correctAnswer && n >= scaleMin && n <= scaleMax)

  if (numbers.length > 0) {
    return numbers[Math.floor(Math.random() * numbers.length)]!
  }

  // Fallback: return a number near correct answer
  return correctAnswer * (0.8 + Math.random() * 0.4)
}

function generateDontKnow(rangeMin: number, rangeMax: number): number {
  // "Don't know" respondents pick round numbers or 0
  // Using the reasonable range (not full scale), this produces sensible values
  if (Math.random() < 0.3) return 0
  // Pick a round number within the reasonable range
  const mid = (rangeMin + rangeMax) / 2
  const magnitude = Math.max(Math.abs(mid), 1)
  const roundTo = magnitude >= 1000 ? 1000 : magnitude >= 100 ? 100 : magnitude >= 10 ? 10 : 1
  return Math.round(mid / roundTo) * roundTo
}

// ── Helpers ──────────────────────────────────────────────────────────────

function getErrorWeights(piaacScore: number): ErrorWeights {
  if (piaacScore < 226) return ERROR_WEIGHTS_LOW
  if (piaacScore < 276) return ERROR_WEIGHTS_MID
  return ERROR_WEIGHTS_HIGH
}

function sampleErrorType(weights: ErrorWeights): ErrorType {
  const entries = Object.entries(weights) as [ErrorType, number][]
  const rand = Math.random()
  let cumulative = 0
  for (const [type, weight] of entries) {
    cumulative += weight
    if (rand < cumulative) return type
  }
  return ErrorType.ROUNDING
}

/** Extract numbers from Czech question text */
function extractSalientNumbers(text: string): number[] {
  const matches = text.match(/\d+(?:[.,]\d+)?/g)
  if (!matches) return []
  return [...new Set(matches.map((m) => parseFloat(m.replace(',', '.'))))]
    .filter((n) => !isNaN(n))
}

/** Round answer to precision matching the correct answer's magnitude */
function roundToReasonablePrecision(answer: number, correctAnswer: number): number {
  const magnitude = Math.abs(correctAnswer) || 1
  if (magnitude >= 100) return Math.round(answer)
  if (magnitude >= 10) return Math.round(answer * 10) / 10
  return Math.round(answer * 100) / 100
}
