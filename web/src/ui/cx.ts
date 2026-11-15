/** Joins truthy class names. Drop-in for the `cx` helper used across BoardUI. */
export function cx(...parts: Array<string | false | null | undefined | 0>): string {
  let out = '';
  for (const p of parts) if (p) out = out ? `${out} ${p}` : p;
  return out;
}
