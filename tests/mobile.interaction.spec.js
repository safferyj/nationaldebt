const { test, expect } = require("@playwright/test");
const {
  axisCenterError,
  captureBrowserErrors,
  clickMany,
  loadApp,
  longPress,
  snapshot,
  tapCenter,
} = require("./helpers");

test.setTimeout(60_000);

async function holdPointer(page, selector, pointerId, duration) {
  const locator = page.locator(selector);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for hold target ${selector}`);
  const eventData = {
    pointerId,
    pointerType: "mouse",
    isPrimary: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
    button: 0,
    buttons: 1,
  };
  await locator.dispatchEvent("pointerdown", eventData);
  await page.waitForTimeout(duration);
  const during = await snapshot(page);
  await locator.dispatchEvent("pointerup", { ...eventData, buttons: 0 });
  await page.waitForTimeout(60);
  return { during, released: await snapshot(page) };
}

async function dispatchTouchSequence(page, sequence) {
  await page.evaluate((events) => {
    const chart = document.querySelector("#chartSvg");
    if (!chart) throw new Error("Missing #chartSvg");
    const rect = chart.getBoundingClientRect();
    const clientY = rect.top + rect.height * 0.5;
    events.forEach(({ type, pointerId, x, buttons = 1 }) => {
      chart.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId,
        pointerType: "touch",
        isPrimary: pointerId === 1,
        clientX: rect.left + rect.width * x,
        clientY,
        button: 0,
        buttons,
      }));
    });
  }, sequence);
  await page.waitForTimeout(40);
}

async function chartTouchPositions(page) {
  return page.locator("#chartSvg").evaluate((chart) => {
    const width = chart.viewBox.baseVal.width;
    const left = 75 / width;
    const right = (width - 22) / width;
    const span = right - left;
    return {
      edge: left + span * 0.02,
      zoomStart: left + span * 0.12,
      scrubStart: left + span * 0.25,
      scrubMiddle: left + span * 0.5,
      scrubEnd: left + span * 0.75,
      zoomEnd: left + span * 0.88,
    };
  });
}

async function chartYearEndpoints(page) {
  return page.evaluate(() => {
    const years = Array.from(document.querySelectorAll("#chartSvg text"), (text) => text.textContent.trim())
      .filter((text) => /^\d{4}$/.test(text));
    return {
      first: years[0] || "",
      last: years[years.length - 1] || "",
      count: years.length,
    };
  });
}

async function assertChartPointHitTargets(page) {
  const metrics = await page.evaluate(() => {
    const hitPoints = Array.from(document.querySelectorAll(".chart-point-hit"));
    const visiblePoints = Array.from(document.querySelectorAll(".chart-point"));
    return {
      hitCount: hitPoints.length,
      visibleCount: visiblePoints.length,
      hitRadius: Number(hitPoints[0]?.getAttribute("r") || 0),
      visibleRadius: Number(visiblePoints[0]?.getAttribute("r") || 0),
    };
  });
  expect(metrics.hitCount).toBeGreaterThan(0);
  expect(metrics.hitCount).toBe(metrics.visibleCount);
  expect(metrics.hitRadius).toBeGreaterThan(metrics.visibleRadius);

  await page.locator(".chart-point-hit").first().dispatchEvent("click");
  expect((await snapshot(page)).year).toBe("1970-71");
}

async function assertChartTooltipDismissal(page) {
  const point = page.locator(".chart-point-hit").nth(10);
  await point.dispatchEvent("mouseenter");

  const tooltip = page.locator("#chartTooltip");
  expect(await tooltip.isHidden()).toBe(false);
  expect(await tooltip.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("auto");
  const opened = await snapshot(page);
  const tooltipBox = await tooltip.boundingBox();
  if (!tooltipBox) throw new Error("No chart tooltip bounding box available");

  await page.touchscreen.tap(
    tooltipBox.x + tooltipBox.width / 2,
    tooltipBox.y + tooltipBox.height / 2,
  );
  await page.waitForTimeout(80);
  expect(await tooltip.isHidden()).toBe(true);
  expect((await snapshot(page)).year).toBe(opened.year);
}

async function assertTouchZoomGesture(page) {
  await page.evaluate(() => {
    const reset = document.querySelector("#resetView");
    if (reset && !reset.disabled) reset.click();
  });
  expect(await page.locator("#resetView").isDisabled()).toBe(true);

  const touch = await chartTouchPositions(page);
  const beforeDragYear = (await snapshot(page)).year;
  await dispatchTouchSequence(page, [
    { type: "pointerdown", pointerId: 1, x: touch.scrubStart },
    { type: "pointermove", pointerId: 1, x: touch.scrubMiddle },
  ]);
  const middleDragYear = (await snapshot(page)).year;
  await dispatchTouchSequence(page, [
    { type: "pointermove", pointerId: 1, x: touch.scrubEnd },
    { type: "pointerup", pointerId: 1, x: touch.scrubEnd, buttons: 0 },
  ]);
  const afterDragYear = (await snapshot(page)).year;
  expect(middleDragYear).not.toBe(beforeDragYear);
  expect(afterDragYear).not.toBe(middleDragYear);
  expect(await page.locator("#resetView").isDisabled()).toBe(true);

  await dispatchTouchSequence(page, [
    { type: "pointerdown", pointerId: 1, x: touch.zoomEnd },
    { type: "pointerdown", pointerId: 2, x: touch.zoomStart },
    { type: "pointermove", pointerId: 1, x: touch.zoomStart },
    { type: "pointermove", pointerId: 2, x: touch.zoomEnd },
    { type: "pointerup", pointerId: 1, x: touch.zoomStart, buttons: 0 },
  ]);
  expect(await page.locator("#resetView").isDisabled()).toBe(true);
  await dispatchTouchSequence(page, [
    { type: "pointerup", pointerId: 2, x: touch.zoomEnd, buttons: 0 },
  ]);
  expect(await page.locator("#resetView").isDisabled()).toBe(false);
  const zoomedYears = await chartYearEndpoints(page);
  expect(zoomedYears.count).toBeGreaterThan(1);
  expect(zoomedYears.first).not.toBe("1970");
  expect(zoomedYears.last).not.toBe("2024");
  expect(await page.locator("#chartSvg").evaluate((chart) => chart.classList.contains("dragging"))).toBe(false);

  await page.keyboard.press("0");
  expect(await page.locator("#resetView").isDisabled()).toBe(true);
}

async function assertTouchPointerCleanup(page) {
  await page.keyboard.press("0");
  const touch = await chartTouchPositions(page);
  await dispatchTouchSequence(page, [
    { type: "pointerdown", pointerId: 11, x: 0.9 },
    { type: "pointermove", pointerId: 11, x: 0.02 },
  ]);
  expect((await snapshot(page)).year).toBe("1970-71");

  await dispatchTouchSequence(page, [
    { type: "lostpointercapture", pointerId: 11, x: 0.02, buttons: 0 },
  ]);
  await dispatchTouchSequence(page, [
    { type: "pointerdown", pointerId: 12, x: 0.9 },
    { type: "pointermove", pointerId: 12, x: touch.scrubMiddle },
    { type: "pointerup", pointerId: 12, x: touch.scrubMiddle, buttons: 0 },
  ]);
  expect((await snapshot(page)).year).not.toBe("1970-71");
  expect(await page.locator("#chartSvg").evaluate((chart) => chart.classList.contains("dragging"))).toBe(false);

  await page.keyboard.press("0");
  const updatedTouch = await chartTouchPositions(page);
  await dispatchTouchSequence(page, [
    { type: "pointerdown", pointerId: 13, x: updatedTouch.edge },
    { type: "pointerdown", pointerId: 14, x: updatedTouch.scrubMiddle },
    { type: "pointermove", pointerId: 13, x: updatedTouch.edge },
    { type: "pointermove", pointerId: 14, x: updatedTouch.scrubMiddle },
    { type: "pointerup", pointerId: 13, x: updatedTouch.edge, buttons: 0 },
    { type: "pointerup", pointerId: 14, x: updatedTouch.scrubMiddle, buttons: 0 },
  ]);
  expect(await page.locator("#resetView").isDisabled()).toBe(false);
  const edgeZoomYear = (await snapshot(page)).year;

  await dispatchTouchSequence(page, [
    { type: "pointerdown", pointerId: 15, x: updatedTouch.scrubMiddle },
    { type: "pointermove", pointerId: 15, x: updatedTouch.zoomStart },
    { type: "pointerup", pointerId: 15, x: updatedTouch.zoomStart, buttons: 0 },
  ]);
  expect((await snapshot(page)).year).not.toBe(edgeZoomYear);
  expect(await page.locator("#chartSvg").evaluate((chart) => chart.classList.contains("dragging"))).toBe(false);
}

async function assertPortraitLayout(page, initial) {
  expect(initial.portraitMobile).toBe(true);
  expect(initial.kiosk).toBe(true);
  expect(initial.bodyKiosk).toBe(true);
  expect(initial.fullscreenText).toBe("Exit full screen");
  expect(initial.governmentValue).toBe(initial.governmentShortValue);

  for (const selector of [
    "#debtViewControl",
    ".chart-year-picker",
    "#dollarMeasureControl",
    "#dollarBasisControl",
    ".chart-end-actions > button",
  ]) {
    const heights = await page.locator(selector).evaluateAll((elements) => elements
      .filter((element) => !element.hidden)
      .map((element) => element.getBoundingClientRect().height));
    expect(heights.length, `${selector} should have visible elements`).toBeGreaterThan(0);
    for (const height of heights) {
      expect(Math.abs(height - 40), `${selector} should be 40px high`).toBeLessThanOrEqual(1.5);
    }
  }

  const lozengeHeights = await page.locator("#measureRows .measure-lozenge").evaluateAll((elements) => elements
    .filter((element) => !element.hidden)
    .map((element) => element.getBoundingClientRect().height));
  expect(lozengeHeights.length, "measure lozenges should be visible").toBeGreaterThan(0);
  for (const height of lozengeHeights) {
    expect(Math.abs(height - 37), "measure lozenges should be approximately 37px high").toBeLessThanOrEqual(1.5);
  }

  const grid = initial.grid;
  expect(grid["#debtViewControl"]).toMatchObject({ row: "1", column: "1" });
  expect(grid[".chart-year-picker"]).toMatchObject({ row: "1", column: "2" });
  expect(grid["#dollarMeasureControl"]).toMatchObject({ row: "2", column: "1" });
  expect(grid["#dollarBasisControl"]).toMatchObject({ row: "2", column: "2" });
  expect(grid[".chart-end-actions"].row).toBe("3");

  await page.locator("#fullscreenChart").click();
  await page.waitForTimeout(80);
  const normal = await snapshot(page);
  expect(normal.kiosk).toBe(false);
  expect(normal.fullscreen).toBe(false);
  expect(normal.fullscreenText).toBe("Full screen");
  expect(Math.abs(normal.chartHeight - 480)).toBeLessThanOrEqual(1.5);
  expect(normal.governmentValue).toBe(normal.governmentShortValue);

  await page.locator("#fullscreenChart").click();
  await page.waitForTimeout(80);
  const restored = await snapshot(page);
  expect(restored.kiosk).toBe(true);
  expect(restored.fullscreenText).toBe("Exit full screen");
  expect(axisCenterError(restored)).toBeLessThanOrEqual(8);

  await page.locator("#viewDollars").click();
  await page.waitForTimeout(40);
  const dollars = await snapshot(page);
  expect(dollars.controls.dollarMeasure).toBe(true);
  expect(dollars.controls.dollarBasis).toBe(true);
  expect(dollars.grid["#dollarMeasureControl"]).toMatchObject({ row: "2", column: "1" });
  expect(dollars.grid["#dollarBasisControl"]).toMatchObject({ row: "2", column: "2" });
  expect(Math.abs(dollars.chart.height - restored.chart.height)).toBeLessThanOrEqual(1.5);

  await page.locator("#measurePerCapita").click();
  await page.locator("#basisReal").click();
  await page.waitForTimeout(40);
  const perCapita = await snapshot(page);
  expect(perCapita.axisText.width).toBeGreaterThan(0);
  expect(perCapita.axisText.height).toBeGreaterThan(0);
  expect(axisCenterError(perCapita)).toBeLessThanOrEqual(8);
  expect(perCapita.governmentValue).toBe(perCapita.governmentShortValue);

  await page.locator("#viewPctGdp").click();
  await page.waitForTimeout(40);
}

async function assertFullscreenBehavior(page, initial) {
  if (initial.portraitMobile) return true;

  await page.locator("#fullscreenChart").click();
  await page.waitForTimeout(150);
  let state = await snapshot(page);
  if (!state.kiosk && !state.fullscreen) return false;

  await page.locator("#fullscreenChart").click();
  await page.waitForTimeout(150);
  state = await snapshot(page);
  expect(state.kiosk).toBe(false);
  expect(state.fullscreen).toBe(false);
  return true;
}

async function assertYearInteractions(page) {
  await clickMany(page, "#nextYear", 100);
  let state = await snapshot(page);
  expect(state.year).toBe("2024-25");
  const latestScale = state.visualScale;

  await tapCenter(page, "#nextYear", 4);
  state = await snapshot(page);
  expect(state.year).toBe("2024-25");
  expect(Math.abs(state.visualScale - latestScale)).toBeLessThanOrEqual(0.01);

  await tapCenter(page, "#previousYear");
  state = await snapshot(page);
  expect(state.year).toBe("2023-24");
  expect(Math.abs(state.visualScale - latestScale)).toBeLessThanOrEqual(0.01);

  await clickMany(page, "#previousYear", 100);
  state = await snapshot(page);
  expect(state.year).toBe("1970-71");
  const oldestScale = state.visualScale;

  await tapCenter(page, "#previousYear", 4);
  state = await snapshot(page);
  expect(state.year).toBe("1970-71");
  expect(Math.abs(state.visualScale - oldestScale)).toBeLessThanOrEqual(0.01);

  await clickMany(page, "#nextYear", 100);
  state = await snapshot(page);
  expect(state.year).toBe("2024-25");

  const holdStart = await snapshot(page);
  const held = await holdPointer(page, "#previousYear", 201, 1_250);
  const heldYears = Number(holdStart.year.slice(0, 4)) - Number(held.during.year.slice(0, 4));
  expect(heldYears).toBeGreaterThanOrEqual(13);
  expect(heldYears).toBeLessThanOrEqual(17);
  const releaseBoundaryYears = Number(held.during.year.slice(0, 4))
    - Number(held.released.year.slice(0, 4));
  expect(releaseBoundaryYears).toBeGreaterThanOrEqual(0);
  expect(releaseBoundaryYears).toBeLessThanOrEqual(3);
  await page.waitForTimeout(600);
  expect((await snapshot(page)).year).toBe(held.released.year);

  if (state.portraitMobile) {
    const touchStyles = await page.evaluate(() => ({
      picker: getComputedStyle(document.querySelector(".chart-year-picker")).touchAction,
      button: getComputedStyle(document.querySelector("#nextYear")).touchAction,
      arrow: getComputedStyle(document.querySelector(".year-arrow")).pointerEvents,
    }));
    expect(touchStyles.picker).toBe("manipulation");
    expect(touchStyles.button).toBe("manipulation");
    expect(touchStyles.arrow).toBe("none");
  }
}

async function assertTooltipInteractions(page, initial) {
  await clickMany(page, "#nextYear", 100);
  const beforeInteraction = await snapshot(page);
  const target = page.locator("#measureRows .measure-lozenge:not(:disabled)").first();
  const targetSelector = await target.evaluate((button) => (
    button.dataset.toggle
      ? `button[data-toggle="${button.dataset.toggle}"]`
      : `button[data-series="${button.dataset.series}"]`
  ));
  const beforePressed = await target.getAttribute("aria-pressed");

  const opened = await longPress(page, targetSelector, 101);
  expect(opened.hidden).toBe(false);
  expect(opened.text.length).toBeGreaterThan(0);
  expect(opened.describedBy).toBe("measureTooltip");

  await page.waitForTimeout(1_200);
  const persistent = await page.evaluate(() => {
    const tooltip = document.querySelector("#measureTooltip");
    const box = tooltip.getBoundingClientRect();
    return {
      hidden: tooltip.hidden,
      rect: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
      viewport: { width: window.innerWidth, height: window.innerHeight },
    };
  });
  expect(persistent.hidden).toBe(false);
  expect(persistent.rect.left).toBeGreaterThanOrEqual(0);
  expect(persistent.rect.top).toBeGreaterThanOrEqual(0);
  expect(persistent.rect.right).toBeLessThanOrEqual(persistent.viewport.width + 1);
  expect(persistent.rect.bottom).toBeLessThanOrEqual(persistent.viewport.height + 1);

  await tapCenter(page, "#previousYear");
  const blocked = await snapshot(page);
  expect(blocked.year).toBe("2024-25");
  expect(blocked.kiosk).toBe(beforeInteraction.kiosk);
  expect(await page.locator(targetSelector).getAttribute("aria-pressed")).toBe(beforePressed);
  expect(await page.locator("#measureTooltip").evaluate((element) => element.hidden)).toBe(true);

  const reopened = await longPress(page, targetSelector, 102);
  expect(reopened.hidden).toBe(false);
  await tapCenter(page, "#measureTooltip");
  await page.waitForTimeout(60);
  expect(await page.locator("#measureTooltip").evaluate((element) => element.hidden)).toBe(true);
  expect(await page.locator(targetSelector).getAttribute("aria-describedby")).toBeNull();

  if (!initial.portraitMobile) {
    expect((await snapshot(page)).horizontalOverflow).toBe(false);
  }
}

test("supports the complete mobile interaction checklist", async ({ page }, testInfo) => {
  const browserErrors = captureBrowserErrors(page);
  await loadApp(page);
  const initial = await snapshot(page);

  expect(initial.measureCount).toBe(10);
  if (initial.landscapeWarning) {
    expect(initial.portraitMobile).toBe(false);
    expect(initial.landscapeWarningText).toContain("Please turn your device upright");
    expect(initial.landscapeWarningText).toContain("more vertical space");
    expect(initial.chart?.width).toBe(0);
    expect(initial.chart?.height).toBe(0);
    expect(initial.horizontalOverflow).toBe(false);
    expect(browserErrors, `${testInfo.project.name} browser errors`).toEqual([]);
    return;
  }

  expect(initial.chart?.width).toBeGreaterThan(0);
  expect(initial.chart?.height).toBeGreaterThan(0);
  expect(initial.horizontalOverflow).toBe(false);

  const legendSizing = await page.evaluate(() => {
    const legend = document.querySelector(".chart-inline-legend");
    const background = legend?.querySelector("rect");
    const longestTextWidth = Array.from(legend?.querySelectorAll("text") || []).reduce((max, text) => {
      const width = text.getComputedTextLength();
      return Number.isFinite(width) ? Math.max(max, width) : max;
    }, 0);
    return {
      width: Number(background?.getAttribute("width") || 0),
      longestTextWidth,
    };
  });
  expect(legendSizing.width).toBeLessThan(290);
  expect(legendSizing.width - legendSizing.longestTextWidth).toBeGreaterThanOrEqual(52);

  if (initial.mobile) {
    const touchGuards = await page.evaluate(() => {
      const chartCard = document.querySelector(".chart-card");
      const style = getComputedStyle(chartCard);
      const selectEvent = new Event("selectstart", { bubbles: true, cancelable: true });
      document.querySelector("#selectedYearLabel").dispatchEvent(selectEvent);
      const contextEvent = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
      chartCard.dispatchEvent(contextEvent);
      const touchEvent = new Event("touchstart", { bubbles: true, cancelable: true });
      document.querySelector("#nextYear").dispatchEvent(touchEvent);
      const controlButton = document.querySelector("#viewPctGdp");
      let controlClicks = 0;
      controlButton.addEventListener("click", () => {
        controlClicks += 1;
      });
      const controlTouchStart = new Event("touchstart", { bubbles: true, cancelable: true });
      Object.defineProperty(controlTouchStart, "touches", {
        value: [{ clientX: 10, clientY: 10 }]
      });
      const controlTouchEnd = new Event("touchend", { bubbles: true, cancelable: true });
      controlButton.dispatchEvent(controlTouchStart);
      controlButton.dispatchEvent(controlTouchEnd);
      const shareSelectEvent = new Event("selectstart", { bubbles: true, cancelable: true });
      document.querySelector("#shareUrlInput").dispatchEvent(shareSelectEvent);
      return {
        userSelect: style.userSelect,
        controlsTouchAction: getComputedStyle(document.querySelector(".chart-controls-row")).touchAction,
        buttonTouchActions: Array.from(chartCard.querySelectorAll("button"), (button) =>
          getComputedStyle(button).touchAction
        ),
        shareUserSelect: getComputedStyle(document.querySelector("#shareUrlInput")).userSelect,
        selectPrevented: selectEvent.defaultPrevented,
        contextPrevented: contextEvent.defaultPrevented,
        boundaryTouchPrevented: touchEvent.defaultPrevented,
        controlTouchStartPrevented: controlTouchStart.defaultPrevented,
        controlTouchEndPrevented: controlTouchEnd.defaultPrevented,
        controlClicks,
        shareSelectPrevented: shareSelectEvent.defaultPrevented,
      };
    });
    expect(touchGuards.userSelect).toBe("none");
    expect(touchGuards.controlsTouchAction).toBe("manipulation");
    expect(touchGuards.buttonTouchActions.every((action) => action === "manipulation")).toBe(true);
    expect(touchGuards.shareUserSelect).toBe("text");
    expect(touchGuards.selectPrevented).toBe(true);
    expect(touchGuards.contextPrevented).toBe(true);
    expect(touchGuards.boundaryTouchPrevented).toBe(true);
    expect(touchGuards.controlTouchStartPrevented).toBe(true);
    expect(touchGuards.controlTouchEndPrevented).toBe(true);
    expect(touchGuards.controlClicks).toBe(1);
    expect(touchGuards.shareSelectPrevented).toBe(false);
    await assertChartPointHitTargets(page);
  }

  if (initial.portraitMobile) {
    await assertPortraitLayout(page, initial);
  } else {
    expect(initial.kiosk).toBe(false);
    expect(initial.bodyKiosk).toBe(false);
  }

  const fullscreenSupported = await assertFullscreenBehavior(page, initial);
  await assertYearInteractions(page);
  await assertTooltipInteractions(page, initial);
  if (await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches)) {
    await assertTouchZoomGesture(page);
    await assertTouchPointerCleanup(page);
    await assertChartTooltipDismissal(page);
  }

  const final = await snapshot(page);
  expect(final.measureCount).toBe(10);
  expect(final.horizontalOverflow).toBe(false);
  expect(browserErrors, `${testInfo.project.name} browser errors`).toEqual([]);

  if (!fullscreenSupported) {
    testInfo.annotations.push({
      type: "note",
      description: "Native fullscreen was unavailable in headless emulation for this wider viewport.",
    });
  }
});
