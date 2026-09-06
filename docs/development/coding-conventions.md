---
status: current
source_of_truth: false
last_updated: 2026-08-08
related_modules: [shared]
related_decisions: []
---

# Coding conventions

> Verified against `src/modules/shared/lib/{errors,api-response,result}.ts` and the research module
> (`research.service.ts`, `research.repository.ts`) as the reference implementation.

## Layering (hard rule)

`route handler → service → repository → Prisma`. **Prisma is imported only in repositories.**
Route handlers never contain business logic: authenticate → validate → call one service method →
map `Result` to a response. See [architecture/overview.md](../architecture/overview.md#layers).

## Naming

| Thing | Convention | Example |
|---|---|---|
| Files | kebab-case | `event-form-dialog.tsx`, `event.service.ts` |
| React components | PascalCase | `EventFormDialog` |
| Zod schemas | `<entity><Action>Schema` | `createEventSchema` |
| Services | factory function `create<Entity>Service` returning an interface | `createEventService` |
| Repositories | class `Prisma<Entity>Repository` implementing an interface | `PrismaEventRepository` |
| Prisma models | PascalCase singular | `Event` |
| DB columns | snake_case via `@map` | `research_group` |
| Env vars | SCREAMING_SNAKE_CASE | `R2_ACCESS_KEY_ID` |

## Validation (Zod)

One schema per module (`<module>.schema.ts`), used both by the RHF client resolver and the server
boundary parse. The server always re-parses — the client copy is UX only, per the project rules
("server-side Zod validation at every boundary; the client copy is UX, the server is truth").

## Result & error handling

Services return `Result<T, AppError>` rather than throwing for expected failures
(`src/modules/shared/lib/result.ts`, `errors.ts`). Typed error classes each carry a fixed HTTP
status — see [architecture/backend.md](../architecture/backend.md#error-handling). Repositories
may throw on infra failure; services catch and map via `toAppError()`.

## Composition roots

Each module has a small `container.ts` — a cached factory function (e.g. `getEventService()`)
that wires the Prisma-backed repository into the service. No DI framework. Route handlers call the
container's getter and nothing else.

## Logging

Structured logger (`src/modules/shared/lib/logger.ts`). No bare `console.log` in committed code.
Never log secrets or PII — the `AuditLog` table, not the app log, is the durable record of admin
actions.

## TypeScript / lint / format

- `strict: true`. Infer types from Zod (`z.infer<typeof schema>`) rather than hand-duplicating.
- ESLint (flat config, `eslint-config-next` + `eslint-config-prettier`) owns correctness; Prettier
  owns formatting. `npm run lint` / `npm run format:check`.
- CI-equivalent local gate: `npm run typecheck && npm run lint && npm test`.
