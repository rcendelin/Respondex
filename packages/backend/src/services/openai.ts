import OpenAI from 'openai'
import type { SupportedModel } from '@respondex/shared'

export interface ModelCallConfig {
  model: SupportedModel
  systemPrompt: string
  userPrompt: string
  temperature: number
}

export interface ModelCallResult {
  content: string
  usage: { input_tokens: number; output_tokens: number; total_tokens: number }
  latency_ms: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Thin wrapper over OpenAI SDK with exponential backoff for rate limits.
 * API key from OPENAI_API_KEY env var (Key Vault reference in production).
 */
export class OpenAIService {
  private readonly client: OpenAI
  private static readonly MAX_RETRIES = 3
  private static readonly BASE_DELAY_MS = 1000

  constructor() {
    const apiKey = process.env['OPENAI_API_KEY']
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }
    this.client = new OpenAI({ apiKey })
  }

  async callModel(config: ModelCallConfig): Promise<ModelCallResult> {
    const { model, systemPrompt, userPrompt, temperature } = config
    let lastError: unknown

    for (let attempt = 0; attempt <= OpenAIService.MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = OpenAIService.BASE_DELAY_MS * Math.pow(2, attempt - 1)
        await sleep(delay)
      }

      const start = Date.now()
      try {
        const completion = await this.client.chat.completions.create({
          model,
          temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        })

        const latency_ms = Date.now() - start
        const content = completion.choices[0]?.message?.content ?? ''
        const usage = {
          input_tokens: completion.usage?.prompt_tokens ?? 0,
          output_tokens: completion.usage?.completion_tokens ?? 0,
          total_tokens: completion.usage?.total_tokens ?? 0,
        }

        return { content, usage, latency_ms }
      } catch (err) {
        lastError = err
        // Only retry on rate limit (429) or server errors (5xx)
        const status = (err as { status?: number }).status
        if (status !== 429 && (status === undefined || status < 500)) {
          break
        }
      }
    }

    throw lastError
  }
}
