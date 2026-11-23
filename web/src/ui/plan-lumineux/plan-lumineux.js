/* ==========================================================================
   PLAN LUMINEUX — comportements (sans dépendance, ES module)
   À appeler une fois au démarrage : initialiser()
   API :
     initialiser(root)                 génère la faïence + observe les lampes
     genererFaience()                  carreaux du mur et des plaques (une fois)
     observerLampes(root)              refroidissement automatique des ampoules
     tracer(thermo, cible, options)    allume le trajet puis fait rouler la rame
     embarquer(bouton, options)        séquence des portes coulissantes
     clavier(groupe)                   navigation aux flèches d'un pl-clavier
     new Siel(canvas, options)         afficheur SIEL en matrice de LED
   ========================================================================== */

const reduit = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- Faïence : carreaux générés une seule fois ---------------------- */
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function dessinerCarreau(x, tx, ty, o, nuance, idx) {
  const g = o.gap, b = o.bevel, X = tx + g / 2, Y = ty + g / 2, w = o.cw - g, h = o.ch - g;
  const [hh, ss, ll] = o.base;
  x.fillStyle = `hsl(${hh} ${ss}% ${ll + nuance}%)`;
  x.fillRect(X, Y, w, h);
  const poly = (p, c) => { x.beginPath(); x.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) x.lineTo(p[i], p[i + 1]); x.closePath(); x.fillStyle = c; x.fill(); };
  poly([X, Y, X + w, Y, X + w - b, Y + b, X + b, Y + b], `rgba(255,255,255,${o.hi})`);          // biseau haut
  poly([X, Y, X + b, Y + b, X + b, Y + h - b, X, Y + h], `rgba(255,255,255,${o.hi * 0.5})`);   // biseau gauche
  poly([X, Y + h, X + b, Y + h - b, X + w - b, Y + h - b, X + w, Y + h], `rgba(0,0,0,${o.lo})`);// biseau bas
  poly([X + w, Y, X + w, Y + h, X + w - b, Y + h - b, X + w - b, Y + b], `rgba(0,0,0,${o.lo * 0.7})`);
  const fg = x.createLinearGradient(0, Y + b, 0, Y + h - b);
  fg.addColorStop(0, `rgba(255,255,255,${o.hi * 0.22})`); fg.addColorStop(1, `rgba(0,0,0,${o.lo * 0.3})`);
  x.fillStyle = fg; x.fillRect(X + b, Y + b, w - 2 * b, h - 2 * b);
  x.save(); x.beginPath(); x.rect(X + b, Y + b, w - 2 * b, h - 2 * b); x.clip();             // reflet de glaçure
  x.translate(X + w * 0.32, Y + h * 0.36); x.scale(1, 0.42);
  const rg = x.createRadialGradient(0, 0, 0, 0, 0, w * 0.42);
  rg.addColorStop(0, `rgba(255,255,255,${o.spec})`); rg.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = rg; x.fillRect(-w, -w, 2 * w, 2 * w); x.restore();
  const S = rng(1000 + idx);                                                                     // impuretés
  for (let i = 0; i < o.specks; i++) {
    x.fillStyle = `rgba(0,0,0,${0.03 + S() * 0.04})`;
    x.beginPath(); x.arc(X + b + S() * (w - 2 * b), Y + b + S() * (h - 2 * b), 0.35 + S() * 0.4, 0, 7); x.fill();
  }
}
function carreaux(o) {
  const d = 2, W = o.cols * o.cw, H = o.rows * o.ch;
  const c = document.createElement('canvas'); c.width = W * d; c.height = H * d;
  const x = c.getContext('2d'); x.scale(d, d);
  x.fillStyle = o.joint; x.fillRect(0, 0, W, H);
  const R = rng(o.seed || 11), nuances = [];
  for (let i = 0; i < o.rows * o.cols; i++) nuances.push((R() * 2 - 1) * o.vary);
  for (let r = 0; r < o.rows; r++) {
    const decalage = o.offset && r % 2 ? -o.cw / 2 : 0;           // pose à joints décalés
    for (let k = -1; k <= o.cols; k++) {
      const idx = r * o.cols + (((k % o.cols) + o.cols) % o.cols); // même carreau des deux côtés = raccord invisible
      dessinerCarreau(x, k * o.cw + decalage, r * o.ch, o, nuances[idx], idx);
    }
  }
  return c.toDataURL('image/png');
}
export const RECETTES_FAIENCE = {
  murJour:      { cw: 64, ch: 32, cols: 6, rows: 8, offset: true,  gap: 2.5, bevel: 4.5, base: [42, 22, 94],  vary: 1.8, joint: '#c6bfb0', hi: 0.8,  lo: 0.16, spec: 0.4,  specks: 5 },
  murNuit:      { cw: 64, ch: 32, cols: 6, rows: 8, offset: true,  gap: 2.5, bevel: 4.5, base: [222, 7, 15], vary: 1.3, joint: '#08090b', hi: 0.09, lo: 0.5,  spec: 0.05, specks: 3 },
  carreauxJour: { cw: 18, ch: 18, cols: 8, rows: 6, offset: false, gap: 1.2, bevel: 2,   base: [226, 62, 34], vary: 3,  joint: '#9d9686', hi: 0.3,  lo: 0.28, spec: 0.22, specks: 1, seed: 5 },
  carreauxNuit: { cw: 18, ch: 18, cols: 8, rows: 6, offset: false, gap: 1.2, bevel: 2,   base: [226, 55, 31], vary: 3,  joint: '#6f6a60', hi: 0.22, lo: 0.32, spec: 0.14, specks: 1, seed: 5 },
};
export function genererFaience(cible = document.documentElement) {
  const s = cible.style;
  s.setProperty('--pl-mur-jour', `url(${carreaux(RECETTES_FAIENCE.murJour)})`);
  s.setProperty('--pl-mur-nuit', `url(${carreaux(RECETTES_FAIENCE.murNuit)})`);
  s.setProperty('--pl-carreaux-jour', `url(${carreaux(RECETTES_FAIENCE.carreauxJour)})`);
  s.setProperty('--pl-carreaux-nuit', `url(${carreaux(RECETTES_FAIENCE.carreauxNuit)})`);
}

