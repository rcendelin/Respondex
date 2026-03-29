import { useState, useEffect, useCallback, useRef } from 'react'
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
  Trash2,
  Plus,
  Save,
  X,
  GripVertical,
  ToggleLeft,
  List,
  Hash,
  AlignLeft,
  BarChart2,
  Star,
  Grid,
  TrendingUp,
  Diff,
  AlertCircle,
  Zap,
  GitBranch,
  Link2,
  Calculator,
  Copy,
  CheckCircle2,
  Settings2,
  FileText,
} from 'lucide-react'
import { QuestionType, type Question, type MatrixRow, type SkipLogic } from '@respondex/shared'
import { QuestionSchema } from '@respondex/shared'
import { createEmptyQuestionnaire, getQuestionnaire, saveQuestionsJson, updateQuestionnaire } from '@/lib/api'

// Draft type allows undefined for optional fields
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
  correct_rate?: number | undefined
  /** Serial subtraction config (e.g., 100 − 7 × 5). Mutually exclusive with is_numeric. */
  serial_subtraction?: { start: number; step: number; count: number } | undefined
  skip_logic?: SkipLogic | undefined
  piping_from?: string | undefined
  reference_distribution?: Record<string, number> | undefined
}

// ── Czech labels & icons ────────────────────────────────────────────────────

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
  [QuestionType.SEMANTIC_DIFF]: 'Sém. diferenciál',
}

const QUESTION_TYPE_COLORS: Record<QuestionType, string> = {
  [QuestionType.YES_NO]: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  [QuestionType.SINGLE_CHOICE]: 'bg-blue-500/10 text-blue-700 border-blue-200',
  [QuestionType.MULTI_CHOICE]: 'bg-indigo-500/10 text-indigo-700 border-indigo-200',
  [QuestionType.LIKERT]: 'bg-amber-500/10 text-amber-700 border-amber-200',
  [QuestionType.NUMBER]: 'bg-purple-500/10 text-purple-700 border-purple-200',
  [QuestionType.OPEN_TEXT]: 'bg-slate-500/10 text-slate-700 border-slate-200',
  [QuestionType.RANKING]: 'bg-orange-500/10 text-orange-700 border-orange-200',
  [QuestionType.MATRIX]: 'bg-teal-500/10 text-teal-700 border-teal-200',
  [QuestionType.NPS]: 'bg-rose-500/10 text-rose-700 border-rose-200',
  [QuestionType.SEMANTIC_DIFF]: 'bg-cyan-500/10 text-cyan-700 border-cyan-200',
}

function QuestionTypeIcon({ type, className = 'h-3.5 w-3.5' }: { type: QuestionType; className?: string }) {
  switch (type) {
    case QuestionType.YES_NO: return <ToggleLeft className={className} />
    case QuestionType.SINGLE_CHOICE: return <List className={className} />
    case QuestionType.MULTI_CHOICE: return <List className={className} />
    case QuestionType.LIKERT: return <Star className={className} />
    case QuestionType.NUMBER: return <Hash className={className} />
    case QuestionType.OPEN_TEXT: return <AlignLeft className={className} />
    case QuestionType.RANKING: return <BarChart2 className={className} />
    case QuestionType.MATRIX: return <Grid className={className} />
    case QuestionType.NPS: return <TrendingUp className={className} />
    case QuestionType.SEMANTIC_DIFF: return <Diff className={className} />
    default: return <FileText className={className} />
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

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
    type: QuestionType.SINGLE_CHOICE,
    required: true,
  }
}

function needsOptions(type: QuestionType): boolean {
  return [QuestionType.SINGLE_CHOICE, QuestionType.MULTI_CHOICE, QuestionType.RANKING, QuestionType.MATRIX].includes(type)
}

function needsScale(type: QuestionType): boolean {
  return [QuestionType.LIKERT, QuestionType.NUMBER, QuestionType.SEMANTIC_DIFF].includes(type)
}

function questionSummary(q: QuestionDraft): string {
  if (needsOptions(q.type) && q.options?.length) {
    return `${q.options.length} možností`
  }
  if (needsScale(q.type) && q.scale_min !== undefined && q.scale_max !== undefined) {
    return `${q.scale_min}–${q.scale_max}`
  }
  if (q.type === QuestionType.NPS) return '0–10'
  if (q.type === QuestionType.YES_NO) return 'Ano / Ne'
  if (q.type === QuestionType.OPEN_TEXT) return 'Volný text'
  return ''
}

