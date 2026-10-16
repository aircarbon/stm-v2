# Owner-only sealing: separate security layer

The frozen `StMasterFacet.sealContract()` lets any caller permanently disable
whitelist additions. The security layer adds the existing
`ValidationLib.validateOnlyOwner()` check before that state write. Any of the
ten configured owners can seal, including a non-deployer owner. Unauthorized
calls revert with `Restricted`. Repeated owner calls retain the existing
idempotent behavior. The change does not add an unseal operation or impose a
new read-only-state policy.

## Compatibility and upgrade impact

- Solidity remains 0.8.5, optimizer one run, Byzantium. No storage declaration,
  struct, ABI entry, selector, initializer or data migration changes.
- The facet bytecode changes and gains a ValidationLib link reference. Hardhat
  reads this reference automatically. Both Truffle deployment paths now link the
  library before deploying StMasterFacet. The upgrade script's existing selected
  facets/selectors are unchanged; this patch does not automatically schedule an
  upgrade.
- Existing deployments remain vulnerable until their `sealContract()` selector
  is replaced by separately approved, correctly linked bytecode. Rebuilding or
  merging this PR does not change a deployed contract.
- An authorized diamond owner must approve an exact upgrade transaction, target,
  current selector routing, owner list, ValidationLib address/code and gas plan.
  Replace the seal selector without invoking `init`; initializing again could
  overwrite configuration. No UAT transaction is authorized or sent here.
- Before any rollout, check that operational sealing callers are configured
  owners. Former non-owner automation will now revert. An already sealed
  deployment stays sealed; this patch cannot undo premature sealing.
- Tooling rollback must not reinstall the vulnerable seal implementation.
  The frozen recovery image deliberately retains its original source and must
  not be used as a security-patched deployment image.

## Verification

The real-EVM regression first fails against unchanged code with `Missing expected
rejection`. It then checks outsider rejection without a seal-state change,
replacement routing, sealing by owner index 9, repeated owner calls, whitelist
order, owners and name. The full deployment, lifecycle and recovery suites run
with the patched facet. This is not a deployed UAT upgrade rehearsal.

The Truffle script edits pass JavaScript syntax checks. Biome was also run on
those files; their existing legacy lint/format findings are not reformatted as
part of this security change. The scripts are not executed against operational
chain or database state.

The migration layers below this security layer retain the frozen Solidity source.
The baseline source-diff command is therefore expected to report these deliberate
security changes at the top of the stack. Recover the old tooling from its pinned
archive, not by resetting this working tree.
