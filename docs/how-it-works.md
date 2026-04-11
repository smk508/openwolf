# How It Works

OpenWolf operates as invisible middleware between you and Claude Code. It has three layers: the `.wolf/` directory (state), hooks (enforcement), and optional features (Design QC, Reframe, daemon).

## The `.wolf/` Directory

Every OpenWolf project has a `.wolf/` folder containing:

| File | Purpose | Worktree |
|------|---------|----------|
| `OPENWOLF.md` | Master instructions Claude follows every turn | Shared |
| `anatomy.md` | File index with descriptions and token estimates | Local |
| `cerebrum.md` | Learned preferences, conventions, and Do-Not-Repeat list | Shared |
| `memory.md` | Chronological action log (append-only per session) | Local |
| `identity.md` | Project name, AI role, constraints | Shared |
| `config.json` | OpenWolf configuration | Shared |
| `token-ledger.json` | Lifetime token usage statistics | Shared |
| `buglog.json` | Bug encounter/resolution memory | Shared |
| `cron-manifest.json` | Scheduled task definitions | Shared |
| `cron-state.json` | Cron execution state and dead letter queue | Shared |
| `suggestions.json` | AI-generated project improvement suggestions | Shared |
| `designqc-report.json` | Design QC capture metadata and results | Shared |
| `reframe-frameworks.md` | UI framework knowledge base for Reframe | Shared |

**Markdown is source of truth** for human-readable state. JSON is for machine-readable state only.

