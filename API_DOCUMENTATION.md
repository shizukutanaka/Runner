# API ドキュメント / API Reference

## 概要 / Overview

- **目的 / Purpose** 複数プラットフォームのライブコメントを統合管理する Runner バックエンドの REST API を説明します。
- **対象読者 / Audience** 運用担当者、インテグレーター、フロントエンド開発者。
- **更新方針 / Maintenance** 実装済みのエンドポイントのみを掲載し、実装と差分が生じた場合は速やかに本書を更新します。

## 基本情報 / Fundamentals

- **ベース URL / Base URL** `http://localhost:4000/api`
- **プロトコル / Protocols** HTTPS 推奨。開発環境では HTTP で動作します。
- **認証 / Authentication** `Authorization: Bearer <token>` を送信します。`backend/src/middleware/auth.js` の `authenticateToken()` が検証し、`requireRole()` で権限を確認します。開発モードではトークン未指定時に管理者相当で通過します。
- **共通レスポンス形式 / Common Response Format**
  ```json
  {
    "status": 200,
    "data": {},
    "message": "説明文",
    "details": {}
  }
  ```
- **エラー構造 / Error Structure** `backend/src/middleware/errorHandler.js` により次の JSON を返します。
  ```json
  {
    "error": {
      "status": 400,
      "type": "validation_error",
      "message": "説明文",
      "requestId": "req-identifier",
      "timestamp": "2025-01-01T00:00:00.000Z",
      "correlationId": "optional-correlation",
      "details": {},
      "retryable": false,
      "retryAfter": 0
    }
  }
  ```
  - **必須フィールド / Required fields** `status`, `type`, `message`, `requestId`, `timestamp`
  - **任意フィールド / Optional fields** `details` (バリデーション情報など), `correlationId` (分散トレーシング), `retryable`/`retryAfter` (復旧予測)
  - **HTTP ステータス / Status mapping** バリデーションエラーは 400、未認証は 401、権限不足は 403、未検出は 404、レート制限は 429、外部依存や内部障害は 5xx を返します。
- **レート制限 / Rate Limiting** `generalRateLimit` と `apiRateLimit` が適用されます。大量アクセス時は 429 を返します。

## コメント API / Comments API (`backend/src/routes/comments.js`)

- **GET `/api/comments`** コメントの一覧取得 / Fetch comment list
  - **権限 / Role** `moderator`
  - **クエリ / Query** `platform`, `status`, `limit` (≤200), `offset`, `search`
  - **レスポンス例 / Sample response**
    ```json
    {
      "status": 200,
      "data": {
        "items": [
          {
            "id": 1,
            "content": "sample",
            "platform": "youtube",
            "presentation": {
              "highlight": false,
              "pinned": false
            }
          }
        ],
        "pagination": {
          "total": 120,
          "limit": 50,
          "offset": 0
        }
      },
      "message": "Comments fetched"
    }
    ```
- **POST `/api/comments`** コメント登録 / Create comment
  - **ボディ / Body** `content`, `user`, `platform`
  - AI モデレーションにより拒否される場合は 422。
- **PUT `/api/comments/:id`** ステータス更新 / Update moderation status
  - **ボディ / Body** `action` (例: `hidden`), `reason`
- **POST `/api/comments/summary`** コメント要約 / Summarise comments
  - **ボディ / Body** `comments[]` (content, user, platform)
- **POST `/api/comments/auto-answer`** 自動応答候補 / Auto answer suggestion
  - **ボディ / Body** `comment`, `context[]`
- **PUT `/api/comments/:id/avatar`** アバター設定 / Set avatar URL
  - **ボディ / Body** `avatarUrl`
- **PUT `/api/comments/:id/background`** 背景色設定 / Set background color
  - **ボディ / Body** `color`
- **PUT `/api/comments/:id/highlight`** ハイライト切替 / Toggle highlight
  - **ボディ / Body** `highlight` (boolean)
- **PUT `/api/comments/:id/pin`** ピン固定 / Toggle pin
  - **ボディ / Body** `pinned` (boolean)
