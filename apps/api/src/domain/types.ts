export type FieldSource = 'label_ocr' | 'user_corrected' | 'ai_explanation';

export interface FieldMeta<T = unknown> {
  value: T;
  /** 0..1, as reported by the OCR/vision provider. User corrections are 1. */
  confidence: number;
  source: FieldSource;
}

/** Per-100g values read from the label. Null means "not on the label". Never guessed. */
export interface NutritionPer100g {
  energyKcal: number | null;
  proteinG: number | null;
  carbsG: number | null;
  sugarsG: number | null;
  fatG: number | null;
  saturatedFatG: number | null;
  fiberG: number | null;
  sodiumMg: number | null;
}

export interface ExtractedLabel {
  productName: string | null;
  category: string | null;
  servingSizeG: number | null;
  ingredients: string[];
  allergensDeclared: string[];
  nutritionPer100g: NutritionPer100g | null; // null => no nutrition table found
  fieldMeta: Record<string, FieldMeta>;
}

export type Level = 'low' | 'medium' | 'high';

export interface NutrientFlag {
  nutrient: 'sugars' | 'saturatedFat' | 'sodium';
  level: Level;
  valuePer100g: number;
  unit: 'g' | 'mg';
  thresholdNote: string;
}

export interface Assessment {
  criteriaName: string;
  criteriaVersion: number;
  /** 0..100, higher = better by the stated criteria. Not a health claim. */
  score: number;
  grade: 'A' | 'B' | 'C' | 'D';
  flags: NutrientFlag[];
  positives: string[];
  missingFields: string[];
  disclaimer: string;
}
