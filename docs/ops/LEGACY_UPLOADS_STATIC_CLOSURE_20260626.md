# Legacy Uploads Static Closure - 2026-06-26

## Goal

Reduce production exposure from the legacy `/uploads` static directory while preserving local development and explicit emergency compatibility.

## Findings

- New `POST /api/upload/contract` stores files in `file_metadata` and returns a `FILE-*` protected reference.
- New upload responses do not return `rawUrl`, `previewUrl`, or `downloadUrl`.
- Store Payment protected attachment flows already fail closed and do not use `/uploads`.
- The remaining exposure was the Nest bootstrap static mount:
  - `apps/api/src/main.ts`
  - `app.useStaticAssets(uploadsDir, { prefix: '/uploads' })`

## Change

Production now disables `/uploads` static serving by default.

```text
NODE_ENV=production
ENABLE_LEGACY_UPLOADS_STATIC is not true
=> /uploads static serving disabled
```

Development still serves `/uploads` for local compatibility.

If a short emergency compatibility window is required, production can explicitly set:

```text
ENABLE_LEGACY_UPLOADS_STATIC=true
```

This should only be temporary while legacy raw attachment references are migrated to `file_metadata`.

## Safety Boundary

- No migration added.
- No database write performed.
- No file deletion performed.
- No cleanup performed.
- No existing uploads removed.
- No front-end raw URL exposure added.

## Expected Behavior

- Modern uploads continue to return protected `FILE-*` references.
- Store Payment attachment preview/download remains protected endpoint only.
- Any old direct `/uploads/...` links in production are blocked unless the explicit compatibility env is enabled.

## Remaining Work

1. Inventory legacy raw attachment references in business tables.
2. Backfill `file_metadata` records for legacy files where business ownership can be proven.
3. Replace remaining front-end raw link renderers with `AttachmentViewer` or protected endpoint clients.
4. Remove the emergency compatibility switch after migration evidence is complete.
