/**
 * Curated plain-language glossary (hand-written, not AI-generated).
 * Unknown ingredients return no explanation rather than a guess.
 */
const GLOSSARY: Record<string, string> = {
  maltodextrin: 'A starch-derived carbohydrate used as a thickener or filler; it is digested quickly like sugar.',
  'palm oil': 'A vegetable oil that is high in saturated fat, often used for frying and baking.',
  'palmolein oil': 'A liquid fraction of palm oil, used for frying; contains saturated fat.',
  'refined wheat flour': 'White flour with the bran and germ removed; contains gluten and less fibre than whole wheat.',
  maida: 'Refined white wheat flour; contains gluten and less fibre than whole wheat.',
  sugar: 'Table sugar (sucrose); adds sweetness and calories.',
  'invert sugar': 'A sweet syrup made of glucose and fructose, used to keep foods moist.',
  salt: 'Sodium chloride; the main source of sodium in packaged food.',
  'iodised salt': 'Table salt with added iodine; still a source of sodium.',
  'milk solids': 'Dried components of milk; a dairy allergen.',
  'soy lecithin': 'An emulsifier from soya that keeps oil and water mixed; a soy allergen.',
  lecithin: 'An emulsifier that keeps oil and water mixed.',
  'baking powder': 'A raising agent that makes baked foods rise.',
  'sodium bicarbonate': 'Baking soda, a raising agent.',
  'citric acid': 'A mild acid used for sourness and as a preservative.',
  'monosodium glutamate': 'A flavour enhancer (MSG) that adds savoury taste; contains sodium.',
  'artificial flavour': 'Laboratory-made flavouring, used in small amounts.',
  'natural flavour': 'Flavouring derived from natural sources, used in small amounts.',
  'sodium benzoate': 'A preservative that slows spoilage.',
  'caramel colour': 'A brown colouring made by heating sugars.',
};

export interface IngredientExplanation {
  ingredient: string;
  explanation: string | null;
  source: 'curated_glossary';
}

export function explainIngredients(ingredients: string[]): IngredientExplanation[] {
  return ingredients.map((raw) => {
    const key = raw.toLowerCase().replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
    return { ingredient: raw, explanation: GLOSSARY[key] ?? null, source: 'curated_glossary' };
  });
}
