import { QuestionType } from '@respondex/shared'
import type { Question } from '@respondex/shared'

export type ParsedAnswer = string | number | string[]

export interface ParsedResponse {
  answer: ParsedAnswer
  valid: boolean
  invalid_reason?: string
  raw?: string
}

/** Attempt to extract JSON from a string that may have surrounding prose */
function extractJson(raw: string): unknown {
  // Direct parse
  try {
    return JSON.parse(raw)
  } catch {
    // Try to find JSON object/array within the string
    const objectMatch = raw.match(/\{[\s\S]*\}/)
    if (objectMatch?.[0]) {
      try {
        return JSON.parse(objectMatch[0])
      } catch {
        // continue
      }
    }
    const arrayMatch = raw.match(/\[[\s\S]*\]/)
    if (arrayMatch?.[0]) {
      try {
        return JSON.parse(arrayMatch[0])
      } catch {
        // continue
      }
    }
    return null
  }
}

function invalidResponse(reason: string, raw?: string): ParsedResponse {
  return {
    answer: '',
    valid: false,
    ...(reason !== undefined ? { invalid_reason: reason } : {}),
    ...(raw !== undefined ? { raw } : {}),
  }
}

/** Validate and normalize the parsed answer against question constraints */
function validateAnswer(parsed: unknown, question: Question): ParsedResponse {
  if (typeof parsed !== 'object' || parsed === null || !('answer' in parsed)) {
    return invalidResponse('Odpověď neobsahuje klíč "answer"')
  }

  const { answer } = parsed as { answer: unknown }

  switch (question.type) {
    case QuestionType.YES_NO: {
      if (answer !== 'Ano' && answer !== 'Ne') {
        return invalidResponse(`Neplatná yes_no hodnota: "${String(answer)}"`)
      }
      return { answer: answer as string, valid: true }
    }

    case QuestionType.SINGLE_CHOICE: {
      if (typeof answer !== 'string') {
        return invalidResponse('single_choice odpověď musí být string')
      }
      const options = question.options ?? []
      if (options.length > 0 && !options.includes(answer)) {
        return invalidResponse(`"${answer}" není platnou možností`)
      }
      return { answer, valid: true }
    }

    case QuestionType.MULTI_CHOICE: {
      if (!Array.isArray(answer)) {
        return invalidResponse('multi_choice odpověď musí být pole')
      }
      const options = question.options ?? []
      const strAnswers = answer.map(String)
      const invalid = options.length > 0 ? strAnswers.filter((a) => !options.includes(a)) : []
      if (invalid.length > 0) {
        return invalidResponse(`Neplatné možnosti: ${invalid.join(', ')}`)
      }
      return { answer: strAnswers, valid: true }
    }

    case QuestionType.LIKERT:
    case QuestionType.SEMANTIC_DIFF: {
      const num = Number(answer)
      if (isNaN(num) || !Number.isFinite(num)) {
        return invalidResponse(`Neplatné číslo: "${String(answer)}"`)
      }
      const min = question.scale_min ?? 1
      const max = question.scale_max ?? 5
      if (num < min || num > max) {
        return invalidResponse(`${num} je mimo rozsah ${min}–${max}`)
      }
      return { answer: num, valid: true }
    }

    case QuestionType.NUMBER: {
      const num = Number(answer)
      if (isNaN(num) || !Number.isFinite(num)) {
        return invalidResponse(`Neplatné číslo: "${String(answer)}"`)
      }
      if (question.scale_min !== undefined && num < question.scale_min) {
        return invalidResponse(`${num} je pod minimem ${question.scale_min}`)
      }
      if (question.scale_max !== undefined && num > question.scale_max) {
        return invalidResponse(`${num} je nad maximem ${question.scale_max}`)
      }
      return { answer: num, valid: true }
    }

    case QuestionType.NPS: {
      const num = Number(answer)
      if (isNaN(num) || num < 0 || num > 10 || !Number.isInteger(num)) {
        return invalidResponse(`NPS musí být celé číslo 0–10, dostáno: "${String(answer)}"`)
      }
      return { answer: num, valid: true }
    }

    case QuestionType.OPEN_TEXT: {
      if (typeof answer !== 'string' || answer.trim() === '') {
        return invalidResponse('open_text odpověď musí být neprázdný string')
      }
      return { answer: answer.trim().substring(0, 2000), valid: true }
    }

    case QuestionType.RANKING: {
      if (!Array.isArray(answer)) {
        return invalidResponse('ranking odpověď musí být pole')
      }
      const options = question.options ?? []
      const strAnswers = answer.map(String)
      if (options.length > 0 && strAnswers.length !== options.length) {
        return invalidResponse(`Ranking musí obsahovat ${options.length} položek, dostáno ${strAnswers.length}`)
      }
      return { answer: strAnswers, valid: true }
    }

    case QuestionType.MATRIX: {
      // Matrix answers are stored as-is (complex structure)
      return { answer: JSON.stringify(answer), valid: true }
    }

    default:
      return { answer: String(answer), valid: true }
  }
}

/**
 * Parse raw model output into a structured SimulationResponse answer.
 * Handles JSON extraction, validation, and invalid response marking.
 */
export function parseModelResponse(raw: string, question: Question): ParsedResponse {
  if (!raw || raw.trim() === '') {
    return invalidResponse('Prázdná odpověď', raw)
  }

  const parsed = extractJson(raw)
  if (parsed === null) {
    return invalidResponse('Odpověď není platný JSON', raw)
  }

  return validateAnswer(parsed, question)
}