- **PUT `/api/comments/:id/auto-archive`** 自動アーカイブ / Toggle auto archive
- **PUT `/api/comments/:id/external-share`** 外部共有 / Toggle external share
- **GET `/api/comments/:id/edit-history`** 編集履歴 / Fetch edit history
- **PUT `/api/comments/:id/notification-frequency`** 通知頻度 / Set notification frequency
- **GET `/api/comments/:id`** コメント単体取得 / Get a single comment (`moderator`。無ければ404)
- **DELETE `/api/comments/:id`** コメント削除（ソフトデリート） / Soft-delete a comment (`moderator`)
  - **ボディ / Body** `reason`, `reasonCategory`（`spam`/`harassment`/`hate_speech`/`inappropriate_content`/`off_topic`/`duplicate`/`bot_activity`/`violation_rules`/`other`）, `evidence`, `reasonText`
  - `status='deleted'` にして理由を記録。YouTube由来はプラットフォーム側の削除も試み、結果を `platformDeletion` で返す（ローカル削除は書き戻しの成否に依らず成功）。
- **GET `/api/comments/:id/visibility`** 公開範囲取得 / Get visibility (`moderator`)
- **PUT `/api/comments/:id/visibility`** 公開範囲設定 / Set visibility (`moderator`)
  - **ボディ / Body** `visibility`（`public`/`followers`/`members`/`private`/`moderators`）, `allowedRoles[]`, `allowedUsers[]`, `expiresAt`, `reason`。変更前後を `comment_visibility_history` に記録。
- **GET `/api/comments/:id/visibility/history`** 公開範囲の変更履歴 / Visibility history (`moderator`。`limit`≤100, `offset`)
- **POST `/api/comments/visibility/batch`** 公開範囲の一括更新 / Batch visibility update (`moderator`)
  - **ボディ / Body** `updates[]`（1〜100件: `commentId`, `visibility`, …）, `reason`。存在しないIDはその要素だけ失敗。

## ユーザー API / Users API (`backend/src/routes/users.js`)

> すべてのユーザー API は JWT 認証が必須です。`authenticateToken()` の後、各ルートで `requireRole()` により権限を検証します。
> **例外**: `register`/`login`/`refresh`/`forgot-password`/`reset-password` は公開エンドポイントです。
> これらは `routes/auth.js` の実装ですが、そのルーターも `/api/users` にマウントされているためここに載せています。

- **POST `/api/users/register`** アカウント登録 / Register (公開)
  - **ボディ / Body** `username`(3〜100), `email`, `password`(12〜128、大小英字・数字・記号必須)
  - 最初の1人は `admin`、以降は `moderator`（判定は1本のSQLで行うため同時登録でも admin は1人）。成功201、重複409。
- **POST `/api/users/login`** ログイン / Log in (公開)
  - **ボディ / Body** `username`(ユーザー名またはメール), `password`。httpOnly Cookie を発行し、互換のため `token`/`refreshToken` も本文に含む。誤りは401、無効アカウントは403。
- **POST `/api/users/logout`** ログアウト / Log out (要認証。リフレッシュトークン無効化・Cookie削除)
- **POST `/api/users/refresh`** トークン再発行 / Refresh (公開。Cookieのリフレッシュトークンで認証、使い切りローテーション。無効401、無効アカウント403)
- **GET `/api/users/me`** 自分のアカウント情報 / Current account (要認証)
- **POST `/api/users/forgot-password`** リセット要求 / Request reset (公開。**ボディ** `email`。アカウントの有無に依らず同形の応答。SMTP設定時のみ送信し `emailDelivered` で示す。有効期限1時間)
- **POST `/api/users/reset-password`** リセット実行 / Complete reset (公開。**ボディ** `token`, `newPassword`。無効/期限切れ400。トークンは1回限りで、成功時に全リフレッシュトークンも失効)
- **POST `/api/users/enable-2fa`** TOTP設定開始 / Start 2FA setup (要認証。QRとBase32シークレットを返す。まだ有効化されない)
- **POST `/api/users/verify-2fa`** TOTP検証・有効化 / Verify 2FA (要認証。**ボディ** `code`(6桁)。失敗401)
- **GET `/api/users/accounts`** ダッシュボードアカウント一覧 / List dashboard accounts (`admin`。視聴者一覧 `GET /api/users` とは別物)
- **PUT `/api/users/accounts/:id/role`** 役割変更 / Change role (`admin`。**ボディ** `role`=`moderator`|`admin`。対象無し404。**最後のadminの格下げは409**)
- **PUT `/api/users/change-password`** 自分のパスワード変更 / Change own password (要認証。**ボディ** `currentPassword`, `newPassword`。現在値の不一致401。成功時に全リフレッシュトークン失効)
- **GET `/api/users`** 視聴者(プラットフォームユーザー)一覧 / List platform users (`moderator`。`platform`,`status`,`search`,`limit`≤200,`offset`)
- **GET `/api/users/:id/channel-activity`** チャンネル活動詳細 / Channel activity (`moderator`。`limit`,`offset`。無ければ404)
- **GET `/api/users/:id/timeout`** 有効なタイムアウト取得 / Active timeout (`moderator`。無ければ `data:null`)
- **POST `/api/users/:id/timeout`** タイムアウト付与 / Apply timeout (`moderator`)
  - **ボディ / Body** `duration`(60〜604800秒), `reason`, `platform`, `moderatorId`, `notes`。1ユーザー1件までで、既にあれば409。
