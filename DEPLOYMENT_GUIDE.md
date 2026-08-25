# Runner デプロイガイド

## このドキュメントについて

以前のこのファイルは1221行あり、その大半が**この製品と無関係な一般的なLinux運用の
チュートリアル**（`htop` の入れ方、スワップファイルの作り方、`lsof` でのポート確認など）でした。
そして製品固有の記述は、多くが**間違っているか、従うと壊れる**内容でした:

- **ロードバランシングの節**が `backend1:3000 / backend2:3000 / backend3:3000` への
  振り分けと `pm2 scale ... 4` を指示していた。本アプリは単一インスタンス専用なので、
  この通りにすると**データベースが壊れます**（理由は次節）
- バックアップ手順が `database.db` と `frontend/build/` を参照していた。
  実際のファイルは `comments.db` と `frontend/dist/` で、
  しかも**アプリには自動バックアップが組み込まれている**ことに触れていなかった
- Nginx と Let's Encrypt の設定を手書きさせる節があったが、
  現在は**フロントエンドのコンテナがTLSを終端する**ので不要
- `npm run db:init` / `npm run db:migrate` を実行させていたが、
  どちらも存在しません（DBは初回起動時に自動作成されます）

一般的なLinux運用の情報は他所にいくらでもあります。ここには
**この製品を動かすために必要で、かつ正しいことだけ**を書きます。

---

## 目次

