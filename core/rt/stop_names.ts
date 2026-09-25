/**
 * Normalisation des noms de gares, commune à toutes les villes.
 *
 * Retire les diacritiques, passe en minuscules et réduit toute ponctuation à un
 * espace simple. Sert de clé d'appariement entre l'horaire théorique et les flux
 * temps réel, quelle que soit la ville : « Côte-des-Neiges », « Châtelet » et
 * « King's Cross St. Pancras » passent tous par ici.
 *
 * Toute modification change les clés d'appariement des trois villes à la fois :
 * les snapshots et les tests d'interruption doivent rester verts.
 */
export function normalizeStopName(name: string): string {
  if (!name) return '';
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
