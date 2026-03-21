/**
 * API client for the Respondex backend.
 * Base URL is configured via VITE_API_BASE_URL env variable (defaults to /api for SWA proxying).
 */
/// <reference types="vite/client" />
import type {
  SimulationMeta,
  SimulationConfig,
  AnalyticsResult,
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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
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
  // Step 2: upload XLSX
  const form = new FormData()
  form.append('file', xlsxFile)
  const res = await fetch(`${BASE}/populations/${encodeURIComponent(created.id)}/import`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
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
  const form = new FormData()
  form.append('file', xlsxFile)
  const res = await fetch(
    `${BASE}/questionnaires/${encodeURIComponent(created.id)}/import`,
    { method: 'POST', body: form }
  )
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
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

export async function exportAnalyticsXlsx(simulationId: string): Promise<void> {
  const res = await fetch(`${BASE}/analytics/${encodeURIComponent(simulationId)}/export`)
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const blob = await res.blob()
  downloadBlob(blob, `simulace-${simulationId.substring(0, 8)}-vysledky.xlsx`)
}

// ── Templates ─────────────────────────────────────────────────────────────

export async function downloadTemplate(type: 'population' | 'questionnaire'): Promise<void> {
  const res = await fetch(`${BASE}/templates/${type}`)
  if (!res.ok) throw new ApiError(res.status, `HTTP ${res.status}`)
  const blob = await res.blob()
  const filename = type === 'population' ? 'vzor-populace.xlsx' : 'vzor-dotaznik.xlsx'
  downloadBlob(blob, filename)
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
