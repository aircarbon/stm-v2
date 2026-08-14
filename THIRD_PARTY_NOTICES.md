# Third-party notices

This repository is primarily licensed under AGPL-3.0-only. Individual source files with their own SPDX identifier remain governed by that identifier and retain their original attribution.

Historical top-level documentation used “version 3 or later” wording while most source headers say AGPL-3.0-only. The transfer requires a rights-holder determination of the intended version scope; this review candidate follows the predominant source SPDX metadata without purporting to resolve that legal inconsistency.

## Vendored Solidity source

- EIP-2535 diamond reference components by Nick Mudge are marked MIT in the relevant files.
- `sol/contracts/libraries/Strings.sol` is derived from Nick Johnson's `solidity-stringutils` and is marked Apache-2.0 with the upstream copyright and license notice preserved.

## Package dependencies

`LICENSES.md` records the dependency-license inventory generated from the checked-in Yarn lockfiles. It is supporting inventory, not a substitute for the dependency license texts or legal review. Regenerate and review it whenever dependencies or lockfiles change.

The inventory includes copyleft and attribution-bearing dependencies as well as ambiguous or unknown package metadata. In particular, manually resolve the `UNKNOWN` metadata for `bs58@2.0.1`, `coinstring@2.3.0`, and `heap@0.2.6`, and review LGPL-3.0/GPL-3.0/MPL-2.0/Creative Commons obligations against the intended distribution model.

No image, font, audit-report, or branding asset is included in the transfer candidate. The original Git history still contains removed assets and must not be transferred until the history procedure in `TRANSFER_REVIEW.md` is completed.
