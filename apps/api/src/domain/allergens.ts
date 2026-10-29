/** Common allergen keywords. Used to cross-check the declared list against ingredients text. */
const ALLERGEN_KEYWORDS: Record<string, string[]> = {
  milk: ['milk', 'whey', 'casein', 'butter', 'cream', 'lactose', 'ghee', 'curd'],
  egg: ['egg', 'albumin', 'mayonnaise'],
  peanut: ['peanut', 'groundnut'],
  'tree nut': ['almond', 'cashew', 'walnut', 'hazelnut', 'pistachio', 'pecan'],
  soy: ['soy', 'soya', 'lecithin (soy'],
  wheat: ['wheat', 'gluten', 'maida', 'semolina', 'atta'],
  fish: ['fish', 'anchovy'],
  shellfish: ['shrimp', 'prawn', 'crab', 'lobster'],
  sesame: ['sesame', 'tahini', 'til'],
};

export interface AllergenResult {
  declared: string[];
  /** Found in ingredients text but not in the declared list. Needs user attention. */
  possibleUndeclared: string[];
}

export function detectAllergens(ingredients: string[], declared: string[]): AllergenResult {
  const decl = declared.map((d) => d.trim().toLowerCase());
  const text = ingredients.join(' , ').toLowerCase();
  const found: string[] = [];
  for (const [name, words] of Object.entries(ALLERGEN_KEYWORDS)) {
    const hit = words.some((w) => new RegExp(`\\b${w.replace(/[()]/g, '\\$&')}`, 'i').test(text));
    if (hit && !decl.some((d) => d.includes(name))) found.push(name);
  }
  return { declared, possibleUndeclared: found };
}
