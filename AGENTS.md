# AGENTS.md

React 19 and TypeScript 6 web management client for CLIProxyAPI. Vite builds the application as one `dist/index.html` file.

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

Published fork commits are merged forward. Do not rebase or force-push `main` during a routine upstream sync. Add every sync and surviving fork change to `FORK.md`.

## Syncing this fork with upstream repository

If you are tasked with syncing this fork with the upstream repository, please do it with the following considerations:
- Keep features from both sides
- If both fixes the same issue, prefer fixes from theirs.
- If some feature conflicts in a way that it is best to choose either theirs or ours, pause and ask me.
- If you are unsure about how to proceed, please ask me for guidance.
- This is not a "fix merge conflicts" task, you have to make sure that all features are behaving as expected and that those features make sense together both functionally, aesthetically and user experience. An app that works isn't necessarily a good app.
- After all the code related changes are done (merged, fixed, verified, finalized/cleanup), do the following:
  - Update "Divergence Log" and "Merge History" sections in FORK.md with the latest changes.
  - Commit merge changes in a single commit with a clear message describing the merge decisions made.
  - Move the "base" tag to the commit you just created. Force pushing this tag is fine since its only used for reference. (if `gdx` are available, you can use `gdx tag mv base ~0` to move "base" to the latest commit)

## Commands

Use the Bun version declared by `packageManager` in `package.json`, currently Bun 1.3.14.

```bash
bun install --frozen-lockfile
bun run dev
bun run test
bun run lint
bun run type-check
bun run build
bun run verify
```

`bun run verify` runs tests, lint, TypeScript compilation, and the production build. Run it before handoff. For UI changes, also verify the affected desktop and mobile routes through the shared CDP browser and record the result in `FORK.md`.

## Architecture

- `src/router/` defines application routes.
- `src/pages/` contains route-level pages.
- `src/features/` groups domain UI and state, including config, dashboard, providers, auth files, plugins, and quotas.
- `src/components/` contains shared layout and UI components.
- `src/services/api/` owns Management API clients and response normalization.
- `src/stores/` contains Zustand stores.
- `src/hooks/` contains shared React hooks.
- `src/types/` contains TypeScript contracts.
- `src/i18n/locales/` contains the four supported locales: English, Simplified Chinese, Traditional Chinese, and Russian.
- `src/styles/` contains shared styles. Component-specific SCSS Modules stay beside their component.
- `tests/` contains Bun tests.
- `dist/index.html` is the single-file production artifact.

CPAMC talks to CPA through versioned HTTP contracts. Treat the CPA Management API as the source of truth. CPAMC must not inspect CPA's SQLite files or infer backend configuration structs.

## Conventions

- Use 2-space indentation, semicolons, single quotes, ES5 trailing commas, and a 100-character line width.
- Prefer typed React components. Use `any` only at a documented external boundary.
- Use the `@/` alias for `src` imports.
- Name component files in PascalCase and hooks with a `use` prefix.
- Keep API modules grouped by domain. Place SCSS Modules beside the component or page that owns them.
- Update every supported locale when adding user-visible text.
- Preserve unknown backend fields when reading and writing configuration.
- Do not put raw API keys, management keys, viewer credentials, or full key IDs in URLs, logs, browser storage, error reports, or console output.
- Keep raw API keys concealed until the administrator explicitly reveals or copies one.
- Keep the existing dashboard and navigation structure intact. Add analytics pages only under the Analytics navigation group.
- Use conventional commits and keep each commit focused.
- Update `FORK.md` whenever fork-specific behavior changes. Give each surviving divergence a stable ID.
