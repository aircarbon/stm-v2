FROM node:16.20.0-bullseye@sha256:46a861b32fa3ea5777f3b8f72b9f3c91de33ebc263b69e72655f1c836937d9f4 AS source
LABEL org.opencontainers.image.revision="42830d6c3dae5649e48405c901bbcc2e57125757"
WORKDIR /recovery
ADD source.tar /recovery/
ENV HUSKY=0 PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
RUN test "$(node --version)" = v16.20.0 && test "$(yarn --version)" = 1.22.19

FROM source AS installed
# No lock repair, ignored engines, or skipped lifecycle scripts.
RUN sha256sum yarn.lock sol/yarn.lock > /tmp/locks.sha256 \
    && yarn install --frozen-lockfile --non-interactive \
    && cd sol && yarn install --frozen-lockfile --non-interactive \
    && cd /recovery && sha256sum -c /tmp/locks.sha256
WORKDIR /recovery/sol
CMD ["./node_modules/.bin/truffle", "version"]

FROM installed AS compiled
# Compile only: synthetic placeholders prevent loading local wallet files.
# Truffle downloads the configured 0.8.5 compiler; no provider is invoked.
RUN DEV_MNEMONIC=synthetic-dev PROD_MNEMONIC=synthetic-prod \
    ./node_modules/.bin/truffle compile --all \
    && echo '4af595f976235d33a22ffe223e9e3210b4ca510f6a93f153b3daed60f2b11fbc  /root/.config/truffle-nodejs/compilers/node_modules/solc-emscripten-wasm32-v0.8.5+commit.a4f2e591.js' | sha256sum -c -
