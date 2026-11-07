export function normalizeQuarter(deg: number): number {
  return (((Math.round(deg / 90) * 90) % 360) + 360) % 360;
}
