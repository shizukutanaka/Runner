# 機能過不足監査（Feature Audit）

**最終検証日: 2026-07-04**（D-1/D-3/D-4/D-10/D-11/D-12/D-14実装、E-4/E-6/E-7解決 + 重大バグ多数発見・修正済み） / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`

## この文書の目的と使い方

本書は、この製品（YouTube/Twitchコメント管理プラットフォーム）の**未対応の機能過不足**を、AIアシスタント（Claude Opus/Sonnet等）や開発者が再調査なしで把握・着手できる形式でリスト化したものです。

- 全項目は実際のコード読解・grep・テスト実行で検証済み。各項目に**証拠**と**再検証コマンド**を付記
- **着手前に必ず該当項目の再検証コマンドを実行すること**。本書作成後に修正済みの可能性がある
- 「過剰」= 作られたが機能していない・重複・偽装データを返す機能。「不足」= 製品の価値提案上必要なのに欠落・断線している機能

## ⚠️ 追記: これまでで最も重大だったバグ（2026-07-04発見・修正済み）

D-1（リアルタイム配線）の実装検証中に、**`POST /api/comments` によるコメント作成が全環境で常に失敗していた**ことが判明した。

- **原因**: `backend/src/services/moderationService.js` の `analyzeComment()`（コメント作成時に必ず呼ばれる中核関数）が、定義されていない関数 `analyzeLinks(content)` と `analyzeSentiment(content)` を呼び出していた（`ReferenceError`）。他のバリデーション（必須フィールド等）を全て通過した有効なリクエストは、モデレーション処理の途中で例外を投げ、`commentsController.js` の catch節で握りつぶされて HTTP 500 になっていた
- **影響範囲**: try/catchの外側にガードが無いため、フィーチャーフラグ等に関わらず**100%のコメント作成リクエストが失敗**していた。これは他の監査項目（スタブ関数・未配線機能）とは性質が異なり、「動くはずの中核機能が実は一度も動いていなかった」という最も深刻なクラスの欠陥
- **なぜ今まで見つからなかったか**: 既存テスト（`tests/api/comments.test.js` 等）は認証トークン不備で401になり、実際にこの関数まで到達していなかった。到達する`tests/integration/comments.test.js`は500ではなく別の理由（レスポンス形状の期待値不一致）で失敗し続けていたため、根本原因が隠れていた
- **実施した修正**: `moderationService.js` に `analyzeLinks()`（既存の`LINK_BLOCK_CONFIG`/`URL_REGEX`を使ったURL抽出・ブロック判定）と `analyzeSentiment()`（ルールベースの簡易感情分析）を実装
- **再検証**: `grep -n "^function analyzeLinks\|^function analyzeSentiment" backend/src/services/moderationService.js` → 両方ヒットすれば修正済み。念のため直接呼び出しでの動作確認: `node --check` だけでは検出できない類のバグ（構文的には正しいReferenceError）なので、必ず実際にコメント作成を実行して確認すること

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

### E-3. △ 一部対応済み（2026-07-04） — tenantController危険機能の即時ガード + 追加発見

- **元の証拠**: `comments`/`users` の実データパス（`commentsController.js`, `commentService.js`）に `tenant_id` フィルタが**一切存在しない**（grep 0件）。テナント分離が機能していないのに、`deleteTenant` は11テーブルに対して `DELETE FROM <table> WHERE tenant_id = ?` を実行していた
- **実装中に発見した事実（重要）**: `routes/tenants.js` は **`app.js` に一度もマウントされていない**——テナント管理API（作成/一覧/取得/更新/削除/APIキー再生成/使用状況）は本番でも全て404で、そもそも到達不能だった。加えて、ルート自体は `requireRole('admin')` のみで `authenticateToken` が欠落しており、`req.user` が一度も設定されないため**マウントしたとしても正規のadminトークンで常に401**になる状態だった（`/tenant`サブパスは外部API-key認証用の別系統のため、この修正では`authenticateToken`を各管理系ルートに個別適用し、`/tenant`系統には影響しないよう配慮）
- **実施した対応**: (1) `tenantController.deleteTenant`を、実データ削除ロジックを完全に取り除いた501応答のみの関数に置換（元のトランザクション削除ロジックはgit履歴に残る）。(2) `routes/tenants.js`の管理系7ルートに`authenticateToken`を適用（`/tenant`外部API-key認証系統は変更なし）
- **未対応（製品判断待ち）**: `routes/tenants.js`は引き続き`app.js`にマウントしていない。マルチテナント化を本実装する（`tenant_id`を全クエリに配線）か、この機能自体を削除するかの判断が必要。マウントした場合、create/list/get/update/regenerate-key/usageは動作するが「テナントを作っても実データは分離されない」という誤解を招く半端な状態になるため、判断が下るまでマウントしないことを推奨
- **検証**: `tests/integration/tenants.test.js`（新規）で`deleteTenant`が501を返しDBに一切触れないことを確認済み
- **再検証**: `grep -n "routes/tenants" backend/src/app.js` → ヒットしなければ未マウントのまま（意図的）。`grep -A3 "exports.deleteTenant" backend/src/controllers/tenantController.js` → 501応答のみならガード済み

### E-4. ✅ 解決済み（2026-07-04） — utils/websocket.jsを削除

- **元の証拠**: どこからも import されていない重複した第2のWebSocketクライアント（253行）
- **実施した対応**: ファイルを削除
- **再検証**: `test -f frontend/src/utils/websocket.js` → 存在しなければ削除済み

### E-5. Stripe課金バックエンド — フロントエンド呼び出しゼロ

- **ファイル**: `backend/src/controllers/billingController.js`, `backend/src/services/stripeService.js`, `backend/src/routes/billing.js`
- **証拠**: frontend/src 内に "billing" への参照が0件
- **推奨アクション**: 保留可（バックエンドは実装済みのため、課金UIを作る段階まで放置してよい）。ただし製品計画に課金がないなら削除候補
- **再検証**: `grep -rln "billing" frontend/src --include="*.js" --include="*.jsx"` → 0件なら未接続のまま

### E-6. ✅ 解決済み（2026-07-04） — getComprehensiveSystemStatsを削除

- **元の証拠**: 「18のプログラミング言語とその機能一覧」というハードコード配列を返すだけの装飾的エンドポイント。過去に削除した約24個の「言語風通知生成」機能群の残骸
- **実施した対応**: `notificationsController.js`から関数を削除、`routes/notifications.js`から`GET /system/comprehensive`ルートを削除
- **再検証**: `grep -n "getComprehensiveSystemStats" backend/src/controllers/notificationsController.js` → ヒットしなければ削除済み

### E-7. ✅ 解決済み（2026-07-04） — 存在しないサービスへのテストを実サービスに向けて修正

- **元の証拠**: `advancedEncryptionService.test.js`が存在しない`advancedEncryptionService.js`を対象にしていた（実在するのは`encryptionService.js`）。常に"Cannot find module"で失敗していた
- **実施した対応**: テストファイルを`encryptionService.test.js`にリネームし、実際に存在する`encrypt`/`decrypt`メソッドを対象にするよう修正（メソッドシグネチャ・出力形式は元テストと一致）。`generateSessionKey`/`getEncryptionStats`という実サービスに存在しないメソッドを対象にしていたテストブロックは削除
- **検証**: 3テスト全て合格
- **再検証**: `test -f backend/tests/services/encryptionService.test.js` → 存在すれば修正済み

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

### D-1. ✅ 解決済み（2026-07-04） — リアルタイム層が事実上ゼロ稼働だった【両側断線】

- **元の証拠**: バックエンド `backend/src/ws.js` は room 配信（`user:`/`platform:`/`dashboard`）を実装済みだったが、(a) フロントエンドが `socket.emit('authenticate', ...)` を一度も送信せずどの room にも参加しない、(b) `POST /api/comments` を処理する `commentsController.js` には `io.emit` 呼び出しが一切なく、socket側のinboundイベント経由でしかブロードキャストされなかった
- **実施した修正**:
  - `frontend/src/hooks/useAuth.js`: アカウント確定時（ログイン成功時・セッション復元時）および socket の `'connect'`（再接続含む）の度に `socket.emit('authenticate', {userId})` と `socket.emit('joinDashboard', 'default')` を送信
  - `backend/src/controllers/commentsController.js`: `broadcastCommentUpdate(req, type, comment)` ヘルパーを追加し、`createComment`（type: 'new'）と `updateComment`（type: 'update'）の成功パスで `req.app.get('io')` 経由の `commentUpdate` を明示的にemit。`io` 未設定（テスト環境等）では何もしない安全なガード付き
  - `frontend/src/hooks/useRealtimeComments.js`: `'update'` タイプのイベントも通すよう修正（従来は `'new'` のみ）
  - `frontend/src/components/CommentTimeline.js`: `useRealtimeComments` を接続し、関連プラットフォームの更新受信時に300msデバウンスで `refetch()`
- **再検証**: `grep -rn "emit('authenticate'" frontend/src` → `hooks/useAuth.js` にヒットすれば修正済み。`grep -n "broadcastCommentUpdate" backend/src/controllers/commentsController.js` → 3箇所ヒットすれば修正済み
- **既知の残課題**: `moderationAction`/`sendNotification` 等、socket側にしか存在しないイベントに対応するHTTP操作（モデレーションアクション等）は今回未対応。必要になった時点で同じ `broadcastCommentUpdate` パターンを横展開すること

### D-2. △ 一部対応済み（2026-07-07） — YouTube実データ取り込みを新規実装（Twitchは未対応）

- **元の証拠**: バックエンドのどのサービスも実際のYouTube/Twitch APIを呼んでいない。`googleapis` パッケージ不使用、`TWITCH_CLIENT_ID` をコードで使用している箇所ゼロ。コメントがシステムに入る経路は `POST /api/comments` のみだった
- **実施した修正**:
  - `commentsController.js`: `createComment` のインラインパイプライン（スローモード判定→モデレーション→保留判定→DB挿入→WebSocketブロードキャスト）を `ingestComment(commentData, {io})` として抽出・export。HTTP経由の投稿と自動取り込みの両方が同一のモデレーション経路を通るようにした（挙動は完全に不変であることを既存テストのビフォーア/アフター比較で確認）
  - `backend/src/services/youtubeIngestionService.js`（新規）: `YOUTUBE_API_KEY` 未設定時はログ警告のみで無効化（クラス定数として保持、要求時にAPI呼び出しをスキップ）。`startWatching(videoId)`/`stopWatching(videoId)` で明示的に監視対象を登録する方式（`search.list`等の高コストAPIは不使用）。`videos.list` で `liveStreamingDetails.activeLiveChatId` を取得後、`liveChatMessages.list` を `setTimeout` ベースで再帰ポーリング（APIレスポンスの `pollingIntervalMillis` を尊重、無ければ設定値の5秒にフォールバック）。取得メッセージは `ingestComment` へ `platform: 'youtube'` で投入
  - クォータ追跡: `videos.list`=1単位、`liveChatMessages.list`=5単位（公式コスト）で日次10,000単位を追跡し、超過時は新規監視開始を拒否・実行中の監視も自動停止。エラー時は指数バックオフ（最大60秒）、5回連続失敗で監視を自動停止
  - `routes/youtube.js`: `POST /watch`（監視開始）・`DELETE /watch/:videoId`（監視停止）・`GET /watch`（一覧+クォータ状況）を追加。既存スタブの `GET /channels/:channelId/comments` は取り込み済みDBコメントの照会に置換（ただしコメント単位でvideoId/channelIdを保持しない現行スキーマの制約上、channelIdでの絞り込みは未対応で全件返却）
  - `server.js`: graceful shutdown時に `youtubeIngestionService.stopAll()` を呼びポーリングを停止
- **検証**: 実APIキーが無い環境のため実際のYouTube API通信は不可。`tests/services/youtubeIngestionService.test.js`（14テスト）で `googleapis` をモックし、監視開始/重複防止/ライブ配信でない場合の拒否/APIエラー処理/メッセージ取り込み/不正メッセージのスキップ/クォータ超過時の開始拒否・実行中停止/監視停止、を検証。`tests/services/youtubeIngestionService.disabled.test.js`（2テスト）でAPIキー未設定時に無効化されAPIを一切呼ばないことを別ファイルで検証（サービスがconfigを読み込む時点でのモジュールスコープ初期化のため、テストファイル単位で分離）。全16件合格、既存テストへの回帰なし（`tests/integration/comments.test.js`と`tests/api/comments.test.js`はリファクタ前後で失敗数・成功数が完全一致することを`git stash`比較で確認）
- **既知の残課題**: Twitch連携（IRC/EventSub）は未着手。channelId単位でのコメント絞り込みには`comments`テーブルへの`video_id`/`channel_id`列追加が必要（今回は見送り、スキーマ変更は製品判断を要するため）
- **再検証**: `grep -rln "googleapis\|liveChatMessages" backend/src/services/` → `youtubeIngestionService.js`にヒットすれば実装済み。`grep -n "ingestComment" backend/src/controllers/commentsController.js` → export含め複数ヒットすれば共通パイプライン化済み

### D-3. ✅ 解決済み（2026-07-04） — メール送信が偽装実装だった

- **元の証拠**: `sendEmail()` は setTimeout でシミュレートし偽の messageId を返すだけで、nodemailer 利用コードはコメントアウトされていた
- **実施した修正**: `nodemailer` を追加インストールし、`SMTP_HOST` 環境変数が設定されていれば実際に `nodemailer.createTransport` 経由で送信、未設定の場合は従来通りログ出力のみのシミュレーションに安全にフォールバック（SMTP未設定の開発環境でも通知パイプライン自体はクラッシュしない）。関連env変数: `SMTP_HOST`/`SMTP_PORT`/`SMTP_SECURE`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM`
- **既知の残課題**: 実際にメールを届けるには運用環境で `SMTP_HOST` 等を設定する必要がある（本書はコード配線の完了を記録するものであり、本番SMTP認証情報の設定は運用側のタスク）。`authController.forgotPassword` からリセットURLを含む本文を送るテンプレート化は未実施
- **再検証**: `grep -n "createTransport\|SMTP_HOST" backend/src/services/notificationChannelService.js` → ヒットすれば修正済み

