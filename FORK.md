# Type-Delta CPAMC fork notes

This file records behavior and maintenance work that differs from official CPAMC. Entries describe the current branch, not planned work.

Last updated: 2026-08-31

## Repository relationship

- Fork: https://github.com/Type-Delta/Cli-Proxy-API-Management-Center
- Upstream: https://github.com/router-for-me/Cli-Proxy-API-Management-Center
- Initial fork head: `d249ff008e0bc2803deb23fb3e2c62418a1e8d17`
- Current upstream base: `e0ee7123dfb5aa89a14ff73ac5a5c3bf4db658e0`
- Upstream release at the base: `v1.22.10`

The fork uses append-only merge history. Routine upstream syncs merge official history into `main`; they do not rebase or force-push published commits.

## Current divergence

### DL001: Fork maintenance convention

Status: shipped

Files: `AGENTS.md`, `FORK.md`

The fork records its fork and upstream URLs, repository commands, architecture, glossary, sync rules, stable divergence IDs, validation, and merge history.

Evidence:

- `AGENTS.md` defines CPA, CPAUK, and CPAMC and documents the `origin` and `upstream` convention.
- This file records the exact baseline, sync comparison, and validation.

### DL002: Revisioned structured API-key management

Status: shipped

Files: `src/types/apiKeys.ts`, `src/services/api/apiKeys.ts`, `src/services/api/capabilities.ts`, `src/services/api/transformers.ts`, `src/hooks/useVisualConfig.ts`, `src/features/config/components/blocks/ApiKeysCardEditor.tsx`

CPAMC reads legacy string keys and structured key objects without coercing objects to strings. Row edits preserve unknown entry and limit fields, use the configuration index plus revision on supported CPA versions, and block structured limit writes on older versions. Raw keys remain available to administrators but start concealed. Reveal and raw-copy actions are per row, revealed state clears when the route or authenticated connection changes, and full SHA-256 key IDs remain internal until the administrator explicitly copies one. The visible identity uses the shortest collision-safe even-length prefix starting at 12 characters. The existing configuration page now shows request and token caps, reset cadence, current consumption, and confirmed counter reset.

Compatibility tests cover legacy and structured fixtures, unknown-field preservation, duplicate full IDs, and colliding display prefixes.

Validation on 2026-08-31:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 427 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

### DL003: Isolated analytics workspace

Status: shipped

Files: `src/features/analytics/**`, `src/services/api/analytics.ts`, `src/types/analytics.ts`, `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `src/App.tsx`

CPAMC keeps the existing dashboard and shell and adds a capability-gated Analytics navigation group with lazy, route-contained Overview, Analysis, Keys, Leaderboard, Events, Pricing, Providers and quotas, Shared views, and Maintenance pages. Applicable reads use the versioned POST query contract. Full key IDs remain in memory and request bodies, catalog cursors use `X-Analytics-Cursor`, multi-key filters stop at 100 keys, and the client normalizes nullable empty Go collections before rendering. The key catalog covers the bounded 10,000-key lifecycle maximum.

The Leaderboard uses backend token or known-cost ranking, opaque cursor pagination, stable backend ties, and explicit unpriced-token disclosure. Shared-view credentials appear only in one-time fragment links, are removed from history before decoding or exchange, and are never stored in browser storage. Failed credential exchanges stop the loading state and show the localized error. The durable viewer list exposes only labels, expiry, and revocation controls in the UI. Maintenance uses pollable jobs and the preview, batch ID, backup, and confirmed purge sequence. All four supported locales include the new routes and states.

Validation on 2026-08-31:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 436 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated Chrome DevTools Protocol run against a live local CPA exercised all nine routes at 1440 by 900 and Overview, Keys, Leaderboard, Shared views, and Maintenance at 390 by 844. It found no body overflow, unreachable non-scrollable controls, positive-tabindex ordering, API alerts, or runtime exceptions after the nullable-collection fix.

Fork baseline validation on 2026-08-31, before DL002 and DL003:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 424 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

## Upstream comparison

Before the initial sync, from `d249ff008e0bc2803deb23fb3e2c62418a1e8d17`:

```bash
git rev-list --left-right --count origin/main...upstream/main
```

Result: `0 2`. The fork had no unique commits and was two upstream commits behind.

After the merge commit and before adding fork documentation:

```bash
git rev-list --left-right --count main...upstream/main
```

Result: `1 0`. The merge-forward record was one commit ahead and no commits behind.

## Append-only merge history

| Date | Fork before sync | Upstream merged | Merge commit | Before count | After count | Validation |
| --- | --- | --- | --- | --- | --- | --- |
| 2026-08-31 | `d249ff008e0bc2803deb23fb3e2c62418a1e8d17` | `e0ee7123dfb5aa89a14ff73ac5a5c3bf4db658e0` | `c1a2044` | `0 2` | `1 0` | Bun 1.3.14: 424 tests, lint, type-check/build passed |

## Sync procedure

1. Fetch `origin` and `upstream`.
2. Record `git rev-list --left-right --count origin/main...upstream/main`.
3. Review the incoming range and merge the agreed upstream commit with `git merge --no-ff <sha>`.
4. Run the exact Bun version from `package.json`, install with the frozen lockfile, and run `bun run verify`.
5. Update the upstream base, comparison counts, validation evidence, divergence entries, and merge-history table in this file.
6. Push `main` without rewriting published history.
7. Update CPA's `web/management-center` gitlink only after this commit is pushed.
