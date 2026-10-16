#!/bin/sh
set -eu
image=${1:-stm-v2-frozen-compiled:42830d6}
# No mounts, credentials, or external network. All writes die with the container.
docker run --rm --network none --cap-drop ALL --security-opt no-new-privileges \
  -e DEV_MNEMONIC=synthetic-dev -e PROD_MNEMONIC=synthetic-prod \
  "$image" sh -ec '
    node --version
    ./node_modules/.bin/truffle version
    node --test contract_upgrade/test/*.test.js
    ./node_modules/.bin/truffle compile --all
    cd /recovery && sha256sum -c /tmp/locks.sha256
  '
