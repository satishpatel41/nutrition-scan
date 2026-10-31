import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { UnconfiguredProvider, type LabelExtractionProvider } from '../src/adapters/extraction.js';
import { createApp } from '../src/app.js';
import { InMemoryStore } from '../src/store.js';
import type { ExtractedLabel } from '../src/domain/types.js';

const label = (over: Record<string, number | null> = {}, nutrition = true) => ({
  productName: 'Cream Biscuit', category: 'biscuits', servingSizeG: 30,
  ingredients: ['refined wheat flour', 'sugar', 'palm oil', 'milk solids'],
  allergensDeclared: ['wheat'],
  nutritionPer100g: nutrition ? {
    energyKcal: 480, proteinG: 5, carbsG: 70, sugarsG: 30, fatG: 20,
    saturatedFatG: 9, fiberG: 1, sodiumMg: 400, ...over,
  } : null,
});

// Test double for a configured provider; returns a fixed label (not used in production).
class FakeProvider implements LabelExtractionProvider {
  readonly name = 'fake';
  async extract(): Promise<ExtractedLabel> {
    return { ...label(), fieldMeta: { productName: { value: 'Cream Biscuit', confidence: 0.92, source: 'label_ocr' } } };
  }
}

async function setup(provider: LabelExtractionProvider = new UnconfiguredProvider()) {
  const app = createApp({ store: new InMemoryStore(), provider, jwtSecret: 'test' });
  const r = await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' });
  return { app, token: r.body.token as string };
}
const authed = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('auth', () => {
  it('registers, rejects duplicates, logs in, rejects bad password', async () => {
    const { app } = await setup();
    expect((await request(app).post('/auth/register').send({ email: 'a@b.com', password: 'password123' })).status).toBe(409);
    expect((await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'password123' })).status).toBe(200);
    expect((await request(app).post('/auth/login').send({ email: 'a@b.com', password: 'wrongwrong' })).status).toBe(401);
    expect((await request(app).get('/scans')).status).toBe(401);
  });
});

describe('scans', () => {
  let app: ReturnType<typeof createApp>; let token: string;
  beforeEach(async () => { ({ app, token } = await setup()); });

  it('creates a manual scan with assessment, allergen cross-check, glossary and child notes', async () => {
    const r = await request(app).post('/scans').set(authed(token)).send({ label: label() });
    expect(r.status).toBe(201);
    expect(r.body.assessment.flags.find((f: { nutrient: string }) => f.nutrient === 'sugars').level).toBe('high');
    expect(r.body.allergens.possibleUndeclared).toContain('milk');
    expect(r.body.ingredientExplanations.find((e: { ingredient: string }) => e.ingredient === 'palm oil').explanation).toBeTruthy();
    expect(r.body.childAwareness.join(' ')).toMatch(/high in sugar/);
    expect(r.body.label.fieldMeta.productName.source).toBe('user_corrected');
  });

  it('does not infer nutrition when the table is missing', async () => {
    const r = await request(app).post('/scans').set(authed(token)).send({ label: label({}, false) });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('NEEDS_NUTRITION_LABEL');
    expect(r.body.assessment).toBeNull();
    expect(r.body.notice).toMatch(/Nothing has been estimated/);
  });

  it('returns 503 (not fake data) for an image when no provider is configured', async () => {
    const r = await request(app).post('/scans').set(authed(token)).send({ image: { base64: 'AAAA', mimeType: 'image/jpeg' } });
    expect(r.status).toBe(503);
    expect(r.body.code).toBe('PROVIDER_NOT_CONFIGURED');
  });

  it('uses a configured provider and keeps OCR source + confidence', async () => {
    const s = await setup(new FakeProvider());
    const r = await request(s.app).post('/scans').set(authed(s.token)).send({ image: { base64: 'AAAA', mimeType: 'image/jpeg' } });
    expect(r.status).toBe(201);
    expect(r.body.source).toBe('provider');
    expect(r.body.label.fieldMeta.productName).toMatchObject({ source: 'label_ocr', confidence: 0.92 });
  });

  it('applies a correction, recomputes the assessment, and records it', async () => {
    const c = await request(app).post('/scans').set(authed(token)).send({ label: label() });
    const r = await request(app).post(`/scans/${c.body.id}/corrections`).set(authed(token)).send({ field: 'nutrition.sugarsG', value: 3 });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CORRECTED');
    expect(r.body.assessment.flags.find((f: { nutrient: string }) => f.nutrient === 'sugars').level).toBe('low');
    expect(r.body.corrections[0]).toMatchObject({ field: 'nutrition.sugarsG', oldValue: 30, newValue: 3 });
    expect((await request(app).post(`/scans/${c.body.id}/corrections`).set(authed(token)).send({ field: 'nutrition.sugarsG', value: -1 })).status).toBe(400);
    expect((await request(app).post(`/scans/${c.body.id}/corrections`).set(authed(token)).send({ field: 'id', value: 'x' })).status).toBe(400);
  });

  it('a correction can supply a missing nutrition table', async () => {
    const c = await request(app).post('/scans').set(authed(token)).send({ label: label({}, false) });
    let r;
    for (const [k, v] of [['sugarsG', 2], ['saturatedFatG', 1], ['sodiumMg', 100]] as const)
      r = await request(app).post(`/scans/${c.body.id}/corrections`).set(authed(token)).send({ field: `nutrition.${k}`, value: v });
    expect(r!.body.assessment).not.toBeNull();
    expect(r!.body.status).toBe('CORRECTED');
  });

  it('compares same-category products and rejects cross-category', async () => {
    const a = await request(app).post('/scans').set(authed(token)).send({ label: label() });
    const b = await request(app).post('/scans').set(authed(token)).send({ label: label({ sugarsG: 3, saturatedFatG: 1, sodiumMg: 100 }) });
    const cmp = await request(app).get(`/scans/compare?ids=${a.body.id},${b.body.id}`).set(authed(token));
    expect(cmp.body.ranking[0].id).toBe(b.body.id);
    const other = await request(app).post('/scans').set(authed(token)).send({ label: { ...label(), category: 'chips' } });
    expect((await request(app).get(`/scans/compare?ids=${a.body.id},${other.body.id}`).set(authed(token))).status).toBe(422);
    const alt = await request(app).get(`/scans/${a.body.id}/alternatives`).set(authed(token));
    expect(alt.body.alternatives.map((x: { id: string }) => x.id)).toEqual([b.body.id]);
  });

  it('keeps history private per user, supports reports and deletion', async () => {
    const c = await request(app).post('/scans').set(authed(token)).send({ label: label() });
    const other = await request(app).post('/auth/register').send({ email: 'c@d.com', password: 'password123' });
    expect((await request(app).get(`/scans/${c.body.id}`).set(authed(other.body.token))).status).toBe(404);
    expect((await request(app).get('/scans').set(authed(other.body.token))).body).toEqual([]);
    expect((await request(app).post(`/scans/${c.body.id}/report`).set(authed(token)).send({ reason: 'Wrong sugar value' })).status).toBe(201);
    expect((await request(app).delete(`/scans/${c.body.id}`).set(authed(token))).status).toBe(204);
    expect((await request(app).get('/scans').set(authed(token))).body).toEqual([]);
  });

  it('deletes all of a user\'s scan data', async () => {
    await request(app).post('/scans').set(authed(token)).send({ label: label() });
    await request(app).post('/scans').set(authed(token)).send({ label: label() });
    expect((await request(app).delete('/scans').set(authed(token))).body.deleted).toBe(2);
  });
});
