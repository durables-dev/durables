#!/usr/bin/env bash
# Runs once when the dev container is created. Leaves it ready for `npm run dev:api`,
# `npm run dev:web` and `npm run e2e`.
set -euo pipefail

# Docker creates volumes owned by root; hand them to the container user.
sudo chown node:node node_modules api/node_modules web/node_modules \
    infrastructure/node_modules e2e/node_modules api/.wrangler

# `npm install`, not `npm ci`: ci deletes node_modules itself, which fails on a volume mount point.
npm install

# The Chromium build matching the installed @playwright/test, plus its system libraries.
npm exec --workspace e2e -- playwright install --with-deps chromium

# Cloudflare provider bindings for infrastructure/ (generated, not committed).
npm run get --workspace infrastructure

# The API's type declarations, which web's typed client reads (docs/adr/0010).
npm run build:types --workspace api
