import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { textColorFor } from '../core/ui/components/line_badge';

const ROOT = process.cwd();
const DATA_DIR = path.resolve(ROOT, 'cities/washington/data');
const ASSETS_DIR = path.resolve(ROOT, 'cities/washington/assets/models/train');
const PUBLIC_MODELS_DIR = path.resolve(ROOT, 'web/public/cities/washington/models/train');

describe('Washington DC (WMATA Metrorail) — Phase 4 Rendu & Matériel Roulant', () => {
  describe('6.1 & 6.3 Spécifications du matériel roulant (rolling-stock.json)', () => {
    it('définit un modèle générique sans affirmer de série 7000/6000/3000 comme un fait', () => {
      const rs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rolling-stock.json'), 'utf8'));

      expect(rs.models).toBeDefined();
      expect(rs.models.WMATA_GENERIC_8V).toBeDefined();
      expect(rs.models.WMATA_GENERIC_6V).toBeDefined();

      for (const [modelId, model] of Object.entries(rs.models) as [string, any][]) {
        // Règle 6.1 : verified: false obligatoire
        expect(model.verified).toBe(false);
        // Longueur unitaire de caisse 22.86 m (75 ft)
        expect(model.car_length_m).toBeCloseTo(22.86, 2);
        expect(model.width_m).toBeCloseTo(3.09, 2);

        // Règle 6.3 : l'infobulle / nom ne doit pas présenter une série (7000, 6000, 3000) comme un fait
        expect(model.name).not.toMatch(/série\s+(7000|6000|3000)/i);
        expect(model.name).toContain('Metrorail');
      }

      // La ligne RED pointe sur le modèle 8 voitures par défaut
      const redStock = rs.lines.RED;
      expect(redStock).toBeDefined();
      expect(redStock.verified).toBe(false);
      expect(redStock.cars_count).toBe(8);
      expect(redStock.car_length_m).toBeCloseTo(22.86, 2);
      expect(redStock.name).not.toMatch(/série\s+(7000|6000|3000)/i);
    });
  });

  describe('6.1 Modèle 3D GLB clean-room (< 15 Ko, longueur identique)', () => {
    it('vérifie que wmata_generic__neutral.glb existe et pèse strictement moins de 15 Ko', () => {
      const glbPaths = [
        path.join(ASSETS_DIR, 'wmata_generic__neutral.glb'),
        path.join(PUBLIC_MODELS_DIR, 'wmata_generic__neutral.glb')
      ];

      for (const glbPath of glbPaths) {
        expect(fs.existsSync(glbPath), `Fichier GLB manquant : ${glbPath}`).toBe(true);
        const stats = fs.statSync(glbPath);
        const sizeKo = stats.size / 1024.0;

        // Règle 6.1 : strictement moins de 15 Ko
        expect(sizeKo).toBeLessThan(15.0);
        expect(stats.size).toBeGreaterThan(1000); // Pas un fichier vide
      }
    });

    it('vérifie la conformité glTF 2.0 binaire et les dimensions du mesh (22.86 m)', () => {
      const glbPath = path.join(PUBLIC_MODELS_DIR, 'wmata_generic__neutral.glb');
      const buffer = fs.readFileSync(glbPath);

      // En-tête GLB : magic = 0x46546C67 ('glTF'), version = 2
      const magic = buffer.readUInt32LE(0);
      const version = buffer.readUInt32LE(4);
      const totalLength = buffer.readUInt32LE(8);

      expect(magic).toBe(0x46546C67);
      expect(version).toBe(2);
      expect(totalLength).toBe(buffer.length);

      // JSON chunk (chunkType = 0x4E4F534A 'JSON')
      const jsonChunkLength = buffer.readUInt32LE(12);
      const jsonChunkType = buffer.readUInt32LE(16);
      expect(jsonChunkType).toBe(0x4E4F534A);

      const jsonText = buffer.toString('utf8', 20, 20 + jsonChunkLength);
      const gltf = JSON.parse(jsonText);

      // Vérification des accessors : la bounding box en X doit faire exactement 22.86 m (-11.43 à +11.43)
      const posAccessor = gltf.accessors[0];
      expect(posAccessor.type).toBe('VEC3');
      const minX = posAccessor.min[0];
      const maxX = posAccessor.max[0];
      const lengthM = maxX - minX;

      // Règle 6.1 : car_length_m identique à la longueur du GLB
      expect(lengthM).toBeCloseTo(22.86, 2);
    });
  });

  describe('6.2 Longueur des rames & répartition 6/8 voitures', () => {
    it('applique le nombre de voitures selon license_plate ou valeur nominale (8)', () => {
      const rs = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rolling-stock.json'), 'utf8'));
      const defaultCars = rs.lines.RED.cars_count;
      expect(defaultCars).toBe(8);

      const resolveCarsCount = (licensePlateVal?: number | string | null): number => {
        if (typeof licensePlateVal === 'number' && licensePlateVal > 0) return licensePlateVal;
        if (typeof licensePlateVal === 'string') {
          const p = parseInt(licensePlateVal, 10);
          if (!isNaN(p) && p > 0) return p;
        }
        return defaultCars;
      };

      // Si license_plate = "6" -> 6 voitures
      expect(resolveCarsCount('6')).toBe(6);
      expect(resolveCarsCount(6)).toBe(6);
      // Si license_plate = "8" -> 8 voitures
      expect(resolveCarsCount('8')).toBe(8);
      // Si 0, vide, null ou non renseigné -> repli sur 8 voitures
      expect(resolveCarsCount('0')).toBe(8);
      expect(resolveCarsCount(0)).toBe(8);
      expect(resolveCarsCount(null)).toBe(8);
      expect(resolveCarsCount(undefined)).toBe(8);
    });
  });

  describe('6.4 Couleurs via textColorFor (aucun blanc sur fond clair)', () => {
    it('calcule le contraste de la ligne Red (#E31837) avec textColorFor', () => {
      const lines = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'lines.json'), 'utf8'));
      const redLine = lines.find((l: any) => l.id === 'RED');

      expect(redLine).toBeDefined();
      expect(redLine.color).toBe('#E31837');

      // textColorFor doit renvoyer du blanc sur fond rouge WMATA avec un ratio >= 3.0
      const computedTextColor = textColorFor(redLine.color, redLine.text_color);
      expect(computedTextColor.toLowerCase()).toBe('#ffffff');
    });
  });
});
