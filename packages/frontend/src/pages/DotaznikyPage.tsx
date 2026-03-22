import { useState, useEffect, useCallback } from 'react'
import { FileText, Plus, Download, Trash2, FileUp, ChevronRight, Tag, List, Hash, ToggleLeft, AlignLeft, BarChart2, Star, Grid, TrendingUp, Diff, Pencil } from 'lucide-react'
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

// ── Question type helpers ──────────────────────────────────────────────────

const QUESTION_TYPE_LABELS: Record<string, string> = {
  yes_no: 'Ano / Ne',
  single_choice: 'Jedna volba',
  multi_choice: 'Více voleb',
  likert: 'Likertova škála',
  number: 'Číslo',
  open_text: 'Otevřená odpověď',
  ranking: 'Pořadí',
  matrix: 'Matice',
  nps: 'NPS',
  semantic_diff: 'Sémantický diferenciál',
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
    default: return <Tag className={cls} />
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

  return (
    <Dialog open={!!questionnaire} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col gap-0 p-0">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-start justify-between pr-8">
            <div>
              <DialogTitle className="text-xl">{questionnaire?.name}</DialogTitle>
              <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                <span>
                  <Badge variant="secondary" className="mr-1.5">{questionnaire?.question_count ?? 0}</Badge>
                  otázek
                </span>
                <span>Vytvořeno {questionnaire ? formatDate(questionnaire.created_at) : ''}</span>
                {questionnaire?.updated_at && questionnaire.updated_at !== questionnaire.created_at && (
                  <span>Upraveno {formatDate(questionnaire.updated_at)}</span>
                )}
              </div>
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
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-muted/50 sticky top-0">
                    <th className="w-6 px-3 py-2" />
                    <th className="text-left px-3 py-2 font-medium w-10">#</th>
                    <th className="text-left px-3 py-2 font-medium w-14">ID</th>
                    <th className="text-left px-3 py-2 font-medium">Text otázky</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Typ</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Povinná</th>
                    <th className="text-left px-3 py-2 font-medium whitespace-nowrap">Možnosti / Škála</th>
                  </tr>
                </thead>
                <tbody>
                  {questions.map((q) => {
                    const isExpanded = expandedId === q.id
                    const hasOptions = (q.options?.length ?? 0) > 0
                    const hasScale = q.scale_min !== undefined || q.scale_max !== undefined
                    const hasSkipLogic = !!q.skip_logic
                    const hasPiping = !!q.piping_from
                    const hasExtra = hasSkipLogic || hasPiping || (q.scale_min_label ?? q.scale_max_label)

                    return (
                      <>
                        <tr
                          key={q.id}
                          className={`border-b hover:bg-muted/20 cursor-pointer transition-colors ${isExpanded ? 'bg-muted/30' : ''}`}
                          onClick={() => setExpandedId(isExpanded ? null : q.id)}
                        >
                          <td className="px-3 py-2 text-muted-foreground">
                            <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{q.order}</td>
                          <td className="px-3 py-2 font-mono text-[10px] text-muted-foreground">{q.id}</td>
                          <td className="px-3 py-2 max-w-xs">
                            <span className="line-clamp-2">{q.text}</span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="flex items-center gap-1 text-muted-foreground">
                              <QuestionTypeIcon type={q.type} />
                              {QUESTION_TYPE_LABELS[q.type] ?? q.type}
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            {q.required
                              ? <Badge variant="secondary" className="text-[10px] py-0">Ano</Badge>
                              : <span className="text-muted-foreground/50">Ne</span>}
                          </td>
                          <td className="px-3 py-2 text-muted-foreground max-w-[180px]">
                            {hasOptions && (
                              <span className="line-clamp-1">{q.options!.join(' · ')}</span>
                            )}
                            {hasScale && !hasOptions && (
                              <span>{q.scale_min ?? '?'} – {q.scale_max ?? '?'}</span>
                            )}
                            {!hasOptions && !hasScale && '–'}
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr key={`${q.id}-detail`} className="border-b bg-muted/10">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="space-y-2.5">
                                {/* Full text */}
                                <div className="flex gap-2 text-xs">
                                  <span className="text-muted-foreground w-28 flex-shrink-0">Plné znění</span>
                                  <span className="font-medium leading-relaxed">{q.text}</span>
                                </div>

                                {/* Options */}
                                {hasOptions && (
                                  <div className="flex gap-2 text-xs">
                                    <span className="text-muted-foreground w-28 flex-shrink-0">Možnosti ({q.options!.length})</span>
                                    <div className="flex flex-wrap gap-1">
                                      {q.options!.map((o, i) => (
                                        <span key={i} className="bg-muted rounded px-1.5 py-0.5 text-[10px]">{o}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Scale */}
                                {hasScale && (
                                  <div className="flex gap-2 text-xs">
                                    <span className="text-muted-foreground w-28 flex-shrink-0">Škála</span>
                                    <span>
                                      {q.scale_min_label
                                        ? `"${q.scale_min_label}" (${q.scale_min})`
                                        : q.scale_min}
                                      {' → '}
                                      {q.scale_max_label
                                        ? `"${q.scale_max_label}" (${q.scale_max})`
                                        : q.scale_max}
                                    </span>
                                  </div>
                                )}

                                {/* Skip logic */}
                                {hasSkipLogic && (
                                  <div className="flex gap-2 text-xs">
                                    <span className="text-muted-foreground w-28 flex-shrink-0">Zobrazit jen když</span>
                                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                      {q.skip_logic!.question_id} = {q.skip_logic!.show_if_answer}
                                    </span>
                                  </div>
                                )}

                                {/* Piping */}
                                {hasPiping && (
                                  <div className="flex gap-2 text-xs">
                                    <span className="text-muted-foreground w-28 flex-shrink-0">Vkládá odpověď</span>
                                    <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[10px]">
                                      {'{' + q.piping_from + '}'}
                                    </span>
                                  </div>
                                )}

                                {/* Matrix rows */}
                                {q.matrix_rows && q.matrix_rows.length > 0 && (
                                  <div className="flex gap-2 text-xs">
                                    <span className="text-muted-foreground w-28 flex-shrink-0">Řádky matice</span>
                                    <div className="flex flex-wrap gap-1">
                                      {q.matrix_rows.map((r) => (
                                        <span key={r.id} className="bg-muted rounded px-1.5 py-0.5 text-[10px]">{r.text}</span>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {!hasOptions && !hasScale && !hasSkipLogic && !hasPiping && (
                                  <p className="text-xs text-muted-foreground italic">Žádné další parametry.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t flex-shrink-0 bg-muted/30 flex items-center justify-between">
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
        <DialogHeader><DialogTitle>Nový dotazník</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="q-name">Název dotazníku</Label>
            <Input id="q-name" placeholder="např. Průzkum spokojenosti 2024" value={name}
              onChange={(e) => setName(e.target.value)} disabled={loading} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="q-file">XLSX soubor</Label>
            <Input id="q-file" type="file" accept=".xlsx" disabled={loading}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            <p className="text-xs text-muted-foreground">
              Potřebujete šablonu?{' '}
              <button type="button" className="underline" onClick={() => downloadTemplate('questionnaire')}>
                Stáhnout vzorovou šablonu
              </button>
            </p>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={handleClose} disabled={loading}>Zrušit</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Nahrávám…' : 'Vytvořit'}</Button>
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
        <p className="text-sm">Opravdu chcete smazat dotazník <strong>{questionnaire?.name}</strong>?</p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Zrušit</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? 'Mažu…' : 'Smazat'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
  // Editor state: null = closed, 'new' = create new, string = edit existing by id
  const [editorTarget, setEditorTarget] = useState<string | 'new' | null>(null)

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

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6" />
          <h2 className="text-2xl font-bold">Dotazníky</h2>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => downloadTemplate('questionnaire')}>
            <Download className="h-4 w-4 mr-1.5" />Vzorová šablona
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditorTarget('new')}>
            <Pencil className="h-4 w-4 mr-1.5" />Vytvořit v editoru
          </Button>
          <Button size="sm" onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" />Nový dotazník (XLSX)
          </Button>
        </div>
      </div>

      {loading && <p className="text-muted-foreground text-sm">Načítám dotazníky… (první načtení může trvat až 30 s)</p>}
      {fetchError && (
        <div className="flex items-center gap-3">
          <p className="text-destructive text-sm">{fetchError}</p>
          <Button variant="outline" size="sm" onClick={() => void load()}>Zkusit znovu</Button>
        </div>
      )}

      {!loading && !fetchError && questionnaires.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground text-sm">
              Zatím žádné dotazníky.{' '}
              <button className="underline" onClick={() => setNewDialogOpen(true)}>Vytvořte první</button>.
            </p>
          </CardContent>
        </Card>
      )}

      {!loading && questionnaires.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dotazníky ({questionnaires.length})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium">Název</th>
                  <th className="text-left px-4 py-2.5 font-medium">Počet otázek</th>
                  <th className="text-left px-4 py-2.5 font-medium">Vytvořeno</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {questionnaires.map((q) => (
                  <tr
                    key={q.id}
                    className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                    onClick={() => setDetailTarget(q)}
                  >
                    <td className="px-4 py-3 font-medium">{q.name}</td>
                    <td className="px-4 py-3"><Badge variant="secondary">{q.question_count} otázek</Badge></td>
                    <td className="px-4 py-3 text-muted-foreground">{formatDate(q.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <Button variant="ghost" size="icon" title="Upravit v editoru"
                          onClick={(e) => { e.stopPropagation(); setEditorTarget(q.id) }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Exportovat XLSX"
                          disabled={exportingId === q.id}
                          onClick={(e) => { e.stopPropagation(); void handleExport(q.id) }}>
                          <FileUp className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="Smazat dotazník"
                          className="text-destructive hover:text-destructive"
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(q) }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

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
