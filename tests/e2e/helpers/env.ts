export type Role = "admin" | "manager" | "user";

export type RoleCredentials = {
  email: string;
  password: string;
};

const ROLE_ENV_KEYS: Record<Role, { email: string; password: string }> = {
  admin: {
    email: "E2E_ADMIN_EMAIL",
    password: "E2E_ADMIN_PASSWORD",
  },
  manager: {
    email: "E2E_MANAGER_EMAIL",
    password: "E2E_MANAGER_PASSWORD",
  },
  user: {
    email: "E2E_USER_EMAIL",
    password: "E2E_USER_PASSWORD",
  },
};

export function hasSupabaseAuthEnv() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}

export function getRoleCredentials(role: Role): RoleCredentials | null {
  const keys = ROLE_ENV_KEYS[role];
  const email = process.env[keys.email];
  const password = process.env[keys.password];
  if (!email || !password) return null;
  return { email, password };
}

export function canRunRoleSuite(role: Role) {
  return Boolean(hasSupabaseAuthEnv() && getRoleCredentials(role));
}