/* ---------- Lampes : refroidissement automatique -------------------------- */
const ETATS = ['aria-pressed', 'aria-checked', 'aria-expanded', 'data-actif', 'data-allume'];
const estVrai = (attr, v) => (attr.startsWith('data-') ? v !== null : v === 'true');
export function refroidir(lampe) {
  if (reduit()) return;
  lampe.classList.remove('is-cool'); void lampe.offsetWidth; lampe.classList.add('is-cool');
  setTimeout(() => lampe.classList.remove('is-cool'), 560);
}
export function observerLampes(root = document.body) {
  const mo = new MutationObserver((muts) => {
    for (const m of muts) {
      const el = m.target, attr = m.attributeName;
      if (!estVrai(attr, m.oldValue) || estVrai(attr, el.getAttribute(attr))) continue;
      const lampes = el.matches('.pl-arret') ? el.querySelectorAll(':scope > .pl-lampe') : el.querySelectorAll(':scope > .pl-calotte > .pl-lampe');
      lampes.forEach(refroidir);
    }
  });
  mo.observe(root, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ETATS });
  return () => mo.disconnect();
}

/* ---------- Thermomètre : trajet allumé puis rame ------------------------- */
const jetons = new WeakMap();
/**
 * @param {HTMLElement} thermo  élément .pl-thermo
 * @param {number | HTMLElement} cible  index ou élément .pl-arret
 * @param {{depuis?: number, pasAllumage?: number, interStation?: number, arretStation?: number}} [options]
 */
