# Copilot instructions

## Repository shape and scope

- This is a self-contained static web page. The application, styles, embedded data, SVG chart renderer, and interaction code all live in `index.html`.
- The page is an interactive Commonwealth fiscal data story covering 1970-71 to 2024-25. It is not yet an all-levels-of-government dataset.
- `government-debt-by-tier-notes.md` records possible future state/territory and local-government extensions; do not silently broaden the current Commonwealth scope when making changes.
- `.github/mcp.json` provides a repository-scoped Playwright MCP server for browser smoke checks; it is tooling configuration, not an application runtime dependency.
- There is no runtime backend, application framework, chart library, or runtime data request. The page is intended to work when opened offline; Node and Playwright are development-only test dependencies.

## Commands

- Preview the page locally: `python3 -m http.server 8000`, then open `http://localhost:8000/index.html`.
- Build: none configured; the deliverable is the standalone HTML file.
- Test: `npm run test:mobile:smoke` runs the all-profile smoke matrix; `npm run test:mobile:interaction` runs the all-profile interaction matrix; `npm run test:mobile` runs both.
- Lint: no lint configuration or lint command is configured.
- For behavior changes, manually smoke-test the browser page after serving it: initial rendering, year selection, chart zoom/pan, lens and measure toggles, share-link fallback, full screen, table row selection, and CSV download.

## Browser validation

- Playwright validation is browser/device emulation, not testing on physical iPhones, iPads, or Android devices. It exercises the page in Chromium and WebKit with Playwright's device descriptors.
- Use two levels of mobile validation:
  - **Smoke matrix:** enumerate every installed Playwright descriptor where `device.isMobile` is true, covering both portrait and landscape variants. Load the page, wait for the chart and all 10 measure lozenges, and check for page errors, `console.error` messages, rendering failures, and horizontal overflow. Do not replace the full matrix with only iPhone 11 and Pixel 5 checks.
  - **Full interaction matrix:** run the same complete profile set and exercise the mobile behavior that is relevant to the current UI: portrait kiosk presentation, control ordering and dimensions, chart height, Government short text, long-axis-label centering, Absolute/Per capita and dollar-basis controls, year changes at both boundaries without viewport zoom, persistent long-press lozenge tooltips, dismissal tap consumption, and full-screen entry/exit where the emulated viewport supports it.
- Use WebKit for Apple iPhone/iPad descriptors and Chromium for non-Apple mobile descriptors unless an engine-contrast check is specifically requested. Enumerate descriptors from the installed Playwright package rather than maintaining a hand-written device list; the profile count can change when Playwright changes.
- The current Playwright 1.63.0 installation exposes 200 mobile descriptors. The recent full interaction run used 90 WebKit Apple profiles and 110 Chromium non-Apple profiles, all in portrait and landscape where descriptors provide both.
- The portrait-only assertions correspond to the application breakpoint `max-width: 760px` plus `orientation: portrait`: the page starts in kiosk mode, controls and lozenges are 40px high, the normal chart is 480px high after leaving kiosk mode, and the Government value uses its short form. Wider tablets and wide landscape profiles should not be expected to auto-enter kiosk mode.
- Native browser fullscreen is not reliably available in headless emulation for wider tablet/desktop-like viewports. Treat that as an environment limitation; still check that the control is present, no error is raised, and the page remains stable. The mobile-width kiosk fallback is the deterministic fullscreen behavior to validate across profiles.
- The committed Playwright runner is `playwright.config.cjs`; shared helpers are in `tests/helpers.js`, with the smoke and full-interaction suites in `tests/mobile.smoke.spec.js` and `tests/mobile.interaction.spec.js`. They run against the standalone `index.html` via `file://`; the application remains dependency-free at runtime.
- The default npm scripts run every installed mobile descriptor. For a focused local run, set `PLAYWRIGHT_PROFILES` to a comma-separated list of exact descriptor names, for example `PLAYWRIGHT_PROFILES='iPhone 11,Pixel 5' npm run test:mobile:interaction`. Set `PW_WORKERS` to tune concurrency.
- Before running a matrix, confirm the installed Playwright version and browser assets with `npx --no-install playwright --version` and `npx --no-install playwright install --list`. Record the total profile count, engine split, pass/fail count, and any emulation limitations in the session result.

## Architecture