### D-4. ✅ 解決済み（2026-07-04） — 保留メッセージキューのUIが無かった

- **元の証拠**: バックエンドはコミット `a3b7af1` で実データ化済み（`held_messages` テーブル、getHeldMessages/processHeldMessage/bulkProcessHeldMessages/getMessageHoldStats）だったが、承認/却下を操作するフロントエンド画面が存在しなかった
- **実装中に発見した追加バグ**: 上記の実データ化されたコントローラー関数は、**`routes/moderation.js`にルートとして一度も追加されていなかった**（`GET /api/moderation/held-messages`等は404だった）。「バックエンドは実データ化済み」という前回の記述は不正確で、実際にはAPIとして到達不能だった
- **実施した修正**: `routes/moderation.js`に4ルート追加（`GET /held-messages`、`GET /held-messages/stats`、`PUT /held-messages/:holdId`、`POST /held-messages/bulk`、いずれも`requireRole('moderator')`）。フロントエンドに`api/moderation.js`（新規）・`components/HeldMessagesQueue.jsx`（新規、一覧表示+承認/却下ボタン+ステータスフィルタ）を作成し、`ModeratorDashboard.js`に新タブとして統合
- **検証**: `tests/integration/heldMessages.test.js`（新規、6テスト）で認証拒否・一覧取得・統計取得・承認時の実コメント作成・却下時のコメント非作成・不正holdId/actionの拒否を確認済み。全6件合格
- **再検証**: `grep -n "held-messages" backend/src/routes/moderation.js` → 4件ヒットすればルート修正済み。`grep -rln "HeldMessagesQueue" frontend/src` → `ModeratorDashboard.js`にヒットすればUI統合済み

