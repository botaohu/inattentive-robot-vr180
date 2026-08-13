// E2E: gallery, VR180 viewer, and survey (demo mode).
import { test, expect } from "@playwright/test";

test.use({ launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] } });

test("gallery lists all six scenarios with posters and links", async ({ page }) => {
  await page.goto("/index.html");
  const cards = page.locator(".card");
  await expect(cards).toHaveCount(7);
  for (const n of ["01", "02", "03", "04", "05", "06", "07"]) {
    await expect(page.locator(`.card .n:text("SCENARIO ${n}")`)).toBeVisible();
  }
  const hrefs = await cards.evaluateAll((els) => els.map((e) => e.getAttribute("href")));
  expect(new Set(hrefs).size).toBe(7);
});

test("viewer loads a scenario video and plays it on the dome", async ({ page }) => {
  await page.goto("/watch.html?s=s2-task-vs-emergency");
  await page.waitForFunction(() => window.__viewerReady !== undefined);
  await page.evaluate(() => window.__viewerReady);
  const meta = await page.evaluate(() => ({
    id: window.__viewer.scenario.id,
    w: window.__viewer.video.videoWidth,
    h: window.__viewer.video.videoHeight,
  }));
  expect(meta.id).toBe("s2-task-vs-emergency");
  expect(meta.w).toBeGreaterThan(0);
  // 1:1 half-equirect frames, or 2:1 when color+depth are packed side by side.
  expect([meta.w, meta.w / 2]).toContain(meta.h);
  await page.click("#start");
  await page.waitForTimeout(700);
  const playing = await page.evaluate(() => !window.__viewer.video.paused && window.__viewer.video.currentTime > 0);
  expect(playing).toBe(true);
  // The dome must actually be rendering non-black pixels.
  const lum = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    g.drawImage(document.getElementById("view"), 0, 0, 32, 32);
    const d = g.getImageData(0, 0, 32, 32).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
    return sum / (32 * 32 * 3);
  });
  expect(lum).toBeGreaterThan(8);
});

test("viewer falls back gracefully when WebXR is unavailable", async ({ page }) => {
  await page.goto("/watch.html?s=s1-convenience-vs-urgency");
  await page.waitForFunction(() => window.__viewerReady !== undefined);
  const label = await page.locator("#entervr").textContent();
  expect(["Enter VR", "VR not available"]).toContain(label.trim());
});

test("survey demo mode: sign in, submit, and see own response", async ({ page }) => {
  await page.goto("/survey/index.html?s=s3-authority-vs-distress");
  await expect(page.locator("#modeBadge")).toContainText("demo");
  await page.click("#signin");
  await expect(page.locator("#form")).toBeVisible();
  await expect(page.locator("#scenario")).toHaveValue("s3-authority-vs-distress");
  await page.fill("#action", "Pause folding, kneel to the child's eye level, and explain to the father.");
  await page.fill("#why", "Distress signals outrank tidiness.");
  await page.click("#submit");
  await expect(page.locator("#status")).toContainText("Saved");
  await expect(page.locator("#mine .resp")).toHaveCount(1);
  await expect(page.locator("#mine .resp p").first()).toContainText("kneel to the child");
  // Responses persist across reload while signed in.
  await page.reload();
  await expect(page.locator("#mine .resp")).toHaveCount(1);
});

test("survey requires sign-in before writing", async ({ page }) => {
  await page.goto("/survey/index.html");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator("#form")).toBeHidden();
  await expect(page.locator("#signin")).toBeVisible();
});
