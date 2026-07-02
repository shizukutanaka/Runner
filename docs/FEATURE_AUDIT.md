# 機能過不足監査（Feature Audit）

**最終検証日: 2026-07-02** / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`

## この文書の目的と使い方

本書は、この製品（YouTube/Twitchコメント管理プラットフォーム）の**未対応の機能過不足**を、AIアシスタント（Claude Opus/Sonnet等）や開発者が再調査なしで把握・着手できる形式でリスト化したものです。

- 全項目は実際のコード読解・grep・テスト実行で検証済み。各項目に**証拠**と**再検証コマンド**を付記
- **着手前に必ず該当項目の再検証コマンドを実行すること**。本書作成後に修正済みの可能性がある
- 「過剰」= 作られたが機能していない・重複・偽装データを返す機能。「不足」= 製品の価値提案上必要なのに欠落・断線している機能

---

## 第1部: 過剰（作られたが機能していない・重複・偽装）

### E-1. moderationController の大量スタブ関数 【アプリ最大の偽装面】

- **ファイル**: `backend/src/controllers/moderationController.js`
- **証拠**: 35箇所の「実際の実装では〜」コメント。`setThresholds`, `getCustomFilters`, `analyzeSentiment`(統計側), `getChatbotSettings`, `translateText`, `getLinkBlockStats` など約35関数が静的ハードコードデータを返す。ルートは `routes/moderation.js` で認証付き公開済みのため、UIから呼べば**本物のAPIレスポンスの形をした偽データ**が返る
- **推奨アクション**: 関数単位でトリアージ。(a) 対応するUIが存在しない・計画もないもの → ルートごと削除、(b) 必要なもの → moderationService / openaiService / 実DBに接続して本実装
- **再検証**: `grep -c "実際の実装では" backend/src/controllers/moderationController.js` → 35前後なら未対応

### E-2. analyticsController の13ダミーエンドポイント

- **ファイル**: `backend/src/controllers/analyticsController.js`
- **証拠**: `getStats` / `getGraph` のみ実DB集計（修正済み）。残り13関数（`getPeriodStats`=100件固定, `getUserStats`, `getCommentStats`, `getModerationStats`, `exportAnalytics`("エクスポートダミー"), `importAnalytics`, `getHistory`, `externalIntegration`, `getUsage`=0.8固定, `getPeak`="12:00"固定, `getTrend`="up"固定, `getRanking`, `detectAnomaly`）は全てハードコード
- **推奨アクション**: 実DB集計への置換、またはルート削除（`routes/analytics.js` の該当行も併せて削除）
- **再検証**: `grep -c "ダミー" backend/src/controllers/analyticsController.js` → 9前後なら未対応（"ダミー"文言なしの固定値関数も含め計13）

### E-3. tenantController — 配線されていないマルチテナント機構 【危険】

- **ファイル**: `backend/src/controllers/tenantController.js`（616行）, `routes/tenants.js`
- **証拠**: `comments`/`users` の実データパス（`commentsController.js`, `commentService.js`）に `tenant_id` フィルタが**一切存在しない**（grep 0件）。テナント分離が機能していないのに、`deleteTenant` は11テーブルに対して `DELETE FROM <table> WHERE tenant_id = ?` を実行する——分離されていないデータに対する削除機能は時限爆弾
- **推奨アクション**: 製品方針の意思決定が必要。(a) SaaS化するなら全クエリに tenant_id を配線する大工事、(b) しないなら tenantController/routes/tenants.js を削除。**短期対応: 少なくとも delete系エンドポイントを無効化**
- **再検証**: `grep -c "tenant_id" backend/src/controllers/commentsController.js backend/src/services/commentService.js` → 両方0なら未配線のまま

### E-4. utils/websocket.js — 重複した第2のWebSocketクライアント

- **ファイル**: `frontend/src/utils/websocket.js`（253行）
- **証拠**: どこからも import されていない（grep 0件）。正規実装は `frontend/src/ws.js`（`ConnectionStatus.jsx` と `hooks/useRealtimeComments.js` が参照）
- **推奨アクション**: 削除
- **再検証**: `grep -rln "utils/websocket" frontend/src | grep -v "utils/websocket.js"` → 0件なら安全に削除可

### E-5. Stripe課金バックエンド — フロントエンド呼び出しゼロ

- **ファイル**: `backend/src/controllers/billingController.js`, `backend/src/services/stripeService.js`, `backend/src/routes/billing.js`
- **証拠**: frontend/src 内に "billing" への参照が0件
- **推奨アクション**: 保留可（バックエンドは実装済みのため、課金UIを作る段階まで放置してよい）。ただし製品計画に課金がないなら削除候補
- **再検証**: `grep -rln "billing" frontend/src --include="*.js" --include="*.jsx"` → 0件なら未接続のまま

### E-6. getComprehensiveSystemStats — 装飾的静的データ

- **ファイル**: `backend/src/controllers/notificationsController.js:623`、ルートは `routes/notifications.js:34`（`GET /api/notifications/system/comprehensive`）
- **証拠**: 「18のプログラミング言語とその機能一覧」というハードコード配列を返すだけ。コメントモデレーション業務と無関係（過去に削除した約24個の「言語風通知生成」機能群の残骸）
- **推奨アクション**: 関数とルートを削除
- **再検証**: `grep -n "getComprehensiveSystemStats" backend/src/controllers/notificationsController.js` → ヒットすれば未対応

### E-7. 存在しないサービスへのテスト

- **ファイル**: `backend/tests/services/advancedEncryptionService.test.js`
- **証拠**: テスト対象 `backend/src/services/advancedEncryptionService.js` が存在しない（実在するのは `encryptionService.js`）。スイートは常に "Cannot find module" で失敗し、テスト失敗数を水増ししている
- **推奨アクション**: テストを `encryptionService.js` に向けて書き直すか削除
- **再検証**: `test -f backend/src/services/advancedEncryptionService.js` → 無ければ未対応

### E-8. 正直なスタブルート群（低優先）

- **ファイル**: `backend/src/routes/youtube.js`, `papers.js`, `advancedAIServices.js`, `innovativeTechnologies.js`, `integratedAnalysis.js`
- **証拠**: 「configure YOUTUBE_API_KEY to enable」等と明記して空データを返す誠実なスタブ。認証は追加済み
- **推奨アクション**: 現状維持可。youtube.js は不足D-2の実装時に本実装へ置換

---

## 第2部: 不足（必要なのに欠落・断線）— 優先度順

### D-1. ★★★ リアルタイム層が事実上ゼロ稼働 【最優先・小工数】

- **証拠**:
  - バックエンド `backend/src/ws.js` は room 配信を実装済み: `socket.on('authenticate')` で `user:${userId}` / `platform:${platform}` roomに参加させ、`commentUpdate`(426行付近) / `moderationNotification`(495) / `notification`(551) を配信
  - しかしフロントエンド `frontend/src/ws.js` は **`socket.emit('authenticate', ...)` を一度も送信しない**（grep 0件）→ どの room にも参加せず、リアルタイム更新は一切届かない
  - `frontend/src/hooks/useRealtimeComments.js`（46行）は正しく書かれているが**どのコンポーネントからも未使用**の孤児
  - 結果: `ConnectionStatus` は「接続中」と表示するが、実際には何も流れてこない。「ライブコメント管理」という製品の核心価値が不履行
- **推奨アクション**: (1) ログイン成功後（`hooks/useAuth.js` の login / セッション復元時）に `socket.emit('authenticate', { userId: account.id, platform })` を送信、(2) `useRealtimeComments` を `CommentTimeline.js` に接続、(3) 再接続時の再authenticate処理
- **再検証**: `grep -rn "emit('authenticate'" frontend/src` → 0件なら未修正

### D-2. ★★★ 実プラットフォーム連携（YouTube/Twitch API取り込み）が存在しない

- **証拠**: バックエンドのどのサービスも実際のYouTube/Twitch APIを呼んでいない。`googleapis` パッケージ不使用、`TWITCH_CLIENT_ID` をコードで使用している箇所ゼロ（`moderationService.js:912` のヒットはPerspective APIのURL文字列定数であり別物）。コメントがシステムに入る経路は `POST /api/comments` のみ。config骨格（`config.services.youtube` / `config.services.twitch`、pollingInterval等）は既に存在
- **推奨アクション**: YouTube Data API v3 (`liveChatMessages.list`) ポーリングサービスを新規実装（`backend/src/services/youtubeIngestionService.js`）。取得コメントを既存の `commentService.createComment` 経由で投入すればモデレーションパイプラインに自動的に乗る。Twitchは後続（IRC/EventSub）
- **再検証**: `grep -rln "googleapis\|liveChatMessages" backend/src/services/` → 実装ファイルが無ければ未対応

### D-3. ★★ メール送信が偽装実装 — パスワードリセットが実際には機能しない

- **証拠**: `backend/src/services/notificationChannelService.js:89` の `sendEmail()` は setTimeout でシミュレートし偽の messageId を返すだけ。nodemailer 利用コードは98-99行でコメントアウト。`authController.forgotPassword` はリセットトークンを正しく発行・保存するが、メールが届かないためユーザーはトークンを知る術がない
- **推奨アクション**: nodemailer + SMTP設定（環境変数 `SMTP_HOST/PORT/USER/PASS`）で本接続し、forgotPassword からリセットURL付きメールを送信
- **再検証**: `grep -n "nodemailer" backend/src/services/notificationChannelService.js` → コメントアウトのままなら未対応

### D-4. ★★ 保留メッセージキューのUIが無い

- **証拠**: バックエンドはコミット `a3b7af1` で実データ化済み（`held_messages` テーブル、`GET /api/moderation/held-messages` 相当の取得/承認/却下/一括処理/統計API群 — `moderationController.js` の getHeldMessages / processHeldMessage / bulkProcessHeldMessages / getMessageHoldStats）。しかし承認/却下を操作するフロントエンド画面が存在しない
- **推奨アクション**: `ModeratorDashboard.js` に保留キューのタブまたはパネルを追加（一覧表示 + 承認/却下/エスカレートボタン + 一括操作）
- **再検証**: `grep -rln "held-messages\|heldMessages" frontend/src` → 0件なら未対応

### D-5. ★★ リフレッシュトークンがスタブ — セッションが黙って切れる

- **証拠**: `backend/src/controllers/authController.js:180-182` の `exports.refresh` は無条件で401を返す。リフレッシュトークンの発行機構自体が無い。`JWT_EXPIRY`（既定15m〜24h）経過後、ユーザーは作業中に黙って401→強制ログアウトされる
- **推奨アクション**: ログイン時にリフレッシュトークン（長寿命・DB保存・ハッシュ化）を発行し、`/refresh` で検証→新アクセストークン発行。フロント側は401時に自動リフレッシュを試みるaxiosインターセプター追加
- **再検証**: `grep -A2 "exports.refresh" backend/src/controllers/authController.js` → 即401ならスタブのまま

### D-6. ★ アカウント⇔チャンネルの担当範囲が存在しない

- **証拠**: `accounts` テーブル（運用者）とコメントデータの間に「どのチャンネル/プラットフォームを担当するか」の関連が無い。全moderatorが全データを閲覧・操作できる
- **推奨アクション**: E-3（テナント方針）の意思決定と合わせて設計。最小案: `account_channels` 中間テーブル + クエリへの担当範囲フィルタ
- **再検証**: `grep -n "account_channels\|channel_id" backend/src/db.js` → 無ければ未対応

### D-7. ★ トークン保管がsessionStorage（XSS露出）

- **証拠**: `frontend/src/utils/tokenStorage.js` にTODOコメントあり（httpOnly Cookie移行が理想、サーバー側セッション管理が必要）
- **推奨アクション**: `/api/users/login` を httpOnly Cookie 発行に変更し、フロントのBearerヘッダー方式から移行

### D-8. ★ コミュニティインサイトUIの残り2画面

- **証拠**: バックエンド12エンドポイントは全実装・テスト済（`routes/communityInsights.js`）。UIは triage / health / silent-departure の3つが `Dashboard.js` に接続済み。**文化プロファイル管理**（`PUT /api/insights/culture/:platform/:channelId`）と**文脈分析**（`POST /api/insights/context-analysis`）のUIが未実装
- **推奨アクション**: 設定画面に文化プロファイル選択UI、コメント詳細に文脈分析表示を追加

### D-9. ★ 残存テスト失敗 約124件

- **証拠**: `cd backend && NODE_ENV=test npx jest` → 13スイート失敗/124件失敗（2026-07-02時点）。主因: (a) notifications テーブルに `user_id` 列が無い等のスキーマ不一致、(b) openaiService テストのモック構造不良、(c) レスポンス形状不一致（`success` vs `status`）、(d) E-7の存在しないサービス
- **推奨アクション**: スキーマ整合（ALTER TABLE で不足列追加）から着手すると最も多く直る

---

## 第3部: 解決済み（再監査不要）

以下は本ブランチで修正済み。同じ指摘を繰り返さないこと。

| 項目 | コミット |
|---|---|
| バックエンド全域の構文エラー一掃（require時クラッシュ8ファイル）・存在しない24サービス依存の通知機能群削除 | `049fd9b` |
| moderation/insights/スタブ5ルートの認証欠落（約40エンドポイント無認証だった）・held_messagesバックエンド実データ化・moderationControllerのdb/logger未import | `a3b7af1` |
| 認証システム新規実装（accounts, register/login/2FA/パスワードリセットトークン, Login UI）・validation.jsのJoiスキーマ無視バグ（moderation/settings/usersのバリデーションが無効だった） | `c513d56` |
| SettingsPanel実API接続（従来はローカルstateのみ・全URL不一致・handleAPIError未export の三重断絶）・初回登録者admin化＋ロール管理API | `6820ac2` |
| MonitoringDashboard修復（未インストールのrecharts・存在しないCpu/Networkアイコンで一度もコンパイル不可能だった）＋Dashboardタブ配線＋fetch→axios認証付与 | `8ef8a4b` |
| usersController ReferenceError・ページネーション上限・設定検証・死角コード3ファイル削除 | `dd18e88` |
| OpenAIサービス（キャッシュ/タイムアウト/リトライ/コスト追跡）・sessionStorage移行・AI費用監視API | `7b38090` |

## 推奨着手順

1. **D-1 リアルタイム配線**（半日・製品価値直結・資産は揃っている）
2. **D-2 YouTube取り込み**（中規模・製品名の約束を果たす）
3. **D-3 メール送信**（小・認証機能の completion）
4. **D-4 保留キューUI**（小〜中）
5. **E-3 テナント意思決定** ＋ クイックウィン一括（E-4/E-6/E-7削除、D-5リフレッシュ実装）
