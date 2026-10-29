import type { Assessment } from './types.js';

export interface ScannedProduct {
  id: string;
  name: string;
  category: string | null;
  assessment: Assessment;
}

/** Same-category comparison. Ranks by score, ties broken by fewer 'high' flags. */
export function compareWithinCategory(items: ScannedProduct[]) {
  const cats = new Set(items.map((i) => i.category ?? '__none__'));
  if (cats.size > 1) {
    throw new Error('Products must be in the same category to be compared.');
  }
  const highs = (a: Assessment) => a.flags.filter((f) => f.level === 'high').length;
  const ranked = [...items].sort(
    (a, b) => b.assessment.score - a.assessment.score || highs(a.assessment) - highs(b.assessment),
  );
  return ranked.map((p, i) => ({
    rank: i + 1,
    id: p.id,
    name: p.name,
    score: p.assessment.score,
    grade: p.assessment.grade,
    highFlags: highs(p.assessment),
    basis: `${p.assessment.criteriaName} v${p.assessment.criteriaVersion}`,
  }));
}

/** Alternatives = same category, strictly better score than the reference. */
export function suggestAlternatives(reference: ScannedProduct, pool: ScannedProduct[]) {
  return pool
    .filter(
      (p) =>
        p.id !== reference.id &&
        p.category === reference.category &&
        p.assessment.score > reference.assessment.score,
    )
    .sort((a, b) => b.assessment.score - a.assessment.score)
    .slice(0, 5);
}
