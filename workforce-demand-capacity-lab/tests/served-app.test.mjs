import { expect, test } from "@playwright/test";

async function load(page, viewport = { width: 1440, height: 1000 }) {
  await page.setViewportSize(viewport);
  await page.goto("./");
}

function monthlyRow(page, month) {
  return page.locator("#operating-rows tr").filter({ hasText: month });
}

async function selectConservative(page) {
  await page.getByRole("tab", { name: "Conservative plan" }).click();
}

async function selectContractPreview(page) {
  await selectConservative(page);
  await page.locator("#tradeoff-contract").check();
}

test("1. Conservative Plan memo is not feasible", async ({ page }) => {
  await load(page);
  await selectConservative(page);
  await expect(page.locator("#memo-headline")).not.toContainText("Plan is feasible");
  await expect(page.locator("#memo-summary")).not.toContainText("Plan is feasible");
});

test("2. Conservative Plan badge is IMPOSSIBLE", async ({ page }) => {
  await load(page);
  await selectConservative(page);
  await expect(page.locator("#memo-status")).toHaveText("IMPOSSIBLE");
  await expect(monthlyRow(page, "Jan")).toContainText("impossible");
  await expect(monthlyRow(page, "Feb")).toContainText("impossible");
});

test("3. Contract preview adds exactly 5 capacity units in January", async ({ page }) => {
  await load(page);
  await selectConservative(page);
  const before = await page.evaluate(() => window.__capacityLab.model.rows.find((row) => row.month === "Jan").capacity);
  await page.locator("#tradeoff-contract").check();
  const after = await page.evaluate(() => window.__capacityLab.model.rows.find((row) => row.month === "Jan").capacity);
  expect(after - before).toBe(5);
  await expect(monthlyRow(page, "Jan").locator("td").nth(2)).toHaveText(`${before} → ${after}`);
});

test("4. Contract preview adds exactly 5 capacity units in February", async ({ page }) => {
  await load(page);
  await selectConservative(page);
  const before = await page.evaluate(() => window.__capacityLab.model.rows.find((row) => row.month === "Feb").capacity);
  await page.locator("#tradeoff-contract").check();
  const after = await page.evaluate(() => window.__capacityLab.model.rows.find((row) => row.month === "Feb").capacity);
  expect(after - before).toBe(5);
  await expect(monthlyRow(page, "Feb").locator("td").nth(2)).toHaveText(`${before} → ${after}`);
});

test("5. Contract preview leaves September through December unchanged", async ({ page }) => {
  await load(page);
  await selectContractPreview(page);
  const unchanged = await page.evaluate(() => window.__capacityLab.model.rows.slice(0, 4).every((row, index) => row.capacity === window.__capacityLab.baselineModel.rows[index].capacity));
  expect(unchanged).toBe(true);
  for (const month of ["Sep", "Oct", "Nov", "Dec"]) {
    await expect(monthlyRow(page, month).locator("td").nth(2)).not.toContainText("→");
  }
});

test("6. Contract preview adds SVG preview polylines", async ({ page }) => {
  await load(page);
  await expect(page.locator("#capacity-chart polyline")).toHaveCount(2);
  await selectContractPreview(page);
  expect(await page.locator("#capacity-chart polyline").count()).toBeGreaterThan(2);
});

test("7. KPIs, table, memo, and chart use the same preview scenario", async ({ page }) => {
  await load(page);
  await selectContractPreview(page);
  const state = await page.evaluate(() => ({
    baselineCapacity: window.__capacityLab.baselineModel.totalCapacity,
    previewCapacity: window.__capacityLab.model.totalCapacity,
    status: window.__capacityLab.model.status,
  }));
  await expect(page.locator("#metric-capacity")).toHaveText(`${state.baselineCapacity} → ${state.previewCapacity}`);
  await expect(page.locator("#total-capacity")).toHaveText(`${state.baselineCapacity} → ${state.previewCapacity}`);
  await expect(page.locator("#memo-status")).toHaveText(state.status.replace("-", " ").toUpperCase());
  await expect(page.locator("#memo-summary")).toContainText(`${state.baselineCapacity} → ${state.previewCapacity} capacity`);
  await expect(page.locator("#chart-description")).toContainText("Preview demand and preview capacity are displayed");
  await expect(monthlyRow(page, "Jan").locator("td").nth(2)).toContainText("→");
});

