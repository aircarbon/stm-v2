# Dependency license inventory

Generated from the checked-in Yarn lockfiles on 2026-08-14 with:

```sh
yarn licenses list --json
(cd sol && yarn licenses list --json)
```

This is a metadata review aid, not legal advice or a substitute for bundled
license texts. Counts include multiple installed versions of a package.

| License metadata | Root/ORM | Solidity |
| --- | ---: | ---: |
| MIT | 540 | 1,295 |
| ISC | 52 | 148 |
| Apache-2.0 | 25 | 69 |
| LGPL-3.0 | 16 | 60 |
| BSD-3-Clause | 15 | 39 |
| BSD-2-Clause | 16 | 21 |
| MPL-2.0 | 5 | 20 |
| GPL-3.0-only | 0 | 2 |
| UNKNOWN | 0 | 3 |
| Other permissive/dual/public-domain metadata | 17 | 39 |
| **Total package/version entries** | **686** | **1,696** |

The “other” row combines 0BSD, BSD, CC0, Creative Commons attribution,
ODC-By, Python-2.0, Unlicense, Public Domain, WTFPL, and dual/multi-license
expressions. Review the raw command output when producing final notices.

## Manual-review items

- `bs58@2.0.1`, `coinstring@2.3.0`, and `heap@0.2.6` report
  `UNKNOWN` in the Solidity dependency graph.
- `json-schema@0.2.3` reports `BSD*`.
- `uuid@2.0.1`, `precond@0.2.3`, and `semaphore@1.1.0` report
  `MIT*`.
- LGPL-3.0, GPL-3.0-only, MPL-2.0, CC-BY, and ODC-By entries need
  distribution-model and notice review.
- The dependency graph is old and contains deprecated packages. Regenerate this
  inventory and perform legal/security review after any dependency upgrade.

Vendored source notices and asset findings are recorded in
`THIRD_PARTY_NOTICES.md` and `TRANSFER_REVIEW.md`.
