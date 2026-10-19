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

async function recover(page: Page, request: APIRequestContext) {
  await page.goto("/auth?mode=forgot");
  await page.getByLabel("Email address").fill("pilot@example.test");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If that email has an account")).toBeVisible();
  const { callback } = await (
    await request.get(`${fixture}/__test/recovery`)
  ).json();
  await page.goto(callback);
}

async function updatePassword(page: Page) {
  await page
    .getByLabel("Password", { exact: true })
    .fill("new-isolated-password");
  await page.getByLabel("Confirm password").fill("new-isolated-password");
  await page.getByRole("button", { name: "Update password" }).click();
}

test("password recovery verifies MFA before updating and returns to the reset form", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__test/auth`, { data: { assurance: "aal1" } });
  await recover(page, request);
  await expect(page).toHaveURL(
    /\/security\?challenge=1&next=\/auth\/password$/,
  );
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);

  const code = page.getByLabel("6-digit authenticator code");
  await code.fill("000000");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Invalid authenticator code" }),
  ).toBeVisible();
  expect(await (await request.get(`${fixture}/__test/auth`)).json()).toEqual({
    passwordUpdates: 0,
    passwordUpdateAttempts: 0,
  });

  await code.fill("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL(/\/auth\/password$/);
  await updatePassword(page);
  await expect(page).toHaveURL(/\/workspace$/);
  expect(await (await request.get(`${fixture}/__test/auth`)).json()).toEqual({
    passwordUpdates: 1,
    passwordUpdateAttempts: 1,
  });
});

test("password recovery without MFA updates directly", async ({
  page,
  request,
}) => {
  await request.post(`${fixture}/__test/auth`, {
    data: { assurance: "aal1", mfaEnabled: false },
  });
  await request.post(`${fixture}/__test/role`, { data: { role: "viewer" } });
  await recover(page, request);
  await expect(page).toHaveURL(/\/auth\/password$/);
  await updatePassword(page);
  await expect(page).toHaveURL(/\/workspace$/);
  expect(await (await request.get(`${fixture}/__test/auth`)).json()).toEqual({
    passwordUpdates: 1,
    passwordUpdateAttempts: 1,
  });
});

test("an already verified MFA session updates without another challenge", async ({
  page,
  request,
}) => {
  await page.goto("/auth?next=/auth/password");
  await page.getByLabel("Email address").fill("pilot@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/auth\/password$/);
  // Exercise a direct visit with an existing AAL2 session.
  await page.goto("/auth/password");
  await updatePassword(page);
  await expect(page).toHaveURL(/\/workspace$/);
  expect(
    (await (await request.get(`${fixture}/__test/auth`)).json())
      .passwordUpdates,
  ).toBe(1);
});

test("password form requires an authenticated session", async ({ page }) => {
  await page.goto("/auth/password");
  await expect(page).toHaveURL(/\/auth\?mode=signin$/);
  await expect(
    page.getByRole("button", { name: "Update password" }),
  ).toHaveCount(0);
});

test("MFA verification rejects an external return destination", async ({
  page,
}) => {
  const next = "/security?challenge=1&next=https://outside.example.test";
  await page.goto(`/auth?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Email address").fill("pilot@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("isolated-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByLabel("6-digit authenticator code").fill("123456");
  await page.getByRole("button", { name: "Verify and continue" }).click();
  await expect(page).toHaveURL("http://127.0.0.1:3100/workspace");
});
