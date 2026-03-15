#!/bin/bash
# Manuscript App — Supabase Setup Script
# Run after: npx supabase login
# Usage: bash scripts/setup-supabase.sh

set -e

PROJECT_NAME="manuscript"
REGION="us-east-1"
DB_PASS=$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)

echo "Creating Supabase project: $PROJECT_NAME"
echo "Region: $REGION"
echo "DB Password: $DB_PASS (save this!)"
echo ""

# Create project
PROJECT_JSON=$(npx supabase projects create "$PROJECT_NAME" \
  --region "$REGION" \
  --db-password "$DB_PASS" \
  --output json 2>/dev/null)

PROJECT_ID=$(echo "$PROJECT_JSON" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$PROJECT_ID" ]; then
  echo "ERROR: Failed to create project. Are you logged in? Run: npx supabase login"
  exit 1
fi

echo "Project created: $PROJECT_ID"
echo "Waiting for project to be ready..."
sleep 30

# Get API keys
API_KEYS=$(npx supabase projects api-keys --project-ref "$PROJECT_ID" --output json 2>/dev/null)
ANON_KEY=$(echo "$API_KEYS" | grep -A1 '"name":"anon"' | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
SERVICE_KEY=$(echo "$API_KEYS" | grep -A1 '"name":"service_role"' | grep -o '"api_key":"[^"]*"' | cut -d'"' -f4)
SUPABASE_URL="https://${PROJECT_ID}.supabase.co"

echo ""
echo "Project URL: $SUPABASE_URL"
echo "Anon Key: ${ANON_KEY:0:20}..."
echo "Service Key: ${SERVICE_KEY:0:20}..."

# Link project
echo ""
echo "Linking project..."
cd "$(dirname "$0")/.."
npx supabase link --project-ref "$PROJECT_ID" --password "$DB_PASS" 2>/dev/null || true

# Run migration
echo "Running database migration..."
npx supabase db push --password "$DB_PASS" 2>/dev/null

# Update .env.local
echo ""
echo "Updating .env.local..."
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=$ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
ANTHROPIC_API_KEY=your_anthropic_key
DEEPGRAM_API_KEY=your_deepgram_key
EOF

echo ""
echo "=== SETUP COMPLETE ==="
echo ""
echo "Still need manually:"
echo "1. Create 'audio' storage bucket in Supabase Dashboard > Storage"
echo "2. Add your ANTHROPIC_API_KEY to .env.local"
echo "3. Add your DEEPGRAM_API_KEY to .env.local"
echo ""
echo "DB Password (save it): $DB_PASS"
echo "Project ref: $PROJECT_ID"
