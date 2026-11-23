import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { dbToGain } from '../web/src/ride/metro_audio_engine';
import { getAdaptiveFrameIntervalMs } from '@core/ui/map/device_perf';
import { createLandmarksLayers, PARIS_LANDMARKS_GLTF } from '@core/ui/map/landmarks_layer';

describe('Real Paris Metro audio assets & dB mixer helpers', () => {
  it('ships all 7 real transcoded .m4a Paris Metro audio stems under web/public/audio/metro', () => {
    const audioDir = path.resolve(process.cwd(), 'web/public/audio/metro');
    const expected = [
      'pneu_roll_loop.m4a',
      'pneu_depart.m4a',
      'fer_roll_loop.m4a',
      'train_arrive.m4a',
      'station_ambience_loop.m4a',
      'tunnel_ambience_loop.m4a',
      'door_buzzer.m4a',
    ];
    for (const file of expected) {
      const fullPath = path.join(audioDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(10_000);
    }
  });

  it('maps decibels to perceptual linear gain with silent floor', () => {
    expect(dbToGain(0)).toBeCloseTo(1, 5);
    expect(dbToGain(-6)).toBeCloseTo(0.5012, 3);
    expect(dbToGain(-20)).toBeCloseTo(0.1, 4);
    expect(dbToGain(-72)).toBe(0);
    expect(dbToGain(-90)).toBe(0);
  });
});

describe('iPhone & Mac adaptive FPS battery budget', () => {
  it('throttles overview zoom to 10 FPS and caps ProMotion mobile to 30 FPS', () => {
    expect(getAdaptiveFrameIntervalMs({ zoom: 12, isFollowing: false, isMobile: false })).toBe(100);
    expect(getAdaptiveFrameIntervalMs({ zoom: 12, isFollowing: false, isMobile: true })).toBe(100);
    expect(getAdaptiveFrameIntervalMs({ zoom: 14.5, isFollowing: false, isMobile: true })).toBe(42);
    expect(getAdaptiveFrameIntervalMs({ zoom: 16, isFollowing: false, isMobile: true })).toBe(33);
    expect(getAdaptiveFrameIntervalMs({ zoom: 16, isFollowing: true, isMobile: false })).toBe(16.5);
    expect(getAdaptiveFrameIntervalMs({ zoom: 16, isFollowing: true, isMobile: true })).toBe(33);
    expect(getAdaptiveFrameIntervalMs({ zoom: 16, isFollowing: false, reduceMotion: true })).toBe(1000);
  });
});

describe('Paris 3D architectural landmarks GLB layer', () => {
  it('ships Paris landmark GLB models (including CC0 Eiffel Tower) and culls them by zoom, pitch, and viewport radius', () => {
    const landmarksDir = path.resolve(process.cwd(), 'web/public/models/landmarks');
    expect(PARIS_LANDMARKS_GLTF).toHaveLength(10);
    for (const lm of PARIS_LANDMARKS_GLTF) {
      const file = path.basename(lm.modelUrl);
      const fullPath = path.join(landmarksDir, file);
      expect(fs.existsSync(fullPath)).toBe(true);
      expect(fs.statSync(fullPath).size).toBeGreaterThan(4_000);
    }

    // Hidden when flat 2D or zoomed out or buildings toggled off
    expect(
      createLandmarksLayers({ zoom: 11, pitch: 40, mapCenter: [2.2945, 48.8584], visible: true })
    ).toHaveLength(0);
    expect(
      createLandmarksLayers({ zoom: 15, pitch: 0, mapCenter: [2.2945, 48.8584], visible: true })
    ).toHaveLength(0);
    expect(
      createLandmarksLayers({ zoom: 15, pitch: 45, mapCenter: [2.2945, 48.8584], visible: false })
    ).toHaveLength(0);

    // Visible near Eiffel Tower when tilted 3D
    const nearEiffel = createLandmarksLayers({
      zoom: 15.5,
      pitch: 45,
      mapCenter: [2.2945, 48.8584],
      visible: true,
      cityId: 'paris',
    });
    expect(nearEiffel.some((l) => l.id === 'landmark-tour_eiffel')).toBe(true);
  });
});
