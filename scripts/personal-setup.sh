#!/bin/bash

###############################################################################
# Personal Use Setup Script
# Automated setup for single-user deployment with maximum security
###############################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PRESET="${1:-highSecurity}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

###############################################################################
# Helper Functions
###############################################################################

print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

generate_secret() {
    node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
}

###############################################################################
# Main Setup
###############################################################################

print_header "YouTube & Twitch Comment Manager - Personal Use Setup"

echo "This script will set up the application for personal use with maximum security."
echo "Selected preset: ${PRESET}"
echo ""

# Check prerequisites
print_header "Checking Prerequisites"

if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi
print_success "Node.js found: $(node --version)"

if ! command -v npm &> /dev/null; then
    print_error "npm is not installed."
    exit 1
fi
print_success "npm found: $(npm --version)"

# Create directories
print_header "Creating Directories"

mkdir -p "$PROJECT_ROOT/backend/data"
mkdir -p "$PROJECT_ROOT/backend/data/cache"
mkdir -p "$PROJECT_ROOT/backend/data/archive"
mkdir -p "$PROJECT_ROOT/backend/data/temp"
mkdir -p "$PROJECT_ROOT/backend/backups"
mkdir -p "$PROJECT_ROOT/backend/logs"

print_success "Directories created"

# Generate secrets
print_header "Generating Secure Keys"

JWT_SECRET=$(generate_secret)
SESSION_SECRET=$(generate_secret)
ENCRYPTION_KEY=$(generate_secret)

print_success "Generated JWT_SECRET"
print_success "Generated SESSION_SECRET"
print_success "Generated ENCRYPTION_KEY"

# Create backend .env file
print_header "Creating Backend Configuration"

cat > "$PROJECT_ROOT/backend/.env" << EOF
# ===================================================================
# Personal Use Configuration - Auto-generated
# Generated on: $(date)
# Preset: ${PRESET}
#
# ここに書かれているキーは、すべて backend/src が実際に読むものだけです。
# 以前は ENABLE_2FA / CSRF_ENABLED / GDPR_ENABLED など19個の
# 「どこからも読まれない設定」が並んでいましたが、削除しました。
# ===================================================================

NODE_ENV=production
PORT=3000

# 秘密鍵（絶対に共有しないこと）
JWT_SECRET=${JWT_SECRET}
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# セッション（個人利用なのでメモリストア。Redisを使う場合は
# SESSION_STORE=redis と SESSION_REDIS_URL を設定）
SESSION_STORE=memory

# データベース: 未指定なら backend/data/comments.db が使われます
# DATABASE_PATH=./data/comments.db

# CORS / フロントエンドの配信元
FRONTEND_ALLOWED_ORIGINS=http://localhost:5173

# 自動バックアップ（バックエンドのプロセス内でスケジュール実行されます）
AUTO_BACKUP=true
BACKUP_SCHEDULE=0 2 * * *
ENCRYPT_BACKUPS=true
MAX_BACKUPS=30

# レート制限
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# APIキー（自分のものを設定してください。未設定でもアプリは起動し、
# 該当機能だけが無効になります）
OPENAI_API_KEY=
YOUTUBE_API_KEY=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

LOG_LEVEL=info
EOF

print_success "Backend .env created"

# Create frontend .env file
print_header "Creating Frontend Configuration"

cat > "$PROJECT_ROOT/frontend/.env" << EOF
# ===================================================================
# Frontend Configuration - Personal Use
# Generated on: $(date)
# ===================================================================

VITE_APP_NAME="YouTube & Twitch Comment Manager"

# バックエンドの PORT（backend/.env）と必ず揃えること
VITE_API_BASE_URL=http://localhost:3000/api

# socket.io の接続先。コードが読むのは VITE_SOCKET_URL であり、
# 以前ここにあった VITE_WS_URL はどこからも参照されていなかった。
# socket.io はハンドシェイクをHTTPで行うため http:// を指定する
VITE_SOCKET_URL=http://localhost:3000

VITE_DEBUG=false
VITE_DEV_TOOLS=false
EOF

print_success "Frontend .env created"

# Install dependencies
print_header "Installing Dependencies"

cd "$PROJECT_ROOT/backend"
print_info "Installing backend dependencies..."
npm install --omit=dev

cd "$PROJECT_ROOT/frontend"
print_info "Installing frontend dependencies..."
npm install

print_success "Dependencies installed"

