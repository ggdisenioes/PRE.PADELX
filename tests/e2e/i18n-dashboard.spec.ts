import { expect, test } from "@playwright/test";
import { loginAsRole } from "./helpers/auth";
import { canRunRoleSuite } from "./helpers/env";

test("dashboard task center translates between ES and EN", async ({ page }) => {
  test.skip(
    !canRunRoleSuite("manager"),
    "Missing manager credentials or Supabase env for authenticated tests"
  );

  await loginAsRole(page, "manager");

  await expect(page.getByText(/Centro de tareas/i)).toBeVisible();

  await page.locator('[data-testid="lang-en"]:visible').first().click();
  await expect(page.getByText(/Task Center/i)).toBeVisible();

  await page.locator('[data-testid="lang-es"]:visible').first().click();
  await expect(page.getByText(/Centro de tareas/i)).toBeVisible();
});
