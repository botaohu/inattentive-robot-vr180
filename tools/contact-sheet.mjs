// Renders a clip through the lab at several view directions and saves
// screenshots for visual projection assessment.
// Usage: node tools/contact-sheet.mjs <src-url-or-rel-path> <mode> <layout> <outPrefix>
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const [src, mode = "hequirect", layout = "mono", outPrefix = "shots/clip"] = process.argv.slice(2);
if (!src) throw new Error("usage: node tools/contact-sheet.mjs <src> [mode] [layout] [outPrefix]");
await mkdir(dirname(outPrefix), { recursive: true });

const views = [
  { yaw: 0, pitch: 0, fov: 90, name: "center" },
  { yaw: -60, pitch: 0, fov: 90, name: "left60" },
  { yaw: 60, pitch: 0, fov: 90, name: "right60" },
  { yaw: 0, pitch: 40, fov: 90, name: "up40" },
  { yaw: 0, pitch: -40, fov: 90, name: "down40" },
  { yaw: 85, pitch: 0, fov: 70, name: "right85" },
];

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
const grid = process.env.GRID === "0" ? "" : "&grid=1";
await page.goto(`http://127.0.0.1:8173/lab.html?src=${encodeURIComponent(src)}&mode=${mode}&layout=${layout}${grid}`);
await page.waitForFunction(() => window.__labReady !== undefined);
await page.evaluate(() => window.__labReady);
await page.waitForTimeout(800); // let the video reach a real frame
for (const v of views) {
  await page.evaluate(([y, p, f]) => window.__setView(y, p, f), [v.yaw, v.pitch, v.fov]);
  await page.waitForTimeout(120);
  await page.locator("#view").screenshot({ path: `${outPrefix}-${v.name}.png` });
  console.log(`${outPrefix}-${v.name}.png`);
}
await browser.close();
