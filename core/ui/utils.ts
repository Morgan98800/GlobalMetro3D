/**
 * Safely escape dynamic values for HTML string interpolation.
 */
export function escapeHtml(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  return str.replace(
    /[&<>"']/g,
    (char) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[char] || char
  );
}
