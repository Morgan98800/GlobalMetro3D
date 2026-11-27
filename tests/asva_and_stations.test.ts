import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { AsvaAnnouncer, formatAsvaText } from '../web/src/ride/asva_announcer';
import {
  addArchetypeDecorations,
  createArchetypeMaterials,
  resolveStationArchetype,
} from '../web/src/ride/station_architectures';

describe('resolveStationArchetype', () => {
  it('maps iconic themed Paris stations to their specialized archetypes', () => {
    expect(resolveStationArchetype('Arts et Métiers', '11')).toBe('arts_et_metiers');
    expect(resolveStationArchetype('Arts et Métiers', '3')).toBe('arts_et_metiers');
    expect(resolveStationArchetype('Louvre – Rivoli', '1')).toBe('louvre_rivoli');
    expect(resolveStationArchetype('Concorde', '8')).toBe('louvre_rivoli');
    expect(resolveStationArchetype('Assemblée Nationale', '12')).toBe('louvre_rivoli');
    expect(resolveStationArchetype('Cité', '4')).toBe('cite');
    expect(resolveStationArchetype('Abbesses', '12')).toBe('mural');
    expect(resolveStationArchetype('Liège', '13')).toBe('mural');
    expect(resolveStationArchetype('Châtelet', '1')).toBe('cathedral');
    expect(resolveStationArchetype('Nation', '2')).toBe('cathedral');
    expect(resolveStationArchetype('Bastille', '5')).toBe('cathedral');
    expect(resolveStationArchetype('Auber', 'A')).toBe('cathedral');
    expect(resolveStationArchetype('Passy', '6')).toBe('faience');
  });

  it('builds materials and archetype decorations safely without DOM canvas', () => {
    const mats = createArchetypeMaterials((m) => m);
    const geos: THREE.BufferGeometry[] = [];
    for (const [arch, name] of [
      ['arts_et_metiers', 'Arts et Métiers'],
      ['louvre_rivoli', 'Louvre – Rivoli'],
      ['cite', 'Cité'],
      ['mural', 'Abbesses'],
      ['mural', 'Liège'],
    ] as const) {
      const grp = new THREE.Group();
      addArchetypeDecorations(grp, arch, mats, geos, name);
      expect(grp.children.length).toBeGreaterThan(0);
    }
    expect(geos.length).toBeGreaterThan(0);
    geos.forEach((g) => g.dispose());
  });
});

describe('formatAsvaText', () => {
  it('formats approach and arrival announcements with optional terminus suffix', () => {
    expect(formatAsvaText('Bastille', 'approach')).toBe('Prochaine station : Bastille.');
    expect(formatAsvaText('Nation', 'approach', true)).toBe(
      'Prochaine station : Nation, terminus.'
    );
    expect(formatAsvaText('Bastille', 'arrival')).toBe('Bastille.');
    expect(formatAsvaText('Nation', 'arrival', true)).toBe('Nation, terminus.');
  });
});

describe('AsvaAnnouncer', () => {
  it('does not throw when speechSynthesis is absent and deduplicates consecutive calls', () => {
    const announcer = new AsvaAnnouncer();
    const onChime = vi.fn();

    expect(() => {
      announcer.announceApproach('Châtelet', { isTerminus: false, onChime });
      announcer.announceApproach('Châtelet', { isTerminus: false, onChime });
      announcer.announceArrival('Châtelet', { isTerminus: false });
      announcer.cancel();
      announcer.reset();
      announcer.announceApproach('Châtelet', { isTerminus: true, onChime });
      announcer.dispose();
    }).not.toThrow();

    expect(onChime).toHaveBeenCalledTimes(2);
  });
});
