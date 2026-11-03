# Phase 1 CLI adapters

BlinkyBot runs on this Rerun tree. Foreman already drives two local CLIs as providers: **Claude Code** (`claude`) and **Codex** (`codex`). Phase 1 adds a local spawn layer for four runtimes — Codex, Kimi, Grok, and Claude — without making Kimi or Grok model-picker providers.

The Mac app starts the engine with `RERUN_CLI_ADAPTERS=codex,kimi,grok,claude` and does not use Docker. Process model: [no-docker-runtime.md](no-docker-runtime.md).

The spawn layer lives in `apps/engine/src/agents/cli-adapters/`. It builds an argv and, when the feature flag allows, spawns the binary. It does not stream tokens into a Foreman turn.

## Enable the spawn path

`runLocalCli` refuses every id until it is listed:

```bash
export RERUN_CLI_ADAPTERS=codex,kimi,grok,claude
```

Unset or empty leaves the spawn path off. Building an argv with `cliInvocation` does not check the flag.

Foreman does not read `RERUN_CLI_ADAPTERS`. A Claude or Codex connection still runs through `resolveModel` in `apps/engine/src/agents/providers.ts`.

Optional binary overrides (absolute path; a `*.js` / `*.cjs` / `*.mjs` path is started with `node`):

| Variable | Binary |
| --- | --- |
| `RERUN_CODEX_PATH` | `codex` |
| `RERUN_KIMI_PATH` | `kimi` |
| `RERUN_GROK_PATH` | `grok` |
| `RERUN_CLAUDE_PATH` | `claude` |

`RERUN_CODEX_PATH` and `RERUN_CLAUDE_PATH` are also forwarded into the existing Foreman providers (`codexPath`, `pathToClaudeCodeExecutable`). The Kimi and Grok path variables only affect this spawn layer.

```ts
import { runLocalCli } from './agents/cli-adapters/index.js'

const result = await runLocalCli('claude', {
    prompt: 'Summarize this repo',
    model: 'claude-sonnet-5',
    cwd: process.cwd(),
    session: { kind: 'new' },
    env: { CLAUDE_CODE_OAUTH_TOKEN: process.env.CLAUDE_CODE_OAUTH_TOKEN ?? '' },
})
```

`result.stdout` is the raw CLI output. Exit codes other than 0 are returned, not thrown. A missing binary, a timeout, or an abort throws `CliAdapterError`.

The child inherits the engine process environment, then `request.home` and `request.env`. That is how an exported `XAI_API_KEY` or `KIMI_API_KEY` reaches the CLI. Tokens stay in the environment; they are not placed on argv.

## How Foreman invokes Claude and Codex today

Both are members of `CLI_PROVIDERS` (`apps/engine/src/agents/types.ts`). The run loop resolves them in `resolveModel`:

| Provider id | Transport | Where |
| --- | --- | --- |
| `claude` | Claude Code CLI via `createClaudeCode` (`ai-sdk-provider-claude-code`) | `claudeProvider` |
| `codex` (chat / run) | `codex app-server` via `createCodexAppServer` | `codexAppServerProvider` |
| `codex` (one-shot: compaction, curator, vision) | `codex exec` via `createCodexExec` | `codexExecProvider` |

Credentials are connection env vars, not argv:

- Claude subscription: `CLAUDE_CODE_OAUTH_TOKEN`, plus `CLAUDE_CODE_OAUTH_REFRESH_TOKEN` and `CLAUDE_CODE_OAUTH_EXPIRES_AT` when the sign-in flow wrote them. `claudeProvider` sets `ANTHROPIC_API_KEY` to undefined so a stray API key cannot bill the turn. An API key belongs on the separate `anthropic` provider (`ANTHROPIC_API_KEY`).
- Codex subscription: `CODEX_OAUTH_TOKEN` and its satellites. The engine writes `$CODEX_HOME/auth.json` before the run (`apps/engine/src/connections/codex-auth.ts`). `CODEX_HOME` is the connection's home directory.

Rerun tools reach these CLIs as an in-process MCP server named `rerun`. Kimi and Grok are not on that path.

## Codex

