# Cli-Proxy-API-Management-Center Fork

<!-- In-synced fork: maintained with the `syncfork` skill. -->

This fork is the management panel that the Type-Delta CLIProxyAPI fork (CPA) ships. It adds the CPAUK analytics workspace, labeled and limited API-key management, quota summaries and history, and configuration screens for CPA's fork-only features. It started from upstream commit `d249ff008e0bc2803deb23fb3e2c62418a1e8d17`.

## Divergence Log

Each behavior where this fork differs from upstream has one entry here. If you change code in this repository, check if this log needs an update.

The rules:

- Update the entry that owns the behavior you changed, or add an entry with the next unused ID. One entry covers one behavior, not one commit.
- Describe the current behavior, why the fork needs it, and how it composes with upstream's related behavior. When the behavior changes, rewrite the entry. Do not append a changelog; git and the Merge History hold history.
- Under **Implementation evidence**, list the key source files and tests. Under **Recorded validation**, list the checks that proved the current behavior.
- Set **Last updated** to today's date on every entry you touch.
- Never reuse an ID. Retire an entry only with the user's explicit approval: delete it and name the retired ID in the next Merge History entry.
- When an ID conflicts from merges, renumber the IDs as needed.
- A change that does not alter how the fork differs from upstream (formatting, or an edit to this file) needs no entry.

### DL002 — Revisioned structured API-key management

CPAMC reads legacy string keys and structured key objects without coercing objects to strings. Row edits preserve unknown entry and limit fields, use the configuration index plus revision on supported CPA versions, and block structured limit writes on older versions. Raw keys remain available to administrators but start concealed. Reveal and raw-copy actions are per row, revealed state clears when the route or authenticated connection changes, and full SHA-256 key IDs remain internal until the administrator explicitly copies one. The visible identity uses the shortest collision-safe even-length prefix starting at 12 characters. The existing configuration page now shows request and token caps, reset cadence, current consumption, and confirmed counter reset.

Compatibility tests cover legacy and structured fixtures, unknown-field preservation, duplicate full IDs, and colliding display prefixes.

**Implementation evidence:** `src/types/apiKeys.ts`, `src/services/api/apiKeys.ts`, `src/services/api/capabilities.ts`, `src/services/api/transformers.ts`, `src/hooks/useVisualConfig.ts`, `src/features/config/components/blocks/ApiKeysCardEditor.tsx`.

**Recorded validation:** On 2026-08-31:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 427 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

**Last updated:** 2026-08-31

### DL003 — Isolated analytics workspace

CPAMC keeps the existing dashboard and shell and adds a capability-gated Analytics workspace with eight lazy, route-contained pages: Overview, Analysis, Keys, Events, Pricing, Providers and quotas, Shared views, and Maintenance. The sidebar has one Analytics entry; the workspace tab strip groups Usage and Manage pages. The former Leaderboard route redirects to Keys, where rank-by tokens or cost absorbs its local ranking. Applicable reads use the versioned POST query contract. Full key IDs remain in memory and request bodies, catalog cursors use `X-Analytics-Cursor`, multi-key filters stop at 100 keys, and the client normalizes nullable empty Go collections before rendering. The key catalog covers the bounded 10,000-key lifecycle maximum.

Keys use backend token or known-cost ranking, opaque cursor pagination, stable backend ties, and explicit unpriced-token disclosure. Short collision-safe key references may appear in hash URL state; full hashes stay in request bodies and in-memory values only. Shared-view credentials appear only in one-time fragment links, are removed from history before decoding or exchange, and are never stored in browser storage. Failed credential exchanges stop the loading state and show the localized error. The durable viewer list exposes only labels, expiry, and revocation controls in the UI. Maintenance uses pollable jobs and the preview, batch ID, backup, and confirmed purge sequence. All four supported locales include the new routes and states.

