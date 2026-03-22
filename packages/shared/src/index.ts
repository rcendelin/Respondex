// Shared types and validation schemas for Respondex
// Re-exported for use in both frontend and backend

export const RESPONDEX_VERSION = '0.0.1'

// Types
export * from './types/person.js'
export * from './types/questionnaire.js'
export * from './types/simulation.js'
export * from './types/analytics.js'
export * from './types/numeracy.js'
export * from './types/ab-test.js'

// Reference data
export { NUMERACY_REFERENCE_DATA } from './data/numeracy-reference.js'

// Numeracy assignment utilities
export { assignNumeracyLevel, getNumeracyDistribution } from './numeracy-assigner.js'

// Behavioral parameters
export { BEHAVIORAL_PARAMS, getBehavioralInstructions } from './data/numeracy-behavioral-params.js'
export type { BehaviorParams } from './data/numeracy-behavioral-params.js'

// Validation schemas
export * from './validation/person.schema.js'
export * from './validation/questionnaire.schema.js'
export * from './validation/simulation.schema.js'

// XLSX utilities
export * from './xlsx/parse-result.js'
export * from './xlsx/population-parser.js'
export * from './xlsx/questionnaire-parser.js'
export * from './xlsx/population-export.js'
export * from './xlsx/results-export.js'