- **Binary:** `codex`
- **Install:** `npm install -g @openai/codex`, or the Codex app install. Minimum for the Foreman app-server protocol is `0.144.0` (`CODEX_MIN_VERSION`).
- **Auth:** ChatGPT subscription (`codex login`) or `CODEX_API_KEY` for an API-key run. Foreman uses the subscription files under `CODEX_HOME`.
- **Home:** `CODEX_HOME` (default `~/.codex`). The spawn layer sets it from `request.home`.
- **This adapter's argv** (local spawn, flag-gated), aligned with the one-shot provider's approval and sandbox:

```bash
codex exec --json --skip-git-repo-check --sandbox danger-full-access -c approval_policy=never -m <model> -- "<prompt>"
codex exec resume <thread-id> --json … -- "<prompt>"
codex exec resume --last --json … -- "<prompt>"
```

A system string is `-c instructions=…` (the same config key `codexExecProvider` uses). `--json` prints JSONL events. The thread id for a later resume is on the `thread.started` event. This adapter does not parse that event, and it does not apply `CODEX_HARNESS_OVERRIDES` (those stay on the Foreman app-server path).

When `RERUN_CODEX_PATH` is unset, this adapter runs `codex` on `PATH`. Foreman's provider also falls back to the `@openai/codex` copy shipped with `ai-sdk-provider-codex-cli`.

## Kimi

