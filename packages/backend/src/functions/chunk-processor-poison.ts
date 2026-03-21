import { app, type InvocationContext } from '@azure/functions'
import { BlobStorageService } from '../services/storage.js'
import { SimulationChunkMessageSchema } from '@respondex/shared'
import type { SimulationMeta } from '@respondex/shared'
import { SimulationStatus } from '@respondex/shared'

/**
 * Poison queue handler: triggered when a chunk message exceeds maxDequeueCount (5 retries).
 * Sets the simulation status to PARTIAL_FAILURE so the frontend stops polling.
 *
 * Azure automatically moves failed messages to 'simulation-chunks-poison' queue after
 * maxDequeueCount failed delivery attempts.
 */
async function handlePoisonChunk(messageText: unknown, ctx: InvocationContext): Promise<void> {
  ctx.warn('Poison chunk message received — marking simulation as PARTIAL_FAILURE')

  // Best-effort parse of the poison message to extract simulation_id
  let simulationId: string | undefined
  try {
    const raw = typeof messageText === 'string' ? messageText : String(messageText)
    const parsed = JSON.parse(raw) as unknown
    const result = SimulationChunkMessageSchema.safeParse(parsed)
    if (result.success) {
      simulationId = result.data.simulation_id
    } else {
      // If validation fails, try extracting simulation_id directly (partial message)
      if (typeof parsed === 'object' && parsed !== null && 'simulation_id' in parsed) {
        const rawId = (parsed as Record<string, unknown>)['simulation_id']
        if (typeof rawId === 'string' && /^[0-9a-f-]{36}$/i.test(rawId)) {
          simulationId = rawId
        }
      }
    }
  } catch {
    ctx.error('Could not parse poison message at all — cannot update simulation status')
    return
  }

  if (!simulationId) {
    ctx.error('Poison message has no valid simulation_id — cannot update simulation status')
    return
  }

  const metaPath = `data/simulations/${simulationId}/meta.json`
  const svc = new BlobStorageService()

  try {
    const meta = await svc.readJson<SimulationMeta>(metaPath)

    // Only update if still RUNNING — don't downgrade COMPLETED simulations
    if (meta.status !== SimulationStatus.RUNNING) {
      ctx.log(
        `Simulation ${simulationId} already has status "${meta.status}" — skipping poison update`
      )
      return
    }

    const updatedMeta: SimulationMeta = {
      ...meta,
      status: SimulationStatus.PARTIAL_FAILURE,
      error: 'Jeden nebo více chunků selhalo opakovaně — výsledky mohou být neúplné',
      completed_at: new Date().toISOString(),
    }

    await svc.writeJson(metaPath, updatedMeta)
    ctx.warn(
      `Simulation ${simulationId} marked as PARTIAL_FAILURE due to poison chunk message`
    )
  } catch (err) {
    ctx.error(
      `Failed to update simulation ${simulationId} status to PARTIAL_FAILURE:`,
      err instanceof Error ? err.message : String(err)
    )
    // Do not rethrow — poison handler must not itself fail (would loop forever)
  }
}

// ── Queue trigger registration ──────────────────────────────────────────────
app.storageQueue('handlePoisonChunk', {
  queueName: 'simulation-chunks-poison',
  connection: 'AZURE_STORAGE_CONNECTION_STRING',
  handler: handlePoisonChunk,
})
