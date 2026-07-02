# 機能過不足監査（Feature Audit）

**最終検証日: 2026-07-02**（第2ラウンド追記済み） / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`

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

### E-9. uiController.js — 自認するダミーAPI群

- **ファイル**: `backend/src/controllers/uiController.js`（41行）, `routes/ui.js`
- **証拠**: ファイル先頭コメントが「UIテーマ・レイアウト・アクセシビリティ・フォント・拡大縮小・通知バッジ・ヘルプ・言語・カスタムCSS用ダミーAPI群」と自認。全ハンドラがリクエストボディをそのままエコーバックするだけで何も永続化しない。ルート自体は認証・レート制限・バリデーション付きで `/api/ui` にマウント済み
- **推奨アクション**: UIカスタマイズ設定は既に `settingsController.js`（D-8と表裏）にも一部重複した機能があるため、統合するか本実装する
- **再検証**: `head -3 backend/src/controllers/uiController.js` → 「ダミーAPI群」の文言が残っていれば未対応

### E-10. デッドミドルウェア3件（実装済みだが一度も適用されていない）

- **ファイル**: `backend/src/middleware/csrf.js`, `middleware/tokenRotation.js`, `middleware/inputSanitizer.js`
- **証拠**: 3ファイルとも `app.js` や `routes/` から一切importされていない（grep 0件）。CSRF保護一式（csrfProtection/csrfVerifier/csrfTokenGenerator）が実装されているのに`app.use`されておらず、実質CSRF防御が無い。`inputSanitizer.js` は本セッション序盤で正規表現バグを修正したが、そもそも一度も呼ばれないため**その修正は無意味だった**（正直な記録として残す）。app.js は代わりに `middleware/security.js` の `sanitizeInput` を使用している
- **推奨アクション**: CSRF保護は本番運用前に必須級 → `app.js` に `csrfProtection` を適用するか、`security.js` 側で同等の対策が既にあるか確認して不要なら削除。tokenRotation/inputSanitizer は重複なら削除
- **再検証**: `grep -rln "middleware/csrf\|middleware/tokenRotation\|middleware/inputSanitizer" backend/src | grep -v "middleware/csrf.js\|middleware/tokenRotation.js\|middleware/inputSanitizer.js"` → 空なら未対応

### E-11. デッドサービス9件（importer 0件）

- **ファイル**: `backend/src/services/backupService.js`, `coroutineService.js`, `databaseService.js`, `interactiveNotificationService.js`, `pureFunctionalNotificationService.js`, `notificationBuilder.js`, `notificationJobQueue.js`, `services/i18nService.js`, `utils/dbAnalyzer.js`
- **証拠**: いずれも他のどのファイルからも `require` されていない。特に `services/i18nService.js` は本セッション序盤で `addLanguage()` を実装したが、実際にアプリが使っているのは別ファイル `backend/src/i18n.js` であり、**その修正も無意味だった**（正直な記録として残す）。`monitoringService.js` は `global.databaseService`/`global.cacheService` を参照するが、どこにも代入されないため常に未定義（該当の分岐は常にデッド）
- **推奨アクション**: 各ファイルごとに「配線して活かす」か「削除」かを判断。特に `backupService.js` は D-14 で不足側からも指摘（自動バックアップが機能していない一次原因）
- **再検証**: 各ファイル名で `grep -rln "<ファイル名の拡張子抜き>" backend/src --include="*.js" | grep -v "services/<ファイル名>"` → 空なら未対応

### E-12. routes/health.js — 実装は本物だがマウントされていない

- **ファイル**: `backend/src/routes/health.js`（272行）
- **証拠**: `scripts/healthCheck` の `HealthChecker` を使う本物の実装だが、`app.js` はこのファイルを一切 `require` しない。実際に `/health` を提供しているのは `middleware/monitoring` 経由の別実装
- **推奨アクション**: 重複なら削除、より詳細なヘルスチェックとして活かすなら `/api/health/detailed` 等でマウント
- **再検証**: `grep -n "routes/health" backend/src/app.js` → 空ならマウントされていない

### E-13. MSWモックの経路不一致（実害小・開発時の誤診断リスク）

- **ファイル**: `frontend/src/mocks/handlers.js`
- **証拠**: `POST /auth/login` をモックするが実際のバックエンドは `/api/users/login`（`api/auth.js:21`）。`baseURL` も絶対URL `http://localhost:4000/api` 固定で、フロントのaxiosは相対パス `/api` を使うため通常は素通りする。既定では `VITE_ENABLE_MSW=true` を明示しない限り無効
- **推奨アクション**: 低優先。有効化して使うならパスをそろえる、使わないなら削除
- **再検証**: `grep -n "auth/login" frontend/src/mocks/handlers.js`

