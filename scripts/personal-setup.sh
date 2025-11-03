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
# ===================================================================

NODE_ENV=production
PORT=3000
APP_NAME="YouTube & Twitch Comment Manager"

# Security Secrets (DO NOT SHARE)
JWT_SECRET=${JWT_SECRET}
JWT_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d
SESSION_SECRET=${SESSION_SECRET}
ENCRYPTION_KEY=${ENCRYPTION_KEY}

# Session Configuration
SESSION_STORE=memory
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_HTTPONLY=true
SESSION_COOKIE_SAMESITE=strict
SESSION_MAX_AGE=1800000

# Advanced Security Features
ENABLE_2FA=true
TOTP_WINDOW=2
BACKUP_CODES_COUNT=10
ENABLE_IP_WHITELIST=true
MAX_SESSIONS_PER_USER=5
SESSION_HIJACK_DETECTION=true
CSRF_ENABLED=true
TOKEN_ROTATION_ENABLED=true

# Database
DATABASE_URL=sqlite:./data/database.db
DB_POOL_SIZE=3

# Cache & Performance
CACHE_TTL=300
CACHE_MAX_SIZE=1000
QUERY_CACHE_ENABLED=true
RESPONSE_CACHE_ENABLED=true
CIRCUIT_BREAKER_ENABLED=true

# Data Protection
ENCRYPTION_ENABLED=true
AUTO_BACKUP=true
BACKUP_SCHEDULE=0 2 * * *
ENCRYPT_BACKUPS=true
MAX_BACKUPS=30

# GDPR Compliance
GDPR_ENABLED=true
GDPR_DATA_RETENTION_COMMENTS=90
GDPR_DATA_RETENTION_USERS=365
AUDIT_LOGGING=true

# Monitoring & Alerting
ALERTING_ENABLED=true
ALERT_ERROR_RATE=0.03
ALERT_RESPONSE_TIME=800
ALERT_MEMORY_USAGE=0.85
ALERT_CPU_USAGE=0.75

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# CORS
CORS_ORIGIN=http://localhost:5173

# Feature Flags
ENABLE_AI_MODERATION=true
ENABLE_REAL_TIME_SYNC=true
ENABLE_ANALYTICS=false
ENABLE_NOTIFICATIONS=true

# Personal Use Settings
DEPLOYMENT_TYPE=personal
HIGH_SECURITY_MODE=true
LOCAL_MODE=true

# API Keys (Add your own)
OPENAI_API_KEY=
YOUTUBE_API_KEY=
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log
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
VITE_API_BASE_URL=http://localhost:3000/api
VITE_WS_URL=ws://localhost:3000

# Security Features
VITE_ENABLE_2FA_UI=true
VITE_SESSION_TIMEOUT_WARNING=300000
VITE_AUTO_LOGOUT_INACTIVE=1800000

# Feature Flags
VITE_ENABLE_AI_MODERATION=true
VITE_ENABLE_REAL_TIME=true
VITE_ENABLE_ANALYTICS=false
VITE_ENABLE_NOTIFICATIONS=true
VITE_ENABLE_THEMES=true

# Development
VITE_DEBUG=false
VITE_DEV_TOOLS=false

# Performance
VITE_WS_RECONNECT_ATTEMPTS=5
VITE_API_TIMEOUT=30000

# Privacy
VITE_DISABLE_ANALYTICS=true
VITE_DISABLE_EXTERNAL_TRACKING=true
VITE_LOCAL_MODE=true
EOF

print_success "Frontend .env created"

# Install dependencies
print_header "Installing Dependencies"

cd "$PROJECT_ROOT/backend"
print_info "Installing backend dependencies..."
npm install --production

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

echo "✓ Strong secrets generated automatically"
echo "✓ 2FA enabled"
echo "✓ IP whitelisting enabled"
echo "✓ Session hijack detection enabled"
echo "✓ CSRF protection enabled"
echo "✓ Token rotation enabled"
echo "✓ Data encryption enabled"
echo "✓ Automatic backups enabled"
echo "✓ GDPR compliance enabled"
echo "✓ Audit logging enabled"
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
echo "  - Use nginx or Apache as reverse proxy"
echo "  - Set SESSION_COOKIE_SECURE=true in backend/.env"
echo "  - Update CORS_ORIGIN to your domain"
echo "  - Consider using Docker: docker-compose up -d"
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

Security features enabled:
- Two-Factor Authentication (2FA)
- IP Whitelisting
- Session Hijack Detection
- CSRF Protection
- Token Rotation
- Data Encryption
- Automatic Backups
- GDPR Compliance
- Audit Logging

Next steps:
1. Add API keys to backend/.env
2. Configure IP whitelist
3. Start services
4. Access http://localhost:5173

For support, see README.md
EOF

print_success "Setup information saved to SETUP_INFO.txt"
echo ""