### D-5. ✅ 解決済み（2026-07-04） — リフレッシュトークンがスタブだった

- **元の証拠**: `exports.refresh`は無条件で401を返すスタブ。`JWT_EXPIRY`（既定24h）経過後、ユーザーは作業中に黙って強制ログアウトされていた
- **実施した修正**:
  - `accounts`テーブルに`refresh_token_hash`/`refresh_token_expires`列を追加（既存の`reset_token_hash`パターン踏襲）
  - `login`: アクセストークンに加え、64byteのリフレッシュトークンを発行しSHA-256ハッシュをDB保存（TTL 30日）
  - `refresh`: ハッシュ照合+期限確認→新アクセストークンと**ローテーションした**新リフレッシュトークンを発行（使用済みの旧トークンは即座に無効化）
  - `logout`/`resetPassword`/`changePassword`: リフレッシュトークンも合わせて無効化（他端末のセッション終了）
  - フロント: `refreshTokenStorage`（`tokenStorage`と同様のsessionStorage実装）を追加。`api/comments.js`のaxiosレスポンスインターセプターで、401受信時に一度だけ`/refresh`を試行→成功時は元リクエストを新トークンで再実行、失敗時のみログイン画面へ遷移
- **検証**: `tests/integration/auth.test.js`の既存リフレッシュテストが実際に意味のある検証になった（従来は`refreshToken`が発行されないため`if (!refreshToken) return`で常にスキップされる空振りテストだった）。ローテーション（使用済みトークンの即時無効化）の検証も追加。全36件合格
- **再検証**: `grep -n "issueRefreshToken" backend/src/controllers/authController.js` → 複数ヒットすれば実装済み。`grep -n "refreshAccessToken" frontend/src/api/comments.js` → ヒットすればインターセプター配線済み

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

