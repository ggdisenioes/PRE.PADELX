import { expect, test } from "@playwright/test";

test("login page renders required controls", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByTestId("login-email")).toBeVisible();
  await expect(page.getByTestId("login-password")).toBeVisible();
  await expect(page.getByTestId("login-submit")).toBeVisible();
});

test("register page shows password requirements", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: /crear cuenta/i })).toBeVisible();
  await expect(page.getByText(/Al menos 8 caracteres/i)).toBeVisible();
  await expect(page.getByText(/Una letra mayúscula/i)).toBeVisible();
  await expect(page.getByText(/Una letra minúscula/i)).toBeVisible();
  await expect(page.getByText(/Un número/i)).toBeVisible();
  await expect(page.getByText(/Un símbolo/i)).toBeVisible();
});
