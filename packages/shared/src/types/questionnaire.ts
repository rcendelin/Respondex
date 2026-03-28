// Domain types for questionnaires (dotazníky)

export enum QuestionType {
  YES_NO = 'yes_no',
  SINGLE_CHOICE = 'single_choice',
  MULTI_CHOICE = 'multi_choice',
  LIKERT = 'likert',
  NUMBER = 'number',
  OPEN_TEXT = 'open_text',
  RANKING = 'ranking',
  MATRIX = 'matrix',
  NPS = 'nps',
  SEMANTIC_DIFF = 'semantic_diff',
}

export interface SkipLogic {
  /** Question ID that controls this skip, e.g. "Q02" */
  question_id: string
  /** Answer value that triggers showing this question, e.g. "Ano" */
  show_if_answer: string
}

export interface MatrixRow {
  id: string
  text: string
}

export interface Question {
  id: string
  /** Display order (1-based) */
  order: number
  text: string
  type: QuestionType
  /** Answer options for single_choice, multi_choice, ranking, matrix columns */
  options?: string[]
  /** Rows for matrix questions */
  matrix_rows?: MatrixRow[]
  /** Minimum scale value for likert, number, semantic_diff */
  scale_min?: number
  /** Maximum scale value for likert, number, semantic_diff */
  scale_max?: number
  /** Label for the minimum scale end (semantic_diff, likert) */
  scale_min_label?: string
  /** Label for the maximum scale end (semantic_diff, likert) */
  scale_max_label?: string
  required: boolean
  /** Whether this question has a factual correct answer (enables stochastic LLM bypass) */
  is_numeric?: boolean
  /** The correct/expected numeric answer (required when is_numeric is true) */
  correct_answer?: number
  /** Conditional display logic */
  skip_logic?: SkipLogic
  /** Question ID whose answer should be piped into this question text as {Q_ID} */
  piping_from?: string
}

export interface QuestionnaireMetadata {
  id: string
  title: string
  description?: string
  /** Primary language (default: 'cs') */
  language: string
  created_at: string
}

export interface Questionnaire {
  metadata: QuestionnaireMetadata
  questions: Question[]
}