- **DELETE `/api/users/:id/timeout`** タイムアウト解除 / Remove timeout (`moderator`。無ければ404)
- **GET `/api/users/:id/timeout-history`** タイムアウト履歴 / Timeout history (`moderator`)
- **GET `/api/users/timeouts/active`** 有効なタイムアウト一覧 / All active timeouts (`moderator`)
- **POST `/api/users/timeouts/cleanup`** 期限切れの一括整理 / Expire overdue timeouts (`admin`)

- **GET `/api/users/:id`** ユーザー取得 / Get user
  - **権限 / Role** `moderator`
- **PUT `/api/users/:id`** ステータス変更 / Update moderation status
  - **権限 / Role** `admin`
  - **ボディ / Body** `action` (`ban`/`mute`/`active`), `duration`, `reason`
- **GET `/api/users/:id/history`** 履歴取得 / Get history log
  - **権限 / Role** `moderator`
- **PUT `/api/users/:id/notification-frequency`** 通知頻度設定 / Set user notification frequency
  - **権限 / Role** `admin`
- **PUT `/api/users/:id/external-integration`** 外部連携設定 / Toggle integrations (`enabled` boolean)
  - **権限 / Role** `admin`
- **PUT `/api/users/:id/profile-image`** プロフィール画像 / Update profile image URL
  - **権限 / Role** `admin`
- **PUT `/api/users/:id/bio`** 自己紹介文 / Update biography (≤2000 chars)
  - **権限 / Role** `admin`
- **PUT `/api/users/:id/language`** 言語設定 / Set language (≤10 chars)
  - **権限 / Role** `admin`
- **PUT `/api/users/:id/timezone`** タイムゾーン / Set timezone (IANA TZ name)
  - **権限 / Role** `admin`
- **PUT `/api/users/:id/subscription`** サブスクリプション / Set subscription label/null
  - **権限 / Role** `admin`
- **GET `/api/users/:id/auth-history`** 認証履歴 / Fetch auth history
  - **権限 / Role** `moderator`
- **PUT `/api/users/:id/security`** セキュリティ設定 / Update `twoFactor`, `emailVerification`
  - **権限 / Role** `admin`

## モデレーション API / Moderation API (`backend/src/routes/moderation.js`)

- **POST `/api/moderation`** コメント評価 / Analyze comment
  - **ボディ / Body** `content`, `platform`, `user`, `timestamp`

### 翻訳 / Translation

- **POST `/api/moderation/translation/translate`** テキスト翻訳 / Translate text
- **POST `/api/moderation/translation/auto-translate`** 自動翻訳 / Auto-translate

### AIモデレーション / AI moderation

- **POST `/api/moderation/ai-moderation/analyze`** AI判定 / Analyze with AI
- **POST `/api/moderation/ai-moderation/multi-analyze`** 複数プロバイダ判定 / Multi-provider analysis

### AI判定しきい値 / AI thresholds

- **GET `/api/moderation/ai-threshold/comments/:id`** コメント単位のしきい値取得
- **PUT `/api/moderation/ai-threshold/comments/:id`** コメント単位のしきい値設定
- **PUT `/api/moderation/ai-threshold/users/:id`** ユーザー既定値の設定 (admin)
- **POST `/api/moderation/ai-threshold/batch`** 一括更新 (admin)

### 保留メッセージキュー / Held messages

- **GET `/api/moderation/held-messages`** 保留一覧 / List held messages
- **GET `/api/moderation/held-messages/stats`** 集計 / Statistics
- **PUT `/api/moderation/held-messages/:holdId`** 承認・却下 / Approve or reject
  - Twitch AutoMod 由来の保留（`source=twitch_automod`）は、承認で **ALLOW**、
    却下で **DENY** が Twitch へ送られる（削除ではない。まだ公開されていないため）
- **POST `/api/moderation/held-messages/bulk`** 一括処理 / Bulk process

> 以前ここには `/thresholds` `/auto-learning` `/switch-model` `/retrain`
> `/explanation` `/export` `/collect-banned-words` `/word-weights`
> `/banned-word-history` `/external-banned-words` `/translate-banned-words` も
> 記載されていたが、いずれもハードコード値を返すだけの実装だったため
> ルートごと削除済み（E-1）。上記は実在するエンドポイントのみ。

