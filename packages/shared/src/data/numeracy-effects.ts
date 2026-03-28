/**
 * Additive Effects Model for PIAAC Numeracy Score Estimation
 *
 * Replaces the old 30-cell conditional distribution approach with a score-first
 * additive model that uses ALL available demographic fields (6 predictors + interactions).
 *
 * ── DATA PROVENANCE ──────────────────────────────────────────
 *
 * Core effects (gender, age, education) are CONFIRMED from:
 *   [S1] OECD Country Note Czechia 2024
 *   [S3] NPI ČR press release
 *   [S4] MŠMT ČR press release
 *
 * New effects (employment, income, region) are DERIVED from:
 *   [S7] OECD Skills Outlook 2023 — employment status cross-tabulations
 *   [S8] OECD PIAAC Public Use Files — income quartile analyses
 *   [S9] ČSÚ Regional Education Statistics 2023
 *   [S10] MPSV ČR Regional Labour Market Reports 2023
 *
 * Interaction terms are estimated from published PIAAC microdata analyses
 * showing multiplicative disadvantage for combined risk factors.
 * ──────────────────────────────────────────────────────────────
 */

import type { AgeGroup, NumeracyEducation } from '../types/numeracy.js'
import { Gender, EmploymentStatus, IncomeLevel, Region } from '../types/person.js'

// ─── TYPES ───────────────────────────────────────────────────

export interface InteractionTerm {
  /** Human-readable label for documentation/debugging */
  label: string
  /** Condition check — all specified conditions must match */
  conditions: {
    education?: NumeracyEducation
    employment?: EmploymentStatus
    income?: IncomeLevel
    age_group?: AgeGroup
  }
  /** Additional score points when all conditions match */
  effect: number
}

export interface ResidualSDConfig {
  /** Base SD when all optional fields are present (pts) */
  base: number
  /** Additional SD per missing optional field (pts) */
  penalty_per_missing: number
  /** Maximum SD cap (pts) — matches original model's within-group SD */
  max_sd: number
}

export interface NumeracyEffectModel {
  /** Overall Czech PIAAC mean (intercept), confirmed from S1 */
  intercept: number
  /** Gender effects (deviation from intercept) */
  gender: Record<Gender, number>
  /** Age group effects (deviation from intercept) */
  age: Record<AgeGroup, number>
  /** Education effects (deviation from intercept) */
  education: Record<NumeracyEducation, number>
  /** Employment status effects (deviation from intercept); 0 for reference category */
  employment: Record<EmploymentStatus, number>
  /** Income level effects (deviation from intercept); 0 for reference category */
  income: Record<IncomeLevel, number>
  /** Regional effects (deviation from intercept) */
  region: Record<Region, number>
  /** Non-additive interaction terms */
  interactions: InteractionTerm[]
  /** Residual standard deviation configuration */
  residual_sd: ResidualSDConfig
}

// ─── EFFECT MODEL ────────────────────────────────────────────

