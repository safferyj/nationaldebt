const {
  captureBrowserErrors,
  loadApp,
  snapshot,
} = require("./helpers");

async function axisGeometry(page) {
  return page.evaluate(() => {
    const axis = document.querySelector("#chartAxisLabelText");
    const axisRect = axis?.getBoundingClientRect();
    const tickRects = [...document.querySelectorAll(".chart-y-tick")].map((tick) => {
      const rect = tick.getBoundingClientRect();
      return {
        text: tick.textContent.trim(),
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    });
    return {
      text: axis?.textContent?.trim() || "",
      fullLabel: axis?.getAttribute("data-full-label") || "",
      fontWeight: axis?.getAttribute("font-weight") || "",
      insideSvg: axis?.ownerSVGElement?.id === "chartSvg",
      rect: axisRect
        ? {
          left: axisRect.left,
          top: axisRect.top,
          right: axisRect.right,
          bottom: axisRect.bottom,
          width: axisRect.width,
          height: axisRect.height,
        }
        : null,
      ticks: tickRects,
    };
  });
}

async function chartPlotGeometry(page) {
  const chart = page.locator("#chartSvg");
  await chart.scrollIntoViewIfNeeded();
  return chart.evaluate((element) => {
    const toScreen = (x, y) => {
      const point = new DOMPoint(x, y).matrixTransform(element.getScreenCTM());
      return { x: point.x, y: point.y };
    };
    const viewBox = element.viewBox.baseVal;
    const showGovernment = document.querySelector('[data-toggle="government"]')
      ?.getAttribute("aria-pressed") === "true";
    const plotBottom = showGovernment ? viewBox.height - 45 : viewBox.height - 24;
    return {
      left: toScreen(75, 16).x,
      right: toScreen(viewBox.width - 22, 16).x,
      top: toScreen(500, 16).y,
      bottom: toScreen(500, plotBottom).y,
      centerY: toScreen(viewBox.width / 2, 16 + (plotBottom - 16) / 2).y,
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

async function chartYearPositions(page) {
  return page.evaluate(() => {
    const positions = new Map();
    document.querySelectorAll("#chartSvg .chart-point[data-index]").forEach((point) => {
      const index = Number(point.dataset.index);
      if (!positions.has(index)) positions.set(index, Number(point.getAttribute("cx")));
    });
    return [...positions.entries()]
      .sort(([first], [second]) => first - second)
      .map(([index, x]) => ({ index, x }));
  });
}

async function snappedSelection(page, clientX1, clientX2) {
  return page.evaluate(({ clientX1: firstClientX, clientX2: secondClientX }) => {
    const chart = document.querySelector("#chartSvg");
    const viewBox = chart.viewBox.baseVal;
    const showGovernment = document.querySelector('[data-toggle="government"]')
      ?.getAttribute("aria-pressed") === "true";
    const plotBottom = showGovernment ? viewBox.height - 45 : viewBox.height - 24;
    const centerScreen = new DOMPoint(
      viewBox.width / 2,
      16 + (plotBottom - 16) / 2,
    ).matrixTransform(chart.getScreenCTM());
    const toChartX = (clientX) => new DOMPoint(
      clientX,
      centerScreen.y,
    ).matrixTransform(chart.getScreenCTM().inverse()).x;
    const points = new Map();
    chart.querySelectorAll(".chart-point[data-index]").forEach((point) => {
      const index = Number(point.dataset.index);
      if (!points.has(index)) points.set(index, Number(point.getAttribute("cx")));
    });
    const yearPositions = [...points.entries()].sort(([first], [second]) => first - second);
    const snap = (clientX) => {
      const chartX = toChartX(clientX);
      return yearPositions.reduce((closest, entry) => (
        Math.abs(entry[1] - chartX) < Math.abs(closest[1] - chartX) ? entry : closest
      ), yearPositions[0]);
    };
    const first = snap(firstClientX);
    const second = snap(secondClientX);
    return {
      x: Math.min(first[1], second[1]),
      width: Math.abs(first[1] - second[1]),
      firstIndex: Math.min(first[0], second[0]),
      lastIndex: Math.max(first[0], second[0]),
    };
  }, { clientX1, clientX2 });
}

async function mouseDrag(page, start, end, button = "left") {
  await page.mouse.move(start.x, start.y);
  await page.mouse.down({ button });
  await page.mouse.move(end.x, end.y, { steps: 8 });
}

async function finishMouseDrag(page) {
  await page.mouse.up();
  await page.waitForTimeout(60);
}

function rangesOverlap(first, second) {
  return !(
    first.right <= second.left
    || first.left >= second.right
    || first.bottom <= second.top
    || first.top >= second.bottom
  );
}

module.exports = {
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
};
