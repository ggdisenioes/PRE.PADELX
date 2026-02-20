import { expect, Page } from "@playwright/test";
import { getRoleCredentials, Role } from "./env";

export async function loginAsRole(page: Page, role: Role) {
  const credentials = getRoleCredentials(role);
  if (!credentials) {
    throw new Error(`Missing E2E credentials for role: ${role}`);
  }

  await page.goto("/login");
  await expect(page.getByTestId("login-email")).toBeVisible();
  await page.getByTestId("login-email").fill(credentials.email);
  await page.getByTestId("login-password").fill(credentials.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 30_000,
  });
  await expect(page).not.toHaveURL(/\/login/);
}
