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

## ユーザー API / Users API (`backend/src/routes/users.js`)

> すべてのユーザー API は JWT 認証が必須です。`authenticateToken()` の後、各ルートで `requireRole()` により権限を検証します。

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
- **PUT `/api/moderation/settings`** プラットフォーム別設定更新 / Update moderation settings
  (`platform`, `thresholds`, `bannedWords`, `regexPatterns`)

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
- **GET `/api/settings/export`** 設定エクスポート / Export settings (admin)
  - **クエリ / Query** `format` (`json|yaml|toml`), `includeSensitive`
- **POST `/api/settings/import`** 設定インポート / Import settings (admin)
- **GET `/api/settings/user/:userId`** ユーザー設定取得 / Get user settings (admin)
- **PUT `/api/settings/user/:userId`** ユーザー設定更新 / Replace settings (admin)

### ユーザー単位の詳細操作 / User-scoped operations (admin)

以下はいずれも `PUT` で JSON ボディを受け取り、対象ユーザーの設定を更新します。

- `/api/settings/user/:userId/theme` (`theme`: `light|dark|system`)
- `/layout` (`layout`: `default|compact|spacious|custom`)
- `/notifications` (通知設定オブジェクト)
- `/default-language` (`language`)
- `/timezone` (`timezone`)
- `/admin-email` (`email`)
- `/api-keys` (`action`, `keyName`, `permissions`, `expiresIn`)
- `/external-integration` (`service`, `action`, `credentials`)
- `/ui-custom` (UI カスタム設定)
- `/auto-backup` (`enabled`, `frequency`, `time`, `maxBackups`)
- `/comment-max-length` (`maxLength`)
- `/auto-translation` (`enabled` 等)
- `/pin-limit` (`limit`)
- `/auto-delete-time` (`minutes`)
- `/auto-ng-word` (登録ルール)
- `/individual-ai-threshold` (`rules`)
- `/user-theme` (`theme`)
- `/ban-reason` (`reason`)
- `/user-mute-duration` (`seconds`)
- `/user-comment-color` (`colorMap`)
- `/comment-reaction` (`reactions` 設定)
- `/comment-tag` (`tags` 設定)
- `/auto-restore` (`enabled` 等)
- `/access-permissions` (`permissions`)
- `/notification-settings` (`channels`)
- `/ui-theme-settings` (`palette`)
- `/auto-apply` (`enabled`)
- `/expiration-settings` (`expiresAt` 等)
- `/execute-restore` (`restorePoint`)
- `/check-permission` (`permission`)
- `/expiration-status` (クエリでチェック)

### ログ取得 / Logs

- **GET `/api/settings/ai-moderation-logs/:commentId`** AI 判定ログ / Fetch AI moderation logs
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
- **認証 / Auth** 現在はトークン検証を行っていません。必要に応じてヘッダー認証を追加してください。
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
