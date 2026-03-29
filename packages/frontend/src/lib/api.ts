/**
 * API client for the Respondex backend.
 * Base URL is configured via VITE_API_BASE_URL env variable (defaults to /api for SWA proxying).
 */
/// <reference types="vite/client" />
import type {
  SimulationMeta,
  SimulationConfig,
  AnalyticsResult,
  PromptLogsPage,
  NumeracyReferenceDataset,
  ABTestConfig,
  ABTestComparison,
  ReferenceQuestion,
} from '@respondex/shared'

// Local types matching the backend API shapes (not exported from @respondex/shared)
export interface PopulationMeta {
  id: string
  name: string
  description?: string
  created_at: string
  updated_at: string
  person_count: number
}

export interface QuestionnaireMeta {
  id: string
  name: string
  description?: string
  question_count: number
  created_at: string
  updated_at: string
}

const BASE = (import.meta.env['VITE_API_BASE_URL'] as string | undefined) ?? '/api'

class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit, _attempt = 0): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  // 503 = Azure Functions cold start — retry up to 5× with backoff (cold start can take 30+ s)
  if (res.status === 503 && _attempt < 5) {
    await new Promise((r) => setTimeout(r, 3000 * (_attempt + 1)))
    return request<T>(path, init, _attempt + 1)
  }
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // ignore JSON parse errors on error responses
    }
    throw new ApiError(res.status, message)
  }
  // 204 No Content
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ── Populations ────────────────────────────────────────────────────────────

export type PopulationListItem = PopulationMeta

export function getPopulations(): Promise<PopulationListItem[]> {
  return request('/populations')
}

export function getPopulation(id: string): Promise<PopulationListItem> {
  return request(`/populations/${encodeURIComponent(id)}`)
}

export interface PersonsPage {
  persons: import('@respondex/shared').Person[]
  total: number
  offset: number
  limit: number
}

export function getPersons(id: string, offset = 0, limit = 20): Promise<PersonsPage> {
  return request(`/populations/${encodeURIComponent(id)}/persons?offset=${offset}&limit=${limit}`)
}

