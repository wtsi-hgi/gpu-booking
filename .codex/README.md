# Codex Multi-Agent Setup

This repository now includes project-local multi-agent config in:

- `.codex/config.toml`
- `.codex/*.toml` role config files

## What Is Configured

- `features.multi_agent = true`
- `agents.max_threads = 8`
- Role mappings for the skills in `.github/skills/`, including:
  `orchestrator`, `spec_writer`, `spec_author`, `spec_reviewer`,
  `spec_proofreader`, `phase_creator`, `phase_reviewer`,
  `implementor`, `code_reviewer`, `pr_reviewer`,
  `frontend_designer`, plus `default`, `worker`, and `explorer`.

Each role config sets `developer_instructions` that point to the
matching `SKILL.md` files in this repository.

## How To Use (CLI)

1. Start Codex CLI from this repository root.
2. Ensure project config loading is enabled in your CLI setup.
3. Spawn agents with a role, for example:

```text
/agent spec_writer
/agent code_reviewer
/agent implementor
```

Or from prompts, request explicit delegation by role name.

## Notes

- The current desktop app may not expose full multi-agent UI controls.
  This config is still valid for CLI and for runtimes that support
  role-based agent spawning.
- If your local Codex install requires experimental flags, enable
  them in your user-level Codex config as described in the official
  OpenAI Codex multi-agent docs.