## 通知 API / Notifications API (`backend/src/routes/notifications.js`)

- **GET `/api/notifications`** 通知取得 / List notifications
  - **クエリ / Query** `includeRead` (default `false`), `limit`, `offset`
- **POST `/api/notifications`** 通知作成 / Create notification (`title`, `message`, optional `type`, `level`, `metadata`)
- **PUT `/api/notifications/:id/read`** 既読化 / Mark as read
- **PUT `/api/notifications/read-all`** 全既読化 / Mark all as read
- **DELETE `/api/notifications/read`** 既読削除 / Delete read notifications
- **DELETE `/api/notifications/:id`** 通知削除 / Delete a notification
- **DELETE `/api/notifications`** 全削除 / Delete all notifications
- **GET / PUT `/api/notifications/settings`** 通知設定 / Notification settings
- **POST `/api/notifications/test`** テスト送信 / Send a test notification
- **GET / PUT `/api/notifications/users/:id/settings`** ユーザー別通知設定 / Per-user settings

## 分析 API / Analytics API (`backend/src/routes/analytics.js`)

- **GET `/api/analytics/stats`** 集計値 / Dashboard stats (キャッシュ 30 秒)
- **GET `/api/analytics/graph`** グラフ用データ / Graph data (キャッシュ 30 秒)
- **GET `/api/analytics/period-stats`** 期間集計 / Stats by period (`from`, `to`, などクエリ任意)
- **GET `/api/analytics/user/:id`** ユーザー別統計 / User stats
- **GET `/api/analytics/comment/:id`** コメント別統計 / Comment stats
- **GET `/api/analytics/moderation`** AI 判定統計 / Moderation metrics
- **GET `/api/analytics/export`** エクスポート / Export analytics data
- **POST `/api/analytics/import`** インポート / Import analytics payload
- **GET `/api/analytics/history`** 履歴取得 / Analytics history
- **GET `/api/analytics/moderation-actions`** 横断的なモデレーション操作履歴 / Cross-user moderation action history
  - **クエリ / Query** `limit`（1-200、既定50）
  - BAN については `platformApplied` がプラットフォームへの反映結果（`null` は記録が無い古い行）
- **POST `/api/analytics/external`** 外部連携 / External integration callback
- **GET `/api/analytics/usage`** 利用率 / Usage ratio
- **GET `/api/analytics/peak`** ピーク時間 / Peak usage time
- **GET `/api/analytics/trend`** トレンド / Trend direction
- **GET `/api/analytics/ranking`** ランキング / Ranking list
- **GET `/api/analytics/anomaly`** 異常検知 / Anomaly flag

現在はダミー値を返します。プロダクションでは実データソースへの接続が必要です。

## 設定 API / Settings API (`backend/src/routes/settings.js`)

- **GET `/api/settings/version`** アプリ情報 / Application information (認証不要)
- **GET `/api/settings/terms`** 利用規約 / Terms text (認証不要)
- **GET `/api/settings/help`** ヘルプ / Help (認証不要。中身は利用規約と同一で、ヘルプ固有の内容ではない)
- **GET `/api/settings/export`** 設定エクスポート / Export settings (admin)
  - **クエリ / Query** `format` (`json|yaml|toml`), `includeSensitive`
- **POST `/api/settings/import`** 設定インポート / Import settings (admin)
- **GET `/api/settings/user/:userId`** ユーザー設定取得 / Get user settings (admin)
- **PUT `/api/settings/user/:userId`** ユーザー設定更新 / Replace settings (admin)

### ユーザー単位の詳細操作 / User-scoped operations

特記なき限り権限は `admin`。ボディ項目は `validation/settings.js` に基づく。

- **PUT `/api/settings/user/:userId/theme`** テーマ設定 / Set theme
  - `theme`(`light|dark|system`)。トップレベル `settings.theme` を上書き（`user-theme` とは別物）
- **PUT `/api/settings/user/:userId/display`** 表示設定 / Display settings
  - 任意: `fontSize`,`density`,`theme`,`showAvatars`,`showImages`,`showVideos`,`showGifs`,`autoPlayMedia`,`reduceAnimations`,`highContrast`。未指定は既定値で補完し浅くマージ
- **PUT `/api/settings/user/:userId/layout`** レイアウト / Layout
  - `layout`(`default|compact|spacious|custom`、それ以外400)
