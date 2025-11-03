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
2. `npm run dev`
3. `.env` に以下を設定
   - `VITE_API_BASE_URL`: バックエンドのAPIベースURL（例: `http://localhost:4000/api`）
   - `VITE_WS_URL`: WebSocket 接続先（例: `ws://localhost:4000`）
   - 必要に応じて `VITE_THEME_DEFAULT` など追加設定

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
2. Run `npm run dev`
3. Configure `.env` with:
   - `VITE_API_BASE_URL`: Base URL of the backend API (e.g., `http://localhost:4000/api`)
   - `VITE_WS_URL`: WebSocket endpoint (e.g., `ws://localhost:4000`)
   - Optional entries such as `VITE_THEME_DEFAULT`

### Directory Overview
- `src/components/`: Reusable UI components
- `src/pages/`: Page-level containers
- `src/hooks/`: Custom hooks
- `src/services/`: API clients
- `src/context/`: Global state and theming utilities
