// Domain types for analytics results

export interface FrequencyEntry {
  value: string | number
  count: number
  percentage: number
}

export interface FrequencyTable {
  question_id: string
  question_text: string
  total_responses: number
  valid_responses: number
  entries: FrequencyEntry[]
}

export interface DescriptiveStats {
  question_id: string
  question_text: string
  n: number
  /** For numeric questions: mean */
  mean?: number
  /** For numeric questions: median */
  median?: number
  /** For categorical questions: most frequent answer */
  mode?: string | number
  /** For numeric questions: standard deviation */
  std_dev?: number
  min?: number
  max?: number
  /** Percentiles: p25, p75 */
  p25?: number
  p75?: number
}

export interface CrossTabCell {
  group_value: string
  count: number
  percentage: number
}

export interface CrossTabRow {
  answer_value: string | number
  cells: CrossTabCell[]
}

export interface CrossTab {
  question_id: string
  question_text: string
  /** The demographic variable used for grouping, e.g. "Pohlaví" */
  group_by: string
  rows: CrossTabRow[]
}

export interface CalibrationQuestionResult {
  question_id: string
  question_text: string
  /** Jensen-Shannon Divergence (0 = identical, 1 = maximally different) */
  jsd: number
  /** Mean Absolute Error */
  mae: number
  /** Variance ratio (simulated / real) */
  variance_ratio: number
  real_distribution: FrequencyEntry[]
  simulated_distribution: FrequencyEntry[]
}

export interface CalibrationResult {
  simulation_id: string
  /** CZ Fidelity Score 0–100 (higher = more faithful to Czech population) */
  cz_fidelity_score: number
  /** Score < 40 triggers warning */
  warning: boolean
  question_results: CalibrationQuestionResult[]
  run_at: string
}

export interface AnalyticsResult {
  simulation_id: string
  computed_at: string
  frequency_tables: FrequencyTable[]
  descriptive_stats: DescriptiveStats[]
  cross_tabs: CrossTab[]
  calibration?: CalibrationResult
}
