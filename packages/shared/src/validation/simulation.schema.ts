import { z } from 'zod'
import { Strategy, SimulationStatus, SupportedModel, VarianceMode } from '../types/simulation.js'

/** UUID v4 pattern — used to validate ID fields from queue messages and stored blobs */
const uuidV4 = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    'ID musí být platné UUID v4'
  )

export const SimulationConfigSchema = z.object({
  population_id: uuidV4,
  questionnaire_id: uuidV4,
  strategy: z.nativeEnum(Strategy, {
    errorMap: () => ({ message: 'Strategie musí být A, B, C, D, E nebo F' }),
  }),
  model: z
    .nativeEnum(SupportedModel, {
      errorMap: () => ({
        message: `Model musí být jeden z: ${Object.values(SupportedModel).join(', ')}`,
      }),
    })
    .default(SupportedModel.GPT_54_MINI),
  temperature: z
    .number()
    .min(0, 'Teplota musí být minimálně 0.0')
    .max(2, 'Teplota musí být maximálně 2.0')
    .default(0.7),
  runs_per_person: z
    .number()
    .int('Počet runs musí být celé číslo')
    .min(1, 'Minimální počet runs je 1')
    .max(10, 'Maximální počet runs je 10')
    .default(3),
  variance_mode: z
    .nativeEnum(VarianceMode, {
      errorMap: () => ({ message: 'Režim variance musí být standard, enhanced, two_step, numeracy_behavioral, irt_modulated nebo dlce' }),
    })
    .optional()
    .default(VarianceMode.STANDARD),
  run_calibration: z.boolean().optional().default(false),
  ensemble_models: z.array(z.string().min(1).max(100)).max(5).optional(),
})

export const SimulationChunkMessageSchema = z.object({
  simulation_id: uuidV4,
  chunk_index: z.number().int().min(0),
  // 3–6 digit zero-padded number — allows up to 999 999 chunks (safe for current 1000-person cap)
  chunk_number: z.string().regex(/^\d{3,6}$/, 'chunk_number must be 3–6 digit zero-padded decimal'),
  // person_ids can be any non-empty alphanumeric string (e.g. "R0001", "P001" from XLSX import)
  // Path traversal is not a concern here — person_ids are only used for in-memory filtering,
  // never directly as blob storage paths (simulation_id is used for all blob paths)
  person_ids: z.array(z.string().min(1).max(200).regex(/^[A-Za-z0-9_\-]+$/, 'ID osoby musí obsahovat pouze písmena, číslice, _ nebo -')).min(1).max(20),
  config: SimulationConfigSchema,
})

export const SimulationMetaSchema = z.object({
  id: z.string().min(1),
  config: SimulationConfigSchema,
  status: z.nativeEnum(SimulationStatus),
  total_chunks: z.number().int().min(1),
  completed_chunks: z.number().int().min(0),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().optional(),
  error: z.string().optional(),
})

export type SimulationConfigInput = z.input<typeof SimulationConfigSchema>
export type SimulationConfigOutput = z.output<typeof SimulationConfigSchema>
