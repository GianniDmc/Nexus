export function parseBoundedInt(
  value: string | null | undefined,
  defaultValue: number,
  min: number,
  max: number
): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }

  const intValue = Math.trunc(parsed);
  return Math.min(Math.max(intValue, min), max);
}
