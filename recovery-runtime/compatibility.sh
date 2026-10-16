#!/bin/sh
# Explicit integration test. No host credentials, ports, or dependency installs.
set -eu
cd "$(dirname "$0")/.."
image=${COMPATIBILITY_IMAGE:-stm-v2-frozen-compiled:42830d6}
docker image inspect "$image" >/dev/null
id="stm-compat-$$"
tmp=$(mktemp -d)
cleanup() {
  docker rm -f "$id-run" "$id-db" >/dev/null 2>&1 || true
  docker network rm "$id" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT HUP INT TERM
docker network create --internal "$id" >/dev/null
docker run -d --name "$id-db" --network "$id" --network-alias database \
  -e POSTGRES_PASSWORD=synthetic-only -e POSTGRES_USER=compat \
  -e POSTGRES_DB=compat --tmpfs /var/lib/postgresql/data postgres:16-alpine >/dev/null
attempt=0
until docker exec "$id-db" pg_isready -U compat -d compat >/dev/null 2>&1; do
  attempt=$((attempt + 1)); test "$attempt" -lt 60; sleep 1
done
docker create --name "$id-run" --network "$id" --cap-drop ALL \
  --security-opt no-new-privileges --workdir /recovery/orm \
  -e db_type=postgres -e sql_ssl=false -e sql_user=compat \
  -e sql_password=synthetic-only -e sql_server=database -e sql_port=5432 \
  -e sql_database=compat "$image" sh -c \
  'test -f build/index.js || yarn prepare; node /recovery/compatibility.cjs' >/dev/null
docker cp recovery-runtime/compatibility.cjs "$id-run:/recovery/compatibility.cjs"
# Hardhat discovers its config from the working directory. Only its synthetic EDR is used.
(cd hardhat && node ../recovery-runtime/compatibility-vectors.mjs "$tmp/vectors.json")
docker cp "$tmp/vectors.json" "$id-run:/recovery/vectors.json"
docker start -a "$id-run"
test "$(docker inspect "$id-run" --format '{{.State.ExitCode}}')" = 0
