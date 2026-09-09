# AGENTS.md

React 19 and TypeScript 6 web management client for CLIProxyAPI. Vite builds the application as one
`dist/index.html` file.

## Glossary

- **CPA**: The Type-Delta CLIProxyAPI fork, including its Go proxy, Management API, and release packaging.
- **CPAUK**: CPA Usage Keeper, the analytics module embedded in CPA. Use "upstream CPAUK" for the standalone source project.
- **CPAMC**: This Type-Delta fork of Cli-Proxy-API-Management-Center, the web management client shipped with CPA.

## Repository

- Fork: https://github.com/Type-Delta/Cli-Proxy-API-Management-Center
- Upstream: https://github.com/router-for-me/Cli-Proxy-API-Management-Center
- CPA fork: https://github.com/Type-Delta/CLIProxyAPI
- CPA upstream: https://github.com/router-for-me/CLIProxyAPI

Keep `origin` pointed at the Type-Delta CPAMC fork and add the official repository as `upstream`:

```bash
git remote add upstream https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git
git fetch upstream
git rev-list --left-right --count origin/main...upstream/main
git merge --no-ff upstream/main
```

Published fork commits are merged forward. Do not rebase or force-push `main` during a routine
upstream sync. Add every sync and surviving fork change to `FORK.md`.

## Syncing this fork with upstream repository

If you are tasked with syncing this fork with upstream:

- Keep features from both sides.
- If both sides fix the same issue, prefer the upstream fix.
- If a feature conflict requires choosing one side, pause and ask the owner.
- If the correct integration is unclear, ask for guidance.
- Review the merged behavior functionally, aesthetically, and for user experience; a build passing alone is not sufficient.
- After code changes are merged, fixed, verified, and finalized:
  - Update the "Divergence Log" and "Merge History" sections in `FORK.md`.
  - Commit merge changes in a single commit with a clear message describing the merge decisions.
  - Move the `base` tag to that commit. Force-pushing this reference tag is permitted. If `gdx` is available, use `gdx tag mv base ~0`.

## Project Scope & Structure

This is a React 19 + TypeScript + Vite management frontend for CLI Proxy API, not the proxy itself.
It talks to the backend Management API under `/v0/management`.

- `src/features/`: feature-owned pages, components, hooks, types, and logic. Current features include `dashboard`, `providers`, `authFiles`, `quota`, `config`, `plugins`, and Analytics.
- `src/pages/`: existing route pages outside the feature layout. Follow nearby conventions when modifying these; do not migrate unrelated code.
- `src/components/`, `src/hooks/`, and `src/utils/`: shared UI, hooks, and utilities. Keep feature-specific code in its feature.
- `src/services/api/`: API client, domain endpoints, and backend data normalization.
- `src/services/storage/`: browser persistence.
- `src/stores/`: Zustand state.
- `src/types/`: shared types.
- `src/styles/`: global styles and theme tokens. Component-specific SCSS Modules stay beside their component.
- `src/assets/`: bundled assets, including provider icons in `icons/`.
- `src/router/`: application routes.
- `src/i18n/locales/`: English, Simplified Chinese, Traditional Chinese, and Russian locale files.
- `tests/`: Bun tests.
- `dist/index.html`: the single-file production artifact.

CPAMC talks to CPA through versioned HTTP contracts. Treat the CPA Management API as the source of truth.
CPAMC must not inspect CPA's SQLite files or infer backend configuration structs.

## Commands

Use the Bun version declared by `packageManager` in `package.json`, currently Bun 1.3.14. CI uses
Node.js 24. Keep dependency changes consistent with `bun.lock`; do not introduce another package
manager's lockfile.

```bash
bun install --frozen-lockfile
bun run dev
bun run test
bun run lint
bun run type-check
bun run build
bun run verify
bun run format
```

`bun run verify` runs tests, lint, TypeScript compilation, and the production build. Run it before
handoff. For UI changes, verify affected desktop and mobile routes through the shared CDP browser and
record the result in `FORK.md`.

## Deployment Constraints

The production artifact is a single `dist/index.html` with JavaScript, CSS, and bundled assets inlined
by `vite-plugin-singlefile`. The release workflow renames it to `management.html` for backend hosting;
`vX.Y.Z` tags trigger releases.

Preserve hash routing and single-file deployment. Changes to assets, imports, code splitting, or build
configuration must not introduce required external build artifacts. Do not edit generated `dist/` files.
App version is injected as `__APP_VERSION__` from `VERSION`, then git tags, then the package version,
falling back to `dev`.