### D-9. △ 一部対応済み（2026-07-07） — 残存テスト失敗を142件→113件に削減

- **元の証拠**: `cd backend && NODE_ENV=test npx jest` → 15スイート失敗/142件失敗（367件中）。主因4種を特定: (a) notifications テーブルに `user_id`/`expires_at` 列が無くSQLITE_ERROR、(b) `openaiService.test.js` が実際には未使用の `openaiService_enhanced.js`（527行、参照ゼロ）をテストしていた上にモック構造も不良、(c) `validation.js` の `Joi.date().iso()` がISO文字列をDateオブジェクトへ強制変換していた、(d) `cacheService.js`/`monitoringService.js`/`errorHandler.js` の常駐 `setInterval` がJestのopen-handle検出に引っかかりタイムアウトを誘発
- **実施した修正**:
  - (a) `db.js`: `notifications`テーブルに`user_id TEXT`/`expires_at DATETIME`列を既存の`ensureColumnDefinitions`パターンで追加。`notificationsController.js`の`createNotification`のINSERTに`user_id`を追加
  - (b) `openaiService.test.js`を実際に本番で使われる`openaiService.js`へ向け直し、jestのモックをシングルトンパターンに修正（`resetMocks:true`がコンストラクタのmockImplementationを毎テスト消去するため`beforeEach`で再適用）。参照ゼロだった`openaiService_enhanced.js`は削除。あわせて`openaiService.js`にエラークラス階層・`resetCostTracking()`・レイテンシ/キャッシュ状態フィールドを追加
  - (c) `validation.js:59`: `Joi.date().iso()` → `Joi.string().isoDate()`
  - (d) 3ファイルの`setInterval`に`.unref()`を追加（Jestのopen handle検出数が36→1に減少、本番のgraceful shutdownにも寄与）
