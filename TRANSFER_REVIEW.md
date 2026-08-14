# B3 transfer review

Status: **review candidate only**. This branch preserves the original Git history for pull-request review. Do not transfer, mirror, publish, or give B3 access to the repository in its current historical form.

## Scope and decisions

### Removed from the current tree

- Client security-audit PDF, migration screenshots, deployment snapshots, and partner integration documents.
- Generated Solidity description reports, inheritance graphs, and Solidity-docgen output.
- Client-specific operational migration guide and API integration helper.
- Ad-hoc Docker debugging setup, private-key display script, ledger lookup script with deployed addresses, disabled Web3 integration suite, obsolete `*Old` source/helpers, and stale workspace/submodule-era references.
- Hardcoded non-local RPC endpoints, Infura project identifiers, deployed contract addresses, private-chain aliases, environment names, and internal Slack references.

### Retained or converted

- Copyright, author attribution, and SPDX notices were retained. They are legal notices, not removable branding.
- Configuration keys remain in `.env.example` files. Remote URLs, mnemonics, and commit-specific values are blank; localhost SQL/Ganache values and deterministic test fixtures remain.
- Remote Truffle access now uses `RPC_URL`, `NETWORK_ID`, and `MNEMONIC`. Package authentication uses ignored `.npmrc` files with `NPM_TOKEN` or `GITHUB_PACKAGES_TOKEN` through `.npmrc.example`.
- Deterministic Ganache private keys remain only in disabled localhost tests and are marked as scanner-approved synthetic fixtures.
- Public zero/test addresses and public Chainlink feed addresses remain because they are neither credentials nor client data.

## Findings

### Current tracked tree

The pre-cleanup tree contained:

- A non-local SQL hostname, username, and plaintext password in both environment examples.
- A live-looking indexer API key, partner API keys, internal API/RPC hostnames, and Infura project identifiers.
- Production/UAT/development network aliases, private-chain identifiers, deployed addresses, operational instructions, partner names, and internal infrastructure references.
- An external audit report and screenshots with no repository-level redistribution grant.
- Generated documentation containing developer workstation paths.

No hardcoded npm token, GitHub personal-access token, GitHub Packages token, authenticated Git URL, or committed `.npmrc` was found in the current tree or by the targeted history search. Environment-based npm/GitHub Packages authentication was added proactively so future credentials are not committed.

After cleanup, the current-tree Gitleaks scan reports no findings.

### Git history

Gitleaks scanned 998 commits and reported 41 findings: one authorization-header credential and 40 generic-key matches. Confirmed or plausible sensitive history includes the SQL password, partner/indexer API keys, account keys/private keys, and credential-like values in removed files. Some generic-key matches are contract addresses or deterministic test values, but they still require case-by-case review before a history-preserving transfer.

Commit metadata contains contributor names and email addresses. Historical blobs also contain removed client documentation, infrastructure details, proprietary assets, generated outputs, and old deployment material. Deleting them from the current tree does not remove them from Git object history.

All credentials and project identifiers exposed in any commit must be treated as compromised and rotated/revoked before transfer, even if the future history is rewritten.

## Licensing and redistribution review

- Most source SPDX headers declare AGPL-3.0-only, and package metadata now matches those headers. A historical README sentence instead granted AGPL version 3 “or later”; counsel or the rights holder must resolve that version-scope inconsistency before transfer. B3 must receive the governing license text, copyright notices, corresponding source, and any other obligations applicable to its distribution and network use.
- MIT-marked EIP-2535 diamond reference files retain Nick Mudge attribution.
- `Strings.sol` retains the Apache-2.0 notice and Nick Johnson attribution; the duplicate invalid SPDX marker was removed.
- `LICENSES.md` inventories both Yarn dependency graphs. Most entries are permissive, but the Solidity graph also contains LGPL-3.0, GPL-3.0-only, MPL-2.0, Creative Commons, and three packages whose metadata reports `UNKNOWN` (`bs58@2.0.1`, `coinstring@2.3.0`, and `heap@0.2.6`). Ambiguous `BSD*`/`MIT*` metadata also appears. Confirm the applicable license texts, dependency use, and distribution obligations before transfer.
- No images, fonts, or audit reports remain in the current tree.

Unresolved legal concern: the repository alone does not prove that the transferring party owns every contribution or has authority to sublicense/assign the AirCarbon copyright, brand, audit report, or historical third-party contributions. Obtain written approval from the relevant rights holder and legal review of AGPL obligations before transfer. Do not remove existing copyright notices as a debranding shortcut.

