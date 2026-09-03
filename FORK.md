# Type-Delta CPAMC fork notes

This file records behavior and maintenance work that differs from official CPAMC. Entries describe the current branch, not planned work.

Last updated: 2026-09-03

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

CPAMC keeps the existing dashboard and shell and adds a capability-gated Analytics workspace with eight lazy, route-contained pages: Overview, Analysis, Keys, Events, Pricing, Providers and quotas, Shared views, and Maintenance. The sidebar has one Analytics entry; the workspace tab strip groups Usage and Manage pages. The former Leaderboard route redirects to Keys, where rank-by tokens or cost absorbs its local ranking. Applicable reads use the versioned POST query contract. Full key IDs remain in memory and request bodies, catalog cursors use `X-Analytics-Cursor`, multi-key filters stop at 100 keys, and the client normalizes nullable empty Go collections before rendering. The key catalog covers the bounded 10,000-key lifecycle maximum.

Keys use backend token or known-cost ranking, opaque cursor pagination, stable backend ties, and explicit unpriced-token disclosure. Short collision-safe key references may appear in hash URL state; full hashes stay in request bodies and in-memory values only. Shared-view credentials appear only in one-time fragment links, are removed from history before decoding or exchange, and are never stored in browser storage. Failed credential exchanges stop the loading state and show the localized error. The durable viewer list exposes only labels, expiry, and revocation controls in the UI. Maintenance uses pollable jobs and the preview, batch ID, backup, and confirmed purge sequence. All four supported locales include the new routes and states.

Validation on 2026-08-31:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 436 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated Chrome DevTools Protocol run against a live local CPA exercised all nine routes at 1440 by 900 and Overview, Keys, Leaderboard, Shared views, and Maintenance at 390 by 844. It found no body overflow, unreachable non-scrollable controls, positive-tabindex ordering, API alerts, or runtime exceptions after the nullable-collection fix.

### DL004: Analytics configuration and navigation clarity

Status: shipped

Files: `src/components/layout/MainLayout.tsx`, `src/components/ui/icons.tsx`, `src/features/config/**`, `src/hooks/useVisualConfig.ts`, `src/types/visualConfig.ts`, `src/utils/yaml.ts`, `src/i18n/locales/**`, `tests/visualConfigAnalytics.test.ts`

The eight Analytics workspace tabs use distinct vendored Lucide icons, while the sidebar exposes one Analytics entry. The Config Panel Common tab exposes every durable analytics setting through the same typed controls used by Logging and Diagnostics. The visual YAML adapter loads and writes the complete nested `analytics` contract, changes only dirty fields, and preserves unknown YAML fields.

Frontend validation matches CPA's queue, batch, duration, retention, circuit, signed 64-bit storage, and trusted proxy CIDR constraints. Storage byte values retain full `int64` precision. Path help identifies `identity.key` and `viewers.json` as companion files beside the SQLite database. CRLF input is normalized before YAML parsing and diff normalization so serialized comments cannot retain stray carriage returns or gain visible blank lines on Windows.

Validation on 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 441 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated raw Chrome DevTools Protocol run against a live local CPA checked the Common panel at 1440 by 900 and 390 by 844. All 12 analytics controls rendered, all nine Analytics links used SVG icons with no fallback dots, invalid CIDRs showed an error, a real `analytics.enabled` save and reload succeeded, and the run found no horizontal overflow or runtime exceptions.

### DL005: Analytics navigation and key-filter parity

Status: shipped

Files: `src/features/analytics/**`, `src/components/layout/MainLayout.tsx`, `src/features/config/ConfigPage.module.scss`, `src/i18n/locales/**`, `tests/analyticsContracts.test.ts`

Every Analytics route uses one routed tab bar with the same underline, bottom rule, icon sizing, interaction states, horizontal scrolling, and desktop/mobile content rhythm as the Config Panel tabs. Analytics page order, its eight vendored Lucide icons, and its Usage and Manage groups come from one registry shared with the single Analytics sidebar entry. The Config Panel also keeps a visible 20 px desktop and 16 px mobile gap between the Common and Durable Analytics cards.

