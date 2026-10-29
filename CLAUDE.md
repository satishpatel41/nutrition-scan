# Nutrition Scan

Expo mobile app + Node/TypeScript API for scanning packaged-food labels. See README.md for status.

## Layout
- `apps/api` — Node/TypeScript API (Prisma/Postgres). Domain logic in `src/domain`, provider adapters in `src/adapters`.
- `apps/mobile` — Expo app (not started).

## Commands (run in `apps/api`)
- `npm test` — vitest unit tests
- `npm run typecheck`
- `npm run build`

## Rules
- Never fabricate nutrition values or extraction results; unconfigured providers must throw.
- If the nutrition table is missing, ask for another image. Never infer values from a front-of-pack photo.
- Keep label-derived values (with source + confidence) separate from AI-generated explanations.
- Avoid claims that a product causes illness or is unsafe for children. Notes must be factual and tied to label values.
- Any change to `src/domain` needs unit tests. Run typecheck, tests and build before committing.
- Commit messages end with the Co-Authored-By and Claude-Session trailers.
