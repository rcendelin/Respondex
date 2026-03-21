import { z } from 'zod'
import { Strategy, SimulationStatus, SupportedModel } from '../types/simulation.js'

export const SimulationConfigSchema = z.object({
  population_id: z.string().min(1, 'ID populace nesmí být prázdné'),
  questionnaire_id: z.string().min(1, 'ID dotazníku nesmí být prázdné'),
  strategy: z.nativeEnum(Strategy, {
    errorMap: () => ({ message: 'Strategie musí být A, B, C, D, E nebo F' }),
  }),
  model: z
    .string()
    .min(1, 'Model nesmí být prázdný')
    .default(SupportedModel.GPT_4O_MINI),
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
  run_calibration: z.boolean().optional().default(false),
  ensemble_models: z.array(z.string().min(1)).optional(),
})

export const SimulationChunkMessageSchema = z.object({
  simulation_id: z.string().min(1),
  chunk_index: z.number().int().min(0),
  chunk_number: z.string().regex(/^\d{3}$/, 'chunk_number must be 3-digit zero-padded'),
  person_ids: z.array(z.string().min(1)).min(1),
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
