# Repository instructions

The canonical repository instructions are in [`AGENTS.md`](../AGENTS.md). Read and follow that file for all work in this repository.

## Delegation policy

- Do not start subagents, background agents, fleet mode, or autopilot unless the user explicitly requests delegation in the current prompt.
- Prefer completing work directly with the available tools.
- If delegation might help, ask the user for permission before starting it.
- Never delegate merely to wait for an answer.

## Test execution policy

- Do not run the Playwright smoke or interaction suites unless the user explicitly requests them in the current prompt; they are long-running. Use focused non-Playwright validation where practical for ordinary changes.

## Commit metadata

- When creating commits, keep the GitHub-recognized `Co-authored-by` trailer and all Copilot metadata trailers in one contiguous block at the very end of the commit message, with no blank lines between trailers.
- Do not pass each trailer as a separate `git commit -m` argument, because Git inserts paragraph breaks between `-m` values and GitHub may not recognize the co-author.
- Prefer a single message argument containing the complete message, or use a message file. For example:

  ```text
  Subject

  Explain the meaningful change.

  Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>
  Copilot-Model: <actual model name and model ID>
  Copilot-Reasoning-Effort: <actual reasoning effort, when available>
  Copilot-Context-Tier: <actual context tier, when available>
  Copilot-Context-Usage: <percentage of context window used, when available>
  Copilot-CLI-Version: <actual Copilot CLI version>
  ```

- Omit metadata values that are unavailable rather than inventing them.