The Analytics key scope is a searchable multi-select dropdown. An empty selection continues to mean all keys and omits `key_ids` from query bodies; explicit selections retain full key hashes only in memory and request bodies, stop at 100 keys, and show friendly labels alongside collision-safe short hashes. Short references may be represented in hash URL state without exposing full hashes. Selection applies without closing the menu, search covers labels, short hashes, and lifecycle status, and the Keys catalog no longer duplicates that search field. The control includes keyboard navigation, listbox semantics, loading, retry, empty, and no-match states. It caps the rendered option window at 200 while search continues to cover the full catalog. The Keys catalog also keeps the short hash visible when a friendly label exists.

Validation on 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 447 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- Isolated raw Chrome DevTools Protocol runs against the Docker Compose stack verified the nine icon tabs, active underline and bottom rule, 20 px desktop and 16 px mobile tab-to-body spacing, searchable two-key selection, menu persistence, all-keys reset, two-stage Escape behavior, internal-only full hashes, viewport-contained menus, and no page overflow or runtime exceptions. The multi-key interaction used a synthetic three-key catalog response inside the isolated browser context; all other application traffic used the live CPA stack.

### DL006: Analytics control and state consistency

Status: shipped

Files: `src/components/ui/Select.*`, `src/features/analytics/**`, `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `tests/analyticsContracts.test.ts`

Analytics uses the shared Select component for every single- and multi-select control. Time range and API-key filters now share the same 40 px trigger and label typography, while the searchable multi-select retains full key IDs only as internal values and announces its current selection. Labeled keys remain collision-safe in filters, Keys, Shared views, and Maintenance by pairing the label with the short hash. Analytics buttons, dropdowns, and single-line inputs use a scoped 40 px control height; textareas and the existing ToggleSwitch keep their native dimensions.

Analytics stores the time range, selected keys, and Keys sort in hash URL state, without browser storage. Overview, Analysis, Keys, and Events share the range and key filter; Events adds its own provider, model, source, and result filters. Short collision-safe references may appear in that URL state, while full hashes remain body-only. Fork-owned Analytics loading paths use the shared Skeleton component with an accessible loading status, and Maintenance uses the existing ToggleSwitch for dry-run mode.

Validation on 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 455 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated raw Chrome DevTools Protocol run against the Docker Compose stack exercised all nine Analytics routes at desktop and mobile sizes. All 33 visible buttons, dropdowns, and single-line inputs measured 40 px; no native selects, horizontal overflow, visible text loaders, or runtime exceptions remained. Delayed requests exposed Skeleton states, shared filters retained 30 days and two selected keys across routes, and the Leaderboard request omitted `key_ids`.

### DL007: Persistent Analytics shell and portal loading

Status: shipped

Files: `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `src/features/analytics/**`, `tests/analyticsContracts.test.ts`

Analytics keeps its module label, readiness badge, page-specific title and subtitle, and routed tab bar outside lazy route content. The active route body, including Suspense, capability, query-loading, unavailable, and error states, renders through one in-page portal host below the tabs. A host-owned Skeleton covers handoffs where rapid navigation advances the URL before the keyed page transition creates its next current layer, so the content slot never becomes empty or collapses. Outgoing and stacked transition layers cannot portal stale content, while a token registry prevents an outgoing cleanup from hiding a newer payload. The visible state badge uses the localized page state label.

The Analytics provider keeps one `PageTransition` instance mounted across Analytics and non-Analytics routes. Capability reads are enabled only while Analytics is active, and request generations prevent an older same-key response from replacing a newer result after refresh or leave and re-entry. The ready badge mirrors the Dashboard live badge geometry, typography, color, and pulse, appears immediately after “CPA Usage Keeper” above the title, and preserves the same geometry without animation for degraded and reduced-motion states.

