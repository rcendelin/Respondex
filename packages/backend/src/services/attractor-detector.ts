/**
 * Math Error Attractor Detector
 *
 * Auto-detects common math question patterns from Czech question text
 * and generates realistic error attractors — discrete wrong answers
 * that real humans commonly give.
 *
 * Scientific basis:
 * - Gigerenzer et al. (2005): Bayesian reasoning errors in probability
 * - Lusardi & Mitchell (2011): Financial literacy errors (compound vs simple interest)
 * - PIAAC 2023 numeracy items: documented error patterns by proficiency level
 */

import type { Question, ErrorAttractor } from '@respondex/shared'

// ── Pattern detection ──────────────────────────────────────────────────────

type MathPattern = 'percentage_of_total' | 'percentage_discount' | 'fraction' | 'compound_interest'

interface DetectedPattern {
  type: MathPattern
  /** Numbers extracted from question text relevant to the pattern */
  params: Record<string, number>
}

/** Extract all numbers from Czech text, handling space-separated thousands (e.g. "1 000", "10 000") */
function extractNumbers(text: string): number[] {
  // First, collapse space-separated thousands: "1 000" → "1000", "10 000" → "10000"
  const normalized = text.replace(/(\d)\s+(\d{3})(?!\d)/g, '$1$2')
  const matches = normalized.match(/\d+(?:[.,]\d+)?/g)
  if (!matches) return []
  return [...new Set(matches.map(m => parseFloat(m.replace(',', '.'))))]
}

/**
 * Detect the math pattern category from Czech question text.
 * Returns null if no known pattern is recognized.
 */
function detectPattern(text: string, correctAnswer: number): DetectedPattern | null {
  const lower = text.toLowerCase()
  const numbers = extractNumbers(text)

  // COMPOUND_INTEREST: "úrok", "ročně", "úroková sazba", "spořicí účet"
  if (/úrok|ročně|roční|spořicí|spoř/i.test(text)) {
    // Find principal (largest round number), rate (number near %), years
    const rateMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/)
    const rate = rateMatch ? parseFloat(rateMatch[1]!.replace(',', '.')) / 100 : null
    // Find "N let/rok/roky/léta" — also handle Czech word numerals
    const yearsMatch = text.match(/(\d+)\s*(?:let|rok[ůuy]?|lét|léta)/i)
    const yearsWordMatch = text.match(/(dvou|tří|třech|čtyř|pěti|šesti|sedmi|osmi|devíti|deseti)\s+(?:let|rok)/i)
    const wordToNum: Record<string, number> = { dvou: 2, tří: 3, třech: 3, čtyř: 4, pěti: 5, šesti: 6, sedmi: 7, osmi: 8, devíti: 9, deseti: 10 }
    const years = yearsMatch
      ? parseInt(yearsMatch[1]!, 10)
      : yearsWordMatch ? (wordToNum[yearsWordMatch[1]!.toLowerCase()] ?? null) : null
    // Principal: the round number that isn't the rate or years
    const candidates = numbers.filter(n => n !== (rate ? rate * 100 : -1) && n !== years && n >= 100)
    const principal = candidates.length > 0 ? candidates[0]! : null

    if (rate && years && principal) {
      return {
        type: 'compound_interest',
        params: { principal, rate, years },
      }
    }
  }

  // PERCENTAGE_DISCOUNT: "sleva", "poloviční", "polovinu", "polovina", "za X Kč"
  if (/slev[auy]|polovič|polovin[uya]|%\s*(?:slev|cen)/i.test(text)) {
    const pctMatch = text.match(/(\d+)\s*%/)
    const priceMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(?:Kč|kč|korun|CZK)/i)
    if (priceMatch) {
      const base = parseFloat(priceMatch[1]!.replace(',', '.'))
      // "poloviční" = 50%
      const pct = pctMatch ? parseInt(pctMatch[1]!, 10) : (/polovič|polovin/i.test(text) ? 50 : null)
      if (pct !== null) {
        return {
          type: 'percentage_discount',
          params: { base, pct },
        }
      }
    }
  }

  // FRACTION: "N/M", "dvě třetiny", "třetina", "čtvrtina", "polovina z"
  const fractionExplicit = text.match(/(\d+)\s*\/\s*(\d+)/)
  if (fractionExplicit) {
    const num = parseInt(fractionExplicit[1]!, 10)
    const den = parseInt(fractionExplicit[2]!, 10)
    // Find the "given" number (the one that equals correctAnswer * fraction or correctAnswer / fraction)
    const given = numbers.find(n => n !== num && n !== den && n !== correctAnswer && n > 0)
    if (given) {
      return { type: 'fraction', params: { numerator: num, denominator: den, given } }
    }
  }
  // Czech fraction words
  const fractionWords: [RegExp, number, number][] = [
    [/dvě\s+třetin|2\/3/i, 2, 3],
    [/třetin[auy]/i, 1, 3],
    [/čtvrtin[auy]/i, 1, 4],
    [/pětin[auy]/i, 1, 5],
    [/tři\s+čtvrtin|3\/4/i, 3, 4],
  ]
  for (const [pattern, num, den] of fractionWords) {
    if (pattern.test(text)) {
      const given = numbers.find(n => n !== correctAnswer && n > 0)
      if (given) {
        return { type: 'fraction', params: { numerator: num, denominator: den, given } }
      }
    }
  }

  // PERCENTAGE_OF_TOTAL: "pravděpodobnost N %", "N % z", "kolik lidí z M"
  if (/pravděpodob|%\s*[,.]?\s*(z|ze)|kolik\s+lidí|procent/i.test(text)) {
    const pctMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/)
    if (pctMatch) {
      const pct = parseFloat(pctMatch[1]!.replace(',', '.'))
      // Find the total (typically the largest number that isn't the percentage)
      const total = numbers
        .filter(n => n !== pct && n !== correctAnswer && n > correctAnswer)
        .sort((a, b) => b - a)[0]
      if (total) {
        return { type: 'percentage_of_total', params: { pct, total } }
      }
    }
  }

  return null
}

