# Backend (Node.js)

## 日本語セクション

### 目的
`backend/` はコメント管理ソフトウェアのサーバーサイドを担当します。REST API と WebSocket を提供し、コメントの取得、モデレーション、通知、分析を一元的に処理します。

### 主な責務
- Express による API ルーティングと認証
- YouTube Data API、Twitch API との連携およびデータ統合
- AI モデレーションエンジンとの連携と判定結果の保存
- SQLite を用いたデータ永続化とスキーマ整合
- WebSocket によるリアルタイム送信

### セットアップ
1. `npm install`
2. `.env.example` を `.env` に複製し、コメントに従って必要な環境変数（例: `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`）を設定
3. `npm run env:check` で `backend/.env` と `frontend/.env` の必須キーが揃っているか検証
4. `npm run dev` で開発サーバーを起動
5. 既存のSQLiteファイルを再利用する場合でも、起動時に `src/db.js` が不足列を自動追加し最新スキーマへ整合します。
6. `npm run dev` や `npm start` 実行時に自動で `env:check` が走り、必須環境変数やプレースホルダー残存を検知します。

### ロギング
- 集中ロガーは `src/logger.js` で定義され、Winston を利用します。
- 既定のログレベルは `info` です。`.env` の `LOG_LEVEL`（例: `debug`, `warn`）で変更できます。
- ログ出力は標準出力へ送信されます。必要に応じて `logger.js` のトランスポートを拡張してください。

### ディレクトリ概要
- `src/routes/` API ルート定義
- `src/controllers/` ビジネスロジック
- `src/services/` 外部 API 連携とモジュール化された処理
- `src/models/` データベースモデル
- `src/ws/` WebSocket 関連処理

---

## English Section

### Purpose
The `backend/` directory hosts the server-side components of the comment manager. It delivers REST APIs and WebSocket endpoints that aggregate comment ingestion, moderation, notifications, and analytics.

### Core Responsibilities
- API routing and authentication provided by Express
- Integrations with YouTube Data API and Twitch API
- Coordination with the AI moderation engine and persistence of verdicts
- Data storage through SQLite with automatic schema alignment
- Real-time event delivery via WebSocket

### Setup
1. Run `npm install`
2. Copy `.env.example` to `.env` and populate required variables according to the inline guidance (e.g., `OPENAI_API_KEY`, `YOUTUBE_API_KEY`, `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET`)
3. Verify configuration with `npm run env:check` to ensure both backend and frontend `.env` files include required keys
4. Start the development server with `npm run dev`
5. When reusing an existing SQLite database file, `src/db.js` will upgrade missing columns automatically so legacy data remains compatible.
6. `npm run dev` / `npm start` automatically invoke `env:check` to ensure required variables are present and placeholders are replaced.

### Logging
- Centralized logging lives in `src/logger.js` and is powered by Winston.
- The default log level is `info`. Override it via the `LOG_LEVEL` entry in `.env` (e.g., `debug`, `warn`).
- Logs are written to stdout. Extend transports in `logger.js` if file or external sinks are required.

### Directory Overview
- `src/routes/`: REST endpoint definitions
- `src/controllers/`: Business logic implementations
- `src/services/`: External integration and reusable modules
- `src/models/`: Database models
- `src/ws/`: WebSocket related utilities
