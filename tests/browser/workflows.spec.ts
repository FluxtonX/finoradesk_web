import { test, expect, type Page } from "@playwright/test";
import { writeFile } from "node:fs/promises";
test.beforeEach(async ({ request }) => {
  await request.post("http://127.0.0.1:54329/__test/reset");
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
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
}
test("public entry and account forms render responsively", async ({
  page,
}, info) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Your business/ }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-landing.png`,
    fullPage: true,
  });
  await page.goto("/auth?mode=signup");
  await expect(page.getByLabel("Confirm password")).toBeVisible();
  await noOverflow(page);
  await page.goto("/auth?mode=forgot");
  await page.getByLabel("Email address").fill("pilot@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If that email has an account")).toBeVisible();
});
test("protects the workspace and reports invalid sign-in", async ({ page }) => {
  await page.goto("/workspace");
  await expect(page).toHaveURL(/\/auth/);
  await page.getByLabel("Email address").fill("pilot@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid login" }),
  ).toContainText("Invalid login");
});
test("empty workspace, navigation, reduced motion and calculator", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await login(page);
  await expect(page.getByText("Your next chapter starts here.")).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-empty-workspace.png`,
    fullPage: true,
  });
  await page.goto("/workspace/calculators");
  await page.getByLabel("Base amount AUD").fill("100");
  await expect(page.getByText("$110.00 total · $10.00 GST")).toBeVisible();
  await page.getByRole("button", { name: "Margin / markup" }).click();
  await page.getByLabel("Revenue AUD").fill("100");
  await page.getByLabel("Cost AUD").fill("60");
  await expect(page.getByText(/40% margin/)).toBeVisible();
  await noOverflow(page);
});
test("customer → draft → issue → PDF → partial payment", async ({
  page,
}, info) => {
  await login(page);
  await page.goto("/workspace/contacts/new");
  await page.getByLabel("Name", { exact: true }).fill("Pilot customer");
  await page.getByLabel("Email", { exact: true }).fill("customer@example.test");
  await page.getByRole("button", { name: "Save contact" }).click();
  await expect(page).toHaveURL(
    /\/workspace\/contacts\?kind=customer&saved=created$/,
  );
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Customer created successfully." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Pilot customer", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Add customer", exact: true }).click();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("");
  await page.goto("/workspace/invoices/new");
  await expect(
    page.getByRole("option", { name: "Pilot customer" }),
  ).toBeAttached();
  await page
    .getByLabel("Customer", { exact: true })
    .selectOption({ label: "Pilot customer" });
  await page.getByLabel("Description 1").fill("Consulting");
  await page.getByLabel("Unit price").fill("100.00");
  await expect(page.getByText("$110.00")).toBeVisible();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(
    page.getByRole("heading", { name: "Draft invoice", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Request review", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByText("Review requested for this saved version."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Issue invoice", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "INV-000001", exact: true }),
  ).toBeVisible();
  const pdf = await page.request.get(
    (await page
      .getByRole("link", { name: "Download invoice PDF" })
      .getAttribute("href")) ?? "",
  );
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 4).toString()).toBe("%PDF");
  await writeFile(
    `test-results/${info.project.name}-issued-invoice.pdf`,
    await pdf.body(),
  );
  await page.getByLabel("Amount AUD", { exact: true }).fill("40.00");
  await page
    .getByRole("button", { name: "Record payment", exact: true })
    .click();
  await expect(
    page.getByText("Payment recorded.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("$70.00", { exact: true }).first()).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: `test-results/${info.project.name}-invoice.png`,
    fullPage: true,
  });
});
test("expense, report and support use persisted acknowledgements", async ({
  page,
}) => {
  await login(page);
  await page.goto("/workspace/expenses/new");
  await page.getByLabel("What was the expense?").fill("Pilot software");
  await page.getByLabel("Amount AUD", { exact: true }).fill("20.00");
  await page.getByLabel("Payment status").selectOption("paid");
  await page.getByRole("button", { name: "Save expense" }).click();
  await expect(
    page.getByText("Pilot software", { exact: true }).first(),
  ).toBeVisible();
  await page.goto("/workspace/reports");
  await expect(page.getByText("$20.00", { exact: true }).first()).toBeVisible();
  await page.goto("/workspace/support");
  await page.getByLabel("What can we help with?").fill("Pilot question");
  await page
    .getByLabel("A little more detail")
    .fill("Please review this isolated request.");
  await page.getByRole("button", { name: "Create support request" }).click();
  await expect(
    page.getByRole("heading", { name: "Pilot question" }),
  ).toBeVisible();
  await expect(
    page.getByText("Please review this isolated request."),
  ).toBeVisible();
});
test("CSV preview validates before import and billing stays honest", async ({
  page,
}) => {
  await login(page);
  await page.goto("/workspace/transfer");
  await page.getByLabel("CSV file").setInputFiles({
    name: "contacts.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("name,email\nGood,good@example.test\nBad,invalid"),
  });
  await expect(
    page.getByText("1 valid · 0 repeated · 1 invalid"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm import" }),
  ).toBeDisabled();
  await page.goto("/workspace/billing");
  await expect(
    page.getByText("No payment will be taken", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Billing not connected" }),
  ).toHaveCount(3);
  await noOverflow(page);
});
test("viewer access is read-only", async ({ page, request }) => {
  await request.post("http://127.0.0.1:54329/__test/role", {
    data: { role: "viewer" },
  });
  await login(page);
  await page.goto("/workspace/invoices");
  await expect(
    page.getByRole("link", { name: "Create invoice", exact: true }),
  ).toHaveCount(0);
  await page.goto("/workspace/contacts");
  await expect(
    page.getByRole("link", { name: "Add customer", exact: true }),
  ).toHaveCount(0);
});

test("settings, receipt empty state, guide and mobile keyboard navigation", async ({
  page,
}, info) => {
  await login(page);
  for (const route of [
    "/workspace/settings",
    "/workspace/receipts",
    "/workspace/guide",
    "/workspace/activity",
    "/workspace/reviews",
    "/workspace/reports/advanced",
  ]) {
    await page.goto(route);
    await expect(page.locator("main h1")).toBeVisible();
    await noOverflow(page);
  }
  await page.goto("/security");
  await expect(page.getByLabel("6-digit authenticator code")).toBeVisible();
  await page.goto("/workspace");
  if (info.project.name === "mobile") {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Workspace navigation" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeFocused();
  }
});

test("failed report offers retry and recovers", async ({ page, request }) => {
  await login(page);
  await request.post("http://127.0.0.1:54329/__test/fail", {
    data: { enabled: true },
  });
  await page.goto("/workspace/reports");
  await expect(
    page.getByRole("heading", { name: "We couldn’t load this page." }),
  ).toBeVisible();
  await request.post("http://127.0.0.1:54329/__test/fail", {
    data: { enabled: false },
  });
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "The bigger picture, made clear." }),
  ).toBeVisible();
});

test("provider and worker endpoints reject unauthenticated calls", async ({
  request,
}) => {
  expect(
    (await request.post("/api/jobs/invoice-delivery", { data: {} })).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/email/webhook", { data: {} })).status(),
  ).toBe(401);
  expect(
    (await request.post("/api/billing/webhook", { data: {} })).status(),
  ).toBe(503);
});

test("private receipt upload and authorised preview", async ({ page }) => {
  await login(page);
  await page.goto("/workspace/receipts");
  await page.getByLabel("Choose receipt file").setInputFiles({
    name: "pilot-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aB7sAAAAASUVORK5CYII=",
      "base64",
    ),
  });
  await page
    .getByRole("button", { name: "Upload receipt", exact: true })
    .click();
  await expect(page.getByText("Receipt saved privately.")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "pilot-receipt.png" }),
  ).toBeVisible();
  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Preview", exact: true }).click();
  const preview = await opened;
  await expect(preview).toHaveURL(/\/storage\/v1\/object\/sign\/receipts\//);
  await preview.close();
});