---

## 第2部: 不足（必要なのに欠落・断線）— 優先度順

### D-1. ★★★ リアルタイム層が事実上ゼロ稼働 【最優先・両側断線】

- **証拠（フロント側）**:
  - バックエンド `backend/src/ws.js` は room 配信を実装済み: `socket.on('authenticate')` で `user:${userId}` / `platform:${platform}` roomに参加させ、`commentUpdate`(426行付近) / `moderationNotification`(495) / `notification`(551) を配信
  - しかしフロントエンド `frontend/src/ws.js` は **`socket.emit('authenticate', ...)` を一度も送信しない**（grep 0件）→ どの room にも参加せず、リアルタイム更新は一切届かない
  - `frontend/src/hooks/useRealtimeComments.js`（46行）は正しく書かれているが**どのコンポーネントからも未使用**の孤児
  - `CommentTimeline.js` は WebSocket にもポーリングにも依存しない一発取得のみ（AI要約だけ12秒間隔で再取得、コメント一覧自体は「更新」ボタンでの手動 `refetch()` のみ）
- **証拠（バックエンド側 — フロント修正だけでは不十分）**:
  - `commentUpdate`/`moderationNotification`/`notification` の配信は **socket側のinboundイベント（`newComment`/`moderationAction`/`sendNotification`）内でのみ発火**しており、`POST /api/comments` を処理する `commentsController.js`/`commentService.js` には `io.emit`/`req.app.get('io')` の呼び出しが**一切ない**（grep 0件）。`app.set('io', io)` の消費者は `monitoringController.js` のみ
  - 結果: 仮にフロントが `authenticate` を送って room に参加しても、**HTTP経由でコメントを投稿・モデレーションした場合はイベントが飛ばない**。ブロードキャストが起きるのは誰かがsocketで直接 `newComment` 等を送った場合のみ
  - `ConnectionStatus` は「接続中」と表示するが、実際には何も流れてこない。「ライブコメント管理」という製品の核心価値が不履行
- **推奨アクション**: (1) フロント: ログイン成功後（`hooks/useAuth.js`）に `socket.emit('authenticate', { userId: account.id, platform })`、(2) `useRealtimeComments` を `CommentTimeline.js` に接続、(3) **バックエンド: `commentService.createComment`/`updateComment` の成功パスで `req.app.get('io')` を使い `commentUpdate`/`moderationNotification` を明示的にemitする処理を追加**（socket側の既存broadcastロジックを関数化して両方から呼べるようにするのが妥当）
- **再検証**: `grep -rn "emit('authenticate'" frontend/src` → 0件なら未修正。`grep -n "get('io')\|\.emit(" backend/src/controllers/commentsController.js backend/src/services/commentService.js` → 0件ならバックエンド側も未修正

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

### D-10. ★★ CriticalAlertsBanner が二重に壊れている — 全画面表示コンポーネントで常時発火

