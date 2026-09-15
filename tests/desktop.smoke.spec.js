const { test, expect } = require("@playwright/test");
const {
  axisGeometry,
  chartPlotGeometry,
  captureBrowserErrors,
  loadApp,
  rangesOverlap,
  snapshot,
} = require("./desktop.helpers");

test("renders a complete desktop chart without layout or axis collisions", async ({ page }, testInfo) => {
  const browserErrors = captureBrowserErrors(page);
  await loadApp(page);

  const initial = await snapshot(page);
  expect(initial.landscapeWarning).toBe(false);
  expect(initial.mobile).toBe(false);
  expect(initial.portraitMobile).toBe(false);
  expect(initial.kiosk).toBe(false);
  expect(initial.bodyKiosk).toBe(false);
  expect(initial.fullscreenText).toBe("Full screen");
  expect(initial.measureCount).toBe(10);
  expect(initial.chart?.width).toBeGreaterThan(0);
  expect(initial.chart?.height).toBeGreaterThan(0);
  expect(initial.controlOverflow, "Chart controls must remain inside the chart card").toEqual([]);
  expect(initial.horizontalOverflow).toBe(false);

  const plot = await chartPlotGeometry(page);
  expect(plot.right).toBeGreaterThan(plot.left);
  expect(plot.bottom).toBeGreaterThan(plot.top);

  const xAxisAlignment = await page.evaluate(() => {
    const labels = Array.from(document.querySelectorAll("#chartSvg text"))
      .map((text) => ({
        year: text.textContent.trim(),
        x: Number(text.getAttribute("x")),
      }))
      .filter(({ year }) => /^\d{4}$/.test(year));
    const pointX = (index) => Number(
      document.querySelector(`#chartSvg .chart-point[data-index="${index}"]`)?.getAttribute("cx"),
    );
    const labelX = (year) => labels.find((label) => label.year === String(year))?.x;
    return {
      labels: labels.map(({ year }) => year),
      firstPointX: pointX(0),
      point1975X: pointX(4),
      lastPointX: pointX(54),
      tick1970X: labelX(1970),
      tick1975X: labelX(1975),
      tick2025X: labelX(2025),
    };
  });
  expect(xAxisAlignment.labels).toEqual([
    "1970", "1975", "1980", "1985", "1990", "1995",
    "2000", "2005", "2010", "2015", "2020", "2025",
  ]);
  expect(xAxisAlignment.firstPointX).toBeGreaterThan(xAxisAlignment.tick1970X);
  expect(Math.abs(xAxisAlignment.point1975X - xAxisAlignment.tick1975X)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(xAxisAlignment.lastPointX - xAxisAlignment.tick2025X)).toBeLessThanOrEqual(0.5);

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

  const assertAxisLayout = async (expectedLabel) => {
    const axis = await axisGeometry(page);
    expect(axis.fullLabel).toBe(expectedLabel);
    expect(axis.fontWeight).toBe("600");
    expect(axis.insideSvg).toBe(true);
    expect(axis.rect?.width).toBeGreaterThan(0);
    expect(axis.rect?.height).toBeGreaterThan(0);
    expect(axis.ticks.some((tick) => (
      rangesOverlap(axis.rect, tick)
    ))).toBe(false);
  };

  await assertAxisLayout("% of GDP");
  await page.locator("#viewDollars").click();
  await page.locator("#measurePerCapita").click();
  await page.locator("#basisReal").click();
  await page.waitForTimeout(50);
  await assertAxisLayout("A$ per capita (real, 2024-25 dollars)");

  const chartSelection = await page.locator("#chartSvg").evaluate((element) => ({
    svg: getComputedStyle(element).userSelect,
    text: getComputedStyle(element.querySelector("text")).userSelect,
  }));
  expect(chartSelection.svg).toBe("none");
  expect(chartSelection.text).toBe("none");

  expect(browserErrors, `${testInfo.project.name} browser errors`).toEqual([]);
});
