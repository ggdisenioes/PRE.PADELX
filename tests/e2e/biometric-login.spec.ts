import { expect, test } from "@playwright/test";
import { loginAsRole } from "./helpers/auth";
import { canRunRoleSuite } from "./helpers/env";

test("biometric login button is not shown on Twinco login", async ({ page }) => {
  await page.goto("/login");

  const passkeyButton = page.getByRole("button", { name: /biometr/i });
  await expect(passkeyButton).toHaveCount(0);
  await expect(page.getByTestId("login-submit")).toBeEnabled();
});

test("traditional login still works without biometric UI", async ({ page }) => {
  test.skip(
    !canRunRoleSuite("manager"),
    "Missing manager credentials or Supabase env for authenticated tests"
  );

  await page.goto("/login");
  await expect(page.getByRole("button", { name: /biometr/i })).toHaveCount(0);

  await loginAsRole(page, "manager");
  await expect(page).not.toHaveURL(/\/login/);
});
