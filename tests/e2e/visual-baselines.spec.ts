import { test, expect, Page } from '@playwright/test';

// Helper to ensure deterministic render state
async function preparePage(page: Page) {
  // 1. Mock Date to fixed epoch: Thursday Oct 15 2026 08:30:00 UTC (peak morning weekday)
  await page.addInitScript(() => {
    const FIXED_TIME = 1792053000000;
    const RealDate = Date;
    class MockDate extends RealDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super(FIXED_TIME);
        } else {
          super(...(args as [any]));
        }
      }
      static now() {
        return FIXED_TIME;
      }
    }
    window.Date = MockDate as any;
  });

  // 2. Mock realtime endpoints with empty valid payload so simulations use static schedules deterministically
  await page.route('**/api/*-rt', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ active: false, timestamp: 1792053000, trains: [], alerts: [] }),
    });
  });

  await page.route('**/api/prim-delays', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({}),
    });
  });
}

async function waitForSimulationReady(page: Page) {
  // 1. Wait for the initial application loader to finish
  await page.waitForSelector('#app-loader.is-hidden', { timeout: 25000 });

  // 2. Wait for MapLibre map idle and camera movement to settle
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const map = (window as any).__map || (window as any).map;
      if (!map) {
        resolve();
        return;
      }
      const checkStable = () => {
        if (!map.isMoving() && map.loaded()) {
          resolve();
        } else {
          map.once('idle', checkStable);
        }
      };
      if (!map.isMoving() && map.loaded()) {
        resolve();
      } else {
        map.once('idle', checkStable);
      }
    });
  });

  // 3. Freeze any remaining animation loops or intervals
  await page.evaluate(() => {
    const engine = (window as any).__engine;
    if (engine?.timerId) {
      clearInterval(engine.timerId);
      engine.timerId = null;
    }
    window.requestAnimationFrame = () => 0;
  });

  await page.waitForTimeout(400);
}

test.describe('Visual Baselines across all Cities', () => {
  test.beforeEach(async ({ page }) => {
    await preparePage(page);
  });

  test('paris - default network view', async ({ page }) => {
    await page.goto('/paris?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('paris-default.png');
  });

  test('paris - line 1 selected', async ({ page }) => {
    await page.goto('/paris/ligne/1?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('paris-line-1.png');
  });

  test('paris - 3d facades view', async ({ page }) => {
    await page.goto('/paris?facades=1&clockTest=08:30');
    await waitForSimulationReady(page);
    // Pitch the camera for 3D extrusion perspective
    await page.evaluate(() => {
      const map = (window as any).__map || (window as any).map;
      if (map) {
        map.setZoom(15.5);
        map.setPitch(60);
      }
    });
    await page.waitForTimeout(600);
    await expect(page).toHaveScreenshot('paris-3d-facades.png');
  });

  test('montreal - default network view', async ({ page }) => {
    await page.goto('/montreal?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('montreal-default.png');
  });

  test('montreal - green line (1) selected', async ({ page }) => {
    await page.goto('/montreal/ligne/1?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('montreal-line-1.png');
  });

  test('london - default network view', async ({ page }) => {
    await page.goto('/london?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('london-default.png');
  });

  test('london - central line selected', async ({ page }) => {
    await page.goto('/london/ligne/Central?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('london-line-central.png');
  });

  test('lille - default network view', async ({ page }) => {
    await page.goto('/lille?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('lille-default.png');
  });

  test('lille - line 1 selected', async ({ page }) => {
    await page.goto('/lille/ligne/1?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('lille-line-1.png');
  });

  test('washington - default network view', async ({ page }) => {
    await page.goto('/washington?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('washington-default.png');
  });

  test('washington - red line selected', async ({ page }) => {
    await page.goto('/washington/ligne/RED?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('washington-line-red.png');
  });

  test('berlin - default network view', async ({ page }) => {
    await page.goto('/berlin?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('berlin-default.png');
  });

  test('berlin - U1 selected', async ({ page }) => {
    await page.goto('/berlin/ligne/U1?clockTest=08:30');
    await waitForSimulationReady(page);
    await expect(page).toHaveScreenshot('berlin-line-u1.png');
  });

  test('edinburgh - 3d relief view', async ({ page }) => {
    await page.goto('/edinburgh?clockTest=08:30');
    await waitForSimulationReady(page);
    await page.waitForTimeout(2000);
    await page.evaluate(() => {
      window.requestAnimationFrame = () => 0;
    });
    await expect(page).toHaveScreenshot('edinburgh-default.png');
  });
});
