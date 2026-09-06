# The Culprit — Technology Stack

Matches what's actually running today, not the original plan. See [PROJECT_SPEC.md](PROJECT_SPEC.md) for the full picture.

---

## Framework & language

### Next.js 15 (App Router)
- Public site: Bio, Research, Publications, Research Groups, Upcoming Events, Make Appointment.
- Admin app: Login, Dashboard, content CRUD, Manage Appointments, Settings.
- Route handlers are the only API boundary: check auth, validate input, call a service, respond.
  No business logic lives in a route handler itself.
- Public pages are Server Components, cached, and fast.

---

## UI layer

### Tailwind CSS v4
Layouts for cards, forms, tables, and the admin dashboard.

### shadcn/ui
Buttons, cards, dialogs, tables, inputs, dropdowns, toasts, nav.

### Lucide Icons
Nav and action icons. Tree-shakeable, so unused icons don't bloat the bundle.

### next-themes
Light, dark, or system.

There is no translation library. The site is English-only by design — see
[ADR-006](docs/decisions/ADR-006-remove-i18n-and-locale-routing.md).

---

## Forms & validation

### React Hook Form
Every admin form, plus login.

### Zod
Server-side validation is the source of truth at every API boundary. Client-side validation is
just UX, it never replaces the server check. One schema per module.

### TanStack Query v5
Data fetching, caching, and loading/error states in the admin dashboard.

---

## Data & backend

### Prisma ORM (v7, driver adapter)
Only ever imported inside a repository, never anywhere else. Covers Profile, Research,
Publications, Research Groups, Team Members, Appointments, Settings, AuditLog.

### PostgreSQL (Supabase)
Holds every table above. Files (photos, documents) are not stored here, only their URLs.
Appointments are never hard-deleted: cancelling one just changes its status. Uses Supabase's
pooled connection for normal queries and a direct connection for migrations, standard practice
for a serverless-friendly setup.

### Better Auth
Single admin account, secure cookie sessions, not JWT. Seeded once from an initial admin email and
password. Guards every `/api/admin/*` route.

---

## File storage

### Cloudflare R2
S3-compatible storage for photos and documents. Server-only credentials; the app is the only thing
that writes to it. The database stores just a URL reference, never the file itself. R2 replaced
Supabase Storage in August 2026 — see
[ADR-002](docs/decisions/ADR-002-object-storage-r2.md).

---

## Scheduling

### Calendly, embedded only
The booking widget on the Make Appointment page. No server-side API connection at all, no webhook,
no token. A booking made in the widget stays entirely on Calendly's side; it never becomes a row
in this app's database. See [ADR-005](docs/decisions/ADR-005-calendly-embed-only.md) for why an
earlier server-side integration was built and then removed.

---

## Bot protection & rate limiting

### Cloudflare Turnstile
A quick, mostly invisible bot check in front of the Calendly widget only.

### Cloudflare + an in-app fallback
Login attempts are blocked at Cloudflare's edge (5 per 10 seconds) and again by a simple in-app
counter behind that. No Redis, no external rate-limiting service, see
[ADR-008](docs/decisions/ADR-008-cloudflare-rate-limiting.md) for the reasoning.

---

## Caching

Public pages and their API routes are cached on the server (Next.js) and, on the self-hosted
deployment, at Cloudflare's edge too. An admin save clears the relevant cache within a second or
two. See [ADR-007](docs/decisions/ADR-007-fix-cache-invalidation-and-cache-public-api-routes.md)
for the full detail.

---

## Testing

### Vitest + React Testing Library
Unit and component tests, run on every push.

### Playwright
Full-browser end-to-end tests. They exist and pass, but aren't wired into the automatic CI check
yet, so they only run when someone runs them by hand.

---

## Deployment

Self-hosted VPS. A GitHub Actions pipeline builds a Docker image, pushes it to a container
registry, and the server pulls and restarts the container. The server never builds anything
itself. Sits behind Cloudflare (proxied DNS, edge caching, the WAF rate-limit rule above) and
Caddy as the reverse proxy.

---

## Architecture, at a glance

```
Visitor / Admin
      │
      ▼
Cloudflare (self-hosted deployment only) — edge cache, rate-limit rule, bot check
      │
      ▼
Next.js 15 — route handler → service → repository
      │
      ├── Supabase Postgres — all app data + audit log
      ├── Cloudflare R2 — photos, documents
      ├── Calendly — embedded booking widget, no server connection
      └── Better Auth — single-admin cookie session
```

Modules: `auth · profile · research · publications · research-groups · appointments · settings ·
integrations · shared`. There is no `notifications` module, that idea was dropped along with the
old appointment-request workflow.
