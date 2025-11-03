# YouTube & Twitch Comment Manager デプロイガイド

## 目次

1. [概要](#概要)
2. [デプロイ環境](#デプロイ環境)
3. [ローカル開発環境](#ローカル開発環境)
4. [本番環境デプロイ](#本番環境デプロイ)
5. [Dockerデプロイ](#dockerデプロイ)
6. [クラウドプラットフォーム](#クラウドプラットフォーム)
7. [設定と環境変数](#設定と環境変数)
8. [セキュリティ設定](#セキュリティ設定)
9. [パフォーマンス最適化](#パフォーマンス最適化)
10. [監視とログ](#監視とログ)
11. [バックアップと復元](#バックアップと復元)
12. [トラブルシューティング](#トラブルシューティング)
13. [メンテナンス](#メンテナンス)

## 概要

このガイドでは、YouTube & Twitch Comment Managerの本番環境へのデプロイ方法について説明します。開発環境から本番環境への移行、Dockerを使用したコンテナ化、クラウドプラットフォームへのデプロイなど、様々なデプロイオプションをカバーしています。

### 対象読者

- システム管理者
- DevOpsエンジニア
- 開発者
- IT担当者

### 前提条件

- Node.js 18.x 以上
- npm または yarn
- Git
- 基本的なLinuxコマンドの知識
- SSL証明書（HTTPSを使用する場合）

## デプロイ環境

### システム要件

#### 最小要件
- **CPU**: 2コア以上
- **メモリ**: 4GB以上
- **ストレージ**: 20GB以上の空き容量
- **ネットワーク**: 100Mbps以上

#### 推奨要件
- **CPU**: 4コア以上
- **メモリ**: 8GB以上
- **ストレージ**: 50GB以上のSSD
- **ネットワーク**: 1Gbps以上

### サポートOS

- **Ubuntu**: 20.04 LTS, 22.04 LTS
- **CentOS**: 7, 8
- **Debian**: 10, 11
- **Amazon Linux**: 2
- **Windows Server**: 2019, 2022
- **macOS**: 12, 13（開発環境のみ）

## ローカル開発環境

### 1. リポジトリのクローン

```bash
git clone https://github.com/shizukutanaka/Runner.git
cd Runner
```

### 2. 依存関係のインストール

#### バックエンド
```bash
cd backend
npm install
```

#### フロントエンド
```bash
cd ../frontend
npm install
```

### 3. 環境設定

#### 環境変数ファイルの作成
```bash
# バックエンド
cd ../backend
cp .env.example .env
```

```bash
# フロントエンド
cd ../frontend
cp .env.example .env
```

#### 環境変数の設定
```bash
# .envファイルに以下の変数を設定
NODE_ENV=development
PORT=3000
DATABASE_URL=sqlite:./data/database.db
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-api-key
YOUTUBE_API_KEY=your-youtube-api-key
TWITCH_CLIENT_ID=your-twitch-client-id
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORE=redis
RATE_LIMIT_REDIS_URL=redis://localhost:6379
RATE_LIMIT_GENERAL_MAX=100
RATE_LIMIT_GENERAL_WINDOW_MS=900000
RATE_LIMIT_API_MAX=60
RATE_LIMIT_API_WINDOW_MS=60000
RATE_LIMIT_STRICT_MAX=10
RATE_LIMIT_STRICT_WINDOW_MS=300000
```

#### 環境変数の検証
```bash
cd ../backend
npm run env:check
```
`backend/.env` と `frontend/.env` の必須キーが揃っているか自動検証します。未設定のキーがある場合は `.env.example` を参照して追記してください。

### 4. データベース初期化

```bash
cd backend
npm run db:init
```

### 5. アプリケーション起動

#### 開発モード起動
```bash
# バックエンド（別ターミナル）
npm run dev

# フロントエンド（別ターミナル）
cd ../frontend
npm run dev
```

#### 本番モード起動
```bash
# バックエンド
npm start

# フロントエンド
cd ../frontend
npm run build
npm run serve
```

### 6. アクセス確認

- フロントエンド: http://localhost:3001
- バックエンドAPI: http://localhost:3000/api
- ヘルスチェック: http://localhost:3000/health

## 本番環境デプロイ

### 1. サーバー準備

#### Ubuntu/Debianの場合
```bash
# システム更新
sudo apt update && sudo apt upgrade -y

# Node.jsインストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2インストール（プロセス管理）
sudo npm install -g pm2

# Nginxインストール（リバースプロキシ）
sudo apt install -y nginx

# Gitインストール
sudo apt install -y git

# ファイアウォール設定
sudo ufw allow 80
sudo ufw allow 443
```

### 2. アプリケーション配置

```bash
# アプリケーション用のディレクトリ作成
sudo mkdir -p /opt/comment-manager
sudo chown $USER:$USER /opt/comment-manager

# リポジトリクローン
cd /opt/comment-manager
git clone https://github.com/shizukutanaka/Runner.git app
cd app

# 依存関係インストール
cd backend && npm ci --production
cd ../frontend && npm ci --production && npm run build
```

### 3. 環境設定

#### 環境変数ファイル作成
```bash
# バックエンド環境変数
cat > backend/.env << EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=sqlite:./data/database.db
JWT_SECRET=$(openssl rand -base64 64)
OPENAI_API_KEY=your-openai-api-key
YOUTUBE_API_KEY=your-youtube-api-key
TWITCH_CLIENT_ID=your-twitch-client-id
SESSION_SECRET=$(openssl rand -base64 64)
REDIS_URL=redis://localhost:6379
RATE_LIMIT_ENABLED=true
RATE_LIMIT_STORE=redis
RATE_LIMIT_REDIS_URL=redis://localhost:6379
RATE_LIMIT_REDIS_PREFIX=runner:ratelimit:
RATE_LIMIT_GENERAL_MAX=100
RATE_LIMIT_GENERAL_WINDOW_MS=900000
RATE_LIMIT_API_MAX=60
RATE_LIMIT_API_WINDOW_MS=60000
RATE_LIMIT_STRICT_MAX=10
RATE_LIMIT_STRICT_WINDOW_MS=300000
EOF

# フロントエンド環境変数
cat > frontend/.env << EOF
VITE_API_BASE_URL=https://<your-domain>/api
VITE_WS_URL=wss://<your-domain>
EOF
```

#### 環境変数検証
```bash
cd backend
npm run env:check
```
`.env` の必須項目が揃っているかを自動検証します。不足が報告された場合は `.env.example` を参照して補完してください。

#### 検証失敗時の対処例
- `JWT_SECRET` / `YOUTUBE_API_KEY` / `TWITCH_CLIENT_SECRET` がエラーとなる場合は、プレースホルダー文字列（`your-...`, `sample`, `example` 等）を本番値へ置き換えます。
- URL関連エラー (`VITE_API_BASE_URL`, `VITE_WS_URL`) の場合は、`https://` / `http://`、`wss://` / `ws://` から始まる完全な URL を設定してください。
- 実行結果が `needs-attention` のままの場合は出力に表示される「チェック対象: 必須 ... / 任意 ...」のリストを参照し、該当キーを修正して再実行します。

### 4. PM2設定

```bash
# PM2エコシステムファイル作成
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'comment-manager-backend',
    script: './backend/src/server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    instances: 'max',
    exec_mode: 'cluster'
  }, {
    name: 'comment-manager-frontend',
    script: 'serve',
    env: {
      PM2_SERVE_PATH: './frontend/build',
      PM2_SERVE_PORT: 3001,
      PM2_SERVE_HOMEPAGE: '/index.html'
    },
    cwd: './frontend'
  }]
};
EOF

# PM2でアプリケーション起動
pm2 start ecosystem.config.js

# 自動起動設定
pm2 startup
pm2 save
```

### 5. Nginx設定

```bash
# Nginx設定ファイル作成
sudo cat > /etc/nginx/sites-available/comment-manager << EOF
server {
    listen 80;
    server_name <your-domain>;

    # フロントエンド
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # API
    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # CORS設定
        add_header 'Access-Control-Allow-Origin' '*' always;
        add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
        add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization' always;

        if (\$request_method = 'OPTIONS') {
            return 204;
        }
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # セキュリティヘッダー
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' https: data: blob: 'unsafe-inline'; connect-src 'self' https://<your-domain> wss://<your-domain>;" always;
}
EOF

# サイト有効化
sudo ln -s /etc/nginx/sites-available/comment-manager /etc/nginx/sites-enabled/
sudo rm /etc/nginx/sites-enabled/default

# Nginx設定テスト
sudo nginx -t

# Nginx再起動
sudo systemctl restart nginx
sudo systemctl enable nginx
```

### 6. SSL設定（Let's Encrypt）

```bash
# Certbotインストール
sudo apt install -y certbot python3-certbot-nginx

# SSL証明書取得
sudo certbot --nginx -d <your-domain>

# 自動更新設定
sudo crontab -e
# 以下を追加
0 12 * * * /usr/bin/certbot renew --quiet
```

### 7. ファイアウォール設定

```bash
# UFW設定
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw --force enable
```

## Dockerデプロイ

### Docker Composeを使用したデプロイ

#### 1. Docker Composeファイル作成

```yaml
version: '3.8'

services:
  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    env_file:
      - backend/.env
    volumes:
      - ./backend/data:/app/data
    depends_on:
      - redis
    restart: unless-stopped

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
      args:
        - VITE_API_BASE_URL=${VITE_API_BASE_URL}
        - VITE_WS_URL=${VITE_WS_URL}
    ports:
      - "3001:80"
    depends_on:
      - backend
    env_file:
      - frontend/.env
    restart: unless-stopped

  # 本番用の値を配置する前に、コンテナイメージ内で `npm run env:check` を実行して
  # プレースホルダーやURL形式の不備がないか確認してください。

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - frontend
      - backend
    restart: unless-stopped

volumes:
  redis_data:
```

#### 2. Dockerfile作成

##### バックエンドDockerfile
```dockerfile
FROM node:18-alpine

WORKDIR /app

# 依存関係インストール
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# ソースコードコピー
COPY . .

# データディレクトリ作成
RUN mkdir -p data

# ヘルスチェック
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node healthcheck.js

EXPOSE 3000

CMD ["npm", "start"]
```

##### フロントエンドDockerfile
```dockerfile
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

#### 3. Nginx設定ファイル

```nginx
server {
    listen 80;
    server_name localhost;

    location / {
        proxy_pass http://frontend:80;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://backend:3000/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://backend:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

#### 4. デプロイ実行

```bash
# 環境変数ファイル作成
cat > .env << EOF
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-api-key
YOUTUBE_API_KEY=your-youtube-api-key
TWITCH_CLIENT_ID=your-twitch-client-id
REACT_APP_API_BASE_URL=https://example.com/api
REACT_APP_WS_URL=wss://example.com
EOF

# Dockerイメージビルド
docker-compose build

# アプリケーション起動
docker-compose up -d

# ログ確認
docker-compose logs -f
```

## クラウドプラットフォーム

### AWS EC2 + RDS

#### 1. EC2インスタンス作成
- AMI: Ubuntu Server 22.04 LTS
- インスタンスタイプ: t3.medium以上
- セキュリティグループ: HTTP(80), HTTPS(443), SSH(22)開放

#### 2. RDSインスタンス作成
- エンジン: PostgreSQL 14
- インスタンス: db.t3.micro
- ストレージ: 20GB SSD

#### 3. デプロイ
```bash
# インスタンスに接続
ssh -i your-key.pem ubuntu@your-ec2-instance

# アプリケーション配置（上記の手順に従う）
# データベースURLをRDSに変更
DATABASE_URL=postgresql://user:password@rds-endpoint:5432/commentmanager
```

### Google Cloud Platform

#### 1. Compute Engineインスタンス作成
- OS: Ubuntu 20.04 LTS
- マシンタイプ: n1-standard-2
- ファイアウォール: HTTP, HTTPS許可

#### 2. Cloud SQLインスタンス作成
- データベース: PostgreSQL 14
- ティア: db-f1-micro
- ストレージ: 20GB SSD

#### 3. デプロイ
```bash
# Cloud SQLのプライベートIPを取得
gcloud sql instances describe your-instance --format="value(ipAddresses.ipAddress)"

# アプリケーション配置
# DATABASE_URLにCloud SQLの接続情報を設定
```

### Herokuデプロイ

#### 1. Heroku CLIインストール
```bash
curl https://cli-assets.heroku.com/install.sh | sh
```

#### 2. Herokuアプリ作成
```bash
heroku create your-app-name
```

#### 3. ビルドパック設定
```bash
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add heroku/python  # 必要に応じて
```

#### 4. 環境変数設定
```bash
heroku config:set NODE_ENV=production
heroku config:set JWT_SECRET=$(openssl rand -base64 64)
heroku config:set OPENAI_API_KEY=your-openai-api-key
heroku config:set YOUTUBE_API_KEY=your-youtube-api-key
heroku config:set TWITCH_CLIENT_ID=your-twitch-client-id
```

#### 5. デプロイ
```bash
git push heroku main
```

### Vercelデプロイ

#### 1. Vercel CLIインストール
```bash
npm i -g vercel
```

#### 2. プロジェクト設定
```bash
# フロントエンドディレクトリで
cd frontend
vercel

# 初回設定時
? Set up and deploy "~/frontend"? Y
? Which scope? your-username
? Link to existing project? N
? What's your project's name? comment-manager-frontend
? In which directory is your code located? ./
```

#### 3. 環境変数設定
```bash
vercel env add REACT_APP_API_BASE_URL
vercel env add REACT_APP_WS_URL
```

## 設定と環境変数

### 必須環境変数

```bash
# アプリケーション設定
NODE_ENV=production
PORT=3000

# データベース
DATABASE_URL=sqlite:./data/database.db

# 認証
JWT_SECRET=your-jwt-secret-key
SESSION_SECRET=your-session-secret-key

# APIキー
OPENAI_API_KEY=your-openai-api-key
YOUTUBE_API_KEY=your-youtube-api-key
TWITCH_CLIENT_ID=your-twitch-client-id

# キャッシュ（オプション）
REDIS_URL=redis://localhost:6379

# フロントエンド設定
REACT_APP_API_BASE_URL=https://yourdomain.com/api
REACT_APP_WS_URL=wss://yourdomain.com
```

### オプション環境変数

```bash
# レート制限
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# キャッシュ設定
CACHE_TTL=300
CACHE_MAX_SIZE=1000

# ログ設定
LOG_LEVEL=info
LOG_FILE=/var/log/comment-manager/app.log

# バックアップ設定
BACKUP_ENABLED=true
BACKUP_INTERVAL=24
BACKUP_RETENTION_DAYS=30

# セキュリティ設定
CORS_ORIGIN=https://example.com
HELMET_ENABLED=true
```

## セキュリティ設定

### HTTPS設定

#### SSL証明書取得（Let's Encrypt）
```bash
# Certbotインストール
sudo apt install -y certbot python3-certbot-nginx

# SSL証明書取得
sudo certbot --nginx -d yourdomain.com

# 自動更新設定
sudo crontab -e
# 以下を追加
0 12 * * * /usr/bin/certbot renew --quiet
```

#### 自己署名証明書作成
```bash
# 秘密鍵生成
openssl genrsa -out server.key 2048

# 証明書署名要求作成
openssl req -new -key server.key -out server.csr

# 自己署名証明書作成
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# Nginx設定にSSL追加
sudo cat >> /etc/nginx/sites-available/comment-manager << EOF
server {
    listen 443 ssl;
    server_name example.com;

    ssl_certificate /etc/ssl/certs/server.crt;
    ssl_certificate_key /etc/ssl/private/server.key;

    # SSL設定
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
}
EOF
```

### ファイアウォール設定

#### UFW設定
```bash
sudo ufw allow 'Nginx Full'
sudo ufw allow ssh
sudo ufw --force enable
```

#### iptables設定
```bash
# 基本ルール
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT
sudo iptables -A INPUT -j DROP

# 保存
sudo iptables-save > /etc/iptables/rules.v4
```

### 認証設定

#### JWT設定
```javascript
// バックエンド設定
const jwtConfig = {
  secret: process.env.JWT_SECRET,
  expiresIn: '24h',
  algorithm: 'HS256'
};
```

#### セッション設定
```javascript
// セッション設定
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000
  }
};
```

## パフォーマンス最適化

### キャッシュ設定

#### Redisキャッシュ
```bash
# Redisインストール
sudo apt install -y redis-server

# Redis設定
sudo cat > /etc/redis/redis.conf << EOF
maxmemory 256mb
maxmemory-policy allkeys-lru
save 900 1
save 300 10
save 60 10000
EOF

sudo systemctl restart redis
```

#### アプリケーションキャッシュ
```javascript
// キャッシュ設定
const cacheConfig = {
  ttl: parseInt(process.env.CACHE_TTL) || 300,
  maxSize: parseInt(process.env.CACHE_MAX_SIZE) || 1000,
  redis: process.env.REDIS_URL
};
```

### データベース最適化

#### SQLite最適化
```bash
# 定期的なVACUUM
sqlite3 database.db "VACUUM;"

# WALモード有効化
sqlite3 database.db "PRAGMA journal_mode=WAL;"
sqlite3 database.db "PRAGMA synchronous=NORMAL;"
```

#### PostgreSQL最適化
```sql
-- インデックス作成
CREATE INDEX idx_comments_platform_timestamp ON comments(platform, timestamp DESC);
CREATE INDEX idx_users_status ON users(status);
CREATE INDEX idx_moderation_logs_created_at ON ai_moderation_logs(created_at DESC);

-- クエリオプティマイザ設定
SET random_page_cost = 1.1;
SET effective_cache_size = '256MB';
```

### ロードバランシング

#### Nginxロードバランシング
```nginx
upstream backend {
    least_conn;
    server backend1:3000 weight=3;
    server backend2:3000 weight=3;
    server backend3:3000 weight=1;
}

server {
    location /api {
        proxy_pass http://backend;
        # 他の設定...
    }
}
```

#### PM2クラスタリング
```bash
# PM2クラスターモード
pm2 start ecosystem.config.js
pm2 scale comment-manager-backend 4
```

## 監視とログ

### ログ設定

#### アプリケーションログ
```javascript
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});
```

#### Nginxログ
```bash
# ログローテーション設定
sudo cat > /etc/logrotate.d/nginx << EOF
/var/log/nginx/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 nginx adm
    postrotate
        systemctl reload nginx
    endscript
}
EOF
```

### 監視ツール

#### PM2モニタリング
```bash
# PM2モニタリング
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 10

# リアルタイムモニタリング
pm2 monit
```

#### システム監視
```bash
# htopインストール
sudo apt install -y htop

# システム監視スクリプト
cat > monitor.sh << 'EOF'
#!/bin/bash
echo "=== System Status ==="
echo "CPU Usage: $(top -bn1 | grep load | awk '{printf "%.2f%%", $(NF-2)}')"
echo "Memory Usage: $(free | awk 'NR==2{printf "%.2f%%", $3*100/$2 }')"
echo "Disk Usage: $(df -h | awk '$NF=="/"{printf "%s", $5}')"
echo "Active Connections: $(netstat -tuln | wc -l)"
echo "=== PM2 Status ==="
pm2 jlist
EOF

chmod +x monitor.sh
```

### アラート設定

#### Slack通知
```bash
# Slack webhook URL設定
curl -X POST -H 'Content-type: application/json' \
--data '{"text":"Comment Manager Alert: High CPU usage detected"}' \
https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
```

## バックアップと復元

### 自動バックアップ

#### バックアップスクリプト
```bash
cat > backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/opt/comment-manager/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ディレクトリ作成
mkdir -p $BACKUP_DIR

# データベースバックアップ
sqlite3 /opt/comment-manager/app/backend/data/database.db ".backup $BACKUP_DIR/db_backup_$TIMESTAMP.db"

# ファイルバックアップ
tar -czf $BACKUP_DIR/files_backup_$TIMESTAMP.tar.gz \
  /opt/comment-manager/app/backend/data/ \
  /opt/comment-manager/app/frontend/build/

# 古いバックアップ削除（30日以上）
find $BACKUP_DIR -type f -mtime +30 -delete

echo "Backup completed: $TIMESTAMP"
EOF

chmod +x backup.sh

# 定期実行設定
sudo crontab -e
# 以下を追加
0 2 * * * /opt/comment-manager/backup.sh
```

### 手動バックアップ

```bash
# データベースバックアップ
sqlite3 database.db ".backup backup_$(date +%Y%m%d_%H%M%S).db"

# ファイルバックアップ
tar -czf backup_$(date +%Y%m%d_%H%M%S).tar.gz ./data ./build
```

### 復元手順

```bash
# データベース復元
cp backup_file.db database.db

# ファイル復元
tar -xzf backup_file.tar.gz

# 権限修正
sudo chown -R comment-manager:comment-manager /opt/comment-manager
```

## トラブルシューティング

### デプロイ時の一般的な問題

#### 依存関係のインストールエラー
```bash
# キャッシュクリア
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

#### ポート競合
```bash
# 使用中のポート確認
lsof -i :3000
netstat -tlnp | grep :3000

# プロセス終了
kill -9 <PID>
```

#### パーミッションエラー
```bash
# 権限修正
sudo chown -R $USER:$USER /opt/comment-manager
sudo chmod -R 755 /opt/comment-manager

# ディレクトリ作成
mkdir -p /opt/comment-manager/data
mkdir -p /opt/comment-manager/logs
```

### パフォーマンス問題

#### メモリ不足
```bash
# スワップファイル作成
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# fstabに追加
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### CPU使用率が高い
```bash
# PM2設定調整
pm2 stop all
pm2 delete all
pm2 start ecosystem.config.js --instances 2
```

### データベース問題

#### データベース接続エラー
```bash
# SQLiteデータベース権限確認
ls -la /opt/comment-manager/app/backend/data/

# データベースファイル再作成
rm /opt/comment-manager/app/backend/data/database.db
npm run db:init
```

#### クエリパフォーマンスの問題
```bash
# クエリ実行計画確認
sqlite3 database.db "EXPLAIN QUERY PLAN SELECT * FROM comments WHERE platform = 'youtube';"

# インデックス作成
sqlite3 database.db "CREATE INDEX idx_comments_platform_timestamp ON comments(platform, timestamp DESC);"
```

### ネットワーク問題

#### API接続エラー
```bash
# ネットワーク診断
ping your-api-endpoint
curl -I https://your-api-endpoint

# DNS確認
nslookup example.com

# ファイアウォール確認
sudo ufw status
```

#### WebSocket接続エラー
```bash
# WebSocketテスト
websocat wss://example.com/ws

# Nginx設定確認
sudo nginx -t
sudo nginx -s reload
```

## メンテナンス

### 定期メンテナンス

#### 日次メンテナンス
```bash
# ログローテーション
logrotate -f /etc/logrotate.d/nginx
logrotate -f /etc/logrotate.d/pm2-comment-manager

# キャッシュクリア
redis-cli FLUSHALL

# バックアップ実行
./backup.sh
```

#### 週次メンテナンス
```bash
# システム更新
sudo apt update && sudo apt upgrade -y

# セキュリティチェック
sudo ufw status
sudo fail2ban status

# ディスク使用量確認
df -h
du -sh /opt/comment-manager/*
```

#### 月次メンテナンス
```bash
# ログ分析
cat /var/log/nginx/access.log | goaccess -a > /var/www/html/report.html

# パフォーマンス分析
pm2 monit

# バックアップテスト
./restore-test.sh
```

### セキュリティメンテナンス

#### 定期的なセキュリティチェック
```bash
# 脆弱性スキャン
npm audit --production

# 依存関係更新
npm update --production

# ログセキュリティチェック
grep -i "failed\|error\|attack" /var/log/nginx/access.log
```

#### アクセスログ分析
```bash
# 異常アクセス検出
cat /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -nr | head -10

# レート制限違反確認
grep "429" /var/log/nginx/access.log | wc -l
```

### アップデート手順

#### マイナーバージョンアップデート
```bash
# リポジトリ更新
cd /opt/comment-manager/app
git pull origin main

# 依存関係更新
cd backend && npm update
cd ../frontend && npm update

# 再ビルド
cd ../frontend && npm run build

# PM2再起動
pm2 reload all
```

#### メジャーバージョンアップデート
```bash
# バックアップ作成
./backup.sh

# アプリケーション停止
pm2 stop all

# データベースマイグレーション
npm run db:migrate

# アプリケーション更新
git pull origin main
npm install
npm run build

# アプリケーション起動
pm2 start all

# ヘルスチェック
curl -f https://example.com/health || exit 1
```

## サポート

### 技術サポート

- **メール**: devops@example.com
- **GitHub Issues**: https://github.com/shizukutanaka/Runner/issues
- **ドキュメント**: https://docs.example.com

### 監視ツール

- **UptimeRobot**: サービス稼働監視
- **Grafana**: メトリクス監視
- **Sentry**: エラートラッキング

### 緊急対応

#### サービスダウン時
```bash
# ステータス確認
pm2 status
sudo systemctl status nginx

# ログ確認
pm2 logs --lines 50
sudo tail -f /var/log/nginx/error.log

# 再起動
pm2 restart all
sudo systemctl restart nginx
```

#### データベース障害時
```bash
# バックアップから復元
./restore.sh latest

# 整合性チェック
sqlite3 database.db "PRAGMA integrity_check;"

# 最適化
sqlite3 database.db "VACUUM;"
sqlite3 database.db "REINDEX;"
```

---

*このデプロイガイドは定期的に更新されます。最新情報はGitHubリポジトリを参照してください。*

**著作権**: © 2025 Runner Project Team
