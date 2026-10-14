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