- **PUT `/api/settings/user/:userId/notifications`** 個人の通知設定 / Personal notifications
  - `enabled`(必須),`email`,`push`,`sound`,`frequency`(`real-time|hourly|daily|weekly`),`preferences.*`。`settings.notifications` を丸ごと置換（`notification-settings` とは別）
- **PUT `/api/settings/user/:userId/default-language`** 既定言語 / Default language
  - `language`(`en|ja`)。`settings.default_language` に保存
- **PUT `/api/settings/user/:userId/timezone`** タイムゾーン / Timezone
  - `timezone`(IANA名、≤50文字。無効は400)
- **PUT `/api/settings/user/:userId/admin-email`** 管理者メール / Admin email
  - `adminEmail`(メール形式)
- **PUT `/api/settings/user/:userId/api-keys`** APIキー管理 / API keys
  - `action`(`create|revoke|list|update`),`keyName`,`permissions`(`read|write|admin`),`expiresIn`(秒)。`create` は32バイトのキーを生成して返す。`list` は実キー値を返さない
- **PUT `/api/settings/user/:userId/external-integration`** 外部連携 / External integration
  - `service`(`slack|discord|google|microsoft|github|twitter`),`action`(`connect|disconnect|update`),`credentials`。`settings.integrations[service]` を上書き
- **PUT `/api/settings/user/:userId/ui-custom`** UIカスタム / UI customization
  - `primaryColor`,`secondaryColor`,`fontFamily`,`customCSS`,`layout` は反映される。`borderRadius`,`boxShadow`,`animationSpeed` は検証されるだけで**出力には反映されない**（常に固定値）
- **PUT `/api/settings/user/:userId/auto-backup`** 自動バックアップ / Auto backup
  - `enabled`(必須),`frequency`(`daily|weekly|monthly`),`time`(HH:MM),`maxBackups`,`notifyOnSuccess`,`notifyOnFailure`
- **PUT `/api/settings/user/:userId/comment-max-length`** コメント最大文字数 / Max length
  - `maxLength`(1〜10000)
- **PUT `/api/settings/user/:userId/auto-translation`** 自動翻訳 / Auto translation
  - `enabled`(必須),`targetLanguage`,`sourceLanguage`,`provider`(`google|azure|aws`),`usageLimitPerHour`,`fallbackLanguages`(≤5),`notifyOnFailure`
- **PUT `/api/settings/user/:userId/pin-limit`** ピン固定数 / Pin limit
  - `limit`(1〜100)
- **PUT `/api/settings/user/:userId/auto-delete-time`** 自動削除時間 / Auto-delete
  - `hours`(0〜8760)。旧記載の `minutes` は誤り
- **PUT `/api/settings/user/:userId/auto-ng-word`** NGワード自動追加 / Auto NG word
  - `enabled`(必須),`threshold`(0.1〜1.0),`minOccurrences`,`excludedWords`
- **PUT `/api/settings/user/:userId/individual-ai-threshold`** AI閾値の個別設定 / Per-comment AI threshold
  - `commentId`,`threshold`(0〜1)
- **PUT `/api/settings/user/:userId/user-theme`** 対象ユーザーのテーマ / Per-target theme
  - `theme`(`light|dark|system|custom`),`primaryColor`,`secondaryColor`。`settings.userTheme` に保存
- **PUT `/api/settings/user/:userId/ban-reason`** BAN理由の記録 / Ban reason record
  - `targetUserId`,`reason`(≤500),`duration`(`1h…30d|permanent`),`moderatorNotes`。記録のみでBAN自体は行わない
- **PUT `/api/settings/user/:userId/user-mute-duration`** ミュート期間の設定 / Mute duration preference
  - `targetUserId`,`duration`(`5m…3d`),`reason`。`settings.userMuteSettings` に保存するのみで、実際のミュート（`POST /api/users/:id/timeout`）は行わない
- **PUT `/api/settings/user/:userId/user-comment-color`** コメント色の設定 / Per-target comment color
  - `targetUserId`,`color`(16進),`applyTo`(`all|youtube|twitch`)
- **PUT `/api/settings/user/:userId/comment-reaction`** リアクション切替 / Toggle reaction
  - `commentId`,`reactionType`(`like|dislike|love|laugh|angry|sad|surprise`)。`comment_reactions` テーブルを直接トグル
- **PUT `/api/settings/user/:userId/comment-tag`** タグ切替 / Toggle tag
  - `commentId`,`tag`(≤50)。`comment_tags` テーブルを直接トグル
