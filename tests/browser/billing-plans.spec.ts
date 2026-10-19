import { test, expect } from "@playwright/test";

const fixture = "http://127.0.0.1:54329";

test("billing highlights the current plan until access ends", async ({
  page,
  request,
}, info) => {
  await request.post(`${fixture}/__test/reset`);
  await request.post(`${fixture}/__test/billing`, {
    data: { plan: "growth", cancelling: true },
  });
  await page.goto("/auth");
  await page.getByLabel("Email address").fill("pilot@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A clearer day." }),
  ).toBeVisible();
  await page.goto("/workspace/billing");
  const growth = page.getByRole("article", { name: "Growth", exact: true });
  await expect(growth).toHaveAttribute("aria-current", "true");
  await expect(growth).toHaveClass(/billing-plan-current/);
  await expect(
    growth.getByRole("button", { name: "Current plan", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Cancellation scheduled", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Access until", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage billing / cancellation" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${info.project.name}-billing-current-plan.png`,
    fullPage: true,
  });

  for (const state of [
    { status: "canceled" },
    { status: "active", periodEnd: "2020-01-01T00:00:00Z" },
  ]) {
    await request.post(`${fixture}/__test/billing`, { data: state });
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Current plan", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('[aria-current="true"]')).toHaveCount(0);
  }
});