- **検証**: 各修正後に`NODE_ENV=test npx jest`をフルスイート実行し、失敗数の悪化がないことを都度確認。最終結果: 142件失敗→113件失敗（367件中）、open handle 36→1
- **既知の残課題**: `tests/integration/notifications.test.js`の残り約20件超は上記(a)とは別の、より深い原因——テストが期待するルート形状（`PUT /:id/read`・`PUT /read-all`・`DELETE /:id`・`GET/PUT /settings`・`POST /test`等）と実際の`routes/notifications.js`のルート定義（`POST /:id/read`・`/users/:id/settings`等、settings/testエンドポイント自体が未実装）が根本的に食い違っている。これはAPI設計そのものの手戻りが必要な規模のため今回は対象外とし、次回監査で別項目として切り出すことを推奨
- **再検証**: `NODE_ENV=test npx jest 2>&1 | tail -5` で failed 件数を確認

### D-10. ✅ 解決済み（2026-07-04） — CriticalAlertsBannerが二重に壊れていた

- **元の証拠**: `frontend/src/components/CriticalAlertsBanner.jsx`（`App.jsx` 直下、全ページ共通表示）が生の `fetch()` で `GET /api/monitoring/alerts` を呼び Authorization ヘッダーを付けていなかった（MonitoringDashboardで直したのと同型のバグ）上、ログイン前（Login画面表示中）から発火していた
- **実施した修正**: `axios.get()` へ置き換えて認証トークンを自動付与、403/401（権限不足）時は驚かせる赤いエラーバナーを出さず静かに何も表示しないよう変更、コンポーネント自体を`App.jsx`の`AuthGate`内（ログイン成功後）に移動してログイン前は描画されないようにした
- **再検証**: `grep -n "fetch(" frontend/src/components/CriticalAlertsBanner.jsx` → 生fetchが残っていれば未対応。`grep -n "CriticalAlertsBanner" frontend/src/App.jsx` → `AuthGate`関数の外にあれば未対応

