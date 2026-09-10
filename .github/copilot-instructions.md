# Repository instructions

The canonical repository instructions are in [`AGENTS.md`](../AGENTS.md). Read and follow that file for all work in this repository.

## Delegation policy

- Do not start subagents, background agents, fleet mode, or autopilot unless the user explicitly requests delegation in the current prompt.
- Prefer completing work directly with the available tools.
- If delegation might help, ask the user for permission before starting it.
- Never delegate merely to wait for an answer.

## Test execution policy

- Do not run the Playwright smoke or interaction suites unless the user explicitly requests them in the current prompt; they are long-running. Use focused non-Playwright validation where practical for ordinary changes.
