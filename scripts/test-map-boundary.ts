// Package-boundary test — the portable map package must not import application code.
//   npm run test:map-boundary
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

const PKG = join(process.cwd(), "packages/geospatial-map/src");
const FORBIDDEN = [
  /from\s+["']@\//,                 // the app "@/*" alias
  /from\s+["'][^"']*\/src\/app\//,
  /from\s+["'][^"']*\/src\/features\//,
  /from\s+["'][^"']*\/src\/lib\/discovery\//,
  /lead(s)?-module|customer|sales[-_ ]?pro|netsuite|tw-map-data|run-draft|chain-registry|target-profile/i,
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; }).filter((p) => /\.tsx?$/.test(p));
}

let fails = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("  ✗", m); fails++; } else console.log("  ✓", m); };

console.log("Package-boundary checks (packages/geospatial-map):");
const files = walk(PKG);
assert(files.length >= 12, `package has source files (${files.length})`);

for (const f of files) {
  const src = readFileSync(f, "utf8");
  const importLines = src.split("\n").filter((l) => /^\s*import\b|require\(/.test(l));
  for (const line of importLines) {
    for (const bad of FORBIDDEN) {
      if (bad.test(line)) { console.error(`  ✗ ${f.replace(PKG, "")} imports application code: ${line.trim()}`); fails++; }
    }
  }
}
assert(fails === 0, "no package file imports src/app, src/features, discovery, lead/customer/SalesPro/NetSuite code");

// Allowed dependencies only (react / pmtiles / relative / node built-ins for nothing runtime-app).
const allowedBare = new Set(["react", "react-dom", "pmtiles"]);
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/from\s+["']([^".'][^"']*)["']/g)) {
    const spec = m[1];
    if (spec.startsWith(".")) continue;
    const bare = spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");
    if (!allowedBare.has(bare)) { console.error(`  ✗ ${f.replace(PKG, "")} imports non-peer dependency: ${spec}`); fails++; }
  }
}
assert(fails === 0, "package only imports its declared peer deps (react, react-dom, pmtiles) + relative modules");

console.log(fails === 0 ? "\nPackage boundary is clean ✓" : `\n${fails} boundary violation(s)`);
process.exit(fails === 0 ? 0 : 1);
