export type PatternSource = { path: string };

export function getPatternSource(state: unknown): PatternSource | null {
  const source = (state as { patternSource?: PatternSource } | null)?.patternSource;
  return typeof source?.path === 'string' && source.path.startsWith('/patterns?') ? source : null;
}
