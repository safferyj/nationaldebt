const { test, expect } = require("@playwright/test");
const {
  captureBrowserErrors,
  loadApp,
  snapshot,
} = require("./helpers");

test("renders cleanly on the mobile profile", async ({ page }) => {
  const browserErrors = captureBrowserErrors(page);
  await loadApp(page);

  const state = await snapshot(page);
  expect(state.measureCount).toBe(10);
  if (state.landscapeWarning) {
    expect(state.portraitMobile).toBe(false);
    expect(state.landscapeWarningText).toContain("Please turn your device upright");
    expect(state.landscapeWarningText).toContain("more vertical space");
    expect(state.chart?.width).toBe(0);
    expect(state.chart?.height).toBe(0);
    expect(state.horizontalOverflow).toBe(false);
    expect(browserErrors).toEqual([]);
    return;
  }

  expect(state.chart?.width).toBeGreaterThan(0);
  expect(state.chart?.height).toBeGreaterThan(0);
  expect(state.axisLabel?.height).toBeGreaterThan(0);
  expect(state.horizontalOverflow).toBe(false);

  if (state.portraitMobile) {
    expect(state.kiosk).toBe(true);
    expect(state.bodyKiosk).toBe(true);
    expect(state.fullscreenText).toBe("Exit full screen");
  } else {
    expect(state.kiosk).toBe(false);
    expect(state.bodyKiosk).toBe(false);
  }

  expect(browserErrors).toEqual([]);
});
