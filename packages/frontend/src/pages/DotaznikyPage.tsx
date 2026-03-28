import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Plus,
  Download,
  Trash2,
  FileUp,
  ChevronRight,
  ToggleLeft,
  List,
  Hash,
  AlignLeft,
  BarChart2,
  Star,
  Grid,
  TrendingUp,
  Diff,
  Pencil,
  Calendar,
  Search,
  MoreHorizontal,
  Eye,
  Copy,
} from 'lucide-react'
import {
  getQuestionnaires, getQuestionnaire, createQuestionnaire, exportQuestionnaire, deleteQuestionnaire,
  downloadTemplate, type QuestionnaireListItem,
} from '../lib/api'
import type { Question } from '@respondex/shared'
import { Button } from '../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { QuestionnaireEditorDialog } from '../components/questionnaire-editor/QuestionnaireEditorDialog'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function formatDateShort(iso: string): string {
  return new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Question type helpers ──────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<string, string> = {
  yes_no: 'Ano / Ne',
  single_choice: 'Jedna volba',
  multi_choice: 'Více voleb',
  likert: 'Likert',
  number: 'Číslo',
  open_text: 'Otevřená',
  ranking: 'Pořadí',
  matrix: 'Matice',
  nps: 'NPS',
  semantic_diff: 'Sém. dif.',
}

const QUESTION_TYPE_COLORS: Record<string, string> = {
  yes_no: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
  single_choice: 'bg-blue-500/10 text-blue-700 border-blue-200',
  multi_choice: 'bg-indigo-500/10 text-indigo-700 border-indigo-200',
  likert: 'bg-amber-500/10 text-amber-700 border-amber-200',
  number: 'bg-purple-500/10 text-purple-700 border-purple-200',
  open_text: 'bg-slate-500/10 text-slate-700 border-slate-200',
  ranking: 'bg-orange-500/10 text-orange-700 border-orange-200',
  matrix: 'bg-teal-500/10 text-teal-700 border-teal-200',
  nps: 'bg-rose-500/10 text-rose-700 border-rose-200',
  semantic_diff: 'bg-cyan-500/10 text-cyan-700 border-cyan-200',
}

function QuestionTypeIcon({ type }: { type: string }) {
  const cls = 'h-3.5 w-3.5'
  switch (type) {
    case 'yes_no': return <ToggleLeft className={cls} />
    case 'single_choice': return <List className={cls} />
    case 'multi_choice': return <List className={cls} />
    case 'likert': return <Star className={cls} />
    case 'number': return <Hash className={cls} />
    case 'open_text': return <AlignLeft className={cls} />
    case 'ranking': return <BarChart2 className={cls} />
    case 'matrix': return <Grid className={cls} />
    case 'nps': return <TrendingUp className={cls} />
    case 'semantic_diff': return <Diff className={cls} />
    default: return <FileText className={cls} />
  }
}

// ── Questionnaire detail dialog ────────────────────────────────────────────

interface DetailDialogProps {
  questionnaire: QuestionnaireListItem | null
  onClose: () => void
}

