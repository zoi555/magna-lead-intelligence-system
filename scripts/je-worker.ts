// Locally-runnable Just Eat worker (Stage 1).
//   npm run je:worker            # drain all currently queued executions, then exit
//   npm run je:worker -- --watch # keep polling for new executions
//
// SERVER-SIDE. Uses the Supabase service role (bypasses RLS) — never ship this to the
// browser. Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL and
// JUST_EAT_ENABLED=true in .env.local.

import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { SupabaseRepository } from "../src/lib/discovery-engine/repository/supabase";
import { runWorkerOnce } from "../src/lib/discovery-engine/worker/loop";
import { hasServiceCredentials } from "../src/lib/discovery-engine/supabase-client";

async function loadDotEnv() {
  for (const f of [".env.local", ".env"]) {
    try {
      const txt = await fs.readFile(path.resolve(process.cwd(), f), "utf8");
      for (const line of txt.split(/\r?\n/)) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch { /* absent — fine */ }
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await loadDotEnv();
  const watch = process.argv.includes("--watch");
  const workerId = `worker-${randomUUID().slice(0, 8)}`;

  if (!hasServiceCredentials()) {
    console.error("Missing Supabase service credentials. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
    process.exit(1);
  }
  if (String(process.env.JUST_EAT_ENABLED ?? "").toLowerCase() !== "true") {
    console.error("JUST_EAT_ENABLED is not 'true'. Set it in .env.local to run live discovery.");
    process.exit(1);
  }

  const repo = new SupabaseRepository();
  console.log(`[${workerId}] Just Eat worker started${watch ? " (watch mode)" : ""}.`);

  do {
    const results = await runWorkerOnce(repo, { workerId, leaseSeconds: 60, onLog: (m) => console.log(`[${workerId}] ${m}`) });
    if (!results.length && !watch) { console.log(`[${workerId}] No queued executions. Exiting.`); break; }
    if (watch) await sleep(5000);
  } while (watch);
}

main().catch((e) => { console.error(e); process.exit(1); });
