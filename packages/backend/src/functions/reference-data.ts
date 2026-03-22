import { app, type HttpRequest, type HttpResponseInit } from '@azure/functions'
import { NUMERACY_REFERENCE_DATA } from '@respondex/shared'

// ── GET /api/reference/numeracy ─────────────────────────────────────────────
// Returns the complete numeracy reference dataset (PIAAC-based).
// This is static data compiled into the shared package — no blob storage needed.

async function getNumeracyReference(_req: HttpRequest): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    jsonBody: NUMERACY_REFERENCE_DATA,
  }
}

app.http('getNumeracyReference', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reference/numeracy',
  handler: getNumeracyReference,
})
