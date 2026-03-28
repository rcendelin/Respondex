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

import type { Question } from '@respondex/shared'
import { NumeracyLevel } from '@respondex/shared'
import { computeCompetenceProbability, type ItemParams } from './irt-engine.js'

// ── Types ────────────────────────────────────────────────────────────────

export enum ErrorType {
  CORRECT = 'correct',
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
    return generateCorrectAnswer(correctAnswer, piaacScore)
  }

  return generateIncorrectAnswer(correctAnswer, question, piaacScore)
}

/**
 * Convert continuous PIAAC score (0–500) to IRT theta.
 * Centered on Czech mean (267), using within-group SD (~48 points per level).
 */
export function piaacScoreToTheta(score: number): number {
  return (score - 267) / 48
}

// ── Correct answer generation ────────────────────────────────────────────

function generateCorrectAnswer(correctAnswer: number, piaacScore: number): StochasticResult {
  // High-competence persons answer precisely; lower ones may have small noise
  const noiseScale = piaacScore >= 276 ? 0.005 : 0.02
  const noise = (Math.random() - 0.5) * 2 * noiseScale * Math.abs(correctAnswer || 1)
  let answer = correctAnswer + noise

  // Round to reasonable precision based on answer magnitude
  answer = roundToReasonablePrecision(answer, correctAnswer)

  return { answer, errorType: ErrorType.CORRECT }
}

// ── Incorrect answer generation ──────────────────────────────────────────

function generateIncorrectAnswer(
  correctAnswer: number,
  question: Question,
  piaacScore: number,
): StochasticResult {
  const weights = getErrorWeights(piaacScore)
  const errorType = sampleErrorType(weights)
  const scaleMin = question.scale_min ?? 0
  const scaleMax = question.scale_max ?? correctAnswer * 10

  let answer: number

  switch (errorType) {
    case ErrorType.ROUNDING:
      answer = generateRoundingError(correctAnswer)
      break
    case ErrorType.MAGNITUDE:
      answer = generateMagnitudeError(correctAnswer)
      break
    case ErrorType.COMPLEMENT:
      answer = generateComplementError(correctAnswer, scaleMin, scaleMax, question.text)
      break
    case ErrorType.RANDOM_GUESS:
      answer = generateRandomGuess(scaleMin, scaleMax)
      break
    case ErrorType.ANCHOR:
      answer = generateAnchorError(question.text, correctAnswer, scaleMin, scaleMax)
      break
    case ErrorType.DONT_KNOW:
      answer = generateDontKnow(scaleMin, scaleMax)
      break
    default:
      answer = generateRoundingError(correctAnswer)
  }

  // Clamp to scale bounds
  answer = Math.max(scaleMin, Math.min(scaleMax, answer))
  answer = roundToReasonablePrecision(answer, correctAnswer)

  // Ensure incorrect answer differs from correct
  if (answer === correctAnswer) {
    const offset = correctAnswer > 0 ? Math.ceil(correctAnswer * 0.1) : 1
    answer = Math.max(scaleMin, Math.min(scaleMax, correctAnswer + offset))
  }

  return { answer, errorType }
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
  scaleMin: number,
  scaleMax: number,
  questionText: string,
): number {
  // For percentage/discount questions: confuse "discount amount" with "final price"
  // E.g., 25% off 800 = 600 correct → return 200 (just the discount)
  // Detect percentage patterns in question text
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
  }

  // Generic complement: mirror around midpoint
  const mid = (scaleMin + scaleMax) / 2
  return mid + (mid - correctAnswer)
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

function generateDontKnow(scaleMin: number, scaleMax: number): number {
  // Return midpoint or 0
  return Math.random() < 0.5 ? 0 : Math.round((scaleMin + scaleMax) / 2)
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