**Implementation evidence:** `src/features/analytics/**`, `src/services/api/analytics.ts`, `src/types/analytics.ts`, `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `src/App.tsx`.

**Recorded validation:** On 2026-08-31:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 436 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated Chrome DevTools Protocol run against a live local CPA exercised all nine routes at 1440 by 900 and Overview, Keys, Leaderboard, Shared views, and Maintenance at 390 by 844. It found no body overflow, unreachable non-scrollable controls, positive-tabindex ordering, API alerts, or runtime exceptions after the nullable-collection fix.

**Last updated:** 2026-09-03

### DL004 — Analytics configuration and navigation clarity

The eight Analytics workspace tabs use distinct vendored Lucide icons, while the sidebar exposes one Analytics entry. The Config Panel Common tab exposes every durable analytics setting through the same typed controls used by Logging and Diagnostics. The visual YAML adapter loads and writes the complete nested `analytics` contract, changes only dirty fields, and preserves unknown YAML fields.

Frontend validation matches CPA's queue, batch, duration, retention, circuit, signed 64-bit storage, and trusted proxy CIDR constraints. Storage byte values retain full `int64` precision. Path help identifies `identity.key` and `viewers.json` as companion files beside the SQLite database. CRLF input is normalized before YAML parsing and diff normalization so serialized comments cannot retain stray carriage returns or gain visible blank lines on Windows.

**Implementation evidence:** `src/components/layout/MainLayout.tsx`, `src/components/ui/icons.tsx`, `src/features/config/**`, `src/hooks/useVisualConfig.ts`, `src/types/visualConfig.ts`, `src/utils/yaml.ts`, `src/i18n/locales/**`, `tests/visualConfigAnalytics.test.ts`.

**Recorded validation:** On 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 441 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated raw Chrome DevTools Protocol run against a live local CPA checked the Common panel at 1440 by 900 and 390 by 844. All 12 analytics controls rendered, all nine Analytics links used SVG icons with no fallback dots, invalid CIDRs showed an error, a real `analytics.enabled` save and reload succeeded, and the run found no horizontal overflow or runtime exceptions.

**Last updated:** 2026-09-03

### DL005 — Analytics navigation and key-filter parity

Every Analytics route uses one routed tab bar with the same underline, bottom rule, icon sizing, interaction states, horizontal scrolling, and desktop/mobile content rhythm as the Config Panel tabs. Analytics page order, its eight vendored Lucide icons, and its Usage and Manage groups come from one registry shared with the single Analytics sidebar entry. The Config Panel also keeps a visible 20 px desktop and 16 px mobile gap between the Common and Durable Analytics cards.

The Analytics key scope is a searchable multi-select dropdown. An empty selection continues to mean all keys and omits `key_ids` from query bodies; explicit selections retain full key hashes only in memory and request bodies, stop at 100 keys, and show friendly labels alongside collision-safe short hashes. Short references may be represented in hash URL state without exposing full hashes. Selection applies without closing the menu, search covers labels, short hashes, and lifecycle status, and the Keys catalog no longer duplicates that search field. The control includes keyboard navigation, listbox semantics, loading, retry, empty, and no-match states. It caps the rendered option window at 200 while search continues to cover the full catalog. The Keys catalog also keeps the short hash visible when a friendly label exists.

**Implementation evidence:** `src/features/analytics/**`, `src/components/layout/MainLayout.tsx`, `src/features/config/ConfigPage.module.scss`, `src/i18n/locales/**`, `tests/analyticsContracts.test.ts`.

**Recorded validation:** On 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 447 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- Isolated raw Chrome DevTools Protocol runs against the Docker Compose stack verified the nine icon tabs, active underline and bottom rule, 20 px desktop and 16 px mobile tab-to-body spacing, searchable two-key selection, menu persistence, all-keys reset, two-stage Escape behavior, internal-only full hashes, viewport-contained menus, and no page overflow or runtime exceptions. The multi-key interaction used a synthetic three-key catalog response inside the isolated browser context; all other application traffic used the live CPA stack.

**Last updated:** 2026-09-03

### DL006 — Analytics control and state consistency

Analytics uses the shared Select component for every single- and multi-select control. Time range and API-key filters now share the same 40 px trigger and label typography, while the searchable multi-select retains full key IDs only as internal values and announces its current selection. Labeled keys remain collision-safe in filters, Keys, Shared views, and Maintenance by pairing the label with the short hash. Analytics buttons, dropdowns, and single-line inputs use a scoped 40 px control height; textareas and the existing ToggleSwitch keep their native dimensions.

Analytics stores the time range, selected keys, and Keys sort in hash URL state, without browser storage. Overview, Analysis, Keys, and Events share the range and key filter; Events adds its own provider, model, source, and result filters. Short collision-safe references may appear in that URL state, while full hashes remain body-only. Fork-owned Analytics loading paths use the shared Skeleton component with an accessible loading status, and Maintenance uses the existing ToggleSwitch for dry-run mode.

**Implementation evidence:** `src/components/ui/Select.*`, `src/features/analytics/**`, `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `tests/analyticsContracts.test.ts`.

**Recorded validation:** On 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 455 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- An isolated raw Chrome DevTools Protocol run against the Docker Compose stack exercised all nine Analytics routes at desktop and mobile sizes. All 33 visible buttons, dropdowns, and single-line inputs measured 40 px; no native selects, horizontal overflow, visible text loaders, or runtime exceptions remained. Delayed requests exposed Skeleton states, shared filters retained 30 days and two selected keys across routes, and the Leaderboard request omitted `key_ids`.

**Last updated:** 2026-09-03

### DL007 — Persistent Analytics shell and portal loading

Analytics keeps its module label, readiness badge, page-specific title and subtitle, and routed tab bar outside lazy route content. The active route body, including Suspense, capability, query-loading, unavailable, and error states, renders through one in-page portal host below the tabs. A host-owned Skeleton covers handoffs where rapid navigation advances the URL before the keyed page transition creates its next current layer, so the content slot never becomes empty or collapses. Outgoing and stacked transition layers cannot portal stale content, while a token registry prevents an outgoing cleanup from hiding a newer payload. The visible state badge uses the localized page state label.

The Analytics provider keeps one `PageTransition` instance mounted across Analytics and non-Analytics routes. Capability reads are enabled only while Analytics is active, and request generations prevent an older same-key response from replacing a newer result after refresh or leave and re-entry. The ready badge mirrors the Dashboard live badge geometry, typography, color, and pulse, appears immediately after “CPA Usage Keeper” above the title, and preserves the same geometry without animation for degraded and reduced-motion states.

**Implementation evidence:** `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `src/features/analytics/**`, `tests/analyticsContracts.test.ts`.

**Recorded validation:** On 2026-09-02:

- `bunx bun@1.3.14 run verify`
- Result: 462 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- The Impeccable UI detector returned no findings for the changed layout, Analytics, and routing files.
- An isolated raw Chrome DevTools Protocol run against the Docker Compose stack paused lazy capability and Analytics requests while switching Overview, Analysis, and Keys. The same shell, header, title, tabs, content host, and global page-transition nodes survived loading and route changes; header, tab, and host top coordinates remained exactly 82 px, 199 px, and 257.1875 px. A 60 ms Analysis-to-Keys double switch produced 78 samples with a minimum 222.546875 px content height and 29 host-Skeleton handoff samples. A newer ready capability response remained authoritative after an older disabled response completed late. Desktop, degraded, and 320 CSS-pixel Russian reduced-motion runs reported no overflow, runtime exceptions, or console errors.

**Last updated:** 2026-09-03

### DL008 — CPAUK-fidelity Analytics rebuild

Analytics now follows CPAUK's information model while using CPAMC's existing Card, Table, EmptyState, Skeleton, Select, and Dashboard SVG chart idioms. Overview has CPAUK-style KPIs, sparklines, daily averages, and activity heatmaps. Analysis has independently loaded cards for time series, models, latency, distributions, cost, efficiency, and key-by-model data. Keys combines ranking with range-aware drilldown. Events has dimension filters, row detail, export, total and loaded counts, and selectable persisted columns. Pricing, Providers and quotas, Shared views, and Maintenance are rebuilt as management pages, and Viewer shows the scoped usage journey.

Schema-v2 requests support named and custom ranges. Hash URL state carries shareable ranges, sort, and collision-safe short key references; query cursors freeze the resolved filter state. Full key hashes remain in request bodies only. The login flow restores Analytics deep links.

**Implementation evidence:** `src/features/analytics/**`, `src/services/api/analytics.ts`, `src/types/analytics.ts`, `src/components/common/{PageTransition.tsx,pageTransitionState.ts}`, `src/components/layout/MainLayout.tsx`, `src/router/MainRoutes.tsx`, `src/pages/LoginPage.tsx`, `src/i18n/locales/**`.

**Recorded validation:** On 2026-09-03:

- `bun run verify`
- Result: 495 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.
- The Impeccable UI detector returned no findings for the changed Analytics, shell, and routing files.
- Independent raw Chrome DevTools Protocol verification rendered all eight pages at 1440 by 900 and 390 by 844 in light and dark themes. It found no document overflow, unnamed controls, raw key or full-hash leaks, raw server enum tokens, console exceptions, or ordinary-navigation request failures. Deep-link login restore, cross-tab URL state, rapid route recovery, and same-route range updates passed.
- A seeded seven-day `Asia/Kolkata` Analysis run verified both 168-bucket time-series charts at their start, midpoint, and end. Each chart's 168 interaction targets measured exactly 40 px wide and aligned with its bucket centers to within 0.000244 px.

**Last updated:** 2026-09-03

### DL009 — Analytics accessibility, state-aware charts, and URL-carried filters

Overview KPI tiles are grouped as accessible sets with roving-tabindex heatmap grids, summarized chart `aria-label`s, and cost/error KPI tones that follow semantic status rather than raw color. The activity heatmap uses a neutral ramp with contrast-switching value labels and marks the selected range as its own query zone instead of relying on color alone. Analysis latency charts use log10 axes with mobile-sized latency tiles and a bounded "browse slowest samples" list; the key/model heatmap caps visible columns and reports how many are shown. Analysis cards load independently per section so one failed section does not block the rest, and each has its own retry. Route-level errors now retry in place instead of forcing a full reload. Events filters, the activity window, and the distribution tab persist to URL state so a shared link reproduces the same view; dimension pages follow the pointer instead of a fixed layout. Keys defaults to cost-descending sort, and Keys/Events fall back to mobile card lists below the table breakpoint. Pricing catalog sync now surfaces a real failure toast instead of assuming success, and reprice runs against the analytics workspace's active range (shown and explained in the Pricing view) instead of a fixed 24h/7d/30d choice. The Viewer route reuses the same KPI tile treatment as the authenticated pages. Fifty new `analytics.*` translation keys covering these views, including a new `analytics.maintenance.*` group for the Maintenance page's job, backup, restore, and purge copy, were added to all four locale files (`en`, `ru`, `zh-CN`, `zh-TW`) with matching key sets.

**Implementation evidence:** `src/features/analytics/**`, `src/i18n/locales/**`.

**Recorded validation:** On 2026-09-03:

- `bun run verify`
- Result: 521 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

Fork baseline validation on 2026-08-31, before DL002 and DL003:

- `bunx bun@1.3.14 install --frozen-lockfile`
- `bunx bun@1.3.14 run verify`
- Result: 424 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

**Last updated:** 2026-09-03

### DL010 — Round-4 analytics correctness — request dedupe, shared heatmap readout, viewer expiry, and locale fixes

Round 4 follows the round-3 critique (`ANALYTICS_CRITIQUE.md`, R3-1…R3-14). Concurrent identical `POST /analytics/query` calls are now deduplicated at the transport on the serialized body, so a StrictMode Analysis mount issues five requests instead of twenty; `Retry-After` is read from 429 responses and every Retry button counts down before re-enabling instead of re-firing into the throttle. Both heatmaps share one `HeatmapReadout` live region (`role=status`, never `aria-hidden`) driven by pointer, pointerdown and focus, and the token ramp uses a new dataviz-neutral `--viz-neutral` token instead of the shell chrome grey. Latency chart captions sit in reserved gutters and all chart ticks are 11 px. The viewer page renders the shared-view link expiry and the 30-minute session expiry as two dated sentences. Events rows are the keyboard target (one roving stop per table instead of one per badge), four never-populated columns were removed from the picker, and a retained-range failure names the retention cutoff. `AnalyticsTabs` is a real `tablist` with Arrow/Home/End navigation. Providers counters are labelled "Observed" with an explanation, and every Maintenance input has an accessible name. Latin technical acronyms (`TTFT`, `RPM`, `TPM`) were previously transliterated in `zh-CN`, `zh-TW`, and `ru`; they now stay Latin in every locale with glosses confined to `*_description` keys. `analytics.overview.window_*`, 32 `analytics.job_result.*` keys, and `analytics.enums.{source,service_tier,endpoint}.*` were added and wired through `formatAnalyticsEnum`; seven unreferenced keys were pruned; all four locales carry the same 564 `analytics.*` keys. A new `analytics.storage-time-zone` Config field validates against `Intl.supportedValuesOf('timeZone')` (guarded) and warns that changing it after retention requires an analytics reset.

**Implementation evidence:** `src/services/api/analytics.ts`, `src/services/api/client.ts`, `src/features/analytics/useAnalyticsLoad.ts`, `src/features/analytics/components/{AnalyticsShared,HeatmapReadout}.tsx`, `src/features/analytics/components/{analyticsErrorCopy,analyticsFormatting}.ts`, `src/features/analytics/AnalyticsTabs.tsx`, `src/features/analytics/ViewerPage.tsx`, `src/features/analytics/views/{Events,Providers,Maintenance,Overview}.tsx`, `src/features/analytics/views/{overview,analysis,events,viewer}/**`, `src/styles/themes.scss`, `src/i18n/locales/**`, `src/features/config/components/sections/AnalyticsSettingsFields.tsx`, `src/hooks/useVisualConfig.ts`, `src/types/visualConfig.ts`, `src/features/config/constants.ts`, `src/features/config/searchIndex.ts`.

**Recorded validation:** On 2026-09-03:

- `bunx tsc --noEmit`: 0 errors.
- `bun test`: 550 pass, 0 fail, 1986 expect() calls, 81 files.
- `bunx eslint` on the changed TS/TSX files above: 0 errors, 0 warnings.
- `bun run verify`: 550 tests passed, ESLint passed, TypeScript compilation passed, and the Vite single-file production build passed.

**Last updated:** 2026-09-03

### DL011 — Round-5 analytics UI hardening — chart palettes, Retry-After wiring, viewer origin, locale-independent tests

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

### DL012 — Round-6 analytics chart engine, navigation, and locale round-trip

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

### DL013 — Stable overview hover and Sunday-first activity cells

Overview sparklines keep explicit CSS-variable colors during ECharts emphasis, preventing hover from clearing the SVG line and area. Their cursor stays default because they have no click action. KPI sparkline options request body-level placement, while `AnalyticsChart` adapts that request into a per-chart fixed portal clipped to the viewport. When a port does not supply a custom position, the adapter places the panel 20px above and right of the pointer, translates the viewport-clamped point back to chart-local coordinates for ECharts, and preserves custom positions. This keeps the panel outside the card's rounded `overflow: hidden` boundary without letting a hidden stale tooltip coordinate create page overflow after a resize.

The activity calendars use a CSS grid with Sunday in the first row. Grid cells and legend swatches share the same 12 × 12px border-box size, rounded corners, and color classes, with 3px gaps. Monday, Wednesday, and Friday labels mark their rows while Sunday remains first. Weekday and month labels follow the app locale. Transparent 15 × 15px cell hitboxes meet across the 3px gutters, keeping hover active between neighboring 12px squares. Hover outlines the cell and immediately shows a styled day-detail tooltip through a body portal, outside the scrolling card. The tooltip sits above and to the right of the pointer, clamped inside the viewport. Its persistent panel uses the ECharts 400ms transform and 200ms opacity transitions, disabled for reduced motion. It dismisses on pointer exit, scroll, resize, or Escape. The monthly text alternative and live readout remain available. On narrow screens, each calendar shows the most recent whole week columns that fit beside the fixed weekday labels. A ResizeObserver adjusts the visible window as card width changes; the newest date stays visible without horizontal scrolling. Wider cards reveal older weeks, up to the full year. Yearly totals and the accessible monthly table retain the complete activity range.

**Implementation evidence:** `src/features/analytics/views/overview/overviewModel.ts`, `src/features/analytics/views/overview/{OverviewKpis.tsx,ActivityHeatmaps.tsx,Overview.module.scss}`, `src/features/analytics/components/{AnalyticsChart.tsx,AnalyticsChart.module.scss}`; tests: `tests/analyticsOverview.test.ts`.

**Recorded validation:** `bun run verify` passes all 626 tests, lint, TypeScript compilation, and the production build. Chrome CDP checks against the running dev server and its mock data at 1440 × 900 and 390 × 844 confirm KPI tooltip panels are visible at desktop and mobile probe points, preserve the existing ECharts motion and placement, and do not add page overflow. The resize regression check records the prior 1,219px scroll width after a desktop hover and 382px after the fix at a 390px viewport. The same checks confirm visible sparklines on hover, default computed cursors, all rendered cells at 12 × 12px, Sunday-first placement, fixed weekday labels beside the responsive date window, and visible hover tooltips and cell outlines on both calendars. Pointer probes in horizontal and vertical gutters reproduce missing tooltips before the hitbox fix and pass afterward. The calendar test covers unsorted dates, missing days, and year boundaries.

**Last updated:** 2026-09-05

### DL014 — Free KPI tooltip positioning

The KPI option removes `confine: true`, which had constrained a 64px tooltip to the 32px sparkline canvas and placed it over the graph. The adapter supplies a typed default position callback only for portaled tooltips without a custom position. It uses the document client width and height so scrollbar space is excluded from the viewport bounds. It clamps the desired viewport coordinates, then converts them through the chart host rectangle back to the coordinates ECharts expects before it translates them into the fixed portal. The portal's `overflow: clip` remains in place for stale coordinates after resize. Heatmap options and behavior are unchanged.

**Implementation evidence:** `src/features/analytics/components/{AnalyticsChart.tsx,AnalyticsChart.module.scss}`, `src/features/analytics/views/overview/{overviewModel.ts,OverviewKpis.tsx}`; tests: `tests/analyticsOverview.test.ts`.

**Recorded validation:** Targeted Bun tests and TypeScript checks pass. The CDP mock check covers desktop/mobile left, middle, and right probes, viewport containment, no console errors, and no document overflow after resize. Full results are in `free-tooltip.md`.

Responsive calendar verification (2026-09-05): isolated Chrome CDP at 1440 × 900 shows the full 365-day range in each heatmap. At 390 × 844, each shows the latest 18 week columns, including the newest day, with no horizontal grid or page overflow. Resizing back restores the full year. Independent review confirmed the fixed weekday labels, month labels, square cells, touching hitboxes, and day tooltips.

**Last updated:** 2026-09-05

### DL015 — Global analytics refresh and scoped sidebar selection

Analytics Usage and Analytics Management register their active-page refresh coordinator with the existing global header refresh hook. The floating header button refreshes capabilities/readiness, the key catalog, and the active analytics tab; the duplicate shell refresh buttons are removed. Coordinator refreshes propagate request failures to the existing header error notification while preserving local error/retry state. Automatic loads remain nonthrowing, and an in-flight guard prevents duplicate analytics refresh batches. Loaded views stay mounted while capabilities refresh, avoiding a second automatic request batch after refresh completion. Existing status, last-updated text, retry handling, and page loading behavior remain. The analytics shell unregisters its header callback outside analytics routes.

Analytics sidebar group matching now first checks that the current path belongs to `/analytics`. This prevents the page mapper's Usage fallback from marking Usage active on unrelated routes such as AI Providers. Existing analytics aliases and history navigation retain the correct Usage or Management highlight.

**Implementation evidence:** `src/features/analytics/{AnalyticsShell.tsx,analyticsRefreshState.ts,useAnalyticsLoad.ts}`, `src/hooks/useHeaderRefresh.ts`, `src/components/layout/MainLayout.tsx`, `src/features/analytics/navigation.ts`; tests: `tests/analyticsRefresh.test.ts`, `tests/analyticsContracts.test.ts`.

**Recorded validation:** `bun run verify` passes 630 tests, lint, TypeScript, and production build; Go compile passes. Isolated Chrome CDP checks show the global button refreshes Usage queries or Management pricing, refreshes no hidden analytics data on AI Providers, and leaves only the current sidebar route active across aliases and browser history. Failure injection confirms the header shows a failure notification without success, preserves local error state, and restores Unavailable analytics to Ready after capabilities recover. Independent final review records one key read and three query POSTs per Usage refresh, with no duplicate remount batch, runtime exception, or unhandled rejection.

**Last updated:** 2026-09-05

### DL016 — Attempt history pages and analytics entrance motion

Attempt history renders at most 50 records per page using the shared Pagination control. Cursor fetches load later pages on demand, and range/filter changes or a global refresh reset the page. Export continues to cover the selected filtered dataset; the Export menu is wide enough for its labels. Button accepts a separate decorative icon slot, used by the Columns control to align its icon with the label.

Analytics workspaces use the dashboard-style entrance timing. ECharts defers its initial frame until the route layer is visible and replays entrance motion when the active tab returns, including charts mounted after loading skeletons. Activity heatmaps reveal cells in a radial wave from the visible grid's top-left, first empty and then colored by a second wave starting 150ms later. The waves overlap. Reduced motion shows the settled chart/grid state, and normal hover or responsive resizing does not restart the heatmap entrance.

The four requested Overview heading/description translation keys are present in English, Russian, Simplified Chinese, and Traditional Chinese. English follows each existing `t()` default. Pagination controls are localized in all four languages.

**Implementation evidence:** `src/features/analytics/views/Events.tsx`, `src/features/analytics/views/events/eventPagination.ts`, `src/components/ui/{Pagination.tsx,Button.tsx}`, `src/features/analytics/components/AnalyticsChart.tsx`, `src/features/analytics/views/overview/{ActivityHeatmaps.tsx,Overview.module.scss}`; tests: `tests/analyticsEventPagination.test.ts`.

**Recorded validation:** `bun run verify` passes 632 tests, lint, TypeScript, and the production build; Go compile and both repository diff checks pass. Isolated Chrome CDP checks cover desktop and 390px mobile pagination, full filtered export, untruncated menu labels, centered control icons, visible chart entrances, overlapping heatmap waves, and reduced-motion behavior. Pending heatmap cells remain hidden until the entrance starts to prevent a colored flash.

Independent final QA passed: page 2 → global refresh → page 1 → Next loads page 2 correctly; empty results hide pagination. A live heatmap timeline confirms pending cells remain invisible before the empty wave, the color wave overlaps it, and cells settle to their final colors.

**Last updated:** 2026-09-05

### DL017 — Keys ranking without duplicated detail views

The Keys tab contains only its sortable ranking/catalog table and mobile cards. Removed the embedded per-key Overview, Analysis, recent events, their requests, and the View details action column/buttons. Shared key filters still scope the dedicated Overview, Analysis, and Attempt history tabs. Removed unused detail styles and the obsolete action-column test.

**Implementation evidence:** `src/features/analytics/views/KeysView.tsx`, `src/features/analytics/views/keys/{keyRanking.ts,KeysView.module.scss}`; tests: `tests/analyticsKeysView.test.ts`.

**Recorded validation:** 631 tests, lint, TypeScript, production build, Go compile, and diff checks pass. Isolated Chrome CDP at 1440px and 390px confirms populated rankings, no detail sections/buttons, and no horizontal page overflow.

**Last updated:** 2026-09-05

### DL018 — Provider logos in Event filters

The Events provider dropdown and selected value display existing provider brand logos. Select options accept optional icons, and ProviderCategoryList shares its themed logo renderer with Events. Analytics provider aliases resolve to their matching brand; Antigravity uses its existing OAuth asset. Unknown custom providers retain their text labels.

**Implementation evidence:** `src/features/analytics/views/Events.tsx`, `src/components/ui/{Select.tsx,Select.module.scss}`, `src/features/providers/components/{ProviderLogo.tsx,ProviderCategoryList.tsx}`.

**Recorded validation:** Isolated Chrome CDP at 1440px/light and 390px/dark confirms every mock provider option has one visible, loaded logo. Frontend tests, lint, TypeScript, production build, Go compile, and diff checks pass.

**Last updated:** 2026-09-05

### DL019 — Preserve ECharts entrance on initial page load

AnalyticsChart skips ResizeObserver callbacks when the chart already matches its host dimensions. The observer sends an initial notification after registration; calling ECharts resize for that unchanged geometry cancelled the initial entrance animation. Actual size changes still resize the chart.

**Implementation evidence:** `src/features/analytics/components/AnalyticsChart.tsx`.

**Recorded validation:** An isolated Chrome CDP reload trace reproduced one rendered frame per sparkline before the fix and 52–53 frames afterward. At 390px all six SVG widths match their 292px hosts. Frontend verification passes 631 tests, lint, TypeScript, and build; Go compile and diff checks pass.

**Last updated:** 2026-09-05

### DL020 — Analytics card scroll reveals

Analytics view cards reuse the dashboard useRevealOnScroll hook through AnalyticsCard. Each card rises 24px and fades in over 450ms on first entering the viewport; reduced motion leaves cards visible. The shared Card accepts a DOM ref so the reveal adds no layout wrapper. Event detail sheets retain their existing entrance.

**Implementation evidence:** `src/features/analytics/components/AnalyticsCard.tsx`, `src/hooks/motion.ts`, `src/components/ui/Card.tsx`.

**Recorded validation:** Isolated Chrome CDP at 1440px and 390px confirms offscreen cards start transparent, reveal on scroll, and settle at opacity 1 with no transform. Reduced-motion emulation leaves zero hidden cards. All 631 tests, lint, TypeScript, production build, Go compile, and diff checks pass.

**Last updated:** 2026-09-05

### DL021 — Single analytics entrance after tab changes

Removed the superseded workspace-wide fade now that analytics cards reveal individually. The workspace animation started around 390ms into the cards' 450ms entrance on tab switches, causing the visible second fade. Card scroll reveals, route transitions, ECharts activation, and the heatmap ripple remain.

**Implementation evidence:** `src/features/analytics/{AnalyticsPage.tsx,Analytics.module.scss}`.

**Recorded validation:** Isolated Chrome CDP reproduced overlapping card/workspace starts before the fix and no workspace animation afterward. Desktop and 390px mobile scroll reveals still settle at opacity 1 with no transform. All 631 tests, lint, TypeScript, production build, Go compile, and diff checks pass.

**Last updated:** 2026-09-05

### DL022 — Coordinated analytics palettes

Categorical chart colors use consistent blue, emerald, violet, amber, and cyan roles with separate light/dark lightness and chroma. The palette is authored in OKLCH in Sass, gamut-mapped and rounded to legacy RGB during compilation so ECharts/ZRender gradients and animation need no runtime converter. Cost overlays and success/failure markers have separate readable colors. All three stacked-bar builders use card-colored 1px boundaries, keeping adjacent bands distinguishable without forcing alternating near-black and pastel fills.

Overview activity has its own blue volume ramp for light/white surfaces and clearer coral/amber/emerald health levels. Dark Token Activity, dark Request Health, and the Key × Model matrix ramp remain exactly unchanged. Palette tests compile real Sass, check perceptual category distances, graphical/text contrast, ordered volume ramps and empty cells, verify raw emitted values with ZRender, and pin preserved scales.

**Implementation evidence:** `src/styles/themes.scss`, `src/features/analytics/components/chartTheme.ts`, `src/features/analytics/views/analysis/{analysisModel.ts,useAnalysisPalette.ts}`; tests: `tests/analyticsPalette.test.ts`.

**Recorded validation:** `bun run verify` passes 644 tests, lint, TypeScript, and production build; Go compile and repository diff checks pass. Isolated Chrome CDP comparisons cover all Analysis cards and Overview heatmaps across light, white, and dark themes; mobile light/dark routes have no horizontal page overflow. Fresh independent review passes, including preservation and raw RGB compatibility.

**Last updated:** 2026-09-05

### DL023 — Analytics table controls and Quick Stats timing

Analytics Management uses the Lucide notebook-pen sidebar icon. Pricing rules and missing prices, provider summaries and credentials, and shared views render pages of at most 50 entries. Tables with actions keep the rightmost Action column visible while scrolling horizontally. Shared TablePagination provides localized page and row counts.

Model Cost Efficiency replaces the former efficiency list with a 10-row table containing model name, observed requests, token volume, and known price per million tokens. Each column is sortable. A case-insensitive substring search sits beside the card title and resets pagination. Existing cost calculation is reused, and labels are translated in all four locales.

Quick Stats sparklines run 15% faster: initial duration 870ms and update duration 435ms. Their initial starts are staggered by 70ms in DOM/display order so left-to-right, top-to-bottom entrances overlap. Reduced-motion and responsive resizing behavior remain.

**Implementation evidence:** `src/features/analytics/views/{Pricing.tsx,Providers.tsx,SharedViews.tsx}`, `src/features/analytics/components/TablePagination.tsx`, `src/features/analytics/views/analysis/{modelCostEfficiency.ts,CostInsights.tsx}`, `src/features/analytics/views/overview/OverviewKpis.tsx`, `src/components/ui/Table/Table.module.scss`; tests: `tests/analyticsTablePagination.test.ts`, `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passes 646 tests, lint, TypeScript, and production build; Go compile and both diff checks pass. Live CDP checks confirm the Model Cost Efficiency 10-row limit, case-insensitive search, numeric sorting, mobile layout, and staggered Quick Stats frames. After the dev backend temporarily rate-limited fresh logins, isolated browser read fixtures verified all five management tables with 51 rows: 50 on page 1 and 1 on page 2, with mobile Action columns pinned within 0.5px of the scroll edge. Synchronous page clamps and a regression test prevent stale rows/ranges after a collection shrinks. Fresh independent review passes.

**Last updated:** 2026-09-05

### DL024 — Labeled API-key editor contract alignment

The API-key editor supports optional exact UTF-8 labels while keeping stable key IDs for identity and
operations. Display rows resolve their original server-side indexes, so blank or malformed entries do
not shift edit, delete, identity, or usage-limit actions. Label-only updates omit an unchanged limits
field. When a visible limit changes, the editor starts from the existing limits object and preserves
unknown extension fields. The API client retains null contract slots and the model-key hook filters them
only at its string boundary.

**Implementation evidence:** `src/features/config/components/blocks/{ApiKeysCardEditor.tsx,apiKeyEditorUtils.ts,Blocks.module.scss}`, `src/utils/keyIdentity.ts`, `src/services/api/apiKeys.ts`, `src/types/apiKeys.ts`, `src/hooks/{useVisualConfig.ts,useApiKeysForModels.ts}`; tests: `tests/apiKeyContracts.test.ts`.

**Recorded validation:** `bun run verify` passed 651 tests, lint, TypeScript, and the production build. After pinning
the server index when an edit modal opens, the eight API-key contract tests, ESLint, TypeScript, and
production build passed again. On 2026-09-06, isolated Chrome CDP checks against a real CPA backend
through a same-origin test proxy exercised label creation, editing, and clearing at 1440px desktop
and 390px mobile widths. Checks confirmed exact multiline Unicode labels, short-ID fallback, correct
server indexes after a blank config entry, preservation of unknown limit fields, and mobile key
rotation. The mobile view had no horizontal overflow or visible raw key text; browser console errors
were empty.

**Last updated:** 2026-09-07

### DL025 — Lazy models.dev pricing catalog and manual overrides

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

**Implementation evidence:** `src/features/analytics/views/Pricing.tsx`, `src/features/analytics/views/manage/pricingValidation.ts`, `src/types/analytics.ts`, `src/i18n/locales/**`; tests: `tests/analyticsPricing.test.ts`.

**Recorded validation:** Targeted pricing/API tests, ESLint, TypeScript compilation, and the Impeccable detector pass.

**Last updated:** 2026-09-07

### DL026 — Compact latency tiles and animated analysis metrics

Latency tiles use tighter spacing and larger values. The Sampled badge shares the label row and
aligns to the card's right edge. Mobile latency summary values are larger too.

Analysis card metrics reuse the dashboard's count-up hook through `AnimatedMetric`. Counters begin
when visible, preserve exact final values and locale formatting, and honor reduced motion. Coverage
includes cost totals and category amounts/shares, blended rate, latency summary values and sample
count, and Top Models totals/shares. ECharts, tooltips, model-efficiency tables, sample-browser rows,
and rank ordinals keep their existing rendering.

**Implementation evidence:** `src/features/analytics/views/analysis/{LatencyDiagnostics.tsx,CostInsights.tsx,Analysis.module.scss}`, `src/features/analytics/components/AnimatedMetric.tsx`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passed 651 tests, lint, TypeScript, and the production build.
Isolated Chrome CDP checks at desktop and 390px verified intermediate count-up frames on scroll,
exact final costs, percentages, durations and counts, and reduced motion without intermediate counts.
Latency values render at 22px on desktop and 20px on mobile with no horizontal page overflow.
A browser-only sampled-response fixture verified that the Sampled badge shares the label line and
aligns to its right edge; the override was removed after checking.

**Last updated:** 2026-09-07

### DL027 — Reject invalid management capabilities responses

The capabilities adapter rejects HTML and incomplete response objects before analytics consumes
them. A dev server's SPA fallback previously returned HTML with HTTP 200, which the client accepted
as capabilities and then crashed while reading `analytics.supported`. Invalid responses now use the
existing load-error path and explain that the API server URL must point to the management API.
The HTTP 404 fallback for older servers remains unchanged. A regression test covers the HTML response.
The diagnostic is translated into all four supported locales. Chrome CDP verified the default
same-origin login and populated Analysis route, plus a browser-intercepted HTML response producing
the diagnostic without an exception. The temporary development server forwards `/v0` and `/v1` to
the mock backend, so its default login address now serves the actual management API.

**Implementation evidence:** `src/services/api/capabilities.ts`, `src/features/analytics/AnalyticsPage.tsx`, `src/i18n/locales/**`; tests: `tests/analyticsCapabilities.test.ts`.

**Recorded validation:** `bun run verify` passed 652 tests, lint, TypeScript, and the production build; the CPA
compile check also passed.

**Last updated:** 2026-09-07

### DL028 — Animated overview and activity summaries

Overview KPI values, numeric details, daily averages, and the Token Activity and Request Health
summary strips reuse `AnimatedMetric`. The component lives under `features/analytics/components`
and is shared with Analysis. Values count up when visible and preserve their existing final
formatting, missing-value display, and reduced-motion behavior. Heatmap cells, tooltips, tables,
and descriptive range text retain their existing rendering. KPI sparkline entrance duration is
541ms; its update duration remains unchanged.

**Implementation evidence:** `src/features/analytics/components/AnimatedMetric.tsx`, `src/features/analytics/views/overview/{OverviewKpis.tsx,ActivityHeatmaps.tsx,overviewModel.ts,Overview.module.scss}`; tests: `tests/analyticsOverview.test.ts`.

**Recorded validation:** Chrome CDP checks at 1440px desktop and 390px mobile verified count-up frames, offscreen activation,
exact final costs/rates/averages, and reduced motion with no page overflow or console errors.
Fractional metrics use finer counter precision: RPM visibly counted from zero through 0.063 and
0.072 to 0.073, while request counts remained integers.

**Last updated:** 2026-09-07

### DL029 — Filter Usage Distribution by token category

The Usage Distribution legend uses keyboard-accessible toggle buttons with pressed states. Hidden
categories are muted and contribute zero to the stacked bars; bar-end labels show the visible sum,
rounded down so a bar never claims an axis value it does not reach, including zero when every
category is off. Selections persist across distribution dimension tabs.
Filtered tooltips show selected category counts and distinguish Displayed tokens from the full
Total tokens. Original cost, requests, and overall token share remain available for context.
Axis labels fit within their left gutter and truncate long names with ellipses instead of clipping
their prefixes.

**Implementation evidence:** `src/features/analytics/views/analysis/{UsageDistribution.tsx,analysisModel.ts,Analysis.module.scss}`, `src/features/analytics/components/analyticsFormatting.ts`; tests: `tests/analyticsAnalysis.test.ts`, `tests/analyticsContracts.test.ts`.

**Recorded validation:** `bun run verify` passed 654 tests, lint, TypeScript, and the production
build. Chrome CDP verified mouse, keyboard and mobile touch toggles, filtered tooltip totals, hiding
the last category, all-off/re-enable behavior, and selection retention across dimension tabs.

**Last updated:** 2026-10-30

### DL030 — Readable analytics chart labels and token breakdowns

Usage Distribution and Key × Model Heatmap axes display a configured key label or fall back to the
short key ID. Tooltips retain the label and short ID together. Usage Distribution adds a wrapping
color legend and tooltip counts for input, output, cache read, cache creation, and reasoning tokens.
The counts use the same mutually exclusive categories as the stacked bars and reuse existing
translations and palette colors.

Heatmap model headers truncate with ellipses within their column width instead of hiding overlapping
names. Width follows the chart container, including after analytics data loads and when it resizes.
Cell tooltips retain the full model name.

**Implementation evidence:** `src/features/analytics/views/analysis/{UsageDistribution.tsx,KeyModelHeatmap.tsx,analysisModel.ts,Analysis.module.scss}`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passed 651 tests, lint, TypeScript, and the production build. The CPA
server compile check and both repository diff checks passed.
Isolated Chrome CDP checks on 2026-09-07 verified desktop and 390px mobile layouts against the copied
main-worktree mock data, including a cold mobile login. Named keys showed labels on axes and both
identifiers in tooltips; unnamed keys retained short IDs. All selected model headers stayed visible,
the legend wrapped without horizontal overflow, and tooltip category counts matched the bars.

**Last updated:** 2026-09-07

### DL031 — One-minute analytics refresh

A shared one-minute refresh coordinator updates visible analytics, respects Retry-After, skips
hidden documents, and avoids overlapping refreshes. Queries resolve rolling ranges at request time.
Current chart data and selections remain while refreshing. In-flight request deduplication is scoped
to the active query generation so StrictMode and filter changes cannot leave a stale loading state.

**Implementation evidence:** `src/features/analytics/{analyticsRefreshState.ts,useAnalyticsLoad.ts,AnalyticsShell.tsx,AnalyticsFilterProvider.tsx,query.ts}`; tests: `tests/analyticsRefresh.test.ts`.

**Recorded validation:** Nine refresh and shell tests pass. Isolated browser checks reproduced and verified
StrictMode completion, newest-filter responses, and same-query refresh deduplication.

**Last updated:** 2026-09-08

### DL032 — Cost and timing radar analytics

Cost Breakdown and Usage Distribution share a row at the existing desktop breakpoint. The cost
radar uses a four-axis diamond, category-colored gradients that fade toward the center, and
clockwise staggered growth with synchronized currency labels. Totals and category details remain.
Latency Diagnostics pairs its scatter plot with a timing radar. A shared segmented control selects
p95, maximum, or median for both charts without replacing their ECharts instances. Missing timing
stays unavailable and renders as partial spokes instead of invented zero values. All timing axes
share one millisecond scale. Model efficiency includes each cost component and its dimmed share;
numeric column headers align with values. Token-chart tooltips distinguish dashed requests from
solid cost lines. The key-model heatmap switches between tokens, cost, and observed generation time.

**Implementation evidence:** `src/features/analytics/views/analysis/{CostRadar.tsx,LatencyDiagnostics.tsx,KeyModelHeatmap.tsx,CostInsights.tsx,analysisModel.ts,Analysis.module.scss}`, `src/features/analytics/components/AnalyticsSegmented.tsx`, `src/types/analytics.ts`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passed 670 tests, ESLint, TypeScript, and the production build.
Isolated Chrome CDP checks at 1440px and 390px verified colored gradients, staggered currency
values, unclipped mobile timing labels, persistent chart instances across modes, explicit unavailable
heatmap cells, and dashed/solid tooltip markers. Full timing data was checked using a browser-only
fixture; the normal historical mock dataset correctly leaves missing timing unavailable.

**Last updated:** 2026-09-08

### DL033 — Processing totals, comparisons, and lifetime key activity

Quick Stats includes accumulated processing time beside the narrower Daily Average card. Its
breakdown distinguishes missing observations from measured zero and explains coverage in upstream
attempts. Each metric has at least seven range-specific comparisons, with estimates, constants,
and substituted calculations available on hover, keyboard focus, or touch. All four locales are
included. Accumulated durations use readable time units.
The key catalog adds the top model and its token count, observed generation time, and requests.
Config indexes precede lifetime first/last activity at the right edge. Dates show relative time and
a full date in the client browser's timezone. Configured keys show Active for activity in the last
five minutes and Idle otherwise. Column help and mobile cards describe the same metrics.

**Implementation evidence:** `src/features/analytics/views/overview/{OverviewKpis.tsx,comparisonModel.ts,ComparisonNote.tsx,Overview.module.scss}`, `src/features/analytics/views/KeysView.tsx`, `src/features/analytics/views/keys/keyRanking.ts`; tests: `tests/analyticsOverview.test.ts`, `tests/analyticsKeysView.test.ts`.

**Recorded validation:** `bun run verify` passed 670 tests, ESLint, TypeScript, and the production build.
Isolated Chrome CDP checked desktop/mobile Overview and Keys, whole-phrase hover, first-tap
tooltips constrained to the mobile viewport, the two-column Daily Average layout, and lifetime
dates in America/New_York. There was no page overflow or console error. A full one-minute
refresh cycle fetched the visible queries without replacing chart instances or mode selections.

**Last updated:** 2026-09-08

### DL034 — Shared segmented controls, table sorting, and custom tooltips

Auth Files and analytics use one SegmentedControl extracted from the Auth Files toolbar, retaining
its pill shape, active styling, and problem-state color. SortableTableHead now lives with the shared
Table component. Numeric headers place the arrow before their label and text headers place it after;
the key catalog uses the same styled control instead of unstyled native buttons.
A root TooltipProvider converts native title hints into custom panels using the ECharts tooltip
tokens. It supports dynamically updated and removed hints, viewport placement, keyboard focus,
Escape dismissal, and touch. Title-only icon controls retain accessible names. Existing custom
panels use the same colors, border, radius, and padding. Touch release does not dismiss a tapped hint.

**Implementation evidence:** `src/components/ui/SegmentedControl.tsx`, `src/components/ui/SegmentedControl.module.scss`, `src/components/ui/Table/{SortableTableHead.tsx,SortableTableHead.module.scss}`, `src/components/ui/{Tooltip.tsx,Tooltip.module.scss}`, `src/App.tsx`, `src/features/analytics/views/KeysView.tsx`; tests: `tests/analyticsKeysView.test.ts`, `tests/tooltipProvider.test.ts`.

**Recorded validation:** `bun run verify` passes 673 tests, ESLint, TypeScript, and the production build. Chrome
CDP reproduced the key header's native gray background and outset border before the fix, then
verified transparent styled headers and correct sort-arrow placement. Isolated browser checks
verified dynamic title updates/removal, accessible names, focus/Escape, removed targets, and mobile
first-tap tooltips constrained to the viewport. No console errors were observed.

**Last updated:** 2026-09-08

### DL035 — Full-width metric trends and compact processing totals

Quick Stats trends extend to the card's left, right, and bottom edges, retaining their content gap
and using a taller plotting area. Processing time uses the metric-card hierarchy with accumulated
E2E as its primary value and ECharts timing bars below. It precedes Daily average, which spans two
columns; both cards fill their tracks and share a height. Coverage stays in the comparison tooltip.
The separate How we compare section is removed, and relevant scale assumptions appear with the
comparison that uses them. Existing worktree spacing edits are retained.

**Implementation evidence:** `src/features/analytics/views/overview/{OverviewKpis.tsx,Overview.module.scss,comparisonModel.ts,overviewModel.ts,ComparisonNote.tsx}`; tests: `tests/analyticsOverview.test.ts`.

**Recorded validation:** The 673-test full verification passes. Desktop browser measurements confirm both
summary cards fill their tracks, with widths of about 369 and 749 pixels and equal 306-pixel heights
at a 1440-pixel viewport. The KPI plots meet the card edges, and comparison explanations remain
available through hover, keyboard focus, and touch. All four locales include the relevant scales.

**Last updated:** 2026-09-08

### DL036 — Compact analysis cards and visible radar animation

Cost Breakdown places totals and its category list beside the radar when the card has enough
internal width, with a smaller blended-rate gap. Container sizing preserves the existing viewport
breakpoint and avoids overflow at intermediate widths. Cost Breakdown and Usage Distribution fill
the same row height. Both radars use more noticeable clockwise axis delays; currency values follow
the cost geometry. Latency animation begins when visible, honors reduced motion, and correctly
starts after an empty range becomes populated. Every latency summary metric has a short custom
measurement explanation. Every model-efficiency column sorts through the shared table header.
Refresh states retain their spinner without dimming cards or covering charts with a translucent fill.

**Implementation evidence:** `src/features/analytics/views/analysis/{CostInsights.tsx,CostRadar.tsx,LatencyDiagnostics.tsx,modelCostEfficiency.ts,Analysis.module.scss}`, `src/features/analytics/components/AnalyticsChart.tsx`, `src/features/analytics/views/analysis/UsageDistribution.tsx`, `src/features/analytics/AnalyticsShell.tsx`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passes 673 tests, lint, TypeScript, and production build. Browser checks
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
references. The Super Bowl cost band starts at 25 million USD. Usage Distribution and
Key × Model Heatmap use underlined tab controls
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

Keys places Last activity before First activity in the desktop table and mobile cards.
Each header, sort action, and lifetime timestamp remains associated with its activity field.
Validation: all 2,126 tests, ESLint, TypeScript, and the production build pass. Desktop and
mobile Chrome CDP checks confirm the order, matching timestamp values, working sorts in both
directions, and no page overflow or browser errors.

Usage Distribution now retains all dimension series and switches their visibility through a
hidden legend using merged ECharts updates. Stable category labels prevent unrelated renders
from replacing options. The chart reserves the largest dimension's height so resize does not
cancel the transition. This supersedes the dimension-triggered clear-and-replay behavior above.
Browser frame sampling confirms a continuous transition and the same ECharts instance.

The near-total cache comparison and tooltip use the EUV lithography analogy in all four locales,
matching the comparison model fallback.

Usage replaces the generic car comparison with three bands: Ford Mustang GT from 48,000 to
250,000 USD, Porsche 911 GT3 RS from 250,000 to 520,000 USD, and Lamborghini Aventador SVJ
from 520,000 to 1 million USD, with exclusive upper bounds. Their comparison prices are
48,000, 250,000, and 520,000 USD. Explanations in all six locales disclose the model year and
US MSRP basis: the [2025 Mustang GT starts at 46,560 USD](https://www.ford.com/build-price/mustang/2025/choose-model),
the [2025 GT3 RS at 241,300 USD](https://newsroom.porsche.com/en_US/2024/products/porsche-new-911-world-premiere-hybrid-36337.html),
and the [2019 Aventador SVJ launched at 517,770 USD](https://preview.thenewsmarket.com/Previews/lamb/DocumentAssets/518301.pdf).
The Aventador comparison uses its historical launch price.

Below the car bands, the generic laptop comparison is replaced by five named purchases:
iPhone 17 Pro 256GB from 1,000 to 4,000 USD, Apple Vision Pro from 4,000 to 10,000 USD,
Rolex Submariner from 10,000 to 17,000 USD, NVIDIA RTX PRO 6000 Blackwell from 17,000 to
37,000 USD, and Tesla Model 3 RWD from 37,000 to 48,000 USD, with exclusive upper bounds.
The divisors match the bands' lower bounds. All six locales disclose the dated source prices
behind these illustrative benchmarks: the [iPhone's 2025 US launch price of 1,099 USD](https://www.apple.com/newsroom/2025/09/apple-unveils-iphone-17-pro-and-iphone-17-pro-max/),
the [256GB M5 Vision Pro's 2025 US launch price of 3,499 USD](https://www.apple.com/newsroom/2025/10/apple-vision-pro-upgraded-with-the-m5-chip-and-dual-knit-band/),
the [steel Submariner reference 124060 at 10,050 USD](https://www.rolex.com/en-us/watches/submariner/m124060-0001),
the [RTX PRO 6000 Blackwell Workstation Edition at 16,000 USD](https://marketplace.nvidia.com/en-us/enterprise/laptops-workstations/nvidia-rtx-pro-6000-blackwell-workstation-edition/),
and the [Model 3 RWD vehicle price of 36,990 USD before destination and order fees](https://www.tesla.com/en_US/model3/design).
The last three prices were checked in October 2026. The Mustang band's 48,000 USD boundary
is preserved.

The preceding 200 USD to 1,000 USD band compares LEGO DeLorean sets instead of AI subscription
months. It uses the [LEGO Back to the Future Time Machine set 10300 at 199.99 USD](https://www.lego.com/en-us/product/back-to-the-future-time-machine-10300),
checked in October 2026, rounded to 200 USD per set. All six locales include the set and price
explanation; the formula remains `d / 200 USD` with a count of sets.

The generic private-jet comparison is replaced by Gravity Jet Suits from 1 million to
2.5 million USD, Princess F55 yachts from 2.5 million to 15 million USD, and estimated F1-car
builds from 15 million to 25 million USD, with exclusive upper bounds. Their divisors are
500,000 USD, 2.5 million USD, and 15 million USD. The jet-suit benchmark rounds the
[historical 2018 price of about 440,000 USD](https://time.com/collections/best-inventions-2018/5454241/gravity-jet-suit/).
The yacht benchmark rounds [HMY's asking price of 2,499,000 USD for a 2022 Princess F55](https://www.hmy.com/yachts-for-sale/50-to-59-feet?hmy_page=2&page=3),
checked in October 2026; it is a pre-owned listing, not a new-yacht MSRP.

The F1 tooltip shows a partial breakdown of [published 2024 estimates](https://www.themanual.com/auto/how-much-does-a-formula-1-car-cost/):
hybrid power unit 10.3 to 10.6 million USD, chassis 600,000 to 650,000 USD, gearbox
350,000 USD, front and rear wings 250,000 USD, and steering wheel 50,000 USD. The 15 million
USD total is an illustrative benchmark; the selected parts are not a complete bill, and
research, development, and season operations are excluded. All six locales disclose this
scope, and tooltip explanations preserve line breaks for the breakdown.

Super Bowl airtime covers only 25 million to 30 million USD. Three military-aircraft bands
follow: AH-64E Apache from 30 million to 40 million USD, MQ-9A Reaper from 40 million to
60 million USD, and F/A-18E/F Super Hornet from 60 million to 70 million USD, with exclusive
upper bounds. Their divisors are 35 million, 50 million, and 67 million USD respectively.
All six locales disclose the price basis: the [DoD FY2022 Apache unit estimate of 35.69 million USD](https://prhome.defense.gov/Portals/52/Documents/MRA_Docs/RI/FY23%20National%20Guard%20and%20Reserve%20Equipment%20Report%20with%20cover.pdf),
the [2026 CRS report quoting up to 50 million USD for a Reaper depending on its sensors](https://www.everycrsreport.com/reports/IF13318.html),
and the [Navy Super Hornet unit cost of 67.4 million USD in FY2021 dollars](https://www.navair.navy.mil/product/FA-18EF-Super-Hornet).
The Reaper comparison explicitly uses an upper-end, sensor-heavy example. The Falcon 9 band
still begins at 70 million USD.

Processing-time comparisons shorten the work-week band to 14 through 88 Earth days. Mercury
years cover 88 through 210 Earth days, followed by one-way Mars trips from 210 Earth days
through one Julian Earth year, with exclusive upper bounds. A Mercury year uses 88 Earth days
or 7,603,200 seconds, following [NASA's orbital-period description](https://science.nasa.gov/Mercury/).
A Mars trip uses 210 Earth days or 18,144,000 seconds, a rounded seven-month benchmark based
on the [NASA Perseverance cruise](https://science.nasa.gov/resource/nasas-perseverance-rover-lands-successfully-on-mars/).
All six locales explain the favorable launch window and trajectory dependence; the benchmark
uses a representative cruise duration. Earth-year and career comparisons retain their scales.

Comparison explanations choose the space above or below their trigger and scroll when needed
to stay within the viewport. Pointer, focus, and touch state control visibility, so Escape
dismisses a panel while its trigger remains focused. F1 explanations preserve line breaks.

`bun run verify` with Bun 1.3.14 passes all 2,126 tests, ESLint, TypeScript, and
the production build. Regressions cover the cost and processing boundaries, formulas, all
six locales, F1 breakdown, and Reaper price qualification. Chrome CDP verifies 48 production
UI cases with sample API responses at 1440 and 390 pixels, including the F1 breakdown in all
six languages, with no clipped copy, viewport overflow, or browser errors. Focus, Escape
dismissal after the fade transition, and touch explanations pass. A pre-existing Claude
usage-rendering test now pins its fixture clock so its reset label stays deterministic.

**Last updated:** 2026-10-26

### DL037 — Per-hop event detail sheet with request-path timeline and timing graph

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

**Implementation evidence:** `src/features/analytics/views/events/EventDetailSheet.tsx`, `src/features/analytics/views/events/EventDetailParts.tsx`, `src/features/analytics/views/events/EventTimeline.tsx`, `src/features/analytics/views/events/EventTimingGraph.tsx`, `src/features/analytics/views/events/eventDiagnostics.ts`, `src/features/analytics/views/events/EventDetail.module.scss`, `src/types/analytics.ts`, `src/i18n/locales/{en,ru,zh-CN,zh-TW}.json`, `tests/analyticsEventDiagnostics.test.ts`.

**Recorded validation:** `bun run verify` passes 689 tests, lint, TypeScript, and the production build.
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

**Last updated:** 2026-09-09

### DL038 — Observed timing descriptions and zero-request chart behavior

CPAUK's latency metrics now describe locally measured dispatch-to-first-substantive-token and
dispatch-to-response intervals. The latter ends at HTTP response headers or the first application
response frame on supported WebSocket transports, including network and provider waiting time.
The hints in all four locales distinguish these observations from provider-reported timestamps.
Existing TTFT behavior is unchanged; unobserved historical measurements remain unavailable.

Key × Model Heatmap intersections with no requests display zero, including generation time.
Populated cells retain the existing handling of missing measurements and known costs.
The Cost Breakdown radar uses a shifted log10 USD scale with a positive floor below the smallest
positive amount. Zero remains at the center, and tooltips continue to show raw USD amounts and
percentages. Cost and Latency Diagnostics radar tooltip titles both end with `(log10)`.

**Implementation evidence:** `src/features/analytics/views/analysis/analysisModel.ts`, `src/features/analytics/views/analysis/{KeyModelHeatmap.tsx,CostRadar.tsx,LatencyDiagnostics.tsx}`, `src/i18n/locales/**`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passes 710 tests, lint, TypeScript, and production build; the scoped
Impeccable detector reports no findings. Independent Chrome CDP checks at desktop and 390px
mobile verify no-request cells show 0 tokens/0 ms, requested missing generation stays Unavailable,
sub-dollar costs occupy equal log-decade intervals, and both radar tooltips contain `(log10)`.
The existing dev UI displays all timing values from a newly built isolated CPA backend after an
actual streamed request, without console errors or horizontal overflow. QA stopped its temporary
backend/mock and disposed only its isolated browser contexts.

**Last updated:** 2026-09-09

### DL039 — Separate event timing phases

The event detail timing chart separates Routing, Provider ACK, Waiting, and Generation.
Routing uses CPA's measured `routing_time_ms` before the first provider dispatch. Provider ACK
uses `provider_latency_ms`, from the current dispatch to response headers or the first request
response frame. Waiting subtracts ACK from local `first_token_latency_ms`, and Generation uses
the first-to-last substantive-token duration. Current dispatch timestamps position provider
phases, leaving retry intervals unassigned rather than attributing them to routing.

Focusable phase tooltips in all four locales explain the boundaries. Waiting refers to CPA's
local first-token interval as TTFT; queueing, prefill and cache work are possible contributors,
not separately observed stages. No provider-reported duration replaces the local timeline.
Missing or inconsistent observations do not create fabricated bars, and zero generation duration
does not produce infinite throughput.

**Implementation evidence:** `src/features/analytics/views/events/{eventDiagnostics.ts,EventTimingGraph.tsx,EventDetailSheet.tsx,EventDetail.module.scss}`, `src/i18n/locales/**`; tests: `tests/analyticsEventDiagnostics.test.ts`.

**Recorded validation:** 714 frontend tests, lint, TypeScript, and production build pass. Independent Chrome
CDP verification at 1440x1050 and 390x844 uses an event from a fresh CPA instance and real local
stream: Routing 0 ms, Provider ACK 121 ms, Waiting 260 ms, Generation 80 ms. Mouse, keyboard
focus and touch show the explanations with the final TTFT wording. Missing-position fixtures
retain measured durations and omit only bars; neither viewport has overflow or console errors.
QA disposed its browser contexts and stopped its temporary servers.

**Last updated:** 2026-09-09

### DL040 — Credential filenames in event details

The event detail Credential field uses the authenticated API's `credential_filename`
when available, matching the filename users manage in Auth Files. Missing or deleted
credentials retain the shortened ID fallback. No extra credential catalog request is made.

**Implementation evidence:** `src/features/analytics/views/events/EventDetailSheet.tsx`, `src/types/analytics.ts`; tests: `tests/analyticsEventDiagnostics.test.ts`.

**Recorded validation:** `bun run verify` passes 715 tests, lint, TypeScript, and the production
build. Isolated desktop/mobile Chrome CDP fixtures verify the filename and a roughly
39 KiB raw generation payload without horizontal page overflow.

**Last updated:** 2026-09-09

### DL041 — Event detail latency boundaries

The event detail sheet now shows three distinct latency measurements: strict `Latency` from
provider dispatch to CPA's first substantive token (`first_token_latency_ms`), `Provider latency`
from dispatch to provider acknowledgement (`provider_latency_ms`), and the existing `E2E latency`
from the recorded request start through the response (`latency_ms`). The new measurements reuse
the localized Analytics labels and boundary definitions. Missing values show the localized
unavailable text, while measured zero values remain visible as `0 ms`.

**Implementation evidence:** `src/features/analytics/views/events/{EventDetailSheet.tsx,EventDetailParts.tsx}`, `src/features/analytics/views/analysis/analysisModel.ts`, `src/types/analytics.ts`, `src/i18n/locales/**`; tests: `tests/analyticsEventDiagnostics.test.ts`, `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passes 718 tests, lint, TypeScript, and the production build.
Focused SSR coverage includes zero and missing measurements. Isolated Chrome CDP checks at
1440x1050 and 390x844 show the three labels and live values without horizontal overflow or
browser errors; the new fact tooltips expose their dispatch boundary definitions.

The token breakdown also shows localized `Unclassified` tokens using the authoritative total
minus normalized input and output counts, clamped at zero. This preserves total-only and Claude
style partial usage without repairing historical events.

**Last updated:** 2026-09-09

### DL042 — Shared event throughput calculation

Event tables and detail timing charts render one CPA-derived throughput. A recorded generation
interval below eight percent of the pre-generation wait is not physically reachable, so CPA
publishes `output tokens / (provider_latency_ms + wait + generation_time_ms - median provider
latency)` for those events instead, where the wait is the first-token latency minus the
acknowledgement and the median is that credential's own provider acknowledgement over the trailing
day. The estimate stays unavailable without a usable acknowledgement, a credential baseline, or a
positive span; events that keep a plausible generation interval report their measured rate.

The panel no longer derives throughput itself. It renders `tokens_per_second`, marks
`speed_estimated` with the compact localized `EST` badge, and shows `Unavailable` when the server
publishes no rate, so the table and the detail chart cannot disagree. A server that predates the
field publishes nothing and the column stays unavailable instead of falling back to a local guess.

**Implementation evidence:** `src/features/analytics/views/events/{eventDiagnostics.ts,EventTimingGraph.tsx,EventDetailSheet.tsx}`, `src/features/analytics/views/Events.tsx`, `src/types/analytics.ts`; tests: `tests/analyticsEvents.test.ts`, `tests/analyticsEventDiagnostics.test.ts`.

**Recorded validation:** Focused speed tests cover the measured rate, the estimate label, a null rate, and
servers that publish no field, and the event diagnostics tests render the published estimate.
`bun run verify` passes the full suite, lint, TypeScript, and the production build.

**Last updated:** 2026-09-16

### DL043 — Credential labels, catalog-bound pricing, and Z.AI usage windows

Provider forms accept an optional `label` on every API-key entry (Claude, Codex, Gemini,
Interactions, xAI, Vertex, and OpenAI-compatible key entries). The OpenAI-compatible form adds a
searchable `Pricing catalog` select populated from the persisted models.dev provider list served by
`GET /v8/management/analytics/pricing/catalog-providers`, cached once per session so no request is
made per keystroke, and a `Usage probe` select (None or Z.ai). Provider tables and detail views show
the label next to the masked key.

Analytics credential rows lead with the backend `display_name`, keeping the short hashed identity
as a tooltip and as muted secondary text in the detail table. When a credential row carries
`quota.windows`, the Quota cell renders one compact meter per window with its label and reset time.
The event detail Credential field prefers `credential_label`, then `credential_filename`, then the
shortened ID.

The Quota page gains a Z.AI tab. Auth-file entries with `usage_probe: zai` are polled through
`/api-call` against the Z.ai monitor endpoint and rendered as one meter per credit window
(five-hour and weekly) with plan level and reset countdowns; the remaining-credits text lives in the shared tooltip on the percentage so narrow cards do not overflow. Quota cards use
`display_name` as their title. Auth Files cards lead with a user-set label and the details sheet
offers a "Rename / set label" action that patches the auth file `label`.

The upstream Routing board also leads with a custom credential label, using `display_name` when supplied and retaining the raw file name for writes. Email, project and file-name fallbacks remain; secret-bearing account fields are never displayed.

**Implementation evidence:** `src/features/providers/sheets/forms/{BaseProviderForm.tsx,ApiKeyEntriesEditor.tsx}`, `src/features/providers/pricingCatalogCache.ts`, `src/features/providers/components/ProviderResourceTable.tsx`, `src/features/analytics/views/Providers.tsx`, `src/features/quota/providers/zai/{ZaiQuotaBody.tsx,data.ts}`, `src/features/authFiles/components/AuthFileDetailsSheet.tsx`; `src/services/api/routing.ts`; tests: `tests/providerFormCapabilities.test.ts`, `tests/zaiQuota.test.ts`, `tests/routingBoard.test.ts`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,576 tests, ESLint, TypeScript compilation, and the single-file production build. Sixteen isolated Chrome CDP checks cover quota, OAuth, both routing screens, desktop/mobile widths, and light/dark themes without overflow or runtime exceptions. The pre-merge baseline passes 2,320 tests. Turkish strings are machine-translated pending native review; live integration remains pending against the merged CPA.

**Last updated:** 2026-10-31

### DL044 — Provider selectors and OpenCode Go usage

Every API-key provider form now exposes the optional `Pricing catalog` selector instead of limiting
it to OpenAI-compatible providers: Claude, Codex, Gemini, Interactions, xAI, and Vertex. The same
forms expose `Usage probe` with the Z.AI and OpenCode Go choices. Multi-protocol sponsor forms stay
unchanged because their configuration is composed from the same underlying API-key sections.

The Quota page adds an OpenCode Go tab. Credentials with `usage_probe: opencode-go` call
`https://opencode.ai/zen/go/v1/usage` through the existing management API-call path and render
rolling, weekly, and monthly usage meters with reset countdowns. The card uses the shared OAuth
usage-card plan style with the literal `Go` plan value; Z.AI now uses the same `Plan` label and bold
tier value instead of the older inline `Plan level:` text.

**Implementation evidence:** `src/features/providers/sheets/forms/BaseProviderForm.tsx`, `src/features/providers/descriptors.ts`, `src/features/quota/providers/opencode-go/{OpenCodeGoQuotaBody.tsx,data.ts}`, `src/features/quota/providers/index.ts`; tests: `tests/opencodeGoQuota.test.ts`, `tests/providerFormCapabilities.test.ts`.

**Recorded validation:** `bun run verify` passes 753 tests, TypeScript, and the production build; lint has only
the pre-existing `Select.tsx` warning. Focused tests cover provider-form gating and serialization,
usage-probe normalization, quota parsing, exhausted-window gating, reset scheduling, and all four
locales.

**Last updated:** 2026-09-17

### DL045 — Top Models share areas and output-window lines

The Usage page's Analysis tab draws Top Models token and price modes as 100% stacked areas.
Each bucket shows the models' relative contributions, including the folded Other models band.
All three modes explicitly disable smoothing and connect observations with straight segments.
Tooltips retain actual token or USD amounts and their total; empty buckets remain zero. Stable
model colors, ranking order, and ranking hover/focus highlighting apply to both fills and outlines.

Output window uses overlapping, unstacked lines on one duration axis. Values remain observed
per-bucket averages, missing observations leave gaps, and the tooltip omits a total. The mobile
layout allows the chart and ranking to shrink when switching from a desktop viewport.

**Implementation evidence:** `src/features/analytics/views/analysis/{TimeSeriesCharts.tsx,analysisModel.ts,Analysis.module.scss}`, `src/features/analytics/views/Analysis.tsx`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** On 2026-10-27: the full frontend verification passes 2,138 tests, lint, TypeScript, and
the single-file production build. Regression coverage checks per-bucket normalization, zero
buckets, raw tooltip amounts, Other models, highlight opacity, and unstacked timing gaps.
Browser checks using synthetic analytics responses cover all three modes at 1440x1000 and
390x844, actual amount tooltips, keyboard highlighting, and desktop-to-mobile resizing with no
clipped chart or ranking, page overflow, or runtime errors.

**Last updated:** 2026-10-27

### DL046 — Log10 latency radar test coverage

The latency radar has run on a log10 millisecond axis since DL038, but its test still asserted the
linear axis that commit `2bb3c54` introduced and commit `83fe7be` reverted. The test asserts the
log10 indicator maxima, the log10 vertex values, and the `(log10)` tooltip title again, so it goes
red if the radar returns to a linear axis. The axis-offset and partial-polygon checks are unchanged.

**Implementation evidence:** `src/features/analytics/views/analysis/{LatencyDiagnostics.tsx,analysisModel.ts}`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** `bun run verify` passes 753 tests, lint (the pre-existing `Select.tsx` warning only),
TypeScript, and the production build.

**Last updated:** 2026-09-22

### DL047 — Model cost pricing is isolated per row

Model Cost Efficiency calculates the price-per-million cell from each model's own token coverage.
A wholly unpriced model no longer marks every other model as partially priced or removes its
calculated cell. The table excludes wholly unpriced models, keeps partially priced models with
their localized qualifier, and falls back to the card empty state when no priced models remain.
Legacy rows that omit `unpriced_tokens` but report a known nonnegative cost remain priced.

**Implementation evidence:** `src/features/analytics/views/analysis/{analysisModel.ts,modelCostEfficiency.ts,CostInsights.tsx}`; tests: `tests/analyticsAnalysis.test.ts`.

**Recorded validation:** Focused analysis tests cover independent per-row pricing, wholly unpriced exclusion,
partial-row retention, and legacy missing coverage. `bun run verify` passes 754 tests, lint (the
pre-existing `Select.tsx` warning only), TypeScript, and the production build.

**Last updated:** 2026-09-23

### DL048 — Continuous activity heatmap colors

Token Activity and Request Health map each nonempty daily value to a continuous color intensity
instead of choosing from five preset classes. Token volume retains its logarithmic P5-P95 scaling
so spikes do not flatten ordinary days, while request health uses the exact success ratio. The
component interpolates the existing theme visualization tokens in OKLab, and empty days retain the
dedicated empty-cell color. Both legends show six representative swatches sampled from the matching
continuous ramp.

Request Health stays at the unhealthy red through 40% success, interpolates from red to yellow over
40-90%, and anchors yellow at exactly 90%. The final 90-100% band interpolates from yellow to healthy
green. A no-request day remains visually empty instead of being treated as a 0% success day.

**Implementation evidence:** `src/features/analytics/views/overview/{ActivityHeatmaps.tsx,overviewModel.ts,Overview.module.scss}`, `src/styles/themes.scss`; tests: `tests/analyticsOverview.test.ts`.

**Recorded validation:** The focused Overview suite passes 26 tests, including continuous ordering, exact 96%
request-health intensity, and rendered CSS without malformed double-percent values. Isolated Chrome
CDP checks at 1440x1050 and 390x844 found no transparent cells or page overflow. The desktop mock
render produced 17 distinct Token Activity colors and 280 distinct Request Health colors; the
mobile window produced 17 and 106 respectively. `bun run verify` passes 753 tests, TypeScript, and
the production build; lint reports only the pre-existing `Select.tsx` warning.

**Last updated:** 2026-09-23

### DL049 — Claude OAuth capture safeguard setting

The Claude Header Defaults section exposes CPA's optional `oauth-safeguard`
setting. CPA privately captures its own Claude Code reference with a CPA Claude
OAuth credential and checks for updates every 24 hours; it never uses global
Claude data. The description explains that direct Anthropic OAuth requests must
match the active reference and fail closed only if no valid active reference
exists. A failed candidate update preserves the last successfully captured
active reference. Visual config loading and saving preserve the boolean; the
setting appears in search and every supported locale. It renders as a setting row
(`ToggleSetting`): an external `<label for>` names the switch and the description is
connected through `aria-describedby`; the switch track shows keyboard focus.

**Implementation evidence:** `src/features/config/components/sections/SectionAdvanced.tsx`, `src/hooks/useVisualConfig.ts`, `src/features/config/searchIndex.ts`, `src/types/visualConfig.ts`, `src/i18n/locales/**`; tests: `tests/visualConfigClaudeOauthSafeguard.test.ts`, `tests/toggleSwitchAccessibility.test.ts`.

**Recorded validation:** Focused config, accessibility, and four-locale copy tests pass.
`bun run verify` passes 758 tests, TypeScript, and the production build; lint
retains the existing `Select.tsx` warning. Chrome CDP verified the rendered
description on desktop and at a 390px mobile viewport without horizontal
overflow.

**Last updated:** 2026-10-19

### DL050 — Cache-managed quota refresh

The Quota page's "Refresh all credentials" action uses the normal quota cache
path. CPA reconciles routing cooldowns when a provider request actually reaches
the upstream and returns a successful usage report. A cached replay preserves the
existing routing state, while a later request after cache expiry can observe a
reset and restore availability. Claude's shared 5-hour and normal weekly
windows update credential state, while the Fable weekly allowance updates only
Fable models. Opus and Sonnet fields remain display data because they draw from
the shared weekly pool.

**Implementation evidence:** `src/features/quota/{QuotaPage.tsx,logic.ts,windowGating.ts}`, `src/features/quota/hooks/useQuotaBatchLoader.ts`, `src/features/quota/providers/types.ts`, `src/features/quota/providers/claude/data.ts`; tests: `tests/quotaPageLogic.test.ts`, `tests/claudeFableQuota.test.ts`, `tests/quotaWindowGating.test.ts`.

**Recorded validation:** Quota tests cover cache-managed cooldown recovery and the normal
refresh wiring. `bun run verify` passes the affected suites, lint, TypeScript,
and the production build.

**Last updated:** 2026-10-07

### DL052 — Greedy soonest recovery routing strategy

The configuration page's Routing Strategy dropdown now includes the backend's
`greedy-soonest-recovery` strategy, labeled "Greedy Soonest Recovery (GSR)".
The visual config parser accepts the canonical value and `gsr` aliases, writes
the canonical backend value, includes the strategy in search, and shows the same
label on the dashboard. All seven locales include the option label.
Scheduling weight help in auth-file details, card tooltips, and provider forms
explains both weighted round robin and GSR. GSR adds the configured weight after
its recovery and plan-tier calculation; non-positive values add nothing. Weighted
round robin continues to exclude credentials with non-positive weights. The
auth-file hint links to routing settings for either strategy. Credential cards
use the strategy-neutral label "Weight".

The upstream Routing board reads GSR and its aliases without coercing them to round-robin. It keeps the strategy during unrelated settings writes, exposes GSR in its policy controls, explains its weight behavior, and leaves traffic shares unspecified because its selection is dynamic.

**Implementation evidence:** `src/features/config/components/sections/SectionRouting.tsx`, `src/hooks/useVisualConfig.ts`, `src/features/config/searchIndex.ts`, `src/features/dashboard/DashboardPage.tsx`, `src/features/authFiles/components/AuthFileDetailsSheet.tsx`, `src/features/providers/sheets/forms/BaseProviderForm.tsx`, `src/types/visualConfig.ts`, `src/types/routing.ts`, `src/services/api/routing.ts`, `src/features/routing/{logic.ts,components/WeightDialog.tsx}`, `src/i18n/locales/**`; tests: `tests/visualConfigRoutingStrategy.test.ts`, `tests/authFileCard.test.ts`, `tests/routingBoard.test.ts`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,576 tests, ESLint, TypeScript compilation, and the single-file production build. Sixteen isolated Chrome CDP checks cover quota, OAuth, both routing screens, desktop/mobile widths, and light/dark themes without overflow or runtime exceptions. The pre-merge baseline passes 2,320 tests. Turkish strings are machine-translated pending native review; live integration remains pending against the merged CPA.

**Last updated:** 2026-10-31

### DL053 — Quota summary and credential-aware quota tooltips

Quota Management keeps provider tabs, search, sorting, refresh controls, a capacity-weighted summary strip, and full-width credential rows. The summary wraps into even grid rows, counts only credentials with a successful reading, and normalizes each credential against the largest plan present. Claude uses its lower-remaining weekly pool with Fable as the tie-breaker and exposes the second weekly pool separately; other providers use explicit longest-recovery windows. Unknown paid-health allowances stay unknown. When every credential is blocked or errored, the summary shows the soonest unblock countdown, respecting gated versus independent windows.

Capacity uses reported allowances for Kiro and Kimi, otherwise `PLAN_VALUE` in `quotaSummary.ts`. Codex is measured in Plus units: Business and Team 1, Pro 100 10, Pro 200 20, Pro 500 50. The reported Business IDs `self_serve_business_prolite` and `self_serve_business_usage_based` normalize to the Plus weight. Claude uses Pro 1, Max/Max 5x 5, Ultra 10, Team 5, Free 0. Profile `rate_limit_tier` distinguishes `plan_max5`, displayed as Max, and `plan_max20`, displayed as Ultra in all seven locales, with active Team taking precedence. Claude's [Ultra plan documentation](https://support.claude.com/en/articles/17728952-what-is-the-ultra-plan) specifies 10× Pro weekly allowance and no five-hour limit for verified accounts. The API still reports `default_claude_max_5x` and `default_claude_max_20x`; these identifiers remain unchanged and no synthetic `ultra` ID is introduced. Z.AI uses 5-hour credit allowances of Lite 2,000, Pro 12,000 and Max 28,000. Providers without known ratios count credentials equally and show a shared plan name only when all agree.

Credential bodies split into a content-sized `planMeta*` column and a quota area with meters at a 200px minimum and a 960px cap. Metadata moves above the meters when needed; mobile actions share the identity line. The summary, list and controls share the glass surface, with rounded outer corners. Provider tabs without credentials are hidden unless selected, and loading skeletons match credential rows. These fork layouts and the gold/liquid-platinum badge artwork remain in place alongside upstream quota data. Codex badge classification follows upstream: only Pro 500 spellings `promax`, `pro-max`, `pro_max` and the fork-compatible `pro max` are elite; Pro 200 and Pro 100 are premium gold. `codexPlanLabelKey` remains shared by rows and summary and shares the same recognized Pro 500 spellings as badge classification.

Summary segments and quota meters share reserve stripes and credential-aware tooltips with exact remaining quota, plan, absolute reset, countdown and localized weekday. Reset labels group the instant and countdown and use weekday/time within six local calendar days. Codex manual resets collapse into a focusable stack with one tooltip line per credit rather than a duplicate count. Tooltip conversion survives keyed row reordering and focus rings remain visible outside transitions. Claude stale snapshots, extra usage and reset-grant details stay in the meta column; dollar balances, xAI breakdowns and plugin groups remain quota-area rows. Upstream host plan/content slots are supported using the fork metadata names. Known `iguana_necktie` balances display the localized Cloud session credits label. Routine Claude reads respect the shared cache/cooldown, while spending a reset performs fresh preflights and honors upstream backoff.

Verified Ultra responses with `five_hour: null` and no session entry in `limits` omit the short window. Weekly and Fable meters, summary totals, weekly timeline/history and reserve controls continue to use only reported windows, without fabricating a five-hour bar. Session mode excludes these accounts while weekly mode keeps them.

**Implementation evidence:** `src/features/quota/{QuotaPage.tsx,quotaSummary.ts,types.ts}`, `src/features/quota/components/{QuotaSummary.tsx,QuotaCard.tsx,QuotaMeter.tsx,QuotaResetLabel.tsx}`, `src/features/quota/providers/{claude/ClaudeQuotaBody.tsx,kimi/KimiQuotaBody.tsx}`, `src/utils/quota/{planTier.ts,resetInstants.ts}`, `src/components/ui/Tooltip.tsx`; tests: `tests/{quotaSummary,quotaRowTitle,quotaResetInstants,tooltipProvider,quotaPageLogic,quotaPlanTier,quotaBodyRendering,claudeOAuthUsage,claudeUltraQuota,kimiPlan}.test.ts`, `tests/fixtures/claude-ultra-usage.json`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,593 tests, ESLint, TypeScript compilation and the single-file production build. The weekly-only Ultra regression passed on the merged code before the plan update, so no missing-window implementation fix was needed. Eight isolated Chrome CDP checks at 1440px/390px in light/dark themes verify the weekly-only Ultra card, 150% Max-plus-Ultra capacity, history, session exclusion, reserves, and spaced Pro 500 badge without overflow or runtime exceptions. Live CPA integration is still pending against the merged CPA.

**Last updated:** 2026-10-31

### DL054 — OAuth rule editors skip API-key credentials

The OAuth excluded-models and model-alias editors build their provider picker through one
`oauthCredentialProviders` helper, which skips credentials that carry a `usage_probe`. Those are
API-key entries (for example Z.AI or OpenCode Go under `openai-compatibility`) listed only so the
quota page can poll them; CPA applies neither `oauth-excluded-models` nor OAuth aliases to API-key
credentials, so offering them produced an unsupported model list and rules that never apply.

**Implementation evidence:** `src/features/authFiles/constants.ts`, `src/pages/{AuthFilesOAuthExcludedEditPage.tsx,AuthFilesOAuthModelAliasEditPage.tsx}`; tests: `tests/oauthProviderOptions.test.ts`.

**Recorded validation:** A unit test covers the helper, and a CDP check against a CPA with a Kiro OAuth file
plus Z.AI and OpenCode Go usage-probe keys showed only OAuth providers in both editors, with Kiro
listing the Claude catalog served by CPA.

**Last updated:** 2026-10-14

### DL055 — Quota reserves and bypass keys

Credentials can keep part of a supported quota bar in reserve: Claude, Codex, Z.AI, OpenCode Go,
and Kiro. Each reserve is a minimum remaining percentage per bar. On the quota page and auth-file
cards, the part of a bar's fill that lies inside the reserve is candy-striped in the bar's own
health colour and the usable remainder stays solid, so a level below the reserve reads fully
striped. Provider summary cards stripe each credential's segment the same way. Row and segment
tooltips add the reserve and, while it holds, when it lifts; affected auth files show a compact
Reserve reached badge.

The auth-file editor and Z.AI/OpenCode Go provider forms load the credential's bars, enable a
reserve per bar, and provide pointer and keyboard slider handles. Client keys that can use the
reserve are chosen from a searchable picker and shown as removable chips with labels and
eight-character key fragments; missing saved IDs remain removable. API normalization and
whole-family provider serialization preserve `quota_reserve` / `quota-reserve` and the bypass-key
lists through unrelated edits, while explicit empties remove them. All seven locales carry these strings.
The feature was first named usage caps; it was renamed before release, so no alias exists.
Generic plugin quota cards (from upstream) render through the same reserve-aware meter, and
fork usage-probe credentials (`usage_probe: zai` / `opencode-go`) keep their built-in cards even when
CPA also marks them `supports_quota`.

OpenAI-compatible provider rows now take their auth index from the first key entry, where CPA
reports it as `auth_index`; the provider transformers accept both `auth_index` and `auth-index`.
The reserve editor uses that index to find the credential's quota bars.

The reserve editor derives available bars from the observed windows. A verified Ultra response without a five-hour window exposes its weekly reserves only; saved settings for unavailable bars remain removable rather than being silently discarded.

**Implementation evidence:** `src/features/quota/quotaReserve.ts`, `src/features/quota/components/{QuotaReserveEditor.tsx,QuotaMeter.tsx,QuotaCard.tsx,QuotaSummary.tsx}`, `src/services/api/{transformers.ts,authFiles.ts}`, `src/features/providers/sheets/forms/BaseProviderForm.tsx`; tests: `tests/quotaReserve.test.ts`, `tests/providerEditingV8.test.ts`, `tests/quotaSummary.test.ts`, `tests/claudeUltraQuota.test.ts`, `tests/fixtures/claude-ultra-usage.json`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,593 tests, ESLint, TypeScript compilation and the single-file production build. The weekly-only Ultra regression passed on the merged code before the plan update, so no missing-window implementation fix was needed. Eight isolated Chrome CDP checks at 1440px/390px in light/dark themes verify the weekly-only Ultra card, 150% Max-plus-Ultra capacity, history, session exclusion, reserves, and spaced Pro 500 badge without overflow or runtime exceptions. Live CPA integration is still pending against the merged CPA.

**Last updated:** 2026-10-31

### DL056 — Analytics reads revalidate against a cached response

Analytics reads now travel through the header form of the read route: the query is base64url JSON in
`X-Analytics-Query` on a `GET` to `/v8/management/analytics/query` while the encoded header stays
within 6000 characters, and the previous `POST` body form carries anything larger. The client keeps a
bounded in-memory cache (64 entries, 8 MiB) of the last response body and its ETag per connection
revision and canonical query, sends that validator with `If-None-Match` and `Cache-Control: no-cache`
so a dashboard refresh always reaches the origin, and answers a 304 from the cached body. A cached body
is only returned while the entry that produced the validator is still held and the connection that
produced it is current; otherwise the read is reissued once without a validator, and a second 304 is
reported as a failure rather than retried again.

Older servers are detected by a 404/405 that carries no Management API error code, which switches that
connection to `POST` for the rest of its lifetime; coded refusals such as a disabled module still
surface as errors. `apiClient` gained `onConnectionChange`, fired whenever the server address or
management key changes, so the analytics cache is dropped on sign-out or a server switch without the
client importing domain-specific cache modules. The in-flight dedupe key includes the connection revision, and a
response that arrives after the connection changed is rejected rather than returned to the caller or
replayed against the new server.

**Implementation evidence:** `src/services/api/{analytics.ts,client.ts}`, `src/features/analytics/{analyticsRefreshState.ts,useAnalyticsLoad.ts}`; tests: `tests/analyticsQueryTransport.test.ts`, `tests/analyticsTransportDedupe.test.ts`, `tests/analyticsApiV2.test.ts`, `tests/analyticsRefresh.test.ts`.

**Recorded validation:** `bun test tests/analyticsQueryTransport.test.ts` (18 tests), the updated dedupe and v2
adapter suites, and the full analytics filter (289 tests) pass. `bun run lint` and `bun run build`
pass. `bun run verify` stops on the pre-existing `legacy backend login diagnostic` failure (full
suite: 1919 pass, 1 fail), which also fails at HEAD without these changes.

Manual page refresh completion resets the shared 60-second automatic-refresh timer. A deterministic
clock test checks completion at 50 seconds, no refresh at the previous 60-second deadline, and the
next refresh at 110 seconds. Visibility, in-flight, and Retry-After guards remain active.

Explicit query bounds and schema-v2 custom range bounds use their UTC minute for the ETag cache
and concurrent-read identity. Seconds, fractions, and equivalent UTC offsets therefore reuse the
same snapshot while the server's 60-second cache entry is live. The transmitted query and cached
response keep the original exact bounds, including ranges shorter than a minute. Named rolling
presets retain their existing identity. Cursor continuations keep exact bounds because their
signatures bind the first page's resolved range. Time zones, filters, and all other fields stay
significant; the generic request serializer still preserves timestamp strings exactly.

On 2026-10-16: 40 transport and dedupe tests pass, including same-minute 304 reuse,
concurrent reads, neighboring minutes, offset equivalence, zone and filter isolation, exact cursor
bounds, and unchanged sub-minute requests and response metadata. TypeScript compilation, lint, and
the single-file production build pass. `bun run verify` reaches 1,933 passing tests and the same
pre-existing `legacy backend login diagnostic` failure.

**Last updated:** 2026-10-19

### DL057 — Shared surfaces used by the analytics UX pass

The DL013–DL022 work makes small additive changes to shared CPAMC components. These components
remain compatible with their existing callers while exposing the optional behavior required by the
fork's analytics workspace:

- `src/components/ui/Button.tsx` — optional `icon` prop rendered before the label (hidden while loading).
- `src/components/ui/Card.tsx` — optional `ref` forwarded to the root `div` (React 19 ref-as-prop) so scroll reveals need no wrapper.
- `src/components/ui/Select.tsx` / `Select.module.scss` — optional `icon` on `SelectOption`, rendered in the trigger and option rows; searchable single and multiple selection, option descriptions and minimum dropdown widths remain. Upstream portal classes and right-edge alignment compose with the fork viewport bounds and multi-select sizing.
- `src/components/ui/Table/Table.module.scss` — a 12px top margin on the table frame. The sticky trailing action column is analytics-owned (`.stickyAction` in `src/features/analytics/Analytics.module.scss`).
- `src/styles/components.scss` — `.btn-icon` sizing for the Button icon slot.
- `src/components/layout/MainLayout.tsx` — sidebar selection scoped to the analytics parent page.
- `src/features/providers/components/ProviderCategoryList.tsx` — logo rendering moved into the shared `ProviderLogo` component (also used by Event filters, DL018).

No upstream behaviour changes; every addition is opt-in through a new prop or class.

**Implementation evidence:** `src/components/ui/{Button.tsx,Card.tsx,Select.tsx,Select.module.scss}`, `src/styles/components.scss`, `src/components/layout/MainLayout.tsx`, `src/features/providers/components/{ProviderCategoryList.tsx,ProviderLogo.tsx}`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,576 tests, ESLint, TypeScript compilation, and the single-file production build. Sixteen isolated Chrome CDP checks cover quota, OAuth, both routing screens, desktop/mobile widths, and light/dark themes without overflow or runtime exceptions. The pre-merge baseline passes 2,320 tests. Turkish strings are machine-translated pending native review; live integration remains pending against the merged CPA.

**Last updated:** 2026-10-31

### DL058 — Remote development access

Vite listens on all network interfaces and accepts all host names so the existing mock-data
workspace can be opened through a remote IP address or a custom development hostname.

**Implementation evidence:** `vite.config.ts`.

**Recorded validation:** The running development server on port 18517 returned HTTP 200 with a custom Host header.

**Last updated:** 2026-10-19

### DL059 — Dense short-range analytics buckets

Analytics requests for the rolling one-hour and six-hour presets now use 15-minute and 30-minute
buckets respectively. The range URL state and displayed range labels remain unchanged, while the
timeseries and analysis charts receive the denser points through the existing bucket-width query
field. Other ranges retain their existing widths.

**Implementation evidence:** `src/features/analytics/query.ts`, `src/features/analytics/views/{Overview.tsx,Analysis.tsx}`, `src/features/analytics/ViewerPage.tsx`; tests: `tests/analyticsRange.test.ts`.

**Recorded validation:** The analytics range regression test covers 1h → 15m, 6h → 30m, and the unchanged 24h
hourly mapping. TypeScript compilation and lint pass.

**Last updated:** 2026-10-19

### DL060 — Kiro sign-in in the OAuth gallery

Kiro is a first-class tile in the upstream provider gallery (`src/features/oauth/providers.ts`). Unlike
the other browser providers, opening the tile does not start sign-in: the flow dialog first shows the
Kiro account choice (`KiroLoginSetup`), AWS Builder ID or IAM Identity Center. Identity Center adds
Start URL and Region fields, validated in `kiroOAuth.ts` (https start URL, AWS region pattern) and
remembered in browser storage; an invalid entry disables the start button, and the Start URL error
only appears once something is typed. Starting sends `start_url` and `region` with
`/oauth/auth-url?provider=kiro`. Kiro accepts manual callback submission with its
`http://127.0.0.1/oauth/callback` placeholder, and "Start over" / "Log in another account" return to
the account choice instead of reusing the previous options. The fork's former inline Kiro card on
`src/pages/OAuthPage.tsx` was removed with that page.

**Implementation evidence:** `src/features/oauth/providers.ts`, `src/features/oauth/{kiroOAuth.ts,OAuthPage.tsx}`, `src/features/oauth/components/{KiroLoginSetup.tsx,OAuthFlowDialog.tsx}`, `src/features/oauth/hooks/useOAuthFlows.ts`; tests: `tests/kiroProvider.test.ts`.

**Recorded validation:** On 2026-10-19: `tests/kiroProvider.test.ts` covers the registry entry, callback support,
both setup states, and validation. Through Chrome CDP against a CPA built from the fork, the gallery
showed the Kiro tile; the dialog started a Builder ID login (AWS authorize URL, status polling), and an
Identity Center attempt sent `start_url` and `region` to CPA. Desktop 1440px and mobile 390px had no
horizontal overflow.

**Last updated:** 2026-10-19

### DL061 — Complete fork translations across seven locales

English, Simplified Chinese, Traditional Chinese, Russian, Vietnamese, Korean and Turkish share one union of upstream and fork keys. Fork-only analytics, structured API keys, quota reserves/summaries/history, Kiro, Z.AI, OpenCode Go, storage and routing text exists in every locale rather than falling back to Simplified Chinese. Locale tests enumerate all seven languages and require equal key sets and matching interpolation tokens. Claude product names are consistently Max for `plan_max`/`plan_max5` and Ultra for `plan_max20` across all seven locales. Turkish fork strings are machine-translated and still need native-language review.

**Implementation evidence:** `src/i18n/{index.ts,locales/*.json}`, `src/utils/{constants.ts,language.ts}`; tests: `tests/{koreanLocale,turkishLocale,quotaPlanTier,claudeOAuthUsage,analyticsEventRouting,analyticsOverview,oauthPage}.test.ts`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,593 tests, ESLint, TypeScript compilation and the single-file production build. The weekly-only Ultra regression passed on the merged code before the plan update, so no missing-window implementation fix was needed. Eight isolated Chrome CDP checks at 1440px/390px in light/dark themes verify the weekly-only Ultra card, 150% Max-plus-Ultra capacity, history, session exclusion, reserves, and spaced Pro 500 badge without overflow or runtime exceptions. Live CPA integration is still pending against the merged CPA.

**Last updated:** 2026-10-31

### DL062 — Analytics filter restoration

CPAMC remembers the last serialized Analytics filter query in browser local storage. Returning to an `/analytics/*` route without query parameters restores that query and updates the URL. Explicit query parameters remain authoritative, so shared links and deliberate filter changes are preserved.

**Implementation evidence:** `src/features/analytics/AnalyticsFilterProvider.tsx`, `src/features/analytics/analyticsFilterStorage.ts`, `tests/analyticsFilterStorage.test.ts`.

**Recorded validation:** On 2026-10-21: focused analytics storage and contract tests pass; lint, TypeScript, and the single-file production build pass.

**Last updated:** 2026-10-21

### DL063 — Keys catalog follows Rank by; stable Top Models colors

The Keys catalog's Top model column follows the selected Rank by metric. Ranked by tokens it shows the key's highest-token model and token count. Ranked by cost it shows the key's highest-known-cost model and that cost, read from CPA's additive `top_cost_model` / `top_cost_model_usd` key catalog fields. A backend without those fields shows Unknown in cost mode instead of the token leader. Sorting the column and its header help follow the same metric.

Top Models assigns each model's hue from its token rank, whatever metric is selected, so switching between Tokens, Price, and Generation time reorders the ranking without repainting models. The hue ramp starts after the token-category colors and wraps through all ten categorical tokens, so every server-ranked model keeps a distinct hue even when the cost ranking surfaces a model outside the token top six.

The API keys filter is disabled on the Keys tab and shows All API keys, because the catalog always ranks every key and ignored the selection. The whole field is dimmed with a not-allowed cursor so the locked state reads at a glance. The selection persists for the other tabs.

**Implementation evidence:** `src/features/analytics/views/KeysView.tsx`, `src/features/analytics/views/keys/keyRanking.ts`, `src/features/analytics/views/analysis/{analysisModel.ts,TimeSeriesCharts.tsx}`, `src/features/analytics/{AnalyticsKeyFilter.tsx,AnalyticsShell.tsx,components/AnalyticsShared.tsx,Analytics.module.scss}`, `tests/{analyticsKeysView,analyticsAnalysis,analyticsPalette}.test.ts`.

**Recorded validation:** On 2026-10-22: `bun run verify` passes 2,081 tests, lint, TypeScript, and the production build. An isolated Chrome CDP run against a fresh local CPA, a priced mock OpenAI-compatible upstream, and real proxied requests confirmed cost-mode `pricey-small $0.10` versus token-mode `cheap-bulk 150K tokens`, identical per-model swatch colors across all three Top Models modes, and a disabled `All API keys` filter on Keys only, rendered at 0.6 opacity with a not-allowed cursor while Analysis keeps full opacity.

**Last updated:** 2026-10-22

### DL064 — Standalone Model Leaderboard analytics page

Adds a standalone Analytics page at '/analytics/model-leaderboard' (sidebar group between Usage and Analytics Management; the legacy '/analytics/leaderboard' Keys redirect is untouched). The page reads a fixed rolling week through the v2 analytics query with the new 'model_leaderboard' operation — schema_version 2, named 'last_n_days' range with n=7, and the viewer's IANA zone beside the range — and renders the four CPAUK awards (Most Used, Most Reliable, Speed Maniac, Most Talkative) as podium cards: ranks 2-1-3 on the left with medal-framed avatars, award header and runners-up (ranks 4-6) in the right rail. Below the mobile breakpoint the runners-up collapse into a keyboard-operable details accordion; empty awards show per-metric copy, and podiums with one or two ranked models keep dashed placeholder slots instead of collapsing. Avatars resolve a provider-independent model family from the model id; the mascot registry ships empty (one line adds a family mascot) and falls back to lab logos, with a neutral placeholder for unknown families. Medal tokens ('--medal-*') join every theme, and all six locales carry the new strings.

**Implementation evidence:** 'src/types/analytics.ts', 'src/services/api/analytics.ts', 'src/features/analytics/navigation.ts', 'src/features/analytics/{AnalyticsPage.tsx,AnalyticsTabs.tsx}', 'src/components/layout/MainLayout.tsx', 'src/features/analytics/views/ModelLeaderboard.tsx', 'src/features/analytics/views/leaderboard/*', 'src/styles/themes.scss', 'src/i18n/locales/*', 'tests/analyticsModelLeaderboard.test.ts', 'tests/analyticsContracts.test.ts'.

**Recorded validation:** On 2026-10-23: 'bun run verify' passes 2,097 tests (including new model-leaderboard coverage for family resolution, empty awards, 1- and 2-row podiums, runners-up visibility, navigation mapping, and the wire request), lint, TypeScript, and the production build. An isolated Chrome CDP session against the dev server with intercepted '/analytics/query' responses (full, empty, 1-row, 2-row) confirmed desktop and mobile renders in light and dark themes, correct sidebar highlighting, hidden tab bar on the standalone page, expanded/collapsed runners-up per breakpoint, and the legacy redirect.

Live check on 2026-10-23: a CPA build from the same change set served this bundle as its management panel, proxied seven real Z.ai 'glm-5.3-flash' requests carrying four distinct 'X-Session-ID' values, and the page reached through the sidebar after a real login showed Most Used 4 sessions and Most Talkative 322 tokens at 76% reasoning, matching a hand computation from the stored events, while Most Reliable (7 attempts) and Speed Maniac (P70 64 tok/s) showed their floor empty states. Lab-logo avatars render at 55% of the medal frame on desktop (1440px) and mobile (390px) with no console errors.

Follow-up on 2026-10-23: Most Talkative hides the reasoning-share line when a model's share is zero, because providers that never break reasoning out store zero and the line would read as "0% reasoning". Name glyphs now render the light/dark pair like podium avatars, so the OpenAI and Grok marks no longer vanish on light themes, and the mobile Runners-up summary renders as a list item so its disclosure marker shows. A seeded preview (12 models, 11,929 events) viewed over the tailnet confirmed a no-reasoning model on the podium without the line.

Polish on 2026-10-23: first load shows a leaderboard-shaped skeleton (chip, four cards, 2-1-3 podium, runners-up) whose geometry matches the loaded cards exactly at desktop width, through a new optional 'skeleton' slot on the shared 'AsyncState'; reloads over existing data keep the cards and show the Usage-style 'Refreshing' pill in each card's corner, dimming content on a manual refresh. Podium values count up with the shared 'AnimatedMetric' once visible. Cards gain 24px padding, the chip-to-card gap is restored (the extra AsyncState wrapper had swallowed it), and 2nd/3rd frames grow to 80px. Layout-shift observation on remount and on Refresh All reports a cumulative score of 0.0002.

Loading corrections on 2026-10-25: the four award cards and their real titles and descriptions
render immediately, with skeletons only in the ranking regions. The date portion of the real
range chip reserves localized text width while CPA resolves the window. Neutral skeletons replace
the text, units, medal frames, podium steps, and runners-up heading and rows until rankings arrive.
They preserve the loaded geometry without showing award decorations prematurely. Empty awards
retain that space behind their message, and missing runners-up retain their rail space.
Optional mascot images show the family lab logo until the image loads, then replace it without
changing the frame. Existing remembered
image failures still fall back to the logo. Speed Maniac now states the backend's P70 floor of
at least 80 tok/s in all six locales. CPA already guarantees four awards, so no metadata endpoint
or ranking-contract change is needed.

Mascot containment correction on 2026-10-26: mascot images use block layout inside their loading
wrapper. Inline image baseline space had enlarged the wrapper's grid row after decoding, making
72px and 88px images grow to 78px and 94px and extend below their medal frames. The image now
fills only the frame's inner area; pending and failed-image lab logos keep their existing layout,
and medals retain their intentional overflow. Browser regression checks measure image bounds
against the inner frame, excluding its 4px border, because card geometry alone misses this bug.

On 2026-10-25: `bun run verify` with Bun 1.3.14 passes 2,115 tests, lint, TypeScript,
and the single-file production build. Isolated Chrome CDP checks through the normal login and
Model Leaderboard route with intercepted API fixtures cover every award size from zero through
six models at 1440px and 390px. Card positions and heights match before and after the ranking
response, card DOM nodes persist, and no body overflow or runtime exceptions occur. The loading
state has no medal frames, podium steps, medals, or runners-up labels. Delayed mascots show lab
logos; successful loads and 404 fallbacks preserve the card geometry. Mobile
runners-up still toggle, and Refresh All retains populated cards with their refreshing status.
Additional dark-theme checks cover Russian at 1200px and Korean at 390px. The mechanical design
scan reports no findings.

The shared Skeleton now derives contrasting gradient colors from the theme palette and swaps
their roles in Dark mode. Its former base and highlight both resolved to `--bg-tertiary` in
White and Light themes, so the shimmer animated without a visible color change. Chrome CDP
checks compare resolved gradient colors in all three themes and confirm that reduced-motion
mode still disables the animation. A paused loading state and delayed ranking/image sequence
were recorded from lossless PNG frames to verify the visible shimmer and stable card geometry.

Mascots on 2026-10-23: podium avatars gain optional family mascot art — eight 192x192 WebPs under
'public/management-assets/mascots/<family>.webp' (claude, deepseek, gemini, glm, gpt, grok, kimi,
qwen) referenced by relative URL, so 'dist/index.html' stays a single file and Vite copies the
images verbatim next to it; CPA serves them from its embedded bundle at the same path. Registry
entries are one line each ('MODEL_FAMILY_MASCOTS'); a failed load falls back to the lab logo via
img onError with the url remembered (no retry, no broken image, and the quiet logo-tile styling
and frame geometry carry over). Mascot photos fill the frame with 'object-fit: cover' and the
frame's inner corner radius; minimax and unknown families keep the lab logo/placeholder. Tests
cover family-to-url resolution, the public/ file-exists check, and the remembered-failure fallback;
'bun run verify' passes and the single-file artifact does not grow by the image bytes. Isolated
Chrome CDP sessions against the dev server with the seeded preview confirmed desktop (1440px)
light and dark plus mobile (390px) renders with all eight mascots loading at the 96px and 80px
medal frames, and a 404-intercepted claude.webp swapping to the lab-logo tile with a single
request (no retry), no broken image, and no layout change. Mascot photos never take the dark-theme logo inversion, and the 14px name and runners-up glyphs always show the lab logo, because a photo is unreadable at that size. Served from CPA's embedded bundle over the tailnet, the six podium mascots loaded with 200 responses and no console errors. Frames drop their inner padding and use a 4px medal border so the photo fills the frame, and the GLM family uses the Z.ai light/dark logo pair (the auth-file list already uses it) instead of the Zhipu mark.

**Last updated:** 2026-10-26

### DL065 — Qualified output arrival telemetry in Analytics

Analytics treats the additive Event `throughput` object as the only qualified arrival-rate source. The table column is labeled Arrival rate; locally tokenized windows retain approximate-count tooltips and accessible descriptions, and the frozen unavailability reasons are explained in plain language. A flat alias from an older CPA server renders as Legacy and is never promoted to a qualified observation. Event details keep Arrival rate, Token source, the separate whole-attempt Effective output rate, and first-to-last Arrival window evidence; timing and analysis labels say Output window instead of implying a provider-reported generation duration. The speed award explains P70 qualified successful arrivals and shows qualified samples against successful attempts. A fallback estimate for unmeasured requests is handled separately in DL066 and never enters these observed rankings. EST is reserved for historical cohort predictions, superseding the earlier shared badge for approximate token counts. Observed arrival rates and whole-attempt effective rates never carry EST. For observed windows with approximate token counts, the detail sheet visibly says Token count: Calculated locally, and the timing graph retains its approximate-count tooltip without an EST suffix. Types preserve nullable `stream` and `reasoning_effort` plus optional batching diagnostics for exports without adding noisy metrics. All six locales carry the new copy.

**Implementation evidence:** 'src/types/analytics.ts', 'src/features/analytics/views/Events.tsx', 'src/features/analytics/views/events/{eventDiagnostics.ts,EventTimingGraph.tsx,EventDetailSheet.tsx,EventDetail.module.scss}', 'src/features/analytics/views/leaderboard/ModelLeaderboardAwardCard.tsx', 'src/features/analytics/views/KeysView.tsx', 'src/features/analytics/views/analysis/{KeyModelHeatmap.tsx,LatencyDiagnostics.tsx,TimeSeriesCharts.tsx}', 'src/features/analytics/views/overview/OverviewKpis.tsx', 'src/i18n/locales/*', 'tests/analyticsEvents.test.ts', 'tests/analyticsEventDiagnostics.test.ts', 'tests/analyticsModelLeaderboard.test.ts'.

**Recorded validation:** On 2026-10-24: `bun run verify` passed the full panel suite, ESLint, TypeScript, and the Vite single-file production build. Focused regressions cover qualified, estimated, unavailable, and legacy rate states; effective-rate separation; output-window parsing; detail copy; and leaderboard coverage semantics.

**Last updated:** 2026-10-26

### DL066 — Guarded arrival-rate estimate for unmeasured events

When CPA publishes the additive Event `throughput_estimate`, the panel renders it only for requests without a measured arrival window or legacy alias. A measured window always wins, and old-server values stay Legacy, so a stale estimate can never pose as an observation. Unmeasured events can show an Estimated arrival rate with an EST pill, the empirical historical P10-P90 arrival range, training and validation sample counts, validation error and range coverage as localized percentages, plus human-readable history and as-of times. The range is described as observed spread, not a confidence interval. Estimated values never enter the timing graph, never draw an output bar, never use the approximate-token marker, and never feed the speed leaderboard, whose copy now states that rankings use measured windows only. The EST pill identifies only this historical prediction, never a locally counted observation or whole-attempt effective rate. Approximate token-count explanations remain separate from prediction labels. Validation and history notes sit in a native disclosure so touch and keyboard users can read them, and an unavailable-estimate row is omitted when it would only repeat a failed, ineligible, or already-explained gap. Estimate unavailability reasons are spelled out in plain language in all six locales, and raw cohort or method identifiers stay out of primary copy.

**Implementation evidence:** 'src/types/analytics.ts', 'src/features/analytics/views/Events.tsx', 'src/features/analytics/views/events/{eventDiagnostics.ts,EventDetailSheet.tsx,EventDetail.module.scss}', 'src/i18n/locales/*', 'tests/analyticsEventDiagnostics.test.ts', 'tests/analyticsModelLeaderboard.test.ts'.

**Recorded validation:** On 2026-10-25: `bunx bun@1.3.14 run verify` passed 2,120 tests with no failures, ESLint, TypeScript, and the Vite single-file production build. Focused regressions cover observed-over-estimate precedence, EST fallback marking, meaningful versus redundant unavailable estimates, percentage formatting, absence of a fabricated timing bar, keyboard-reachable estimate details, legacy aliases, and measured-only leaderboard copy.

**Last updated:** 2026-10-26

### DL067 — Config Panel storage usage

Collection and storage displays live filesystem usage from CPA's authenticated v8 storage
endpoint. The stacked bar and legend separate CPA logs, CPA data, other files, and available
space, with usable capacity and a measurement timestamp. Each filesystem gets its own bar.
The display reuses CPAMC's theme palettes, wraps the legend into aligned rows on narrow
screens, and keeps exact sizes visible for categories smaller than 0.01% of capacity.
Measured locations and the accounting scope are available in a native disclosure.

Readings refresh every minute while the page is visible and through a manual refresh action.
Connection changes discard the previous host's readings and cancel in-flight requests.
Failures preserve the last successful measurement with a warning; unsupported backends and
partial scans have explicit states. All six locales carry the added copy. The API adapter
validates the response and normalizes backend field names before rendering.

**Implementation evidence:** `src/services/api/storage.ts`, `src/features/config/storageUsage.ts`, `src/features/config/components/StorageUsage.{tsx,module.scss}`, `src/features/config/components/sections/AnalyticsSettingsFields.tsx`, `src/i18n/locales/*`, `tests/storageUsage.test.ts`.

**Recorded validation:** On 2026-10-27: `bunx bun@1.3.14 run verify` passes 2,130 tests, ESLint,
TypeScript, and the single-file production build. Contract tests cover multiple filesystems,
partial results, invalid counts and inconsistent partitions, zero capacity, and localized
sizes through TiB. Live Chrome CDP checks exercise the Config Panel against the built CPA
server at desktop and mobile widths in light, dark, and white themes. Refresh, measured-location
disclosure, and preservation of readings after a failed refresh pass; no runtime errors or
horizontal overflow were observed. The CPA Docker image also builds and serves the bundled panel.

**Last updated:** 2026-10-27

### DL068 — Kiro credit pricing in analytics

Analytics supports the Kiro USD-per-credit setting, displays reported credits and the applied rate on events, and includes credit-based cost in analysis totals while hiding its category from the breakdown and model table. Incomplete token breakdowns use the generic partial-data presentation. Manual pricing overrides retain precedence. The credit editor appears only when the server exposes the setting; token-rule updates remain compatible with older servers. Events without credit fields remain supported.

**Implementation evidence:** `src/features/analytics/**`, `src/services/api/analytics.ts`, `src/types/analytics.ts`, `src/i18n/locales/**`.

**Recorded validation:** `bun run verify` passes 2,138 tests, lint, TypeScript and production
build. Desktop and mobile CDP checks against the Docker app verify four visible
token categories, hidden costs in totals and percentage denominators, and retained
rate-editor and event-credit details. Mixed token/credit fixtures preserve full
monetary totals without page overflow. Earlier live Kiro checks cover metering,
rate editing, restart and repricing. The canonical panel bundle and repository
Docker image build successfully.

**Last updated:** 2026-10-27

### DL069 — Model cost modal and cache-hit efficiency

Model Cost Efficiency replaces its cache-write column with a sortable cache-hit rate (cache-read tokens over all input tokens, the Overview ratio); zero-input rows show a dash. Clicking a row opens a modal with the model's family logo, provider and cost share, KPIs, a stacked cost history split by provider and service tier, and cost and token category bars. The provider and cost share sit under the model name in the modal header. The chart uses monotone smoothing and a bottom-right legend of plain line swatches. Tier colors skip the four token-component hues so they never read as a category in the bars below. The compact tooltip shows one row per tier, plus labeled rates and multipliers only when they differ from the base. It flips to the left of the cursor on the chart's right half and uses date-only headers for daily buckets. The category bars use the Usage page's token colors, with inline, non-interactive legends. Shares appear in their titles. Table rows use the shared table hover, without a focus highlight that lingered after the modal closed. Each cost cell keeps its share inline beside the amount, and zero-token models show a dash instead of "Price unknown". The series comes from CPA's `model_cost_series` query, prefetched on row hover or focus and cached per selection for 30 seconds, so nothing loads up front and touch taps still work. The modal stays open across analytics auto-refresh, restores focus to its row, dims the whole page, and distinguishes unknown prices and missing token data from missing requests.

**Implementation evidence:** `src/features/analytics/views/analysis/**`, `src/services/api/{modelCostSeries.ts,modelCostSeriesCache.ts}`, `src/types/analytics.ts`, `src/i18n/locales/**`.

**Recorded validation:** `bun run verify` passes 2,203 tests, lint, TypeScript and production build. CDP checks on desktop and mobile in both themes confirm one request per hovered row and none on open, a modal that survives a 67-second refresh, focus return, a three-tier tooltip inside the chart, and the unknown-price and zero-token states.

**Last updated:** 2026-10-30

### DL070 — Event pricing, session, and outcome details

The event detail sheet shows the recorded pricing as a component, tokens, rate, and cost table, with the app's cost formatting (exact values in titles). A one-line `×N` tier caption sits above it and a footer row shows the total. The uncached row is labeled "Uncached input", and zero-token rows keep their rate but show a dash for cost. Kiro events show credits used, price per credit, and total; events without a snapshot read as not recorded. Client to CPA shows the raw client session ID, or "Not sent by client" when the client supplied none. Provider and CPA-to-client errors use the shared JSON highlighter when the payload parses as JSON, and the plain error tone otherwise. Sections have a single divider, and for client-side failures the error class appears in the failure-point section. Outcomes come from CPA: canceled events use a neutral badge, keep the reached provider step, mark the client disconnect on the return leg, label the payload "Disconnect reason", and show no failure point. Event filters add a debounced Session ID field (spell-check off, on one row with Clear filters) and replace the success/failure selector with one Outcome control (All, Success, Failure, Canceled); legacy `result=` links map to outcomes.

**Implementation evidence:** `src/features/analytics/views/events/**`, `src/features/analytics/views/Events.tsx`, `src/features/analytics/query.ts`, `src/types/analytics.ts`, `src/i18n/locales/**`.

**Recorded validation:** `bun run verify` passes 2,203 tests, lint, TypeScript and production build. CDP checks cover token, Kiro, and historical pricing variants, a real canceled stream, a provider-hop error, raw and absent session IDs, and typing into Session ID at 50 ms per key without lost characters.

**Last updated:** 2026-10-28

### DL071 — Quota history chart with drain projection

On a provider tab, a quota history chart replaces the summary card. Its header carries only the title and the "N% of M% tier" figure, both at the Quota windows heading size. CPAMC posts per-credential window samples to CPA after each refresh, once per fetched reading, so revisiting the page does not re-post cached readings as new ones. It rebuilds the hourly total with the same aggregation as the live summary. A credential's last sample carries forward until an unobserved reset, and a credential with no reading for 24 hours (disabled, removed, or failing to fetch) leaves the total instead of blanking it. Samples without a plan, such as CPA's hourly Claude samples, reuse the credential's last recorded plan. The chart spans the Quota windows weekly range with a current-time marker, and its plot stretches to the heading's edges. It scales to the visible capacity on round ticks, with a capacity line that stays out of the tooltip. The remaining line is lightly smoothed, and the remaining and projected lines carry translucent fills in the provider's Quota windows color. A legend footer names the charted window and explains the total and projection. The dashed projection starts from the credentials behind the live summary and falls back to stored samples only without live readings, so a disabled or failing credential does not suppress it. Each credential drains at its net drop per reset cycle over the last week, so fluctuating or stale readings do not inflate the rate, and refills at the live reset times. The All tab is unchanged, and the chart is hidden when analytics is unavailable.

The shared Quota windows timeline adopts upstream calendar-boundary cells with elapsed-time widths across DST changes. Used fills are measured against the full window before clipping; projected windows do not reuse stale usage. Claude anchors on the reported weekly limit. Fork Z.AI/OpenCode Go lanes, localized window labels and percentage formatting remain alongside these fixes.

History uses the same updated plan ratios as the live summary: Codex Pro 100/200/500 are 10/20/50 Plus units; Claude Max/Ultra are 5/10 Pro units while stored `plan_max5`/`plan_max20` IDs stay valid. Verified Ultra samples contain the weekly windows that were actually reported, with no invented five-hour sample or projection.

**Implementation evidence:** `src/features/quota/**`, `src/services/api/quotaHistory.ts`, `src/i18n/locales/**`; tests: `tests/{quotaHistory,quotaTimeline,quotaTimelineDst,claudeUltraQuota}.test.ts`, `tests/fixtures/claude-ultra-usage.json`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,593 tests, ESLint, TypeScript compilation and the single-file production build. The weekly-only Ultra regression passed on the merged code before the plan update, so no missing-window implementation fix was needed. Eight isolated Chrome CDP checks at 1440px/390px in light/dark themes verify the weekly-only Ultra card, 150% Max-plus-Ultra capacity, history, session exclusion, reserves, and spaced Pro 500 badge without overflow or runtime exceptions. Live CPA integration is still pending against the merged CPA.

**Last updated:** 2026-10-31

### DL072 — ClickHouse server mode in storage, settings, and analytics health

CPA can store analytics and request capture in ClickHouse (CPA DL060). When the storage response includes ClickHouse, Collection and storage renders one stacked bar per ClickHouse disk with the same legend, formatting, and measured-source disclosure as local volumes. The segments are CPA analytics, request logs and transcripts, other CPA tables, other ClickHouse data, other files, and free space. An unreachable ClickHouse shows an inline unavailable state, and local volumes stay visible.

The same section edits the ClickHouse DSN (as a password input), database, telemetry retention, and agent-query limits, with restart hints for the DSN and database. The visual editor leaves untouched YAML as it was and writes numeric fields as numbers. Analytics copy in all six locales describes ClickHouse storage and its DSN requirement. SQLite now appears only for the one-time legacy import and the files beside it, and backup and maintenance copy describes logical exports and ClickHouse checks.

Analytics health shows the legacy analytics import and the legacy request-log import as status chips: pending, running, done with counts, failed with the reason, or abandoned with the reason. Telemetry health loads in parallel. When it is unavailable, including a 503, the request-log item is hidden and analytics health still shows. Servers without these fields keep the previous health view.

**Implementation evidence:** `src/features/config/{storageUsage.ts,components/StorageUsage.tsx,components/sections/AnalyticsSettingsFields.tsx,visualConfigServer.ts}`, `src/features/analytics/views/{Maintenance.tsx,manage/maintenanceModel.ts}`, `src/services/api/{storage.ts,analytics.ts}`, `src/types/{analytics.ts,visualConfig.ts}`, `src/i18n/locales/**`, `tests/{analyticsLegacyImport.test.tsx,visualConfigClickHouse.test.ts}`.

**Recorded validation:** `bun run verify` passes, along with focused rendering and contract tests for every import state, a telemetry 503, and the locale keys. Isolated Chrome CDP checks against a local CPA and ClickHouse database cover the storage card on desktop and mobile in light, dark, and white themes, plus real import health showing Done with counts, Failed with the reason, and Abandoned.

**Last updated:** 2026-10-28

### DL073 — Config Routing tab, rule-based routing dry run, and event routing decisions

The Config tab `routing` (03, labeled "Routing") sits between Network and Logging, renumbering the sections to 01–07. Routing strategy, session affinity, its TTL, subagent inheritance and force-model-prefix move there from Network, and the previously UI-less `routing.session-affinity-rebind-on` gains an `any`/`quota` select that passes unknown values through. The tab renders the precedence stack weakest-first: custom rules, routing strategy, session affinity, then the read-only routing gate (disabled, cooling down, quota, quota reserve, model not supported, model prefix, retry round, weight, pinned/policy). The section description explains the stack, a one-line legend under it bolds the three rules of thumb (only the base-rule note keeps a lock icon), all-caps CUSTOM RULES and BASE RULES labels head the two groups, base rules sit on a diagonal-stripe background mixed from the theme's text color and carry a locked BASE pill, and each gate chip carries the same icon the event matrix uses for that reason. Custom rules use a client-id draft list. A dashed placeholder adds a rule: it is the empty state, then sits under the last rule and appears only while every rule is valid, so drafts are finished one at a time. Each rule has an inline name, enable switch, duplicate/delete, keyboard move up/down plus native drag reordering, a WHEN → ROUTE TO summary, and a recursive ALL/ANY/NOT condition builder over model, api-key, client and header with the server's operator set and limits. The field and operator menus open at least 300px wide and describe every option (for example, "is" is an exact case-insensitive value, "matches" a `*`/`?` wildcard, "regex" a case-sensitive regular expression); `Select` gained an optional `dropdownMinWidth` for this, and its trigger text now fills the space after an option icon. Condition selects, inputs and the `in` token box share one 36px height. Model, API key, client and header carry an icon in the field menu, its trigger, the rule summary and the event condition line; one splitter places the icons in both panel-rendered and CPA-rendered condition text, skipping quoted values, list values and header names. `routing.rules` is written with an AST-preserving writer that reuses baseline nodes, so untouched rules stay byte-identical and edits, reorders and deletions only rewrite the affected nodes (the server rejects unknown rule fields, so none reach the editor from a valid config). Comments outside the rules list are kept; comments inside the list, on or between rule items, are lost when a save applies the JSON PATCH, exactly as with the existing payload rule lists. The null `routing` section is normalized on first write, rebases re-align editor ids, and saves guard the list with `assertConfigListsUnchanged(['routing','rules'])`. Client validation mirrors the server's structure rules (one operator, non-empty values, regex length, non-empty route-to, depth/node/target/rule limits counted on the serialized tree) plus a conservative RE2 check (inline flags and `(?P<name>` are rewritten before a JS parse; lookarounds and backreferences are rejected) that flags only patterns Go would reject, so the server's save error stays the final word, and blocks saving with an inline message per rule. Route targets are picked from `GET /routing/credentials`, show label, provider and a disabled badge, and unknown ids render as removable missing chips; Home mode shows a notice that custom rules are ignored. The side panel posts the current draft rules to `POST /routing/dry-run` (debounced, side-effect free) and renders the trace as the winner card plus one row per layer in stack order, including rule statuses, tier pool and pick (or "not predictable"), affinity state, and blocked candidates with reasons; a rejected draft shows the endpoint's message and path inline. All seven locales carry the new copy.

Usage → Events → Event details gains a "Routing decision" section directly after "Request path", fed by the event-detail `routing_trace`. A verdict line shows the routed credential and how it was chosen (strategy, session binding, pin, plugin, paid credits, or Home) with the applied rule; the applied rule's rendered condition sits on its own muted line, with a fell-through marker when a matching rule could not be used. A compact dot matrix has one row per layer in stack order (custom rules, strategy, session affinity, routing gate) and one column per candidate, aligned with CSS subgrid; glyphs show wanted, overridden, bound, kept, broken, held, gate-passed and blocked states, with each blocked cell drawing its gate reason's icon in red (a piggy bank for a quota-reserve hold, a snowflake for cooldown, and so on), the deciding row carries a crown chip, and the routed column has an accent band. Every cell, row and the verdict explain themselves in tooltips on hover and keyboard focus. More than 16 candidates collapse untargeted blocked credentials into one "+N blocked" cell. Traces are normalized at read time (null arrays become empty, malformed traces hide the section), and events without a trace omit the section.

The Config rule editor and its `/routing/credentials` and `/routing/dry-run` adapters coexist with upstream's separate Routing board, which reads and patches `/config` for priorities, weights and policy. Their API and type modules contain both contracts. The board does not replace the Config rules editor or the analytics decision matrix.

**Implementation evidence:** `src/features/config/**`, `src/features/analytics/views/events/**`, `src/components/ui/{icons,Select,RoutingConditionText}.tsx`, `src/components/ui/routingIcons.ts`, `src/hooks/useVisualConfig.ts`, `src/types/{visualConfig,routing}.ts`, `src/services/api/routing.ts`, `src/i18n/locales/**`, `tests/{routingSection,visualConfigRoutingRules,configFieldParity,configUiState,configSettingLayout,configOAuthBehaviorUi,configServerUi,analyticsEventRouting}.test.ts`.

**Recorded validation:** On 2026-10-31, Bun 1.4.3 frozen installation and `bun run verify` pass 2,576 tests, ESLint, TypeScript compilation, and the single-file production build. Sixteen isolated Chrome CDP checks cover quota, OAuth, both routing screens, desktop/mobile widths, and light/dark themes without overflow or runtime exceptions. The pre-merge baseline passes 2,320 tests. Turkish strings are machine-translated pending native review; live integration remains pending against the merged CPA.

**Last updated:** 2026-10-31

## Sync Checklist

Project-specific checks every upstream sync runs, in addition to the full test suite, lint, typecheck, builds, and a smoke test of upstream and fork features.

- Install with the exact Bun version from `packageManager` in `package.json` and `--frozen-lockfile`, then run `bun run verify`.
- Keep the seven locale files on one key set: take the union of both sides' keys and translate fork-only strings in every locale.
- Check the pages that fork entries touch against a CPA built from the matching CPA fork commit, in a browser at desktop (1440px) and mobile (390px) widths, in light and dark themes.
- Push `main` before advancing CPA's `web/management-center` gitlink, then rebuild CPA's panel bundle.

## Merge History

This is an append-only decision record, newest first, with one entry per upstream sync. It explains past integrations but does not by itself establish a current divergence; use the Divergence Log for that. Sync with upstream only when the user explicitly asks. Do not edit past entries.

### 2026-10-31 - Merge upstream `main` at `4e4aeff`

Target: `upstream/main` at `4e4aeff23f9f82b3ccdbe48b2e774d5dc918234e`.
Parents: fork `653310f95f2805ec74aa2711b7e8edca6634a330` and upstream `4e4aeff23f9f82b3ccdbe48b2e774d5dc918234e`. Merged 41 upstream commits without rebasing or squashing.

User decision: Codex badges follow upstream: elite liquid platinum is Pro 500 only; Pro 200 and Pro 100 use premium gold. This merge preserves the fork's quota-summary capacity values and Claude plan labels for a separate follow-up.

Other decisions: retain the fork quota list, summary, reserve stripes, tooltips, history and badge artwork; combine Kiro setup with upstream SIWC, login transitions and storage changes. Keep the Config rule editor and dry run alongside upstream's Routing board. Preserve analytics palettes and merge the locale key union, including Turkish. Use upstream dependency versions plus required fork dependencies and regenerate `bun.lock` with Bun 1.4.3.

Integration repairs: preserve GSR and credential labels in the Routing board, avoid fabricated fixed GSR traffic shares, combine routing APIs/types, retain query/hash redirects and client connection/cache hooks, support Kimi plan display and Claude host slots in the fork layout, and adopt timeline DST/clipped-fill fixes. Locale-enumerating tests now include all seven languages.

Validation: Bun 1.4.3 frozen installation and `bun run verify` pass 2,576 tests, ESLint, TypeScript and production build. Baseline: 2,320 tests pass with no failures. Final focused Claude checks pass 58 tests; routing/locale/plan checks pass 56 tests. Sixteen isolated Chrome CDP checks exercise quota, OAuth, upstream Routing and Config Routing at 1440px/390px in light/dark themes, including the dry-run endpoint, with no overflow or runtime exceptions. Turkish strings are machine-translated pending native review. Live CPA integration remains pending and will be checked against the merged CPA.

### 2026-10-19 - Merge upstream `main` at `fe29633` (`v1.26.5`)

Merged 41 upstream commits into the fork's 77 with a single merge commit. Decisions:

- OAuth: adopted upstream's provider gallery and focused flow dialog (`src/features/oauth/`). Kiro was
  ported into it as a tile with its account choice inside the dialog (DL060); plugin OAuth cards,
  Vertex import, Devin cancellation, and callback handling come from upstream's flow hook, which already
  matched the fork's behavior. `src/pages/OAuthPage.tsx` and its stylesheet were removed.
- Config: adopted upstream's setting-row primitives (`FieldPrimitives`, generated IDs, `ToggleSwitch`
  external label) for ordinary fields and the upstream GitHub token field. The fork tab order, CPAUK
  analytics groups (rewritten on the setting rows), OAuth safeguard toggle, GSR routing option, and the
  full-width structured API-key editor stay. Upstream's removal of the Quota section and its deprecated
  `quota-exceeded` switches was accepted; CPA v8 only exposes those through deprecated v0 routes.
  Antigravity credits moved to Advanced as upstream did.
- API keys and quota: kept the fork's labelled key rows (under upstream's header copy) and the fork
  quota shell; ported upstream Claude extra usage, dollar balances, stale snapshots and reset grants,
  xAI shared-usage breakdown and pay-as-you-go state, Antigravity group labels and visibility, Codex
  cooldown reset, hour-based Meta windows, and generic plugin quota (`quota_plugin_id`, v8 plugin
  routes) with plugin cards after every built-in, including Kiro, Z.AI, and OpenCode Go.
- Provider `testModel` is no longer persisted, matching upstream and CPA (no such config field).
- Adopted as-is: Korean locale (extended in DL061), i18n fixes, sponsor card, Kimi tile icons, the
  OAuth polling resume fix. Locale files are the key union of both sides.

Validation: `bun run test` 2075 pass and 2 fail; both failures (`legacy backend login diagnostic` and a
test-order-dependent cooldown hint assertion) also fail on the pre-merge fork head. Lint, TypeScript,
and the single-file build pass. Chrome CDP checks against a temporary CPA built from the fork covered
the OAuth gallery and Kiro dialog, config sections, quota (live Z.AI usage with a reserve stripe),
auth files, and analytics pages at 1440px and 390px with no horizontal overflow.

### 2026-10-07 - Merge upstream `main` at `6abace9`

The resolved merge combines 103 upstream commits with the fork's 53 commits. Upstream fixes
take precedence where behavior overlaps; fork-only analytics, structured API-key, provider
workbench, quota, and YAML-preserving configuration behavior remains. The CPAMC request layer
continues to resolve all management routes below `/v8/management`, including the fork-owned
capabilities, analytics, revisioned API-key, and API-key-limit surfaces. The public viewer stays
on `/v0/analytics/viewer`.

The merge is recorded in `e795e5554e6559c7501733b1c06b02f979c8f53f`; the `base` tag points to
that merge. Later fork commits update the CPAMC branch and CPA gitlink. The upstream legacy backend probe and its compatibility error
path were removed so application code cannot probe the deprecated `/v0/management` surface.

Validation: `bun run verify` passes 1,820 tests, ESLint, TypeScript, and the Vite single-file
production build. Parent CPA v8 route registration and the bundled panel were checked with an
isolated Chrome CDP login; the panel issued only `/v8/management/...` requests.

### 2026-09-09 - Merge upstream `main` at `ed5f1c4`

Merged 23 upstream commits into `ef9606a` with a single merge commit. Conflict resolutions
combine the fork's `ProviderLogo` and analytics configuration handling with upstream's provider
quick-fill filtering, Kimi styles, segmented toolbar styles, and Antigravity sensitive-word
parsing. Repository guidance retains the fork sync rules and upstream testing guidance.

Validation: `bun run verify` passes 708 tests, lint, TypeScript, and the production build.
Isolated Chrome CDP checks against the existing server on port 18527 cover provider and config
pages, OAuth editors, and analytics on desktop and mobile, with no reported browser errors or
horizontal overflow. Event fixtures confirm raw payload rendering and the routing-inclusive
total. These browser checks use the existing development backend; merged CPA behavior is
validated separately with the Go test suite and build. Independent review found no additional frontend issues.
