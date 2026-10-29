# Nutrition Scan

AI-assisted packaged-food label scanner (Expo mobile app + Node/TypeScript API). Virtual try-on is planned.

## Status

| Area | State |
|---|---|
| Assessment engine (thresholds, score, grade, child notes) | Done, unit tested |
| Allergen cross-check, same-category comparison/alternatives | Done, unit tested |
| Extraction provider adapter | Interface only. Fails loudly when unconfigured (no fake data) |
| Prisma schema | Written, not yet migrated against a live Postgres |
| REST API (auth, scans, history, delete, corrections, reports) | Not started |
| S3 storage, Expo app | Not started |
| Virtual try-on | Not started |

## Principles

- Label values come only from the label. A missing nutrition table raises an error asking for another photo; nothing is inferred.
- Each field carries a source and confidence. AI explanations are kept separate from label values.
- Scoring is rule-based and configurable (`apps/api/src/domain/criteria.ts`). Default thresholds follow UK FSA front-of-pack levels, not FSSAI. Review before presenting as regulatory.
- Scores are comparison aids, not medical advice or claims that a product is unsafe.

## Develop

```bash
cd apps/api
npm install
npm test          # unit tests (vitest)
npm run typecheck
```

Env (when the API lands): `DATABASE_URL`, `JWT_SECRET`, `EXTRACTION_PROVIDER` plus that provider's key, S3 settings.

## CI

GitHub Actions (`.github/workflows/ci.yml`): install, Prisma generate, typecheck, test, build on every push to `main` and every PR.