- **Binary:** `kimi` — **Kimi Code CLI**, package `@moonshot-ai/kimi-code`.
- **Not this binary:** the Python project `kimi-cli` on PyPI (`MoonshotAI/kimi-cli`) is archived. Its `--print` / `--quiet` flags are a different CLI. Do not point `RERUN_KIMI_PATH` at it.
- **Install:** `curl -fsSL https://code.kimi.com/kimi-code/install.sh | bash`, or `npm install -g @moonshot-ai/kimi-code` (Node.js 22.19+). Check with `kimi --version`.
- **Auth:** `kimi login` (device code) stores a token under the data dir. The CLI does **not** pick up `KIMI_API_KEY` from the shell on its own. To pass a platform key, set `api_key_env = "KIMI_API_KEY"` on the provider in `$KIMI_CODE_HOME/config.toml` (see Kimi's provider docs). This adapter forwards `KIMI_API_KEY` in the environment when the caller puts it on `request.env`, and does not write `config.toml`.
- **Home:** `KIMI_CODE_HOME` (default `~/.kimi-code`).
- **Argv:**

```bash
kimi -p "<prompt>" --output-format stream-json
kimi -m <model> -p "<prompt>" --output-format stream-json
kimi --session <id> -p "<prompt>" --output-format stream-json
kimi --continue -p "<prompt>" --output-format stream-json
```

`-p` already uses the auto permission policy. Kimi rejects `-p` combined with `--auto` or `--yolo`, so those flags are not passed. There is no system-prompt flag; a system string is prepended to the prompt (`systemDelivery: 'prepended'`). `--output-format stream-json` is JSONL on stdout. This adapter does not parse it, and it does not read a new session id back out of the stream. Example model alias from Kimi's docs: `kimi-code/kimi-for-coding`. Omit `-m` to use `default_model` from config.

Maturity: **spawn-ready**. There is no `kimi` value on the `Provider` enum, no connection screen, and no Foreman turn.

## Grok

- **Binary:** `grok` — the official xAI CLI, npm package `@xai-official/grok`.
- **Install:** `curl -fsSL https://x.ai/cli/install.sh | bash`, or `npm install -g @xai-official/grok`. Check with `grok version`.
- **Auth:** `grok login` (browser, or `grok login --device-auth` for a headless machine) writes `~/.grok/auth.json`. For CI, `XAI_API_KEY` is the fallback when no session token is active; an existing login wins over the key until `grok logout`. This adapter forwards `XAI_API_KEY` on `request.env` and does not run `login`.
- **Home:** `GROK_HOME` (default `~/.grok`). Sessions live under that directory.
- **Argv:**

```bash
grok --no-auto-update --always-approve --output-format json --cwd <cwd> -m <model> -p "<prompt>"
grok … --resume <id> -p "<prompt>"
grok … --continue -p "<prompt>"
```

`--session-id` creates a new session and errors if that id is already used, so this adapter does not pass it. Resume is `--resume`. Continue-latest is `--continue`. A system string is `--system-prompt-override` (replaces the CLI's prompt). `--output-format json` is one JSON object on stdout. This adapter returns that text and does not read a session id out of it. `--no-auto-update` skips the background updater on a headless run. Omit `-m` for the CLI default.

Maturity: **spawn-ready**. Same Foreman gap as Kimi. OpenRouter's catalog already has `x-ai/grok-*` model ids; those go through the `openrouter` provider, not this CLI.

## Claude

- **Binary:** `claude` — Anthropic's Claude Code CLI, npm package `@anthropic-ai/claude-code`.
- **Install:** `curl -fsSL https://claude.ai/install.sh | bash`, or `npm install -g @anthropic-ai/claude-code`, or `claude install stable`. Check with `claude --version`.
- **Auth:** Foreman uses a Claude subscription token, `CLAUDE_CODE_OAUTH_TOKEN` (`claude setup-token`, values that start with `sk-ant-oat`). The local adapter forwards that variable from `request.env`. If it is set, `ANTHROPIC_API_KEY` is removed from the child environment, matching `claudeProvider`. Pass `ANTHROPIC_API_KEY` only for an API-key run, and omit the subscription token. Interactive login is `claude` then `/login`.
- **Home:** `CLAUDE_CONFIG_DIR` (default `~/.claude`).
- **Argv:**

```bash
claude -p --output-format json --dangerously-skip-permissions --model <model> "<prompt>"
claude -p --output-format json --dangerously-skip-permissions --resume <session-id> "<prompt>"
claude -p --output-format json --dangerously-skip-permissions --continue "<prompt>"
```

The prompt is the final positional argument (the adapter does not insert `--`). `--dangerously-skip-permissions` is the CLI's bypass mode, the same posture as Foreman's `permissionMode: 'bypassPermissions'`. `--system-prompt` replaces Claude Code's default prompt, matching the provider's `systemPrompt` setting; the caller then owns tool instructions that lived in the default prompt. `--append-system-prompt` is not used. JSON output includes a `session_id`; this adapter does not parse it. Print mode persists the session unless `--no-session-persistence` is set, and this adapter does not set it, so `--resume` can pick the session up. `--continue` together with `-p` includes sessions that were themselves started with `-p`.

Foreman additionally sets `CLAUDE_HARNESS_ENV` (no auto-compact, no bundled skills, no Claude.md, and so on) and bridges Rerun tools over MCP. The local spawn does not. `persistSession` on the Foreman provider is `false`; the local spawn keeps the CLI's default persistence so a session id can be resumed.

Maturity: **wired** for Foreman. The spawn argv above is flag-gated and is not what `resolveModel` executes.

## What works vs what is stubbed

| | Codex | Kimi | Grok | Claude |
| --- | --- | --- | --- | --- |
| Foreman / `resolveModel` | Wired (app-server for runs, exec for one-shots) | Not a provider | Not a provider | Wired (`createClaudeCode`) |
| Local argv (`cliInvocation`) | Yes | Yes | Yes | Yes |
| Local spawn (`runLocalCli`, flag on) | Yes | Yes | Yes | Yes |
| Prompt, model, cwd | Yes | Yes | Yes | Yes |
| Session resume / continue-latest | `exec resume` / `exec resume --last` | `--session` / `--continue` | `--resume` / `--continue` | `--resume` / `--continue` |
| System prompt | `-c instructions=` | Prepended to the prompt | `--system-prompt-override` | `--system-prompt` |
| Credentials on argv | Never | Never | Never | Never |
| Parsed session id returned to the caller | No (raw stdout) | No | No | No |
| Rerun tools bridged in | Foreman only | No | No | Foreman only |
| Streaming into the chat | Foreman only | No | No | Foreman only |

## Gaps left for a later phase

- Kimi and Grok are not `Provider` values. Adding them touches the connection catalog, the model picker, and every exhaustive `Record<Provider, …>`.
- Stdout is buffered until the process exits. There is no mapping onto Foreman message parts.
- No MCP bridge and no harness overrides on the local spawn.
- Kimi will not see `KIMI_API_KEY` until `config.toml` points `api_key_env` at it. This layer does not write that file.
- Long prompts and system strings go on argv and can hit the OS argument limit. Claude's `--system-prompt-file` and Grok's `--prompt-file` are not used yet.
- Codex's local spawn does not follow the provider's bundled-binary fallback.
