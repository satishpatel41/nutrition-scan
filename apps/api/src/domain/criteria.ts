/**
 * Configurable, documented assessment criteria.
 *
 * Defaults mirror the UK FSA front-of-pack traffic-light thresholds for FOOD
 * (per 100 g): sugars low <=5 / high >22.5; saturates low <=1.5 / high >5;
 * salt low <=0.3 / high >1.5 (salt 1.5 g ~ sodium 600 mg).
 * These are a transparent default, NOT India's FSSAI rules. Swap the config per
 * market/regulator and have it reviewed before presenting to users as regulatory.
 */
export interface Threshold {
  lowMax: number;
  highMin: number;
}

export interface CriteriaConfig {
  name: string;
  version: number;
  thresholdsPer100g: {
    sugarsG: Threshold;
    saturatedFatG: Threshold;
    sodiumMg: Threshold;
  };
  /** Points deducted for a 'high' / 'medium' flag per nutrient. */
  penalties: { high: number; medium: number };
  /** Points added. */
  bonuses: { fiberHighG: number; fiberPoints: number; proteinHighG: number; proteinPoints: number };
  gradeCutoffs: { A: number; B: number; C: number };
}

export const DEFAULT_CRITERIA: CriteriaConfig = {
  name: 'fsa-traffic-light-default',
  version: 1,
  thresholdsPer100g: {
    sugarsG: { lowMax: 5, highMin: 22.5 },
    saturatedFatG: { lowMax: 1.5, highMin: 5 },
    sodiumMg: { lowMax: 120, highMin: 600 },
  },
  penalties: { high: 25, medium: 10 },
  bonuses: { fiberHighG: 6, fiberPoints: 8, proteinHighG: 10, proteinPoints: 5 },
  gradeCutoffs: { A: 80, B: 60, C: 40 },
};
