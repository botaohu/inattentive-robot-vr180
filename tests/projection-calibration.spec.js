// Validates the VR180 projection pipeline end-to-end through the real
// three.js render path, using a synthetic half-equirect calibration pattern:
// a probe camera looks at known (yaw, pitch) directions and must see the
// reference patch colors painted at those angular positions.
import { test, expect } from "@playwright/test";

const close = (got, want, tol = 40) =>
  Math.abs(got[0] - want[0]) <= tol && Math.abs(got[1] - want[1]) <= tol && Math.abs(got[2] - want[2]) <= tol;

async function openLab(page, params) {
  await page.goto(`/lab.html?${params}`);
  await page.waitForFunction(() => window.__labReady !== undefined);
  await page.evaluate(() => window.__labReady);
}

test("mono half-equirect maps angles to the correct scene directions", async ({ page }) => {
  await openLab(page, "src=synthetic&layout=mono");
  const patches = await page.evaluate(() => window.__patches.patches);
  for (const p of patches) {
    const got = await page.evaluate(([y, pi]) => window.__probe(y, pi), [p.yaw, p.pitch]);
    expect(close(got, p.color), `${p.name}: saw ${got}, wanted ${p.color}`).toBe(true);
  }
});

test("grid lines land on 15° boundaries (dark background between them)", async ({ page }) => {
  await openLab(page, "src=synthetic&layout=mono");
  // Between grid lines at (7.5°, 7.5°) the pattern is the dark background.
  const bg = await page.evaluate(() => window.__probe(7.5, 7.5));
  expect(bg[0]).toBeLessThan(60);
  expect(bg[1]).toBeLessThan(60);
  expect(bg[2]).toBeLessThan(60);
});

test("SBS stereo routes each eye to its own half-frame", async ({ page }) => {
  await openLab(page, "src=synthetic-sbs&layout=sbs");
  const { patches, eyePatch } = await page.evaluate(() => window.__patches);
  // Shared patches must appear identically in both eyes.
  for (const eye of ["left", "right"]) {
    await page.evaluate((e) => window.__setProbeEye(e), eye);
    for (const p of patches.slice(0, 3)) {
      const got = await page.evaluate(([y, pi]) => window.__probe(y, pi), [p.yaw, p.pitch]);
      expect(close(got, p.color), `${eye}/${p.name}: saw ${got}, wanted ${p.color}`).toBe(true);
    }
    // Eye-identity patch must differ per eye.
    const id = await page.evaluate(([y, pi]) => window.__probe(y, pi), [eyePatch.yaw, eyePatch.pitch]);
    expect(close(id, eyePatch[eye]), `${eye}/eye-id: saw ${id}, wanted ${eyePatch[eye]}`).toBe(true);
  }
});

test("flat mode places footage in the central window only", async ({ page }) => {
  // Synthetic pattern interpreted as a flat 100° clip: at ±85° yaw there is no
  // footage (black), while the center shows the pattern (white patch).
  await openLab(page, "src=synthetic&layout=mono&mode=flat:100");
  const center = await page.evaluate(() => window.__probe(0, 0));
  expect(center[0]).toBeGreaterThan(150);
  const edge = await page.evaluate(() => window.__probe(85, 0));
  expect(edge[0] + edge[1] + edge[2]).toBeLessThan(30);
});
