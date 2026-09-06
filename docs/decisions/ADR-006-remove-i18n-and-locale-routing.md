---
status: current
source_of_truth: true
last_updated: 2026-08-08
related_modules: [shared]
related_decisions: []
---

# ADR-006: Remove i18n and locale routing entirely (English-only)

## Status

Accepted

## Date

2026-08-08

## Context

The project originally scaffolded `next-intl`: a `[locale]` dynamic route segment, locale
negotiation middleware, per-locale static params, and a `messages/en.json` catalogue read via
`useTranslations`/`getTranslations` — architected so additional languages could be added later by
dropping in a new message file. The customer never asked for multiple languages, and the project
has a single audience (an individual professor's academic site).

## Decision

Remove the i18n layer **entirely** — not just the locale-routing segment. There is no
`next-intl` dependency (confirmed absent from `package.json`), no `messages/` directory, no
`src/i18n/` directory, and — **as of this ADR's date, 2026-08-08** — no `middleware.ts` of any
kind (locale-negotiation or otherwise) in the codebase. Every component uses literal English
strings directly, confirmed in `src/app/layout.tsx` and `src/app/providers.tsx`'s own header
comments: "no next-intl, no message catalogue, no locale routing." Routes are flat
(`src/app/(public)/research`, not `src/app/[locale]/(public)/research`).

> **Note (2026-08-10):** `src/middleware.ts` was later added by
> [ADR-008](ADR-008-cloudflare-rate-limiting.md), for edge rate limiting — unrelated to locale
> negotiation. It does not reintroduce anything this ADR removed; see ADR-008 and
> [architecture/authentication.md](../architecture/authentication.md).

## Alternatives considered

- **Remove only the `[locale]` URL segment, keep the `next-intl` translation-lookup layer** (i.e.
  keep `useTranslations`/message catalogues for future-proofing, drop only the routing) — this was
  the **originally recorded** version of this decision (see Contradiction below) but is **not**
  what shipped. Superseded within the same day once the team judged the translation-lookup
  indirection had no payoff for a site that will never support a second language.

## Consequences

- One less dependency, one less abstraction layer between a component and the string it renders.
- Adding a second language later is a larger lift than it would have been with the catalogue kept
  (a real, accepted trade-off, not an oversight) — would require reintroducing message extraction
  from scratch.
- Removes an entire class of "missing translation key" bugs.

## Correction to `PROJECT_SPEC.md` (resolved 2026-08-08)

**`PROJECT_SPEC.md §9.1`** previously described the narrower version of this decision — "only the
routing/negotiation layer was cut, not the translation layer... all copy still goes through
next-intl (`useTranslations`/`getTranslations` reading `messages/en.json`)". That did not match
the shipped code: `package.json` has no `next-intl` dependency, no `messages/en.json` exists, and
`src/app/layout.tsx`/`providers.tsx` explicitly state "no next-intl" in their own comments.
The project rules ("English-only, no i18n library. next-intl was removed 2026-08-08") matched the code;
the spec paragraph didn't. **Confirmed and corrected in place** — `PROJECT_SPEC.md §9.1` now
states i18n was removed entirely.

## Supersedes / Superseded by

Supersedes the original i18n-ready architecture described in
the original implementation guide (which still describes
`[locale]` routing and `next-intl` in detail — stale, see
[Known contradictions](../README.md#known-contradictions--gaps)).
