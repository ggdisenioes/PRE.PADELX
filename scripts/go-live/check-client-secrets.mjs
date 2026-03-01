import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const appDir = path.join(root, "app");
const exts = new Set([".ts", ".tsx", ".js", ".jsx"]);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (exts.has(path.extname(entry.name))) out.push(full);
  }
  return out;
}

if (!fs.existsSync(appDir)) {
  console.error("Missing app directory.");
  process.exit(1);
}

const files = walk(appDir);
const violations = [];

for (const file of files) {
  const content = fs.readFileSync(file, "utf8");
  const isClient = /^\s*["']use client["'];/m.test(content);
  if (!isClient) continue;

  if (content.includes("SUPABASE_SERVICE_ROLE_KEY")) {
    violations.push(`${path.relative(root, file)} uses SUPABASE_SERVICE_ROLE_KEY in client code`);
  }
}

if (violations.length > 0) {
  console.error("Client secret exposure check failed:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("OK: no SUPABASE_SERVICE_ROLE_KEY references found in client components.");
