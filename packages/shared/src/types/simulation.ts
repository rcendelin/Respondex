// Domain types for simulations

export enum Strategy {
  A = 'A',
  B = 'B',
  C = 'C',
  D = 'D',
  E = 'E',
  F = 'F',
}

export enum SimulationStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL_FAILURE = 'partial_failure',
}

export enum SupportedModel {
  GPT_54_MINI = 'gpt-5.4-mini',
  GPT_4O = 'gpt-4o',
  GPT_4O_MINI = 'gpt-4o-mini',
  GPT_35_TURBO = 'gpt-3.5-turbo',
  O3_MINI = 'o3-mini',
}

export interface SimulationConfig {
  population_id: string
  questionnaire_id: string
  strategy: Strategy
  model: SupportedModel | string
  /** Sampling temperature (0.0–2.0) */
  temperature: number
  /** Number of independent runs per person per question */
  runs_per_person: number
  /** Whether to run CZ-CalibrationEngine before simulation (Phase 2) */
  run_calibration?: boolean
  /** For Strategy F: additional ensemble models */
  ensemble_models?: string[]
}

export interface SimulationChunkMessage {
  simulation_id: string
  chunk_index: number
  /** 1-based chunk number (padded to 3 digits, e.g. "001") */
  chunk_number: string
  person_ids: string[]
  config: SimulationConfig
}

export interface SimulationResponse {
  person_id: string
  question_id: string
  run: number
  answer: string | number | string[]
  /** False if the response could not be parsed or validated */
  valid: boolean
  /** Reason for invalidity, if any */
  invalid_reason?: string
  strategy: Strategy
  model: string
  temperature: number
  timestamp: string
  /** Token usage for this call */
  tokens_used?: {
    prompt: number
    completion: number
    total: number
  }
}

export interface SimulationMeta {
  id: string
  config: SimulationConfig
  status: SimulationStatus
  total_chunks: number
  completed_chunks: number
  started_at: string
  completed_at?: string
  error?: string
}
