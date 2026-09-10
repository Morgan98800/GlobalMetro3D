/**
 * fps_probe.ts — Métrologie précise du framerate avec décompte réel des rames.
 */

export interface FpsProbeOptions {
  getTrainCount: () => number;
  sampleDurationMs?: number;
}

export interface FpsReport {
  valid: boolean;
  totalFrames: number;
  durationMs: number;
  avgFps: number;
  p5Fps: number;
  p50Fps: number;
  p95Fps: number;
  minFps: number;
  maxFps: number;
  trainCountMedian: number;
}

export function installFpsProbe(options: FpsProbeOptions) {
  const { getTrainCount, sampleDurationMs = 5000 } = options;

  (window as any).__runFpsBenchmark = function (durationMs = sampleDurationMs): Promise<FpsReport> {
    return new Promise((resolve) => {
      const frameDeltas: number[] = [];
      const trainCounts: number[] = [];
      let lastTime = performance.now();
      const startTime = lastTime;

      function onFrame(now: number) {
        const dt = now - lastTime;
        lastTime = now;
        if (dt > 0) {
          frameDeltas.push(dt);
          trainCounts.push(getTrainCount());
        }

        if (now - startTime < durationMs) {
          requestAnimationFrame(onFrame);
        } else {
          const fpsValues = frameDeltas.map(d => Math.min(120, 1000 / d)).sort((a, b) => a - b);
          trainCounts.sort((a, b) => a - b);

          const n = fpsValues.length;
          const p5 = fpsValues[Math.floor(n * 0.05)] || 0;
          const p50 = fpsValues[Math.floor(n * 0.50)] || 0;
          const p95 = fpsValues[Math.floor(n * 0.95)] || 0;
          const avg = fpsValues.reduce((a, b) => a + b, 0) / (n || 1);
          const medianTrains = trainCounts[Math.floor(trainCounts.length * 0.5)] || 0;

          const report: FpsReport = {
            valid: n > 10 && medianTrains > 0,
            totalFrames: n,
            durationMs: now - startTime,
            avgFps: Number(avg.toFixed(1)),
            p5Fps: Number(p5.toFixed(1)),
            p50Fps: Number(p50.toFixed(1)),
            p95Fps: Number(p95.toFixed(1)),
            minFps: Number((fpsValues[0] || 0).toFixed(1)),
            maxFps: Number((fpsValues[n - 1] || 0).toFixed(1)),
            trainCountMedian: medianTrains
          };
          resolve(report);
        }
      }

      requestAnimationFrame(onFrame);
    });
  };
}
