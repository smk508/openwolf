import * as path from "node:path";
import * as fs from "node:fs";

export function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function getWolfDir(from?: string): string {
  const base = from ?? process.cwd();
  return path.join(base, ".wolf");
}

export function resolveWolfFile(file: string, from?: string): string {
  return path.join(getWolfDir(from), file);
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function relativeToCwd(filePath: string, cwd?: string): string {
  const base = cwd ?? process.cwd();
  const rel = path.relative(base, filePath);
  return normalizePath(rel);
}

// ─── Git Worktree Support ────────────────────────────────────────
// Mirrors the logic in src/hooks/shared.ts — keep both in sync.
// Hooks compile separately (tsconfig.hooks.json) and cannot import from here.

/**
 * Detect if a directory is a git worktree. If so, return the main repo root.
 * Uses pure filesystem reads (no git commands).
 */
export function resolveMainRepoRoot(from?: string): string | null {
  const projectDir = path.resolve(from ?? process.cwd());
  const gitPath = path.join(projectDir, ".git");

  try {
    const stat = fs.lstatSync(gitPath);
    if (stat.isDirectory()) return null;
    const content = fs.readFileSync(gitPath, "utf-8").trim();
    const match = content.match(/^gitdir:\s*(.+)$/);
    if (!match) return null;
    const gitdir = path.resolve(projectDir, match[1]);
    const commondirPath = path.join(gitdir, "commondir");
    const commondir = fs.readFileSync(commondirPath, "utf-8").trim();
    const mainGitDir = path.resolve(gitdir, commondir);
    return path.dirname(mainGitDir);
  } catch {
    return null;
  }
}

/**
 * Returns the shared .wolf/ directory for brain files.
 * In a worktree, this is the main repo's .wolf/. Otherwise, same as getWolfDir().
 */
export function getSharedWolfDir(from?: string): string {
  const projectDir = from ?? process.cwd();
  const mainRoot = resolveMainRepoRoot(projectDir);
  if (mainRoot) return path.join(mainRoot, ".wolf");
  return getWolfDir(projectDir);
}
