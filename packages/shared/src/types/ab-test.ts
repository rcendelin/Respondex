/**
 * Types for the A/B testing framework.
 * Enables systematic comparison of different simulation algorithms
 * against ground truth from ESS/CVVM/Eurobarometer surveys.
 */

import type { SimulationConfig } from './simulation.js'
import type { QuestionType } from './questionnaire.js'

// ── Reference Questions ─────────────────────────────────────────────────

export interface ReferenceDistribution {
  /** For categorical: { "option_text": proportion } — sums to ~1.0 */
  frequencies?: Record<string, number>
  /** For numeric: descriptive stats from the real survey */
  mean?: number
  median?: number
  std_dev?: number
  /** Sample size of the reference survey */
  n: number
  /** Year of the reference data */
  year: number
}

export interface ReferenceQuestion {
  id: string
  text: string
  type: QuestionType
  options?: string[]
  scale_min?: number
  scale_max?: number
  /** Source survey */
  source: 'ESS' | 'CVVM' | 'Eurobarometr' | 'PIAAC' | 'synthetic'
  source_round?: string
  source_variable?: string
  /** Known Czech population distribution */
  reference_distribution: ReferenceDistribution
  /** Known distributions by demographic subgroup */
  subgroup_distributions?: Record<string, ReferenceDistribution>
  domain: 'political' | 'economic' | 'social' | 'cognitive' | 'health' | 'cultural'
  has_correct_answer: boolean
}

// ── Metrics ─────────────────────────────────────────────────────────────

export interface QuestionMetric {
  question_id: string
  question_text: string
  domain: string
  /** Jensen-Shannon Divergence (0=identical, 1=maximally different) */
  jsd: number
  /** Mean Absolute Error per option */
  mae: number
  /** SD_simulated / SD_reference — target: 1.0 */
  variance_ratio: number
  /** Correlation of subgroup means (simulated vs reference) */
  subgroup_diff_correlation: number
  /** Earth Mover's Distance for ordinal scales */
  emd?: number | undefined
  /** |accuracy_sim - accuracy_ref| for factual questions */
  accuracy_delta?: number | undefined
}

export interface AggregateMetric {
  mean_jsd: number
  median_jsd: number
  mean_mae: number
  mean_variance_ratio: number
  mean_subgroup_correlation: number
  /** Composite: 100 × (1 - 0.5×JSD - 0.2×MAE - 0.2×|1-VR| - 0.1×(1-SGC)) */
  fidelity_score: number
}

export interface ABTestMetrics {
  per_question: QuestionMetric[]
  aggregate: AggregateMetric
}

// ── Test Configuration ──────────────────────────────────────────────────

export interface ABTestArm {
  id: string
  name: string
  description: string
  /** SimulationConfig override (variance_mode is the key differentiator) */
  config_override: Partial<SimulationConfig>
  /** Simulation IDs — one per replication */
  simulation_ids: string[]
  /** Computed after all replications complete */
  metrics?: ABTestMetrics | undefined
}

export interface ABTestConfig {
  id: string
  name: string
  description?: string | undefined
  created_at: string
  /** Population used for ALL arms (paired design) */
  population_id: string
  /** Questionnaire with reference questions */
  questionnaire_id: string
  /** Reference distributions for evaluation */
  reference_questions: ReferenceQuestion[]
  /** Test arms (variants to compare) */
  arms: ABTestArm[]
  /** Base simulation config (arms override specific fields) */
  base_config: SimulationConfig
  runs_per_person: number
  replications: number
  status: 'pending' | 'running' | 'completed' | 'failed'
}

// ── Comparison Results ──────────────────────────────────────────────────

export interface PairwiseComparison {
  arm_id: string
  arm_name: string
  baseline_arm_id: string
  /** Mean fidelity improvement (positive = better than baseline) */
  fidelity_delta: number
  fidelity_ci_lower: number
  fidelity_ci_upper: number
  /** Number of questions where this arm beats baseline */
  questions_improved: number
  questions_tied: number
  questions_degraded: number
}

export interface ABTestComparison {
  test_id: string
  computed_at: string
  pairwise: PairwiseComparison[]
  /** Ranking by fidelity score */
  ranking: {
    arm_id: string
    arm_name: string
    mean_fidelity: number
    ci_lower: number
    ci_upper: number
  }[]
  /** Questions where algorithms disagree most */
  divergent_questions: {
    question_id: string
    question_text: string
    arm_scores: Record<string, number>
  }[]
}
