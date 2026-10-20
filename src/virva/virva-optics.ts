export type VirvaRgb = [number, number, number];

export interface VirvaTokenColors {
  accent: VirvaRgb;
  info: VirvaRgb;
  live: VirvaRgb;
  ink: VirvaRgb;
  surface: VirvaRgb;
  backdrop: VirvaRgb;
}

export interface VirvaColors extends VirvaTokenColors {
  transmissive: boolean;
}

function luminance([r, g, b]: VirvaRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function prepareVirvaColors(tokens: VirvaTokenColors): VirvaColors {
  return {
    ...tokens,
    transmissive: luminance(tokens.backdrop) > 0.62,
  };
}
