import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const migrationsDir = path.join(root, "supabase", "migrations");

if (!fs.existsSync(migrationsDir)) {
  console.error(`Missing migrations directory: ${migrationsDir}`);
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir, { withFileTypes: true })
  .filter((d) => d.isFile() && d.name.endsWith(".sql"))
  .map((d) => d.name)
  .sort();

if (files.length === 0) {
  console.error("No migration files found under supabase/migrations.");
  process.exit(1);
}

const versionPattern = /^(\d{14})_(.+)\.sql$/;
const versionToFiles = new Map();
const versionsInOrder = [];
let hasErrors = false;

for (const file of files) {
  const match = file.match(versionPattern);
  if (!match) {
    console.error(`Invalid migration filename format: ${file}`);
    hasErrors = true;
    continue;
  }

  const [, version, slug] = match;
  if (!slug || slug.trim().length === 0) {
    console.error(`Migration slug missing: ${file}`);
    hasErrors = true;
  }

  versionsInOrder.push(version);
  if (!versionToFiles.has(version)) versionToFiles.set(version, []);
  versionToFiles.get(version).push(file);
}

for (const [version, sameVersionFiles] of versionToFiles.entries()) {
  if (sameVersionFiles.length > 1) {
    console.error(
      `Duplicate migration version ${version}: ${sameVersionFiles.join(", ")}`
    );
    hasErrors = true;
  }
}

const sortedVersions = [...versionsInOrder].sort();
for (let i = 0; i < versionsInOrder.length; i += 1) {
  if (versionsInOrder[i] !== sortedVersions[i]) {
    console.error(
      `Migrations are not lexicographically ordered. Found ${versionsInOrder[i]} at position ${i + 1}, expected ${sortedVersions[i]}.`
    );
    hasErrors = true;
    break;
  }
}

if (hasErrors) {
  process.exit(1);
}

console.log(`OK: ${files.length} migration files validated (format, unique version, order).`);