# Create systemd service (optional, for Linux)
if [ -d "/etc/systemd/system" ]; then
    print_header "Creating Systemd Service (Optional)"

    read -p "Would you like to create a systemd service? (y/n) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        sudo tee /etc/systemd/system/comment-manager.service > /dev/null << EOF
[Unit]
Description=YouTube & Twitch Comment Manager
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_ROOT/backend
ExecStart=$(which node) $PROJECT_ROOT/backend/src/server.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

        sudo systemctl daemon-reload
        print_success "Systemd service created"
        print_info "Enable with: sudo systemctl enable comment-manager"
        print_info "Start with: sudo systemctl start comment-manager"
    fi
fi

# Security checklist
print_header "Security Checklist"

echo "✓ Strong secrets generated (JWT_SECRET / SESSION_SECRET / ENCRYPTION_KEY)"
echo "✓ Two-factor authentication available (enable it per account in Settings)"
echo "✓ Refresh token rotation (old tokens are invalidated on use)"
echo "✓ Audit logging of moderation and account actions"
echo "✓ Automatic encrypted backups (AUTO_BACKUP=true)"
echo "✓ Rate limiting"
echo ""
print_warning "Not implemented -- do not assume these are protecting you:"
echo "  - Session hijack detection"
echo "  - GDPR data-retention automation"
echo "  (The previous version of this script printed both as enabled.)"
echo ""
print_info "About CSRF: there is no CSRF middleware, and none is needed while"
echo "  every authenticated endpoint reads its token from the Authorization"
echo "  header. A browser will not attach that header to a cross-site request."
echo "  If authentication is ever moved into a cookie, CSRF protection"
echo "  becomes mandatory at the same time."
echo ""

print_warning "Important: Add your API keys to backend/.env:"
echo "  - OPENAI_API_KEY (optional, for AI moderation)"
echo "  - YOUTUBE_API_KEY (required for YouTube)"
echo "  - TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET (required for Twitch)"
echo ""

# Next steps
print_header "Next Steps"

echo "1. Add your API keys to backend/.env"
echo "2. Configure IP whitelist if needed (for remote access)"
echo "3. Start the backend: cd backend && npm start"
echo "4. Start the frontend: cd frontend && npm run dev"
echo "5. Access the application at http://localhost:5173"
echo ""

print_info "For production deployment with HTTPS:"
echo "  - Put nginx (or Caddy) in front and terminate TLS there"
echo "  - Make sure /socket.io passes the WebSocket Upgrade header through"
echo "  - Update FRONTEND_ALLOWED_ORIGINS in backend/.env to your domain"
echo "  - Or use the container setup: docker compose up -d --build"
echo ""

# Security recommendations
print_header "Security Recommendations"

echo "1. 📱 Enable 2FA for your account (Settings → Security)"
echo "2. 🔒 Add your IP to whitelist (Settings → IP Whitelist)"
echo "3. 🔑 Register trusted devices (Settings → Devices)"
echo "4. 💾 Verify automatic backups are working (check backups/ folder)"
echo "5. 🔐 Keep your .env files secure and never commit them to git"
echo "6. 🌍 If exposing to internet, use HTTPS and strong passwords"
echo "7. 📊 Monitor system metrics (Dashboard → Monitoring)"
echo "8. 🔄 Regularly update dependencies: npm update"
echo ""

print_header "Setup Complete!"

print_success "Personal use setup completed successfully!"
echo ""
echo "Your secrets have been saved to:"
echo "  - backend/.env"
echo "  - frontend/.env"
echo ""
print_warning "Keep these files secure and never share them!"
echo ""

# Save setup info
cat > "$PROJECT_ROOT/SETUP_INFO.txt" << EOF
Setup completed on: $(date)
Preset used: ${PRESET}
Node version: $(node --version)
npm version: $(npm --version)

Security features available:
- Two-Factor Authentication (TOTP; enable per account in Settings)
- Refresh token rotation
- Data encryption at rest (ENCRYPTION_KEY)
- Automatic encrypted backups
- Audit logging
- Rate limiting

Not implemented: session hijack detection, GDPR data-retention automation.

CSRF: no middleware, and none required -- authentication is Bearer-header
only, which browsers do not attach cross-site. This stops being true the
moment authentication moves into a cookie.

Next steps:
1. Add API keys to backend/.env
2. Configure IP whitelist
3. Start services
4. Access http://localhost:5173

For support, see README.md
EOF

print_success "Setup information saved to SETUP_INFO.txt"
echo ""
