// Faïence palette lab: builds OKLCH ramps, gamut-maps to sRGB hex, verifies WCAG contrasts.
// Usage: npm i -D culori && node design/tools/palette.mjs report
import { formatHex, toGamut, wcagContrast } from 'culori';

const clamp = toGamut('rgb', 'oklch');
const hex = (l, c, h) => formatHex(clamp({ mode: 'oklch', l, c, h }));

const ramp = (h, stops) => Object.fromEntries(stops.map(([k, l, c]) => [k, hex(l, c, h)]));

export const email = ramp(268, [
  [50, 0.972, 0.012], [100, 0.940, 0.026], [200, 0.880, 0.052], [300, 0.790, 0.090],
  [400, 0.665, 0.130], [500, 0.545, 0.150], [600, 0.455, 0.145], [700, 0.385, 0.130],
  [800, 0.325, 0.112], [900, 0.265, 0.090], [950, 0.195, 0.062],
]);
export const nuit = ramp(268, [
  [950, 0.150, 0.030], [900, 0.185, 0.034], [850, 0.215, 0.036], [800, 0.250, 0.038],
  [700, 0.315, 0.036], [600, 0.400, 0.032],
]);
export const ardoise = ramp(262, [
  [25, 0.988, 0.003], [50, 0.972, 0.005], [100, 0.946, 0.008], [150, 0.920, 0.010],
  [200, 0.888, 0.013], [300, 0.800, 0.018], [400, 0.680, 0.022], [450, 0.620, 0.022], [500, 0.530, 0.024],
  [600, 0.455, 0.026], [700, 0.370, 0.028], [800, 0.285, 0.030], [900, 0.215, 0.032],
]);
export const ambre = {
  200: '#ffe4a6', 300: '#ffd46e', 400: '#ffc640', 500: '#ffb81c', 600: '#e39b00', 700: '#a87300', eteint: '#4d3906',
};
export const statut = {
  normal: '#2f9a56', normalTexte: '#1d7a41', normalNuit: '#62d18e',
  vigilance: '#f07a12', vigilanceTexte: '#b04f06', vigilanceNuit: '#ffa257',
  signal: '#d7262d', signalTexte: '#b3141c', signalNuit: '#ff7a7a',
};
// IDFM open-data line colours (GTFS route_color / route_text_color).
export const lignes = {
  '1': ['#FFBE00', '#000000'], '2': ['#0055C8', '#FFFFFF'], '3': ['#6E6E00', '#FFFFFF'],
  '3b': ['#82C8E6', '#000000'], '4': ['#A0006E', '#FFFFFF'], '5': ['#FF5A00', '#000000'],
  '6': ['#82DC73', '#000000'], '7': ['#FF82B4', '#000000'], '7b': ['#82DC73', '#000000'],
  '8': ['#D282BE', '#000000'], '9': ['#D2D200', '#000000'], '10': ['#DC9600', '#000000'],
  '11': ['#6E491E', '#FFFFFF'], '12': ['#00643C', '#FFFFFF'], '13': ['#82C8E6', '#000000'],
  '14': ['#640082', '#FFFFFF'], 'A': ['#EB2132', '#FFFFFF'], 'B': ['#5091CB', '#FFFFFF'],
  'C': ['#FFCC30', '#000000'], 'D': ['#008B5B', '#FFFFFF'], 'E': ['#B94E9A', '#FFFFFF'],
};

if (process.argv[2] === 'report') {
  const show = (name, o) => console.log(name.padEnd(7), Object.entries(o).map(([k, v]) => `${k}:${v}`).join('  '));
  show('email', email); show('nuit', nuit); show('ardoise', ardoise); show('ambre', ambre);
  const c = (a, b) => wcagContrast(a, b).toFixed(2);
  const W = '#ffffff', ink = ardoise[900];
  console.log('\n— Light mode text on faïence white / ardoise-50 ground');
  for (const [k, v] of [['encre ardoise-900', ardoise[900]], ['ardoise-700', ardoise[700]], ['ardoise-600', ardoise[600]], ['ardoise-500', ardoise[500]], ['ardoise-400', ardoise[400]], ['email-800', email[800]], ['email-600', email[600]], ['normalTexte', statut.normalTexte], ['vigilanceTexte', statut.vigilanceTexte], ['signalTexte', statut.signalTexte]])
    console.log(k.padEnd(16), v, 'on #fff', c(v, W), ' on ardoise-50', c(v, ardoise[50]), ' on ardoise-100', c(v, ardoise[100]));
  console.log('\n— Non-text (≥3:1) on white');
  for (const [k, v] of [['ardoise-200 border', ardoise[200]], ['ardoise-300 border', ardoise[300]], ['ardoise-400', ardoise[400]], ['email-600 focus', email[600]], ['laiton #c9a227 (v1 focus)', '#c9a227']])
    console.log(k.padEnd(26), v, c(v, W));
  console.log('\n— Dark mode text on nuit-900 surface / nuit-950 ground');
  for (const [k, v] of [['#eef1f7', '#eef1f7'], ['ardoise-300', ardoise[300]], ['ardoise-400', ardoise[400]], ['email-200', email[200]], ['email-300 focus', email[300]], ['normalNuit', statut.normalNuit], ['vigilanceNuit', statut.vigilanceNuit], ['signalNuit', statut.signalNuit]])
    console.log(k.padEnd(16), v, 'on nuit-900', c(v, nuit[900]), ' on nuit-850', c(v, nuit[850]), ' on nuit-950', c(v, nuit[950]));
  console.log('\n— Afficheur (on #000)');
  for (const [k, v] of Object.entries(ambre)) console.log(('ambre-' + k).padEnd(14), v, c(v, '#000000'));
  console.log('\n— Buttons');
  console.log('white on email-800', c(W, email[800]), ' white on email-700', c(W, email[700]), ' email-900 on #f2f4f8', c(email[900], '#f2f4f8'));
  console.log('\n— Line badges: GTFS ink contrast, and best ink');
  for (const [k, [bg, fg]] of Object.entries(lignes)) {
    const cb = wcagContrast(bg, '#000'), cw = wcagContrast(bg, '#fff');
    console.log(('L' + k).padEnd(4), bg, 'gtfs-ink', fg, c(bg, fg), ' black', cb.toFixed(2), ' white', cw.toFixed(2), ' vs white surface', c(bg, W), ' vs nuit-900', c(bg, nuit[900]));
  }
}
