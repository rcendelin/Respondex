// Reference data types for numeracy competence (PIAAC-based)
// Source: OECD PIAAC Survey of Adult Skills 2023, Cycle 2
// Czech Republic country note & international comparison data

/**
 * PIAAC numeracy proficiency levels (0–5).
 * Each level corresponds to a score range on the 0–500 scale.
 */
export enum NumeracyLevel {
  BELOW_1 = 'Pod úrovní 1',
  LEVEL_1 = 'Úroveň 1',
  LEVEL_2 = 'Úroveň 2',
  LEVEL_3 = 'Úroveň 3',
  LEVEL_4 = 'Úroveň 4',
  LEVEL_5 = 'Úroveň 5',
}

/** PIAAC score range for each proficiency level */
export interface NumeracyLevelDefinition {
  level: NumeracyLevel
  /** Internal key for programmatic use */
  key: string
  /** Minimum score (inclusive) */
  score_min: number
  /** Maximum score (exclusive, except Level 5 which is open-ended) */
  score_max: number
  /** Czech description of what a person at this level can do */
  description_cz: string
  /** English description */
  description_en: string
}

/** Age group bracket as used in PIAAC */
export type AgeGroup = '16-24' | '25-34' | '35-44' | '45-54' | '55-65'

/** Gender categories matching Person.gender values */
export type NumeracyGender = 'Muž' | 'Žena'

/** Education categories for numeracy mapping.
 *  Maps to Education enum but groups PRIMARY+VOCATIONAL as "below_secondary"
 *  and SECONDARY+HIGHER_VOCATIONAL as "upper_secondary" per PIAAC methodology.
 */
export type NumeracyEducation =
  | 'below_secondary'    // Základní + Vyučení
  | 'upper_secondary'    // S maturitou + Vyšší odborné
  | 'tertiary'           // Vysokoškolské

/**
 * A single row in the distribution table:
 * probability of each PIAAC level for a given demographic combination.
 */
export interface NumeracyDistributionRow {
  age_group: AgeGroup
  gender: NumeracyGender
  education: NumeracyEducation
  /** Probability for each level (sums to 1.0) */
  distribution: Record<NumeracyLevel, number>
  /** Estimated mean PIAAC score for this demographic cell */
  estimated_mean: number
  /** Estimated standard deviation */
  estimated_sd: number
}

/** Metadata about a data source used for the reference dataset */
export interface NumeracyDataSource {
  id: string
  name: string
  organization: string
  year: number
  cycle?: number
  /** URL to the source report/data */
  url: string
  description_cz: string
  /** Data confidence: 'confirmed' = from direct source, 'derived' = interpolated/estimated */
  confidence: 'confirmed' | 'derived'
}

/** A single confirmed data point from PIAAC */
export interface NumeracyConfirmedDataPoint {
  /** What this data point describes */
  label: string
  value: number | string
  unit: string
  source_id: string
  /** Table/figure reference in the source report */
  source_reference?: string
  notes?: string
}

/** Marginal distribution = overall % at each level without demographic breakdown */
export interface NumeracyMarginalDistribution {
  scope: string
  country: string
  year: number
  source_id: string
  distribution: Record<NumeracyLevel, number>
  mean_score: number
}

/** The complete numeracy reference dataset */
export interface NumeracyReferenceDataset {
  version: string
  last_updated: string
  sources: NumeracyDataSource[]
  level_definitions: NumeracyLevelDefinition[]
  /** Directly confirmed data points from PIAAC reports */
  confirmed_data: NumeracyConfirmedDataPoint[]
  /** Overall (marginal) distributions */
  marginal_distributions: NumeracyMarginalDistribution[]
  /** Conditional distributions: P(level | age, gender, education) */
  conditional_distributions: NumeracyDistributionRow[]
}