## Validation

Validation was run with Node 16.20.0 and Yarn 1.22.22:

- Dependency installation: root and `sol` frozen-lockfile installs passed. Yarn reported peer/deprecation warnings; the optional `node-hid` native build did not support this ARM64 environment but did not fail installation.
- JavaScript/TypeScript lint: `yarn eslint --ext .js,.ts .` passed after restoring the repository's missing Airbnb ESLint config dependencies.
- TypeScript type-check/build: `yarn workspace @stm/orm build` passed.
- Solidity compile/build: `yarn truffle compile --all` passed with compiler warnings for inherited unreachable code and unused parameters.
- Solidity lint: passed with 0 errors and 340 inherited warnings. The vendored `Strings.sol` compiler-range rule is locally suppressed because its upstream-compatible pragma intentionally predates Solidity 0.8.
- ORM tests: blocked. The declared test script invokes an undeclared Jest runner, and the ORM workspace contains no matching test files. Adding a current resolver expansion to the legacy Node 16 graph was rejected rather than introducing 193 unrelated packages solely to report that no tests exist.
- Solidity tests: Truffle compiled successfully, then migrations stopped before assertions because the required local SQL Server was unavailable at `localhost:1433`. The test architecture requires both Ganache and the deployment metadata database.
- Package inspection: `npm pack --dry-run --json` passed for all three packages. Root: 184 files / approximately 3.1 MB; ORM: 15 files / approximately 26 KB; Solidity: 151 files / approximately 2.4 MB. Only sanitized `.env.example` templates matched the artifact/sensitive-name review; no local `.env`, build, coverage, binary asset, or package archive was included.
- Dependency license inventory: regenerated in `LICENSES.md` from both checked-in Yarn lockfiles; the non-permissive, ambiguous, and unknown metadata above remains a legal-review item.
- Current-tree Gitleaks: passed with no findings after scanning approximately 30 MB.
- Full-history Gitleaks: expected failure, with 41 findings across 998 commits. This confirms that a history-preserving transfer is unsafe.
- Repository hygiene: `git diff --check`, JSON parsing, changed-JavaScript syntax checks, tracked artifact scan, and gitlink/submodule-remnant checks passed. No tracked generated/binary artifacts, current gitlinks, or `.gitmodules` history remain.

## Future root-commit procedure (recommended)

Perform this only after this pull request is approved, credentials are rotated, legal/asset clearance is complete, and the exact transfer allowlist is signed off.

1. Record the approved cleanup commit SHA and tag/archive the original private repository for internal audit access only.
2. Export only the approved tree with `git archive <approved-sha>` into a new empty directory. Do not copy `.git`, reflogs, ignored files, local environment files, build outputs, or scanner reports containing secrets.
3. Initialize a new repository in that directory, add the approved files, and create one signed root commit such as `Import sanitized STM source for B3 review`.
4. Run the complete validation suite and Gitleaks in `dir` and `git` modes against the new repository. Confirm there is exactly one root commit and inspect `git rev-list --objects --all` for unexpected paths.
5. Have a second reviewer compare `git diff --no-index` between the approved exported tree and the new root tree.
6. Create a new private destination repository with no inherited forks, Actions secrets, deploy keys, webhooks, environments, packages, branch protections, teams, issues, releases, wiki, or cached artifacts. Configure access explicitly for the approved B3 users.
7. Push the new root only after written transfer approval. Do not force-push or replace the current repository.

## Alternative history-cleanup procedure

Use this only if legal/review requirements demand retaining selected history. Work in a fresh mirror clone, build explicit path-removal and replacement lists, and run `git filter-repo` there. Remove sensitive paths across all refs, replace every confirmed secret/infrastructure value, prune empty commits if approved, and delete unintended tags/refs. Then expire reflogs and garbage-collect the mirror, rerun full-history Gitleaks and object/path inspection, and have an independent reviewer verify the rewritten graph.

Push rewritten history only to a new private destination. Never force-push the source repository as part of this cleanup PR. History rewriting does not replace credential rotation or legal clearance.

## Release blockers

- Rotate/revoke every historical credential and provider project identifier.
- Obtain rights-holder approval for source transfer and confirm AGPL/third-party obligations.
- Confirm whether the intended project grant is AGPL-3.0-only or AGPL-3.0-or-later.
- Decide between the recommended single root commit and an explicitly reviewed filtered-history transfer.
- Complete a second-person review of the final tree and destination-repository settings.
- Do not publish or transfer from this cleanup branch.
