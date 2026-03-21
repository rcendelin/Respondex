# ADR-002: Azure Queue Storage pro chunked simulaci

**Datum:** 2026-03-21
**Status:** Přijato

## Kontext

Simulace Respondex může zahrnovat stovky osob × desítky otázek × několik runs = tisíce OpenAI API volání. Tyto nemohou proběhnout synchronně v HTTP requestu (timeout Azure Functions = 230s).

## Rozhodnutí

Používáme **Azure Queue Storage** (`simulation-chunks` queue) pro asynchronní distribuci práce. Každý chunk (20 osob) je jedna zpráva ve frontě, zpracovaná samostatnou instancí Queue-triggered Azure Function.

Formát zprávy: Base64(JSON(`SimulationChunkMessage`)):
```typescript
{
  simulation_id: string   // UUID v4
  chunk_index: number     // 0-based
  chunk_number: string    // "001", "002", ...
  person_ids: string[]    // max 20 IDs
}
```

## Důvody

1. **Jednoduchost**: Azure Queue Storage je nejjednodušší messaging service v Azure. Žádné AMQP, žádné broker skupiny.
2. **Retry built-in**: Queue zprávy se po selhání vrací do fronty (maxDequeueCount=5). Poison message handling automatický (dead-letter).
3. **Serverless**: Queue trigger spustí Function na každou zprávu; Azure runtime řídí škálování a concurrency.
4. **Cena**: Queue Storage je extrémně levné (~$0.004 per 10,000 operací).
5. **Fan-out pattern**: HTTP trigger enqueue-uje N zpráv najednou → N Queue triggerů zpracovává paralelně.

## Nevýhody a přijatá rizika

1. **Ordering**: Queue nezaručuje FIFO pořadí doručení. Chunky mohou dorazit v jiném pořadí — výsledky `chunk-001.json` se nemusí zapsat před `chunk-003.json`. Mitigation: chunky jsou nezávislé; `meta.json.completed_chunks` se inkrementuje atomicky-best-effort.
2. **At-least-once**: Zpráva může být doručena víckrát (Azure Queue garantuje at-least-once). Mitigation: `chunk-NNN.json` přepis je idempotentní.
3. **Race condition v meta.json**: Více Queue triggerů aktualizuje `meta.json` concurrently. Bez optimistic locking (Blob Storage nemá CAS). Dokumentováno; pro MVP přijatelné.

## Alternativy zváženy

- **Azure Service Bus**: Spolehlivější doručení, sessions pro ordering, DLQ s retry policies. Cena ~5× vyšší. Pro Fázi 2.
- **Azure Durable Functions**: Elegantní orchestrace se stavem, retry, aktivitami. Složitější deployment, vendor lock-in, vyšší náklady. Pro Fázi 3.
- **Synchronní zpracování**: Timeout Azure Functions HTTP trigger = 230s. Ani 5 osob × 10 otázek × 1 run (50 OpenAI calls × ~2s = 100s) se nevejde spolehlivě.

## Doporučení pro Fázi 2

Migrovat na **Azure Service Bus** pro ordering guarantees a spolehlivější DLQ. Nebo přejít na **Azure Durable Functions** pro vizualizaci průběhu a restart od přerušení.