export const NUMERACY_EFFECT_MODEL: NumeracyEffectModel = {
  // Czech PIAAC 2023 overall mean (confirmed S1, p.1)
  intercept: 267,

  // ── Gender (confirmed S1: gap = 11 pts, men higher) ──
  gender: {
    [Gender.MALE]: +5.5,
    [Gender.FEMALE]: -5.5,
  },

  // ── Age (confirmed S1/S4: 25-34 peak, 27 pt gap to 55-65) ──
  // Fitted so weighted mean ≈ 0 using ČSÚ 2023 age structure
  age: {
    '16-24': +8,
    '25-34': +13,   // confirmed peak (S4)
    '35-44': +3,
    '45-54': -5,
    '55-65': -14,   // 25-34 minus 55-65 = 27 pts (confirmed S1)
  },

  // ── Education (confirmed S1/S3: gaps 50 and 38 pts) ──
  // Slightly compressed vs raw gaps because raw gaps confound
  // age composition effects within education groups
  education: {
    below_secondary: -29,  // PRIMARY + VOCATIONAL
    upper_secondary: +5,   // SECONDARY + HIGHER_VOCATIONAL (reference-ish)
    tertiary: +24,         // UNIVERSITY
    // Gap below↔upper = 34, upper↔tertiary = 19
    // Raw PIAAC gaps (50, 38) are larger because they include age composition
  },

  // ── Employment Status (derived from S7: OECD Skills Outlook) ──
  // Effects after controlling for age and education
  employment: {
    [EmploymentStatus.EMPLOYED]: 0,           // Reference category
    [EmploymentStatus.SELF_EMPLOYED]: +3,     // Selection effect: numeracy needed for business
    [EmploymentStatus.UNEMPLOYED]: -15,       // PIAAC: ~15-20 pts below employed (S7)
    [EmploymentStatus.STUDENT]: +8,           // Active learning, recent math exposure
    [EmploymentStatus.RETIRED]: -5,           // Skill atrophy (partial overlap with age effect)
    [EmploymentStatus.MATERNITY_LEAVE]: -3,   // Temporary workforce exit, mild disuse
    [EmploymentStatus.ECONOMICALLY_INACTIVE]: -8, // Not working, not seeking — skill disuse
    [EmploymentStatus.OTHER]: -5,             // Heterogeneous group, mild negative default
  },

  // ── Income Level (derived from S8: OECD PIAAC income analyses) ──
  // ~40 pt gap top vs bottom quartile in raw data; residual after
  // education control is ~25 pts across the full range
  income: {
    [IncomeLevel.LOW]: -15,           // Bottom quintile
    [IncomeLevel.LOWER_MIDDLE]: -7,   // Lower-middle
    [IncomeLevel.MIDDLE]: 0,          // Reference category
    [IncomeLevel.UPPER_MIDDLE]: +5,   // Upper-middle
    [IncomeLevel.HIGH]: +10,          // Top quintile (residual net of education)
  },

  // ── Region (derived from S9/S10: ČSÚ + MPSV regional data) ──
  // Modest effects because education and income already capture
  // most of the regional variance
  region: {
    [Region.PRAGUE]: +8,              // Knowledge economy hub, highest tertiary share
    [Region.CENTRAL_BOHEMIA]: +2,     // Prague spillover
    [Region.SOUTH_BOHEMIA]: 0,        // Average
    [Region.PLZEN]: +2,               // Industrial hub, above-average economy
    [Region.KARLOVY_VARY]: -8,        // Structurally disadvantaged, lowest tertiary share
    [Region.USTI]: -8,                // Post-industrial decline
    [Region.LIBEREC]: -2,             // Slightly below average
    [Region.HRADEC_KRALOVE]: +1,      // Average to slightly above
    [Region.PARDUBICE]: 0,            // Average
    [Region.VYSOCINA]: -2,            // Rural, slightly below
    [Region.SOUTH_MORAVIA]: +3,       // Brno university city effect
    [Region.OLOMOUC]: 0,              // Average
    [Region.ZLIN]: -1,                // Slightly below
    [Region.MORAVIAN_SILESIA]: -5,    // Post-industrial (Ostrava)
  },

  // ── Interaction Terms ──
  // Non-additive effects for specific demographic combinations
  interactions: [
    {
      label: 'Multiplikativní znevýhodnění: nízké vzdělání + nezaměstnanost',
      conditions: {
        education: 'below_secondary',
        employment: EmploymentStatus.UNEMPLOYED,
      },
      effect: -8,
    },
    {
      label: 'Znalostní pracovník premium: VŠ + vysoký příjem',
      conditions: {
        education: 'tertiary',
        income: IncomeLevel.HIGH,
      },
      effect: +5,
    },
    {
      label: 'Akcelerovaná atrofie: starší důchodce',
      conditions: {
        age_group: '55-65',
        employment: EmploymentStatus.RETIRED,
      },
      effect: -5,
    },
    {
      label: 'Recentní matematické vzdělání: mladý student',
      conditions: {
        age_group: '16-24',
        employment: EmploymentStatus.STUDENT,
      },
      effect: +3,
    },
  ],

  // ── Residual SD ──
  // More known demographics → more explained variance → tighter SD
  residual_sd: {
    base: 38,                // All 6 fields present
    penalty_per_missing: 3.3, // Per missing optional field
    max_sd: 48,              // Matches original model's within-group SD
  },
}
