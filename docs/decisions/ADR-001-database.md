---
status: current
source_of_truth: true
last_updated: 2026-08-08
related_modules: [shared]
related_decisions: []
---

# ADR-001: Database — PostgreSQL on Supabase

## Status

Accepted

## Date

2026-08-05 (adopted as the concrete stack); Postgres as the relational-DB assumption predates this
and runs through the spec from the original stack-agnostic draft.

## Context

The spec's architecture was originally written stack-agnostic (`PROJECT_SPEC.md §12.3`, §14.1
"Option C: any relational DB"), with a relational data model: `Profile`, `Research`,
`Publication`, `ResearchGroup`, `TeamMember`, `Appointment` — related entities with foreign keys
(`TeamMember.researchGroupId → ResearchGroup`), enum-like status fields, and a requirement for
transactional, auditable writes (every mutation plus its `AuditLog` row commits atomically).

## Decision

Use **PostgreSQL**, hosted on **Supabase**, accessed through **Prisma 7** via a driver adapter
(`@prisma/adapter-pg`) over a pooled `pg` connection.

## Alternatives considered

The spec's stack appendix (§14.1) lists three named options at the framework/hosting level (A:
Vercel+Next.js API routes+Supabase Postgres; B: Cloudflare Pages+Workers+D1 SQLite; C: fully
generic). Option A (Postgres) was adopted; Option B's **D1 (SQLite)** was evaluated at the
hosting-package level and **not taken** for the database specifically.

**Reason not documented in the available project history:** no document in this repository
(`PROJECT_SPEC.md`, the project rules, the customer meeting minutes, or the hosting-cost
review) explicitly weighs PostgreSQL against a non-relational store like MongoDB. The spec treats
a relational database as the assumed default from the very first stack-agnostic draft (Option C:
"Any relational DB") without recording that comparison — do not invent a justification (e.g.
"ACID guarantees" or "relational data model fit") beyond what's stated here unless a future
decision record documents it explicitly.

## Consequences

- Foreign keys and transactions are native — the audit-log-in-repository pattern
  (`architecture/backend.md`) relies on `prisma.$transaction`.
- Supabase's free-tier Postgres has **no automatic backups** — open question, see
  `requirements/scope.md`.
- Prisma's relational modeling fits the entity relationships directly; no ORM-level document
  modeling workarounds were needed.

## Supersedes / Superseded by

N/A — not superseded. The **storage** side of the original hybrid stack was later revisited (see
[ADR-002](ADR-002-object-storage-r2.md)), but the database choice itself has not changed.