### D-11. ✅ 解決済み（2026-07-04） — Usersタブが実データに対して機能しなかった

- **元の証拠**: バックエンドに `GET /api/users`（一覧取得）が存在せず、`UserPanel.js` は `userIds=['user1','user2']` をハードコードしていた
- **実施した修正**: `usersController.js`に`listUsers`（platform/status/search フィルタ + ページネーション）を追加し、`routes/users.js`に`GET /`として登録（`GET /:id`より前に配置し、動的パラメータとの衝突が無いことを確認済み）。`UserPanel.js`を検索可能なユーザー一覧+詳細パネルの2ペイン構成に書き換え
- **実装中に発見した追加バグ**: `api/users.js`の`fetchUser`/`fetchUserHistory`/`updateUser`がレスポンス封筒`{status,data,message}`を`.data`で展開せずそのまま返しており、`UserPanel.js`の`user?.status`は実際のユーザー状態ではなく**HTTPステータスコード(200)を表示**していた。さらに`user?.name`は存在しないフィールド参照（実際は`username`）、`history?.map`は封筒オブジェクトに対する呼び出しで**クラッシュしうる**状態だった。全て修正
- **検証**: `tests/integration/listUsers.test.js`（新規、6テスト）で認証拒否・一覧取得・platform/statusフィルタ・検索・`GET /:id`との非衝突を確認済み。全6件合格
- **再検証**: `grep -n "router.get('/'" backend/src/routes/users.js` → ヒットすれば一覧エンドポイント追加済み

### D-12. ✅ 解決済み（2026-07-04） — 登録UIが存在しなかった

- **元の証拠**: `api/auth.js` の `register()` はどのコンポーネントからも呼ばれておらず、初回管理者（ブートストラップadmin）以降のアカウントはcurl等API直叩きでしか作成できなかった
- **実施した修正**: `frontend/src/components/Register.jsx` を新規作成（ユーザー名/メール/パスワード入力、パスワード要件のヒント表示）。`hooks/useAuth.js` に `register()` を追加（登録APIはトークンを返さないため、登録成功後に続けて`login()`を実行し即座に認証済み状態にする）。`App.jsx`の`AuthGate`にログイン⇔登録画面のトグル状態を追加し、`Login.jsx`/`Register.jsx`双方に切り替えリンクを設置
- **再検証**: `grep -rn "from '\.\./api/auth'" frontend/src/hooks/useAuth.js` → `register`のimportがあれば修正済み。`grep -n "Register" frontend/src/App.jsx` → `AuthGate`内で使われていれば修正済み

### D-13. ★ 言語スイッチャーの15言語中13言語が張りぼて

