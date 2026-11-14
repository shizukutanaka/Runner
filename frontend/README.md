# Frontend (React)

## 日本語セクション

### 目的
`frontend/` は配信コメント管理ソフトウェアのクライアントアプリケーションです。リアルタイムでのコメント表示、モデレーション操作、分析結果の可視化を担当します。

### 主な責務
- React および Vite を用いたダッシュボード構築
- コメントリスト、モデレーション操作、通知などの UI 提供
- WebSocket を介したリアルタイム更新の反映
- モバイルおよびデスクトップ環境でのレスポンシブ対応
- Material-UI を利用したテーマ、アクセシビリティ設定

### セットアップ
1. `npm install`
2. `.env.example` を `.env` に複製し、必要に応じて以下を設定（バックエンドの既定ポートは3000）
   - `VITE_API_BASE_URL`: バックエンドのAPIベースURL（例: `http://localhost:3000/api`）
   - `VITE_SOCKET_URL`: socket.io の接続先（例: `http://localhost:3000`。コードが読むのはこのキーで、ハンドシェイクはHTTPのため `ws://` ではありません）
   - `VITE_ENABLE_MSW`: `true` で開発用モックサーバーを有効化（任意）
3. `npm run dev`

### ディレクトリ概要
- `src/components/` UI コンポーネント
- `src/pages/` 画面単位のコンテナ
- `src/hooks/` カスタムフック
- `src/services/` API クライアント
- `src/context/` グローバルステートとテーマ管理

---

## English Section

### Purpose
The `frontend/` directory delivers the client application for the comment management platform. It renders live chat data, exposes moderation controls, and visualizes analytics for stream operators.

### Core Responsibilities
- Build the dashboard using React and Vite
- Provide user interfaces for comment feeds, moderation commands, and notifications
- Apply real-time updates through WebSocket integrations
- Maintain responsive layouts for desktop and mobile environments
- Leverage Material-UI for theming and accessibility configuration

### Setup
1. Run `npm install`
2. Copy `.env.example` to `.env` and adjust as needed (the backend defaults to port 3000):
   - `VITE_API_BASE_URL`: Base URL of the backend API (e.g., `http://localhost:3000/api`)
   - `VITE_SOCKET_URL`: socket.io endpoint (e.g., `http://localhost:3000`; this is the key the code reads, and the handshake is HTTP, not `ws://`)
   - `VITE_ENABLE_MSW`: set to `true` to enable the development mock server (optional)
3. Run `npm run dev`

### Directory Overview
- `src/components/`: Reusable UI components
- `src/pages/`: Page-level containers
- `src/hooks/`: Custom hooks
- `src/services/`: API clients
- `src/context/`: Global state and theming utilities
