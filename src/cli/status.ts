import * as fs from "node:fs";
import * as path from "node:path";
import { findProjectRoot } from "../scanner/project-root.js";
import { readJSON, readText } from "../utils/fs-safe.js";
import { resolveMainRepoRoot } from "../utils/paths.js";

// Shared brain files live in the main repo's .wolf/ when in a worktree
const SHARED_FILES = new Set([
  "OPENWOLF.md", "identity.md", "cerebrum.md", "config.json",
  "token-ledger.json", "buglog.json", "cron-manifest.json", "cron-state.json",
  "designqc-report.json", "suggestions.json", "reframe-frameworks.md",
]);

// Local files stay per-worktree
const LOCAL_FILES = new Set(["memory.md", "anatomy.md"]);

export async function statusCommand(): Promise<void> {
  const projectRoot = findProjectRoot();
  const wolfDir = path.join(projectRoot, ".wolf");

  if (!fs.existsSync(wolfDir)) {
    console.log("OpenWolf not initialized. Run: openwolf init");
    return;
  }

  // Detect worktree
  const mainRepoRoot = resolveMainRepoRoot(projectRoot);
  const isWorktree = mainRepoRoot !== null;
  const sharedWolfDir = isWorktree ? path.join(mainRepoRoot, ".wolf") : wolfDir;

  console.log("OpenWolf Status");
  console.log("===============\n");

  if (isWorktree) {
    console.log(`  Worktree: yes`);
    console.log(`  Shared brain: ${sharedWolfDir}`);
    console.log(`  Local .wolf/: ${wolfDir}`);
    console.log("");
  }

  // File integrity check — shared files checked in shared dir, local in local dir
  const requiredFiles = [
    "OPENWOLF.md", "identity.md", "cerebrum.md", "memory.md",
    "anatomy.md", "config.json", "token-ledger.json", "buglog.json",
    "cron-manifest.json", "cron-state.json",
  ];

  let missingCount = 0;
  for (const file of requiredFiles) {
    const dir = SHARED_FILES.has(file) ? sharedWolfDir : wolfDir;
    const exists = fs.existsSync(path.join(dir, file));
    if (!exists) {
      const loc = isWorktree && SHARED_FILES.has(file) ? " (shared)" : "";
      console.log(`  ✗ Missing: .wolf/${file}${loc}`);
      missingCount++;
    }
  }
  if (missingCount === 0) {
    console.log(`  ✓ All ${requiredFiles.length} core files present`);
  }

  // Hook scripts check (always local)
  const hookFiles = [
    "session-start.js", "pre-read.js", "pre-write.js",
    "post-read.js", "post-write.js", "stop.js", "shared.js",
  ];
  const hooksDir = path.join(wolfDir, "hooks");
  let hooksMissing = 0;
  for (const file of hookFiles) {
    if (!fs.existsSync(path.join(hooksDir, file))) hooksMissing++;
  }
  if (hooksMissing === 0) {
    console.log(`  ✓ All ${hookFiles.length} hook scripts present`);
  } else {
    console.log(`  ✗ Missing ${hooksMissing} hook scripts`);
  }

  // Claude settings check
  const settingsPath = path.join(projectRoot, ".claude", "settings.json");
  if (fs.existsSync(settingsPath)) {
    const settings = readJSON<Record<string, unknown>>(settingsPath, {});
    const hooks = settings.hooks as Record<string, unknown[]> | undefined;
    if (hooks) {
      const hookCount = Object.values(hooks).reduce((sum, arr) => sum + arr.length, 0);
      console.log(`  ✓ Claude Code hooks registered (${hookCount} matchers)`);
    }
  } else {
    console.log("  ✗ .claude/settings.json not found");
  }

  // Token ledger stats (shared brain file)
  const ledger = readJSON<{
    lifetime: {
      total_sessions: number;
      total_reads: number;
      total_writes: number;
      total_tokens_estimated: number;
      estimated_savings_vs_bare_cli: number;
    };
  }>(path.join(sharedWolfDir, "token-ledger.json"), {
    lifetime: { total_sessions: 0, total_reads: 0, total_writes: 0, total_tokens_estimated: 0, estimated_savings_vs_bare_cli: 0 },
  });

  console.log(`\nToken Stats:`);
  console.log(`  Sessions: ${ledger.lifetime.total_sessions}`);
  console.log(`  Total reads: ${ledger.lifetime.total_reads}`);
  console.log(`  Total writes: ${ledger.lifetime.total_writes}`);
  console.log(`  Tokens tracked: ~${ledger.lifetime.total_tokens_estimated.toLocaleString()}`);
  console.log(`  Estimated savings: ~${ledger.lifetime.estimated_savings_vs_bare_cli.toLocaleString()} tokens`);

  // Anatomy stats (local file)
  const anatomyContent = readText(path.join(wolfDir, "anatomy.md"));
  const entryCount = (anatomyContent.match(/^- `/gm) || []).length;
  console.log(`\nAnatomy: ${entryCount} files tracked`);

  // Cron state (shared brain file)
  const cronState = readJSON<{ engine_status: string; last_heartbeat: string | null }>(
    path.join(sharedWolfDir, "cron-state.json"),
    { engine_status: "unknown", last_heartbeat: null }
  );
  console.log(`\nDaemon: ${cronState.engine_status}`);
  if (cronState.last_heartbeat) {
    const elapsed = Date.now() - new Date(cronState.last_heartbeat).getTime();
    const mins = Math.floor(elapsed / 60000);
    console.log(`  Last heartbeat: ${mins} minutes ago`);
  }

  console.log("");
}