The **Worktree** column indicates where the file lives when running in a git worktree. "Shared" files live in the main repo's `.wolf/` and persist across worktrees. "Local" files live in each worktree's own `.wolf/`. In a normal repo, all files are in the same `.wolf/` directory. See [Git Worktree Support](#git-worktree-support) below for details.

## Hooks -- The Enforcement Layer

OpenWolf registers 6 hooks with Claude Code via `.claude/settings.json`. These fire automatically:

```
SessionStart ──→ session-start.js    Creates session tracker, logs to memory
PreToolUse   ──→ pre-read.js         Warns on repeated reads, shows anatomy info
PreToolUse   ──→ pre-write.js        Checks cerebrum Do-Not-Repeat patterns
PostToolUse  ──→ post-read.js        Estimates and records token usage
PostToolUse  ──→ post-write.js       Updates anatomy.md, appends to memory.md
Stop         ──→ stop.js             Writes session summary to token-ledger
```

**Key design decisions:**

- Hooks are **pure Node.js file I/O**. No network calls, no AI, no dependencies beyond Node stdlib
- Hooks **warn but never block**. A pre-read warning about a repeated read still allows the read
- Each hook has a **timeout** (5-10 seconds). They must be fast
- Atomic writes (write to `.tmp`, rename) prevent corruption

## The Anatomy System

`anatomy.md` is a structured index of every file in your project:

```markdown
## src/

- `index.ts` -- Main entry point. startServer() (~380 tok)
- `server.ts` -- Express HTTP server configuration (~520 tok)
```

When Claude wants to read a file, the pre-read hook tells it:
> "anatomy.md says `server.ts` is 'Express HTTP server configuration' at ~520 tokens"

If that description is enough, Claude can skip the full read. This is how OpenWolf saves tokens.

The anatomy is:
- **Generated** by `openwolf scan` or `openwolf init`
- **Updated incrementally** by the post-write hook whenever a file is created or edited
- **Rescanned** every 6 hours by the daemon cron

## The Cerebrum -- Learning Memory

`cerebrum.md` has four sections:

- **User Preferences** -- how you like things done (code style, tools, patterns)
- **Key Learnings** -- project-specific conventions discovered during development
- **Do-Not-Repeat** -- mistakes that must not recur, with dates
- **Decision Log** -- significant technical decisions with rationale

When you correct Claude or express a preference, it updates the cerebrum. The pre-write hook then enforces Do-Not-Repeat rules on every subsequent write.

The cerebrum is populated with your project's name and description during `openwolf init`, and is automatically reviewed and cleaned by the weekly AI reflection task.

## Design QC

Design QC is a capture-only tool. It takes screenshots; Claude does the evaluation.

### How it works

1. **Dev server detection** -- `openwolf designqc` checks common ports (3000, 5173, 4321, 8080) for a running dev server. If none is found, it starts one automatically using `npm run dev`, `pnpm dev`, or whatever start script your project defines.

2. **Route detection** -- OpenWolf scans your project for route files (Next.js `app/` routes, file-based routers, etc.) and builds a list of pages to capture. You can also specify routes manually with `--routes`.

3. **Sectioned screenshots** -- Each page is captured as full-page sectioned images at desktop (1440x900) and mobile (375x812) viewports. Pages are split into viewport-height sections rather than one giant screenshot. This produces images that fit within Claude's vision token budget.

4. **Output** -- Screenshots are saved to `.wolf/designqc-captures/`. A report is written to `.wolf/designqc-report.json` with metadata (routes, viewports, file sizes, estimated token cost).

5. **Evaluation** -- You ask Claude to read the screenshots and evaluate the design. Claude uses its vision capabilities to assess layout, spacing, typography, color, responsiveness, and overall design quality. The evaluation happens inline in your conversation -- no external service needed.

### Requirements

- `puppeteer-core` must be installed (`npm install -g puppeteer-core`)
- Chrome, Chromium, or Edge must be installed (OpenWolf auto-detects the path)
- A dev server that serves your UI (auto-started if not running)

### Architecture choice

Design QC deliberately does not call Claude itself. The capture step is deterministic and free. The evaluation step uses your existing Claude conversation context, so you can ask follow-up questions, request specific fixes, and iterate without switching tools.

## Reframe

Reframe helps you choose a UI component framework. It is not a CLI command -- it is a knowledge file that Claude reads when you ask about framework selection.

### How it works

1. **Knowledge file** -- `.wolf/reframe-frameworks.md` contains a structured comparison of 12 UI component frameworks: shadcn/ui, Aceternity UI, Magic UI, DaisyUI, HeroUI, Chakra UI, Flowbite, Preline UI, Park UI, Origin UI, Headless UI, and Cult UI.

2. **Decision tree** -- When you ask Claude to help pick a framework, it reads the knowledge file and asks targeted questions: What is your current stack? What is your priority (animations, speed, control, accessibility, enterprise)? Do you use Tailwind? What pages are you building?

3. **Comparison matrix** -- The file includes a feature matrix covering styling approach, animation capabilities, setup complexity, best use case, and cost for each framework.

4. **Migration prompts** -- Once a framework is selected, the file provides ready-made prompts tailored to that framework. Claude adapts these to your actual project structure using `anatomy.md`.

### Why a knowledge file?

Framework selection is a conversation, not a command. Different projects have different constraints, and the best framework depends on context that only emerges through questions. A knowledge file lets Claude have that conversation naturally while drawing on structured, up-to-date comparison data.

## The Daemon

An optional background process that handles:

- **Cron tasks** -- anatomy rescans, memory consolidation, token audits, AI reflections
- **File watching** -- broadcasts `.wolf/` changes to the dashboard via WebSocket
- **Dashboard server** -- serves the web dashboard at `http://localhost:18791`
- **Health monitoring** -- heartbeat tracking, dead letter queue management

### Starting the daemon

There are two ways to run the daemon:

1. **`openwolf dashboard`** -- starts the daemon automatically via `fork()`. No extra tools needed. The daemon runs as long as the parent process lives.

2. **`openwolf daemon start`** -- starts via [PM2](https://pm2.keymetrics.io/) for persistent operation. Survives terminal closures and can auto-start on boot.

The daemon is optional. OpenWolf works without it -- hooks are the primary layer. The daemon adds scheduled maintenance and the live dashboard.

### AI tasks and credentials

The daemon's AI tasks (`cerebrum-reflection` and `project-suggestions`) use `claude -p` to invoke the Claude CLI. These use your **Claude subscription credentials** from `~/.claude/.credentials.json` -- not API credits.

If `ANTHROPIC_API_KEY` is set in your environment, OpenWolf automatically strips it when spawning `claude -p` to ensure the subscription OAuth token is used instead.

## Git Worktree Support

OpenWolf works with git worktrees out of the box. This is essential for tools like [Conductor](https://conductor.app) that run multiple Claude agents in parallel, each in its own worktree.

### The problem

Without worktree support, each worktree gets its own isolated `.wolf/` directory. Learnings, bug fixes, and metrics are lost when the worktree is cleaned up, and there is no cross-pollination between concurrent agent sessions.

### Two-tier `.wolf/` directory

When OpenWolf detects that it is running inside a git worktree, it splits `.wolf/` into two tiers:

**Shared brain** (stored in the main repo's `.wolf/`):
| File | Why shared |
|------|-----------|
| `cerebrum.md` | Learnings and preferences apply to the whole project |
| `buglog.json` | Bug fixes are relevant across all branches |
| `token-ledger.json` | Lifetime metrics should accumulate, not fragment |
| `identity.md` | Agent identity is project-wide |
| `config.json` | Configuration applies globally |
| `OPENWOLF.md` | Protocol is the same everywhere |

**Local workspace** (stored in the worktree's `.wolf/`):
| File | Why local |
|------|----------|
| `anatomy.md` | Reflects the branch's file structure, which may differ |
| `memory.md` | Session action log -- concurrent writes from multiple agents would conflict |
| `hooks/_session.json` | Current session state is ephemeral |
| `hooks/*.js` | Hook scripts need to exist locally for Claude Code to run them |

### How worktree detection works

OpenWolf detects worktrees using pure filesystem reads (no git commands, so hooks stay fast):

1. Checks if `.git` is a **file** (worktrees) rather than a **directory** (normal repos)
2. Parses the `gitdir:` pointer from the `.git` file
3. Reads the `commondir` file inside that gitdir to find the main repo's `.git` directory
4. Resolves the parent directory as the main repo root

This detection is cached per process -- hooks only pay the cost once per invocation.

### When not in a worktree

Everything works exactly as before. The shared and local `.wolf/` directories are the same path, so there is no behavior change for normal repos.

## Token Tracking

Every file read/write is estimated using character-to-token ratios:
- Code files: **3.5 characters per token**
- Prose files: **4.0 characters per token**
- Mixed: **3.75 characters per token**

The waste detector looks for patterns like repeated reads, large reads where anatomy sufficed, and stale cerebrum files. Reports are generated weekly.