export async function createPopulation(name: string, xlsxFile: File): Promise<{ id: string }> {
  // Step 1: create empty population
  const created = await request<{ id: string }>('/populations', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  // Step 2: upload XLSX as raw binary (backend reads req.arrayBuffer())
  const arrayBuffer = await xlsxFile.arrayBuffer()
  const res = await fetch(`${BASE}/populations/${encodeURIComponent(created.id)}/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    body: arrayBuffer,
  })
  if (!res.ok) {
    // On import failure, clean up the empty population we just created
    request(`/populations/${encodeURIComponent(created.id)}`, { method: 'DELETE' }).catch(() => undefined)
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; errors?: Array<{ message: string }> }
      if (body.errors && body.errors.length > 0) {
        // Show first few validation errors
        const details = body.errors.slice(0, 3).map((e) => e.message).join(' • ')
        message = `${body.error ?? 'Chyba importu'}: ${details}`
        if (body.errors.length > 3) message += ` (a ${body.errors.length - 3} dalších)`
      } else if (body.error) {
        message = body.error
      }
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message)
  }
  return created
}

export async function exportPopulation(id: string): Promise<void> {
  const res = await fetch(`${BASE}/populations/${encodeURIComponent(id)}/export`)
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const blob = await res.blob()
  downloadBlob(blob, `populace-${id.substring(0, 8)}.xlsx`)
}

export async function deletePopulation(id: string): Promise<void> {
  await request(`/populations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export interface GenerateParams {
  count: number
  male_pct: number
  age_min: number
  age_max: number
  region?: string
}

export interface GenerateResult {
  generated: number
  meta: PopulationMeta
}

export function generatePopulation(id: string, params: GenerateParams): Promise<GenerateResult> {
  return request(`/populations/${encodeURIComponent(id)}/generate`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

export interface EnrichParams {
  model: string
  only_missing: boolean
}

export interface EnrichResult {
  enriched: number
  skipped: number
  failed: number
}

export function enrichPopulation(id: string, params: EnrichParams): Promise<EnrichResult> {
  return request(`/populations/${encodeURIComponent(id)}/enrich`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ── Questionnaires ─────────────────────────────────────────────────────────

export type QuestionnaireListItem = QuestionnaireMeta

export function getQuestionnaires(): Promise<QuestionnaireListItem[]> {
  return request('/questionnaires')
}

export function getQuestionnaire(
  id: string
): Promise<QuestionnaireListItem & { questions: import('@respondex/shared').Question[] }> {
  return request(`/questionnaires/${encodeURIComponent(id)}`)
}

export async function createQuestionnaire(
  name: string,
  xlsxFile: File
): Promise<{ id: string }> {
  const created = await request<{ id: string }>('/questionnaires', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
  // Upload XLSX as raw binary (backend reads req.arrayBuffer())
  const arrayBuffer = await xlsxFile.arrayBuffer()
  const res = await fetch(
    `${BASE}/questionnaires/${encodeURIComponent(created.id)}/import`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      body: arrayBuffer,
    }
  )
  if (!res.ok) {
    // On import failure, clean up the empty questionnaire we just created
    request(`/questionnaires/${encodeURIComponent(created.id)}`, { method: 'DELETE' }).catch(() => undefined)
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string; errors?: Array<{ message: string }> }
      if (body.errors && body.errors.length > 0) {
        const details = body.errors.slice(0, 3).map((e) => e.message).join(' • ')
        message = `${body.error ?? 'Chyba importu'}: ${details}`
        if (body.errors.length > 3) message += ` (a ${body.errors.length - 3} dalších)`
      } else if (body.error) {
        message = body.error
      }
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message)
  }
  return created
}

export async function exportQuestionnaire(id: string): Promise<void> {
  const res = await fetch(`${BASE}/questionnaires/${encodeURIComponent(id)}/export`)
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const blob = await res.blob()
  downloadBlob(blob, `dotaznik-${id.substring(0, 8)}.xlsx`)
}

export async function deleteQuestionnaire(id: string): Promise<void> {
  await request(`/questionnaires/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── Simulations ────────────────────────────────────────────────────────────

export interface SimulationListItem extends SimulationMeta {
  progress_pct: number
}

export function getSimulations(): Promise<SimulationListItem[]> {
  return request('/simulations')
}

export function getSimulationStatus(id: string): Promise<SimulationListItem> {
  return request(`/simulations/${encodeURIComponent(id)}/status`)
}

export function startSimulation(config: SimulationConfig): Promise<{ id: string; status: string; total_chunks: number }> {
  return request('/simulations', {
    method: 'POST',
    body: JSON.stringify(config),
  })
}

export function regenerateMissing(id: string): Promise<{ simulation_id: string; status: string; missing_persons: number; new_chunks: number; message: string }> {
  return request(`/simulations/${encodeURIComponent(id)}/regenerate`, { method: 'POST' })
}

export function forceCompleteSimulation(id: string): Promise<{ simulation_id: string; status: string; completed_chunks: number; total_chunks: number; message: string }> {
  return request(`/simulations/${encodeURIComponent(id)}/force-complete`, { method: 'PATCH' })
}

export async function deleteSimulation(id: string): Promise<void> {
  await request(`/simulations/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ── Analytics ──────────────────────────────────────────────────────────────

export function getAnalyticsSummary(simulationId: string): Promise<AnalyticsResult> {
  return request(`/analytics/${encodeURIComponent(simulationId)}/summary`)
}

export function getCrossTabs(
  simulationId: string,
  groupBy: string
): Promise<{ simulation_id: string; group_by: string; cross_tabs: AnalyticsResult['cross_tabs'] }> {
  return request(
    `/analytics/${encodeURIComponent(simulationId)}/crosstabs?by=${encodeURIComponent(groupBy)}`
  )
}

export function getPromptLogs(simulationId: string, page = 0, size = 50): Promise<PromptLogsPage> {
  return request(`/analytics/${encodeURIComponent(simulationId)}/logs?page=${page}&size=${size}`)
}

export async function exportAnalyticsXlsx(simulationId: string): Promise<void> {
  const res = await fetch(`${BASE}/analytics/${encodeURIComponent(simulationId)}/export`)
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const blob = await res.blob()
  downloadBlob(blob, `simulace-${simulationId.substring(0, 8)}-vysledky.xlsx`)
}

// ── Questionnaire editor ────────────────────────────────────────────────────

/** Create an empty questionnaire (no XLSX import). Used by the in-browser editor. */
export function createEmptyQuestionnaire(name: string): Promise<{ id: string }> {
  return request('/questionnaires', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

/** Rename / update questionnaire metadata */
export function updateQuestionnaire(id: string, patch: { name?: string; description?: string }): Promise<Record<string, unknown>> {
  return request(`/questionnaires/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function saveQuestionsJson(
  id: string,
  questions: import('@respondex/shared').Question[]
): Promise<{ saved: number }> {
  return request(`/questionnaires/${encodeURIComponent(id)}/questions`, {
    method: 'PUT',
    body: JSON.stringify(questions),
  })
}

// ── Templates ─────────────────────────────────────────────────────────────

export async function downloadTemplate(type: 'population' | 'questionnaire'): Promise<void> {
  const res = await fetch(`${BASE}/templates/${type}`)
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const blob = await res.blob()
  const filename = type === 'population' ? 'vzor-populace.xlsx' : 'vzor-dotaznik.xlsx'
  downloadBlob(blob, filename)
}

// ── Reference Data ────────────────────────────────────────────────────────

export function getNumeracyReference(): Promise<NumeracyReferenceDataset> {
  return request('/reference/numeracy')
}

export function getReferenceQuestions(): Promise<ReferenceQuestion[]> {
  return request('/reference/questions')
}

// ── A/B Tests ─────────────────────────────────────────────────────────────

export function getABTests(): Promise<ABTestConfig[]> {
  return request('/ab-tests')
}

export function getABTest(id: string): Promise<ABTestConfig> {
  return request(`/ab-tests/${encodeURIComponent(id)}`)
}

export function getABTestResults(id: string): Promise<ABTestComparison> {
  return request(`/ab-tests/${encodeURIComponent(id)}/results`)
}

export async function deleteABTest(id: string): Promise<void> {
  await request(`/ab-tests/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export function createABTest(params: {
  name: string
  population_id: string
  questionnaire_id: string
  arms: { name: string; variance_mode: string; simulation_id: string }[]
  simulation_ids: string[]
}): Promise<{ id: string }> {
  return request('/ab-tests', { method: 'POST', body: JSON.stringify(params) })
}

// ── Helpers ────────────────────────────────────────────────────────────────

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export { ApiError }
