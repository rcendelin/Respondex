/**
 * Behavioral parameters for PIAAC numeracy levels.
 *
 * Scientific basis:
 * - Krosnick (1991): Satisficing theory — low ability → first acceptable answer
 * - Peters et al. (2006): Low numeracy → heuristic reliance, framing susceptibility
 * - Chapala et al. (2024): Social desirability modulation
 *
 * Each parameter is a probability (0.0–1.0) of the behavior manifesting.
 * These are researcher estimates calibrated against the literature gradients,
 * NOT empirically fitted values. They must be validated via A/B testing.
 */

import { NumeracyLevel } from '../types/numeracy.js'
import type { QuestionType } from '../types/questionnaire.js'

export interface BehaviorParams {
  /** Tendency to pick the first acceptable option (visual/list questions) */
  primacy_bias: number
  /** Tendency to agree/say yes regardless of content */
  acquiescence: number
  /** Tendency to cluster around midpoint on scales */
  central_tendency: number
  /** Tendency to minimize cognitive effort, answer quickly */
  satisficing: number
  /** Tendency to give same answer across a series of similar questions */
  straight_lining: number
  /** Susceptibility to how the question is framed */
  framing_susceptibility: number
  /** Proportion of scale range typically used (0 = narrow, 1 = full) */
  scale_range_use: number
  /** Tendency to answer with round numbers (10, 50, 100, 500) */
  rounding: number
}

export const BEHAVIORAL_PARAMS: Record<NumeracyLevel, BehaviorParams> = {
  [NumeracyLevel.BELOW_1]: {
    primacy_bias: 0.85,
    acquiescence: 0.75,
    central_tendency: 0.80,
    satisficing: 0.90,
    straight_lining: 0.70,
    framing_susceptibility: 0.85,
    scale_range_use: 0.30,
    rounding: 0.90,
  },
  [NumeracyLevel.LEVEL_1]: {
    primacy_bias: 0.65,
    acquiescence: 0.55,
    central_tendency: 0.60,
    satisficing: 0.70,
    straight_lining: 0.50,
    framing_susceptibility: 0.65,
    scale_range_use: 0.50,
    rounding: 0.75,
  },
  [NumeracyLevel.LEVEL_2]: {
    primacy_bias: 0.40,
    acquiescence: 0.35,
    central_tendency: 0.40,
    satisficing: 0.40,
    straight_lining: 0.25,
    framing_susceptibility: 0.40,
    scale_range_use: 0.65,
    rounding: 0.50,
  },
  [NumeracyLevel.LEVEL_3]: {
    primacy_bias: 0.20,
    acquiescence: 0.20,
    central_tendency: 0.20,
    satisficing: 0.15,
    straight_lining: 0.10,
    framing_susceptibility: 0.20,
    scale_range_use: 0.80,
    rounding: 0.30,
  },
  [NumeracyLevel.LEVEL_4]: {
    primacy_bias: 0.10,
    acquiescence: 0.10,
    central_tendency: 0.10,
    satisficing: 0.05,
    straight_lining: 0.05,
    framing_susceptibility: 0.10,
    scale_range_use: 0.90,
    rounding: 0.15,
  },
  [NumeracyLevel.LEVEL_5]: {
    primacy_bias: 0.05,
    acquiescence: 0.05,
    central_tendency: 0.05,
    satisficing: 0.02,
    straight_lining: 0.02,
    framing_susceptibility: 0.05,
    scale_range_use: 0.95,
    rounding: 0.05,
  },
}

/**
 * Question-type-specific behavioral instructions.
 * Each function checks the behavioral params and returns Czech instruction strings
 * that are relevant for that question type.
 */
export function getBehavioralInstructions(
  params: BehaviorParams,
  questionType: QuestionType
): string[] {
  const instructions: string[] = []
  const QT = {
    YES_NO: 'yes_no',
    SINGLE_CHOICE: 'single_choice',
    MULTI_CHOICE: 'multi_choice',
    LIKERT: 'likert',
    NUMBER: 'number',
    NPS: 'nps',
    RANKING: 'ranking',
    MATRIX: 'matrix',
    SEMANTIC_DIFF: 'semantic_diff',
    OPEN_TEXT: 'open_text',
  } as const

  switch (questionType) {
    case QT.YES_NO:
      if (params.acquiescence > 0.5)
        instructions.push('Má tendenci souhlasit s tvrzeními — spíše odpoví „Ano", pokud si není jistý/á.')
      if (params.satisficing > 0.5)
        instructions.push('Odpovídá rychle, bez dlouhého přemýšlení.')
      break

    case QT.SINGLE_CHOICE:
      if (params.primacy_bias > 0.4)
        instructions.push('Často si vybere první možnost, která mu/jí přijde přijatelná, aniž by pečlivě zvážil/a všechny ostatní.')
      if (params.satisficing > 0.5)
        instructions.push('Odpovídá intuitivně, nečte všechny možnosti do detailu.')
      break

    case QT.MULTI_CHOICE:
      if (params.satisficing > 0.5)
        instructions.push('Vybírá méně položek, než by ve skutečnosti měl/a — zastaví se u prvních pár přijatelných.')
      if (params.primacy_bias > 0.4)
        instructions.push('Položky na začátku seznamu mají vyšší šanci být vybrány.')
      break

    case QT.LIKERT:
    case QT.SEMANTIC_DIFF:
      if (params.central_tendency > 0.5)
        instructions.push('Na škálách volí často střední hodnoty, vyhýbá se extrémům.')
      if (params.scale_range_use < 0.5)
        instructions.push('Využívá jen úzký rozsah stupnice (typicky 1–2 body kolem středu).')
      if (params.straight_lining > 0.4)
        instructions.push('V sérii podobných otázek má tendenci odpovídat stále stejnou hodnotou.')
      break

    case QT.NUMBER:
      if (params.rounding > 0.5)
        instructions.push('Odpovídá kulatými čísly (10, 50, 100, 500, 1000) — nepočítá přesně, odhaduje.')
      if (params.satisficing > 0.5)
        instructions.push('Může si otázku špatně vyložit nebo přeskočit složitější část výpočtu.')
      break

    case QT.NPS:
      if (params.central_tendency > 0.5)
        instructions.push('Drží se „bezpečného" středu stupnice (5–7), vyhýbá se krajním hodnotám.')
      if (params.satisficing > 0.3)
        instructions.push('Odpovídá bez hlubšího přemýšlení o konkrétní zkušenosti.')
      break

    case QT.RANKING:
      if (params.satisficing > 0.5)
        instructions.push('První položky řadí pečlivěji, zbytek pořadí je víceméně náhodný.')
      break

    case QT.MATRIX:
      if (params.straight_lining > 0.4)
        instructions.push('V matici otázek má tendenci odpovídat stejnou hodnotou v celém bloku (straight-lining).')
      if (params.satisficing > 0.5)
        instructions.push('Poslední řádky matice vyplňuje méně pečlivě než první.')
      break

    case QT.OPEN_TEXT:
      if (params.satisficing > 0.5)
        instructions.push('Odpovídá stručně, jednou větou nebo jen heslovitě.')
      break
  }

  return instructions
}
