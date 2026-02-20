import { expect, test } from "@playwright/test";
import { loginAsRole } from "./helpers/auth";
import { canRunRoleSuite } from "./helpers/env";
import { getRoleAccessToken } from "./helpers/token";

const fakeUserId = "00000000-0000-0000-0000-000000000001";

test("manager sees task center on dashboard", async ({ page }) => {
  test.skip(
    !canRunRoleSuite("manager"),
    "Missing manager credentials or Supabase env for authenticated tests"
  );

  await loginAsRole(page, "manager");
  await expect(page.getByTestId("task-center")).toBeVisible();
});

test("manager cannot delete users via API", async ({ request }) => {
  test.skip(
    !canRunRoleSuite("manager"),
    "Missing manager credentials or Supabase env for authenticated tests"
  );

  const managerToken = await getRoleAccessToken("manager");
  const response = await request.post("/api/admin/delete-user", {
    data: { user_id: fakeUserId },
    headers: {
      Authorization: `Bearer ${managerToken}`,
    },
  });

  expect(response.status()).toBe(403);
});

test("admin delete endpoint is not forbidden", async ({ request }) => {
  test.skip(
    !canRunRoleSuite("admin"),
    "Missing admin credentials or Supabase env for authenticated tests"
  );

  const adminToken = await getRoleAccessToken("admin");
  const response = await request.post("/api/admin/delete-user", {
    data: { user_id: fakeUserId },
    headers: {
      Authorization: `Bearer ${adminToken}`,
    },
  });

  expect(response.status()).not.toBe(401);
  expect(response.status()).not.toBe(403);
});

test("standard user does not see task center", async ({ page }) => {
  test.skip(
    !canRunRoleSuite("user"),
    "Missing user credentials or Supabase env for authenticated tests"
  );

  await loginAsRole(page, "user");
  await expect(page.getByTestId("task-center")).toHaveCount(0);
});
