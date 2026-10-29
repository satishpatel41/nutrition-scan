import { CriteriaConfig, DEFAULT_CRITERIA, Threshold } from './criteria.js';
import type { Assessment, ExtractedLabel, Level, NutrientFlag } from './types.js';

export class MissingNutritionLabelError extends Error {
  constructor() {
    super('Nutrition table not found. Please photograph the nutrition label; values are never inferred.');
    this.name = 'MissingNutritionLabelError';
  }
}

function level(value: number, t: Threshold): Level {
  if (value <= t.lowMax) return 'low';
  if (value > t.highMin) return 'high';
  return 'medium';
}

const DISCLAIMER =
  'Score is computed from label values using the criteria shown. It is an aid for comparison, not medical advice or a claim that a product is safe or unsafe.';

export function assess(label: ExtractedLabel, criteria: CriteriaConfig = DEFAULT_CRITERIA): Assessment {
  const n = label.nutritionPer100g;
  if (!n) throw new MissingNutritionLabelError();

  const missingFields: string[] = [];
  const flags: NutrientFlag[] = [];
  const th = criteria.thresholdsPer100g;

  const checks = [
    { key: 'sugars' as const, val: n.sugarsG, t: th.sugarsG, unit: 'g' as const, name: 'sugarsG' },
    { key: 'saturatedFat' as const, val: n.saturatedFatG, t: th.saturatedFatG, unit: 'g' as const, name: 'saturatedFatG' },
    { key: 'sodium' as const, val: n.sodiumMg, t: th.sodiumMg, unit: 'mg' as const, name: 'sodiumMg' },
  ];

  let score = 100;
  for (const c of checks) {
    if (c.val === null) {
      missingFields.push(c.name);
      continue;
    }
    const lv = level(c.val, c.t);
    flags.push({
      nutrient: c.key,
      level: lv,
      valuePer100g: c.val,
      unit: c.unit,
      thresholdNote: `low <= ${c.t.lowMax}${c.unit}, high > ${c.t.highMin}${c.unit} per 100 g`,
    });
    if (lv === 'high') score -= criteria.penalties.high;
    else if (lv === 'medium') score -= criteria.penalties.medium;
  }

  const positives: string[] = [];
  if (n.fiberG !== null && n.fiberG >= criteria.bonuses.fiberHighG) {
    score += criteria.bonuses.fiberPoints;
    positives.push('Good fibre content');
  }
  if (n.proteinG !== null && n.proteinG >= criteria.bonuses.proteinHighG) {
    score += criteria.bonuses.proteinPoints;
    positives.push('Good protein content');
  }

  score = Math.max(0, Math.min(100, score));
  const g = criteria.gradeCutoffs;
  const grade = score >= g.A ? 'A' : score >= g.B ? 'B' : score >= g.C ? 'C' : 'D';

  return {
    criteriaName: criteria.name,
    criteriaVersion: criteria.version,
    score,
    grade,
    flags,
    positives,
    missingFields,
    disclaimer: DISCLAIMER,
  };
}

/** Parent-facing wording: factual, non-alarmist, tied to the flagged label values. */
export function childAwarenessNotes(a: Assessment): string[] {
  const notes: string[] = [];
  for (const f of a.flags) {
    if (f.level !== 'high') continue;
    const label = f.nutrient === 'sugars' ? 'sugar' : f.nutrient === 'saturatedFat' ? 'saturated fat' : 'sodium';
    notes.push(
      `This product is high in ${label} (${f.valuePer100g}${f.unit} per 100 g). Many guidelines suggest children's intake of ${label} be moderated, so it may suit occasional rather than everyday eating.`,
    );
  }
  if (notes.length === 0) notes.push('No nutrient was flagged high on the criteria used. Portion size still matters.');
  return notes;
}
