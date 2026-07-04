#!/bin/bash
set -e

# Aegis Terminal — Atomic Deploy Script
# Build → Deploy → Verify → Commit
# Usage: ./scripts/deploy.sh [commit message]

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
FRONTEND_DIR="$PROJECT_DIR/frontend"
COMMIT_MSG="${1:-deploy: update frontend}"

echo "=== Aegis Terminal Deploy ==="
echo ""

# 1. BUILD
echo "[1/4] Building frontend..."
cd "$FRONTEND_DIR"
npm run build
echo "✅ Build complete"
echo ""

# 2. DEPLOY (single deployer — no duplicates)
echo "[2/4] Deploying to CF Pages..."
DEPLOY_OUTPUT=$(npx wrangler pages deploy dist --project-name=aegis-terminal --branch=main 2>&1)
echo "$DEPLOY_OUTPUT"
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -o 'https://[a-z0-9]*\.aegis-terminal\.pages\.dev' | tail -1)
echo "✅ Deployed to: $DEPLOY_URL"
echo ""

# 3. VERIFY production serves new bundle
echo "[3/4] Verifying production..."
PROD_BUNDLE=$(curl -s "https://aegisterminal.app/" | grep -o 'index-[A-Za-z0-9]*\.js' | head -1)
LOCAL_BUNDLE=$(ls dist/assets/index-*.js | head -1 | xargs basename | sed 's/\.js$//')
LOCAL_BUNDLE_NAME=$(echo "$LOCAL_BUNDLE" | sed 's/^index-//')

if [ "$PROD_BUNDLE" = "index-${LOCAL_BUNDLE_NAME}.js" ]; then
  echo "✅ Production verified: $PROD_BUNDLE"
else
  echo "⚠️  Production still serving old bundle: $PROD_BUNDLE"
  echo "   Local bundle: index-${LOCAL_BUNDLE_NAME}.js"
  echo "   Waiting 5s for propagation..."
  sleep 5
  PROD_BUNDLE=$(curl -s "https://aegisterminal.app/" | grep -o 'index-[A-Za-z0-9]*\.js' | head -1)
  if [ "$PROD_BUNDLE" = "index-${LOCAL_BUNDLE_NAME}.js" ]; then
    echo "✅ Verified after wait: $PROD_BUNDLE"
  else
    echo "❌ MISMATCH — manual check needed"
    echo "   Production: $PROD_BUNDLE"
    echo "   Expected:   index-${LOCAL_BUNDLE_NAME}.js"
  fi
fi
echo ""

# 4. GIT COMMIT (after deploy, not before)
echo "[4/4] Git commit + push..."
cd "$PROJECT_DIR"
git add -A
if git diff --cached --quiet; then
  echo "No changes to commit"
else
  git commit -m "$COMMIT_MSG"
  git push origin main
  echo "✅ Committed and pushed"
fi
echo ""

echo "=== Deploy Complete ==="
echo "Production: https://aegisterminal.app"
echo "Bundle:     $PROD_BUNDLE"
