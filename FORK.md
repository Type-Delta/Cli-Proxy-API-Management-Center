# Type-Delta CPAMC fork notes

This file records behavior and maintenance work that differs from official CPAMC. Entries describe the current branch, not planned work.

Last updated: 2026-09-05

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

### DL012: Round-6 analytics chart engine, navigation, and locale round-trip

Status: shipped

Round 6 replaced the analytics workspace's charting stack and information architecture in one pass.

Charts moved from bespoke SVG/CSS to ECharts, imported modularly through `echarts/core` rather than the full `echarts` package: `AnalyticsChart.tsx` pulls only `BarChart`, `HeatmapChart`, `LineChart`, and `ScatterChart` from `echarts/charts`, the specific `TooltipComponent`/`GridComponent`/etc. it needs from `echarts/components`, and registers `SVGRenderer` (not canvas) from `echarts/renderers`, so the production bundle only pays for the chart types and renderer actually used instead of the whole library. Series colors read from two ramps of `--viz-*` CSS custom properties in `themes.scss` (the round-5 `--viz-cat-1..10`/`--viz-cat-other`/`--viz-line-cost` nominal palette and `--viz-health-1..5` ordinal ramp), re-banded across all three theme blocks (`:root` default, `[data-theme='white']`, `[data-theme='dark']`) via `registerAnalyticsThemes`, so ECharts inherits the same per-theme contrast-checked colors the rest of the app already validated in DL011 instead of hardcoding a fourth palette. Every axis-trigger chart shares one `snapAxisPointer` (`chartTheme.ts`: `{ type: 'line', snap: true }`) so the tooltip cursor locks to the nearest data point instead of following the raw mouse position.

The overview page's activity heatmaps (`views/overview/ActivityHeatmaps.tsx`) render a full year as GitHub-contribution-style day cells rather than the round-4 week/month bar summary, backed by a paired month table (`analytics.overview.token_month_table` / `health_month_table`) that gives the same data in a screen-reader-friendly grid; `analytics.overview.year_summary` reports the total/busiest/quietest day inline so the heatmap has a text equivalent.

Date range selection moved into a shared `DateRangePicker` component (`src/components/ui/DateRangePicker/index.tsx`) with a redesigned preset list (`past_hour`, `past_6_hours`, `past_24_hours`, `past_7_days`, `past_30_days`, `past_90_days`, `past_year`, `prev_week`, `prev_month`, `this_year`, `prev_year`, plus a `custom_range` calendar with `previous_month`/`next_month` paging), replacing the round-≤5 flat `range_24h`/`range_7d`/`range_30d`/`range_rolling_*`/`range_custom_*` key set.

Analytics navigation split into two pages instead of one tab strip: `nav.analytics_usage` ("Usage" — the overview/analysis/keys/events surfaces day-to-day operators want) and `nav.analytics_management` ("Analytics Management" — pricing, providers, and maintenance), each with its own `nav_meta.*` description and `analytics.page_title_*` heading, under a single `nav_groups.analytics` sidebar group. `AnalyticsShell.tsx` and `Analysis.tsx` both adopted the new shared `RefreshButton` and `Eyebrow` components in place of the ad hoc refresh icon-buttons and section-label `<span>`s each view previously implemented on its own. The overview KPI cards (`views/overview/OverviewKpis.tsx`) gained a per-metric `icon` (`METRIC_ICONS.{requests,tokens,rpm,tpm,cache_rate,cost}`) rendered next to each figure. The Keys table gained a sticky right-hand action column (`.actionHeader`/`.actionCell` in `KeysView.module.scss`, `position: sticky; right: 0`, shadowed to read over scrolled content) and sortable column headers (`keyRanking.ts`'s `sortKeyRanking`/`KeySortDirection`, driven by `KeysView.tsx`'s `columnSort`/`direction` state) so a wide table stays navigable and orderable without losing the action buttons off-screen.

Following up on R5-1 from `ANALYTICS_CRITIQUE.md`, opening a shared analytics view whose API origin differs from the current page's now shows a one-time consent prompt (`analytics.viewer_consent_title`/`_body`/`_continue`/`_cancel`) naming the remote origin before `fetchViewerJSON` is allowed to contact it, on top of the round-5 server-side cross-origin allowlist — a compromised or copy-pasted viewer link can no longer silently exfiltrate to an attacker-controlled analytics endpoint without the user seeing and approving the origin first.

