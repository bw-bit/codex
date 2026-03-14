# OpenUsage v0.5.0 Custom: Multi-Account + WidgetKit

## Goal
- Add multi-account support for Codex, Claude, Antigravity, z.ai, and Kimi Code.
- Split Antigravity usage into Group 1 (Claude models) and Group 2 (Gemini models).
- Add a separate macOS WidgetKit host app + widget extension that reads shared usage data.

## Non-Goals
- Remove existing plugin directories.
- Implement a full API discovery flow for z.ai/Kimi; use cookie/key based fetch with user-provided endpoints.

## Scope
- New provider accounts config stored in `providers.json` in app data dir.
- Keychain storage for account secrets.
- Frontend settings UI to manage provider accounts.
- Widget data export to App Group container.
- New plugins: `zai`, `kimicode`.

## Data Shape
- `providers.json`
  - `{ version: 1, providers: { [id]: { accounts: [{ id, label, authType, authRef, meta }] } } }`
- `usage.json` (App Group)
  - `{ generatedAt, displayMode, providers: [{ id, name, plan, lines, sections }] }`

## Success Criteria
- Multiple accounts render as separate cards within a provider.
- Antigravity shows two grouped sections (Claude / Gemini).
- Widget renders Small/Medium/Large layouts from shared `usage.json`.
- Cursor remains optional and default-off.

