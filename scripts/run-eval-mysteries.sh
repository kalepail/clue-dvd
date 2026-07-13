#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/clue-v3-eval.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

mkdir -p "$TMP_ROOT/src" "$TMP_ROOT/scripts"
cp -R "$ROOT/src/services" "$ROOT/src/data" "$ROOT/src/types" "$TMP_ROOT/src/"
cp "$ROOT/scripts/eval-mysteries.ts" "$TMP_ROOT/scripts/"
cp "$ROOT/package.json" "$TMP_ROOT/"
ln -s "$ROOT/node_modules" "$TMP_ROOT/node_modules"

# Node's type-stripper deliberately does not resolve extensionless TypeScript
# imports. The production source stays bundler-friendly; this throwaway copy
# gains explicit .ts extensions and is deleted when the harness exits.
find "$TMP_ROOT/src" "$TMP_ROOT/scripts" -name '*.ts' -exec sed -E -i '' \
  's#(from[[:space:]]+"(\.\.?/)[^"]+)(")#\1.ts\3#g' {} +

CLUE_DVD_VARS_PATH="$ROOT/.dev.vars" \
CLUE_DVD_EVAL_OUTPUT="$ROOT/tmp/ai-evals" \
  node --experimental-transform-types "$TMP_ROOT/scripts/eval-mysteries.ts" "$@"
