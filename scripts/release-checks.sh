#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -d node_modules/jsdom ]; then
  cat >&2 <<'EOF'
node_modules is missing.

Run:
  ./scripts/docker-release-checks.sh --install

Then run:
  ./scripts/docker-release-checks.sh
EOF
  exit 1
fi

main_test_files="$(find hex/test/class-a hex/test/class-b -type f -name '*.test.js' | sort)"
node --test $main_test_files

rm -rf .tmp/flow-traces
mkdir -p .tmp/flow-traces
flow_witness_files="$(find hex/test -type f -name '*.flow-witness.test.js' | sort)"
FLOW_TRACE_DIR=.tmp/flow-traces node --test $flow_witness_files
FLOW_TRACE_DIR=.tmp/flow-traces node --test hex/test/flow/trace-artifacts.test.js

node ./scripts/build-chrome.mjs

version="$(node -p "JSON.parse(require('fs').readFileSync('manifest.chrome.json', 'utf8')).version")"
rm -rf release
mkdir -p release
(cd dist && zip -qr "../release/id-overlay-chrome-${version}.zip" .)

ls -lh "release/id-overlay-chrome-${version}.zip"
