/**
 * PIAAC Numeracy Score Assignment — Score-First Additive Effects Model
 *
 * Assigns a continuous PIAAC numeracy score (0–500) to a Person based on
 * ALL available demographics using an additive effects model with interaction terms.
 *
 * Key improvements over the original 30-cell conditional distribution approach:
 *   1. Uses 6 predictors (age, gender, education, employment, income, region)
 *      instead of just 3 (age, gender, education)
 *   2. Score-first: generates continuous score FIRST, then derives level deterministically
 *      — eliminates artificial clustering at level band boundaries
 *   3. Interaction terms capture multiplicative disadvantage/advantage
 *   4. Adaptive SD: more known demographics → tighter estimate
 *
 * Usage:
 *   const { level, score } = assignNumeracyProfile(person)
 *   const expectedMean = computeExpectedScore(person)
 */

import { NumeracyLevel } from './types/numeracy.js'
import type { AgeGroup, NumeracyEducation, NumeracyGender } from './types/numeracy.js'
import type { Person } from './types/person.js'
import { Education, Gender, EmploymentStatus, IncomeLevel, Region } from './types/person.js'
import { NUMERACY_REFERENCE_DATA } from './data/numeracy-reference.js'
import { NUMERACY_EFFECT_MODEL } from './data/numeracy-effects.js'
import type { InteractionTerm } from './data/numeracy-effects.js'

// ─── LEGACY SUPPORT ──────────────────────────────────────────
// These are preserved for backward compatibility with code that
// still uses the old conditional distribution approach.

const ALL_LEVELS: NumeracyLevel[] = [
  NumeracyLevel.BELOW_1, NumeracyLevel.LEVEL_1, NumeracyLevel.LEVEL_2,
  NumeracyLevel.LEVEL_3, NumeracyLevel.LEVEL_4, NumeracyLevel.LEVEL_5,
]

// ─── HELPER: Demographics → PIAAC categories ────────────────

/** Map a numeric age to a PIAAC age group bracket */
export function toAgeGroup(age: number): AgeGroup {
  if (age < 25) return '16-24'
  if (age < 35) return '25-34'
  if (age < 45) return '35-44'
  if (age < 55) return '45-54'
  return '55-65'
}

/** Map the Education enum to the 3 PIAAC education categories */
export function toNumeracyEducation(education?: Education): NumeracyEducation {
  if (!education) return 'upper_secondary' // default if unknown
  switch (education) {
    case Education.NO_EDUCATION:
    case Education.PRIMARY:
    case Education.VOCATIONAL:
      return 'below_secondary'
    case Education.SECONDARY:
    case Education.HIGHER_VOCATIONAL:
    case Education.HIGHER_VOCATIONAL_CONSERVATORY:
      return 'upper_secondary'
    case Education.UNIVERSITY:
      return 'tertiary'
    case Education.UNKNOWN:
    default:
      return 'upper_secondary'
  }
}

// ─── EFFECT LOOKUP FUNCTIONS ─────────────────────────────────

function genderEffect(gender: Gender): number {
  return NUMERACY_EFFECT_MODEL.gender[gender] ?? 0
}

function ageEffect(age: number): number {
  const group = toAgeGroup(age)
  return NUMERACY_EFFECT_MODEL.age[group] ?? 0
}

function educationEffect(education?: Education): number {
  if (!education) return 0 // missing = no adjustment (average person)
  const category = toNumeracyEducation(education)
  return NUMERACY_EFFECT_MODEL.education[category] ?? 0
}

function employmentEffect(status?: EmploymentStatus): number {
  if (!status) return 0
  return NUMERACY_EFFECT_MODEL.employment[status] ?? 0
}

function incomeEffect(level?: IncomeLevel): number {
  if (!level) return 0
  return NUMERACY_EFFECT_MODEL.income[level] ?? 0
}

function regionEffect(region?: Region): number {
  if (!region) return 0
  return NUMERACY_EFFECT_MODEL.region[region] ?? 0
}

// ─── INTERACTION TERMS ───────────────────────────────────────

/** Check if a single interaction term matches the person's demographics */
function matchesInteraction(person: Person, term: InteractionTerm): boolean {
  const d = person.demographics
  const c = term.conditions

  if (c.age_group && toAgeGroup(person.age) !== c.age_group) return false
  if (c.education && toNumeracyEducation(d?.education) !== c.education) return false
  if (c.employment && d?.employment_status !== c.employment) return false
  if (c.income && d?.income_level !== c.income) return false

  return true
}

/** Sum all matching interaction effects for a person */
function computeInteractions(person: Person): number {
  let total = 0
  for (const term of NUMERACY_EFFECT_MODEL.interactions) {
    if (matchesInteraction(person, term)) {
      total += term.effect
    }
  }
  return total
}

// ─── ADAPTIVE SD ─────────────────────────────────────────────

/** Count missing optional demographic fields that contribute to score estimation */
function countMissingOptionalFields(person: Person): number {
  const d = person.demographics
  let missing = 0
  if (!d?.employment_status) missing++
  if (!d?.income_level) missing++
  if (!d?.region) missing++
  return missing
}

