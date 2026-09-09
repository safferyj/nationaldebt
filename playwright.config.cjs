const { defineConfig, devices } = require("@playwright/test");

const requestedProfiles = process.env.PLAYWRIGHT_PROFILES
  ? new Set(process.env.PLAYWRIGHT_PROFILES.split(",").map((name) => name.trim()).filter(Boolean))
  : null;

const mobileProfiles = Object.entries(devices)
  .filter(([name, device]) => device.isMobile && (!requestedProfiles || requestedProfiles.has(name)));

if (requestedProfiles && mobileProfiles.length === 0) {
  throw new Error("PLAYWRIGHT_PROFILES did not match any mobile device descriptor.");
}

const projects = mobileProfiles.map(([name, device]) => {
  const browserName = /^(iPhone|iPad)/.test(name) ? "webkit" : "chromium";
  return {
    name: `${browserName}:${name}`,
    use: {
      ...device,
      browserName,
    },
  };
});

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.js/,
  timeout: 45_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS || (process.env.CI ? 2 : 4)),
  reporter: process.env.CI ? "line" : "list",
  outputDir: "test-results",
  use: {
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects,
});
