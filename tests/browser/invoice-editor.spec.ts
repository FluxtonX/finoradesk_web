import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

const fixture = "http://127.0.0.1:54329";

test.beforeEach(async ({ request }) => {
  await request.post(`${fixture}/__test/reset`);
});

async function login(page: Page) {
  await page.goto("/auth");
  await page.getByLabel("Email address").fill("pilot@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer day." }),
  ).toBeVisible();
}

async function contacts(request: APIRequestContext, names: string[]) {
  await request.post(`${fixture}/__test/contacts`, { data: { names } });
}

test("search results are visible, searchable beyond the first page and keyboard selectable", async ({
  page,
  request,
}, info) => {
  await contacts(request, [
    ...Array.from(
      { length: 35 },
      (_, n) => `Customer ${String(n).padStart(2, "0")}`,
    ),
    "Zara Test Studio",
  ]);
  await login(page);
  await page.goto("/workspace/invoices/new");
  const customer = page.getByRole("combobox", {
    name: "Customer",
    exact: true,
  });
  await customer.click();
  await expect(
    page
      .getByRole("listbox", { name: "Customer", exact: true })
      .getByRole("option"),
  ).toHaveCount(30);
  await customer.fill("Zara");
  const result = page.getByRole("option", {
    name: "Zara Test Studio",
    exact: true,
  });
  await expect(result).toBeVisible();
  await expect(
    page
      .getByRole("listbox", { name: "Customer", exact: true })
      .getByRole("option"),
  ).toHaveCount(1);
  await expect(customer).toHaveAttribute("autocomplete", "off");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-invoice-customer-search.png`,
    fullPage: true,
  });
  await customer.press("Enter");
  await expect(customer).toHaveValue("Zara Test Studio");
  await expect(customer).toHaveAttribute("aria-expanded", "false");
  await expect(
    page.getByText("Zara Test Studio selected", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/invoices\/new$/);
  await page
    .getByRole("button", { name: "Clear customer", exact: true })
    .click();
  await customer.fill("No matching customer");
  await expect(page.getByText(/No customers match/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Save draft", exact: true }),
  ).toBeDisabled();
  await customer.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("invoice quantities, GST choices and issuing work without the optional review module", async ({
  page,
  request,
}, info) => {
  await contacts(request, ["Zara Test Studio"]);
  await request.post(`${fixture}/__test/invoice-setup`, {
    data: { missingReviews: true },
  });
  await login(page);
  await page.goto("/workspace/invoices/new");
  await page
    .getByRole("combobox", { name: "Customer", exact: true })
    .fill("Zara");
  await page
    .getByRole("option", { name: "Zara Test Studio", exact: true })
    .click();
  await page.getByLabel("Description 1").fill("Consulting");
  await page.getByLabel("Unit price", { exact: true }).fill("30.00");
  const quantity = page.getByRole("spinbutton", {
    name: "Quantity for line 1",
    exact: true,
  });
  await quantity.fill("1.25");
  await page
    .getByRole("button", { name: "Increase quantity for line 1", exact: true })
    .click();
  await expect(quantity).toHaveValue("2.25");
  await page
    .getByRole("button", { name: "Decrease quantity for line 1", exact: true })
    .click();
  await expect(quantity).toHaveValue("1.25");
  await quantity.press("ArrowDown");
  await expect(quantity).toHaveValue("0.25");
  await expect(
    page.getByRole("button", {
      name: "Decrease quantity for line 1",
      exact: true,
    }),
  ).toBeDisabled();
  await quantity.fill("2");
  const gst = page.getByRole("combobox", {
    name: "GST treatment",
    exact: true,
  });
  await gst.click();
  await expect(
    page.getByRole("option", { name: "GST inclusive", exact: true }),
  ).toBeVisible();
  await gst.press("ArrowDown");
  await gst.press("Enter");
  await expect(gst).toContainText("GST inclusive");
  await expect(page.getByText("$60.00", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add a line", exact: true }).click();
  await page.getByLabel("Description 2").fill("Setup fee");
  await page.getByLabel("Unit price", { exact: true }).nth(1).fill("50.00");
  await page
    .getByRole("combobox", { name: "GST treatment", exact: true })
    .nth(1)
    .click();
  await page.getByRole("option", { name: "GST free", exact: true }).click();
  await expect(page.getByText("$110.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$5.45", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-invoice-editor.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Draft invoice", exact: true }),
  ).toBeVisible();
  const draftUrl = page.url();
  await expect(
    page.getByRole("button", { name: "Request review", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: "Edit draft", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Customer", exact: true }),
  ).toHaveValue("Zara Test Studio");
  await page.goto(draftUrl);
  await page
    .getByRole("button", { name: "Issue invoice", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "INV-000001", exact: true }),
  ).toBeVisible();
  const setup = await (
    await request.get(`${fixture}/__test/invoice-setup`)
  ).json();
  expect(setup).toMatchObject({ webIssueCalls: 1, coreIssueCalls: 1 });
  const pdf = await page.request.get(
    (await page
      .getByRole("link", { name: "Download invoice PDF" })
      .getAttribute("href"))!,
  );
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
});

test("customer search reports an outage and retries without losing the draft", async ({
  page,
  request,
}) => {
  await contacts(request, ["Zara Test Studio"]);
  let fail = true;
  await page.route("**/rest/v1/contacts?**", async (route) => {
    if (fail) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ message: "Isolated contact outage" }),
      });
    } else await route.continue();
  });
  await login(page);
  await page.goto("/workspace/invoices/new");
  await page.getByLabel("Description 1").fill("Keep this draft");
  await page.getByRole("combobox", { name: "Customer", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not load customers" }),
  ).toBeVisible({ timeout: 15000 });
  fail = false;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page
    .getByRole("option", { name: "Zara Test Studio", exact: true })
    .click();
  await expect(page.getByLabel("Description 1")).toHaveValue("Keep this draft");
});

test("invoice search focus and status dropdown stay polished and submit the chosen filter", async ({
  page,
}, info) => {
  await login(page);
  await page.goto("/workspace/invoices");
  const search = page.getByRole("textbox", {
    name: "Search invoice or customer",
  });
  await search.focus();
  await expect(search).toHaveCSS("outline-style", "none");
  await expect(page.locator(".search-field")).not.toHaveCSS(
    "box-shadow",
    "none",
  );
  await expect(search).toHaveAttribute("autocomplete", "off");
  const status = page.getByRole("combobox", {
    name: "Filter by status",
    exact: true,
  });
  await status.click();
  await expect(
    page.getByRole("option", { name: "Draft", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: `test-results/${info.project.name}-invoice-status-dropdown.png`,
    fullPage: true,
  });
  await page.getByRole("option", { name: "Draft", exact: true }).click();
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/status=Draft/);
  await expect(status).toContainText("Draft");
  await status.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await status.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
});