// ── Attractor generation per pattern ───────────────────────────────────────

function generatePercentageOfTotalAttractors(
  pct: number, total: number, correct: number,
): ErrorAttractor[] {
  const attractors: ErrorAttractor[] = []

  // Confusion: return the percentage number itself (e.g., "10" instead of 100)
  if (pct !== correct) {
    attractors.push({ value: pct, label: 'Záměna procent za absolutní číslo', tiers: ['low', 'mid'], weight: 3 })
  }

  // Complement: total - correct (e.g., 900 instead of 100)
  const complement = total - correct
  if (complement > 0 && complement !== correct) {
    attractors.push({ value: complement, label: 'Doplněk do celku', tiers: ['low', 'mid', 'high'], weight: 2 })
  }

  // Return the total itself (whole sample)
  if (total !== correct) {
    attractors.push({ value: total, label: 'Celý vzorek', tiers: ['low'], weight: 1.5 })
  }

  // Off by factor of 10
  if (correct / 10 > 0 && correct / 10 !== correct) {
    attractors.push({ value: correct / 10, label: 'Řád menší (÷10)', tiers: ['low'], weight: 1 })
  }
  if (correct * 10 <= total) {
    attractors.push({ value: correct * 10, label: 'Řád větší (×10)', tiers: ['low'], weight: 0.5 })
  }

  // Round number guess
  const half = Math.round(total / 2)
  if (half !== correct && !attractors.some(a => a.value === half)) {
    attractors.push({ value: half, label: 'Odhad — polovina celku', tiers: ['low'], weight: 0.5 })
  }

  return attractors
}

function generatePercentageDiscountAttractors(
  base: number, pct: number, correct: number,
): ErrorAttractor[] {
  const attractors: ErrorAttractor[] = []
  const discountAmount = base * pct / 100
  const fullPrice = base

  // Confusion: return the discount amount instead of final price (or vice versa)
  if (Math.abs(correct - (base - discountAmount)) < 1) {
    // Correct is final price → attractors are discount amount and original
    if (discountAmount !== correct) {
      attractors.push({ value: discountAmount, label: 'Výše slevy místo konečné ceny', tiers: ['low', 'mid'], weight: 3 })
    }
  } else {
    // Correct is discount amount → attractor is final price
    const finalPrice = base - discountAmount
    if (finalPrice !== correct) {
      attractors.push({ value: finalPrice, label: 'Konečná cena místo výše slevy', tiers: ['low', 'mid'], weight: 3 })
    }
  }

  // Return original price (forgot discount)
  if (fullPrice !== correct) {
    attractors.push({ value: fullPrice, label: 'Zapomněl/a slevu — původní cena', tiers: ['low'], weight: 2 })
  }

  // Double instead of halve (or similar)
  const doubled = base * 2
  if (doubled !== correct && pct === 50) {
    attractors.push({ value: doubled, label: 'Zdvojil/a místo půlení', tiers: ['low'], weight: 1 })
  }

  // Quarter instead of half (common confusion)
  const quarter = base / 4
  if (Math.abs(quarter - correct) > 1 && pct === 50) {
    attractors.push({ value: Math.round(quarter), label: 'Čtvrtina místo poloviny', tiers: ['low'], weight: 1 })
  }

  // Just the percentage number
  if (pct !== correct && pct < base) {
    attractors.push({ value: pct, label: 'Jen číslo procent', tiers: ['low'], weight: 0.5 })
  }

  return attractors
}

