import { SimulationChunkMessageSchema } from '@respondex/shared'
import type { SimulationChunkMessage } from '@respondex/shared'

// UUID v4 pattern — reused from errors.ts to validate simulation_id in poison messages
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export interface ParsedChunkMessage {
  msg: SimulationChunkMessage | undefined
  simulationId: string | undefined
}

/**
 * Parse and validate a queue message from the simulation-chunks queue.
 * Returns the full validated message, or falls back to extracting just simulation_id
 * for use in the poison handler when full validation fails.
 *
 * Never throws — caller decides what to do with missing fields.
 */
export function parseChunkMessage(messageText: unknown): ParsedChunkMessage {
  try {
    // Azure Functions v4 SDK may deserialize queue messages automatically (object),
    // or pass them as raw strings depending on the content type.
    // Handle both: if already an object, use it directly; if string, parse it.
    let parsed: unknown
    if (typeof messageText === 'string') {
      parsed = JSON.parse(messageText)
    } else if (typeof messageText === 'object' && messageText !== null) {
      parsed = messageText
    } else {
      // Unexpected type — attempt string coercion as last resort
      parsed = JSON.parse(String(messageText))
    }

    const result = SimulationChunkMessageSchema.safeParse(parsed)
    if (result.success) {
      return { msg: result.data as SimulationChunkMessage, simulationId: result.data.simulation_id }
    }
    // Validation failed — try extracting simulation_id for poison handler best-effort update
    if (typeof parsed === 'object' && parsed !== null && 'simulation_id' in parsed) {
      const rawId = (parsed as Record<string, unknown>)['simulation_id']
      if (typeof rawId === 'string' && UUID_RE.test(rawId)) {
        return { msg: undefined, simulationId: rawId }
      }
    }
    return { msg: undefined, simulationId: undefined }
  } catch {
    return { msg: undefined, simulationId: undefined }
  }
}
