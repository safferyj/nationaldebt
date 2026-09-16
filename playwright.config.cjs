const { defineConfig, devices } = require("@playwright/test");

const testTarget = process.env.PLAYWRIGHT_TARGET || "all";
if (!["all", "mobile", "desktop"].includes(testTarget)) {
  throw new Error(`PLAYWRIGHT_TARGET must be all, mobile, or desktop; received "${testTarget}".`);
}

const requestedMobileProfiles = process.env.PLAYWRIGHT_PROFILES
  ? new Set(process.env.PLAYWRIGHT_PROFILES.split(",").map((name) => name.trim()).filter(Boolean))
  : null;

const mobileProfiles = Object.entries(devices)
  .filter(([name, device]) => device.isMobile && (
    !requestedMobileProfiles || requestedMobileProfiles.has(name)
  ));

if (requestedMobileProfiles && mobileProfiles.length === 0) {
  throw new Error("PLAYWRIGHT_PROFILES did not match any mobile device descriptor.");
}

const requestedDesktopProfiles = process.env.PLAYWRIGHT_DESKTOP_PROFILES
  ? new Set(process.env.PLAYWRIGHT_DESKTOP_PROFILES.split(",").map((name) => name.trim()).filter(Boolean))
  : null;
const desktopProfileNames = [
  "Desktop Chrome",
  "Desktop Chrome HiDPI",
  "Desktop Edge",
  "Desktop Safari",
];
const desktopProfiles = desktopProfileNames
  .filter((name) => devices[name])
  .filter((name) => !requestedDesktopProfiles || requestedDesktopProfiles.has(name))
  .map((name) => [name, devices[name]]);

if (requestedDesktopProfiles && desktopProfiles.length === 0) {
  throw new Error("PLAYWRIGHT_DESKTOP_PROFILES did not match any desktop device descriptor.");
}

const mobileProjects = mobileProfiles.map(([name, device]) => {
  const browserName = /^(iPhone|iPad)/.test(name) ? "webkit" : "chromium";
  return {
    name: `${browserName}:${name}`,
    testMatch: /mobile\..*\.spec\.js/,
    use: {
      ...device,
      browserName,
    },
  };
});

const desktopProjects = desktopProfiles.map(([name, device]) => {
  const browserName = device.defaultBrowserType || "chromium";
  return {
    name: `${browserName}:${name}`,
    testMatch: /desktop\..*\.spec\.js/,
    use: {
      ...device,
      browserName,
    },
  };
});

const projects = [
  ...(testTarget === "desktop" ? [] : mobileProjects),
  ...(testTarget === "mobile" ? [] : desktopProjects),
];

module.exports = defineConfig({
  testDir: "./tests",
  testMatch: /.*\.spec\.js/,
  timeout: 45_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  workers: Number(process.env.PW_WORKERS || (process.env.CI ? 2 : 6)),
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
