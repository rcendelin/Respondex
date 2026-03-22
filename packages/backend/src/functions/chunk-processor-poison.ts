import { app, type InvocationContext } from '@azure/functions'
import { BlobStorageService } from '../services/storage.js'
import { parseChunkMessage } from '../lib/queue.js'
import type { SimulationMeta } from '@respondex/shared'
import { SimulationStatus } from '@respondex/shared'

function storage() {
  return new BlobStorageService()
}

/**
 * Poison queue handler: triggered when a chunk message exceeds maxDequeueCount (5 retries).
 * Sets the simulation status to PARTIAL_FAILURE so the frontend stops polling.
 *
 * Azure automatically moves failed messages to 'simulation-chunks-poison' queue after
 * maxDequeueCount failed delivery attempts.
 */
async function handlePoisonChunk(messageText: unknown, ctx: InvocationContext): Promise<void> {
  ctx.warn('Poison chunk message received — marking simulation as PARTIAL_FAILURE')

  const { simulationId } = parseChunkMessage(messageText)

  if (!simulationId) {
    ctx.error('Poison message has no valid simulation_id — cannot update simulation status')
    return
  }

  const metaPath = `data/simulations/${simulationId}/meta.json`
  const svc = storage()

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
    ctx.warn(`Simulation ${simulationId} marked as PARTIAL_FAILURE due to poison chunk message`)
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