- **PUT `/api/settings/user/:userId/auto-restore`** 自動復元 / Auto restore
  - `enabled`(必須),`restorePoints`,`frequency`(`manual|hourly|daily|weekly`),`maxRestores`
- **PUT `/api/settings/user/:userId/access-permissions`** アクセス権限 / Access permissions
  - 任意: `permissions.{read,write,admin}[]`,`roles[]`,`restrictions.*`。丸ごと置換
- **PUT `/api/settings/user/:userId/notification-settings`** システム通知設定 / System notification channels
  - 任意: `emailNotifications`,`pushNotifications`,`inAppNotifications`,`webhookNotifications`,`thresholds`。丸ごと置換
- **PUT `/api/settings/user/:userId/ui-theme-settings`** UIテーマ一覧 / UI theme presets
  - 任意: `themePresets[]`,`customThemes[]`,`defaultTheme`,`allowCustomThemes`
- **PUT `/api/settings/user/:userId/auto-apply`** 設定の自動適用 / Auto apply
  - `enabled`(必須),`triggers[]`,`conditions`,`actions[]`
- **PUT `/api/settings/user/:userId/expiration-settings`** 有効期限 / Expiration policies
  - 任意: `settingsExpiration`,`passwordExpiration`,`sessionExpiration`,`tokenExpiration`,`cleanupSettings`
- **POST `/api/settings/user/:userId/execute-restore`** 復元実行 / Execute restore
  - `restorePoint`,`categories[]`。`status:'in_progress'` の記録を書くのみで、**実際の復元処理は行わない**
- **GET `/api/settings/user/:userId/slow-mode`** スローモード取得 / Get slow mode
  - 未設定なら既定値をその場で生成して返す（保存しない）
- **PUT `/api/settings/user/:userId/slow-mode`** スローモード更新 / Update slow mode
  - `enabled`(必須),`intervalSeconds`(0〜300),`platformSpecific.{youtube,twitch}`。Joiスキーマ(`updateSlowModeSettings`)はこのルートに未接続で、検証はコントローラー内の手動チェックのみ

> 以前ここには `/check-permission` `/expiration-status` も載っていたが、そのようなルートは存在しない（E-53で判明、削除）。

### ログ取得 / Logs

- **GET `/api/settings/comment-edit-history/:commentId`** コメント編集履歴 / Fetch comment edit history

## 監視 API / Monitoring API (`backend/src/routes/monitoring.js`)

- **GET `/api/monitoring/system/stats`** システム統計 / System stats (admin)
  - **応答形式 / Response format**
    ```json
    {
      "status": 200,
      "data": {
        "cpu": {
          "usage": 42,
          "cores": 8,
          "temperature": 58,
          "loadAverage": [0.12, 0.25, 0.33]
        },
        "memory": {
          "total": 17179869184,
          "used": 6871947673,
          "free": 10307921511,
          "usagePercent": 40,
          "available": 12884901888,
          "buffers": 536870912,
          "cached": 268435456
        },
        "disk": [
          {
            "filesystem": "/dev/sda1",
            "size": 512000000000,
            "used": 179000000000,
            "available": 333000000000,
            "usePercent": 35,
            "mount": "/"
          }
        ],
        "network": {
          "interfaces": [
            {
              "interface": "eth0",
              "rx_bytes": 123456789,
              "tx_bytes": 987654321,
              "rx_sec": 1024,
              "tx_sec": 2048,
              "operstate": "up",
              "speed": 1000
            }
          ],
          "totalRxBytes": 123456789,
          "totalTxBytes": 987654321
        },
        "processes": {
          "total": 212,
          "running": 5,
          "sleeping": 200,
          "blocked": 0,
          "list": []
        },
        "rateLimits": {
          "total": 4,
          "lastTriggeredAt": "2025-10-05T11:20:00.000Z",
          "byLimiter": {
            "api": {
              "total": 3,
              "lastClient": "127.0.0.1",
              "lastMethod": "GET",
              "lastPath": "/api/comments",
              "lastTriggeredAt": "2025-10-05T11:19:15.000Z"
            }
          }
        },
        "system": {
          "platform": "linux",
          "arch": "x64",
          "release": "5.15.0",
          "hostname": "runner-api",
          "uptime": 3600,
          "nodeVersion": "v18.19.0",
          "memoryUsage": {
            "rss": 123000000,
            "heapTotal": 78000000,
            "heapUsed": 52000000,
            "external": 12000000
          },
          "environment": "production"
        },
        "timestamp": "2025-10-05T11:21:00.000Z"
      },
      "message": "システム統計情報を取得しました"
    }
    ```
  - **フォールバック / Fallbacks**: 個別メトリクスの取得に失敗した場合、配列は空配列、オブジェクトは空値のまま返却します。`rateLimits` は `total: 0` を保証し、温度や速度など利用不可項目は `null` または欠落となります。
