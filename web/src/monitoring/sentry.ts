import * as Sentry from '@sentry/react';

let initialized = false;

/**
 * Initializes Sentry RUM + WebGL context-loss telemetry when VITE_SENTRY_DSN
 * is configured. Safe no-op in local/preview environments without a DSN.
 */
export function initMonitoring(): void {
  if (initialized) return;
  initialized = true;

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 0.2,
  });

  window.addEventListener(
    'webglcontextlost',
    (event) => {
      const target = event.target as HTMLCanvasElement | null;
      Sentry.captureMessage('WebGL context lost', {
        level: 'error',
        tags: { area: 'webgl' },
        extra: {
          canvasId: target?.id || target?.className || 'unknown',
          width: target?.width ?? null,
          height: target?.height ?? null,
          dpr: window.devicePixelRatio || 1,
          userAgent: navigator.userAgent,
        },
      });
    },
    true
  );
}
