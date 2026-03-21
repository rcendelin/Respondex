import { z } from 'zod'
import { QuestionType } from '../types/questionnaire.js'

export const SkipLogicSchema = z.object({
  question_id: z.string().min(1),
  show_if_answer: z.string().min(1),
})

export const MatrixRowSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
})

export const QuestionSchema = z
  .object({
    id: z.string().min(1, 'ID otázky nesmí být prázdné'),
    order: z.number().int().min(1),
    text: z.string().min(1, 'Text otázky nesmí být prázdný'),
    type: z.nativeEnum(QuestionType, {
      errorMap: () => ({ message: 'Neplatný typ otázky' }),
    }),
    options: z.array(z.string().min(1)).optional(),
    matrix_rows: z.array(MatrixRowSchema).optional(),
    scale_min: z.number().optional(),
    scale_max: z.number().optional(),
    scale_min_label: z.string().optional(),
    scale_max_label: z.string().optional(),
    required: z.boolean(),
    skip_logic: SkipLogicSchema.optional(),
    piping_from: z.string().optional(),
  })
  .superRefine((question, ctx) => {
    // Validate options are present for choice-based types
    const requiresOptions = [
      QuestionType.SINGLE_CHOICE,
      QuestionType.MULTI_CHOICE,
      QuestionType.RANKING,
    ]
    if (requiresOptions.includes(question.type) && (!question.options || question.options.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Otázka typu "${question.type}" vyžaduje alespoň jednu možnost (Moznosti)`,
        path: ['options'],
      })
    }

    // Validate scale_min/max for scale-based types
    const requiresScale = [QuestionType.LIKERT, QuestionType.NUMBER, QuestionType.SEMANTIC_DIFF]
    if (requiresScale.includes(question.type)) {
      if (question.scale_min === undefined || question.scale_max === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Otázka typu "${question.type}" vyžaduje SlalaMin a SkalaMax`,
          path: ['scale_min'],
        })
      } else if (question.scale_min >= question.scale_max) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'SkalaMin musí být menší než SkalaMax',
          path: ['scale_min'],
        })
      }
    }

    // Matrix requires both options (columns) and matrix_rows
    if (question.type === QuestionType.MATRIX) {
      if (!question.options || question.options.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Maticová otázka vyžaduje alespoň jeden sloupec (Moznosti)',
          path: ['options'],
        })
      }
      if (!question.matrix_rows || question.matrix_rows.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Maticová otázka vyžaduje alespoň jeden řádek (MatrixRadky)',
          path: ['matrix_rows'],
        })
      }
    }
  })

export const QuestionnaireMetadataSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1, 'Název dotazníku nesmí být prázdný'),
  description: z.string().optional(),
  language: z.string().default('cs'),
  created_at: z.string().datetime(),
})

export const QuestionnaireSchema = z.object({
  metadata: QuestionnaireMetadataSchema,
  questions: z
    .array(QuestionSchema)
    .min(1, 'Dotazník musí obsahovat alespoň jednu otázku'),
})

export type QuestionInput = z.input<typeof QuestionSchema>
export type QuestionnaireInput = z.input<typeof QuestionnaireSchema>