Validation on 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 462 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- The Impeccable UI detector returned no findings for the changed layout, Analytics, and routing files.
- An isolated raw Chrome DevTools Protocol run against the Docker Compose stack paused lazy capability and Analytics requests while switching Overview, Analysis, and Keys. The same shell, header, title, tabs, content host, and global page-transition nodes survived loading and route changes; header, tab, and host top coordinates remained exactly 82 px, 199 px, and 257.1875 px. A 60 ms Analysis-to-Keys double switch produced 78 samples with a minimum 222.546875 px content height and 29 host-Skeleton handoff samples. A newer ready capability response remained authoritative after an older disabled response completed late. Desktop, degraded, and 320 CSS-pixel Russian reduced-motion runs reported no overflow, runtime exceptions, or console errors.

### DL008: CPAUK-fidelity Analytics rebuild

Status: shipped

Files: `src/features/analytics/**`, `src/services/api/analytics.ts`, `src/types/analytics.ts`, `src/components/common/{PageTransition.tsx,pageTransitionState.ts}`, `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `src/pages/LoginPage.tsx`, `src/i18n/locales/**`

Analytics now follows CPAUK's information model while using CPAMC's existing Card, Table, EmptyState, Skeleton, Select, and Dashboard SVG chart idioms. Overview has CPAUK-style KPIs, sparklines, daily averages, and activity heatmaps. Analysis has independently loaded cards for time series, models, latency, distributions, cost, efficiency, and key-by-model data. Keys combines ranking with range-aware drilldown. Events has dimension filters, row detail, export, total and loaded counts, and selectable persisted columns. Pricing, Providers and quotas, Shared views, and Maintenance are rebuilt as management pages, and Viewer shows the scoped usage journey.

Schema-v2 requests support named and custom ranges. Hash URL state carries shareable ranges, sort, and collision-safe short key references; query cursors freeze the resolved filter state. Full key hashes remain in request bodies only. The login flow restores Analytics deep links.

Validation on 2026-09-03:

- `bun run verify`
- Result: 495 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- The Impeccable UI detector returned no findings for the changed Analytics, shell, and routing files.
- Independent raw Chrome DevTools Protocol verification rendered all eight pages at 1440 by 900 and 390 by 844 in light and dark themes. It found no document overflow, unnamed controls, raw key or full-hash leaks, raw server enum tokens, console exceptions, or ordinary-navigation request failures. Deep-link login restore, cross-tab URL state, rapid route recovery, and same-route range updates passed.
- A seeded seven-day `Asia/Kolkata` Analysis run verified both 168-bucket time-series charts at their start, midpoint, and end. Each chart's 168 interaction targets measured exactly 40 px wide and aligned with its bucket centers to within 0.000244 px.

### DL009: Analytics accessibility, state-aware charts, and URL-carried filters

Status: shipped

Files: `src/features/analytics/**`, `src/i18n/locales/**`

Overview KPI tiles are grouped as accessible sets with roving-tabindex heatmap grids, summarized chart `aria-label`s, and cost/error KPI tones that follow semantic status rather than raw color. The activity heatmap uses a neutral ramp with contrast-switching value labels and marks the selected range as its own query zone instead of relying on color alone. Analysis latency charts use log10 axes with mobile-sized latency tiles and a bounded "browse slowest samples" list; the key/model heatmap caps visible columns and reports how many are shown. Analysis cards load independently per section so one failed section does not block the rest, and each has its own retry. Route-level errors now retry in place instead of forcing a full reload. Events filters, the activity window, and the distribution tab persist to URL state so a shared link reproduces the same view; dimension pages follow the pointer instead of a fixed layout. Keys defaults to cost-descending sort, and Keys/Events fall back to mobile card lists below the table breakpoint. Pricing catalog sync now surfaces a real failure toast instead of assuming success, and reprice runs against the analytics workspace's active range (shown and explained in the Pricing view) instead of a fixed 24h/7d/30d choice. The Viewer route reuses the same KPI tile treatment as the authenticated pages. Fifty new `analytics.*` translation keys covering these views, including a new `analytics.maintenance.*` group for the Maintenance page's job, backup, restore, and purge copy, were added to all four locale files (`en`, `ru`, `zh-CN`, `zh-TW`) with matching key sets.

Validation on 2026-09-03:

- `bun run verify`
- Result: 521 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

Fork baseline validation on 2026-08-31, before DL002 and DL003:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 424 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

### DL010: Round-4 analytics correctness — request dedupe, shared heatmap readout, viewer expiry, and locale fixes

Status: shipped

Files: `src/services/api/analytics.ts`, `src/services/api/client.ts`, `src/features/analytics/useAnalyticsLoad.ts`, `src/features/analytics/components/{AnalyticsShared,HeatmapReadout}.tsx`, `src/features/analytics/components/{analyticsErrorCopy,analyticsFormatting}.ts`, `src/features/analytics/AnalyticsTabs.tsx`, `src/features/analytics/ViewerPage.tsx`, `src/features/analytics/views/{Events,Providers,Maintenance,Overview}.tsx`, `src/features/analytics/views/{overview,analysis,events,viewer}/**`, `src/styles/themes.scss`, `src/i18n/locales/**`, `src/features/config/components/sections/AnalyticsSettingsFields.tsx`, `src/hooks/useVisualConfig.ts`, `src/types/visualConfig.ts`, `src/features/config/constants.ts`, `src/features/config/searchIndex.ts`

Round 4 follows the round-3 critique (`ANALYTICS_CRITIQUE.md`, R3-1…R3-14). Concurrent identical `POST /analytics/query` calls are now deduplicated at the transport on the serialized body, so a StrictMode Analysis mount issues five requests instead of twenty; `Retry-After` is read from 429 responses and every Retry button counts down before re-enabling instead of re-firing into the throttle. Both heatmaps share one `HeatmapReadout` live region (`role=status`, never `aria-hidden`) driven by pointer, pointerdown and focus, and the token ramp uses a new dataviz-neutral `--viz-neutral` token instead of the shell chrome grey. Latency chart captions sit in reserved gutters and all chart ticks are 11 px. The viewer page renders the shared-view link expiry and the 30-minute session expiry as two dated sentences. Events rows are the keyboard target (one roving stop per table instead of one per badge), four never-populated columns were removed from the picker, and a retained-range failure names the retention cutoff. `AnalyticsTabs` is a real `tablist` with Arrow/Home/End navigation. Providers counters are labelled "Observed" with an explanation, and every Maintenance input has an accessible name. Latin technical acronyms (`TTFT`, `RPM`, `TPM`) were previously transliterated in `zh-CN`, `zh-TW`, and `ru`; they now stay Latin in every locale with glosses confined to `*_description` keys. `analytics.overview.window_*`, 32 `analytics.job_result.*` keys, and `analytics.enums.{source,service_tier,endpoint}.*` were added and wired through `formatAnalyticsEnum`; seven unreferenced keys were pruned; all four locales carry the same 564 `analytics.*` keys. A new `analytics.storage-time-zone` Config field validates against `Intl.supportedValuesOf('timeZone')` (guarded) and warns that changing it after retention requires an analytics reset.

Validation on 2026-09-03:

- `bunx tsc --noEmit`: 0 errors.
- `bun test`: 550 pass, 0 fail, 1986 expect() calls, 81 files.
- `bunx eslint` on the changed TS/TSX files above: 0 errors, 0 warnings.
- `bun run verify`: 550 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

### DL011: Round-5 analytics UI hardening — chart palettes, Retry-After wiring, viewer origin, locale-independent tests

CPAMC's analytics workspace picked up eight related fixes in the same round.

Chart series now draw from two dedicated CSS custom-property ramps in `themes.scss` instead of reusing the semantic status colors: a ten-hue nominal palette (`--viz-cat-1..10`, plus an achromatic `--viz-cat-other` for a capped ranking's "everything else" band and a `--viz-line-cost` overlay stroke) for categorical series such as per-model breakdowns, and a five-step ordinal ramp (`--viz-health-1..5`) whose contrast against `--bg-primary` increases monotonically so a stronger color always reads as healthier. Both ramps are re-banded per theme (light/white/dark) to hold a minimum neighbor and background contrast ratio; `tests/analyticsPalette.test.ts` parses the literal hex values out of the stylesheet and asserts the WCAG contrast floors directly, since `color-mix()` has no evaluator outside a browser.

Retry-After metadata (`errorStatus`, `retryAt`) now flows from every owned analytics load hook through to `AsyncState`, which disables its retry button and shows a countdown while a 429's deadline is still in the future, instead of allowing an immediate re-request that would just be rejected again.

The Events table replaced its always-empty keyboard-affordance action column with a `<caption>` (`analytics.events_row_hint`) that states row selection is available; on narrow viewports a filter summary chip (`analytics.events_filter_summary`, `analytics.events_filter_button`) scrolls the filter card into view instead of duplicating the filter form inline.

The Analysis view groups its cards into two labeled `<section>` landmarks, Consumption (token usage, cost breakdown, usage distribution) and Behaviour (model efficiency, top models, latency diagnostics), each with an `aria-labelledby` heading instead of one flat list of cards.

`fetchViewerJSON` resolves viewer requests against the configured API base (`apiClient.getApiBase()`) rather than a hardcoded same-origin path, and chooses `same-origin` vs. `include` credentials by comparing the resolved URL's origin to `window.location.origin`, so a shared-view link opens correctly when CPAMC and CPA are served from different origins (paired with DL011's server-side allowlist).

The analytics storage time zone field accepts the literal value `Local` without attempting `Intl.DateTimeFormat` validation, and trims the value before persisting it, so the config UI doesn't reject the sentinel or save trailing whitespace as part of an IANA zone name.

`AsyncState` now retains previously rendered content through a subsequent loading pass (tracked via a `hasRenderedContent` flag) instead of reverting to `initial-loading`, so changing the analytics range no longer blanks a chart while the new range's data streams in.

Several analytics test files call `i18n.changeLanguage('en')` in `beforeAll` because rendered assertions were comparing English literals; without it, the tests only passed under the runtime's default English locale and broke under `LANG=zh_CN.UTF-8`.

Finally, the four CPAMC locale files gained the enum-label groups `analytics.enums.provider`, `.executor`, `.auth_type`, and `.error_class` (empty groups previously fell back to the raw Go value or a naive humanized string), completed `analytics.enums.job_kind` with the maintenance controller's actual operation names (`restore`, `purge_key`, `rollback_import`, `import_cpauk`, `retention`, `repair`, `reprice`, `start_new_identity_epoch`), and dropped the stale `import`/`purge` job-kind entries that controller no longer emits, plus the `en`/`ru`/`zh-CN`/`zh-TW` translations for all of the above.

**Implementation evidence:** `src/styles/themes.scss`, `src/features/analytics/components/AnalyticsShared.tsx`, `src/features/analytics/components/analyticsFormatting.ts`, `src/features/analytics/views/Analysis.tsx`, `src/features/analytics/views/Events.tsx`, `src/features/analytics/views/events/{EventDetailSheet.tsx,Events.module.scss}`, `src/features/analytics/views/viewer/viewerApi.ts`, `src/services/api/client.ts` (`ApiClient.getApiBase`), `src/hooks/useVisualConfig.ts` (`getAnalyticsTimeZoneError`, `analyticsStorageTimeZone` trim), and `src/i18n/locales/{en,ru,zh-CN,zh-TW}.json`.

**Recorded validation:** `bun run verify` (577 tests, lint, `tsc && vite build`) passes, including new `tests/analyticsPalette.test.ts` (contrast-ratio assertions per theme), `tests/analyticsRetryWiring.test.ts` (retry disabled under an active `Retry-After`), and `tests/analyticsViewerSecurity.test.ts` (`buildViewerURL` resolves against a configured non-default API origin; `viewerCredentialsMode` picks `same-origin` vs. `include`), plus the updated `tests/analyticsOverview.test.ts` (stale content survives a range-change load) and `tests/visualConfigAnalytics.test.ts` (`Local` sentinel accepted and trimmed). `LANG=zh_CN.UTF-8 LC_ALL=zh_CN.UTF-8 bun test` passes the same 577 tests, confirming the locale-independent assertions. A key-set scan (`analytics.*` in each locale JSON) confirms all four files carry the identical 608-key set after the additions.

**Last updated:** 2026-09-03

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
