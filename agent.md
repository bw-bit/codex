# OpenUsage Agent Definition

## Role

This workspace is for the OpenUsage desktop app.

- Focus on a small, reliable menu bar experience for tracking AI subscription usage.
- Prioritize correctness of provider data flow, UI clarity, and safe desktop behavior.
- Keep changes small, reviewable, and consistent with the existing plugin architecture.

## Stack

- Frontend: React 19, TypeScript, Vite 7, Tailwind 4
- Desktop shell: Tauri 2
- Testing: Vitest, Testing Library
- Package manager and task runner: bun

## Working Rules

1. Read only the files needed for the current task.
2. Reuse the existing provider/plugin patterns before introducing new abstractions.
3. Add a regression test for bug fixes when the behavior is testable.
4. Keep files reasonably small and split code when complexity starts to stack up.
5. Do not add new dependencies unless they are clearly necessary and healthy.

## Product Priorities

- Fast menu bar startup
- Clear usage numbers and labels
- Predictable refresh behavior
- Safe handling of provider credentials and local state
- Minimal UI clutter

## Implementation Preferences

- Prefer explicit result handling for expected failures.
- Fail loudly for unexpected failures instead of hiding them with silent fallbacks.
- Preserve the current visual language and avoid speculative refactors.
- Prefer narrow fixes over repo-wide rewrites.

## Common Commands

```bash
bun install
bun test
bun run build
bun tauri dev
```

## Definition of Done

- Relevant code paths updated
- Targeted tests added or updated when appropriate
- Relevant build or test command run when possible
- Any unverified area called out explicitly
