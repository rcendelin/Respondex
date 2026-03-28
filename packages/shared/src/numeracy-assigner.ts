/**
 * Assigns a PIAAC numeracy proficiency level to a Person
 * based on their demographics using the conditional probability distributions
 * from the reference dataset.
 *
 * Usage:
 *   const level = assignNumeracyLevel(person)
 *   // level is e.g. NumeracyLevel.LEVEL_2
 */

import { NumeracyLevel } from './types/numeracy.js'
import type { AgeGroup, NumeracyEducation, NumeracyGender } from './types/numeracy.js'
import type { Person } from './types/person.js'
import { Education } from './types/person.js'
import { NUMERACY_REFERENCE_DATA } from './data/numeracy-reference.js'

const ALL_LEVELS: NumeracyLevel[] = [
  NumeracyLevel.BELOW_1, NumeracyLevel.LEVEL_1, NumeracyLevel.LEVEL_2,
  NumeracyLevel.LEVEL_3, NumeracyLevel.LEVEL_4, NumeracyLevel.LEVEL_5,
]

/** Map a numeric age to a PIAAC age group bracket */
function toAgeGroup(age: number): AgeGroup {
  if (age < 25) return '16-24'
  if (age < 35) return '25-34'
  if (age < 45) return '35-44'
  if (age < 55) return '45-54'
  return '55-65'
}

/** Map the Education enum to the 3 PIAAC education categories */
function toNumeracyEducation(education?: Education): NumeracyEducation {
  if (!education) return 'upper_secondary' // default if unknown
  switch (education) {
    case Education.PRIMARY:
    case Education.VOCATIONAL:
      return 'below_secondary'
    case Education.SECONDARY:
    case Education.HIGHER_VOCATIONAL:
      return 'upper_secondary'
    case Education.UNIVERSITY:
      return 'tertiary'
    default:
      return 'upper_secondary'
  }
}

/**
 * Assign a numeracy level to a person using weighted random sampling
 * from the conditional distribution matching their demographics.
 *
 * Returns the assigned NumeracyLevel.
 */
export function assignNumeracyLevel(person: Person): NumeracyLevel {
  const ageGroup = toAgeGroup(person.age)
  const gender: NumeracyGender = person.gender as NumeracyGender
  const education = toNumeracyEducation(person.demographics?.education)

  const row = NUMERACY_REFERENCE_DATA.conditional_distributions.find(
    (r) => r.age_group === ageGroup && r.gender === gender && r.education === education
  )

  if (!row) {
    // Fallback: use the overall marginal distribution
    const marginal = NUMERACY_REFERENCE_DATA.marginal_distributions[0]
    if (!marginal) return NumeracyLevel.LEVEL_2 // safe fallback
    return sampleFromDistribution(marginal.distribution)
  }

  return sampleFromDistribution(row.distribution)
}

/**
 * Get the distribution row for a person (for inspection / UI).
 * Returns null if no matching row exists.
 */
export function getNumeracyDistribution(person: Person) {
  const ageGroup = toAgeGroup(person.age)
  const gender: NumeracyGender = person.gender as NumeracyGender
  const education = toNumeracyEducation(person.demographics?.education)

  return NUMERACY_REFERENCE_DATA.conditional_distributions.find(
    (r) => r.age_group === ageGroup && r.gender === gender && r.education === education
  ) ?? null
}

/**
 * Assign both a categorical level AND a continuous PIAAC score (0–500).
 * The score is sampled from a truncated normal within the assigned level's band.
 */
export function assignNumeracyProfile(person: Person): { level: NumeracyLevel; score: number } {
  const ageGroup = toAgeGroup(person.age)
  const gender: NumeracyGender = person.gender as NumeracyGender
  const education = toNumeracyEducation(person.demographics?.education)

  const row = NUMERACY_REFERENCE_DATA.conditional_distributions.find(
    (r) => r.age_group === ageGroup && r.gender === gender && r.education === education
  )

  const dist = row?.distribution ?? NUMERACY_REFERENCE_DATA.marginal_distributions[0]?.distribution
  const level = dist ? sampleFromDistribution(dist) : NumeracyLevel.LEVEL_2

  // Find level band boundaries
  const levelDef = NUMERACY_REFERENCE_DATA.level_definitions.find((d) => d.level === level)
  const scoreMin = levelDef?.score_min ?? 0
  const scoreMax = levelDef?.score_max ?? 500

  // Sample continuous score from Normal(estimated_mean, estimated_sd), clamped to level band
  const estMean = row?.estimated_mean ?? 267
  const estSd = row?.estimated_sd ?? 50
  let score = boxMullerNormal(estMean, estSd)
  score = Math.round(Math.max(scoreMin, Math.min(scoreMax, score)))

  return { level, score }
}

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
  // Rounding safety: return last level
  return NumeracyLevel.LEVEL_5
}
