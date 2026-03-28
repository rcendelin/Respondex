import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Trash2,
  Plus,
  Save,
  X,
  GripVertical,
} from 'lucide-react'
import { QuestionType, type Question, type MatrixRow, type SkipLogic } from '@respondex/shared'
import { QuestionSchema } from '@respondex/shared'
import { createEmptyQuestionnaire, getQuestionnaire, saveQuestionsJson } from '@/lib/api'

// Draft type allows undefined for optional fields (avoids exactOptionalPropertyTypes issues)
interface QuestionDraft {
  id: string
  order: number
  text: string
  type: QuestionType
  required: boolean
  options?: string[] | undefined
  matrix_rows?: MatrixRow[] | undefined
  scale_min?: number | undefined
  scale_max?: number | undefined
  scale_min_label?: string | undefined
  scale_max_label?: string | undefined
  is_numeric?: boolean | undefined
  correct_answer?: number | undefined
  skip_logic?: SkipLogic | undefined
  piping_from?: string | undefined
}

// ── Czech labels ─────────────────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  [QuestionType.YES_NO]: 'Ano / Ne',
  [QuestionType.SINGLE_CHOICE]: 'Jedna možnost',
  [QuestionType.MULTI_CHOICE]: 'Více možností',
  [QuestionType.LIKERT]: 'Likertova škála',
  [QuestionType.NUMBER]: 'Číslo',
  [QuestionType.OPEN_TEXT]: 'Volný text',
  [QuestionType.RANKING]: 'Seřazení',
  [QuestionType.MATRIX]: 'Matice',
  [QuestionType.NPS]: 'NPS (0–10)',
  [QuestionType.SEMANTIC_DIFF]: 'Sémantický diferenciál',
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function nextId(questions: QuestionDraft[]): string {
  const nums = questions
    .map((q) => parseInt(q.id.replace(/\D/g, ''), 10))
    .filter((n) => !isNaN(n))
  const max = nums.length > 0 ? Math.max(...nums) : 0
  return `Q${String(max + 1).padStart(2, '0')}`
}

function defaultQuestion(questions: QuestionDraft[]): QuestionDraft {
  return {
    id: nextId(questions),
    order: questions.length + 1,
    text: '',
    type: QuestionType.YES_NO,
    required: true,
  }
}

function needsOptions(type: QuestionType): boolean {
  return [QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE, QuestionType.RANKING, QuestionType.MATRIX].includes(type)
}

function needsScale(type: QuestionType): boolean {
  return [QuestionType.LIKERT, QuestionType.NUMBER, QuestionType.SEMANTIC_DIFF].includes(type)
}

// ── Sub-editors ───────────────────────────────────────────────────────────────

function OptionsEditor({
  label,
  values,
  onChange,
  placeholder,
}: {
  label: string
  values: string[]
  onChange: (v: string[]) => void
  placeholder?: string
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-1">
          <Input
            value={v}
            onChange={(e) => {
              const next = [...values]
              next[i] = e.target.value
              onChange(next)
            }}
            placeholder={placeholder ?? `Možnost ${i + 1}`}
            className="h-7 text-sm"
            maxLength={200}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onChange(values.filter((_, j) => j !== i))}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs mt-1"
        onClick={() => onChange([...values, ''])}
      >
        <Plus className="h-3 w-3 mr-1" /> Přidat
      </Button>
    </div>
  )
}

