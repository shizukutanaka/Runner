# YouTube & Twitch統合ライブコメント管理システム

エンタープライズレベルのライブストリーミングコメント統合管理プラットフォーム。YouTubeとTwitchのリアルタイムコメントを一元管理し、効率的なモデレーションと分析を実現します。

Enterprise-grade live streaming comment management platform that unifies YouTube and Twitch real-time chat operations for efficient moderation and analytics.

## 製品概要

**Runner**は、プロフェッショナルなライブストリーミング運用チームのための包括的なコメント管理ソリューションです。複数プラットフォームのコメントを統合し、AIを活用した自動モデレーション、リアルタイム監視、詳細な分析機能を提供します。

**Runner** is a comprehensive comment management solution for professional live streaming operations teams, providing unified multi-platform comment handling, AI-powered automated moderation, real-time monitoring, and detailed analytics.

## 目次

- [主な機能](#主な機能)
- [対象ユーザー](#対象ユーザー)
- [システム要件](#システム要件)
- [クイックスタートガイド](#クイックスタートガイド)
- [インストール手順](#インストール手順)
- [設定ガイド](#設定ガイド)
- [使用方法](#使用方法)
- [トラブルシューティング](#トラブルシューティング)
- [ユーザーガイド](#ユーザーガイド--user-guide)
- [APIドキュメント](#apiドキュメント)
- [技術仕様](#技術仕様)
- [サポート情報](#サポート情報)
- [ライセンス](#ライセンス)

## 主な機能

### 個人使用向け最適化 / Personal Use Optimization
- **簡単セットアップ**: ワンコマンドで完全なセキュリティ設定
- **プリセット構成**: High Security / Balanced / Local-First から選択
- **デバイス管理**: 信頼済みデバイスの自動登録と管理
- **プライバシー優先**: 最小限の外部依存、ローカルファーストアーキテクチャ

### AI搭載モデレーションシステム
- **自動コメントフィルタリング**: 機械学習による不適切コメントの自動検知・ブロック
- **リスクスコアリング**: 各コメントにリスクレベルを自動算出
- **カスタムルールエンジン**: ユーザー定義のフィルタリングルール適用
- **リアルタイム処理**: コメント投稿と同時に即時判定・対応

### 統合分析ダッシュボード
- **クロスプラットフォーム統計**: YouTubeとTwitchの統合メトリクス表示
- **リアルタイムチャート**: コメント数、ユーザーアクティビティのライブ更新
- **エクスポート機能**: CSV/PDF形式でのデータ出力
- **カスタムレポート**: ユーザー定義の分析レポート作成

### 多言語サポート / Multi-language Support
- **国際化対応**: 日本語・英語を含む多言語UIとメッセージ
- **言語自動検知**: ユーザーのブラウザ設定に基づく言語自動選択
- **拡張可能な言語パック**: 新しい言語の追加が容易な構造
- **デバイスフィンガープリント / Device fingerprinting**: 自動デバイス識別と信頼管理
- **IPホワイトリスト / IP whitelisting**: 個人用・グローバルホワイトリスト
- **セッション管理 / Session management**: 乗っ取り検出、自動ログアウト
- **不審な活動検出 / Suspicious activity detection**: AIベースの異常行動検知
- **ロールベースアクセス制御 / Role-based access control**: 管理者・モデレーター・視聴者権限の詳細設定
- **監査ログ / Audit logging**: 全操作の詳細ログ記録と追跡（クリティカル操作のリアルタイムアラート対応）
- **分散レートリミット / Distributed rate limiting**: Redis連携によるマルチノード共有レート制限
- **暗号化通信 / Encrypted transport**: HTTPSとWSSによるセキュア通信
- **Webhookセキュリティ / Webhook security**: HMAC署名検証、リプレイ攻撃防止
- **データ保護 / Data protection**: GDPR準拠の個人情報保護機能（同意管理、データ削除権、匿名化）

### 多言語・国際化対応 / Multilingual & Internationalization
- **15言語完全対応 / Full support for 15 languages**: 主要国際言語をネイティブ品質でサポート（順次追加予定）
- **自動翻訳生成 / Automatic translation generation**: Google Translate APIによる翻訳ファイル自動生成
- **動的言語読み込み / Dynamic language loading**: 必要な言語のみを読み込み（パフォーマンス最適化）
- **ブラウザ言語自動検出 / Auto browser language detection**: ユーザーの言語設定を自動認識
- **RTL言語完全対応 / Full RTL language support**: アラビア語・ヘブライ語などの右から左への言語
- **翻訳管理ツール / Translation management tools**: 統計・品質チェック・同期機能
- **言語固有フォント / Language-specific fonts**: 各言語に最適化されたフォント設定
- **地域設定対応 / Regional settings**: タイムゾーン・言語設定の自動適応
- **ユニバーサルエンコーディング / Universal encoding**: UTF-8ベースの文字コード完全対応

#### 対応言語 / Supported Languages
- **アジア言語**: 日本語、日本語、中国語（簡体/繁体）、韓国語、ヒンディー語、タイ語、ベトナム語、インドネシア語、トルコ語
- **欧米言語**: 英語、スペイン語、フランス語、ドイツ語、ポルトガル語（ブラジル）、ロシア語
- **RTL言語**: アラビア語、ヘブライ語、ペルシャ語、ウルドゥー語
- **その他**: 追加言語は翻訳生成ツールで簡単に追加可能

#### 翻訳管理コマンド / Translation Management Commands
```bash
# 翻訳統計を表示
npm run translation-stats

# 欠落翻訳レポートを表示
npm run translation-missing

# 翻訳品質チェック
npm run translation-quality

# 翻訳ファイルの同期
npm run translation-sync

# 新しい言語の翻訳を生成
npm run generate-translations
```

### ユーザーインターフェース / User Interface
- **リアルタイムアラートバナー / Real-time alert banner**: 重大監視イベントを即時通知
- **レスポンシブデザイン / Responsive design**: デスクトップ・タブレット・モバイル対応
- **ダークモード / Dark mode**: 目の疲れを軽減するテーマ
- **キーボードショートカット / Keyboard shortcuts**: 効率的な操作のためのホットキーサポート
- **アクセシビリティ / Accessibility**: WCAG準拠のアクセシビリティ機能

## 対象ユーザー

### 個人ユーザー（新規対応）
自宅やオフィスでの個人使用に最適化。ワンコマンドセットアップ、自動セキュリティ設定、プライバシー優先設計により、技術知識が少なくても安全に運用できます。

### 配信者・クリエイターチーム
大規模なライブ配信を運営するチームに最適。数百・数千規模のコメントを効率的に処理し、配信者の負担を最小化します。

### 企業・組織
コンプライアンス要件の厳しい企業イベントや社内配信に。監査ログとアクセス制御で法的要件を満たします。

### コミュニティマネージャー
複数プラットフォームを横断的に管理。統合統計でコミュニティの健全性を包括的に把握できます。

### 公的機関・政府関連
国家レベルの重要イベントや公的配信に。最高水準のセキュリティと信頼性を提供します。

## システム要件

| 項目 | 最小要件 | 推奨要件 |
|------|----------|----------|
| **OS** | Windows 10 / macOS 10.15 / Ubuntu 18.04 | Windows 11 / macOS 12 / Ubuntu 20.04 |
| **CPU** | 2コア | 4コア以上 |
| **メモリ** | 4GB | 8GB以上 |
| **ストレージ** | 2GB空き容量 | 10GB以上（ログ・バックアップ考慮） |
| **ネットワーク** | 10Mbps以上 | 100Mbps以上（高負荷時） |
| **ブラウザ** | Chrome 90+ / Firefox 88+ / Safari 14+ / Edge 90+ | 最新安定版 |

## クイックスタートガイド

### 個人使用向けセットアップ（推奨）

最も簡単で安全なセットアップ方法です：

```bash
# リポジトリのクローン
git clone https://github.com/shizukutanaka/Runner.git
cd Runner

# 自動セットアップスクリプトを実行（High Securityプリセット）
chmod +x scripts/personal-setup.sh
./scripts/personal-setup.sh highSecurity

# APIキーを追加（backend/.envファイルを編集）
# YOUTUBE_API_KEY=your_key
# TWITCH_CLIENT_ID=your_id
# TWITCH_CLIENT_SECRET=your_secret

# サービス起動
cd backend && npm start &
cd ../frontend && npm run dev
```

詳細は [個人利用ガイド](./PERSONAL_USE_GUIDE.md) を参照してください。

### 開発環境セットアップ

#### 1. リポジトリのクローン
```bash
git clone https://github.com/shizukutanaka/Runner.git
cd Runner
```

#### 2. バックエンドセットアップ
```bash
cd backend

# 依存関係のインストール
npm install

# 環境設定ファイルの作成
cp .env.example .env

# データベース初期化
npm run db:init

# 開発サーバー起動
npm run dev
```

#### 3. フロントエンドセットアップ
```bash
cd ../frontend

# 依存関係のインストール
npm install

# 環境設定ファイルの作成
cp .env.example .env

# 開発サーバー起動
npm run dev
```

#### 4. 初期設定
ブラウザで `http://localhost:5173` にアクセスし、初期設定ウィザードに従ってください。

**重要**: 初回起動前に `.env` ファイルの設定を確認してください。特に以下の項目は必須です：
- `YOUTUBE_API_KEY`: YouTube Data APIキー
- `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET`: Twitch API認証情報
- `JWT_SECRET`: 32文字以上のランダム文字列（`openssl rand -hex 32`で生成）
- `SESSION_SECRET`: 32文字以上のランダム文字列（`openssl rand -hex 32`で生成）

### 本番環境デプロイメント

#### Dockerを使用したデプロイ

```bash
# 環境変数設定
cp .env.example .env
# .envファイルを編集して本番環境の設定を行ってください

# Docker Composeで起動
docker-compose up -d

# ログ確認
docker-compose logs -f

# 状態確認
docker-compose ps
```

#### Kubernetesデプロイメント

```bash
# Secret作成
kubectl create secret generic comment-manager-secrets \
  --from-literal=jwt-secret=$(openssl rand -hex 32) \
  --from-literal=session-secret=$(openssl rand -hex 32) \
  --from-literal=openai-api-key=your-key

# リソースデプロイ
kubectl apply -f k8s/

# デプロイ確認
kubectl get pods
kubectl get services
```

詳細は [`DEPLOYMENT_GUIDE.md`](DEPLOYMENT_GUIDE.md) を参照してください。

## インストール手順

### 詳細インストールガイド

#### ステップ1: 必要なソフトウェアの確認
- **Node.js**: バージョン18.0.0以上をインストールしてください
- **Git**: 最新バージョンをインストールしてください
- **テキストエディタ**: VS Codeなどの開発環境を準備してください

#### ステップ2: リポジトリのクローンとセットアップ
```bash
# リポジトリのクローン
git clone https://github.com/shizukutanaka/Runner.git
cd Runner

# サブモジュール初期化（必要な場合）
git submodule update --init --recursive
```

#### ステップ3: バックエンドセットアップ詳細
```bash
cd backend

# パッケージインストール（初回のみ）
npm ci

# 開発依存関係インストール（開発時のみ）
npm install

# 環境設定
cp .env.example .env
# .envファイルを編集し、必要なAPIキーを設定してください

# データベース初期化
npm run db:init

# マイグレーション実行（データベース更新時）
npm run db:migrate

# 環境チェック（必須設定の確認）
npm run env:check
```

#### ステップ4: フロントエンドセットアップ詳細
```bash
cd ../frontend

# パッケージインストール
npm install

# 環境設定
cp .env.example .env
# .envファイルを編集し、バックエンドのURLを設定してください

# ビルド確認（オプション）
npm run build
```

#### ステップ5: システムの起動確認
```bash
# バックエンド起動
cd backend
npm run dev

# 別のターミナルでフロントエンド起動
cd frontend
npm run dev
```

#### ステップ6: 初期設定と動作確認
1. ブラウザで `http://localhost:3000` にアクセス
2. 初期設定ウィザードが表示されたら、案内に従ってセットアップを完了してください
3. サンプルコメントを追加してシステムが正常に動作することを確認してください

## 設定ガイド

### 環境変数設定詳細

#### バックエンド設定（backend/.env）
```bash
# 必須設定項目
# JWT_SECRET には 32 文字以上のランダム文字列を設定してください
JWT_SECRET=
# YOUTUBE_API_KEY には有効な YouTube Data API v3 キーを設定してください
YOUTUBE_API_KEY=
# TWITCH_CLIENT_ID / SECRET には有効な Twitch アプリ資格情報を設定してください
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

# オプション設定項目
# OPENAI_API_KEY を設定すると AI モデレーションが有効になります
OPENAI_API_KEY=
# SESSION_SECRET を指定するとセッション暗号化キーを上書きできます（未設定時は開発用デフォルトを使用）
SESSION_SECRET=
# ENCRYPTION_KEY には 32 文字以上のランダム文字列を設定してください
ENCRYPTION_KEY=
DATABASE_URL=sqlite:./data/database.sqlite
REDIS_URL=redis://localhost:6379
LOG_LEVEL=info

# レートリミット設定
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

# セッションストア設定
# SESSION_STORE=redis
# SESSION_REDIS_URL=redis://localhost:6379
# SESSION_REDIS_PREFIX=runner:sess:
# SESSION_COOKIE_DOMAIN=example.com
# SESSION_ROLLING=true

# セキュリティ設定
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# パフォーマンス設定
CACHE_TTL=300
MAX_CONNECTIONS=1000
```

#### フロントエンド設定（frontend/.env）
```bash
# 必須設定項目
VITE_API_BASE_URL=http://localhost:4000/api
VITE_WS_URL=ws://localhost:4000

# オプション設定項目
VITE_APP_TITLE=Runner - Comment Management System
VITE_DEFAULT_LANGUAGE=ja
VITE_ENABLE_ANALYTICS=false
```

### APIキー取得方法

#### YouTube Data API v3キー取得
1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成または既存のプロジェクトを選択
3. 「APIとサービス」→「ライブラリ」から「YouTube Data API v3」を有効化
4. 「認証情報」→「認証情報を作成」→「APIキー」を選択
5. 作成されたAPIキーをコピーして `.env` ファイルに設定

#### Twitch APIキー取得
1. [Twitch Developer Console](https://dev.twitch.tv/console)にアクセス
2. アカウントにログインしてアプリケーションを登録
3. 「アプリケーションを新規登録」から新しいアプリケーションを作成
4. 作成されたClient IDとClient Secretをコピーして `.env` ファイルに設定

## 使用方法

日常運用の詳細手順は `USER_GUIDE.md` に整理しています。必要に応じて本節と併読してください。
Detailed daily procedures are compiled in `USER_GUIDE.md`; review it alongside this overview.

### 基本操作ガイド

#### ダッシュボードの操作
1. **ログイン**: 管理者アカウントでシステムにログインしてください
2. **プラットフォーム接続**: YouTube/Twitchアカウントを連携してください
3. **コメント監視**: リアルタイムでコメントが表示されます
4. **モデレーション**: リスクの高いコメントに適切な対応をしてください

#### 高度な機能の活用
- **AIモデレーション設定**: カスタムルールの設定と調整
- **分析レポート作成**: カスタム期間・指標でのレポート生成
- **ユーザー管理**: モデレーター権限の設定と管理
- **システム設定**: 言語・タイムゾーン・表示設定のカスタマイズ

### 運用Tips
- **定期バックアップ**: `npm run backup:create` で定期的にバックアップを実行してください
- **ログ確認**: ` npm run logs:tail` でリアルタイムログを確認してください
- **パフォーマンス監視**: `npm run health:check` でシステム状態を定期的に確認してください
- **セキュリティ更新**: `npm run security:check` でセキュリティ状態を確認してください

## トラブルシューティング

### よくある問題と解決方法

#### インストール時の問題
**問題**: `npm install` が失敗する
**解決**:
```bash
# Node.jsバージョンを確認してください
node --version

# パッケージマネージャーを最新版に更新してください
npm install -g npm@latest

# キャッシュをクリアして再試行してください
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
```

**問題**: データベース初期化エラー
**解決**:
```bash
# データベースファイルの権限を確認してください
ls -la backend/data/

# データベースをリセットしてください
rm -f backend/data/database.sqlite
npm run db:init
```

#### 実行時の問題
**問題**: バックエンドが起動しない
**解決**:
```bash
# ポート4000が使用中でないか確認してください
lsof -i :4000

# 環境変数の設定を確認してください
npm run env:check

# ログファイルを確認してください
npm run logs:tail
```

**問題**: フロントエンドがAPIに接続できない
**解決**:
```bash
# バックエンドが正常に起動しているか確認してください
curl http://localhost:4000/api/health

# 環境変数を確認してください
cat frontend/.env

# ブラウザの開発者ツールでネットワークタブを確認してください
```

#### パフォーマンスの問題
**問題**: システムが重い・遅い
**解決**:
```bash
# システムリソースを確認してください
npm run health:check

# ログローテーションを実行してください
npm run logs:clear

# データベースを最適化してください
npm run db:optimize
```

### エラーログの見方
ログファイルは `backend/logs/` に保存されます。重要なエラーは以下のカテゴリで分類されます：

- **ERROR**: システムエラー（即時対応必要）
- **WARN**: 警告（注意喚起）
- **INFO**: 情報メッセージ（通常運用情報）

### サポート連絡先
問題が解決しない場合は、以下の情報を添えてサポートまでお問い合わせください：

1. エラーメッセージ全文
2. 使用環境（OS、Node.jsバージョン）
3. 実行したコマンドの履歴
4. ログファイルの該当部分

## APIドキュメント

## ユーザーガイド / User Guide

詳細な操作手順と運用ベストプラクティスは [`USER_GUIDE.md`](USER_GUIDE.md) を参照してください。
For a comprehensive bilingual walkthrough of daily operations, refer to [`USER_GUIDE.md`](USER_GUIDE.md).

詳細なAPI仕様は [`API_DOCUMENTATION.md`](API_DOCUMENTATION.md) を参照してください。

### 詳細機能ガイド / Detailed Feature Guide

#### ダッシュボード / Dashboard
- **アクティブコメント数 / Active comments**: 現在表示中のコメント件数をリアルタイム表示します。
- **モデレーション済み / Moderated**: AIまたは人手で処理済みのコメント件数です。
- **ブロック済み / Blocked**: フィルタリングされたコメントを集計します。
- **視聴者数 / Viewers**: 接続プラットフォームから取得した視聴者数を表示します。
- **重大アラートバナー / Critical alerts banner**: `backend/src/middleware/monitoring.js` が検出した重要イベントを通知します。

#### コメント管理 / Comment Management
- **最新コメントを自動取得し、秒単位で更新します**
- **プラットフォーム別と状態別のフィルタを提供します**
- **右下の接続ステータスチップで WebSocket 接続と再接続回数を確認できます**

#### コメント操作 / Actions
- **ピン固定 / Pin**: 指定コメントを一覧上部へ固定します。
- **ハイライト / Highlight**: コメントに視覚的な強調スタイルを適用します。
- **タグ付け / Tagging**: コメントをカテゴリ別に整理します。
- **モデレーション / Moderate**: コメントの承認・非承認・保留を実行します。

#### キーボードショートカット / Keyboard Shortcuts
- `Ctrl+K`: コメント検索
- `Ctrl+M`: モデレーションパネル表示
- `Ctrl+S`: 設定画面表示
- `F5`: 画面の手動更新

#### ユーザー管理 / User Management
- **コメント投稿ユーザーを一覧表示します**
- **各ユーザーの投稿履歴とステータスを確認できます**
- **ミュート / Mute**: 指定期間コメント投稿を抑制します
- **ブロック / Block**: コメント投稿を恒久的に禁止します
- **権限付与 / Grant role**: モデレーターや管理者権限を設定します

#### AIモデレーション / AI Moderation
- **自動判定 / Automatic Evaluation**: スパム、暴言、広告などを自動判定します
- **カスタムルール / Custom Rules**: NGワードや正規表現ルールを組み合わせて制御できます

#### 統計分析 / Analytics
- **リアルタイム統計 / Real-time statistics**: コメント数、ユーザー数、モデレーション結果をリアルタイム集計します
- **レート制限統計 / Rate limit summary**: Redis 共有ストアでの API と重要操作のレート制限状況を追跡します
- **人気トピック / Trending topics**: キーワード出現頻度を集計します

### トラブルシューティング / Troubleshooting

#### 起動時の問題 / Startup Issues
**アプリケーションが起動しない / Application fails to start**
1. システム要件を確認します。
2. インストールファイルを再ダウンロードします。
3. セキュリティソフトの例外設定を確認します。
4. ログファイル `logs/app.log` を確認します。

**API接続エラー / API connectivity error**
1. API キー設定を再確認します。
2. ネットワーク接続状態を確認します。
3. ファイアウォール設定を確認します。
4. 外部 API の稼働状況を確認します。

#### コメント取得の問題 / Comment Retrieval
**コメントが表示されない / Comments not shown**
1. プラットフォーム設定を確認します。
2. API キーの有効性を確認します。
3. チャンネル ID またはユーザー名を再確認します。
4. 配信が開始されているかを確認します。

**リアルタイム更新が機能しない / Real-time updates fail**
1. WebSocket 接続状況を確認します。
2. ブラウザ設定を確認します。
3. ファイアウォール設定を確認します。
4. ネットワークの安定性を確認します。

#### パフォーマンスの問題 / Performance Issues
**アプリケーションが重い / Application is slow**
1. メモリ使用量を確認します。
2. 不要プロセスを停止します。
3. キャッシュを削除します。
4. 処理件数設定を調整します。

**コメント処理が遅い / Comment processing lag**
1. モデレーション設定を調整します。
2. ハードウェア仕様を確認します。
3. ネットワーク速度を確認します。
4. バックグラウンドプロセスを確認します。

#### 設定関連の問題 / Configuration Issues
**設定が保存されない / Settings not saved**
1. 書き込み権限を確認します。
2. 設定ファイルの保存先を確認します。
3. アプリケーションを再起動します。
4. ブラウザキャッシュを削除します。

**.env 検証が失敗する / .env validation fails**
1. `npm run env:check` の結果を確認し、`needs-attention` や `missing` がないか確認します。
2. プレースホルダー値 (`your-...`, `sample`, `example`) を実値に置き換えます。
3. `JWT_SECRET`、`SESSION_SECRET`、`ENCRYPTION_KEY` を32文字以上のランダム文字列に設定します。
4. `VITE_API_BASE_URL` は `http(s)://`、`VITE_WS_URL` は `ws(s)://` で始まる完全な URL を指定します。
5. Twitch/YouTube 資格情報の有効性を再確認します。
6. 修正後に再度 `npm run env:check` を実行し、サマリーが `OK` であることを確認します。

### FAQ
**Q: サポートされている言語は何ですか？ / Which languages are supported?**
A: UI は10言語以上、コメント翻訳は20言語以上に対応しています。最新情報は `frontend/src/i18n/` の定義を確認してください。

**Q: 無料で使用できますか？ / Is it free to use?**
A: 基本機能は無料で提供します。有償サポートとプレミアム版の提供予定はありません。

**Q: システムの更新方法は？ / How do I update the system?**
A: 自動更新が有効な場合はバックグラウンドで更新されます。手動更新は GitHub リポジトリから最新版を取得してください。

## 技術仕様

### 最新改善点 (2025更新)

- **多言語対応システムの完全刷新**: 15言語完全対応、動的言語読み込み、翻訳管理ツール
- **AIモデレーション精度向上**: 多言語コメントの文脈理解を強化
- **リアルタイム性能最適化**: WebSocket接続の安定性向上、メモリ使用量30%削減
- **セキュリティ強化**: デバイスフィンガープリント、IPホワイトリスト、セッション管理
- **ユーザーエクスペリエンス向上**: RTL言語完全対応、言語固有フォント、アクセシビリティ改善
- **開発効率向上**: 翻訳生成ツール、品質チェックツール、自動同期機能

### アーキテクチャ
- **バックエンド**: Node.js 18+ + Express 5.x + Socket.IO 4.x
- **フロントエンド**: React 18+ + Material-UI 5.x + Vite 5.x
- **データベース**: SQLite 3.x（開発）/ PostgreSQL 14+（本番推奨）
- **キャッシュ**: Redis 7.x（セッション・レート制限対応）
- **認証**: JWT + リフレッシュトークン方式（トークンローテーション対応）
- **コンテナ**: Docker + Kubernetes対応
- **監視**: Prometheus + Grafana統合

### セキュリティ機能

#### 個人使用向けセキュリティ機能
- **二要素認証 (2FA)**: TOTPベース（Google Authenticator、Authy対応）
- **デバイス管理**: デバイスフィンガープリントによる自動識別と信頼デバイス登録
- **IPホワイトリスト**: 個人用・グローバルホワイトリストによるアクセス制御
- **セッション管理**: 乗っ取り検出と自動ログアウト機能
- **不審活動検出**: AIベースの異常行動検知と自動対応

#### 技術的セキュリティ対策
- **CSRF保護**: トークンベースCSRF防御とトークンローテーション
- **SQL インジェクション対策**: パラメータ化クエリと入力検証
- **XSS 防御**: 厳格なサニタイゼーションとCSPヘッダー
- **データ暗号化**: AES-256暗号化による機密データ保護
- **入力検証**: Joiスキーマによる包括的バリデーション
- **レート制限**: Redis分散型レート制限（DDoS対策）
- **CORS保護**: オリジン検証とクレデンシャル管理
- **監査ログ**: 全操作の追跡可能な監査証跡
- **セキュアヘッダー**: Helmet.jsによるセキュリティヘッダー設定

### データ管理機能
- **ローカルストレージ最適化**: gzip圧縮とAES-256-GCM暗号化
- **自動バックアップ**: 日次スケジュールと暗号化バックアップ
- **GDPR準拠**: 同意管理、データ削除権、匿名化機能
- **キャッシュ管理**: LRUアルゴリズムによる効率的なキャッシュ運用

### パフォーマンス最適化
- **データベース接続プール**: 最大5接続の効率的なプーリング
- **クエリキャッシング**: 自動クエリ最適化とキャッシュ
- **レスポンスキャッシング**: API応答の自動キャッシング（1分TTL）
- **WebSocket最適化**: 自動再接続とエクスポネンシャルバックオフ
- **同時接続数**: 最大10,000接続（適切なインフラ環境下）
- **レスポンスタイム**: 平均100ms未満（通常運用時）
- **スループット**: 1秒あたり1,000コメント処理可能
- **メモリ使用量**: ベース512MB + ユーザーセッション分

### 運用機能
- **自動バックアップ**: 日次自動バックアップ（最大30世代保持）
- **ヘルスチェック**: /health エンドポイントによる死活監視
- **メトリクス**: Prometheusメトリクスエクスポート
- **ログ管理**: Winston による構造化ログ（日次ローテーション）
- **グレースフルシャットダウン**: 安全なプロセス終了処理

## サポート情報 / Support Information

### コミュニティサポート
- **GitHub Issues**: バグ報告・機能リクエスト
- **ディスカッションフォーラム**: ユーザー間での情報共有
- **ドキュメント**: 詳細な技術ドキュメントとガイド

### サポートポリシー
- **無料サポート**: GitHub Issuesを通じたコミュニティサポート
- **優先サポート**: コントリビューター向け優先対応
- **商用サポート**: 提供なし（オープンソースプロジェクトのため）

### コントリビューション
プロジェクトの改善に貢献いただける方は、以下のガイドラインに従ってください：

1. Issueを作成して変更内容を説明してください
2. Forkして開発ブランチを作成してください
3. テストを追加・更新してください
4. Pull Requestを作成してください

## ライセンス / License