export async function tracer(thermo, cible, { depuis, pasAllumage = 110, interStation = 620, arretStation = 260 } = {}) {
  const arrets = [...thermo.querySelectorAll('.pl-arret')];
  const rame = thermo.querySelector('.pl-rame');
  const id = (jetons.get(thermo) || 0) + 1; jetons.set(thermo, id);
  const actif = () => jetons.get(thermo) === id;
  const ori = thermo.dataset.orientation === 'horizontal' ? 'X' : 'Y';
  const de = depuis ?? Math.max(0, arrets.findIndex((a) => a.hasAttribute('data-ici')));
  const a = typeof cible === 'number' ? cible : arrets.indexOf(cible);
  arrets.forEach((x) => x.removeAttribute('data-allume'));
  if (rame) { rame.classList.remove('is-visible'); rame.style.transition = 'none'; }
  if (a < 0) return;
  const pas = de <= a ? 1 : -1, chemin = [];
  for (let i = de; ; i += pas) { chemin.push(i); if (i === a) break; }
  for (const i of chemin) {                                     // 1. allumage PILI, station par station
    if (!actif()) return;
    arrets[i].setAttribute('data-allume', '');
    if (!reduit()) await attendre(pasAllumage);
  }
  if (!rame || chemin.length < 2 || reduit()) return;
  const pos = (el) => {
    const l = el.querySelector('.pl-lampe');
    return ori === 'Y' ? el.offsetTop + el.offsetHeight / 2 - rame.offsetHeight / 2
                       : el.offsetLeft + el.offsetWidth / 2 - rame.offsetWidth / 2;
  };
  await attendre(250); if (!actif()) return;                    // 2. la rame part
  rame.style.transform = `translate${ori}(${pos(arrets[chemin[0]])}px)`;
  void rame.offsetWidth; rame.classList.add('is-visible'); await attendre(350);
  for (let k = 1; k < chemin.length; k++) {                     // 3. accélère, freine, marque l'arrêt
    if (!actif()) return;
    rame.style.transition = `transform ${interStation}ms var(--pl-ease-rame), opacity 200ms`;
    rame.style.transform = `translate${ori}(${pos(arrets[chemin[k]])}px)`;
    await attendre(interStation + (k < chemin.length - 1 ? arretStation : 0));
  }
}
export function effacerTrajet(thermo) {
  jetons.set(thermo, (jetons.get(thermo) || 0) + 1);
  thermo.querySelectorAll('.pl-arret').forEach((x) => x.removeAttribute('data-allume'));
  thermo.querySelector('.pl-rame')?.classList.remove('is-visible');
}

/* ---------- Embarquement : portes coulissantes ---------------------------- */
/* onOuvertes est appelé quand les portes sont grandes ouvertes : lancer la 3D à ce moment. */
/**
 * @param {HTMLElement} bouton  .pl-poussoir[data-variant="embarquement"]
 * @param {{onOuvertes?: () => void, maintien?: number}} [options]
 */
export async function embarquer(bouton, { onOuvertes, maintien = 1500 } = {}) {
  if (bouton.dataset.portes) return;
  const etat = (v) => (bouton.dataset.portes = v);
  if (reduit()) { etat('ouvertes'); onOuvertes?.(); await attendre(900); delete bouton.dataset.portes; return; }
  etat('armees'); await attendre(140);
  etat('deverrouillees'); await attendre(110);
  etat('ouvertes'); await attendre(380); onOuvertes?.(); await attendre(Math.max(0, maintien - 380));
  etat('fermeture'); await attendre(260);
  etat('choc'); await attendre(220);
  delete bouton.dataset.portes;
}

/* ---------- Clavier : flèches pour un groupe radio ------------------------ */
export function clavier(groupe) {
  const touches = () => [...groupe.querySelectorAll('[role="radio"]')];
  const choisir = (b) => { touches().forEach((x) => { x.setAttribute('aria-checked', String(x === b)); x.tabIndex = x === b ? 0 : -1; }); };
  touches().forEach((b) => { b.tabIndex = b.getAttribute('aria-checked') === 'true' ? 0 : -1; b.addEventListener('click', () => choisir(b)); });
  groupe.addEventListener('keydown', (e) => {
    const t = touches(), i = t.indexOf(document.activeElement); if (i < 0) return;
    const n = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!n) return;
    e.preventDefault(); const b = t[(i + n + t.length) % t.length]; choisir(b); b.focus(); b.click();
  });
}

