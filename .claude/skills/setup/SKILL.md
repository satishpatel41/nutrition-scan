---
name: setup
description: Set up the nutrition-scan repo for development. Use when cloning fresh, installing dependencies, or verifying the API builds and tests pass.
---

# Setup

1. Requires Node 22+ and npm.
2. `cd apps/api && npm install`
3. `npx prisma generate` (needs network access to Prisma's engine binaries).
4. Verify: `npm run typecheck && npm test && npm run build`. All must pass before committing.
5. For database work, set `DATABASE_URL` to a Postgres instance and run `npm run prisma:migrate`.

## Rules for changes

- Never fabricate nutrition values or return fake extraction results. Unconfigured providers must throw.
- Keep label-derived values separate from AI-generated explanations.
- Add or update unit tests for any change to `src/domain`.
- Commit messages end with the project's co-author trailer.