/** Compute residual SD based on available demographic information */
function computeResidualSD(person: Person): number {
  const { base, penalty_per_missing, max_sd } = NUMERACY_EFFECT_MODEL.residual_sd
  const missing = countMissingOptionalFields(person)
  return Math.min(max_sd, base + missing * penalty_per_missing)
}

// ─── SCORE → LEVEL MAPPING ──────────────────────────────────

/** Deterministically map a continuous PIAAC score to its proficiency level */
export function scoreToLevel(score: number): NumeracyLevel {
  if (score < 176) return NumeracyLevel.BELOW_1
  if (score < 226) return NumeracyLevel.LEVEL_1
  if (score < 276) return NumeracyLevel.LEVEL_2
  if (score < 326) return NumeracyLevel.LEVEL_3
  if (score < 376) return NumeracyLevel.LEVEL_4
  return NumeracyLevel.LEVEL_5
}

// ─── MAIN API: Score-First Additive Model ────────────────────

/**
 * Compute the expected (mean) PIAAC score for a person based on their demographics.
 * Useful for debugging, UI display, and testing.
 *
 * This returns the deterministic mean — the actual assigned score will vary
 * around this mean due to random sampling.
 */
export function computeExpectedScore(person: Person): number {
  const model = NUMERACY_EFFECT_MODEL
  let mean = model.intercept

  // Main effects (always-present fields)
  mean += genderEffect(person.gender)
  mean += ageEffect(person.age)

  // Optional main effects (0 if field missing)
  mean += educationEffect(person.demographics?.education)
  mean += employmentEffect(person.demographics?.employment_status)
  mean += incomeEffect(person.demographics?.income_level)
  mean += regionEffect(person.demographics?.region)

  // Interaction terms
  mean += computeInteractions(person)

  return mean
}

/**
 * Assign both a categorical level AND a continuous PIAAC score (0–500)
 * using the score-first additive effects model.
 *
 * Algorithm:
 *   1. Compute expected mean via additive main effects + interactions
 *   2. Determine residual SD based on available demographic information
 *   3. Sample score from Normal(mean, SD)
 *   4. Clamp to [0, 500]
 *   5. Derive level deterministically from score
 */
export function assignNumeracyProfile(person: Person): { level: NumeracyLevel; score: number } {
  // Step 1-2: Compute expected mean and adaptive SD
  const mean = computeExpectedScore(person)
  const sd = computeResidualSD(person)

  // Step 3: Sample continuous score
  let score = boxMullerNormal(mean, sd)

  // Step 4: Clamp to valid PIAAC range
  score = Math.round(Math.max(0, Math.min(500, score)))

  // Step 5: Derive level deterministically (score-first!)
  const level = scoreToLevel(score)

  return { level, score }
}

// ─── LEGACY API (backward compatible) ────────────────────────

/**
 * @deprecated Use `assignNumeracyProfile(person).level` instead.
 * Kept for backward compatibility — uses the old 30-cell conditional distribution table.
 */
export function assignNumeracyLevel(person: Person): NumeracyLevel {
  const ageGroup = toAgeGroup(person.age)
  const gender: NumeracyGender = person.gender as NumeracyGender
  const education = toNumeracyEducation(person.demographics?.education)

  const row = NUMERACY_REFERENCE_DATA.conditional_distributions.find(
    (r) => r.age_group === ageGroup && r.gender === gender && r.education === education
  )

  if (!row) {
    const marginal = NUMERACY_REFERENCE_DATA.marginal_distributions[0]
    if (!marginal) return NumeracyLevel.LEVEL_2
    return sampleFromDistribution(marginal.distribution)
  }

  return sampleFromDistribution(row.distribution)
}

/**
 * Get the distribution row for a person (for inspection / UI).
 * Returns null if no matching row exists.
 * Uses the old 30-cell conditional distribution table.
 */
export function getNumeracyDistribution(person: Person) {
  const ageGroup = toAgeGroup(person.age)
  const gender: NumeracyGender = person.gender as NumeracyGender
  const education = toNumeracyEducation(person.demographics?.education)

  return NUMERACY_REFERENCE_DATA.conditional_distributions.find(
    (r) => r.age_group === ageGroup && r.gender === gender && r.education === education
  ) ?? null
}

// ─── UTILITIES ───────────────────────────────────────────────

/** Box-Muller transform: generate a normally distributed random value */
function boxMullerNormal(mean: number, sd: number): number {
  const u1 = Math.random() || 1e-10 // avoid log(0)
  const u2 = Math.random()
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)
  return mean + z * sd
}

/** Sample a NumeracyLevel from a probability distribution using Math.random() */
function sampleFromDistribution(dist: Record<NumeracyLevel, number>): NumeracyLevel {
  const rand = Math.random()
  let cumulative = 0
  for (const level of ALL_LEVELS) {
    cumulative += dist[level]
    if (rand < cumulative) return level
  }
  return NumeracyLevel.LEVEL_5
}
