---
status: current
source_of_truth: false
last_updated: 2026-08-08
related_modules: [integrations, profile]
related_decisions: [ADR-002]
---

# Object storage

## Provider

**Cloudflare R2**, S3-compatible API via `@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner` (`src/modules/integrations/storage/storage-adapter.ts`). Adopted
over Supabase Storage — see [ADR-002](../decisions/ADR-002-object-storage-r2.md). The database
stays on Supabase Postgres; only the object store moved.

## Layout

**One R2 bucket** holds every category, split by folder prefix (`<bucket>/<category>/<path>`) —
not five separate R2 buckets. The app-level category distinction is preserved in code even though
the physical bucket is singular:

```ts
export type StorageBucket = 'profile' | 'research' | 'publications' | 'events' | 'documents';
export const PUBLIC_STORAGE_BUCKETS = ['profile', 'research', 'publications', 'events'];
```

## Public vs private

- `profile`, `research`, `publications`, `events` are **public-read** — `getPublicUrl()` builds a
  plain HTTPS URL against `R2_PUBLIC_URL` (the bucket's free `pub-<hash>.r2.dev` dev URL, not a
  custom domain — the project domain's DNS zone lives in a different Cloudflare account, so a
  custom-domain URL would need a cross-account CNAME the `.r2.dev` URL avoids entirely).
- `documents` is **private** — `getSignedUrl()` only. R2 has **no per-prefix ACL** the way
  Supabase Storage RLS did, so privacy for `documents` is enforced entirely by which method
  application code calls — nothing in the codebase calls `getPublicUrl('documents', ...)`.
  Accepted as a low-risk simplification for a single-admin, low-traffic site.

## Upload / download flow

1. Admin uploads a profile photo through `photo-upload-field.tsx` → `POST /api/admin/profile/photo`.
2. The route calls `getStorageAdapter().upload(bucket, path, file, contentType)`.
3. On success, the returned `path` is turned into a public URL and stored on `Profile.photoUrl` —
   **the database never holds binary data**, only the URL/reference.

## Adapter interface

```ts
export interface StorageAdapter {
  upload(bucket, path, file, contentType): Promise<Result<{ path: string }, IntegrationError>>;
  remove(bucket, path): Promise<Result<void, IntegrationError>>;
  getPublicUrl(bucket, path): string;                                   // sync, public buckets only
  getSignedUrl(bucket, path, expiresInSeconds): Promise<Result<{ url: string }, IntegrationError>>;
}
```

`getStorageAdapter()` is a cached factory: returns a real `R2StorageAdapter` when
`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`/`R2_PUBLIC_URL` are all
set, else a `NoopStorageAdapter` that logs and returns a typed `IntegrationError` instead of
crashing — dev/test boot cleanly without R2 configured. **There is no `STORAGE_DRIVER` env
toggle** between R2 and Supabase Storage — the original design's dual-adapter factory
(per the original implementation guide) was never built that way;
R2 is the only adapter that exists today besides the no-op.