- **ファイル**: `frontend/src/components/CriticalAlertsBanner.jsx`（`App.jsx` 直下、全ページ共通で表示される）
- **証拠**: (a) 生の `fetch()` で `GET /api/monitoring/alerts?status=active&severity=critical&limit=5` を呼ぶが Authorization ヘッダーを付けていない（axiosのグローバルインターセプターを経由しない）→ 本番では常に401、(b) 対象ルートは `requireRole('admin')`（`routes/monitoring.js:20`）→ moderatorロールでは200が返っても403。**MonitoringDashboardで直したのと全く同じ「fetch()に認証ヘッダーが無い」バグが、こちらは未修正のまま残っている**
- **推奨アクション**: `fetch()` を `axios.get()` に置き換える（`MonitoringDashboard.js` の修正パターン踏襲）。role要件も見直す
- **再検証**: `grep -n "fetch(" frontend/src/components/CriticalAlertsBanner.jsx` → 生fetchのままなら未対応

### D-11. ★★ Usersタブが実データに対して機能しない

- **証拠**: バックエンドに `GET /api/users`（一覧取得）が存在しない（`routes/users.js` の先頭ルートは `GET /:id`）。`UserPanel.js` は `userIds=['user1','user2']` をハードコードして `fetchUser('user1')` を呼ぶのみ
- **推奨アクション**: `GET /api/users`（一覧・検索・ページネーション）をusersControllerに追加し、UserPanelを実データ連動に書き換え
- **再検証**: `grep -n "router.get('/'" backend/src/routes/users.js` → 空なら一覧エンドポイント無し

### D-12. ★★ 登録UIが存在しない

- **証拠**: `frontend/src/api/auth.js` の `register()` 関数はどのコンポーネントからも import されていない（grep該当は定義のみ）。`Login.jsx` に登録画面へのリンクが無い。初回管理者（ブートストラップadmin、コミット6820ac2で実装）はcurl等API直叩きでしか作成できない
- **推奨アクション**: `Login.jsx` に「アカウント作成」タブ/リンクを追加した `Register.jsx` を実装
- **再検証**: `grep -rn "from '.*api/auth'" frontend/src/components` → `register` の呼び出し元が無ければ未対応

### D-13. ★ 言語スイッチャーの15言語中13言語が張りぼて

- **証拠**: `frontend/src/i18n.js` の `SUPPORTED_LANGUAGES` は15言語を定義しUIに全表示するが、実在するロケールファイルは `locales/en.json` と `locales/ja.json` のみ。残り13言語（zh-CN, ko, es, fr, de, pt-BR, ru, ar, hi, th, vi, id, tr）を選択すると動的importが失敗し英語へ無言フォールバック。`ar` はRTL反転だけ発生し表示は英語のまま
- **推奨アクション**: (a) 主要言語から順にロケールファイルを追加、または (b) `SUPPORTED_LANGUAGES` を実在するロケールのみに絞る
- **再検証**: `ls frontend/src/locales/` → en.json/ja.jsonの2つのみなら未対応

### D-14. ★ 自動バックアップが一度も起動していない

- **証拠**: `backend/src/services/backupService.js` は cron スケジューリング（`cron.schedule`）とファイル書き出し（`fs.writeFile`＋マニフェスト）を正しく実装しているが、`initialize()` を呼ぶコードがアプリ内のどこにも無い（E-11と表裏）。データ消失時の復旧手段が事実上存在しない
- **推奨アクション**: `server.js` または `app.js` の起動処理で `backupService.initialize()` を呼ぶ
- **再検証**: `grep -rln "backupService" backend/src --include="*.js" | grep -v "services/backupService.js"` → 空なら未起動のまま

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

1. **D-10 CriticalAlertsBannerの認証ヘッダー修正**（数行・全画面で発火する既知の壊れ方・最小工数）
2. **D-1 リアルタイム両側配線**（半日・製品価値直結・フロント＋バックエンド両方が必要と判明）
3. **D-2 YouTube取り込み**（中規模・製品名の約束を果たす）
4. **D-3 メール送信 ＋ D-14 自動バックアップ起動**（小・どちらも「実装済みだが呼ばれていない」系）
5. **D-4 保留キューUI ＋ D-12 登録UI**（小〜中）
6. **E-3 テナント意思決定** ＋ クイックウィン一括削除（E-4/E-6/E-7/E-9/E-13、E-10のCSRFのみ「削除でなく適用」を検討）＋ D-5リフレッシュ実装 ＋ D-11 ユーザー一覧API
