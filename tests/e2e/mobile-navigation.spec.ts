import { devices, expect, test } from "@playwright/test";
import { loginAsRole } from "./helpers/auth";
import { canRunRoleSuite } from "./helpers/env";

test.use({
  ...devices["Pixel 7"],
});

test("mobile menu navigation keeps session for manager", async ({ page }) => {
  test.skip(
    !canRunRoleSuite("manager"),
    "Missing manager credentials or Supabase env for authenticated tests"
  );

  await loginAsRole(page, "manager");
  await expect(page).not.toHaveURL(/\/login/);

  await page.getByTestId("mobile-menu-toggle").click();
  await expect(
    page.getByRole("button", { name: /cerrar sesión|sign out|logout/i })
  ).toBeVisible();

  await page.locator('a[href="/tournaments"]').first().click();
  await page.waitForURL(/\/tournaments/);
  await expect(page).not.toHaveURL(/\/login/);

  await page.getByTestId("mobile-menu-toggle").click();
  await page.locator('a[href="/matches"]').first().click();
  await page.waitForURL(/\/matches/);
  await expect(page).not.toHaveURL(/\/login/);
});
