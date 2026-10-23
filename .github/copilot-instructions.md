# Copilot instructions

All agent instructions for this repository live in [`AGENTS.md`](../AGENTS.md). Read it first. It covers the startup workflow, plan gate, definition of done and project architecture.

- Workflow and PR process: [`.agents/skills/developer-workflow/SKILL.md`](../.agents/skills/developer-workflow/SKILL.md)
- Feature backlog: [`feature_list.json`](../feature_list.json). Don't implement a feature unless its `plan_status` is `"approved"`.
- Verification: `npm run check` plus a browser check at http://localhost:44100 (`npm run dev`).
- Use `npm`, not `pnpm`. Don't add React, Vite or UI frameworks.