The four CPAMC locale files were re-synced for the round: the four `analytics.range.*`/`analytics.range_previous_month`/`analytics.range_next_month` DateRangePicker keys, the five `analytics.overview.activity_year_description`/`year_summary`/`month`/`token_month_table`/`health_month_table` heatmap keys, the four `analytics.viewer_consent_*` keys, four `analytics.analysis.*` chart-summary keys (`chart_total`, `cost_chart_summary`, `distribution_chart_summary`, `heatmap_chart_summary`), and the seven navigation keys above were added with `en`/`ru`/`zh-CN`/`zh-TW` translations; the bare `analytics.range` string collided with the new nested `analytics.range.*` object (i18next resource keys can't be both a leaf and a parent), so it was renamed to `analytics.range_label` with its two call sites in `AnalyticsShared.tsx` updated to match. 58 keys/objects that no longer had any call site were pruned, including `analytics.groups.*`, the round-≤5 flat range presets, `analytics.overview.window_*` and `activity_description`, `analytics.page_meta.*`, `analytics.state_*` (superseded by `analytics.state_labels.*`), and `nav.analytics`/`nav_meta.analytics` (superseded by the `_usage`/`_management` split). All four locale files carry the identical 575-key `analytics.*` set, the identical 13-key `nav.*` set, and the identical 13-key `nav_meta.*` set after the round.

**Implementation evidence:** `src/features/analytics/components/{AnalyticsChart,chartTheme,AnalyticsShared}.tsx`, `src/features/analytics/views/overview/{ActivityHeatmaps,OverviewKpis,overviewModel}.tsx`, `src/features/analytics/views/analysis/**`, `src/features/analytics/views/keys/keyRanking.ts`, `src/features/analytics/views/{KeysView,Analysis}.tsx` and `KeysView.module.scss`, `src/features/analytics/AnalyticsShell.tsx`, `src/components/ui/{DateRangePicker/index.tsx,RefreshButton.tsx,Eyebrow.tsx}`, `src/features/analytics/query.ts`, `src/features/analytics/views/viewer/viewerApi.ts`, `src/styles/themes.scss`, `package.json` (`echarts`), and `src/i18n/locales/{en,ru,zh-CN,zh-TW}.json`.

**Recorded validation:** `bun run verify` passes 624 tests (0 fail, 2247 expect() calls, 86 files), ESLint, and `tsc && vite build`; `dist/index.html` is 3,893.67 kB (gzip 1,311.12 kB) after the ECharts modular-import build. `LANG=zh_CN.UTF-8 LC_ALL=zh_CN.UTF-8 bun test` passes the same 624 tests, confirming the locale-independent assertions survive the resource-structure changes. A key-set scan of `analytics.*`/`nav.*`/`nav_meta.*`/`nav_groups.*` confirms all four locale files carry identical key sets (575/13/13, `nav_groups.*` at 6 in `en`/`zh-CN`/`zh-TW`; `ru`'s `nav_groups.*` is 5 due to a pre-existing, out-of-round `plugin_pages` gap unrelated to this entry).

**Last updated:** 2026-09-04

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


### DL013: Stable overview hover and Sunday-first activity cells

Overview sparklines keep explicit CSS-variable colors during ECharts emphasis, preventing hover from clearing the SVG line and area. Their cursor stays default because they have no click action. KPI sparkline options request body-level placement, while `AnalyticsChart` adapts that request into a per-chart fixed portal clipped to the viewport. When a port does not supply a custom position, the adapter places the panel 20px above and right of the pointer, translates the viewport-clamped point back to chart-local coordinates for ECharts, and preserves custom positions. This keeps the panel outside the card's rounded `overflow: hidden` boundary without letting a hidden stale tooltip coordinate create page overflow after a resize.

The activity calendars use a CSS grid with Sunday in the first row. Grid cells and legend swatches share the same 12 × 12px border-box size, rounded corners, and color classes, with 3px gaps. Monday, Wednesday, and Friday labels mark their rows while Sunday remains first. Weekday and month labels follow the app locale. Transparent 15 × 15px cell hitboxes meet across the 3px gutters, keeping hover active between neighboring 12px squares. Hover outlines the cell and immediately shows a styled day-detail tooltip through a body portal, outside the scrolling card. The tooltip sits above and to the right of the pointer, clamped inside the viewport. Its persistent panel uses the ECharts 400ms transform and 200ms opacity transitions, disabled for reduced motion. It dismisses on pointer exit, scroll, resize, or Escape. The monthly text alternative and live readout remain available. On narrow screens, each calendar shows the most recent whole week columns that fit beside the fixed weekday labels. A ResizeObserver adjusts the visible window as card width changes; the newest date stays visible without horizontal scrolling. Wider cards reveal older weeks, up to the full year. Yearly totals and the accessible monthly table retain the complete activity range.

Validation: `bun run verify` passes all 626 tests, lint, TypeScript compilation, and the production build. Chrome CDP checks against the running dev server and its mock data at 1440 × 900 and 390 × 844 confirm KPI tooltip panels are visible at desktop and mobile probe points, preserve the existing ECharts motion and placement, and do not add page overflow. The resize regression check records the prior 1,219px scroll width after a desktop hover and 382px after the fix at a 390px viewport. The same checks confirm visible sparklines on hover, default computed cursors, all rendered cells at 12 × 12px, Sunday-first placement, fixed weekday labels beside the responsive date window, and visible hover tooltips and cell outlines on both calendars. Pointer probes in horizontal and vertical gutters reproduce missing tooltips before the hitbox fix and pass afterward. The calendar test covers unsorted dates, missing days, and year boundaries.

### DL014: Free KPI tooltip positioning

Status: working tree

The KPI option removes `confine: true`, which had constrained a 64px tooltip to the 32px sparkline canvas and placed it over the graph. The adapter supplies a typed default position callback only for portaled tooltips without a custom position. It uses the document client width and height so scrollbar space is excluded from the viewport bounds. It clamps the desired viewport coordinates, then converts them through the chart host rectangle back to the coordinates ECharts expects before it translates them into the fixed portal. The portal's `overflow: clip` remains in place for stale coordinates after resize. Heatmap options and behavior are unchanged.

Validation: targeted Bun tests and TypeScript checks pass. The CDP mock check covers desktop/mobile left, middle, and right probes, viewport containment, no console errors, and no document overflow after resize. Full results are in `free-tooltip.md`.


Responsive calendar verification (2026-09-05): isolated Chrome CDP at 1440 × 900 shows the full 365-day range in each heatmap. At 390 × 844, each shows the latest 18 week columns, including the newest day, with no horizontal grid or page overflow. Resizing back restores the full year. Independent review confirmed the fixed weekday labels, month labels, square cells, touching hitboxes, and day tooltips.


### DL015: Global analytics refresh and scoped sidebar selection

Analytics Usage and Analytics Management register their active-page refresh coordinator with the existing global header refresh hook. The floating header button refreshes capabilities/readiness, the key catalog, and the active analytics tab; the duplicate shell refresh buttons are removed. Coordinator refreshes propagate request failures to the existing header error notification while preserving local error/retry state. Automatic loads remain nonthrowing, and an in-flight guard prevents duplicate analytics refresh batches. Loaded views stay mounted while capabilities refresh, avoiding a second automatic request batch after refresh completion. Existing status, last-updated text, retry handling, and page loading behavior remain. The analytics shell unregisters its header callback outside analytics routes.

Analytics sidebar group matching now first checks that the current path belongs to `/analytics`. This prevents the page mapper's Usage fallback from marking Usage active on unrelated routes such as AI Providers. Existing analytics aliases and history navigation retain the correct Usage or Management highlight.


DL015 validation: `bun run verify` passes 630 tests, lint, TypeScript, and production build; Go compile passes. Isolated Chrome CDP checks show the global button refreshes Usage queries or Management pricing, refreshes no hidden analytics data on AI Providers, and leaves only the current sidebar route active across aliases and browser history. Failure injection confirms the header shows a failure notification without success, preserves local error state, and restores Unavailable analytics to Ready after capabilities recover. Independent final review records one key read and three query POSTs per Usage refresh, with no duplicate remount batch, runtime exception, or unhandled rejection.


### DL016: Attempt history pages and analytics entrance motion

Attempt history renders at most 50 records per page using the shared Pagination control. Cursor fetches load later pages on demand, and range/filter changes or a global refresh reset the page. Export continues to cover the selected filtered dataset; the Export menu is wide enough for its labels. Button accepts a separate decorative icon slot, used by the Columns control to align its icon with the label.

Analytics workspaces use the dashboard-style entrance timing. ECharts defers its initial frame until the route layer is visible and replays entrance motion when the active tab returns, including charts mounted after loading skeletons. Activity heatmaps reveal cells in a radial wave from the visible grid's top-left, first empty and then colored by a second wave starting 150ms later. The waves overlap. Reduced motion shows the settled chart/grid state, and normal hover or responsive resizing does not restart the heatmap entrance.

The four requested Overview heading/description translation keys are present in English, Russian, Simplified Chinese, and Traditional Chinese. English follows each existing `t()` default. Pagination controls are localized in all four languages.


DL016 validation: `bun run verify` passes 632 tests, lint, TypeScript, and the production build; Go compile and both repository diff checks pass. Isolated Chrome CDP checks cover desktop and 390px mobile pagination, full filtered export, untruncated menu labels, centered control icons, visible chart entrances, overlapping heatmap waves, and reduced-motion behavior. Pending heatmap cells remain hidden until the entrance starts to prevent a colored flash.

Independent final QA passed: page 2 → global refresh → page 1 → Next loads page 2 correctly; empty results hide pagination. A live heatmap timeline confirms pending cells remain invisible before the empty wave, the color wave overlaps it, and cells settle to their final colors.


### DL017: Keys ranking without duplicated detail views

The Keys tab contains only its sortable ranking/catalog table and mobile cards. Removed the embedded per-key Overview, Analysis, recent events, their requests, and the View details action column/buttons. Shared key filters still scope the dedicated Overview, Analysis, and Attempt history tabs. Removed unused detail styles and the obsolete action-column test.

Validation: 631 tests, lint, TypeScript, production build, Go compile, and diff checks pass. Isolated Chrome CDP at 1440px and 390px confirms populated rankings, no detail sections/buttons, and no horizontal page overflow.


### DL018: Provider logos in Event filters

The Events provider dropdown and selected value display existing provider brand logos. Select options accept optional icons, and ProviderCategoryList shares its themed logo renderer with Events. Analytics provider aliases resolve to their matching brand; Antigravity uses its existing OAuth asset. Unknown custom providers retain their text labels.

Validation: isolated Chrome CDP at 1440px/light and 390px/dark confirms every mock provider option has one visible, loaded logo. Frontend tests, lint, TypeScript, production build, Go compile, and diff checks pass.


### DL019: Preserve ECharts entrance on initial page load

AnalyticsChart skips ResizeObserver callbacks when the chart already matches its host dimensions. The observer sends an initial notification after registration; calling ECharts resize for that unchanged geometry cancelled the initial entrance animation. Actual size changes still resize the chart.

Validation: an isolated Chrome CDP reload trace reproduced one rendered frame per sparkline before the fix and 52–53 frames afterward. At 390px all six SVG widths match their 292px hosts. Frontend verification passes 631 tests, lint, TypeScript, and build; Go compile and diff checks pass.


### DL020: Analytics card scroll reveals

Analytics view cards reuse the dashboard useRevealOnScroll hook through AnalyticsCard. Each card rises 24px and fades in over 450ms on first entering the viewport; reduced motion leaves cards visible. The shared Card accepts a DOM ref so the reveal adds no layout wrapper. Event detail sheets retain their existing entrance.

Validation: isolated Chrome CDP at 1440px and 390px confirms offscreen cards start transparent, reveal on scroll, and settle at opacity 1 with no transform. Reduced-motion emulation leaves zero hidden cards. All 631 tests, lint, TypeScript, production build, Go compile, and diff checks pass.


### DL021: Single analytics entrance after tab changes

Removed the superseded workspace-wide fade now that analytics cards reveal individually. The workspace animation started around 390ms into the cards' 450ms entrance on tab switches, causing the visible second fade. Card scroll reveals, route transitions, ECharts activation, and the heatmap ripple remain.

Validation: isolated Chrome CDP reproduced overlapping card/workspace starts before the fix and no workspace animation afterward. Desktop and 390px mobile scroll reveals still settle at opacity 1 with no transform. All 631 tests, lint, TypeScript, production build, Go compile, and diff checks pass.


### DL022: Coordinated analytics palettes

Categorical chart colors use consistent blue, emerald, violet, amber, and cyan roles with separate light/dark lightness and chroma. The palette is authored in OKLCH in Sass, gamut-mapped and rounded to legacy RGB during compilation so ECharts/ZRender gradients and animation need no runtime converter. Cost overlays and success/failure markers have separate readable colors. All three stacked-bar builders use card-colored 1px boundaries, keeping adjacent bands distinguishable without forcing alternating near-black and pastel fills.

Overview activity has its own blue volume ramp for light/white surfaces and clearer coral/amber/emerald health levels. Dark Token Activity, dark Request Health, and the Key × Model matrix ramp remain exactly unchanged. Palette tests compile real Sass, check perceptual category distances, graphical/text contrast, ordered volume ramps and empty cells, verify raw emitted values with ZRender, and pin preserved scales.

Validation: `bun run verify` passes 644 tests, lint, TypeScript, and production build; Go compile and repository diff checks pass. Isolated Chrome CDP comparisons cover all Analysis cards and Overview heatmaps across light, white, and dark themes; mobile light/dark routes have no horizontal page overflow. Fresh independent review passes, including preservation and raw RGB compatibility.


### DL023: Analytics table controls and Quick Stats timing

Analytics Management uses the Lucide notebook-pen sidebar icon. Pricing rules and missing prices, provider summaries and credentials, and shared views render pages of at most 50 entries. Tables with actions keep the rightmost Action column visible while scrolling horizontally. Shared TablePagination provides localized page and row counts.

Model Cost Efficiency replaces the former efficiency list with a 10-row table containing model name, observed requests, token volume, and known price per million tokens. Each column is sortable. A case-insensitive substring search sits beside the card title and resets pagination. Existing cost calculation is reused, and labels are translated in all four locales.

Quick Stats sparklines run 15% faster: initial duration 870ms and update duration 435ms. Their initial starts are staggered by 70ms in DOM/display order so left-to-right, top-to-bottom entrances overlap. Reduced-motion and responsive resizing behavior remain.


DL023 validation: `bun run verify` passes 646 tests, lint, TypeScript, and production build; Go compile and both diff checks pass. Live CDP checks confirm the Model Cost Efficiency 10-row limit, case-insensitive search, numeric sorting, mobile layout, and staggered Quick Stats frames. After the dev backend temporarily rate-limited fresh logins, isolated browser read fixtures verified all five management tables with 51 rows: 50 on page 1 and 1 on page 2, with mobile Action columns pinned within 0.5px of the scroll edge. Synchronous page clamps and a regression test prevent stale rows/ranges after a collection shrinks. Fresh independent review passes.

### DL023: Shared upstream surfaces touched by the analytics UX pass

The DL013–DL022 work makes small additive changes to files that upstream CPAMC also owns; the next upstream sync should expect conflicts there and preserve the fork side:

- `src/components/ui/Button.tsx` — optional `icon` prop rendered before the label (hidden while loading).
- `src/components/ui/Card.tsx` — optional `ref` forwarded to the root `div` (React 19 ref-as-prop) so scroll reveals need no wrapper.
- `src/components/ui/Select.tsx` / `Select.module.scss` — optional `icon` on `SelectOption`, rendered in the trigger and option rows.
- `src/components/ui/Table/Table.module.scss` — one rule for a sticky trailing action column.
- `src/styles/components.scss` — `.btn-icon` sizing for the Button icon slot.
- `src/components/layout/MainLayout.tsx` — sidebar selection scoped to the analytics parent page.
- `src/features/providers/components/ProviderCategoryList.tsx` — logo rendering moved into the shared `ProviderLogo` component (also used by Event filters, DL018).

No upstream behaviour changes; every addition is opt-in through a new prop or class.


### DL024: Labeled API-key editor contract alignment

The API-key editor supports optional exact UTF-8 labels while keeping stable key IDs for identity and
operations. Display rows resolve their original server-side indexes, so blank or malformed entries do
not shift edit, delete, identity, or usage-limit actions. Label-only updates omit an unchanged limits
field. When a visible limit changes, the editor starts from the existing limits object and preserves
unknown extension fields. The API client retains null contract slots and the model-key hook filters them
only at its string boundary.

Validation: `bun run verify` passed 651 tests, lint, TypeScript, and the production build. After pinning
the server index when an edit modal opens, the eight API-key contract tests, ESLint, TypeScript, and
production build passed again. On 2026-09-06, isolated Chrome CDP checks against a real CPA backend
through a same-origin test proxy exercised label creation, editing, and clearing at 1440px desktop
and 390px mobile widths. Checks confirmed exact multiline Unicode labels, short-ID fallback, correct
server indexes after a blank config entry, preservation of unknown limit fields, and mobile key
rotation. The mobile view had no horizontal overflow or visible raw key text; browser console errors
were empty.


### DL025: Lazy models.dev pricing catalog and manual overrides

Pricing displays the effective catalog while keeping discovered `models.dev` rows separate from
manual overrides. Editing a discovered row creates a management override, and removing an override
sends only the remaining overrides so the discovered rate returns. Provider-scoped model and alias
matches remain distinct from global matches. The page explains the six-hour lazy cache and active-user
refresh behavior and shows catalog update and expiry times when CPA supplies them. All four locales
carry the added pricing copy.

The first asynchronous catalog response is shown as a loading state and triggers at most twelve
one-second refreshes while `sync_state` is `refreshing`; polling stops after readiness, failure,
unmount, or the bounded attempt limit. Shared analytics cost labels now identify API-equivalent
estimates, with a pricing note explaining that subscription billing is not measured.

Validation: targeted pricing/API tests, ESLint, TypeScript compilation, and the Impeccable detector pass.
### DL030: Readable analytics chart labels and token breakdowns

Usage Distribution and Key × Model Heatmap axes display a configured key label or fall back to the
short key ID. Tooltips retain the label and short ID together. Usage Distribution adds a wrapping
color legend and tooltip counts for input, output, cache read, cache creation, and reasoning tokens.
The counts use the same mutually exclusive categories as the stacked bars and reuse existing
translations and palette colors.

Heatmap model headers truncate with ellipses within their column width instead of hiding overlapping
names. Width follows the chart container, including after analytics data loads and when it resizes.
Cell tooltips retain the full model name.

Validation: `bun run verify` passed 651 tests, lint, TypeScript, and the production build. The CPA
server compile check and both repository diff checks passed.
Isolated Chrome CDP checks on 2026-09-07 verified desktop and 390px mobile layouts against the copied
main-worktree mock data, including a cold mobile login. Named keys showed labels on axes and both
identifiers in tooltips; unnamed keys retained short IDs. All selected model headers stayed visible,
the legend wrapped without horizontal overflow, and tooltip category counts matched the bars.

### DL026: Compact latency tiles and animated analysis metrics

Latency tiles use tighter spacing and larger values. The Sampled badge shares the label row and
aligns to the card's right edge. Mobile latency summary values are larger too.

Analysis card metrics reuse the dashboard's count-up hook through `AnimatedMetric`. Counters begin
when visible, preserve exact final values and locale formatting, and honor reduced motion. Coverage
includes cost totals and category amounts/shares, blended rate, latency summary values and sample
count, and Top Models totals/shares. ECharts, tooltips, model-efficiency tables, sample-browser rows,
and rank ordinals keep their existing rendering.

Validation: `bun run verify` passed 651 tests, lint, TypeScript, and the production build.
Isolated Chrome CDP checks at desktop and 390px verified intermediate count-up frames on scroll,
exact final costs, percentages, durations and counts, and reduced motion without intermediate counts.
Latency values render at 22px on desktop and 20px on mobile with no horizontal page overflow.
A browser-only sampled-response fixture verified that the Sampled badge shares the label line and
aligns to its right edge; the override was removed after checking.

### DL027: Reject invalid management capabilities responses

The capabilities adapter rejects HTML and incomplete response objects before analytics consumes
them. A dev server's SPA fallback previously returned HTML with HTTP 200, which the client accepted
as capabilities and then crashed while reading `analytics.supported`. Invalid responses now use the
existing load-error path and explain that the API server URL must point to the management API.
The HTTP 404 fallback for older servers remains unchanged. A regression test covers the HTML response.
The diagnostic is translated into all four supported locales. Chrome CDP verified the default
same-origin login and populated Analysis route, plus a browser-intercepted HTML response producing
the diagnostic without an exception. The temporary development server forwards `/v0` and `/v1` to
the mock backend, so its default login address now serves the actual management API.
Validation: `bun run verify` passed 652 tests, lint, TypeScript, and the production build; the CPA
compile check also passed.

### DL028: Animated overview and activity summaries

Overview KPI values, numeric details, daily averages, and the Token Activity and Request Health
summary strips reuse `AnimatedMetric`. The component lives under `features/analytics/components`
and is shared with Analysis. Values count up when visible and preserve their existing final
formatting, missing-value display, and reduced-motion behavior. Heatmap cells, tooltips, tables,
and descriptive range text retain their existing rendering. KPI sparkline entrance duration is
541ms; its update duration remains unchanged.
Chrome CDP checks at 1440px desktop and 390px mobile verified count-up frames, offscreen activation,
exact final costs/rates/averages, and reduced motion with no page overflow or console errors.
Fractional metrics use finer counter precision: RPM visibly counted from zero through 0.063 and
0.072 to 0.073, while request counts remained integers.

### DL029: Filter Usage Distribution by token category

The Usage Distribution legend uses keyboard-accessible toggle buttons with pressed states. Hidden
categories are muted and contribute zero to the stacked bars; bar-end labels show the visible sum,
including zero when every category is off. Selections persist across distribution dimension tabs.
Filtered tooltips show selected category counts and distinguish Displayed tokens from the full
Total tokens. Original cost, requests, and overall token share remain available for context.
Axis labels fit within their left gutter and truncate long names with ellipses instead of clipping
their prefixes. Validation: `bun run verify` passed 654 tests, lint, TypeScript, and the production
build. Chrome CDP verified mouse, keyboard and mobile touch toggles, filtered tooltip totals, hiding
the last category, all-off/re-enable behavior, and selection retention across dimension tabs.

### DL030: Remote development access

Vite listens on all network interfaces and accepts all host names so the existing mock-data
workspace can be opened through a remote IP address or a custom development hostname.
Validation: the running development server on port 18517 returned HTTP 200 with a custom Host header.

### DL031: One-minute analytics refresh

A shared one-minute refresh coordinator updates visible analytics, respects Retry-After, skips
hidden documents, and avoids overlapping refreshes. Queries resolve rolling ranges at request time.
Current chart data and selections remain while refreshing. In-flight request deduplication is scoped
to the active query generation so StrictMode and filter changes cannot leave a stale loading state.

Validation: nine refresh and shell tests pass. Isolated browser checks reproduced and verified
StrictMode completion, newest-filter responses, and same-query refresh deduplication.

### DL032: Cost and timing radar analytics

Cost Breakdown and Usage Distribution share a row at the existing desktop breakpoint. The cost
radar uses a four-axis diamond, category-colored gradients that fade toward the center, and
clockwise staggered growth with synchronized currency labels. Totals and category details remain.
Latency Diagnostics pairs its scatter plot with a timing radar. A shared segmented control selects
p95, maximum, or median for both charts without replacing their ECharts instances. Missing timing
stays unavailable and renders as partial spokes instead of invented zero values. All timing axes
share one millisecond scale. Model efficiency includes each cost component and its dimmed share;
numeric column headers align with values. Token-chart tooltips distinguish dashed requests from
solid cost lines. The key-model heatmap switches between tokens, cost, and observed generation time.

Validation: `bun run verify` passed 670 tests, ESLint, TypeScript, and the production build.
Isolated Chrome CDP checks at 1440px and 390px verified colored gradients, staggered currency
values, unclipped mobile timing labels, persistent chart instances across modes, explicit unavailable
heatmap cells, and dashed/solid tooltip markers. Full timing data was checked using a browser-only
fixture; the normal historical mock dataset correctly leaves missing timing unavailable.

### DL033: Processing totals, comparisons, and lifetime key activity

Quick Stats includes accumulated processing time beside the narrower Daily Average card. Its
breakdown distinguishes missing observations from measured zero and explains coverage in upstream
attempts. Each metric has at least seven range-specific comparisons, with estimates, constants,
and substituted calculations available on hover, keyboard focus, or touch. All four locales are
included. Accumulated durations use readable time units.
The key catalog adds the top model and its token count, observed generation time, and requests.
Config indexes precede lifetime first/last activity at the right edge. Dates show relative time and
a full date in the client browser's timezone. Configured keys show Active for activity in the last
five minutes and Idle otherwise. Column help and mobile cards describe the same metrics.

Validation: `bun run verify` passed 670 tests, ESLint, TypeScript, and the production build.
Isolated Chrome CDP checked desktop/mobile Overview and Keys, whole-phrase hover, first-tap
tooltips constrained to the mobile viewport, the two-column Daily Average layout, and lifetime
dates in America/New_York. There was no page overflow or console error. A full one-minute
refresh cycle fetched the visible queries without replacing chart instances or mode selections.

### DL034: Shared segmented controls, table sorting, and custom tooltips

Auth Files and analytics use one SegmentedControl extracted from the Auth Files toolbar, retaining
its pill shape, active styling, and problem-state color. SortableTableHead now lives with the shared
Table component. Numeric headers place the arrow before their label and text headers place it after;
the key catalog uses the same styled control instead of unstyled native buttons.
A root TooltipProvider converts native title hints into custom panels using the ECharts tooltip
tokens. It supports dynamically updated and removed hints, viewport placement, keyboard focus,
Escape dismissal, and touch. Title-only icon controls retain accessible names. Existing custom
panels use the same colors, border, radius, and padding. Touch release does not dismiss a tapped hint.

Validation: `bun run verify` passes 673 tests, ESLint, TypeScript, and the production build. Chrome
CDP reproduced the key header's native gray background and outset border before the fix, then
verified transparent styled headers and correct sort-arrow placement. Isolated browser checks
verified dynamic title updates/removal, accessible names, focus/Escape, removed targets, and mobile
first-tap tooltips constrained to the viewport. No console errors were observed.

### DL035: Full-width metric trends and compact processing totals

Quick Stats trends extend to the card's left, right, and bottom edges, retaining their content gap
and using a taller plotting area. Processing time uses the metric-card hierarchy with accumulated
E2E as its primary value and ECharts timing bars below. It precedes Daily average, which spans two
columns; both cards fill their tracks and share a height. Coverage stays in the comparison tooltip.
The separate How we compare section is removed, and relevant scale assumptions appear with the
comparison that uses them. Existing worktree spacing edits are retained.

Validation: the 673-test full verification passes. Desktop browser measurements confirm both
summary cards fill their tracks, with widths of about 369 and 749 pixels and equal 306-pixel heights
at a 1440-pixel viewport. The KPI plots meet the card edges, and comparison explanations remain
available through hover, keyboard focus, and touch. All four locales include the relevant scales.

### DL036: Compact analysis cards and visible radar animation

Cost Breakdown places totals and its category list beside the radar when the card has enough
internal width, with a smaller blended-rate gap. Container sizing preserves the existing viewport
breakpoint and avoids overflow at intermediate widths. Cost Breakdown and Usage Distribution fill
the same row height. Both radars use more noticeable clockwise axis delays; currency values follow
the cost geometry. Latency animation begins when visible, honors reduced motion, and correctly
starts after an empty range becomes populated. Every latency summary metric has a short custom
measurement explanation. Every model-efficiency column sorts through the shared table header.
Refresh states retain their spinner without dimming cards or covering charts with a translucent fill.

Validation: `bun run verify` passes 673 tests, lint, TypeScript, and production build. Browser checks
at 390, 1024, and 1440 pixels show no page overflow; paired analysis cards have equal heights.
All added cost sorts reorder displayed rows. Focus opens the latency metric explanations. An isolated
actual-component probe changes empty timing data to populated data and verifies both chart hosts
appear with final 10-second E2E and 1-second TTFT values. Radar order and all cost sort keys have
focused regression coverage.

Usage Distribution displays the eight highest-token items in each dimension. Token shares retain
the denominator of all returned rows, so limiting the visible list does not inflate percentages.

Full-width metric trends clip their contents to the card’s inherited bottom corner radii,
preventing chart fills from extending beyond the rounded card edge.

Processing Time keeps its accumulated E2E value, comparison, and timing details without a chart.
Removed the unused bar-chart helper and styles. Validation: `bun run verify` passes 672 tests,
lint, TypeScript, and build; desktop and mobile browser checks show the summary without chart
hosts or page overflow.

Manual header refresh restores the previous 58% content opacity while automatic refresh keeps
cards fully visible. The analytics status shows a spinner and Refreshing text during refresh
instead of reverting to a skeleton. Initial capability loading retains its placeholder.
Browser checks at desktop and mobile widths confirm manual opacity 0.58 and automatic opacity 1;
mobile checks also confirm the Refreshing status without a skeleton for both triggers.

Latency radar geometry uses a shared log10 millisecond scale across all axes and modes.
Values at or below 1 ms map to the center; missing values remain unavailable. Tooltips and
partial-radar numeric labels retain the original duration values.

Fable supplied replacement TPM comparisons for tweets, days of talking, and English Wikipedias
per day, plus a cache déjà vu comparison. Formula tooltips and all four locales match the new
references. A private-jet cost band splits the old Super Bowl range at 25 million USD, leaving
the cars range unchanged. Usage Distribution and Key × Model Heatmap use underlined tab controls
with keyboard navigation and labelled panels; other segmented controls retain their appearance.
Validation: 673 tests, lint, TypeScript, and production build pass. Isolated browser checks at
1440 and 390 pixels confirm both tablists switch with arrow keys, focus the selected tab,
reference the active panel, and introduce no page overflow or console errors.

Usage Distribution replays its 600 ms bar entry animation when its dimension changes. The chart
instance stays mounted and reduced-motion preferences suppress the replay. Validation: 673 tests,
lint, TypeScript, and build pass; browser sampling confirms changing animation frames and an
unchanged ECharts instance after switching modes, with no console errors.

Key usage catalog cells align vertically at their centers. Active key badges use the success
color and deleted keys use the error color. Every key status has a localized explanatory
custom tooltip, and the Status column tooltip describes configuration, recent use, and history.

Usage Distribution now retains all dimension series and switches their visibility through a
hidden legend using merged ECharts updates. Stable category labels prevent unrelated renders
from replacing options. The chart reserves the largest dimension's height so resize does not
cancel the transition. This supersedes the dimension-triggered clear-and-replay behavior above.
Browser frame sampling confirms a continuous transition and the same ECharts instance.

The near-total cache comparison and tooltip use the EUV lithography analogy in all four locales,
matching the comparison model fallback.

### DL037: Per-hop event detail sheet with request-path timeline and timing graph

Status: shipped

Files: `src/features/analytics/views/events/EventDetailSheet.tsx`,
`src/features/analytics/views/events/EventDetailParts.tsx`,
`src/features/analytics/views/events/EventTimeline.tsx`,
`src/features/analytics/views/events/EventTimingGraph.tsx`,
`src/features/analytics/views/events/eventDiagnostics.ts`,
`src/features/analytics/views/events/EventDetail.module.scss`, `src/types/analytics.ts`,
`src/i18n/locales/{en,ru,zh-CN,zh-TW}.json`, `tests/analyticsEventDiagnostics.test.ts`

The analytics event detail sheet keeps every field the previous sheet showed and adds the four
CPA hops. `src/types/analytics.ts` gains nullable, additive fields for the client request
(`client_method`, `client_path`, `received_at`), the upstream request (`upstream_method`,
`upstream_url`, `upstream_sent_at`), the provider response (`upstream_status_code` on success,
`upstream_usage_raw`, `upstream_error_body`), and the CPA response (`proxy_status_code`,
`proxy_error`, `responded_at`). Every field may be null for events recorded before the upgrade.

`eventDiagnostics.ts` holds the React- and i18n-free derivations. `buildEventTimeline` marks the
failure point across Client, CPA, Provider, CPA: a failure before dispatch fails the CPA
node, a provider error status fails the Provider node, and a broken relay after a usable upstream
response fails the return CPA node. Steps after the failure are `skipped`; steps CPA never recorded
stay `unknown` rather than being guessed. `buildEventTiming` derives Routing, Provider, and
Generation on one latency scale plus a Total, leaving unrecorded segments null instead of
back-filling. A minimal JSON tokenizer highlights the stored provider usage node read-only, and raw
provider error and CPA error bodies render in collapsible copyable blocks.

The sheet stays utilitarian and dense: a status strip, a four-node request-path timeline with
green complete, red failed, grey never reached, and dashed unknown states, a timing bar graph with
a provider status pill and an inline "N tokens - X tok/s" generation label, four hop sections as
two-column definition lists with the failed hop flagged and expanded, and the existing tokens and
cost rows. Timeline nodes are keyboard focusable and reuse the shared tooltip that promotes the
`title` attribute, so hover and focus both surface a timestamp and one-line summary. The timeline
wraps to vertical on mobile. All new strings resolve through i18n with defaults in English, Russian,
Simplified Chinese, and Traditional Chinese.

Validation: `bun run verify` passes 689 tests, lint, TypeScript, and the production build.
`analyticsEventDiagnostics.test.ts` covers success with every field, a provider 429, a CPA-side
failure without `upstream_sent_at`, a mid-stream failure after a 200, and a legacy event with no
new fields, plus the timing and raw-payload helpers. Isolated CDP browser checks at 1440x900 and
390x844 in light and dark, with event-detail fixtures injected through the Fetch domain over a
legacy backend, confirm the failed provider node, the timing pill and muted "not recorded" rows,
the all-green success path with the generation label, keyboard-focus tooltips, and no overflow or
overlap.

Event detail follow-up: the timeline ends at CPA, where the recorded response status and timestamp
are shown, including error statuses after an earlier failure. There is no inferred client delivery
node. Fact grids clip the first row divider at their top edge across responsive column counts and
full-width facts, avoiding a second line below section headings.

Follow-up validation: 689 tests, lint, TypeScript, and the production build pass. Isolated Chrome
CDP checks against the dev server on port 18527 at 1440x900 and 390x844 in light and dark themes
confirm four timeline nodes, CPA status 200/429 on the final node, the first fact-row divider
clipped, and no horizontal overflow. The CPA server compile check also passes.

Audit corrections: event details read CPA's `upstream_usage_raw` field directly. Timing totals
prefer the recorded arrival-to-response span, including routing, and fall back to attempt latency
for legacy events. Regression coverage checks the API field name and routing-inclusive total.

Audit-fix validation: `bun run verify` passes 691 tests, lint, TypeScript, and the production
build. Isolated Chrome CDP checks at 1440x900 and 390x844 confirm the raw provider payload
renders and a 3.47-second arrival-to-response span displays as 3.5 seconds, rather than the
3.29-second attempt latency. Neither viewport has horizontal overflow. CPA compiles.