// ── Sub-editors ─────────────────────────────────────────────────────────────

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
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="space-y-1">
        {values.map((v, i) => (
          <div key={i} className="flex gap-1.5 items-center group">
            <span className="text-xs text-muted-foreground/50 w-5 text-right tabular-nums shrink-0">{i + 1}.</span>
            <Input
              value={v}
              onChange={(e) => {
                const next = [...values]
                next[i] = e.target.value
                onChange(next)
              }}
              placeholder={placeholder ?? `Možnost ${i + 1}`}
              className="h-8 text-sm"
              maxLength={200}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={() => onChange(values.filter((_, j) => j !== i))}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 text-xs"
        onClick={() => onChange([...values, ''])}
      >
        <Plus className="h-3 w-3 mr-1" /> Přidat možnost
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
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-muted-foreground">Minimum</Label>
          {fixedMin !== undefined ? (
            <div className="h-8 px-3 flex items-center text-sm border rounded-md bg-muted text-muted-foreground">{fixedMin}</div>
          ) : (
            <Input
              type="number"
              value={question.scale_min ?? ''}
              onChange={(e) => onChange({ scale_min: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="h-8 text-sm"
            />
          )}
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Maximum</Label>
          {fixedMax !== undefined ? (
            <div className="h-8 px-3 flex items-center text-sm border rounded-md bg-muted text-muted-foreground">{fixedMax}</div>
          ) : (
            <Input
              type="number"
              value={question.scale_max ?? ''}
              onChange={(e) => onChange({ scale_max: e.target.value === '' ? undefined : Number(e.target.value) })}
              className="h-8 text-sm"
            />
          )}
        </div>
      </div>
      {scaleError && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{scaleError}</p>}
      {showLabels && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-muted-foreground">Popisek minima</Label>
            <Input
              value={question.scale_min_label ?? ''}
              onChange={(e) => onChange({ scale_min_label: e.target.value || undefined })}
              className="h-8 text-sm"
              maxLength={100}
              placeholder="např. Zcela nesouhlasím"
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Popisek maxima</Label>
            <Input
              value={question.scale_max_label ?? ''}
              onChange={(e) => onChange({ scale_max_label: e.target.value || undefined })}
              className="h-8 text-sm"
              maxLength={100}
              placeholder="např. Zcela souhlasím"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Section wrapper ─────────────────────────────────────────────────────────

// ── Reference Distribution Editor ─────────────────────────────────────────

function getDefaultKeys(question: QuestionDraft): string[] {
  if (question.type === QuestionType.YES_NO) return ['Ano', 'Ne']
  if (question.options && question.options.length > 0) return question.options
  if (question.type === QuestionType.LIKERT || question.type === QuestionType.NPS || question.type === QuestionType.SEMANTIC_DIFF) {
    const min = question.scale_min ?? (question.type === QuestionType.NPS ? 0 : 1)
    const max = question.scale_max ?? (question.type === QuestionType.NPS ? 10 : 5)
    const keys: string[] = []
    for (let i = min; i <= max; i++) keys.push(String(i))
    return keys
  }
  return []
}

function ReferenceDistributionEditor({
  question,
  onChange,
}: {
  question: QuestionDraft
  onChange: (patch: Partial<QuestionDraft>) => void
}) {
  const dist = question.reference_distribution ?? {}
  const entries = Object.entries(dist)
  const total = entries.reduce((s, [, v]) => s + v, 0)
  const hasEntries = entries.length > 0

  function updateDist(newDist: Record<string, number>) {
    onChange({ reference_distribution: Object.keys(newDist).length > 0 ? newDist : undefined })
  }

  function setEntry(key: string, value: number) {
    updateDist({ ...dist, [key]: value })
  }

  function removeEntry(key: string) {
    const next = { ...dist }
    delete next[key]
    updateDist(next)
  }

  function addEntry() {
    const existing = new Set(Object.keys(dist))
    const defaultKeys = getDefaultKeys(question)
    const nextKey = defaultKeys.find(k => !existing.has(k)) ?? `Hodnota ${entries.length + 1}`
    updateDist({ ...dist, [nextKey]: 0 })
  }

  function prefillFromOptions() {
    const keys = getDefaultKeys(question)
    if (keys.length === 0) return
    const even = Math.round((1 / keys.length) * 100) / 100
    const newDist: Record<string, number> = {}
    for (const k of keys) newDist[k] = dist[k] ?? even
    updateDist(newDist)
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">
        Reálné rozložení odpovědí z průzkumu (ČSÚ, CVVM, ESS). Součet by měl být ~1.0.
        Používá se pro kalibraci promptu (Layer 1) a post-hoc korekci distribuce (Layer 2).
      </p>

      {!hasEntries && (
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={prefillFromOptions}>
            <Plus className="h-3 w-3 mr-1" />
            Předvyplnit z možností
          </Button>
          <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={addEntry}>
            <Plus className="h-3 w-3 mr-1" />
            Přidat ručně
          </Button>
        </div>
      )}

      {hasEntries && (
        <>
          <div className="space-y-1">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-center gap-2">
                <Input
                  value={key}
                  onChange={(e) => {
                    const newKey = e.target.value
                    if (newKey === key) return
                    const next = { ...dist }
                    delete next[key]
                    next[newKey] = value
                    updateDist(next)
                  }}
                  className="h-7 text-xs flex-1"
                  placeholder="Odpověď"
                />
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="1"
                  value={value}
                  onChange={(e) => setEntry(key, Number(e.target.value) || 0)}
                  className="h-7 text-xs w-20 text-right"
                />
                <span className="text-[10px] text-muted-foreground w-10 text-right">{Math.round(value * 100)} %</span>
                <Button type="button" variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={() => removeEntry(key)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <Button type="button" variant="outline" size="sm" className="text-xs h-7" onClick={addEntry}>
              <Plus className="h-3 w-3 mr-1" />
              Přidat
            </Button>
            <span className={`text-[10px] ${Math.abs(total - 1) < 0.02 ? 'text-muted-foreground' : 'text-destructive font-medium'}`}>
              Součet: {(total * 100).toFixed(0)} %{Math.abs(total - 1) >= 0.02 && ' (měl by být ~100 %)'}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

function EditorSection({
  icon: Icon,
  title,
  children,
  defaultOpen = true,
}: {
  icon: React.ElementType
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <Icon className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">{title}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-3 pb-3 space-y-3">{children}</div>}
    </div>
  )
}

// ── Question list item (left panel) ─────────────────────────────────────────

function QuestionListItem({
  question,
  index,
  total,
  isSelected,
  hasErrors,
  onClick,
  onDelete,
  onMoveUp,
  onMoveDown,
  onDuplicate,
}: {
  question: QuestionDraft
  index: number
  total: number
  isSelected: boolean
  hasErrors: boolean
  onClick: () => void
  onDelete: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onDuplicate: () => void
}) {
  const summary = questionSummary(question)
  const hasAdvanced = !!question.skip_logic || !!question.piping_from || !!question.is_numeric || !!question.serial_subtraction
  const hasRefDist = !!question.reference_distribution && Object.keys(question.reference_distribution).length > 0

  return (
    <div
      className={`
        group relative rounded-lg border transition-all cursor-pointer
        ${isSelected
          ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/20'
          : hasErrors
            ? 'border-destructive/50 hover:border-destructive bg-destructive/5'
            : 'border-border hover:border-border/80 hover:bg-muted/20'
        }
      `}
      onClick={onClick}
    >
      {/* Main content */}
      <div className="flex items-start gap-2 p-2.5">
        <div className="flex flex-col items-center gap-0.5 pt-0.5 shrink-0">
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground/30" />
          <span className="text-[10px] font-mono text-muted-foreground/50">{question.id}</span>
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          {/* Type badge + required indicator */}
          <div className="flex items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${QUESTION_TYPE_COLORS[question.type]}`}>
              <QuestionTypeIcon type={question.type} className="h-3 w-3" />
              {QUESTION_TYPE_LABELS[question.type]}
            </span>
            {!question.required && (
              <span className="text-[10px] text-muted-foreground/50">volitelná</span>
            )}
            {hasAdvanced && (
              <span title="Pokročilé nastavení"><Zap className="h-3 w-3 text-amber-500/60" /></span>
            )}
            {hasRefDist && (
              <span title="Referenční distribuce"><BarChart2 className="h-3 w-3 text-blue-500/60" /></span>
            )}
            {hasErrors && (
              <AlertCircle className="h-3 w-3 text-destructive" />
            )}
          </div>

          {/* Question text preview */}
          <p className="text-sm leading-snug line-clamp-2">
            {question.text || <span className="text-muted-foreground/50 italic">Zadejte text otázky…</span>}
          </p>

          {/* Summary (options count, scale range, etc.) */}
          {summary && (
            <p className="text-[11px] text-muted-foreground/60">{summary}</p>
          )}
        </div>
      </div>

      {/* Action buttons - visible on hover */}
      <div className="absolute top-1 right-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm rounded px-0.5">
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === 0}
          onClick={(e) => { e.stopPropagation(); onMoveUp() }} title="Přesunout výš">
          <ChevronUp className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6" disabled={index === total - 1}
          onClick={(e) => { e.stopPropagation(); onMoveDown() }} title="Přesunout níž">
          <ChevronDown className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6"
          onClick={(e) => { e.stopPropagation(); onDuplicate() }} title="Duplikovat">
          <Copy className="h-3 w-3" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive"
          onClick={(e) => { e.stopPropagation(); onDelete() }} title="Smazat">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  )
}

// ── Right panel: Question editor ────────────────────────────────────────────

function QuestionEditorPanel({
  question,
  allQuestions,
  onChange,
  validationErrors,
}: {
  question: QuestionDraft
  allQuestions: QuestionDraft[]
  onChange: (patch: Partial<QuestionDraft>) => void
  validationErrors: string[]
}) {
  const otherQuestions = allQuestions.filter((q) => q.id !== question.id)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // matrix_rows as string[] for UI simplicity
  const matrixRowTexts = question.matrix_rows?.map((r) => r.text) ?? []
  function setMatrixRows(texts: string[]) {
    onChange({
      matrix_rows: texts.map((t, i) => ({ id: `R${String(i + 1).padStart(2, '0')}`, text: t })),
    })
  }

  return (
    <div className="space-y-4">
      {/* ── Section: Základní ── */}
      <EditorSection icon={FileText} title="Základní nastavení" defaultOpen={true}>
        {/* ID + Typ + Povinná */}
        <div className="grid grid-cols-[80px_1fr_auto] gap-2 items-end">
          <div>
            <Label className="text-xs text-muted-foreground">ID</Label>
            <Input
              value={question.id}
              onChange={(e) => onChange({ id: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}
              className="h-8 text-sm font-mono"
              maxLength={50}
            />
          </div>
          <div>
            <Label className="text-xs text-muted-foreground">Typ otázky</Label>
            <Select
              value={question.type}
              onValueChange={(v) => {
                const newType = v as QuestionType
                const patch: Partial<QuestionDraft> = {
                  type: newType,
                  options: undefined,
                  matrix_rows: undefined,
                  scale_min: undefined,
                  scale_max: undefined,
                  scale_min_label: undefined,
                  scale_max_label: undefined,
                }
                if (newType === QuestionType.NPS) { patch.scale_min = 0; patch.scale_max = 10 }
                if (newType === QuestionType.SEMANTIC_DIFF) { patch.scale_min = 1; patch.scale_max = 7 }
                onChange(patch)
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(QuestionType).map((t) => (
                  <SelectItem key={t} value={t}>
                    <span className="flex items-center gap-2">
                      <QuestionTypeIcon type={t} className="h-3.5 w-3.5" />
                      {QUESTION_TYPE_LABELS[t]}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="pb-1">
            <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none whitespace-nowrap">
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
            ref={textareaRef}
            value={question.text}
            onChange={(e) => onChange({ text: e.target.value })}
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary transition-colors"
            rows={3}
            maxLength={2000}
            placeholder="Zadejte text otázky…"
          />
          <div className="flex justify-between items-center mt-0.5">
            {question.piping_from && (
              <p className="text-[11px] text-muted-foreground">
                Tip: Použijte <code className="bg-muted px-1 rounded">{`{${question.piping_from}}`}</code> pro vložení odpovědi
              </p>
            )}
            <p className="text-[11px] text-muted-foreground ml-auto tabular-nums">{question.text.length}/2000</p>
          </div>
        </div>
      </EditorSection>

      {/* ── Section: Odpovědi (type-specific) ── */}
      {(needsOptions(question.type) || needsScale(question.type) || question.type === QuestionType.NPS) && (
        <EditorSection icon={List} title="Odpovědi a škály" defaultOpen={true}>
          {needsOptions(question.type) && question.type !== QuestionType.MATRIX && (
            <OptionsEditor
              label="Možnosti odpovědí"
              values={question.options ?? []}
              onChange={(v) => onChange({ options: v })}
            />
          )}

          {question.type === QuestionType.MATRIX && (
            <div className="grid grid-cols-2 gap-4">
              <OptionsEditor
                label="Sloupce (možnosti)"
                values={question.options ?? []}
                onChange={(v) => onChange({ options: v })}
                placeholder="Sloupec"
              />
              <OptionsEditor
                label="Řádky (tvrzení)"
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
            <ScaleEditor question={question} onChange={onChange} showLabels={false} />
          )}

          {question.type === QuestionType.SEMANTIC_DIFF && (
            <ScaleEditor question={question} onChange={onChange} showLabels={true} fixedMin={1} fixedMax={7} />
          )}

          {question.type === QuestionType.NPS && (
            <ScaleEditor question={question} onChange={onChange} showLabels={true} fixedMin={0} fixedMax={10} />
          )}
        </EditorSection>
      )}

      {/* ── Section: Stochastický bypass (only for NUMBER) ── */}
      {question.type === QuestionType.NUMBER && (
        <EditorSection icon={Calculator} title="PIAAC numerický bypass" defaultOpen={!!(question.is_numeric || question.serial_subtraction)}>
          <div className="space-y-4">

            {/* ── Mode A: single correct-answer numeric question ── */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={question.is_numeric ?? false}
                  onChange={(e) => onChange({
                    is_numeric: e.target.checked || undefined,
                    correct_answer: e.target.checked ? question.correct_answer : undefined,
                    correct_rate: e.target.checked ? question.correct_rate : undefined,
                    // mutually exclusive with serial_subtraction
                    serial_subtraction: e.target.checked ? undefined : question.serial_subtraction,
                  })}
                  className="rounded"
                />
                <span>Faktická otázka se správnou odpovědí</span>
              </label>
              <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                Zapne stochastický generátor odpovědí na základě PIAAC skóre respondenta.
                AI nebude použito — odpovědi budou statisticky kalibrovány.
              </p>
              {question.is_numeric && (
                <div className="pl-6 pt-1 space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Správná odpověď</Label>
                    <Input
                      type="number"
                      value={question.correct_answer ?? ''}
                      onChange={(e) => onChange({ correct_answer: e.target.value === '' ? undefined : Number(e.target.value) })}
                      className="h-8 text-sm w-40 mt-0.5"
                      placeholder="např. 600"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Podíl správných odpovědí v populaci (ČSÚ/PIAAC)</Label>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max="0.99"
                        value={question.correct_rate ?? ''}
                        onChange={(e) => onChange({ correct_rate: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="h-8 text-sm w-40"
                        placeholder="např. 0.63"
                      />
                      <span className="text-xs text-muted-foreground">
                        {question.correct_rate != null ? `${Math.round(question.correct_rate * 100)} %` : 'neuvedeno — použije se heuristika'}
                      </span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Hodnota 0.01–0.99. Kalibruje obtížnost IRT modelu tak, aby populační průměr P(správně) odpovídal referenčním datům.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* ── Separator ── */}
            <div className="border-t border-border/40" />

            {/* ── Mode B: serial subtraction (e.g. 100 − 7 × 5) ── */}
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={!!question.serial_subtraction}
                  onChange={(e) => onChange({
                    serial_subtraction: e.target.checked ? { start: 100, step: 7, count: 5 } : undefined,
                    // mutually exclusive with is_numeric
                    is_numeric: e.target.checked ? undefined : question.is_numeric,
                    correct_answer: e.target.checked ? undefined : question.correct_answer,
                    correct_rate: e.target.checked ? undefined : question.correct_rate,
                  })}
                  className="rounded"
                />
                <span>Sériové odečítání (kognitivní PIAAC bypass)</span>
              </label>
              <p className="text-[11px] text-muted-foreground leading-relaxed pl-6">
                Pro otázky typu „100 − 7, od výsledku znovu − 7…". Generuje sekvenci odpovědí a mapuje
                skóre (počet správných odečtení) na škálu 1–5 dle PIAAC numerické způsobilosti respondenta.
                AI nebude použito.
              </p>
              {question.serial_subtraction && (
                <div className="pl-6 pt-1 space-y-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-muted-foreground">Počáteční číslo</Label>
                      <Input
                        type="number"
                        value={question.serial_subtraction.start}
                        onChange={(e) => onChange({
                          serial_subtraction: {
                            ...question.serial_subtraction!,
                            start: e.target.value === '' ? 100 : Number(e.target.value),
                          },
                        })}
                        className="h-8 text-sm mt-0.5"
                        placeholder="100"
                        min={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Krok odečítání</Label>
                      <Input
                        type="number"
                        value={question.serial_subtraction.step}
                        onChange={(e) => onChange({
                          serial_subtraction: {
                            ...question.serial_subtraction!,
                            step: e.target.value === '' ? 7 : Number(e.target.value),
                          },
                        })}
                        className="h-8 text-sm mt-0.5"
                        placeholder="7"
                        min={1}
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Počet opakování</Label>
                      <Input
                        type="number"
                        value={question.serial_subtraction.count}
                        onChange={(e) => onChange({
                          serial_subtraction: {
                            ...question.serial_subtraction!,
                            count: e.target.value === '' ? 5 : Number(e.target.value),
                          },
                        })}
                        className="h-8 text-sm mt-0.5"
                        placeholder="5"
                        min={1}
                        max={20}
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Správné odpovědi:{' '}
                    {Array.from({ length: question.serial_subtraction.count }, (_, i) =>
                      question.serial_subtraction!.start - question.serial_subtraction!.step * (i + 1)
                    ).join(', ')}
                    {' '}→ skóre 1–5
                  </p>
                </div>
              )}
            </div>

          </div>
        </EditorSection>
      )}

      {/* ── Section: Referenční distribuce ── */}
      {question.type !== QuestionType.OPEN_TEXT && question.type !== QuestionType.MATRIX && question.type !== QuestionType.RANKING && (
        <EditorSection icon={BarChart2} title="Referenční distribuce (ČSÚ/CVVM)" defaultOpen={!!question.reference_distribution && Object.keys(question.reference_distribution).length > 0}>
          <ReferenceDistributionEditor question={question} onChange={onChange} />
        </EditorSection>
      )}

      {/* ── Section: Pokročilé ── */}
      <EditorSection icon={Settings2} title="Pokročilé nastavení" defaultOpen={!!question.skip_logic || !!question.piping_from}>
        {/* Skip logic */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <GitBranch className="h-3 w-3 text-muted-foreground" />
            <Label className="text-xs text-muted-foreground">Podmíněné zobrazení</Label>
          </div>
          <div className="flex gap-2 items-center">
            <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">Zobraz pokud</span>
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
              <SelectTrigger className="h-8 text-xs flex-1">
                <SelectValue placeholder="— žádná podmínka —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">— žádná podmínka —</SelectItem>
                {otherQuestions.map((q) => (
                  <SelectItem key={q.id} value={q.id}>
                    <span className="font-mono">{q.id}</span> {q.text.substring(0, 35)}{q.text.length > 35 ? '…' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {question.skip_logic && (
              <>
                <span className="text-xs text-muted-foreground whitespace-nowrap">=</span>
                <Input
                  value={question.skip_logic.show_if_answer}
                  onChange={(e) =>
                    onChange({ skip_logic: { ...question.skip_logic!, show_if_answer: e.target.value } })
                  }
                  className="h-8 text-xs w-28"
                  placeholder="Hodnota"
                  maxLength={200}
                />
              </>
            )}
          </div>
        </div>

        {/* Piping */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Link2 className="h-3 w-3 text-muted-foreground" />
            <Label className="text-xs text-muted-foreground">Vložit odpověď z otázky (piping)</Label>
          </div>
          <Select
            value={question.piping_from ?? '__none__'}
            onValueChange={(v) => onChange({ piping_from: v === '__none__' ? undefined : v })}
          >
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="— nevkládat —" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— nevkládat —</SelectItem>
              {otherQuestions.map((q) => (
                <SelectItem key={q.id} value={q.id}>
                  <span className="font-mono">{q.id}</span> {q.text.substring(0, 35)}{q.text.length > 35 ? '…' : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </EditorSection>

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            Chyby validace
          </div>
          {validationErrors.map((e, i) => (
            <p key={i} className="text-xs text-destructive/80 pl-5">{e}</p>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Empty state (right panel) ───────────────────────────────────────────────

function EmptyEditorState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <FileText className="h-8 w-8 text-muted-foreground/30" />
      </div>
      <p className="text-sm text-muted-foreground mb-1">Vyberte otázku k editaci</p>
      <p className="text-xs text-muted-foreground/60 mb-4">nebo vytvořte novou otázku</p>
      <Button variant="outline" size="sm" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5 mr-1.5" /> Přidat otázku
      </Button>
    </div>
  )
}

// ── Main dialog ─────────────────────────────────────────────────────────────

export interface QuestionnaireEditorDialogProps {
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
  const [originalName, setOriginalName] = useState(initialName)
  const [questions, setQuestions] = useState<QuestionDraft[]>([])
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [questionnaireIdState, setQuestionnaireIdState] = useState<string | null>(questionnaireId)
  const [qErrors, setQErrors] = useState<Record<number, string[]>>({})
  const listEndRef = useRef<HTMLDivElement>(null)

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
          const loadedName = data.name ?? initialName
          setName(loadedName)
          setOriginalName(loadedName)
          const qs = (data.questions as QuestionDraft[]) ?? []
          setQuestions(qs)
          if (qs.length > 0) setSelectedIdx(0)
        })
        .catch((e: Error) => setError(`Nepodařilo se načíst dotazník: ${e.message}`))
        .finally(() => setLoading(false))
    } else {
      setQuestionnaireIdState(null)
      setName(initialName)
      setQuestions([])
      setSelectedIdx(null)
    }
  }, [open, questionnaireId]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateQuestion = useCallback((idx: number, patch: Partial<QuestionDraft>) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, ...patch } : q)))
    setQErrors((prev) => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }, [])

  function addQuestion() {
    const newQ = defaultQuestion(questions)
    setQuestions((prev) => [...prev, newQ])
    const newIdx = questions.length
    setSelectedIdx(newIdx)
    // Scroll to bottom after render
    setTimeout(() => listEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50)
  }

  function duplicateQuestion(idx: number) {
    const original = questions[idx]
    if (!original) return
    const dupe: QuestionDraft = {
      ...original,
      id: nextId(questions),
      order: questions.length + 1,
    }
    setQuestions((prev) => {
      const next = [...prev]
      next.splice(idx + 1, 0, dupe)
      return next.map((q, i) => ({ ...q, order: i + 1 }))
    })
    setSelectedIdx(idx + 1)
  }

  function deleteQuestion(idx: number) {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== idx)
      return next.map((q, i) => ({ ...q, order: i + 1 }))
    })
    if (selectedIdx === idx) {
      setSelectedIdx(idx > 0 ? idx - 1 : (questions.length > 1 ? 0 : null))
    } else if (selectedIdx !== null && selectedIdx > idx) {
      setSelectedIdx(selectedIdx - 1)
    }
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
    if (selectedIdx === idx) setSelectedIdx(newIdx)
    else if (selectedIdx === newIdx) setSelectedIdx(idx)
  }

  function validateAll(): boolean {
    const errors: Record<number, string[]> = {}
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
    // Select first question with error
    const firstErrorIdx = Object.keys(errors).map(Number).sort((a, b) => a - b)[0]
    if (firstErrorIdx !== undefined) setSelectedIdx(firstErrorIdx)
    return Object.keys(errors).length === 0
  }

  async function handleSave() {
    setError(null)

    if (!name.trim()) { setError('Zadejte název dotazníku'); return }
    if (questions.length === 0) { setError('Přidejte alespoň jednu otázku'); return }
    if (!validateAll()) { setError('Některé otázky obsahují chyby — opravte je před uložením'); return }

    setSaving(true)
    try {
      let id = questionnaireIdState
      if (!id) {
        const created = await createEmptyQuestionnaire(name.trim())
        id = created.id
        setQuestionnaireIdState(id)
      } else if (name.trim() !== originalName) {
        // Update name if it changed
        await updateQuestionnaire(id, { name: name.trim() })
      }
      await saveQuestionsJson(id, questions as unknown as Question[])
      onSaved()
      onOpenChange(false)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Nepodařilo se uložit dotazník')
    } finally {
      setSaving(false)
    }
  }

  const selectedQuestion = selectedIdx !== null ? questions[selectedIdx] : null
  const errorCount = Object.keys(qErrors).length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[92vh] flex flex-col gap-0 p-0">
        {/* ── Header ── */}
        <DialogHeader className="px-5 pt-4 pb-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <DialogTitle className="text-base">
              {questionnaireIdState ? 'Upravit dotazník' : 'Nový dotazník'}
            </DialogTitle>
            {questions.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {questions.length} {questions.length === 1 ? 'otázka' : questions.length < 5 ? 'otázky' : 'otázek'}
              </Badge>
            )}
            {errorCount > 0 && (
              <Badge variant="destructive" className="text-xs">
                <AlertCircle className="h-3 w-3 mr-1" />
                {errorCount} {errorCount === 1 ? 'chyba' : errorCount < 5 ? 'chyby' : 'chyb'}
              </Badge>
            )}
          </div>
          {/* Název */}
          <div className="flex items-center gap-2 mt-2">
            <Label htmlFor="qe-name" className="text-xs text-muted-foreground shrink-0">Název:</Label>
            <Input
              id="qe-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Název dotazníku"
              className="h-7 text-sm"
              maxLength={200}
            />
          </div>
        </DialogHeader>

        {/* ── Body: Split panel ── */}
        <div className="flex-1 flex min-h-0">
          {/* Left panel: Question list */}
          <div className="w-[320px] shrink-0 border-r flex flex-col bg-muted/10">
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
              {loading && (
                <p className="text-sm text-muted-foreground text-center py-8">Načítám…</p>
              )}
              {!loading && questions.length === 0 && (
                <div className="text-center py-8 px-4">
                  <p className="text-sm text-muted-foreground mb-3">Zatím žádné otázky</p>
                  <Button variant="outline" size="sm" onClick={addQuestion}>
                    <Plus className="h-3.5 w-3.5 mr-1.5" /> Přidat první otázku
                  </Button>
                </div>
              )}
              {!loading && questions.map((q, i) => (
                <QuestionListItem
                  key={`${i}-${q.id}`}
                  question={q}
                  index={i}
                  total={questions.length}
                  isSelected={selectedIdx === i}
                  hasErrors={(qErrors[i]?.length ?? 0) > 0}
                  onClick={() => setSelectedIdx(selectedIdx === i ? null : i)}
                  onDelete={() => deleteQuestion(i)}
                  onMoveUp={() => moveQuestion(i, 'up')}
                  onMoveDown={() => moveQuestion(i, 'down')}
                  onDuplicate={() => duplicateQuestion(i)}
                />
              ))}
              <div ref={listEndRef} />
            </div>
            {/* Add button at bottom of list */}
            {!loading && questions.length > 0 && (
              <div className="p-2 border-t">
                <Button type="button" variant="outline" onClick={addQuestion} className="w-full h-8 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1.5" /> Přidat otázku
                </Button>
              </div>
            )}
          </div>

          {/* Right panel: Editor */}
          <div className="flex-1 overflow-y-auto">
            {selectedQuestion ? (
              <div className="p-4">
                {/* Selected question header */}
                <div className="flex items-center gap-2 mb-4 pb-3 border-b">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium border ${QUESTION_TYPE_COLORS[selectedQuestion.type]}`}>
                    <QuestionTypeIcon type={selectedQuestion.type} className="h-4 w-4" />
                    {QUESTION_TYPE_LABELS[selectedQuestion.type]}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{selectedQuestion.id}</span>
                  <span className="text-xs text-muted-foreground">•</span>
                  <span className="text-xs text-muted-foreground">Otázka {(selectedIdx ?? 0) + 1} z {questions.length}</span>
                  {(qErrors[selectedIdx!]?.length ?? 0) === 0 && selectedQuestion.text && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 ml-auto" />
                  )}
                </div>
                <QuestionEditorPanel
                  question={selectedQuestion}
                  allQuestions={questions}
                  onChange={(patch) => updateQuestion(selectedIdx!, patch)}
                  validationErrors={qErrors[selectedIdx!] ?? []}
                />
              </div>
            ) : (
              <EmptyEditorState onAdd={addQuestion} />
            )}
          </div>
        </div>

        {/* ── Footer ── */}
        <DialogFooter className="px-5 py-3 border-t shrink-0 flex items-center">
          {error && (
            <p className="text-sm text-destructive flex items-center gap-1.5 mr-auto">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex gap-2 ml-auto">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={saving || loading}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? 'Ukládám…' : 'Uložit dotazník'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
