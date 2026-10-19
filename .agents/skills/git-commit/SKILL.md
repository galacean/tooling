---
name: git-commit
description: "Auto-detect changes, create branch if needed, commit with conventional message"
allowed-tools: Bash, Read, Grep, Glob, LS, Agent
---

Commit current code changes. Follow these steps in order:

1. Use the `pre-commit-check` agent to run validation. If subagent is unavailable, run `pnpm check:ts` then `pnpm test` directly. If any check fails, stop and report issues — do not proceed to commit
2. Run `git status` to see what files have changed
3. If no files are staged, run `git add -A .` to stage all changes; otherwise skip
4. Run `git diff --staged` to review staged changes and generate a commit message following conventional commits format. Show the message and ask for explicit confirmation with choices: `Confirm commit` / `Cancel`. Only proceed if confirmed
5. If the command arguments contain `-b`, or the current branch is `main`, `master`, `dev`, or matches `feat/<version>` (e.g. `feat/2.1`): infer a branch name from the staged diff content in `<type>/<scope>-<summary>` format and run `git checkout -b <branch>`; otherwise stay on the current branch
6. Run `git commit -m "<message>"`

If any issues arise at any step, stop and report them.

> Fast Mode: If the user input is exactly `0`, skip to **Step 2** directly.
> In Fast Mode, execute tools immediately and keep responses minimal; do not output reasoning/thought process.