- The HTML body provides the semantic shell and empty dynamic containers for the chart, measure controls, selected-year details, insights, table, and sources.
- The inline script first declares the source snapshots:
  - `fiscalRows`: PBO fiscal observations in compact array form.
  - `cpiDeflators`: ABS June-quarter stock factors and financial-year-average flow factors.
  - `populationByFinancialYear`: ABS 30 June population denominators.
  - `politicalTimeline`: government and office-holders aligned to 30 June.
  - `sources`: source metadata reused by the visible source grid and inline citations.
- `rows` maps and validates those snapshots into the application model. It derives CPI conversion factors and attaches the political segment; missing CPI or population data intentionally throws during startup.
- `state` is the single source of truth for the selected range/year, active lens, dollar view, inflation basis, visible series, government band, and legend side. Event handlers mutate state and then call `renderAll()`.
- `renderAll()` refreshes the controls, measure lozenges, selected-year details, insights, SVG chart, table, and responsive label fitting. `chartModes.debt.series` supplies the currently selected percentage or dollar/per-capita series.
- The chart is drawn directly as SVG. It uses the inclusive `state.start`/`state.end` range, maps missing values to gaps, and renders a political strip only when the Government measure is enabled.
- The table follows the displayed chart range, while `downloadCsv()` always exports every embedded row and its derived fields.
- Share links encode `from`, `to`, `selected`, `view`, `measure`, `basis`, and `active` query parameters. `applyUrlState()` validates them against the embedded data before the first render.

## Data and calculation conventions

- Keep the documented `fiscalRows` field order: financial year, nominal GDP, gross debt, gross-debt/GDP, gross-debt growth, net debt, net-debt/GDP, underlying cash balance, underlying-cash/GDP, headline cash balance, headline-cash/GDP, fiscal balance, fiscal-balance/GDP, net interest payments, and the PBO interest-paid series.
- The fiscal values are stored in millions of Australian dollars; percentages are stored as numeric percentage values. `null` represents an unavailable observation, notably the fiscal balance before 1996-97.
- Existing rows retain a legacy trailing `false` placeholder after the 15 documented fields. It is ignored by destructuring and is not a reported data field; do not treat it as a new column when updating the dataset.
- Preserve the distinction between stocks measured at 30 June and annual flows. Use the June-quarter CPI factor for debt stocks and the financial-year-average CPI factor for cash, fiscal, and interest flows.
- Use the existing derived-value helpers (`getPercentOfGdp`, `getDollarBillions`, `getDollarPerCapita`, `getDebtChangeDollars`, `getNominalDebtChange`, `getDebtChangeOverGdp`, and `getDebtBurdenChange`) instead of duplicating formulas in renderers.
- Debt-stock change, debt growth, debt-burden change, budget balance, and interest are different measures. Do not label one as another or infer the Budget result from a change in debt stock.
- The documented 2002-03 PBO ratio correction and the 2012-13 political transition are deliberate source-audit decisions. Preserve them unless the source methodology is intentionally revised.
- When updating the embedded vintage, update the relevant data arrays, `cpiBase`, source metadata, visible definitions/update notes, and any date/range copy together. Keep source links and source IDs consistent with `sourceLink()`.

## UI and code conventions

- Keep the page framework-free and offline-capable. Do not add a dependency or fetch-based data path for a UI-only change.
- Dynamic HTML and SVG are assembled with template strings. Escape interpolated values with `esc()`; use `svgText()` for SVG text and preserve `rel="noopener"` on external links.
- Follow the existing render pipeline: change state in an event handler, then re-render the affected surface (or call `renderAll()` when multiple surfaces depend on it). Do not update one display while leaving the detail panel, table, tooltip, or CSV output stale.
- Adding or renaming a measure requires coordinated updates to `chartModes.debt`, selector labels/short labels, `measureExplanations`, `measureRowLayout`, `tooltipSeriesKeys`, keyboard shortcut mappings, chart notes, table/detail output, and CSV headers/rows as applicable.
- Keep `aria-pressed`, `aria-disabled`, live output, focus restoration, SVG point labels, and the chart `<desc>` synchronized with interaction changes. Existing keyboard shortcuts are part of the UI contract: `1`-`5` select lenses, `Tab`/`Shift+Tab` cycle lenses, `Q`-`T` and `A`-`G` toggle measures, `L` shares, `0` resets, Escape remains available for browser-native behavior, arrows select years, Control+arrows pan/zoom, Space moves the legend, and Control+Enter toggles full screen.
- Preserve the selected-year convention: debt and political office-holders refer to 30 June, while budget and interest values cover the financial year ending on that date.
- Keep the source/definition text close to the implementation when changing methodology. This page is designed to be auditable, so derived formulas, exceptions, units, and source vintage should remain visible in the Sources section.
