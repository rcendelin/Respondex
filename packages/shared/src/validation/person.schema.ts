import { z } from 'zod'
import { Gender, Education, MaritalStatus, EmploymentStatus, IncomeLevel, Region } from '../types/person.js'

export const DemographicsSchema = z.object({
  education: z.nativeEnum(Education).optional(),
  marital_status: z.nativeEnum(MaritalStatus).optional(),
  has_partner: z.boolean().optional(),
  employment_status: z.nativeEnum(EmploymentStatus).optional(),
  income_level: z.nativeEnum(IncomeLevel).optional(),
  region: z.nativeEnum(Region).optional(),
  // Key max 100 chars, string values max 1000 chars — limits prompt injection via custom demographics
  custom_fields: z
    .record(
      z.string().max(100),
      z.union([z.string().max(1000), z.number(), z.boolean()])
    )
    .optional(),
})

export const PersonSchema = z.object({
  id: z.string().min(1, 'ID nesmí být prázdné'),
  age: z
    .number()
    .int('Věk musí být celé číslo')
    .min(18, 'Věk musí být minimálně 18')
    .max(100, 'Věk musí být maximálně 100'),
  gender: z.nativeEnum(Gender, {
    errorMap: () => ({ message: 'Pohlaví musí být "Muž" nebo "Žena"' }),
  }),
  demographics: DemographicsSchema.optional(),
  // 5000 chars cap: generous for a full life story, limits prompt injection surface area.
  // prompt-builder additionally truncates to 2000 chars before inserting into LLM prompt.
  life_story: z.string().max(5000).optional(),
})

export const PersonMetadataSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1, 'Název populace nesmí být prázdný'),
  description: z.string().optional(),
  created_at: z.string().datetime(),
  person_count: z.number().int().min(0),
})

export const PersonArraySchema = z
  .array(PersonSchema)
  .min(1, 'Populace musí obsahovat alespoň jednu osobu')

export type PersonInput = z.input<typeof PersonSchema>
export type PersonOutput = z.output<typeof PersonSchema>