/* ---------- Afficheur SIEL : matrice de LED ------------------------------- */
const LIGNE = 9;                       // hauteur d'une ligne de texte, en LED
const PAS = 3.4;                       // distance entre deux LED, en px CSS
const cacheBits = new Map();
function bitsTexte(texte, graisse) {
  const cle = texte + graisse; if (cacheBits.has(cle)) return cacheBits.get(cle);
  const s = 4, em = LIGNE * s * 1.12, police = `${graisse} ${em}px "Asap Condensed", "Arial Narrow", sans-serif`;
  const mesure = document.createElement('canvas').getContext('2d'); mesure.font = police;
  if ('letterSpacing' in mesure) mesure.letterSpacing = s * 0.7 + 'px';
  const w = Math.ceil(mesure.measureText(texte).width) + s;
  const c = document.createElement('canvas'); c.width = w; c.height = LIGNE * s;
  const x = c.getContext('2d'); x.font = police; if ('letterSpacing' in x) x.letterSpacing = s * 0.7 + 'px';
  x.fillStyle = '#fff'; x.fillText(texte, 0, LIGNE * s - s * 0.55);
  const data = x.getImageData(0, 0, w, LIGNE * s).data, cols = Math.ceil(w / s), bits = [];
  for (let i = 0; i < LIGNE; i++) {
    const rang = [];
    for (let j = 0; j < cols; j++) {
      let somme = 0;
      for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) { const px = j * s + xx; if (px < w) somme += data[((i * s + yy) * w + px) * 4 + 3]; }
      rang.push(somme / (s * s) > 0.4 * 255);
    }
    bits.push(rang);
  }
  const res = { cols, bits }; cacheBits.set(cle, res); return res;
}
export class Siel {
  /**
   * @param {HTMLCanvasElement} canvas  canvas.pl-siel-matrice, dans une .pl-siel-vitre
   * @param {{lignes: {destination: string, minutes: number}[], onSuivre?: (index: number) => void}} options
   *        minutes <= 0 : « 00 » clignotant (train à l'approche). onSuivre active le mode Passionné.
   */
  constructor(canvas, { lignes = [], onSuivre } = {}) {
    this.cv = canvas; this.lignes = lignes; this.onSuivre = onSuivre; this.eteint = []; this.grille = null;
    this.rangs = 1 + lignes.length * LIGNE + Math.max(0, lignes.length - 1) * 3 + 1;
    this.ro = new ResizeObserver(() => this.redimensionner()); this.ro.observe(canvas.parentElement);
    document.fonts?.ready.then(() => { cacheBits.clear(); this.redimensionner(); });
    if (onSuivre) this.boutons();
  }
  boutons() {
    const vitre = this.cv.parentElement;
    vitre.querySelectorAll('.pl-siel-ligne').forEach((b) => b.remove());
    this.lignes.forEach((l, n) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'pl-siel-ligne';
      b.style.top = `${4 + (1 + n * (LIGNE + 3)) * PAS - 2}px`; b.style.height = `${LIGNE * PAS + 4}px`;
      b.setAttribute('aria-label', `Suivre la rame vers ${l.destination}`);
      b.addEventListener('click', () => this.onSuivre(n));
      vitre.appendChild(b);
    });
  }
  redimensionner() {
    const w = this.cv.parentElement.clientWidth - 12, dpr = devicePixelRatio || 1;
    this.cols = Math.max(40, Math.floor(w / PAS)); this.dpr = dpr;
    this.cv.width = Math.round(this.cols * PAS * dpr); this.cv.height = Math.round(this.rangs * PAS * dpr);
    this.cv.style.width = this.cols * PAS + 'px'; this.cv.style.height = this.rangs * PAS + 'px';
    this.grille = this.composer(); this.dessiner(this.grille, this.grille, this.cols); this.etiqueter();
  }
  composer() {
    const g = Array.from({ length: this.rangs }, () => new Uint8Array(this.cols));
    this.lignes.forEach((l, n) => {
      const haut = 1 + n * (LIGNE + 3);
      const mb = bitsTexte(l.minutes <= 0 ? '00' : String(l.minutes), 700), db = bitsTexte(l.destination, 600);
      const debutMin = this.cols - 2 - mb.cols, maxDest = debutMin - 4;
      for (let i = 0; i < LIGNE; i++) {
        for (let j = 0; j < db.cols && 2 + j < maxDest; j++) if (db.bits[i][j]) g[haut + i][2 + j] = 1;
        if (!this.eteint[n]) for (let j = 0; j < mb.cols; j++) if (mb.bits[i][j]) g[haut + i][debutMin + j] = 1;
      }
    });
    return g;
  }
  dessiner(ancien, nouveau, revele) {
    const x = this.cv.getContext('2d'), p = PAS * this.dpr, r = p * 0.36;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.cv.width, this.cv.height);
    x.fillStyle = 'rgba(255,140,20,0.075)';                                   // LED éteintes, visibles
    for (let i = 0; i < this.rangs; i++) for (let j = 0; j < this.cols; j++) { x.beginPath(); x.arc(j * p + p / 2, i * p + p / 2, r, 0, 7); x.fill(); }
    const allumee = (i, j) => (j < revele ? nouveau : ancien)[i][j];
    x.shadowColor = 'rgba(255,135,0,0.9)'; x.shadowBlur = 5 * this.dpr; x.fillStyle = '#ff9d14';   // LED + halo
    for (let i = 0; i < this.rangs; i++) for (let j = 0; j < this.cols; j++) if (allumee(i, j)) { x.beginPath(); x.arc(j * p + p / 2, i * p + p / 2, r, 0, 7); x.fill(); }
    x.shadowBlur = 0; x.fillStyle = '#ffd9a0';                                // point chaud
    for (let i = 0; i < this.rangs; i++) for (let j = 0; j < this.cols; j++) if (allumee(i, j)) { x.beginPath(); x.arc(j * p + p / 2 - r * 0.15, i * p + p / 2 - r * 0.15, r * 0.45, 0, 7); x.fill(); }
  }
  etiqueter() {
    this.cv.setAttribute('role', 'img');
    this.cv.setAttribute('aria-label', this.lignes.map((l) => `${l.destination} : ${l.minutes <= 0 ? 'à l’approche' : l.minutes + ' min'}`).join(', '));
  }
  /** Met à jour les lignes : rafraîchissement colonne par colonne, et clignotement si minutes <= 0. */
  maj(lignes) {
    const avant = this.lignes; this.lignes = lignes;
    if (!this.grille) return;
    const ancien = this.grille, nouveau = this.composer(); this.grille = nouveau; this.etiqueter();
    if (this.onSuivre && avant.length !== lignes.length) this.boutons();
    lignes.forEach((l, n) => { if (l.minutes <= 0 && !(avant[n]?.minutes <= 0)) this.clignoter(n); });
    if (reduit()) { this.dessiner(nouveau, nouveau, this.cols); return; }
    const t0 = performance.now(), duree = 180;
    const pas = (t) => { const k = Math.min(1, (t - t0) / duree); this.dessiner(ancien, nouveau, Math.ceil(k * this.cols)); if (k < 1) requestAnimationFrame(pas); };
    requestAnimationFrame(pas);
  }
  clignoter(n) {                       // 3 éclats à 2 Hz, sous le seuil WCAG 2.3.1
    if (reduit()) return;
    let k = 0;
    const iv = setInterval(() => {
      this.eteint[n] = !this.eteint[n]; this.grille = this.composer(); this.dessiner(this.grille, this.grille, this.cols);
      if (++k >= 6) { clearInterval(iv); this.eteint[n] = false; }
    }, 260);
  }
  detruire() { this.ro.disconnect(); }
}

/* ---------- Démarrage ----------------------------------------------------- */
export function initialiser(root = document.body) {
  genererFaience();
  return observerLampes(root);
}
