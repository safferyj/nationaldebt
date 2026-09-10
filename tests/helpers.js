const path = require("node:path");
const { pathToFileURL } = require("node:url");

const appUrl = pathToFileURL(path.resolve(__dirname, "..", "index.html")).href;

function captureBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  return errors;
}

async function loadApp(page) {
  await page.goto(appUrl, { waitUntil: "load" });
  await page.waitForSelector("#chartSvg");
  await page.waitForFunction(() => (
    document.querySelectorAll("#measureRows .measure-lozenge").length === 10
  ));
  await page.waitForTimeout(50);
}

async function snapshot(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        right: box.right,
        bottom: box.bottom,
      };
    };
    const text = (selector) => document.querySelector(selector)?.textContent?.trim() || "";
    const visible = (selector) => {
      const element = document.querySelector(selector);
      if (!element) return false;
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return !element.hidden && style.display !== "none" && box.width > 0 && box.height > 0;
    };

    return {
      width: window.innerWidth,
      height: window.innerHeight,
      portraitMobile: window.matchMedia("(max-width: 760px) and (orientation: portrait)").matches,
      mobile: window.matchMedia("(max-width: 760px)").matches,
      kiosk: document.querySelector(".chart-card")?.classList.contains("is-kiosk") || false,
      bodyKiosk: document.body.classList.contains("kiosk-open"),
      fullscreen: Boolean(document.fullscreenElement || document.webkitFullscreenElement),
      fullscreenText: text("#fullscreenChart"),
      year: text("#selectedYearLabel"),
      chart: rect("#chartSvg"),
      chartHeight: rect("#chartSvg")?.height || 0,
      chartWrap: rect("#chartWrap"),
      axisText: rect("#chartAxisLabelText"),
      axisLabel: rect("#chartAxisLabel"),
      horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
      visualScale: window.visualViewport?.scale || 1,
      measureCount: document.querySelectorAll("#measureRows .measure-lozenge").length,
      governmentValue: text('[data-toggle="government"] .measure-lozenge-government-value'),
      governmentShortValue: document.querySelector('[data-toggle="government"] .measure-lozenge-government-value')?.dataset.shortValue || "",
      controls: {
        debtView: visible("#debtViewControl"),
        dollarMeasure: visible("#dollarMeasureControl"),
        dollarBasis: visible("#dollarBasisControl"),
        year: visible(".chart-year-picker"),
        endActions: visible(".chart-end-actions"),
      },
      grid: ["#debtViewControl", ".chart-year-picker", "#dollarMeasureControl", "#dollarBasisControl", ".chart-end-actions"]
        .reduce((result, selector) => {
          const element = document.querySelector(selector);
          if (!element) return result;
          const style = getComputedStyle(element);
          result[selector] = {
            row: style.gridRowStart,
            column: style.gridColumnStart,
            hidden: element.hidden,
          };
          return result;
        }, {}),
    };
  });
}

async function tapCenter(page, selector, count = 1, delay = 0) {
  const locator = page.locator(selector);
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for ${selector}`);
  for (let index = 0; index < count; index += 1) {
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    if (delay) await page.waitForTimeout(delay);
  }
}

async function clickMany(page, selector, count) {
  await page.evaluate(({ selector, count }) => {
    const button = document.querySelector(selector);
    if (!button) throw new Error(`Missing ${selector}`);
    for (let index = 0; index < count; index += 1) button.click();
  }, { selector, count });
  await page.waitForTimeout(50);
}

async function longPress(page, selector, pointerId) {
  const locator = page.locator(selector);
  const box = await locator.boundingBox();
  if (!box) throw new Error(`No bounding box for long-press target ${selector}`);
  const eventData = {
    pointerId,
    pointerType: "touch",
    isPrimary: true,
    clientX: box.x + box.width / 2,
    clientY: box.y + box.height / 2,
    button: 0,
    buttons: 1,
  };
  await locator.dispatchEvent("pointerdown", eventData);
  await page.waitForTimeout(650);
  const open = await page.evaluate(() => ({
    hidden: document.querySelector("#measureTooltip")?.hidden ?? true,
    text: document.querySelector("#measureTooltip")?.textContent?.trim() || "",
    describedBy: document.querySelector("#measureRows .measure-lozenge[aria-describedby]")?.getAttribute("aria-describedby") || "",
  }));
  await locator.dispatchEvent("pointerup", { ...eventData, buttons: 0 });
  return open;
}

function axisCenterError(state) {
  return Math.abs(
    (state.axisText.y + state.axisText.height / 2)
      - (state.chart.y + state.chart.height / 2),
  );
}

module.exports = {
  appUrl,
  axisCenterError,
  captureBrowserErrors,
  clickMany,
  loadApp,
  longPress,
  snapshot,
  tapCenter,
};