function ScaleEditor({
  question,
  onChange,
  showLabels,
  fixedMin,
  fixedMax,
}: {
  question: QuestionDraft
  onChange: (patch: Partial<QuestionDraft>) => void
  showLabels: boolean
  fixedMin?: number
  fixedMax?: number
}) {
  const scaleError =
    question.scale_min !== undefined &&
    question.scale_max !== undefined &&
    question.scale_min >= question.scale_max
      ? 'Min musí být menší než Max'
      : null

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Min</Label>
          {fixedMin !== undefined ? (
            <div className="h-7 px-2 flex items-center text-sm border rounded bg-muted">{fixedMin}</div>
          ) : (
            <Input
              type="number"
              value={question.scale_min ?? ''}
              onChange={(e) => onChange({ scale_min: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="h-7 text-sm"
            />
          )}
        </div>
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Max</Label>
          {fixedMax !== undefined ? (
            <div className="h-7 px-2 flex items-center text-sm border rounded bg-muted">{fixedMax}</div>
          ) : (
            <Input
              type="number"
              value={question.scale_max ?? ''}
              onChange={(e) => onChange({ scale_max: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="h-7 text-sm"
            />
          )}
        </div>
      </div>
      {scaleError && <p className="text-xs text-destructive">{scaleError}</p>}
      {showLabels && (
        <div className="flex gap-2">
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Popisek min (volitelné)</Label>
            <Input
              value={question.scale_min_label ?? ''}
              onChange={(e) => onChange({ scale_min_label: e.target.value || undefined })}
              className="h-7 text-sm"
              maxLength={100}
            />
          </div>
          <div className="flex-1">
            <Label className="text-xs text-muted-foreground">Popisek max (volitelné)</Label>
            <Input
              value={question.scale_max_label ?? ''}
              onChange={(e) => onChange({ scale_max_label: e.target.value || undefined })}
              className="h-7 text-sm"
              maxLength={100}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Question editor (inline panel) ───────────────────────────────────────────

function QuestionEditorPanel({
  question,
  allQuestions,
  onChange,
  onClose,
  validationErrors,
}: {
  question: QuestionDraft
  allQuestions: QuestionDraft[]
  onChange: (patch: Partial<QuestionDraft>) => void
  onClose: () => void
  validationErrors: string[]
}) {
  const otherQuestions = allQuestions.filter((q) => q.id !== question.id)

  // matrix_rows as string[] for UI simplicity
  const matrixRowTexts = question.matrix_rows?.map((r) => r.text) ?? []
  function setMatrixRows(texts: string[]) {
    onChange({
      matrix_rows: texts.map((t, i) => ({ id: `R${String(i + 1).padStart(2, '0')}`, text: t })),
    })
  }

  return (
    <div className="mt-2 p-3 border rounded-md bg-muted/30 space-y-3">
      {/* ID + typ */}
      <div className="flex gap-2">
        <div className="w-28">
          <Label className="text-xs text-muted-foreground">ID otázky</Label>
          <Input
            value={question.id}
            onChange={(e) => onChange({ id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
            className="h-7 text-sm font-mono"
            maxLength={50}
          />
        </div>
        <div className="flex-1">
          <Label className="text-xs text-muted-foreground">Typ</Label>
          <Select
            value={question.type}
            onValueChange={(v) => {
              const newType = v as QuestionType
              // Clear type-specific fields when switching type
              const patch: Partial<QuestionDraft> = {
                type: newType,
                options: undefined,
                matrix_rows: undefined,
                scale_min: undefined,
                scale_max: undefined,
                scale_min_label: undefined,
                scale_max_label: undefined,
              }
              if (newType === QuestionType.NPS) {
                patch.scale_min = 0
                patch.scale_max = 10
              }
              if (newType === QuestionType.SEMANTIC_DIFF) {
                patch.scale_min = 1
                patch.scale_max = 7
              }
              onChange(patch)
            }}
          >
            <SelectTrigger className="h-7 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.values(QuestionType).map((t) => (
                <SelectItem key={t} value={t}>
                  {QUESTION_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-1">
          <label className="flex items-center gap-1 text-xs text-muted-foreground pb-1 cursor-pointer">
            <input
              type="checkbox"
              checked={question.required}
              onChange={(e) => onChange({ required: e.target.checked })}
              className="rounded"
            />
            Povinná
          </label>
        </div>
      </div>

      {/* Text otázky */}
      <div>
        <Label className="text-xs text-muted-foreground">Text otázky</Label>
        <textarea
          value={question.text}
          onChange={(e) => onChange({ text: e.target.value })}
          className="w-full mt-1 px-3 py-1.5 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          rows={2}
          maxLength={2000}
          placeholder="Zadejte text otázky..."
        />
        <div className="text-right text-xs text-muted-foreground">{question.text.length}/2000</div>
      </div>

      {/* Typ-specifická pole */}
      {needsOptions(question.type) && question.type !== QuestionType.MATRIX && (
        <OptionsEditor
          label="Možnosti"
          values={question.options ?? []}
          onChange={(v) => onChange({ options: v })}
        />
      )}

      {question.type === QuestionType.MATRIX && (
        <div className="grid grid-cols-2 gap-3">
          <OptionsEditor
            label="Sloupce (možnosti)"
            values={question.options ?? []}
            onChange={(v) => onChange({ options: v })}
            placeholder="Sloupec"
          />
          <OptionsEditor
            label="Řádky"
            values={matrixRowTexts}
            onChange={setMatrixRows}
            placeholder="Řádek"
          />
        </div>
      )}

      {question.type === QuestionType.LIKERT && (
        <ScaleEditor question={question} onChange={onChange} showLabels={true} />
      )}

      {question.type === QuestionType.NUMBER && (
        <>
          <ScaleEditor question={question} onChange={onChange} showLabels={false} />
          <div className="space-y-2 pt-1 border-t border-dashed">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={question.is_numeric ?? false}
                onChange={(e) => onChange({
                  is_numeric: e.target.checked || undefined,
                  correct_answer: e.target.checked ? question.correct_answer : undefined,
                })}
                className="rounded"
              />
              <span className="text-muted-foreground">Faktická otázka se správnou odpovědí</span>
              <span className="text-muted-foreground/60">(stochastický bypass AI)</span>
            </label>
            {question.is_numeric && (
              <div className="flex gap-2 items-end">
                <div className="w-48">
                  <Label className="text-xs text-muted-foreground">Správná odpověď</Label>
                  <Input
                    type="number"
                    value={question.correct_answer ?? ''}
                    onChange={(e) => onChange({ correct_answer: e.target.value === '' ? undefined : Number(e.target.value) })}
                    className="h-7 text-sm"
                    placeholder="např. 600"
                  />
                </div>
                <p className="text-xs text-muted-foreground pb-1">
                  Odpov\u011bdi budou generov\u00e1ny stochasticky podle PIAAC sk\u00f3re respondenta.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {question.type === QuestionType.SEMANTIC_DIFF && (
        <ScaleEditor question={question} onChange={onChange} showLabels={true} fixedMin={1} fixedMax={7} />
      )}

      {question.type === QuestionType.NPS && (
        <ScaleEditor question={question} onChange={onChange} showLabels={true} fixedMin={0} fixedMax={10} />
      )}

      {/* Skip logic */}
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Podmíněné zobrazení (volitelné)</Label>
        <div className="flex gap-2 items-center">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Zobraz pokud</span>
          <Select
            value={question.skip_logic?.question_id ?? '__none__'}
            onValueChange={(v) => {
              if (v === '__none__') {
                onChange({ skip_logic: undefined })
              } else {
                onChange({ skip_logic: { question_id: v, show_if_answer: question.skip_logic?.show_if_answer ?? '' } })
              }
            }}
          >
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="— žádná podmínka —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— žádná podmínka —</SelectItem>
              {otherQuestions.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  {q.id}: {q.text.substring(0, 40)}{q.text.length > 40 ? '…' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {question.skip_logic && (
            <>
              <span className="text-xs text-muted-foreground whitespace-nowrap">= odpověď</span>
              <Input
                value={question.skip_logic.show_if_answer}
                onChange={(e) =>
                  onChange({ skip_logic: { ...question.skip_logic!, show_if_answer: e.target.value } })
                }
                className="h-7 text-xs flex-1"
                placeholder="Ano"
                maxLength={200}
              />
            </>
          )}
        </div>
      </div>

      {/* Piping */}
      <div>
        <Label className="text-xs text-muted-foreground">Vložit odpověď z otázky (piping, volitelné)</Label>
        <Select
          value={question.piping_from ?? '__none__'}
          onValueChange={(v) => onChange({ piping_from: v === '__none__' ? undefined : v })}
        >
          <SelectTrigger className="h-7 text-xs mt-1">
            <SelectValue placeholder="— nevkládat —" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">— nevkládat —</SelectItem>
            {otherQuestions.map((q) => (
              <SelectItem key={q.id} value={q.id}>
                {q.id}: {q.text.substring(0, 40)}{q.text.length > 40 ? '…' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {question.piping_from && (
          <p className="text-xs text-muted-foreground mt-1">
            Použijte <code>{`{${question.piping_from}}`}</code> v textu otázky pro vložení odpovědi.
          </p>
        )}
      </div>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="text-xs text-destructive space-y-0.5">
          {validationErrors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="h-7 text-xs">
          Zavřít editor
        </Button>
      </div>
    </div>
  )
}

// ── Question card ─────────────────────────────────────────────────────────────

function QuestionCard({
  question,
  index,
  total,
  isEditing,
  allQuestions,
  onEdit,
  onChange,
  onDelete,
  onMoveUp,
  onMoveDown,
  validationErrors,
}: {
  question: QuestionDraft
  index: number
  total: number
  isEditing: boolean
  allQuestions: QuestionDraft[]
  onEdit: () => void
  onChange: (patch: Partial<QuestionDraft>) => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  validationErrors: string[]
}) {
  return (
    <div className={`border rounded-md ${validationErrors.length > 0 ? 'border-destructive' : 'border-border'}`}>
      <div
        className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/30"
        onClick={onEdit}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-xs font-mono text-muted-foreground w-8 shrink-0">{question.id}</span>
        <Badge variant="outline" className="text-xs shrink-0 py-0">
          {QUESTION_TYPE_LABELS[question.type]}
        </Badge>
        <span className="flex-1 text-sm truncate">
          {question.text || <span className="text-muted-foreground italic">Bez textu</span>}
        </span>
        {!question.required && (
          <Badge variant="secondary" className="text-xs shrink-0 py-0">volitelná</Badge>
        )}
        <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={index === 0}
            onClick={onMoveUp}
            title="Přesunout výš"
          >
            <ChevronUp className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={index === total - 1}
            onClick={onMoveDown}
            title="Přesunout níž"
          >
            <ChevronDown className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Smazat otázku"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
          <ChevronRight
            className={`h-4 w-4 text-muted-foreground transition-transform ${isEditing ? 'rotate-90' : ''}`}
          />
        </div>
      </div>
      {isEditing && (
        <div className="px-2 pb-2">
          <QuestionEditorPanel
            question={question}
            allQuestions={allQuestions}
            onChange={onChange}
            onClose={onEdit}
            validationErrors={validationErrors}
          />
        </div>
      )}
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export interface QuestionnaireEditorDialogProps {
  /** Existing questionnaire ID to edit, or null to create a new one */
  questionnaireId: string | null
  initialName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}

export function QuestionnaireEditorDialog({
  questionnaireId,
  initialName = '',
  open,
  onOpenChange,
  onSaved,
}: QuestionnaireEditorDialogProps) {
  const [name, setName] = useState(initialName)
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [questionnaireIdState, setQuestionnaireIdState] = useState<string | null>(questionnaireId)
  // Per-question validation error messages
  const [qErrors, setQErrors] = useState<Record<number, string[]>>({})

  // Load existing questionnaire on open
  useEffect(() => {
    if (!open) return
    setError(null)
    setQErrors({})

    if (questionnaireId) {
      setQuestionnaireIdState(questionnaireId)
      setLoading(true)
      getQuestionnaire(questionnaireId)
        .then((data) => {
          setName(data.name ?? initialName)
          setQuestions((data.questions as QuestionDraft[]) ?? [])
        })
        .catch((e: Error) => setError(`Nepodařilo se načíst dotazník: ${e.message}`))
        .finally(() => setLoading(false))
    } else {
      // Reset for new questionnaire
      setQuestionnaireIdState(null)
      setName(initialName)
      setQuestions([])
      setEditingIdx(null)
    }
  }, [open, questionnaireId]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateQuestion = useCallback((idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
    // Clear validation errors for this question on edit
    setQErrors((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }, [])

  function addQuestion() {
    const newQ = defaultQuestion(questions)
    setQuestions((prev) => [...prev, newQ])
    setEditingIdx(questions.length)
  }

  function deleteQuestion(idx: number) {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      // Re-number order
      return next.map((q, i) => ({ ...q, order: i + 1 }))
    })
    if (editingIdx === idx) setEditingIdx(null)
    else if (editingIdx !== null && editingIdx > idx) setEditingIdx(editingIdx - 1)
    setQErrors((prev) => {
      const next: Record<number, string[]> = {}
      Object.entries(prev).forEach(([k, v]) => {
        const ki = parseInt(k, 10)
        if (ki !== idx) next[ki > idx ? ki - 1 : ki] = v
      })
      return next
    })
  }

  function moveQuestion(idx: number, dir: 'up' | 'down') {
    const newIdx = dir === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= questions.length) return
    setQuestions((prev) => {
      const next = [...prev]
      const a = next[newIdx]!
      const b = next[idx]!
      next[idx] = { ...a, order: idx + 1 } satisfies QuestionDraft
      next[newIdx] = { ...b, order: newIdx + 1 } satisfies QuestionDraft
      return next
    })
    if (editingIdx === idx) setEditingIdx(newIdx)
    else if (editingIdx === newIdx) setEditingIdx(idx)
  }

  function validateAll(): boolean {
    const errors: Record<number, string[]> = {}
    // Check duplicate IDs
    const ids = questions.map((q) => q.id)
    const duplicates = ids.filter((id, i) => ids.indexOf(id) !== i)

    questions.forEach((q, i) => {
      const msgs: string[] = []
      if (!q.id.match(/^[A-Za-z][A-Za-z0-9_]{0,49}$/)) {
        msgs.push('ID musí začínat písmenem a obsahovat pouze písmena, číslice a podtržítko')
      }
      if (duplicates.includes(q.id)) {
        msgs.push(`Duplicitní ID: ${q.id}`)
      }
      const result = QuestionSchema.safeParse(q)
      if (!result.success) {
        result.error.issues.forEach((issue) => msgs.push(issue.message))
      }
      if (msgs.length > 0) errors[i] = msgs
    })
    setQErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleSave() {
    setError(null)

    if (!name.trim()) {
      setError('Zadejte název dotazníku')
      return
    }
    if (questions.length === 0) {
      setError('Přidejte alespoň jednu otázku')
      return
    }
    if (!validateAll()) {
      setError('Některé otázky obsahují chyby — opravte je před uložením')
      return
    }

    setSaving(true)
    try {
      let id = questionnaireIdState
      if (!id) {
        // Step 1: create empty questionnaire record
        const created = await createEmptyQuestionnaire(name.trim())
        id = created.id
        setQuestionnaireIdState(id)
      }

      // Step 2: save questions via PUT endpoint (QuestionDraft is structurally identical to Question)
      await saveQuestionsJson(id, questions as unknown as import('@respondex/shared').Question[])
      onSaved()
      onOpenChange(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit dotazník')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>
            {questionnaireIdState ? 'Upravit dotazník' : 'Vytvořit dotazník'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Název */}
          <div>
            <Label htmlFor="qe-name">Název dotazníku</Label>
            <Input
              id="qe-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Název dotazníku"
              className="mt-1"
              maxLength={200}
              disabled={!!questionnaireIdState}
            />
            {questionnaireIdState && (
              <p className="text-xs text-muted-foreground mt-1">Název lze nastavit pouze při vytvoření.</p>
            )}
          </div>

          {/* Loading */}
          {loading && <p className="text-sm text-muted-foreground">Načítám otázky…</p>}

          {/* Otázky */}
          {!loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Otázky ({questions.length})</Label>
              </div>

              {questions.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6 border rounded-md border-dashed">
                  Zatím žádné otázky. Klikněte na „Přidat otázku".
                </p>
              )}

              {questions.map((q, i) => (
                <QuestionCard
                  key={`${i}-${q.id}`}
                  question={q}
                  index={i}
                  total={questions.length}
                  isEditing={editingIdx === i}
                  allQuestions={questions}
                  onEdit={() => setEditingIdx(editingIdx === i ? null : i)}
                  onChange={(patch) => updateQuestion(i, patch)}
                  onDelete={() => deleteQuestion(i)}
                  onMoveUp={() => moveQuestion(i, 'up')}
                  onMoveDown={() => moveQuestion(i, 'down')}
                  validationErrors={qErrors[i] ?? []}
                />
              ))}

              <Button
                type="button"
                variant="outline"
                onClick={addQuestion}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Přidat otázku
              </Button>
            </div>
          )}

          {/* Global error */}
          {error && (
            <p className="text-sm text-destructive bg-destructive/10 rounded-md px-3 py-2">{error}</p>
          )}
        </div>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Zrušit
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Ukládám…' : 'Uložit dotazník'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
