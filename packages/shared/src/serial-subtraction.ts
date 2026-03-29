/**
 * Serial Subtraction Scoring (e.g., MMSE Serial 7s)
 *
 * Generates reference sequences, parses text responses,
 * counts correct steps, and maps to a 1–5 cognitive ability scale.
 */

import type { SerialSubtraction } from './types/questionnaire.js'

/** Generate the reference sequence of correct answers */
export function generateReferenceSequence(config: SerialSubtraction): number[] {
  const seq: number[] = []
  let current = config.start
  for (let i = 0; i < config.count; i++) {
    current -= config.step
    seq.push(current)
  }
  return seq
}

/** Extract numbers from a text response (handles commas, semicolons, spaces, arrows) */
export function parseSequenceFromText(text: string): number[] {
  const cleaned = String(text).replace(/[→⇒\->]+/g, ' ')
  const matches = cleaned.match(/-?\d+(?:[.,]\d+)?/g)
  if (!matches) return []
  return matches.map(m => parseFloat(m.replace(',', '.')))
}

/**
 * Score a parsed sequence against the reference.
 * Returns the count of correct values (0 to config.count).
 * A value is "correct" if it matches the reference at the same position.
 */
export function countCorrectSteps(
  answers: number[],
  reference: number[],
): number {
  let correct = 0
  for (let i = 0; i < reference.length; i++) {
    if (i < answers.length && answers[i] === reference[i]) {
      correct++
    }
  }
  return correct
}

/**
 * Map correct-step count to a 1–5 cognitive ability scale.
 *   0–1 correct → 1 (velmi nízká schopnost)
 *   2 correct   → 2 (spíše nízká)
 *   3 correct   → 3 (střední)
 *   4 correct   → 4 (spíše vysoká)
 *   5 correct   → 5 (velmi vysoká)
 */
export function correctCountToScale(correct: number, maxSteps: number): number {
  if (maxSteps <= 0) return 1
  // Normalize to 5-point scale
  const ratio = correct / maxSteps
  if (ratio <= 0.2) return 1
  if (ratio <= 0.4) return 2
  if (ratio <= 0.6) return 3
  if (ratio <= 0.8) return 4
  return 5
}

/**
 * Full scoring pipeline: text → parse → count → scale.
 * Returns { raw_answers, correct_count, scale_score, reference }.
 */
export function scoreSerialSubtraction(
  textAnswer: string,
  config: SerialSubtraction,
): {
  raw_answers: number[]
  reference: number[]
  correct_count: number
  scale_score: number
} {
  const reference = generateReferenceSequence(config)
  const raw_answers = parseSequenceFromText(textAnswer)
  const correct_count = countCorrectSteps(raw_answers, reference)
  const scale_score = correctCountToScale(correct_count, config.count)
  return { raw_answers, reference, correct_count, scale_score }
}

/**
 * Generate a realistic sequence for stochastic bypass.
 * Uses PIAAC score to determine probability of correct step,
 * with error cascading (wrong step → subsequent steps also wrong).
 */
export function generateStochasticSequence(
  config: SerialSubtraction,
  piaacScore: number,
): { sequence: number[]; correct_count: number; scale_score: number } {
  // P(correct per step) based on PIAAC score
  // Calibrated so: Below 1 (~150) ≈ 30%, Level 2 (~250) ≈ 75%, Level 5 (~420) ≈ 98%
  const pStep = Math.min(0.99, Math.max(0.15, 0.5 + (piaacScore - 200) / 300))

  const reference = generateReferenceSequence(config)
  const sequence: number[] = []
  let current = config.start
  let onTrack = true // whether the person is still following the correct chain

  for (let i = 0; i < config.count; i++) {
    if (onTrack && Math.random() < pStep) {
      // Correct step
      current -= config.step
      sequence.push(current)
    } else {
      // Error — once you err, subsequent steps cascade from the wrong value
      onTrack = false
      const errorType = Math.random()
      if (errorType < 0.4) {
        // Off by ±1 or ±2 (arithmetic slip)
        const slip = Math.random() < 0.5 ? -1 : (Math.random() < 0.5 ? 1 : -2)
        current = current - config.step + slip
      } else if (errorType < 0.7) {
        // Wrong step size (e.g., subtract 5 or 10 instead of 7)
        const wrongStep = config.step + (Math.random() < 0.5 ? -2 : 3)
        current = current - wrongStep
      } else if (errorType < 0.9) {
        // Round to nearest 5 or 10
        current = current - config.step
        current = Math.round(current / 5) * 5
      } else {
        // Skip/repeat (same number or jump)
        current = current - config.step * (Math.random() < 0.5 ? 0 : 2)
      }
      sequence.push(current)
    }
  }

  const correct_count = countCorrectSteps(sequence, reference)
  const scale_score = correctCountToScale(correct_count, config.count)

  return { sequence, correct_count, scale_score }
}
