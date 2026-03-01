const coreRequired = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
];

const roleRequired = [
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_MANAGER_EMAIL",
  "E2E_MANAGER_PASSWORD",
  "E2E_USER_EMAIL",
  "E2E_USER_PASSWORD",
];

const mode = process.env.E2E_ENV_MODE === "smoke" ? "smoke" : "strict";

function getMissing(keys) {
  return keys.filter((key) => {
    const value = process.env[key];
    return !value || String(value).trim().length === 0;
  });
}

const missingCore = getMissing(coreRequired);
const missingRole = getMissing(roleRequired);
const roleReady = missingRole.length === 0;

if (missingCore.length > 0) {
  console.error("Missing required core E2E environment variables:");
  for (const key of missingCore) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

if (mode === "strict" && !roleReady) {
  console.error("Missing required role E2E environment variables:");
  for (const key of missingRole) {
    console.error(`- ${key}`);
  }
  process.exit(1);
}

if (mode === "smoke" && !roleReady) {
  console.warn(
    "Role E2E credentials are missing. CI will run public smoke tests only."
  );
  for (const key of missingRole) {
    console.warn(`- ${key}`);
  }
}

console.log(`E2E_ENV_MODE=${mode}`);
console.log(`E2E_ROLE_CREDENTIALS_READY=${roleReady ? "true" : "false"}`);
console.log("OK: E2E environment validation passed.");