## API Contracts & State

- Treat backend contracts as the source of truth. Inspect the CPA checkout before changing endpoint names, payloads, provider keys, OAuth callback parameters, auth-file semantics, or plugin/config contracts. If that checkout is unavailable, report the missing evidence rather than guessing; do not modify the backend unless requested.
- Reuse `apiClient` from `src/services/api/client.ts` for Management API requests through domain modules. It centralizes the API prefix, bearer authentication, error normalization, and response-header handling. Avoid ad hoc requests in components.
- Preserve the client's event integration: `unauthorized` handles 401s, `server-version-update` carries version/build metadata, and `server-plugin-support-update` carries plugin capability information. Keep plugin routes gated by backend support.
- Normalize backend fields on read and serialize on write in the API layer; consult `transformers.ts` and the relevant domain module. Keep raw backend field-name handling out of ordinary UI components.
- `useConfigStore.fetchConfig(forceRefresh?: boolean)` uses a full-config TTL cache and in-flight request deduplication. Reuse it where appropriate and invalidate or update caches after mutations using existing store actions.
- Preserve stale-request guards and cache cleanup when switching connections or logging out. Old asynchronous responses must not overwrite the new session's state.
- Provider UI capabilities live in `src/features/providers/descriptors.ts`; adapters map provider configs to the shared resource model. Extend these abstractions rather than scattering provider-specific conditionals across components.

## Conventions

- Use 2-space indentation, semicolons, single quotes, ES5 trailing commas, and a 100-character line width.
- Prefer typed React components and `unknown` with narrowing for untrusted data. Use `any` only at a documented unavoidable external boundary.
- Use the `@/` alias for `src` imports.
- Name component files in PascalCase, hooks with a `use` prefix, and API modules by domain.
- Keep API modules grouped by domain. Place SCSS Modules beside the component or page that owns them.
- Reuse shared components and existing theme tokens before adding new primitives or hard-coded colors. Vite injects `src/styles/variables.scss` into SCSS modules.
- Keep user-facing text in i18n and update all four locales, including accessible labels, when adding translation keys.
- Preserve keyboard interaction, accessible names, focus behavior, and reduced-motion handling when modifying interactive UI.
- Preserve unknown backend fields when reading and writing configuration.
- Do not put raw API keys, management keys, viewer credentials, or full key IDs in URLs, logs, browser storage, error reports, or console output. Keep raw API keys concealed until an administrator explicitly reveals or copies one.
- Keep the existing dashboard and navigation structure intact. Add analytics pages only under the Analytics navigation group.
- Use conventional commits and keep each commit focused.
- Update `FORK.md` whenever fork-specific behavior changes. Give each surviving divergence a stable ID.

## Testing & Verification

Tests are centralized under `tests/` as `*.test.ts` files and use `bun:test`. Existing suites cover
pure logic, React server-side static rendering via `renderToStaticMarkup`, and source/contract checks.
There is no configured browser DOM test harness; static markup tests do not verify browser interactions.
Prefer extracting testable logic and following nearby test patterns rather than introducing a new
framework by default.

For code changes, add or update relevant regression tests, run focused tests while iterating, and run
`bun run verify` before handoff. For UI changes, verify the affected route in a browser and include
screenshots or notes. Report commands actually run, failures, and anything not verified. Documentation-only
changes can be checked with diff/content validation instead of a full build.

## Security

Never commit real management keys, provider credentials, auth files, or other secrets; redact them from
logs, screenshots, and test fixtures. Management keys are entered at runtime and persisted according to
the remember-password setting. `src/services/storage/secureStorage.ts` provides reversible obfuscation,
not encryption or a security boundary. Do not weaken authentication, plugin trust checks, or session
isolation for convenience.

## Commits & Guidance Maintenance

Use Conventional Commits, such as `feat(providers): add a provider` or
`fix(auth-files): preserve disabled actions`. Keep changes focused. Pull requests should include a
summary, linked issue when applicable, backend version or reproduction details for integration work,
UI screenshots or notes when relevant, and verification results.

Maintain shared repository guidance in `AGENTS.md`. When updating it, synchronize the local `CLAUDE.md`
to identical content if present; `CLAUDE.md` is currently a small indirection to this file, so shared
guidance must not depend on duplicated content.
