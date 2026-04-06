# Claude Code (local)

The `worktrees/` subdirectory is created by tooling as a **local nested checkout** (often including `node_modules` and build artifacts). It is **gitignored** so it is not pushed to this repository.

If you need to share Claude-specific project rules or prompts, add small files here (for example `settings.local.json` or docs) and commit those explicitly—avoid adding `worktrees/`.