function QuestionnaireDetailDialog({ questionnaire, onClose }: DetailDialogProps) {
  const [questions, setQuestions] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (!questionnaire) { setQuestions([]); return }
    let cancelled = false
    setLoading(true); setError(null); setExpandedId(null)
    getQuestionnaire(questionnaire.id)
      .then((data) => { if (!cancelled) setQuestions(data.questions ?? []) })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Chyba při načítání.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [questionnaire])

  function handleClose() { setQuestions([]); setError(null); setExpandedId(null); onClose() }

  // Count question types
  const typeCounts: Record<string, number> = {}
  questions.forEach((q) => { typeCounts[q.type] = (typeCounts[q.type] ?? 0) + 1 })

  return (
    <Dialog open={!!questionnaire} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between pr-8">
            <div className="space-y-2">
              <DialogTitle className="text-lg">{questionnaire?.name}</DialogTitle>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" />
                  {questionnaire?.question_count ?? 0} otázek
                </span>
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" />
                  {questionnaire ? formatDate(questionnaire.created_at) : ''}
                </span>
              </div>
              {/* Type breakdown pills */}
              {Object.keys(typeCounts).length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {Object.entries(typeCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([type, count]) => (
                      <span
                        key={type}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${QUESTION_TYPE_COLORS[type] ?? 'bg-muted text-muted-foreground'}`}
                      >
                        <QuestionTypeIcon type={type} />
                        {count}× {QUESTION_TYPE_LABELS[type] ?? type}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading && <p className="text-sm text-muted-foreground px-6 py-6">Načítám otázky…</p>}
          {error && <p className="text-sm text-destructive px-6 py-6">{error}</p>}
          {!loading && !error && questions.length === 0 && (
            <p className="text-sm text-muted-foreground px-6 py-8 text-center">Dotazník neobsahuje žádné otázky.</p>
          )}
          {!loading && questions.length > 0 && (
            <div className="p-4 space-y-1">
              {questions.map((q) => {
                const isExpanded = expandedId === q.id
                const hasOptions = (q.options?.length ?? 0) > 0
                const hasScale = q.scale_min !== undefined || q.scale_max !== undefined
                const hasSkipLogic = !!q.skip_logic
                const hasPiping = !!q.piping_from
                const typeColor = QUESTION_TYPE_COLORS[q.type] ?? 'bg-muted text-muted-foreground'

                return (
                  <div
                    key={q.id}
                    className={`border rounded-lg transition-colors ${isExpanded ? 'bg-muted/20 border-border' : 'hover:bg-muted/10'}`}
                  >
                    {/* Collapsed row */}
                    <div
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : q.id)}
                    >
                      <ChevronRight className={`h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      <span className="text-xs font-mono text-muted-foreground/60 w-6 shrink-0">{q.order}</span>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${typeColor}`}>
                        <QuestionTypeIcon type={q.type} />
                        {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                      </span>
                      <span className="flex-1 text-sm truncate">{q.text}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        {q.is_numeric && <Badge variant="outline" className="text-[10px] py-0 border-purple-200 text-purple-600">PIAAC</Badge>}
                        {hasSkipLogic && <Badge variant="outline" className="text-[10px] py-0">Podmíněná</Badge>}
                        {!q.required && <Badge variant="secondary" className="text-[10px] py-0">Volitelná</Badge>}
                      </div>
                    </div>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 ml-10 space-y-2 border-t border-dashed">
                        <p className="text-sm leading-relaxed">{q.text}</p>

                        {hasOptions && (
                          <div className="flex gap-2 text-xs items-start">
                            <span className="text-muted-foreground w-24 shrink-0 pt-0.5">Možnosti</span>
                            <div className="flex flex-wrap gap-1">
                              {q.options!.map((o, i) => (
                                <span key={i} className="bg-muted rounded-md px-2 py-0.5 text-[11px]">{o}</span>
                              ))}
                            </div>
                          </div>
                        )}

                        {hasScale && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground w-24 shrink-0">Škála</span>
                            <span>
                              {q.scale_min_label ? `„${q.scale_min_label}" (${q.scale_min})` : q.scale_min}
                              {' → '}
                              {q.scale_max_label ? `„${q.scale_max_label}" (${q.scale_max})` : q.scale_max}
                            </span>
                          </div>
                        )}

                        {q.is_numeric && q.correct_answer !== undefined && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground w-24 shrink-0">Správná odpověď</span>
                            <span className="font-mono font-medium text-purple-600">{q.correct_answer}</span>
                          </div>
                        )}

                        {hasSkipLogic && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground w-24 shrink-0">Podmínka</span>
                            <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                              {q.skip_logic!.question_id} = {q.skip_logic!.show_if_answer}
                            </code>
                          </div>
                        )}

                        {hasPiping && (
                          <div className="flex gap-2 text-xs">
                            <span className="text-muted-foreground w-24 shrink-0">Piping</span>
                            <code className="bg-muted px-1.5 py-0.5 rounded text-[10px]">
                              {'{' + q.piping_from + '}'}
                            </code>
                          </div>
                        )}

                        {q.matrix_rows && q.matrix_rows.length > 0 && (
                          <div className="flex gap-2 text-xs items-start">
                            <span className="text-muted-foreground w-24 shrink-0 pt-0.5">Řádky matice</span>
                            <div className="flex flex-wrap gap-1">
                              {q.matrix_rows.map((r) => (
                                <span key={r.id} className="bg-muted rounded-md px-2 py-0.5 text-[11px]">{r.text}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex-shrink-0 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{questions.length} otázek celkem</span>
          <Button variant="outline" size="sm" onClick={handleClose}>Zavřít</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── New questionnaire dialog ───────────────────────────────────────────────

interface NewDialogProps { open: boolean; onClose: () => void; onCreated: () => void }

function NewQuestionnaireDialog({ open, onClose, onCreated }: NewDialogProps) {
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() { setName(''); setFile(null); setError(null); setLoading(false) }
  function handleClose() { reset(); onClose() }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Zadejte název dotazníku.'); return }
    if (!file) { setError('Vyberte soubor XLSX.'); return }
    setLoading(true); setError(null)
    try {
      await createQuestionnaire(name.trim(), file)
      reset(); onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Neočekávaná chyba.')
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Import dotazníku z XLSX</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-name">Název dotazníku</Label>
            <Input id="q-name" placeholder="např. Průzkum spokojenosti 2024" value={name}
              onChange={(e) => setName(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-file">XLSX soubor</Label>
            <div className="border-2 border-dashed rounded-lg p-6 text-center hover:border-primary/50 transition-colors">
              <FileUp className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
              <Input id="q-file" type="file" accept=".xlsx" disabled={loading}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="max-w-xs mx-auto" />
              {file && <p className="text-xs text-muted-foreground mt-2">{file.name} ({(file.size / 1024).toFixed(0)} KB)</p>}
            </div>
            <p className="text-xs text-muted-foreground">
              Potřebujete šablonu?{' '}
              <button type="button" className="underline hover:text-foreground transition-colors" onClick={() => downloadTemplate('questionnaire')}>
                Stáhnout vzorovou šablonu
              </button>
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Zrušit</Button>
            <Button type="submit" disabled={loading}>
              <FileUp className="h-4 w-4 mr-2" />
              {loading ? 'Nahrávám…' : 'Importovat'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// ── Delete confirm ─────────────────────────────────────────────────────────

interface DeleteDialogProps {
  questionnaire: QuestionnaireListItem | null
  onClose: () => void
  onDeleted: () => void
}

function DeleteDialog({ questionnaire, onClose, onDeleted }: DeleteDialogProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    if (!questionnaire) return
    setLoading(true)
    try { await deleteQuestionnaire(questionnaire.id); onDeleted() }
    catch (err) { setError(err instanceof Error ? err.message : 'Neočekávaná chyba.'); setLoading(false) }
  }

  return (
    <Dialog open={!!questionnaire} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Smazat dotazník</DialogTitle></DialogHeader>
        <p className="text-sm">
          Opravdu chcete smazat dotazník <strong>{questionnaire?.name}</strong>?
          Tuto akci nelze vrátit zpět.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Zrušit</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            <Trash2 className="h-4 w-4 mr-2" />
            {loading ? 'Mažu…' : 'Smazat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Questionnaire card ────────────────────────────────────────────────────

function QuestionnaireCard({
  q,
  onView,
  onEdit,
  onExport,
  onDelete,
  exporting,
}: {
  q: QuestionnaireListItem
  onView: () => void
  onEdit: () => void
  onExport: () => void
  onDelete: () => void
  exporting: boolean
}) {
  return (
    <div
      className="group border rounded-xl p-4 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
      onClick={onView}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{q.name}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <FileText className="h-3 w-3" />
              {q.question_count} otázek
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {formatDateShort(q.created_at)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Zobrazit" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Upravit v editoru" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Export XLSX" disabled={exporting} onClick={onExport}>
            <FileUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" title="Smazat" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export function DotaznikyPage() {
  const [questionnaires, setQuestionnaires] = useState<QuestionnaireListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [newDialogOpen, setNewDialogOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<QuestionnaireListItem | null>(null)
  const [detailTarget, setDetailTarget] = useState<QuestionnaireListItem | null>(null)
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [editorTarget, setEditorTarget] = useState<string | 'new' | null>(null)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setFetchError(null)
    try {
      const data = await getQuestionnaires()
      const list = Array.isArray(data)
        ? data
        : (data as unknown as { questionnaires: QuestionnaireListItem[] }).questionnaires ?? []
      setQuestionnaires(list)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Chyba při načítání dotazníků.')
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  async function handleExport(id: string) {
    setExportingId(id)
    try { await exportQuestionnaire(id) } catch { /* non-critical */ } finally { setExportingId(null) }
  }

  const filtered = search.trim()
    ? questionnaires.filter((q) => q.name.toLowerCase().includes(search.toLowerCase()))
    : questionnaires

  return (
    <div className="p-8 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileText className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Dotazníky</h2>
            <p className="text-xs text-muted-foreground">Správa dotazníků pro simulace</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('questionnaire')}>
            <Download className="h-4 w-4 mr-1.5" />Šablona
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditorTarget('new')}>
            <Pencil className="h-4 w-4 mr-1.5" />Vytvořit v editoru
          </Button>
          <Button size="sm" onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Import z XLSX
          </Button>
        </div>
      </div>

      {/* Search bar (when there are questionnaires) */}
      {!loading && questionnaires.length > 3 && (
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat dotazník…"
            className="pl-9 h-9"
          />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="text-center py-12">
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-muted rounded-xl" />
            <div className="h-16 bg-muted rounded-xl" />
            <div className="h-16 bg-muted rounded-xl" />
          </div>
          <p className="text-sm text-muted-foreground mt-4">Načítám dotazníky… (první načtení může trvat až 30 s)</p>
        </div>
      )}

      {/* Error */}
      {fetchError && (
        <Card className="border-destructive/30">
          <CardContent className="py-8 text-center space-y-3">
            <p className="text-destructive text-sm">{fetchError}</p>
            <Button variant="outline" size="sm" onClick={() => void load()}>Zkusit znovu</Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!loading && !fetchError && questionnaires.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto mb-4">
              <FileText className="h-8 w-8 text-muted-foreground/30" />
            </div>
            <p className="text-muted-foreground text-sm mb-1">Zatím žádné dotazníky</p>
            <p className="text-muted-foreground/60 text-xs mb-4">Vytvořte první dotazník importem z Excelu nebo přímo v editoru</p>
            <div className="flex gap-2 justify-center">
              <Button variant="outline" size="sm" onClick={() => setEditorTarget('new')}>
                <Pencil className="h-4 w-4 mr-1.5" /> Vytvořit v editoru
              </Button>
              <Button size="sm" onClick={() => setNewDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-1.5" /> Import z XLSX
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questionnaire list */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map((q) => (
            <QuestionnaireCard
              key={q.id}
              q={q}
              onView={() => setDetailTarget(q)}
              onEdit={() => setEditorTarget(q.id)}
              onExport={() => void handleExport(q.id)}
              onDelete={() => setDeleteTarget(q)}
              exporting={exportingId === q.id}
            />
          ))}
        </div>
      )}

      {/* No search results */}
      {!loading && questionnaires.length > 0 && filtered.length === 0 && search.trim() && (
        <p className="text-sm text-muted-foreground text-center py-8">
          Žádný dotazník neodpovídá „{search}"
        </p>
      )}

      {/* Dialogs */}
      <NewQuestionnaireDialog open={newDialogOpen} onClose={() => setNewDialogOpen(false)}
        onCreated={() => { setNewDialogOpen(false); void load() }} />
      <DeleteDialog questionnaire={deleteTarget} onClose={() => setDeleteTarget(null)}
        onDeleted={() => { setDeleteTarget(null); void load() }} />
      <QuestionnaireDetailDialog questionnaire={detailTarget} onClose={() => setDetailTarget(null)} />
      <QuestionnaireEditorDialog
        open={editorTarget !== null}
        questionnaireId={editorTarget === 'new' ? null : (editorTarget ?? null)}
        onOpenChange={(o) => { if (!o) setEditorTarget(null) }}
        onSaved={() => { setEditorTarget(null); void load() }}
      />
    </div>
  )
}