1. [最重要: 単一インスタンス制約](#最重要-単一インスタンス制約)
2. [Docker Composeでのデプロイ（推奨）](#docker-composeでのデプロイ推奨)
3. [Dockerを使わない場合](#dockerを使わない場合)
4. [環境変数](#環境変数)
5. [バックアップと復元](#バックアップと復元)
6. [監視](#監視)
7. [アップデート](#アップデート)
8. [トラブルシューティング](#トラブルシューティング)

---

## 最重要: 単一インスタンス制約

**バックエンドは1プロセスで動かしてください。** 複数に増やしてはいけません。

理由は3つあります。

1. **データベースが単一のSQLiteファイル**です。複数プロセスからの並行書き込みで破損します
2. **YouTubeのポーリング、TwitchのEventSub WebSocket接続、レイド検知の状態を
   プロセス内に保持**しています。プロセスを増やすと、YouTube APIのクォータを
   プロセス数だけ多重に消費し、同じコメントを重複して取り込み、
   レイド検知の閾値が壊れます
3. 保留キューの処理も同様に多重化されます

このため、以下は**すべて削除済み**です。復活させないでください。

- `k8s/` のマニフェスト（`replicas: 3` + HPAで最大10だった）
- `backend/ecosystem.config.js` の `instances: 'max'` + クラスターモード
- 本ガイドのロードバランシングの節

水平スケールが必要になった場合の**正しい順序**は次のとおりです。

1. データベースを外部化する（PostgreSQL等）
2. 取り込み処理をワーカーとして分離する
3. その上でスケール構成を設計する

---

## Docker Composeでのデプロイ（推奨）

`backend` / `frontend` / `redis` の3コンテナ構成です。
フロントエンドのnginxがTLSを終端し、`/api` と `/socket.io` をバックエンドへプロキシします。

### 前提

- Docker および Docker Compose v2（`docker compose` サブコマンド）
- 永続ディスク（SQLiteファイルを再起動をまたいで保持するため）

### 手順

```bash
git clone https://github.com/shizukutanaka/Runner.git
cd Runner

cp .env.example .env
# JWT_SECRET / SESSION_SECRET / ENCRYPTION_KEY は必ず設定してください
#   openssl rand -hex 32
# 未設定だと本番モードでは起動を拒否します（意図的なガードです）

docker compose up -d --build
docker compose ps
docker compose logs -f
```

起動後は **`https://localhost:8443`** にアクセスします（`FRONTEND_PORT` で変更可）。

### なぜHTTPSが必須なのか

認証トークンは `Secure` 属性付きの httpOnly Cookie で持たせています。
**平文HTTPではブラウザがCookieを保存しないため、ログインが成立しません。**

証明書を用意していない場合、フロントエンドのコンテナが起動時に
自己署名証明書を生成します。これは「何も設定しなくても起動して動作確認できる」ためで、
自己署名のまま本番運用してよいという意味ではありません。

### 本番の証明書に差し替える

```bash
# 取得した証明書を配置する（ファイル名は固定）
cp /path/to/fullchain.pem ./certs/fullchain.pem
cp /path/to/privkey.pem   ./certs/privkey.pem

docker compose restart frontend
```

`./certs` はコンテナの `/etc/nginx/certs` にマウントされます。
中身は `.gitignore` されているのでコミットされません。

Let's Encrypt を使う場合は、ホスト側で `certbot` などにより証明書を取得し、
上記のパスへ配置・更新してください（証明書の更新後は `docker compose restart frontend`）。

### ポート

| ポート | 既定 | 用途 |
|--------|------|------|
| `FRONTEND_PORT` | 8443 | HTTPS。**実際のアクセス先** |
| `FRONTEND_HTTP_PORT` | 8080 | `/health` のみ。それ以外はHTTPSへ301 |

バックエンドは外部公開されません（`expose` のみ）。フロントエンドのnginx経由で到達します。

---

## Dockerを使わない場合

VMに直接置く場合も、**バックエンドは1プロセス**という制約は変わりません。

```bash
# バックエンド
cd backend
npm ci --omit=dev
cp .env.example .env      # 秘密鍵を設定すること
npm start                 # pm2 経由（ecosystem.config.js は fork/1インスタンス）
# もしくは pm2 を使わない場合:
#   npm run start:node
```

```bash
# フロントエンド
cd frontend
npm ci
npm run build             # dist/ が生成される
```

生成された `frontend/dist/` を任意のWebサーバーで配信し、
**同一オリジンで `/api` と `/socket.io` をバックエンドへプロキシ**してください。
設定例はリポジトリの `frontend/nginx.conf` がそのまま使えます
（`upstream` の向き先と証明書のパスだけ環境に合わせて変更）。

**必ず満たすべき3条件**:

1. **永続ディスクを持つ単一インスタンス** — SQLiteファイルを再起動をまたいで保持できること
2. **バックエンドは1プロセス**
3. **WebSocketを通すリバースプロキシ** — `/socket.io` の `Upgrade` ヘッダを落とさないこと

この3条件を満たすなら、AWS EC2・GCP Compute Engine・Hetzner・さくらのVPSなど
どのVMでも同じ手順で動きます。

> **載らない構成**: Heroku などファイルシステムが揮発する環境（SQLiteが消えます）、
> Vercel などのサーバーレス（常駐プロセスとしてWebSocket接続を保持できません）。
> マネージドPostgreSQLへの接続も**できません**（PostgreSQLドライバを同梱していないため）。

---

## 環境変数

**正典は `backend/.env.example` と `frontend/.env.example` です。**
両ファイルには**コードが実際に読むキーだけ**が入っており、
`backend/tests/services/envExample.test.js` がそれを機械的に検査しています。
ここに一覧を再掲すると必ず古くなるので、ファイルを直接参照してください。

本番で必ず設定するもの:

| キー | 説明 |
|------|------|
| `JWT_SECRET` | `openssl rand -hex 32`。未設定だと本番起動を拒否 |
| `SESSION_SECRET` | 同上 |
| `ENCRYPTION_KEY` | 同上 |
| `CORS_ORIGIN` | 公開するオリジン（例 `https://example.com`）。複数は `ALLOWED_ORIGINS` にカンマ区切り |

APIキー（`YOUTUBE_API_KEY` / `TWITCH_*` / `OPENAI_API_KEY`）は**未設定でも起動します**。
該当機能だけが無効になり、警告がログに出ます（フェイルセーフ設計）。

---

## バックアップと復元

### 自動バックアップ（推奨）

**アプリのプロセス内でスケジュール実行されます。** cronを別途組む必要はありません。

```bash
AUTO_BACKUP=true
BACKUP_SCHEDULE=0 2 * * *   # cron書式
MAX_BACKUPS=30
ENCRYPT_BACKUPS=true
```

出力先は `backend/backups/`（composeでは `backend_backups` ボリューム）です。

### 手動バックアップ

データベースの実体は **`backend/data/comments.db`** です。

```bash
# 稼働中でも安全にコピーできる方法（WALモードのため cp は不可）
sqlite3 backend/data/comments.db ".backup backup_$(date +%Y%m%d_%H%M%S).db"

# composeの場合
docker compose cp backend:/app/data/comments.db ./comments-backup.db
```

### 復元

```bash
docker compose stop backend
docker compose cp ./comments-backup.db backend:/app/data/comments.db
docker compose start backend
```

停止せずに差し替えるとWALとの不整合で破損する可能性があります。必ず止めてください。

---

## 監視

実在するエンドポイントは3つだけです。

| エンドポイント | 認証 | 内容 |
|----------------|------|------|
| `GET /health` | 不要 | 稼働確認。コンテナのヘルスチェックもこれを使う |
| `GET /health/detailed` | admin | 依存関係・ホスト構成・リクエスト統計 |
| `GET /metrics` | admin | **JSON形式**のメトリクス |

> `/health/detailed` と `/metrics` は以前**無認証で公開**されており、
> Nodeのバージョン・プラットフォーム・CPU数・メモリ量まで誰にでも返していました。
> Nodeバージョンの開示は既知CVEの狙い撃ちを容易にするため、管理者認証を必須にしました。
> `/health` は死活監視のため公開のままです（返すのは status と timestamp だけ）。

> `/metrics` は **Prometheus の exposition 形式ではありません**。
> Prometheusで取り込むにはエクスポーターを別途用意する必要があります。
> 以前このガイドにあった Prometheus / Grafana の構成は、参照先の設定ファイルが
> リポジトリに存在しなかったため削除しました。

ログは標準出力に出ます。

```bash
docker compose logs -f backend
docker compose logs -f frontend
```

---

## アップデート

```bash
cd Runner
git pull

# コンテナの場合
docker compose up -d --build

# 直接配置の場合
cd backend && npm ci --omit=dev && pm2 restart ecosystem.config.js   # backend/ 内で実行
cd ../frontend && npm ci && npm run build
```

データベースのスキーマ変更は**起動時に自動適用**されます
（`ensureColumnDefinitions` が不足している列を追加します）。
マイグレーションコマンドはありません。

**アップデート前にバックアップを取ってください。**

---

## トラブルシューティング

### 起動しない: `JWT_SECRET is required in production`

意図的なガードです。秘密鍵が空のまま本番が動き出さないようにしています。
`JWT_SECRET` / `SESSION_SECRET` / `ENCRYPTION_KEY` を設定してください。

### ログインできない / ログイン後すぐログアウトされる

**HTTPSでアクセスしていますか。** 認証Cookieは `Secure` 属性付きなので、
平文HTTPではブラウザが保存しません。`https://` で開いてください。

自己署名証明書の場合、ブラウザの警告を承認しないとCookieも保存されません。

### `/api` が404になる

フロントエンドを配信しているWebサーバーが `/api` をバックエンドへ
プロキシしていない構成です。`frontend/nginx.conf` を参照してください。
フロントは同一オリジンの `/api` を叩く前提です。

### リアルタイム更新が来ない

`/socket.io` のプロキシで `Upgrade` / `Connection` ヘッダを転送していない可能性があります。
`frontend/nginx.conf` の `location /socket.io/` が参考になります。

疎通確認:

```bash
curl -k "https://localhost:8443/socket.io/?EIO=4&transport=polling"
# {"sid":"...","upgrades":["websocket"],...} が返れば経路は正常
```

### ログインが429で弾かれる

ログインは15分に5回までに制限されています（ブルートフォース対策）。
この制限は `RATE_LIMIT_ENABLED` に**関係なく常に有効**です。
15分待つか、開発環境ではプロセスを再起動してください（カウンタはメモリ上）。

### YouTube/Twitchのコメントが取り込まれない

APIキーが未設定なら、その旨がログに警告として出ます（アプリは起動します）。

- YouTubeの**書き戻し**（削除・BAN）にはOAuth2が必要です。APIキーだけでは読み取りのみです
- TwitchのEventSubチャット購読には**ユーザーアクセストークン**が必要です
  （アプリトークンでは購読できません）

### ディスクが逼迫している

バックアップの保持数（`MAX_BACKUPS`）とログを確認してください。
コンテナの場合は `docker compose exec backend du -sh /app/data /app/logs /app/backups`。

---

## 関連ドキュメント

- [`README.md`](README.md) — 機能概要とクイックスタート
- [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md) — APIリファレンス（全81エンドポイントが実在することを検査済み）
- [`docs/FEATURE_AUDIT.md`](docs/FEATURE_AUDIT.md) — 実装状況の監査記録
- [`docs/RESEARCH_IMPROVEMENTS.md`](docs/RESEARCH_IMPROVEMENTS.md) — モデレーション性能の実測と改善記録