function generateFractionAttractors(
  numerator: number, denominator: number, given: number, correct: number,
): ErrorAttractor[] {
  const attractors: ErrorAttractor[] = []
  const fraction = numerator / denominator

  // Multiply instead of divide (or vice versa)
  // If correct = given / fraction, error = given * fraction
  const inverted = Math.round(given * fraction)
  if (inverted !== correct) {
    attractors.push({ value: inverted, label: 'Násobení místo dělení zlomkem', tiers: ['low', 'mid'], weight: 3 })
  }

  // Double the given
  const doubled = given * 2
  if (doubled !== correct) {
    attractors.push({ value: doubled, label: 'Dvojnásobek zadaného čísla', tiers: ['low'], weight: 1.5 })
  }

  // Half the given
  const halved = Math.round(given / 2)
  if (halved !== correct) {
    attractors.push({ value: halved, label: 'Polovina zadaného čísla', tiers: ['low', 'mid'], weight: 1.5 })
  }

  // Multiply by denominator (e.g., 6000 * 3 = 18000)
  const timesDen = given * denominator
  if (timesDen !== correct) {
    attractors.push({ value: timesDen, label: `Násobeno jmenovatelem (×${denominator})`, tiers: ['low'], weight: 1 })
  }

  // Apply fraction squared (e.g., (2/3)^2 * X)
  const squared = Math.round(correct * fraction * fraction)
  if (squared !== correct && squared > 0) {
    attractors.push({ value: squared, label: 'Zlomek aplikován dvakrát', tiers: ['low'], weight: 0.5 })
  }

  return attractors
}

function generateCompoundInterestAttractors(
  principal: number, rate: number, years: number, correct: number,
): ErrorAttractor[] {
  const attractors: ErrorAttractor[] = []

  // Simple interest instead of compound
  const simpleResult = Math.round(principal * (1 + rate * years))
  if (simpleResult !== correct) {
    attractors.push({ value: simpleResult, label: 'Jednoduchý úrok místo složeného', tiers: ['low', 'mid', 'high'], weight: 4 })
  }

  // Just add one year of interest (forget compounding periods)
  const oneYear = Math.round(principal * (1 + rate))
  if (oneYear !== correct) {
    attractors.push({ value: oneYear, label: 'Úrok jen za 1 rok', tiers: ['low', 'mid'], weight: 2 })
  }

  // Return just the principal (don't understand interest)
  if (principal !== correct) {
    attractors.push({ value: principal, label: 'Nerozumí úrokům — jen jistina', tiers: ['low'], weight: 2 })
  }

  // Return just the interest amount, not principal + interest
  const interestOnly = correct - principal
  if (interestOnly > 0 && interestOnly !== correct) {
    attractors.push({ value: interestOnly, label: 'Jen úrok bez jistiny', tiers: ['low', 'mid'], weight: 1.5 })
  }

  // Double the principal (misunderstand "10% per year for 2 years" as "double")
  const doubled = principal * 2
  if (doubled !== correct) {
    attractors.push({ value: doubled, label: 'Zdvojení jistiny', tiers: ['low'], weight: 1 })
  }

  // Off by one period: compound for years-1
  if (years > 1) {
    const shortPeriod = Math.round(principal * Math.pow(1 + rate, years - 1))
    if (shortPeriod !== correct && shortPeriod !== oneYear) {
      attractors.push({ value: shortPeriod, label: `Složený úrok za ${years - 1} rok/y`, tiers: ['mid', 'high'], weight: 1 })
    }
  }

  return attractors
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Resolve error attractors for a question.
 * Priority: manual overrides > auto-detected from text > empty (fallback to generic system).
 */
export function resolveAttractors(question: Question): ErrorAttractor[] {
  // Manual override takes priority
  if (question.error_attractors && question.error_attractors.length > 0) {
    return question.error_attractors.filter(a => a.value !== question.correct_answer)
  }

  // Auto-detect from question text
  if (!question.correct_answer || !question.text) return []

  const pattern = detectPattern(question.text, question.correct_answer)
  if (!pattern) return []

  const scaleMin = question.scale_min ?? 0
  const scaleMax = question.scale_max ?? question.correct_answer * 10

  let attractors: ErrorAttractor[]

  switch (pattern.type) {
    case 'percentage_of_total':
      attractors = generatePercentageOfTotalAttractors(
        pattern.params['pct']!, pattern.params['total']!, question.correct_answer,
      )
      break
    case 'percentage_discount':
      attractors = generatePercentageDiscountAttractors(
        pattern.params['base']!, pattern.params['pct']!, question.correct_answer,
      )
      break
    case 'fraction':
      attractors = generateFractionAttractors(
        pattern.params['numerator']!, pattern.params['denominator']!,
        pattern.params['given']!, question.correct_answer,
      )
      break
    case 'compound_interest':
      attractors = generateCompoundInterestAttractors(
        pattern.params['principal']!, pattern.params['rate']!,
        pattern.params['years']!, question.correct_answer,
      )
      break
    default:
      return []
  }

  // Filter: within scale bounds, not equal to correct answer, deduplicate by value
  const seen = new Set<number>()
  return attractors.filter(a => {
    if (a.value < scaleMin || a.value > scaleMax || a.value === question.correct_answer) return false
    if (seen.has(a.value)) return false
    seen.add(a.value)
    return true
  })
}

// Exported for testing
export { detectPattern, type MathPattern, type DetectedPattern }
