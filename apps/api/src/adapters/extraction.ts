import type { ExtractedLabel } from '../domain/types.js';

/** Provider-agnostic label extraction (OCR + structured extraction). */
export interface LabelExtractionProvider {
  readonly name: string;
  extract(image: { bytes: Uint8Array; mimeType: string }): Promise<ExtractedLabel>;
}

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`Extraction provider "${provider}" is not configured. Set the required API key; no fake results are returned.`);
    this.name = 'ProviderNotConfiguredError';
  }
}

/** Default when no key is set: fail loudly instead of returning invented data. */
export class UnconfiguredProvider implements LabelExtractionProvider {
  readonly name = 'unconfigured';
  async extract(): Promise<ExtractedLabel> {
    throw new ProviderNotConfiguredError(this.name);
  }
}

export function getExtractionProvider(env = process.env): LabelExtractionProvider {
  // Real adapters (e.g. a vision LLM provider) plug in here keyed by EXTRACTION_PROVIDER.
  if (!env.EXTRACTION_PROVIDER) return new UnconfiguredProvider();
  throw new ProviderNotConfiguredError(env.EXTRACTION_PROVIDER);
}
