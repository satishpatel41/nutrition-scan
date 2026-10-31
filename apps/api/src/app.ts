import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import express, { type NextFunction, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { ProviderNotConfiguredError, type LabelExtractionProvider } from './adapters/extraction.js';
import { detectAllergens } from './domain/allergens.js';
import { assess, childAwarenessNotes, MissingNutritionLabelError } from './domain/assessment.js';
import { compareWithinCategory, suggestAlternatives, type ScannedProduct } from './domain/compare.js';
import { DEFAULT_CRITERIA } from './domain/criteria.js';
import { explainIngredients } from './domain/ingredients.js';
import type { ExtractedLabel, FieldMeta } from './domain/types.js';
import type { ScanRec, Store } from './store.js';

const num = z.number().nonnegative().nullable();
const nutritionSchema = z.object({
  energyKcal: num, proteinG: num, carbsG: num, sugarsG: num,
  fatG: num, saturatedFatG: num, fiberG: num, sodiumMg: num,
});
const labelSchema = z.object({
  productName: z.string().min(1).max(200).nullable(),
  category: z.string().min(1).max(100).nullable(),
  servingSizeG: z.number().positive().nullable(),
  ingredients: z.array(z.string().min(1).max(200)).max(200),
  allergensDeclared: z.array(z.string().min(1).max(100)).max(50),
  nutritionPer100g: nutritionSchema.nullable(),
});

export interface AppDeps {
  store: Store;
  provider: LabelExtractionProvider;
  jwtSecret: string;
}

type AuthedRequest = Request & { userId: string };

function derive(scan: ScanRec) {
  const l = scan.label;
  return {
    allergens: detectAllergens(l.ingredients, l.allergensDeclared),
    ingredientExplanations: explainIngredients(l.ingredients),
    childAwareness: scan.assessment ? childAwarenessNotes(scan.assessment) : [],
    criteria: scan.assessment
      ? { name: scan.assessment.criteriaName, version: scan.assessment.criteriaVersion }
      : null,
    notice: scan.status === 'NEEDS_NUTRITION_LABEL'
      ? 'No nutrition table was found. Please photograph the nutrition label or enter the values. Nothing has been estimated.'
      : null,
  };
}

function present(scan: ScanRec) {
  return { ...scan, ...derive(scan) };
}

function build(label: ExtractedLabel, base: Pick<ScanRec, 'userId' | 'source'> & Partial<ScanRec>): ScanRec {
  let assessment = null;
  let status: ScanRec['status'] = 'EXTRACTED';
  try { assessment = assess(label); } catch (e) {
    if (e instanceof MissingNutritionLabelError) status = 'NEEDS_NUTRITION_LABEL'; else throw e;
  }
  return {
    id: base.id ?? randomUUID(), userId: base.userId, source: base.source,
    status: base.status && base.status !== 'EXTRACTED' && assessment ? base.status : status,
    label, assessment, corrections: base.corrections ?? [],
    createdAt: base.createdAt ?? new Date().toISOString(),
  };
}

export function createApp(deps: AppDeps) {
  const { store, provider, jwtSecret } = deps;
  const app = express();
  app.use(express.json({ limit: '12mb' }));

  const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

  const auth = (req: Request, res: Response, next: NextFunction) => {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
    try {
      const p = jwt.verify(h.slice(7), jwtSecret) as { sub: string };
      (req as AuthedRequest).userId = p.sub;
      next();
    } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
  };
  const uid = (req: Request) => (req as AuthedRequest).userId;

  app.get('/health', (_req, res) => res.json({ ok: true, extractionProvider: provider.name }));
  app.get('/criteria', (_req, res) => res.json(DEFAULT_CRITERIA));

  const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });
  app.post('/auth/register', wrap(async (req, res) => {
    const p = creds.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Valid email and password (8+ chars) required' });
    const u = await store.createUser(p.data.email, await bcrypt.hash(p.data.password, 10));
    if (!u) return res.status(409).json({ error: 'Email already registered' });
    res.status(201).json({ token: jwt.sign({ sub: u.id }, jwtSecret, { expiresIn: '7d' }), user: { id: u.id, email: u.email } });
  }));
  app.post('/auth/login', wrap(async (req, res) => {
    const p = creds.safeParse(req.body);
    const u = p.success ? await store.findUserByEmail(p.data.email) : null;
    if (!p.success || !u || !(await bcrypt.compare(p.data.password, u.passwordHash)))
      return res.status(401).json({ error: 'Invalid email or password' });
    res.json({ token: jwt.sign({ sub: u.id }, jwtSecret, { expiresIn: '7d' }), user: { id: u.id, email: u.email } });
  }));

  // Create a scan from an image (provider) or from manually entered label values.
  const createBody = z.union([
    z.object({ image: z.object({ base64: z.string().min(1), mimeType: z.string().regex(/^image\//) }) }),
    z.object({ label: labelSchema }),
  ]);
  app.post('/scans', auth, wrap(async (req, res) => {
    const p = createBody.safeParse(req.body);
    if (!p.success) return res.status(400).json({ error: 'Provide an image or label values', details: p.error.flatten() });
    let label: ExtractedLabel;
    let source: ScanRec['source'];
    if ('image' in p.data) {
      try {
        label = await provider.extract({ bytes: Buffer.from(p.data.image.base64, 'base64'), mimeType: p.data.image.mimeType });
      } catch (e) {
        if (e instanceof ProviderNotConfiguredError)
          return res.status(503).json({ error: e.message, code: 'PROVIDER_NOT_CONFIGURED', hint: 'You can enter label values manually.' });
        throw e;
      }
      source = 'provider';
    } else {
      const meta: Record<string, FieldMeta> = {};
      for (const k of Object.keys(p.data.label)) {
        meta[k] = { value: (p.data.label as Record<string, unknown>)[k], confidence: 1, source: 'user_corrected' };
      }
      label = { ...p.data.label, fieldMeta: meta };
      source = 'manual';
    }
    const scan = await store.saveScan(build(label, { userId: uid(req), source }));
    res.status(201).json(present(scan));
  }));

  app.get('/scans', auth, wrap(async (req, res) => {
    res.json((await store.listScans(uid(req))).map(present));
  }));

  // Compare: ?ids=a,b,c (same category only)
  app.get('/scans/compare', auth, wrap(async (req, res) => {
    const ids = String(req.query.ids ?? '').split(',').filter(Boolean);
    if (ids.length < 2) return res.status(400).json({ error: 'Provide at least two scan ids' });
    const scans = await Promise.all(ids.map((i) => store.getScan(uid(req), i)));
    if (scans.some((s) => !s)) return res.status(404).json({ error: 'Scan not found' });
    const items: ScannedProduct[] = [];
    for (const s of scans as ScanRec[]) {
      if (!s.assessment) return res.status(422).json({ error: `Scan ${s.id} has no nutrition table, so it cannot be compared` });
      items.push({ id: s.id, name: s.label.productName ?? 'Unnamed product', category: s.label.category, assessment: s.assessment });
    }
    try { res.json({ ranking: compareWithinCategory(items) }); }
    catch (e) { res.status(422).json({ error: (e as Error).message }); }
  }));

  app.get('/scans/:id', auth, wrap(async (req, res) => {
    const s = await store.getScan(uid(req), req.params.id);
    s ? res.json(present(s)) : res.status(404).json({ error: 'Scan not found' });
  }));

  app.get('/scans/:id/alternatives', auth, wrap(async (req, res) => {
    const s = await store.getScan(uid(req), req.params.id);
    if (!s) return res.status(404).json({ error: 'Scan not found' });
    if (!s.assessment) return res.status(422).json({ error: 'No nutrition table; cannot suggest alternatives' });
    const toProduct = (x: ScanRec): ScannedProduct | null => x.assessment
      ? { id: x.id, name: x.label.productName ?? 'Unnamed product', category: x.label.category, assessment: x.assessment } : null;
    const ref = toProduct(s)!;
    const pool = (await store.listScans(uid(req))).map(toProduct).filter((x): x is ScannedProduct => !!x);
    res.json({
      basis: 'Better score on the same criteria, same category, among your own scanned products.',
      alternatives: suggestAlternatives(ref, pool).map((a) => ({ id: a.id, name: a.name, score: a.assessment.score, grade: a.assessment.grade })),
    });
  }));

  const correction = z.object({ field: z.string(), value: z.unknown() });
  const nutrientKeys = Object.keys(nutritionSchema.shape);
  app.post('/scans/:id/corrections', auth, wrap(async (req, res) => {
    const s = await store.getScan(uid(req), req.params.id);
    if (!s) return res.status(404).json({ error: 'Scan not found' });
    const c = correction.safeParse(req.body);
    if (!c.success) return res.status(400).json({ error: 'field and value required' });
    const { field, value } = c.data;
    const label = structuredClone(s.label);
    let old: unknown;
    if (field.startsWith('nutrition.')) {
      const key = field.slice(10);
      if (!nutrientKeys.includes(key)) return res.status(400).json({ error: `Unknown nutrient ${key}` });
      const v = num.safeParse(value);
      if (!v.success) return res.status(400).json({ error: 'Nutrient value must be a non-negative number or null' });
      label.nutritionPer100g ??= { energyKcal: null, proteinG: null, carbsG: null, sugarsG: null, fatG: null, saturatedFatG: null, fiberG: null, sodiumMg: null };
      old = (label.nutritionPer100g as unknown as Record<string, unknown>)[key];
      (label.nutritionPer100g as unknown as Record<string, unknown>)[key] = v.data;
    } else if (['productName', 'category', 'servingSizeG', 'ingredients', 'allergensDeclared'].includes(field)) {
      const shape = labelSchema.shape as Record<string, z.ZodTypeAny>;
      const v = shape[field].safeParse(value);
      if (!v.success) return res.status(400).json({ error: `Invalid value for ${field}` });
      old = (label as unknown as Record<string, unknown>)[field];
      (label as unknown as Record<string, unknown>)[field] = v.data;
    } else return res.status(400).json({ error: `Field ${field} cannot be corrected` });

    label.fieldMeta = { ...label.fieldMeta, [field]: { value, confidence: 1, source: 'user_corrected' } };
    const next = build(label, {
      userId: s.userId, source: s.source, id: s.id, createdAt: s.createdAt,
      status: 'CORRECTED',
      corrections: [...s.corrections, { field, oldValue: old, newValue: value, at: new Date().toISOString() }],
    });
    res.json(present(await store.saveScan(next)));
  }));

  const reportBody = z.object({ reason: z.string().min(3).max(200), details: z.string().max(2000).optional() });
  app.post('/scans/:id/report', auth, wrap(async (req, res) => {
    const s = await store.getScan(uid(req), req.params.id);
    if (!s) return res.status(404).json({ error: 'Scan not found' });
    const b = reportBody.safeParse(req.body);
    if (!b.success) return res.status(400).json({ error: 'reason required' });
    res.status(201).json(await store.addReport({ userId: uid(req), scanId: s.id, ...b.data }));
  }));

  app.delete('/scans/:id', auth, wrap(async (req, res) => {
    (await store.deleteScan(uid(req), req.params.id)) ? res.status(204).end() : res.status(404).json({ error: 'Scan not found' });
  }));
  app.delete('/scans', auth, wrap(async (req, res) => {
    res.json({ deleted: await store.deleteAllScans(uid(req)) });
  }));

  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
