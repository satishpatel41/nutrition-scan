import { describe, expect, it } from 'vitest';
import { assess, childAwarenessNotes, MissingNutritionLabelError } from '../src/domain/assessment.js';
import { detectAllergens } from '../src/domain/allergens.js';
import { compareWithinCategory, suggestAlternatives } from '../src/domain/compare.js';
import { getExtractionProvider, ProviderNotConfiguredError } from '../src/adapters/extraction.js';
import type { ExtractedLabel } from '../src/domain/types.js';

const base = (n: Partial<NonNullable<ExtractedLabel['nutritionPer100g']>> | null): ExtractedLabel => ({
  productName: 'Test',
  category: 'biscuits',
  servingSizeG: 30,
  ingredients: ['wheat flour', 'sugar'],
  allergensDeclared: ['wheat'],
  fieldMeta: {},
  nutritionPer100g:
    n === null
      ? null
      : {
          energyKcal: 450, proteinG: 6, carbsG: 70, sugarsG: 10, fatG: 15,
          saturatedFatG: 3, fiberG: 2, sodiumMg: 300, ...n,
        },
});

describe('assess', () => {
  it('throws when the nutrition table is missing (never infers)', () => {
    expect(() => assess(base(null))).toThrow(MissingNutritionLabelError);
  });

  it('flags high sugar, sat fat and sodium and lowers the score', () => {
    const a = assess(base({ sugarsG: 30, saturatedFatG: 8, sodiumMg: 900 }));
    expect(a.flags.every((f) => f.level === 'high')).toBe(true);
    expect(a.score).toBe(25);
    expect(a.grade).toBe('D');
  });

  it('gives medium flags a smaller penalty', () => {
    const a = assess(base({ sugarsG: 10, saturatedFatG: 3, sodiumMg: 300 }));
    expect(a.flags.every((f) => f.level === 'medium')).toBe(true);
    expect(a.score).toBe(70);
    expect(a.grade).toBe('B');
  });

  it('reports missing nutrients rather than assuming zero', () => {
    const a = assess(base({ sugarsG: null }));
    expect(a.missingFields).toContain('sugarsG');
    expect(a.flags.find((f) => f.nutrient === 'sugars')).toBeUndefined();
  });

  it('awards fibre/protein bonuses and caps at 100', () => {
    const a = assess(base({ sugarsG: 1, saturatedFatG: 0.5, sodiumMg: 50, fiberG: 8, proteinG: 12 }));
    expect(a.score).toBe(100);
    expect(a.positives).toHaveLength(2);
  });
});

describe('childAwarenessNotes', () => {
  it('is factual and only mentions high flags', () => {
    const notes = childAwarenessNotes(assess(base({ sugarsG: 30 })));
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/high in sugar/);
    expect(notes[0]).not.toMatch(/dangerous|toxic|poison/i);
  });
});

describe('detectAllergens', () => {
  it('flags allergens present in ingredients but not declared', () => {
    const r = detectAllergens(['wheat flour', 'milk solids', 'peanut oil'], ['wheat']);
    expect(r.possibleUndeclared.sort()).toEqual(['milk', 'peanut']);
  });
});

describe('comparison', () => {
  const mk = (id: string, cat: string, s: Partial<NonNullable<ExtractedLabel['nutritionPer100g']>>) => ({
    id, name: id, category: cat, assessment: assess(base(s)),
  });
  it('ranks within a category and rejects cross-category', () => {
    const a = mk('a', 'biscuits', { sugarsG: 30 });
    const b = mk('b', 'biscuits', { sugarsG: 3, saturatedFatG: 1, sodiumMg: 100 });
    expect(compareWithinCategory([a, b])[0].id).toBe('b');
    expect(() => compareWithinCategory([a, mk('c', 'chips', {})])).toThrow();
  });
  it('suggests only strictly better same-category alternatives', () => {
    const a = mk('a', 'biscuits', { sugarsG: 30 });
    const b = mk('b', 'biscuits', { sugarsG: 3, saturatedFatG: 1, sodiumMg: 100 });
    expect(suggestAlternatives(a, [a, b]).map((x) => x.id)).toEqual(['b']);
    expect(suggestAlternatives(b, [a, b])).toEqual([]);
  });
});

describe('extraction provider', () => {
  it('fails loudly when not configured', async () => {
    await expect(getExtractionProvider({} as NodeJS.ProcessEnv).extract()).rejects.toBeInstanceOf(
      ProviderNotConfiguredError,
    );
  });
});