- **GET `/api/monitoring/app/stats`** アプリ統計 / App stats (admin)
  - **応答形式 / Response format**
    ```json
    {
      "status": 200,
      "data": {
        "period": "24h",
        "startDate": "2025-10-04T11:21:00.000Z",
        "endDate": "2025-10-05T11:21:00.000Z",
        "data": [
          {
            "date": "2025-10-05",
            "platform": "youtube",
            "total_comments": 120,
            "moderated_comments": 35,
            "unique_users": 44,
            "avg_content_length": 128.4
          }
        ],
        "summary": {
          "activeConnections": 12,
          "totalComments": 540,
          "totalModerated": 180,
          "uniqueUsers": 2
        },
        "timestamp": "2025-10-05T11:21:00.000Z"
      },
      "message": "アプリケーション統計情報を取得しました"
    }
    ```
  - **フォールバック / Fallbacks**: データベース照会に失敗した場合は 500 を返し、`summary.activeConnections` は Socket.IO が未初期化の場合 0 となります。
- **GET `/api/monitoring/logs`** ログ一覧 / Logs (admin)
- **GET `/api/monitoring/metrics`** パフォーマンス指標 / Performance metrics (admin)
- **GET `/api/monitoring/alerts`** アラート一覧 / Alerts (admin)
- **PUT `/api/monitoring/alerts/:alertId/acknowledge`** アラート確認 / Acknowledge alert (admin)
- **GET `/api/monitoring/health`** システムヘルス / Basic health (anonymous)
- **GET `/api/monitoring/settings`** 監視設定取得 / Monitoring settings (admin)
- **PUT `/api/monitoring/settings`** 監視設定更新 / Update monitoring settings (admin)
- **GET `/api/monitoring/health/detailed`** 詳細ヘルスチェック / Detailed health (admin)
- **POST `/api/monitoring/metrics/reset`** メトリクスリセット / Reset metrics (admin)
- **GET `/api/monitoring/health/check/:name`** 個別ヘルスチェック / Run individual check (`moderator`)
- **GET `/api/monitoring/ai/costs`** AI利用コスト統計 / OpenAI cost stats (admin。プロセスメモリ内、再起動でリセット)

## インサイト API / Insights API (`backend/src/routes/insights.js`)

> 実体は `routes/communityInsights.js`（`/api/insights` にマウント）。全エンドポイント `moderator` 以上。状態はプロセス内メモリ（文化プロファイルのみDB永続化）。

- **GET `/api/insights/culture-presets`** 文化プリセット一覧 (`family|educational|entertainment|gaming|mature`)
- **GET `/api/insights/culture/:platform/:channelId`** 文化プロファイル取得 (未設定は `entertainment`)
- **PUT `/api/insights/culture/:platform/:channelId`** 文化プロファイル設定 (`cultureType` 必須、`customOverrides` 任意。未定義は400)
- **GET `/api/insights/health-summary/:platform/:channelId`** 健全性サマリー (未蓄積は `data:null`)
- **GET `/api/insights/raid-defense/:platform/:channelId`** レイド防御モードの状態
- **DELETE `/api/insights/raid-defense/:platform/:channelId`** レイド防御の手動解除（人間の介入経路。解除後5分は再自動発動を抑止）
- **GET `/api/insights/raid-detection/:platform/:channelId`** 協調攻撃の検知結果（直近60秒、5件未満は空）
- **GET `/api/insights/risk/:platform/:channelId`** 炎上リスク（直近20件、3件未満は安全側の既定値）
- **GET `/api/insights/silent-departure/:platform/:channelId`** サイレント離脱検知（7日で3件以上の常連が直近3日無言）
- **POST `/api/insights/context-analysis`** 文脈つきセンチメント (`targetComment` 必須、`contextComments` ≤200。ルールベース、AI不使用)
- **POST `/api/insights/culture-adjust`** 文化に応じたスコア調整 (`rawScore` 0〜100 必須、`platform`,`channelId`,`context`)
- **POST `/api/insights/health-score`** 健全性スコア算出 (`comments` ≤1000 必須、`windowSize`)
- **POST `/api/insights/ingest`** 炎上検知エンジンへ取り込み (`platform`,`content` 必須、直近500件のバッファに蓄積)
- **POST `/api/insights/record-activity`** サイレント離脱検知へ活動を記録 (`platform`,`userId` 必須)
- **POST `/api/insights/triage`** トリアージキュー生成 (`pendingComments` ≤500 必須、`channelContext`,`options`。`EMERGENCY|URGENT|ROUTINE|CAN_WAIT` に分類)

