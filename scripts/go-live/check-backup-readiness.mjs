import { execSync } from "node:child_process";

const projectRef = process.env.SUPABASE_PROJECT_REF || "qfnqhpdvhbhpdgrxdnlu";

let raw = "";
try {
  raw = execSync(
    `supabase backups list --project-ref ${projectRef} --output json`,
    { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }
  );
} catch (error) {
  console.error("Failed to fetch backup status from Supabase CLI.");
  if (error?.stderr) {
    console.error(String(error.stderr));
  } else {
    console.error(String(error));
  }
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error("Unable to parse backup status JSON.");
  console.error(raw);
  process.exit(1);
}

const pitrEnabled = parsed?.pitr_enabled === true;
const backupsCount = Array.isArray(parsed?.backups) ? parsed.backups.length : 0;
const walgEnabled = parsed?.walg_enabled === true;

console.log(
  JSON.stringify(
    {
      project_ref: projectRef,
      pitr_enabled: pitrEnabled,
      walg_enabled: walgEnabled,
      backups_count: backupsCount,
      region: parsed?.region || null,
    },
    null,
    2
  )
);

if (!walgEnabled) {
  console.error("Backup readiness failed: WAL-G is disabled.");
  process.exit(1);
}

if (!pitrEnabled) {
  console.error("Backup readiness failed: PITR is disabled.");
  process.exit(1);
}

if (backupsCount === 0) {
  console.error("Backup readiness failed: no physical backups available.");
  process.exit(1);
}

console.log("OK: backup readiness checks passed.");
