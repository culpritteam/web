---
status: current
source_of_truth: true
last_updated: 2026-08-08
related_modules: [auth]
related_decisions: []
---

# ADR-003: Authentication — Better Auth, single-admin cookie sessions

## Status

Accepted

## Date

2026-08-05

## Context

The project needs exactly one administrator (no public registration, no multi-tenant roles in the
MVP) authenticated with a secure, revocable session — not a stateless token — per the
information-security design language the spec asks for. The database and hosting decision landed
on Supabase, whose platform bundles its own auth product (Supabase Auth).

## Decision

Use **Better Auth** for admin authentication: single-admin, DB-backed cookie sessions
(`httpOnly`, `secure`, `sameSite=lax`, signed with `BETTER_AUTH_SECRET`), **not JWT**. **Supabase
Auth was evaluated and explicitly rejected** — see `PROJECT_SPEC.md §14.1`. The admin credential
is provisioned out-of-band by `prisma/seed.ts` from `ADMIN_EMAIL`/`ADMIN_INITIAL_PASSWORD`, never
through a public form.

## Alternatives considered

- **Supabase Auth** — available for free since the project already uses Supabase for Postgres.
  Rejected to avoid running two competing auth systems in the same app; the project's existing
  single-admin design already fit Better Auth's model directly, so adopting Supabase Auth would
  have meant migrating working auth for no functional gain.
- **JWT-based sessions** — not adopted anywhere in the project. DB-backed cookie sessions were
  chosen instead specifically so a session can be revoked server-side instantly (JWTs remain valid
  until expiry regardless of server-side state) — this is stated as a hard project rule
  ("Better Auth secure cookie sessions, single admin, no JWT").

## Consequences

- One additional dependency (Better Auth) instead of reusing Supabase's bundled auth — accepted
  as the simpler integration given the existing single-admin design.
- Revoking a session (e.g. suspected compromise) takes effect immediately, since `requireAdmin()`
  reads session state from the DB on every check rather than trusting a client-held token.
- No password-reset-via-magic-link or social login exists — out of scope for a single, known
  administrator.

## Supersedes / Superseded by

N/A.
