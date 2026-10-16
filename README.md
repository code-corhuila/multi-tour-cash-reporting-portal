# multi-tour-cash-reporting-portal

> cash-reporting bounded context: web UI (remote)

Part of the **Multi Tour** distributed system — team `multi-tour`, Grupo 2.
Governance and documentation live in [`multi-tour-docs`](https://github.com/code-corhuila/multi-tour-docs).

## What it is

The Angular 21 Micro Frontend of macrodomain 4: the daily cash (screen 14) with its history and monthly
consolidation, and the reports dashboard (screen 16). Specs: `07-api/specs/cash-reporting/` in
`multi-tour-docs` (story `#195`). The `multi-tour-front` container imports `cash-reporting-portal.js` and
calls `mount(element, props)` (ADR-007), which paints under `.csh-root`, links `cash-reporting-portal.css`
next to the module and returns the cleanup. It is not a client of its own: no HTTP client, session or token
(norm 5.4.1); every request goes through `props.apiClient`, and the container owns the URL.

## How to start

Node 22 LTS: `npm ci`, then `npm run build:module` (production) or `npm run build:module:demo` (in-memory
demo sources). Copy `dist/portal.js` and `dist/portal.css` to `portals/cash-reporting-portal.{js,css}` in
`multi-tour-front` and follow its README. `deploy/` builds the image (demo by default,
`--build-arg PORTAL_BUILD=module` for production); `deploy/compose.yml` publishes no port.

## Where its data is

Nowhere: it stores nothing and reads no variable. The API and database are deferred (micro plan
D-CSH-01): the production module registers no source and offers no area; demo data lives only in the demo build.

## How to test

`npm test` (Vitest). `ci.yml` runs on pull requests to `develop` and `qa`: tests, both module builds, a check
that the production module carries no client, storage or address, and the module size.

## Performance budgets

Pillar 13 (measured 2026-10-15 on `origin/develop`, no new dependency). `angular.json` fails the build when a bundle grows past its limit:

| Artifact | Measured (raw) | Warning | Error |
|---|---|---|---|
| Application build, initial (polyfills + main) | 40,55 kB (13,93 kB transferred) | 70 kB | 100 kB |
| Application build, lazy `bootstrap` chunk | 76,31 kB (15,16 kB transferred) | none | none |
| Application build, whole `dist/cash-reporting-portal` | 1.482.369 B | none | none |
| Mounted module `main.js`, production (`build:module`) | 187,86 kB (53,35 kB transferred) | 230 kB | 280 kB |
| Mounted module `main.js`, demo (`build:module:demo`) | 201,97 kB (56,37 kB transferred) | 230 kB | 280 kB |

Any change that moves one of these figures records the new measure here.

## CSP impact

Pillar 9: the portal loads no image or file of its own. The only resource that needs the container policy is the export of screen 16 (CSV and PDF), which is saved through a temporary link to a Blob: the container must allow `blob:` for downloads under `default-src 'self'`. Nothing uses `data:` (checked with a search over `src/`), and no network is involved (RN-CJ9).

## What is missing

Pull request 1 of `HU-CSH-001` is the skeleton only. Open (`tasks.md`): T-02 shared base, T-03 to T-08 the
cash screens and roles, T-09 end to end, which needs the manifest entry `cash-reporting-portal` (`HU-FRT-001`).

## Branching

Three permanent branches. **None of them accepts a direct commit** — you enter through a child
branch and leave through a Pull Request.

```
develop  <--PR--  feat/... fix/... chore/...
qa       <--PR--  qa/...
main     <--PR--  release/...  hotfix/...
```

Promotion happens **by re-application** (`git cherry-pick -x`), never by merging one permanent
branch into another: `merge develop -> qa` and `merge qa -> main` do not exist in this model.

`main` requires **1 approval from `ariel5253`**. On `develop` and `qa` the team sets its own review
rule.

Full policy: `00-governance/branching-policy.md` in `multi-tour-docs`.
