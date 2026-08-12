import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:8173",
    viewport: { width: 1280, height: 800 },
    launchOptions: {
      // Software WebGL in headless CI.
      args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
    },
  },
  webServer: {
    command: "npx http-server -p 8173 -c-1 --silent .",
    url: "http://127.0.0.1:8173/lab.html",
    reuseExistingServer: true,
  },
});
