const { test, expect } = require("@playwright/test");
const {
  axisGeometry,
  captureBrowserErrors,
  chartPlotGeometry,
  chartYearEndpoints,
  chartYearPositions,
  finishMouseDrag,
  loadApp,
  mouseDrag,
  rangesOverlap,
  snappedSelection,
  snapshot,
} = require("./desktop.helpers");

test.setTimeout(60_000);

async function clickMany(page, selector, count) {
  await page.evaluate(({ selector: targetSelector, count: clickCount }) => {
    const button = document.querySelector(targetSelector);
    if (!button) throw new Error(`Missing ${targetSelector}`);
    for (let index = 0; index < clickCount; index += 1) button.click();
  }, { selector, count });
  await page.waitForTimeout(50);
}

async function holdMouse(page, selector, duration) {
  const button = page.locator(selector);
  await button.scrollIntoViewIfNeeded();
  const box = await button.boundingBox();
  if (!box) throw new Error(`No bounding box for ${selector}`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(duration);
  const during = await snapshot(page);
  await page.mouse.up();
  await page.waitForTimeout(80);
  return { during, released: await snapshot(page) };
}

async function assertNoAxisTickOverlap(page) {
  const axis = (await axisGeometry(page)).rect;
  if (!axis) throw new Error("Missing chart axis title");
  const ticks = await page.locator(".chart-y-tick").evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  }));
  expect(ticks.some((tick) => rangesOverlap(axis, tick))).toBe(false);
}

test("covers desktop controls, keyboard shortcuts, legend movement, and year navigation", async ({ page }, testInfo) => {
  const browserErrors = captureBrowserErrors(page);
  await loadApp(page);

  const initial = await snapshot(page);
  expect(initial.mobile).toBe(false);
  expect(initial.landscapeWarning).toBe(false);
  expect(initial.measureCount).toBe(10);

  await page.locator("#viewDollars").click();
  await page.locator("#measurePerCapita").click();
  await page.locator("#basisReal").click();
  let state = await snapshot(page);
  expect(state.controls.dollarMeasure).toBe(true);
  expect(state.controls.dollarBasis).toBe(true);
  expect((await axisGeometry(page)).fullLabel).toBe("A$ per capita (real, 2024-25 dollars)");
  await assertNoAxisTickOverlap(page);

  await page.locator("#viewPctGdp").click();
  expect(await page.locator("#viewPctGdp").getAttribute("aria-pressed")).toBe("true");

  await clickMany(page, "#nextYear", 100);
  expect((await snapshot(page)).year).toBe("2024-25");
  const held = await holdMouse(page, "#previousYear", 1_200);
  const heldYears = Number("2024") - Number(held.during.year.slice(0, 4));
  expect(heldYears).toBeGreaterThanOrEqual(10);
  expect(Number(held.released.year.slice(0, 4))).toBeLessThanOrEqual(Number(held.during.year.slice(0, 4)) + 2);
  await clickMany(page, "#nextYear", 100);

  await page.keyboard.press("ArrowLeft");
  expect((await snapshot(page)).year).toBe("2023-24");
  await page.keyboard.press("ArrowRight");
  expect((await snapshot(page)).year).toBe("2024-25");

  await page.keyboard.press("5");
  state = await snapshot(page);
  expect(state.controls.dollarMeasure).toBe(true);
  expect(await page.locator("#measurePerCapita").getAttribute("aria-pressed")).toBe("true");
  expect(await page.locator("#basisReal").getAttribute("aria-pressed")).toBe("true");
  await page.keyboard.press("1");
  expect(await page.locator("#viewPctGdp").getAttribute("aria-pressed")).toBe("true");

  const shortcutSelectors = {
    q: 'button[data-series="gross"]',
    w: 'button[data-series="grossChange"]',
    e: 'button[data-series="agsInterest"]',
    r: 'button[data-series="ucb"]',
    t: 'button[data-series="grossGrowth"]',
    a: 'button[data-series="net"]',
    s: 'button[data-series="netChange"]',
    d: 'button[data-series="interest"]',
    f: 'button[data-series="fiscal"]',
    g: 'button[data-toggle="government"]',
  };
  for (const [key, selector] of Object.entries(shortcutSelectors)) {
    const button = page.locator(selector);
    const before = await button.getAttribute("aria-pressed");
    await page.keyboard.press(key);
    expect(await button.getAttribute("aria-pressed")).not.toBe(before);
    await page.keyboard.press(key);
    expect(await button.getAttribute("aria-pressed")).toBe(before);
  }

  const legendBefore = await page.locator(".chart-inline-legend").getAttribute("data-legend-offset");
  await page.keyboard.press(" ");
  await page.waitForTimeout(1_050);
  expect(await page.locator(".chart-inline-legend").getAttribute("data-legend-offset")).not.toBe(legendBefore);

  await page.keyboard.press("0");
  expect((await snapshot(page)).horizontalOverflow).toBe(false);
  expect(browserErrors, `${testInfo.project.name} browser errors`).toEqual([]);
});

