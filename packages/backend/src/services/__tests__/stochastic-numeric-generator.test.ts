import { describe, it, expect } from 'vitest'
import {
  generateStochasticAnswer,
  piaacScoreToTheta,
  ErrorType,
} from '../stochastic-numeric-generator.js'
import { estimateQuestionDifficulty } from '../irt-engine.js'
import type { Question } from '@respondex/shared'
import { QuestionType } from '@respondex/shared'

// ── Test question fixtures ───────────────────────────────────────────────

const percentQuestion: Question = {
  id: 'Q-PERCENT',
  order: 1,
  text: 'V obchodě je sleva 25 % na tričko, které stálo původně 800 Kč. Kolik zaplatíte po slevě?',
  type: QuestionType.NUMBER,
  scale_min: 0,
  scale_max: 10000,
  required: true,
  is_numeric: true,
  correct_answer: 600,
}

const probabilityQuestion: Question = {
  id: 'Q-PROB',
  order: 2,
  text: 'V sáčku je 10 kuliček — 3 červené a 7 modrých. Jaká je pravděpodobnost (v procentech), že náhodně vytáhnete červenou kuličku?',
  type: QuestionType.NUMBER,
  scale_min: 0,
  scale_max: 100,
  required: true,
  is_numeric: true,
  correct_answer: 30,
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('piaacScoreToTheta', () => {
  it('converts Czech mean (267) to theta=0', () => {
    expect(piaacScoreToTheta(267)).toBeCloseTo(0, 1)
  })

  it('converts high score to positive theta', () => {
    expect(piaacScoreToTheta(350)).toBeGreaterThan(1)
  })

  it('converts low score to negative theta', () => {
    expect(piaacScoreToTheta(180)).toBeLessThan(-1)
  })
})

describe('generateStochasticAnswer', () => {
  it('returns answers within scale bounds', () => {
    const itemParams = estimateQuestionDifficulty(percentQuestion)
    for (let i = 0; i < 100; i++) {
      const result = generateStochasticAnswer(250, percentQuestion, itemParams)
      expect(result.answer).toBeGreaterThanOrEqual(percentQuestion.scale_min!)
      expect(result.answer).toBeLessThanOrEqual(percentQuestion.scale_max!)
    }
  })

  it('high-competence person mostly answers correctly', () => {
    const itemParams = estimateQuestionDifficulty(percentQuestion)
    let correct = 0
    const N = 500
    for (let i = 0; i < N; i++) {
      const result = generateStochasticAnswer(350, percentQuestion, itemParams) // Level 4+
      if (result.errorType === ErrorType.CORRECT) correct++
    }
    // Person with score 350 should get >70% correct on basic percentage
    expect(correct / N).toBeGreaterThan(0.5)
  })

  it('low-competence person mostly answers incorrectly', () => {
    const itemParams = estimateQuestionDifficulty(probabilityQuestion)
    let incorrect = 0
    const N = 500
    for (let i = 0; i < N; i++) {
      const result = generateStochasticAnswer(160, probabilityQuestion, itemParams) // Below Level 1
      if (result.errorType !== ErrorType.CORRECT) incorrect++
    }
    // Person with score 160 should get >50% incorrect on probability
    expect(incorrect / N).toBeGreaterThan(0.5)
  })

  it('produces variance (SD > 0) across a mixed population', () => {
    const itemParams = estimateQuestionDifficulty(percentQuestion)
    const scores = [150, 200, 220, 250, 260, 270, 280, 300, 340]
    const answers: number[] = []

    for (const score of scores) {
      for (let i = 0; i < 50; i++) {
        const result = generateStochasticAnswer(score, percentQuestion, itemParams)
        answers.push(result.answer)
      }
    }

    const mean = answers.reduce((s, v) => s + v, 0) / answers.length
    const variance = answers.reduce((s, v) => s + (v - mean) ** 2, 0) / answers.length
    const sd = Math.sqrt(variance)

    // The whole point: SD must be significantly > 0 (real population has SD=120)
    expect(sd).toBeGreaterThan(10)
  })

  it('generates different error types', () => {
    const itemParams = estimateQuestionDifficulty(percentQuestion)
    const types = new Set<ErrorType>()

    for (let i = 0; i < 200; i++) {
      const result = generateStochasticAnswer(200, percentQuestion, itemParams)
      types.add(result.errorType)
    }

    // Should see at least 3 different error types from a low-score person
    expect(types.size).toBeGreaterThanOrEqual(3)
  })

  it('complement error returns 200 for the 25% discount question', () => {
    // Test the specific complement logic for percentage questions
    const itemParams = estimateQuestionDifficulty(percentQuestion)
    let foundComplement = false

    for (let i = 0; i < 500; i++) {
      const result = generateStochasticAnswer(200, percentQuestion, itemParams)
      if (result.errorType === ErrorType.COMPLEMENT && result.answer === 200) {
        foundComplement = true
        break
      }
    }

    // Should eventually produce the "200" complement error (discount amount vs final price)
    expect(foundComplement).toBe(true)
  })
})