## YouTube 連携 API / YouTube Integration API (`backend/src/routes/youtube.js`)

> 全エンドポイント `moderator` 以上。取り込んだコメントは通常どおりモデレーション・保留・レイド検知を通る。

- **GET `/api/youtube/channels/:channelId`** チャンネル情報（静的なプレースホルダー、YouTube APIは呼ばない）
- **GET `/api/youtube/channels/:channelId/comments`** 取り込み済みコメントのDB照会（`limit`≤200。**`channelId` では絞り込まれず**、`platform='youtube'` の最新順）
- **GET `/api/youtube/videos/:videoId/comments`** 未実装スタブ（常に空）
- **GET `/api/youtube/watch`** 監視中の動画とクォータ状況（`enabled` は `YOUTUBE_API_KEY` の有無）
- **POST `/api/youtube/watch`** ライブチャット監視の開始 (`videoId` 必須)。成功201、失敗は 503(キー未設定)/429(クォータ)/409(ライブでない)/502(API失敗)/400
- **DELETE `/api/youtube/watch/:videoId`** 監視の停止（監視していなければ404）

## Twitch 連携 API / Twitch Integration API (`backend/src/routes/twitch.js`)

> 全エンドポイント `moderator` 以上。EventSub WebSocket 経由で取り込む。

- **GET `/api/twitch/watch`** 監視中チャンネル一覧（`enabled` は `TWITCH_USER_ACCESS_TOKEN`/`TWITCH_USER_ID` の有無）
- **POST `/api/twitch/watch`** 監視開始 (`broadcasterUserId` 必須)。未設定は503。**失敗（既に監視中等）でもHTTP 200**なので `data.started` で判定する
- **DELETE `/api/twitch/watch/:broadcasterUserId`** 監視停止。監視していなくても200で `data.stopped:false`

## ヘルスチェック / Health & Metrics (`backend/src/app.js`)

- **GET `/health`** ライブネス確認 / Liveness probe (匿名)
- **GET `/health/detailed`** 詳細状態 / Detailed health (admin)
- **GET `/metrics`** 簡易メトリクス / Basic metrics (**admin**)。**JSONを返す**。
  Prometheus の exposition 形式ではないため、Prometheus で取り込むには
  エクスポーターを別途用意する必要がある

> 以前ここには `/health/ready` `/health/live` `/health/metrics`
> `/health/metrics/prometheus` も記載されていたが、いずれも実装が存在しない
> （`routes/health.js` は E-12 で重複と判明し削除済み）。

## WebSocket / WebSocket (`backend/src/ws.js`)

- **エンドポイント / Endpoint** `ws://localhost:4000`
- **イベント / Events**
  - **`statsUpdate`** ダッシュボード統計更新 / Dashboard stats broadcast
  - コメント・通知などのリアルタイムイベントはルーム単位でブロードキャストされます。
- **認証 / Auth** （E-47）接続時に `io.use()` がCookieまたは `handshake.auth.token` を検証し `socket.user` を設定します。未認証接続は `authenticate`・`sendNotification`・`moderationAction` を使えません（後2者は `moderator` 以上）。`joinDashboard` 等の閲覧系room参加は未認証でも可能です。
- **更新間隔 / Update Interval** 統計情報は 5 秒ごと、システム情報は 10 秒ごとに送信されます。

## 推奨ベストプラクティス / Best Practices

- **環境変数管理 / Environment checks** `npm run env:check` で必須キーを検証してから起動します。
- **リクエストタイムアウト / Request timeout** すべてのリクエストは `requestTimeout()` によりタイムアウトが設定されています。長時間処理は非同期ジョブへ委譲してください。
- **入力検証 / Validation** 主要エンドポイントは `Joi` によるバリデーションを行います。記載されていないプロパティは拒否されます。
- **監査ログ / Audit logs** 重要操作は `winston` を通じてログに出力されます。運用ではログ集約を構成してください。

## サポート窓口 / Support

- **課題報告 / Issues** GitHub Issues に登録してください。
- **質問 / Questions** プロジェクト管理者へ連絡してください。商用サポートは提供していません。

---

最新情報を反映するため、コード変更時は本ドキュメントも更新してください。 / Update this document alongside any API change.