test("covers desktop point selection, hover tooltips, granular mouse zoom, pan, wheel zoom, and drag selection protection", async ({ page }, testInfo) => {
  const browserErrors = captureBrowserErrors(page);
  await loadApp(page);

  const plot = await chartPlotGeometry(page);
  const pointPositions = await chartYearPositions(page);
  expect(pointPositions.length).toBeGreaterThan(10);

  await page.mouse.click(plot.left + (plot.right - plot.left) * 0.5, plot.centerY);
  expect((await snapshot(page)).year).not.toBe("2024-25");

  const firstPoint = page.locator(".chart-point").first();
  await firstPoint.hover();
  await expect(page.locator("#chartTooltip")).toBeVisible();
  expect(await page.locator("#chartTooltip").textContent()).toContain("1970-71");
  await page.mouse.move(10, 10);
  await expect(page.locator("#chartTooltip")).toBeHidden();

  await firstPoint.focus();
  await expect(page.locator("#chartTooltip")).toBeVisible();
  await firstPoint.blur();
  await expect(page.locator("#chartTooltip")).toBeHidden();

  const start = {
    x: plot.left + (plot.right - plot.left) * 0.19,
    y: plot.centerY,
  };
  const end = {
    x: plot.left + (plot.right - plot.left) * 0.71,
    y: plot.centerY,
  };
  const expectedSelection = await snappedSelection(page, start.x, end.x);
  await mouseDrag(page, start, end);
  const selectionDuringDrag = await page.locator("#dragSelection").evaluate((element) => ({
    display: getComputedStyle(element).display,
    x: Number(element.getAttribute("x")),
    width: Number(element.getAttribute("width")),
  }));
  expect(selectionDuringDrag.display).toBe("block");
  expect(Math.abs(selectionDuringDrag.x - expectedSelection.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(selectionDuringDrag.width - expectedSelection.width)).toBeLessThanOrEqual(0.5);
  const selectedText = await page.evaluate(() => window.getSelection()?.toString() || "");
  expect(selectedText).toBe("");
  await finishMouseDrag(page);

  const zoomed = await chartYearEndpoints(page);
  expect(zoomed.first).not.toBe("1970");
  expect(zoomed.last).not.toBe("2025");
  expect(await page.locator("#resetView").isDisabled()).toBe(false);
  expect(await page.locator("#chartSvg").evaluate((chart) => chart.classList.contains("dragging"))).toBe(false);

  const zoomedPlot = await chartPlotGeometry(page);
  const panBefore = await chartYearEndpoints(page);
  await mouseDrag(
    page,
    { x: zoomedPlot.left + (zoomedPlot.right - zoomedPlot.left) * 0.68, y: zoomedPlot.centerY },
    { x: zoomedPlot.left + (zoomedPlot.right - zoomedPlot.left) * 0.35, y: zoomedPlot.centerY },
    "right",
  );
  await finishMouseDrag(page);
  const panAfter = await chartYearEndpoints(page);
  expect(panAfter.first).not.toBe(panBefore.first);
  expect(panAfter.last).not.toBe(panBefore.last);

  await page.keyboard.press("0");
  const fullBeforeWheel = await chartYearEndpoints(page);
  await page.mouse.move(plot.left + (plot.right - plot.left) * 0.5, plot.centerY);
  await page.mouse.wheel(0, -240);
  await page.waitForTimeout(80);
  const wheelZoomed = await chartYearEndpoints(page);
  expect(wheelZoomed.count).toBeLessThan(fullBeforeWheel.count);
  expect(await page.locator("#resetView").isDisabled()).toBe(false);

  await page.keyboard.press("0");
  expect((await snapshot(page)).horizontalOverflow).toBe(false);
  expect(browserErrors, `${testInfo.project.name} browser errors`).toEqual([]);
});

test("covers desktop sharing, selectable fallback links, fullscreen stability, and CSV download", async ({ page }, testInfo) => {
  const browserErrors = captureBrowserErrors(page);
  await loadApp(page);

  await page.locator("#viewDollars").click();
  await page.locator("#measurePerCapita").click();
  await page.locator("#basisReal").click();
  await page.locator("#shareView").click();
  await page.waitForTimeout(100);

  const shareState = await page.evaluate(() => ({
    fallbackHidden: document.querySelector("#shareFallback").hidden,
    url: document.querySelector("#shareUrlInput").value,
    userSelect: getComputedStyle(document.querySelector("#shareUrlInput")).userSelect,
    buttonText: document.querySelector("#shareView").textContent.trim(),
  }));
  if (!shareState.fallbackHidden) {
    expect(shareState.url).toContain("from=");
    expect(shareState.url).toContain("view=dollars");
    expect(shareState.userSelect).not.toBe("none");
    await page.locator("#closeShareFallback").click();
  } else {
    expect(shareState.buttonText).toMatch(/Link copied|Shared/);
  }

  const beforeFullscreen = await snapshot(page);
  await page.locator("#fullscreenChart").click();
  await page.waitForTimeout(150);
  const fullscreenState = await snapshot(page);
  if (fullscreenState.fullscreen || fullscreenState.kiosk) {
    await page.locator("#fullscreenChart").click();
    await page.waitForTimeout(150);
    const restored = await snapshot(page);
    expect(restored.fullscreen).toBe(false);
    expect(restored.kiosk).toBe(false);
  } else {
    expect(fullscreenState.chart?.width).toBeGreaterThan(0);
    expect(fullscreenState.chart?.height).toBeGreaterThan(0);
    expect(fullscreenState.year).toBe(beforeFullscreen.year);
  }

  await page.locator(".download-details summary").click();
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#downloadCsv").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^australian-national-debt-1970-71-2024-25\.csv$/);

  expect(browserErrors, `${testInfo.project.name} browser errors`).toEqual([]);
});
