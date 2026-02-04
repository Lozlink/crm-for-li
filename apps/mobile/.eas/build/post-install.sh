#!/usr/bin/env bash
set -euo pipefail

echo "🔧 Installing pnpm..."
npm install -g pnpm@10.27.0

echo "📦 Installing workspace dependencies with pnpm..."
cd ../..
pnpm install --frozen-lockfile

echo "✅ Workspace dependencies installed successfully!"
