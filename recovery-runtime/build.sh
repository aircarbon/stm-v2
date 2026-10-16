#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
context=$(mktemp -d)
trap 'rm -rf "$context"' EXIT HUP INT TERM
commit=42830d6c3dae5649e48405c901bbcc2e57125757
# Docker sees only this archive and this recipe, never the live checkout.
git -C "$root" archive --format=tar "$commit" > "$context/source.tar"
cp "$root/recovery-runtime/Dockerfile" "$context/Dockerfile"
docker build --platform linux/arm64 --progress=plain "$@" "$context"
