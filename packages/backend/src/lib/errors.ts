import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions'

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NotFoundError'
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

// UUID v4 pattern — all IDs in Respondex are generated with randomUUID()
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Validate route parameter is a valid UUID v4. Throws ValidationError otherwise. */
export function requireUUID(id: string | undefined, paramName = 'id'): string {
  if (!id || !UUID_RE.test(id)) {
    throw new ValidationError(`Neplatný formát parametru "${paramName}"`)
  }
  return id
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB

/** Validate upload size. Throws ValidationError if too large. */
export function requireUploadSize(byteLength: number): void {
  if (byteLength > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`Soubor je příliš velký. Maximum je ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
  }
  if (byteLength === 0) {
    throw new ValidationError('Tělo požadavku je prázdné — očekáván XLSX soubor')
  }
}

export function errorResponse(err: unknown, ctx?: InvocationContext): HttpResponseInit {
  if (err instanceof NotFoundError) {
    return { status: 404, jsonBody: { error: err.message } }
  }
  if (err instanceof ValidationError) {
    return { status: 400, jsonBody: { error: err.message } }
  }
  // Log internal error details (Azure SDK messages, stack traces) without leaking them
  const internalMessage = err instanceof Error ? err.message : String(err)
  ctx?.error('Unhandled error:', internalMessage)
  return { status: 500, jsonBody: { error: 'Interní chyba serveru' } }
}

export function parseJsonBody<T>(req: HttpRequest): Promise<T> {
  return req.json() as Promise<T>
}
