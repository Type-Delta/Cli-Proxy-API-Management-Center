# Type-Delta CPAMC fork notes

This file records behavior and maintenance work that differs from official CPAMC. Entries describe the current branch, not planned work.

Last updated: 2026-09-02

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

### DL004: Analytics configuration and navigation clarity

Status: shipped

Files: `src/components/layout/MainLayout.tsx`, `src/components/ui/icons.tsx`, `src/features/config/**`, `src/hooks/useVisualConfig.ts`, `src/types/visualConfig.ts`, `src/utils/yaml.ts`, `src/i18n/locales/**`, `tests/visualConfigAnalytics.test.ts`

The Analytics child navigation uses nine distinct vendored Lucide icons. The Config Panel Common tab exposes every durable analytics setting through the same typed controls used by Logging and Diagnostics. The visual YAML adapter loads and writes the complete nested `analytics` contract, changes only dirty fields, and preserves unknown YAML fields.

Frontend validation matches CPA's queue, batch, duration, retention, circuit, signed 64-bit storage, and trusted proxy CIDR constraints. Storage byte values retain full `int64` precision. Path help identifies `identity.key` and `viewers.json` as companion files beside the SQLite database. CRLF input is normalized before YAML parsing and diff normalization so serialized comments cannot retain stray carriage returns or gain visible blank lines on Windows.

Validation on 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 441 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated raw Chrome DevTools Protocol run against a live local CPA checked the Common panel at 1440 by 900 and 390 by 844. All 12 analytics controls rendered, all nine Analytics links used SVG icons with no fallback dots, invalid CIDRs showed an error, a real `analytics.enabled` save and reload succeeded, and the run found no horizontal overflow or runtime exceptions.

### DL005: Analytics navigation and key-filter parity

Status: shipped

Files: `src/features/analytics/**`, `src/components/layout/MainLayout.tsx`, `src/features/config/ConfigPage.module.scss`, `src/i18n/locales/**`, `tests/analyticsContracts.test.ts`

Every Analytics route uses one routed tab bar with the same underline, bottom rule, icon sizing, interaction states, horizontal scrolling, and desktop/mobile content rhythm as the Config Panel tabs. Analytics page order and its nine vendored Lucide icons now come from one registry shared with the sidebar. The Config Panel also keeps a visible 20 px desktop and 16 px mobile gap between the Common and Durable Analytics cards.

The Analytics key scope is a searchable multi-select dropdown. An empty selection continues to mean all keys and omits `key_ids` from query bodies; explicit selections retain full key hashes only in memory and request bodies, stop at 100 keys, and show friendly labels alongside collision-safe short hashes. Selection applies without closing the menu, search covers labels, short hashes, and lifecycle status, and the Keys catalog no longer duplicates that search field. The control includes keyboard navigation, listbox semantics, loading, retry, empty, and no-match states. It caps the rendered option window at 200 while search continues to cover the full catalog. The Keys catalog also keeps the short hash visible when a friendly label exists.

Validation on 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 447 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- Isolated raw Chrome DevTools Protocol runs against the Docker Compose stack verified the nine icon tabs, active underline and bottom rule, 20 px desktop and 16 px mobile tab-to-body spacing, searchable two-key selection, menu persistence, all-keys reset, two-stage Escape behavior, internal-only full hashes, viewport-contained menus, and no page overflow or runtime exceptions. The multi-key interaction used a synthetic three-key catalog response inside the isolated browser context; all other application traffic used the live CPA stack.

### DL006: Analytics control and state consistency

Status: shipped

Files: `src/components/ui/Select.*`, `src/features/analytics/**`, `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `tests/analyticsContracts.test.ts`

Analytics uses the shared Select component for every single- and multi-select control. Time range and API-key filters now share the same 40 px trigger and label typography, while the searchable multi-select retains full key IDs only as internal values and announces its current selection. Labeled keys remain collision-safe in filters, Leaderboard, Shared views, and Maintenance by pairing the label with the short hash. Analytics buttons, dropdowns, and single-line inputs use a scoped 40 px control height; textareas and the existing ToggleSwitch keep their native dimensions.

An in-memory provider above keyed page transitions shares the time range and selected keys across Overview, Analysis, Keys, and Leaderboard without writing key IDs to URLs or browser storage. Leaderboard hides the key filter and always omits `key_ids`, while preserving the selection restored on the other pages. Events retains its independent filter scope. Fork-owned Analytics loading paths use the shared Skeleton component with an accessible loading status, and Maintenance uses the existing ToggleSwitch for dry-run mode.

Validation on 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 455 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated raw Chrome DevTools Protocol run against the Docker Compose stack exercised all nine Analytics routes at desktop and mobile sizes. All 33 visible buttons, dropdowns, and single-line inputs measured 40 px; no native selects, horizontal overflow, visible text loaders, or runtime exceptions remained. Delayed requests exposed Skeleton states, shared filters retained 30 days and two selected keys across routes, and the Leaderboard request omitted `key_ids`.

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
