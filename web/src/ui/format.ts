/**
 * Nombres à la française, lisibles en chiffres étroits : l’espace fine insécable
 * (U+202F) d’Intl disparaît presque à 13 px en largeur 80 % ; on la remplace par
 * une espace insécable (U+00A0) pour que « 18 450 » ne se lise pas « 18450 ».
 */
const fr = new Intl.NumberFormat('fr-FR');

export function formatNombre(n: number): string {
  return fr.format(n).replace(/\u202f/g, '\u00a0');
}
