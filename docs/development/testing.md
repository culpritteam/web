---
status: current
source_of_truth: false
last_updated: 2026-08-08
related_modules: [shared, events, teaching]
related_decisions: []
---

# Testing

## Tools

| Layer | Tool | Config |
|---|---|---|
| Unit + component | Vitest + Testing Library, jsdom | `vitest.config.ts` — includes `src/**/*.{test,spec}.{ts,tsx}` |
| E2E | Playwright | `tests/e2e/*.spec.ts` |

## Commands

```bash
npm test          # vitest run
npm run test:watch
npm run test:e2e   # playwright test
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

## What's actually covered (verified in `src/**/__tests__/`)

- **Service/schema unit tests**: `event.schema.test.ts`, `event.service.test.ts` (including
  `splitByTiming`'s upcoming/past boundary); equivalents for `profile`, `research`, `publications`,
  `research-groups`/`team-member`; `storage-adapter.test.ts` + `storage-adapter.factory.test.ts`;
  `youtube-utils.test.ts`; `teaching.schema.test.ts` and `teaching.service.test.ts` (including
  `groupBySection`/`groupByLevel`).
- **Component tests**: `research-table.test.tsx`, `publications-table.test.tsx`,
  `team-members-table.test.tsx`, `youtube-video.test.tsx`, admin `layout.test.tsx` (guard redirect
  behavior).
- **API/route tests**: `research.route.test.ts` (`src/app/api/admin/research/__tests__/`).
- **E2E**: `tests/e2e/appointment.spec.ts` (the public Calendly tab, which still exists),
  `tests/e2e/login.spec.ts`.

Only `research` has API-route-level tests today. The other admin CRUD routes (`profile`,
`publications`, `groups`, `team-members`, `events`) do not yet have route-level tests —
service/schema unit coverage exists for them, but not the boundary. **`events` has no component
test** for `events-table.tsx`/`event-form-dialog.tsx`; that is a known gap.

## Conventions carried over from the design guide (still valid)

- **Services are the test priority** — inject a mocked repository/integrations, no real DB or
  network needed; framework-agnostic by design.
- **Assert the audit entry, not just the mutation.** Every mutating service call writes an
  `AuditLog` row; a delete additionally records the full before-state. There are no state
  transitions left to test — no service returns `ConflictError`/`409` since
  [ADR-011](../decisions/ADR-011-events-replace-appointments.md).
- Query by role/label/text in component tests (never test-id for user-facing assertions);
  `@testing-library/user-event` for interactions.
- Keep tests deterministic — no real time/network/random; inject clocks/ids where behavior depends
  on them.

## What no longer applies

The original implementation guide describes testing the old
five-state appointment machine (`approve`/`decline`/`book`), visitor self-cancel via token, and
notification-email side effects on every transition — **none of that exists anymore**, and neither
does the two-state machine that replaced it. Don't write tests against any appointment behavior;
see [ADR-011](../decisions/ADR-011-events-replace-appointments.md).
