# Changelog

All notable changes of `multi-tour-cash-reporting-portal` (Cash and Reporting portal) are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [3.0.0] - 2026-11-14

Cut 3 release. Every entry below is a pull request merged into `qa` and re-applied to `release/3.0.0` with `git cherry-pick -x`; the heading of each group is the user story named in the pull request, and the entry is the title of the pull request without its type. The frozen head of `qa` is `c8820d5e69cac92a9371b034172fc0fadeac4b76`.

### Added

#### HU-CSH-003 - Consult the monthly report and the cash consolidation

- Sin dato for null confirmed sales ([PR 52](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/52))

### Changed

#### HU-CSH-001 - Operate the daily cash

- The fourth batch of the daily cash ([PR 31](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/31))
- The correction after a closing ([PR 32](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/32))
- The http adapters of the daily cash ([PR 33](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/33))
- The closing and reopening http adapters ([PR 34](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/34))
- The parametrized base before the opening ([PR 38](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/38))
- The correction adapter ([PR 40](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/40))
- The template, the console cleanup and the demo name ([PR 44](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/44))

#### HU-CSH-002 - Consult the daily dashboard

- The HTTP adapter of the daily dashboard ([PR 46](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/46))

#### HU-CSH-003 - Consult the monthly report and the cash consolidation

- The monthly report adapters and the consolidation lines ([PR 50](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/50))

#### Cross-cutting: CI, test fixes and alignment promotions (no single story is named in the PR title, branch or body)

- The second batch of domain 04 ([PR 19](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/19))
- The checks on pull requests to main ([PR 54](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/54))
- Run the test workflow only on pull requests to develop and qa ([PR 56](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/56))

### Security

#### HU-CSH-001 - Operate the daily cash

- The cash permission fix ([PR 36](https://github.com/code-corhuila/multi-tour-cash-reporting-portal/pull/36))

[Unreleased]: https://github.com/code-corhuila/multi-tour-cash-reporting-portal/compare/v3.0.0...HEAD
[3.0.0]: https://github.com/code-corhuila/multi-tour-cash-reporting-portal/releases/tag/v3.0.0