- **証拠**: `frontend/src/i18n.js` の `SUPPORTED_LANGUAGES` は15言語を定義しUIに全表示するが、実在するロケールファイルは `locales/en.json` と `locales/ja.json` のみ。残り13言語（zh-CN, ko, es, fr, de, pt-BR, ru, ar, hi, th, vi, id, tr）を選択すると動的importが失敗し英語へ無言フォールバック。`ar` はRTL反転だけ発生し表示は英語のまま
- **推奨アクション**: (a) 主要言語から順にロケールファイルを追加、または (b) `SUPPORTED_LANGUAGES` を実在するロケールのみに絞る
- **再検証**: `ls frontend/src/locales/` → en.json/ja.jsonの2つのみなら未対応

### D-14. ✅ 解決済み（2026-07-04） — 自動バックアップが一度も起動していなかった

- **元の証拠**: `backupService.js` は cron スケジューリングとファイル書き出しを実装済みだったが、モジュール自体がどこからも `require` されず、コンストラクタが呼ぶ `initialize()` が実行されていなかった
- **実施した修正**: `server.js` で `require('./services/backupService')` してモジュールを読み込み（コンストラクタが自動的に`initialize()`を実行）、graceful shutdown 時に `stopScheduledBackups()` を呼ぶよう追加。あわせて**別のバグを発見・修正**: `backupDatabase()`/`backupConfiguration()`/`backupUploadedFiles()`/`backupLogs()`（および対応するrestore系関数）が `path.join(process.cwd(), 'backend', ...)` という誤ったパス構築をしており（アプリは既に`backend/`ディレクトリから起動するため実際には`backend/backend/...`という存在しないパスを指していた）、一度も正しく動作したことがなかった。`config.database.path`を使うよう修正し、他のパスも二重の`'backend'`セグメントを除去。さらに`sqlite3` CLIが存在しない環境（本検証環境を含む）でSQLダンプが失敗し完全なバックアップを道連れにする問題も、ダンプ部分を独立してフェイルセーフにすることで修正
- **検証**: `performFullBackup()` を実際に実行し、`{success: true, ...}` で完了、17ファイルを含む`.tar.gz`が生成されることを確認済み
- **再検証**: `grep -rln "backupService" backend/src --include="*.js" | grep -v "services/backupService.js"` → `server.js`がヒットすれば修正済み

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
| **D-1 リアルタイム両側配線**（フロントauthenticate送信 + バックエンドcommentUpdate emit追加）・**D-10 CriticalAlertsBanner認証ヘッダー修正+ログイン後描画化**・**`analyzeLinks`/`analyzeSentiment`未定義によるコメント作成の全面ReferenceError修正（最重要）** | 2026-07-04 |
| **D-3 メール送信（nodemailer本接続、SMTP未設定時は安全にフォールバック）**・**D-14 自動バックアップ起動配線 + パス誤り修正（`backend/backend/...`という存在しないパスを一度も参照できていなかった）+ sqlite3 CLI無し環境でのフェイルセーフ化** | 2026-07-04 |
| **D-12 登録UI新規実装**（`Register.jsx`・`useAuth.js`にregister追加・Login⇔Register切り替え） | 2026-07-04 |
| **D-4 保留メッセージキューUI新規実装** + **未発見だったルート欠落の修正**（`getHeldMessages`等はコントローラーのみ実装済みで`routes/moderation.js`に一度もルート登録されておらず404だった） | 2026-07-04 |
| **E-4/E-6/E-7 クイックウィン削除・修正**（死角WebSocketクライアント削除、装飾的エンドポイント削除、壊れたテストを実サービスに向けて修正）・**D-11 ユーザー一覧API新規実装 + UserPanel実データ連動化 + api/users.jsのレスポンス封筒展開バグ修正（HTTPステータスコードがユーザー状態として表示されていた等）** | 2026-07-04 |

## 推奨着手順

1. **D-2 YouTube取り込み**（中規模・製品名の約束を果たす）
2. **E-3 テナント意思決定** ＋ 残りのクイックウィン（E-9/E-13、E-10のCSRFのみ「削除でなく適用」を検討）＋ D-5リフレッシュ実装
3. **D-9 残存テスト失敗の解消**（スキーマ不一致・レスポンス形状不一致から着手）— 今回`analyzeLinks`修正で一部テストの失敗理由が「500クラッシュ」から「別の形状不一致」に変わったことが判明したため、テストごとに現在の実際の失敗理由を再確認してから着手すること