test("8. Clear Preview restores the exact Conservative baseline", async ({ page }) => {
  await load(page);
  await selectConservative(page);
  const baseline = await page.evaluate(() => ({
    model: JSON.stringify(window.__capacityLab.model),
    metrics: document.querySelector(".metric-rail").innerText,
    table: document.querySelector(".operating-table-region").innerText,
    memo: document.querySelector(".memo-region").innerText,
  }));
  await page.locator("#tradeoff-contract").check();
  await page.locator("#clear-preview").click();
  const restored = await page.evaluate(() => ({
    model: JSON.stringify(window.__capacityLab.model),
    metrics: document.querySelector(".metric-rail").innerText,
    table: document.querySelector(".operating-table-region").innerText,
    memo: document.querySelector(".memo-region").innerText,
  }));
  expect(restored).toEqual(baseline);
  await expect(page.locator("#capacity-chart polyline")).toHaveCount(2);
});

test("9. At 390px, six month cards plus one aggregate render and table hides", async ({ page }) => {
  await load(page, { width: 390, height: 844 });
  await expect(page.locator("#mobile-operating-cards .month-card:not(.aggregate-card)")).toHaveCount(6);
  await expect(page.locator("#mobile-operating-cards .aggregate-card")).toHaveCount(1);
  for (const card of await page.locator("#mobile-operating-cards .month-card:not(.aggregate-card)").all()) {
    for (const label of ["Status", "Demand", "Capacity", "Gap", "Utilization"]) {
      if (label === "Status") await expect(card.locator(".status-cell")).not.toBeEmpty();
      else await expect(card.getByText(label, { exact: true })).toBeVisible();
    }
  }
  await expect(page.locator(".table-scroll")).toHaveCSS("display", "none");
  await expect(page.locator("#mobile-operating-cards")).not.toHaveCSS("display", "none");
});

test("10. At 1440px, table shows and mobile cards hide", async ({ page }) => {
  await load(page, { width: 1440, height: 1000 });
  await expect(page.locator(".table-scroll")).not.toHaveCSS("display", "none");
  await expect(page.locator("#mobile-operating-cards")).toHaveCSS("display", "none");
});

test("11. Preview legend is hidden at baseline and visible only in preview", async ({ page }) => {
  await load(page);
  await expect(page.locator("#legend-preview-demand")).toHaveCSS("display", "none");
  await expect(page.locator("#legend-preview-capacity")).toHaveCSS("display", "none");
  await page.locator("#tradeoff-contract").check();
  await expect(page.locator("#legend-preview-demand")).not.toHaveCSS("display", "none");
  await expect(page.locator("#legend-preview-capacity")).not.toHaveCSS("display", "none");
});

test("12. Controls meet 44px hit targets and console has no errors", async ({ page }) => {
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await load(page);
  await selectContractPreview(page);
  const undersized = await page.locator("button:visible, input[type='range'], select, .tradeoff-option").evaluateAll((controls) => controls
    .map((control) => ({ label: control.id || control.textContent.trim().replace(/\s+/g, " ").slice(0, 60), height: control.getBoundingClientRect().height }))
    .filter((control) => control.height < 44));
  expect(undersized).toEqual([]);
  expect(errors).toEqual([]);
});

test("13. Methodology and back links stay inside the deployed portfolio route", async ({ page }) => {
  await load(page);
  await page.getByRole("link", { name: "Read the model methodology" }).click();
  await expect(page).toHaveURL(/\/workforce-demand-capacity-lab\/docs\/model-methodology\.html$/);
  await page.getByRole("link", { name: "Back to model" }).first().click();
  await expect(page).toHaveURL(/\/workforce-demand-capacity-lab\/$/);
});
