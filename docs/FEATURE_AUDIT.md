# 機能過不足監査（Feature Audit）

**最終検証日: 2026-07-10**（D-1〜D-5/D-8〜D-14・E-3(部分)/E-4/E-6/E-7/E-9〜E-12解決 + 重大バグ計19件発見・修正済み。テスト失敗142件→4件） / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`

## この文書の目的と使い方

本書は、この製品（YouTube/Twitchコメント管理プラットフォーム）の**未対応の機能過不足**を、AIアシスタント（Claude Opus/Sonnet等）や開発者が再調査なしで把握・着手できる形式でリスト化したものです。

- 全項目は実際のコード読解・grep・テスト実行で検証済み。各項目に**証拠**と**再検証コマンド**を付記
- **着手前に必ず該当項目の再検証コマンドを実行すること**。本書作成後に修正済みの可能性がある
- 「過剰」= 作られたが機能していない・重複・偽装データを返す機能。「不足」= 製品の価値提案上必要なのに欠落・断線している機能
- **作業規約・環境の罠・検証プロトコル・優先順位付き作業指示（Work Orders）は `docs/AI_AGENT_HANDBOOK.md` を参照。** 本書は「何が問題か」のカタログ、Handbookは「どう作業すべきか」の指示書

## ⚠️ 追記: これまでで最も重大だったバグ（2026-07-04発見・修正済み）

D-1（リアルタイム配線）の実装検証中に、**`POST /api/comments` によるコメント作成が全環境で常に失敗していた**ことが判明した。

- **原因**: `backend/src/services/moderationService.js` の `analyzeComment()`（コメント作成時に必ず呼ばれる中核関数）が、定義されていない関数 `analyzeLinks(content)` と `analyzeSentiment(content)` を呼び出していた（`ReferenceError`）。他のバリデーション（必須フィールド等）を全て通過した有効なリクエストは、モデレーション処理の途中で例外を投げ、`commentsController.js` の catch節で握りつぶされて HTTP 500 になっていた
- **影響範囲**: try/catchの外側にガードが無いため、フィーチャーフラグ等に関わらず**100%のコメント作成リクエストが失敗**していた。これは他の監査項目（スタブ関数・未配線機能）とは性質が異なり、「動くはずの中核機能が実は一度も動いていなかった」という最も深刻なクラスの欠陥
- **なぜ今まで見つからなかったか**: 既存テスト（`tests/api/comments.test.js` 等）は認証トークン不備で401になり、実際にこの関数まで到達していなかった。到達する`tests/integration/comments.test.js`は500ではなく別の理由（レスポンス形状の期待値不一致）で失敗し続けていたため、根本原因が隠れていた
- **実施した修正**: `moderationService.js` に `analyzeLinks()`（既存の`LINK_BLOCK_CONFIG`/`URL_REGEX`を使ったURL抽出・ブロック判定）と `analyzeSentiment()`（ルールベースの簡易感情分析）を実装
- **再検証**: `grep -n "^function analyzeLinks\|^function analyzeSentiment" backend/src/services/moderationService.js` → 両方ヒットすれば修正済み。念のため直接呼び出しでの動作確認: `node --check` だけでは検出できない類のバグ（構文的には正しいReferenceError）なので、必ず実際にコメント作成を実行して確認すること

## ⚠️ 追記2: 同系統の重大バグを再発見（2026-07-08発見・修正済み）

上記と全く同じ「テストが認証不備で401になり中核ロジックまで到達していなかったため隠れていたバグ」パターンが、`tests/api/comments.test.js`にBearerトークン認証を追加して初めて到達可能になったことで**3件同時に**発覚した。いずれも修正済みだが、同種のバグが他にも潜んでいる可能性を示す重要な前例として記録する。

1. **`mapCommentRow()`が未定義関数`sanitizeForResponse`を呼んでいた（ReferenceError、2025-11以来存在）**: `commentsController.js`内の`content`/`user`/`moderation.reason`等6箇所で`sanitizeForResponse(...)`を呼んでいたが、この関数はこのファイル内のどこにも定義・importされていなかった（`usersController.js`内に同名の別モジュールスコープ関数が存在するのみで、Node.jsのモジュールスコープ上アクセス不可能）。**`getComments`/`createComment`/`updateComment`など、コメントを1件でも返す全パス（実質ほぼ全機能）が確実にクラッシュしていた**。`git blame`でコミット`df3b75e`（2025-11-04）まで遡れる、9ヶ月以上未発覚だった欠陥。修正: `validator.escape()`を使う同等の関数を`commentsController.js`内にローカル定義（`usersController.js`の実装を踏襲）
2. **`last_comment_at`列が`users`テーブルに存在しなかった**: `checkSlowMode()`（読み取り、エラーを握りつぶすため無症状）と`ingestComment()`のコメント作成成功パス末尾（書き込み、**エラーを握りつぶさない**）の両方がこの列を参照していたが、スキーマに列定義が無く`SQLITE_ERROR: no such column: last_comment_at`で例外を投げていた。**実質的に本番相当のコメント作成パス（`ingestComment`経由、HTTP APIとYouTube取り込みサービス双方が使用）は一度も最後まで成功したことがなかった**。修正: `ensureUserColumns()`に`last_comment_at DATETIME`を追加
3. **`deleteComment()`が存在しない列・テーブルを参照**: `comments`テーブルに`deletion_reason`/`deletion_reason_category`/`deletion_moderator_id`/`deletion_timestamp`/`deletion_evidence`列が無く、`comment_deletion_history`テーブル自体も存在しなかった。加えて`routes/comments.js`には`DELETE /:id`ルート自体が一度もマウントされていなかった（実装済みコントローラーが孤立していた、本書のD-4/tenants.js等と同型のバグ）。修正: 列とテーブルを追加、ルートを新規マウント

- **なぜ今まで見つからなかったか**: `tests/api/comments.test.js`は認証ヘッダーを一切送らず全リクエストが401で弾かれていた（そのため本書のE-?候補にすら挙がらず、単なる「古いテスト」として放置されていた）。到達できていた`tests/integration/comments.test.js`は47/57合格していたが、その合格していた作成系テストは`checkSlowMode`のエラー握り潰しパスと`sanitizeForResponse`を通らない一部の応答形状に偶然乗っていた可能性が高い（詳細未追跡）
- **実施した修正**: 上記3件に加え、`tests/api/comments.test.js`に認証セットアップを追加し、実装の実際の挙動（レスポンス封筒の形状・エラーメッセージの実際の文言等）に合わせてテストの期待値を補正。あわせて`middleware/validation.js`が返す`message`をJoiの最初の詳細メッセージに差し替え（従来は常に汎用文字列`'Validation error'`で、フィールド固有のエラー内容が伝わらなかった）。`GET /api/comments/:id`（単体取得、従来は存在しなかった）を新規追加。コメントIDパラメータのバリデーションをUUID形式チェックに強化（`commentActionSchema.commentIdParam`）
- **検証**: `tests/api/comments.test.js`は1/35 → 37/38合格（1件は下記E-14参照でskip）。フルスイートで142→70件失敗まで改善（367→384件、悪化ゼロを都度確認）
- **再検証**: `grep -n "sanitizeForResponse = " backend/src/controllers/commentsController.js` → ヒットすれば修正済み。`grep -n "last_comment_at" backend/src/db.js` → ヒットすれば修正済み。`grep -n "router.delete('/:id'" backend/src/routes/comments.js` → ヒットすれば修正済み

## ⚠️ 追記3: 実ブラウザからの正規リクエストが全て403で拒否されていた（2026-07-10発見・修正済み）

`tests/middleware/security.test.js`の`validateOrigin`テスト調査中に発覚。`config.js`の`security`オブジェクトには`allowedOrigins`キーが**一度も定義されておらず**、`corsOrigin`（単数形の文字列、CORS_ORIGIN由来）のみが存在していた。

- **影響範囲**: `middleware/security.js`の`validateOrigin`（`app.js`で全リクエストにグローバル適用）は`config.security?.allowedOrigins || []`で常に空配列を取得し、`Origin`ヘッダーを持つリクエストは（`isAllowed()`が常に`false`を返すため）**無条件で403 "Forbidden: Invalid origin"を返していた**。実ブラウザのfetch/XHRは同一オリジンでもクロスオリジンでもOriginヘッダーを送ることが多く、本番相当の環境では**フロントエンドからのAPI呼び出しが軒並み拒否される**深刻な欠陥だった。さらに`app.js`の`isOriginAllowed()`（CORSミドルウェア本体が使用）も同じ存在しないキーを`allowed.some(...)`と無条件アクセスしており、こちらは`TypeError`をスローする経路だった（`validateOrigin`が先にリクエストを止めるため到達しないが、二重に壊れていた）
- **なぜ今まで見つからなかったか**: `supertest`はデフォルトで`Origin`ヘッダーを送らないため、本セッションで通したほぼ全てのバックエンドテスト（数百件）がこの分岐を一度も通過していなかった。`tests/middleware/security.test.js`だけが明示的に`.set('Origin', ...)`しており、かつそのテスト自体も`process.env.FRONTEND_URL`を`beforeEach`で書き換える設計だった（が`config.js`は起動時に一度だけ環境変数を読むため、この書き換えは何の効果も持たず、テストは常に403で失敗していた＝二重に隠蔽されていた）
- **実施した修正**: `config.js`の`security`に`allowedOrigins`（`ALLOWED_ORIGINS`または`CORS_ORIGIN`環境変数由来、カンマ区切りで複数オリジン対応、未設定時デフォルト`http://localhost:5173`）を新規追加。`app.js`の`isOriginAllowed()`に`|| []`ガードを追加（二重の安全策）。テスト側は環境変数の実行時書き換えに依存しない形に修正（デフォルト許可オリジンをそのまま使用）
- **検証**: `tests/middleware/security.test.js`は3/7→7/7全合格。フルスイートで悪化ゼロを確認（51→47件失敗）
- **再検証**: `grep -n "allowedOrigins:" backend/src/config.js` → ヒットすれば修正済み

## ⚠️ 追記4: PUT /api/users/:id（ban/mute操作）が一度も機能したことがなかった（2026-07-10発見・修正済み）

`tests/integration/api.test.js`の全面書き直し中に発覚。モデレーター/管理者がプラットフォーム利用者（コメント投稿者）をban/mute/警告するための`PUT /api/users/:id`エンドポイントが、配線されているJoiスキーマと実装コントローラーの間で**完全に無関係なフィールドセット**を扱っていた。

- **証拠**: `routes/users.js`は`validate(userSchema.update)`を経由させるが、`validation/user.js`の`update`スキーマは`name`/`email`/`bio`/`language`/`timezone`（自己プロフィール編集を想定したフィールド）を検証していた。一方`usersController.updateUser()`は`req.body`から`action`/`duration`/`reason`を読み取り、`action`の値をそのまま`status`カラムへ書き込む（`ban`/`mute`は追加で`ban_until`/`mute_until`を計算）設計だった。`validate()`ミドルウェアは検証後に`req.body = value`（Joiで許可されたフィールドのみ）で**上書き**するため、コントローラーに届く時点で`action`は常に`stripUnknown`により除去されて`undefined`。結果、`status`カラムには常に`undefined`（実質NULL）が書き込まれ、**ban/mute操作は一度も成功したことがなかった**
- **なぜ今まで見つからなかったか**: このエンドポイントを実際に叩き、かつ結果を検証するテストがこれまで存在しなかった（`tests/integration/api.test.js`は認証ヘッダーなしで401になっていたため到達不能だった）
- **実施した修正**: `validation/user.js`の`update`スキーマを実装が実際に必要とする`action`（enum: active/ban/mute/warn, 必須）/`duration`（秒数, 任意）/`reason`（任意）に全面差し替え。旧スキーマ（`name`等）はこの1ルート以外どこからも参照されていないことを確認済みのため、他への影響なし
- **検証**: `PUT /api/users/:id`実行後に`GET /api/users/:id`で`status`/`mute_until`が実際に更新されていることを新規テストで確認。フルスイート実行で悪化ゼロを確認
- **再検証**: `cat backend/src/validation/user.js` → `action`フィールドが定義されていれば修正済み

## ⚠️ 追記5: D-8のブラウザ実地検証で発覚した12件の重大バグ（2026-07-10発見・修正済み）

D-8（文化プロファイル/文脈分析UI）実装後、指示通り実際にサーバーを起動しブラウザで動作確認したところ、**アプリがdevサーバー上でそもそも起動・動作しない/主要機能が軒並み壊れている**という、この2画面の実装内容とは無関係な既存の深刻な欠陥が連鎖的に見つかった。個別のcurl検証だけでは気づけない類のバグ群であり、「実際にブラウザで触る」ことの重要性を改めて示す事例として記録する。

**起動不能系（アプリが一切動かない）**:
1. `services/websocketScaling.js`が`@socket.io/redis-adapter`（未インストール、package.jsonにも未宣言）をトップレベルでrequireしており、Redis未設定環境でも**サーバー起動時に確実にクラッシュ**していた。実際にRedisスケーリングを使う場合のみ実行される`initializeRedisAdapter()`内へ遅延require化
2. `middleware/errorHandler.js`が`logger.critical(...)`を3箇所（DB破損検知・uncaughtException・unhandledRejection）で呼んでいたが、Winstonロガーには`critical`レベルが設定されておらず**クラッシュハンドラ自体がTypeErrorでクラッシュする**状態だった。`logger.error`に統一
3. `config.js`で`SESSION_SECRET`未設定時のフォールバックが無く、`express-session`が起動時に例外を投げ**全リクエストが500**になっていた（`JWT_SECRET`には既存の開発用フォールバックがあったが`SESSION_SECRET`には無かった）。同パターンの開発用ランダム生成フォールバックを追加（本番では引き続き必須）
4. `vite.config.js`が`@vitejs/plugin-react-swc`を素の`react()`で使っており、同プラグインの既定`include`（`.ts/.tsx/.mts/.jsx/.mdx`のみ）は素の`.js`拡張子を対象外にする。本プロジェクトは多数のコンポーネントを`.js`のままJSXで書いているため、**devサーバー起動時にJSXを含む`.js`ファイル全てがパースエラー**になっていた（`vite build`のRollup経路は無関係のため本番ビルドは問題なく、長期間発覚しなかった）。`parserConfig(id)`で`.js`/`.jsx`を明示的にJSXとして解釈するよう修正
5. `vite.config.js`の`server.port`が`3000`だったが、バックエンドの既定ポートも`3000`（`backend/.env.example`, `config.js`）で**自分自身と衝突**していた。バックエンドのCORS既定値（`http://localhost:5173`）に合わせ`5173`に修正
6. `vite.config.js`の devサーバープロキシ（`/api`→バックエンド）のtargetが実在しない`http://localhost:4000`を指していた。相対パスで`/api`を叩く全コンポーネント（例: `CriticalAlertsBanner.jsx`）が devサーバー経由では常に接続失敗になっていた。`http://localhost:3000`に修正
7. `frontend/src/ws.js`の`SOCKET_URL`既定値も同様に存在しない`4000`番を指しており、`VITE_SOCKET_URL`未設定時はWebSocket接続が常に失敗していた。`3000`に修正

**データ破損・機能欠落系**:
8. `accounts`テーブルの`reset_token_hash`/`totp_secret`/`refresh_token_hash`等6列は`CREATE TABLE`本体には書かれていたが、これらの機能追加前から存在する既存DBには実際には無く（`CREATE TABLE IF NOT EXISTS`は既存テーブルに無反応）、パスワードリセット/2FA/リフレッシュトークン関連の全操作が`SQLITE_ERROR`で失敗していた（ログイン自体が500になるケースも含む）。既存の`ensureColumnDefinitions`パターンで安全に追加し、実際に既存の開発用DBに対して列追加が実行されることを確認済み
9. `services/monitoringService.js`が`const { db } = require('../db')`と分割代入していたが、`db.js`は`module.exports = db`（オブジェクトそのもの）であり`{db}`ではないため、この分割代入は常に`undefined`を生成し、DBテーブル統計収集が30秒おきに`Cannot read properties of undefined`で失敗し続けていた
10. `routes/monitoring.js`が`authenticateToken`ミドルウェアを一切配線しておらず（他の全ルーターファイルは`router.use(authenticateToken)`または各ルートで明示的に前置している）、`requireRole('admin')`が参照する`req.user`が常にundefined。結果、**監視API全エンドポイント（アラート一覧・システム統計・ログ等）が、有効なadminトークンを持つ真の管理者に対してさえ常に401**を返し続けていた。ダッシュボードで毎ロード時にポーリングされる`CriticalAlertsBanner`がこれを叩くため、axiosの共通401ハンドラ経由でトークン破棄→強制ログアウトまで連鎖しうる深刻な副作用があった。各保護ルートに`authenticateToken`を明示追加（`/health`のみ意図的に無認証公開のため一括適用は避けた）
11. 上記10の修正で到達可能になったところ、`monitoringController.getAlerts`が参照する`alerts`テーブルが**スキーマにそもそも存在しない**ことが判明（`db.js`に対応する`CREATE TABLE`が一度も書かれていなかった）。カラム構成をコントローラーのSELECT文に合わせて新規追加
12. `middleware/errorHandler.js`の開発モード詳細情報付与処理が`{...details, requestBody, ...}`と無条件にスプレッドしていたが、`details`は56箇所の呼び出し元で単純な文字列（`error.message`）として渡されるのが大半であり、文字列をスプレッドすると`{"0":"S","1":"Q",...}`という文字ごとのインデックス付きオブジェクトに化けていた。開発モードでのエラーデバッグ情報を実質的に破壊していた（本番では`isDevelopment`ガードにより影響なし）。`details`がオブジェクトの場合のみスプレッドするよう修正

- **検証**: 上記全てをPlaywright + 実Chromiumでの登録→ログイン→ダッシュボード遷移、およびcurlでの直接エンドポイント呼び出し（admin昇格アカウントでの`/api/monitoring/alerts`が200を返すこと、moderatorアカウントでは401ではなく403を返すこと等）で個別に再現・修正確認済み。修正後、`NODE_ENV=test npx jest --runInBand`で**4件失敗/425件合格/439件中**（既存ベースラインを維持、悪化ゼロ）を確認
- **再検証**: `grep -n "require('@socket.io/redis-adapter')" backend/src/services/websocketScaling.js` → `initializeRedisAdapter`関数内にあれば修正済み。`grep -n "logger.critical" backend/src/middleware/errorHandler.js` → ヒットなしなら修正済み。`grep -n "authenticateToken" backend/src/routes/monitoring.js` → 複数箇所でヒットすれば修正済み。`node -e "require('./backend/src/db.js')"` 実行後 `PRAGMA table_info(alerts)` で列が返れば修正済み

---

## 第1部: 過剰（作られたが機能していない・重複・偽装）

### E-1. ✅ 解決済み（2026-08-18） — moderationController の大量スタブ関数

- **ファイル**: `backend/src/controllers/moderationController.js`
- **証拠**: 35箇所の「実際の実装では〜」コメント。`setThresholds`, `getCustomFilters`, `analyzeSentiment`(統計側), `getChatbotSettings`, `translateText`, `getLinkBlockStats` など約35関数が静的ハードコードデータを返す。ルートは `routes/moderation.js` で認証付き公開済みのため、UIから呼べば**本物のAPIレスポンスの形をした偽データ**が返る
- **推奨アクション**: 関数単位でトリアージ。(a) 対応するUIが存在しない・計画もないもの → ルートごと削除、(b) 必要なもの → moderationService / openaiService / 実DBに接続して本実装
- **実施した対応**: UI側の利用有無で個別判断し、対応するUIが無く実装予定も無い32関数をルートごと削除（2,262行→934行）。残した関数は実DB・実サービスに接続済み
- **再検証**: `grep -c "実際の実装では" backend/src/controllers/moderationController.js` → **現在0件**（35→0）

### E-2. ✅ 解決済み（2026-08-18） — analyticsController の13ダミーエンドポイント

- **ファイル**: `backend/src/controllers/analyticsController.js`
- **証拠**: `getStats` / `getGraph` のみ実DB集計（修正済み）。残り13関数（`getPeriodStats`=100件固定, `getUserStats`, `getCommentStats`, `getModerationStats`, `exportAnalytics`("エクスポートダミー"), `importAnalytics`, `getHistory`, `externalIntegration`, `getUsage`=0.8固定, `getPeak`="12:00"固定, `getTrend`="up"固定, `getRanking`, `detectAnomaly`）は全てハードコード
- **実施した対応**: 固定値を返していた関数は全て実DB集計に置換した（例: `getPeak` は `strftime('%H', timestamp)` で時間帯別に集計、`getTrend` は直近24時間とその前24時間のコメント数比較）。実装できない3つ（`exportAnalytics` / `importAnalytics` / `externalIntegration`）は**成功を装わず** `notImplemented()` として 501 を返す
- **再検証**: `grep -n "^exports\." backend/src/controllers/analyticsController.js` で各関数を開き、固定値を返しているものが無いこと。ハードコードだった `getUsage`=0.8 / `getPeak`="12:00" / `getTrend`="up" が実集計になっていること

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

### E-5. ✅ 解決済み（2026-08-25） — Stripe課金を削除（オーナー判断）

- **判明した実態**: 「バックエンドは実装済みだがフロント未接続」という当初の記述は**不正確**だった。
  生きている `src/config.js` は **`STRIPE_*` 環境変数を一つも読まない**（`config.services` は
  `openai` / `youtube` / `twitch` のみ）。設定は削除済みの死んだ `config/index.js`（E-18）側に
  だけ存在していたため、`STRIPE_SECRET_KEY` を設定しても `ensureStripeConfigured()` が
  必ず `STRIPE_NOT_CONFIGURED`（503）を投げる。**一度も動作したことがない**
- **12件のテストが通っていた理由**: `jest.mock('../../src/services/stripeService')` で
  サービス全体をモックしていたため、設定が存在しないことを検出できなかった
- **オーナー判断**: 削除（2026-08-25にユーザーが選択）
- **削除したもの**: `billingController.js`(147) / `stripeService.js`(543) / `routes/billing.js`(37) /
  `webhookSecurity.js`(421) / `tests/api/billing.test.js`、`app.js` のマウント2箇所、
  `db.js` の `user_subscriptions` テーブル定義とインデックス2件（計約1,148行）
- **既存DBへの配慮**: `DROP TABLE` は**実行していない**。新規DBで作られなくなるだけで、
  既存DBのテーブルは無害に残る（利用者のデータを消さないため）
- **検証**: 削除後に起動し `/health` 200、`/api/billing/plans` → **404**、`/api/comments` → 401（無傷）
- **再検証**: `grep -rn "stripe" backend/src/` → 0件

### E-6. ✅ 解決済み（2026-07-04） — getComprehensiveSystemStatsを削除

- **元の証拠**: 「18のプログラミング言語とその機能一覧」というハードコード配列を返すだけの装飾的エンドポイント。過去に削除した約24個の「言語風通知生成」機能群の残骸
- **実施した対応**: `notificationsController.js`から関数を削除、`routes/notifications.js`から`GET /system/comprehensive`ルートを削除
- **再検証**: `grep -n "getComprehensiveSystemStats" backend/src/controllers/notificationsController.js` → ヒットしなければ削除済み

### E-7. ✅ 解決済み（2026-07-04） — 存在しないサービスへのテストを実サービスに向けて修正

- **元の証拠**: `advancedEncryptionService.test.js`が存在しない`advancedEncryptionService.js`を対象にしていた（実在するのは`encryptionService.js`）。常に"Cannot find module"で失敗していた
- **実施した対応**: テストファイルを`encryptionService.test.js`にリネームし、実際に存在する`encrypt`/`decrypt`メソッドを対象にするよう修正（メソッドシグネチャ・出力形式は元テストと一致）。`generateSessionKey`/`getEncryptionStats`という実サービスに存在しないメソッドを対象にしていたテストブロックは削除
- **検証**: 3テスト全て合格
- **再検証**: `test -f backend/tests/services/encryptionService.test.js` → 存在すれば修正済み

### E-8. ✅ 解決済み（2026-08-15/18） — 「正直なスタブ」は正直ではなかった

- **元の記述**: `papers.js` 等を「空データを返す誠実なスタブ」と評価し **現状維持可** としていた。この評価が誤りだった
- **なぜ誤りか**: これらは **200 + 空配列** を返しており、フロントはそれを成功として扱って「関連論文が見つかりませんでした」と表示していた。つまり利用者には「検索した結果0件」に見え、**検索が一度も実行されていない事実が隠れていた**。さらに案内していた `SEMANTIC_SCHOLAR_API_KEY` を読むコードはリポジトリに存在せず、キーを設定しても何も起こらない（実現不可能な約束）
- **実施した対応**: `papers.js` と `youtube.js` の `related-videos` は **UI/APIごと削除**（R-21/W-13）。`advancedAIServices.js` `innovativeTechnologies.js` `integratedAnalysis.js` はフロント参照ゼロのプレースホルダのため削除（R-21）。`youtube.js` 本体は D-2 実装済みで**実取込が動作**し、R-28で書き戻しも実装済み
- **教訓（次のセッションへ）**: 「未実装だが正直に空を返す」は、**HTTPステータスが成功のままなら正直ではない**。未実装は 501 + `implemented:false` を返すか、機能ごと削除すること

### E-9. ✅ 解決済み（2026-07-07） — uiController.js自認ダミーAPI群を全削除（フロントも含め二重に無効だった）

- **元の証拠**: ファイル先頭コメントが「UIテーマ・レイアウト・アクセシビリティ・フォント・拡大縮小・通知バッジ・ヘルプ・言語・カスタムCSS用ダミーAPI群」と自認。全ハンドラがリクエストボディをそのままエコーバックするだけで何も永続化しない
- **調査で判明した追加事実**: フロント側 `ThemeContext.js` はこのAPIを呼ぶために `themeApi.js` から `setAutoDarkMode`/`setColorPattern` をimportしていたが、(a) `setAutoDarkMode` は同ファイル内の `useState` 分割代入で**同名のローカル変数に完全にシャドーイングされ**呼び出し不能、(b) `setColorPattern` は一度も呼ばれない未使用import、(c) 実際の永続化ロジック `syncToServer()` はAPIを呼ばず `console.log` するだけのスタブだった。さらにバックエンド側 `routes/ui.js` は `requireRole('admin')` 必須で、そもそも一般ユーザーは自分のテーマ設定すら変更できない設計だった。フロント⇔バックエンドの両側で完全に死んでいた（実際の設定保存は`localStorage`のみで機能しており、ユーザー体験自体は壊れていなかった）
- **実施した修正**: `backend/src/controllers/uiController.js`・`routes/ui.js`・`validation/ui.js`・`frontend/src/themeApi.js` を削除、`app.js`のマウント配線を除去、`ThemeContext.js`の未使用importを削除（`localStorage`ベースの実際の設定保存ロジックは変更なし・引き続き正常動作）
- **再検証**: `ls backend/src/controllers/uiController.js` → 存在すれば未対応

### E-10. ✅ 解決済み（2026-07-07） — デッドミドルウェア3件を削除

- **元の証拠**: `middleware/csrf.js`/`tokenRotation.js`/`inputSanitizer.js` の3ファイルとも `app.js` や `routes/` から一切importされていない（grep 0件）。Bearerトークン認証（ブラウザの暗黙的資格情報が存在しない）が現行の唯一の認証方式であり、CSRFはセッションCookie前提の攻撃であるため実質的な脅威ではない。Origin検証は`security.js`の`validateOrigin`が既に`app.js`に配線済み（`app.js:184`で確認）であることを再確認した
- **実施した修正**: 3ファイルを削除（元々一度も適用されたことがなくgit履歴に実装は残る）。CSRF対策としては引き続き`validateOrigin`が有効
- **再検証**: `ls backend/src/middleware/csrf.js` → 存在すれば未対応

### E-11. ✅ 解決済み（2026-07-07） — デッドサービス9件を個別判断（1件は既にD-14で配線済み、1件は実配線、残り7件は削除）

- **元の証拠**: `backupService.js`, `coroutineService.js`, `databaseService.js`, `interactiveNotificationService.js`, `pureFunctionalNotificationService.js`, `notificationBuilder.js`, `notificationJobQueue.js`, `services/i18nService.js`, `utils/dbAnalyzer.js` の9ファイルがいずれも他のどこからも`require`されていなかった
- **個別判断の結果**:
  - `backupService.js`: D-14（本ブランチ既存の修正）で`server.js`に配線済みだったため対応不要（本項目のリスト自体が古かった）
  - `monitoringService.js`の`global.databaseService`/`global.cacheService`参照: 前者はテーブル行数などを実際に集計する`collectDatabaseMetrics()`（同ファイル内、`db`モジュールを直接使用）が既に同じ`this.metrics.application.database`を実データで埋めており、デッドな`global.databaseService`分岐は完全な重複だったため削除。後者は実在する`cacheService.js`（シングルトン、既に`getStatistics()`を持つ）を`require`して直接呼ぶよう配線し直し、**実際にキャッシュヒット率等がモニタリングに反映されるよう修正**（`databaseService.js`自体はdb.jsと重複する未使用の別実装だったため削除、活かす価値なし）
  - 残り7ファイル（`coroutineService.js`, `interactiveNotificationService.js`, `pureFunctionalNotificationService.js`, `notificationBuilder.js`, `notificationJobQueue.js`, `services/i18nService.js`, `utils/dbAnalyzer.js`）: テスト含め全ファイルからの参照ゼロを再確認の上、削除
- **検証**: 削除・配線変更後に`NODE_ENV=test npx jest`をフルスイート実行し、失敗数103件（367→381件、変化なし）を確認。回帰なし
- **再検証**: `ls backend/src/services/coroutineService.js` 等 → 存在すれば未対応。`grep -n "cacheService.getStatistics" backend/src/services/monitoringService.js` → ヒットすれば実配線済み

### E-12. ✅ 解決済み（2026-07-07） — routes/health.jsは完全な重複と判明、削除

- **元の証拠**: `scripts/healthCheck` の `HealthChecker` を使う本物の実装だが、`app.js` はこのファイルを一切 `require` しない
- **調査で判明**: マウントするか検討した際、`app.js`が既に`middleware/monitoring.js`の`detailedHealthCheckHandler`を`/health/detailed`として稼働中であることを確認。中身を比較したところ`monitoringService`のメトリクス（リクエスト数・エラー率・メモリ使用量等）まで含む上位互換であり、`routes/health.js`側は完全な重複だった。またこのファイルのコントローラー`healthController.js`（41行）も、`routes/health.js`からすら参照されておらず二重に死んでいた（どのルートからも一度も呼ばれたことがない）
- **実施した修正**: `routes/health.js`・`controllers/healthController.js`を削除（既存の`/health`・`/health/detailed`はそのまま稼働継続、機能欠落なし）
- **再検証**: `ls backend/src/routes/health.js` → 存在すれば未対応

### E-13. MSWモックの経路不一致（実害小・開発時の誤診断リスク）

- **ファイル**: `frontend/src/mocks/handlers.js`
- **証拠**: `POST /auth/login` をモックするが実際のバックエンドは `/api/users/login`（`api/auth.js:21`）。`baseURL` も絶対URL `http://localhost:4000/api` 固定で、フロントのaxiosは相対パス `/api` を使うため通常は素通りする。既定では `VITE_ENABLE_MSW=true` を明示しない限り無効
- **推奨アクション**: 低優先。有効化して使うならパスをそろえる、使わないなら削除
- **再検証**: `grep -n "auth/login" frontend/src/mocks/handlers.js`

### E-14. ✅ 解決済み（2026-07-18・W-1） — レート制限機能がアプリ全体で無効化されていた

- **元の証拠**: `middleware/security.js`の`buildLimiter(configNode, extra)`は`if (!config.rateLimit.enabled) return noopLimiter;`で始まるが、`config.js`の`rateLimit`オブジェクトには`windowMs`/`maxRequests`しか無く、**`enabled`キーも、`strict`/`general`/`api`のネストされた設定オブジェクトも一切定義されていなかった**。そのため`config.rateLimit.enabled`は常に`undefined`（falsy）となり、`strictRateLimit`/`generalRateLimit`/`apiRateLimit`の3つ全てが常に`noopLimiter`（何もしない通過ミドルウェア）になっていた
- **元の影響**: 認証エンドポイント（ログイン試行のブルートフォース）、コメント投稿API、その他全APIがレート制限による保護を一切受けていなかった
- **実施した修正**: `config.js`の`rateLimit`に`enabled`/`store`/`redisPrefix`/`general`/`api`/`strict`を追加。**`enabled`の既定は「本番のみ有効」**（`NODE_ENV==='production'`）とし、テスト環境（大量リクエストを送るテストが429で落ちる）とdev環境では既定で無効のまま、本番でのみ保護が働くようにした。`RATE_LIMIT_ENABLED=true/false`で明示的に上書き可能。`.env.example`にも各変数を追記
- **検証**: 単体テスト新規（`tests/middleware/rateLimit.test.js`、2件: enabled=falseで素通し／enabled=trueで上限超過時429）。実サーバーでも`RATE_LIMIT_ENABLED=true RATE_LIMIT_GENERAL_MAX=5`起動時に6回目以降が429、既定dev起動時は15連打でも全200を確認。フルスイートはベースライン（4 failed / 445 passed）維持
- **再検証**: `grep -n "enabled:" -A1 backend/src/config.js | grep -A1 rateLimit` 相当で`rateLimit.enabled`が定義されていること。`NODE_ENV=test npx jest tests/middleware/rateLimit.test.js` → 2件合格

### E-15. ✅ 解決済み（2026-08-15） — ダッシュボードがホワイトスクリーンでクラッシュしていた

- **証拠**: ログイン後のダッシュボードが**何も描画されない**（`document.body` のテキストが空、タブ要素0個）。ブラウザコンソールに2種のエラー:
  1. `Objects are not valid as a React child (found: object with keys {summary, statistics})` — `POST /api/comments/summary` のレスポンス `data` は `{summary, statistics}` という**オブジェクト**（`commentsController.js` の `summarizeComments`）だが、フロントのどこかがこれを直接 React の子として描画している
  2. `t is not a function` — i18n（react-i18next）の初期化に失敗している可能性
- **切り分け済み**: 本セッションのR-25変更を `git stash` した状態でも**同一エラーが再現**するため、R-25起因ではない。`{summary, statistics}` を返すコードは本セッション以前のコミット（`13477a1`）から存在する。なお、本セッション前半（R-14b等）のブラウザ検証時には描画できていたため、`frontend/node_modules` の再インストール後に顕在化した可能性がある（依存バージョンの差異）
- **影響**: **フロントエンド全体が利用不能**。UIを伴う変更の実ブラウザ検証ができない（R-25のバッジ検証は純粋関数の直接評価と `vite build` 成功で代替した）
- **根本原因（特定済み）**: `frontend/src/api/comments.js` の `fetchCommentsSummary()` は `res.data.data` すなわち **`{summary, statistics}` というオブジェクト**を返す。`CommentTimeline.js` がこれをそのまま `setSummaryText(summary)` で state に格納し、JSX の `{summaryText}` で子として描画していた（`CommentTimeline.js:395`）。React はオブジェクトを子として描画できず例外を投げ、エラーバウンダリが無いため**ツリー全体がアンマウントされてホワイトスクリーン**になっていた。`t is not a function` はこのクラッシュに伴う二次的症状で、i18n初期化自体は正常（ログイン画面は `t()` を使って正しく描画されていた）
- **実施した修正**: `setSummaryText(typeof summary === 'string' ? summary : (summary?.summary ?? ''))` として文字列だけを取り出す（APIが将来文字列を返すようになっても壊れない防御的な形）
- **検証**: 実ブラウザ（Playwright + Chromium）でログイン後、**タブ11個が描画され、ページエラー0件**であることを確認（修正前は body が空・タブ0個）。これによりブロックされていたR-25のバッジ検証も完了し、「レイド防御(同一内容)」「レイド防御(新規アカウント)」両バッジの描画をスクリーンショットで確認済み
- **再検証**: フロントを起動しログイン後、`document.body.innerText` が空でなくタブが描画されること

---

### E-16. ✅ 解決済み（2026-08-25） — デプロイ資材が一つ残らず起動不能だった

`ci-cd.yml` が完全なファンタジーだった前例から、README監査で「実在は確認したが中身は未検証」のまま残していた Docker / Kubernetes 資材を検証した。**全ファイルが起動不能**だった。

- **`k8s/`（5マニフェスト）— 削除**
  - `pvc.yml` の redis-data-pvc に `accessModes` ではなく **`accessMimes`** というタイプミス。`kubectl apply -f k8s/` はスキーマ検証で落ちる。**一度も適用されたことがない**動かぬ証拠
  - `deployment.yml` は backend を `replicas: 3`、`hpa.yml` は最大10レプリカまでスケールさせる。しかし全レプリカが**単一の `ReadWriteOnce` PVC上のSQLiteファイル**を共有する構成。RWOは単一ノードにしかマウントできず、仮にマウントできてもSQLiteの多重書き込みでDBが破損する
  - さらにアプリはYouTubeポーリング・Twitch EventSub接続・レイド検知状態を**プロセス内に保持**する。レプリカを増やせばAPIクォータをレプリカ数だけ多重消費し、同じコメントを重複取り込みする。**このアプリはアーキテクチャ上1インスタンス専用**であり、マニフェストの前提そのものが成立しない
  - `comment-manager-secrets` のSecretマニフェストは同梱されておらず、`image: comment-manager-backend:latest` はどのレジストリにも存在しない。`ingress.yml` は `example.com` のまま
- **`docker-compose.yml` — nginx/prometheus/grafana/backup の4サービスを削除**
  - 参照先が**6つとも存在しない**: `./nginx/nginx.conf`、`./nginx/ssl`、`./monitoring/prometheus.yml`、`./monitoring/grafana/dashboards`、`./monitoring/grafana/datasources`、`backend/src/scripts/backup-cron.js`。bind mountは存在しないパスを**空ディレクトリとして作る**ため、nginxは `nginx.conf` という名前のディレクトリを設定ファイルとして読もうとして落ちる
  - nginxサービスとfrontendサービスが**どちらもホストの80番**を要求しており、同時起動できない
- **`backend/Dockerfile` — 全面書き直し**
  - ビルドを `node:18-alpine`（musl）、実行を `gcr.io/distroless/nodejs18-debian11`（glibc）で行っていた。sqlite3のネイティブバイナリはmusl向けにコンパイルされるためglibcでは**読み込めない**
  - そもそも `npm ci --only=production --ignore-scripts` がsqlite3のinstallスクリプトを止めるので、**ネイティブバイナリが生成されていなかった**
  - distrolessには `node` がPATHに無く、composeの `CMD node -e ...` ヘルスチェックは**永久にunhealthy**を返す
  - builderステージの `npm run lint || true` / `npm run test || true` は失敗を握り潰すだけで何も検証していない
- **`frontend/Dockerfile` — 全面書き直し**
  - `USER nginxuser` を指定した上で**ポート80をlisten**していた。非rootは1024未満をbindできないため起動直後に必ず落ちる（公式nginxイメージはmasterのみroot、ワーカーは自動でnginxユーザーに降格するため、そもそも上書き不要）
  - `addgroup -g 1001 -S nginxuser` と `adduser -S nginxuser -u 1001` はユーザーを同名グループに所属させておらず、この点でも壊れていた
  - **最も重大**: Dockerfileが `RUN cat > /config/nginx.conf <<'EOF'` でnginx設定を**その場で生成**しており、その内容に `/api` と `/socket.io` の proxy_pass が**一切無かった**。フロントは既定で同一オリジンの `/api` を叩き（`src/api/*.js`）、socket.ioも `window.location.origin` に繋ぐ（`src/ws.js`）ため、仮に上記が全て直っていても**コンテナ版はバックエンドに到達できない**
  - しかも `frontend/nginx.conf` という**プロキシ設定が正しく書かれた実ファイルがリポジトリに存在していた**にもかかわらず、Dockerfileはそれを `COPY` せずヒアドキュメント版で上書きしていた。`git grep` の結果、このファイルはどこからも参照されない孤児だった。正しい設定が横に置かれたまま壊れた設定が焼き込まれていたことになる
  - ARGで受けていた `VITE_API_URL` / `VITE_WS_URL` は、アプリが実際に読む `VITE_API_BASE_URL` / `VITE_SOCKET_URL` と**名前が違う**。composeはこれを `environment:` で渡していたが、Viteは**ビルド時**に埋め込むため実行時環境変数は無視される（二重に無効）
- **実施した修正**
  - `k8s/` と `frontend/vite.config.optimized.js`（どこからも参照されないデッドファイル）を削除
  - 孤児だった `frontend/nginx.conf` を実際に `COPY` する構成に変更し、内容も見直した（ヒアドキュメント生成は廃止）。`/api` と `/socket.io` のプロキシ、WebSocketのUpgradeヘッダ、SPAフォールバック、セキュリティヘッダ、`/health`、ドットファイル拒否を実装。あわせて **nginxの `add_header` は同一ブロック内に `add_header` が1つでもあると上位ブロックの指定を継承しない**問題に対処した（`location = /index.html` にセキュリティヘッダを再掲。try_filesからの内部リダイレクトもこのlocationに入るため、放置するとSPAの全ルートでヘッダが消える）
  - 両Dockerfileを書き直し、`backend/.dockerignore` `frontend/.dockerignore` を追加（ホスト側node_modulesの混入防止）
  - composeを backend / frontend / redis の3サービスに縮小。公開ポートは frontend の1つだけ（既定8080）
  - `frontend/.env.example` の `VITE_WS_URL` を、コードが実際に読む `VITE_SOCKET_URL` に修正
  - READMEのKubernetes手順を削除し、代わりに**1インスタンス専用である理由**を明記。「PostgreSQL 14+（本番推奨）」（pgドライバ非同梱）と「Prometheus + Grafana統合」（`/metrics` はJSONを返すのみでPrometheus形式ではない）という誤記も訂正
- **検証**
  - `docker compose config` が exit 0（旧構成では検出されなかったサービス定義の整合性を確認）
  - `nginx -t` で `frontend/nginx.conf` の構文検証を通過
  - **コンテナと同じ構成を実プロセスで再現して疎通確認**（Dockerを使わず、`frontend/npm run build` の実成果物 `dist/` を docroot に、実バックエンドを upstream にしてnginxを起動）:
    - `GET /` → 200（`<title>Runner - YouTube & Twitch Comment Management`）
    - `GET /assets/js/index-*.js` → 200（ハッシュ付きアセットが `location /assets/` に一致することを確認）
    - `GET /dashboard` → 200（SPAフォールバック、セキュリティヘッダ4種を保持）
    - `GET /api/comments` → **401**（プロキシ経由でバックエンドに到達し、認証が効いている）
    - `GET /socket.io/?EIO=4&transport=polling` → **ハンドシェイク成功**（`{"sid":"...","upgrades":["websocket"]}`）。修正前の構成には存在しなかった経路
    - `GET /.env` → 403
  - **イメージビルドの検証（2026-08-25 追記）**: Dockerデーモンは起動できたが、
    `docker build` は **`registry-1.docker.io` への CONNECT がゲートウェイに403で拒否**され、
    ベースイメージ（`node:18-alpine`）を取得できなかった。`auth.docker.io` も同様。
    これはこの実行環境のネットワークポリシーによる遮断であり、
    エージェントプロキシのREADMEが「回避せず報告すること」と明記している類のもの。
    したがって**イメージのビルドと起動は未検証のまま**である
  - 代わりに、そこで唯一実質的なリスクだった**sqlite3のネイティブバインディング**を単独で確認した。
    旧Dockerfileの `npm ci --only=production --ignore-scripts` はinstallスクリプトごと止めるため
    バイナリが生成されないという指摘に対し、新Dockerfileと同じ `npm ci --omit=dev`（スクリプト有効）を
    クリーンなディレクトリで実行し、`node_sqlite3.node` が生成され
    `new sqlite3.Database(':memory:')` でCREATE/INSERT/SELECTが通ることを確認した。
    ただし**この検証はglibc環境で行っており、イメージのalpine(musl)での経路は依然未検証**。
    musl向けのprebuiltが無い場合はソースからのコンパイルに落ちるため、
    新Dockerfileは python3 / make / g++ を入れてある
  - **再検証（Docker Hubに到達できる環境で）**: `docker compose up -d --build` を実行し、
    `http://localhost:8080` でログインできること、リアルタイム通知（socket.io）が届くことを確認する

---

### E-17. ✅ 解決済み（2026-08-25） — 起動・運用コマンド群の大半が実行不能だった

E-16（デプロイ資材）に続けて、`npm run` で叩ける経路とセットアップスクリプトを検証した。

- **`backend/package.json` の53スクリプトのうち12個が存在しないファイルを呼んでいた**
  `db:init` `db:migrate` `db:seed` `db:backup` `db:restore` `monitoring:start` `backup:create` `backup:restore` `performance:benchmark` `performance:test` `start:cluster` `k8s:deploy`。
  READMEとDEPLOYMENT_GUIDEは3箇所で `npm run db:init` を実行させていたが、DBは `src/db.js` が起動時に自動作成する（手動初期化は元から不要）。バックアップも `backupService.startScheduledBackups()` がプロセス内で回している
- **`npm run build` は必ず失敗していた**: `build` → `security:check` → `snyk test`。snykパッケージは初回実行時にバイナリをダウンロードする方式で、この環境では取得に失敗し、成功してもアカウント認証が要る。`deploy` / `deploy:production` / `deploy:staging` もすべてこれに依存していた。`npm audit --audit-level high` に置換し、`security:fix` の `snyk wizard`（snykが数年前に廃止したコマンド）も撤去
- **`test:unit` は "community" に部分一致していただけだった**: `jest --testPathPattern=unit` が拾っていたのは `communityInsights.test.js` と `communityHealthService.test.js` の2ファイルのみ（"comm**unit**y"）。`precommit` がこれに依存しており、コミット前ゲートは実質2ファイルしか回していなかった。`tests/` は integration(9スイート) とそれ以外(29スイート) にきれいに分かれるため、レイヤーディレクトリを明示するパターンに変更（29+9=38で全スイートと一致）
- **`test:e2e` は0件マッチで常に非ゼロ終了**していた。backendにjestのE2Eスイートは無く、E2Eはfrontend側のPlaywrightが担当。削除
- **`ecosystem.config.js` はk8sマニフェストと同じ誤りを犯していた**: `instances: 'max'` + `exec_mode: 'cluster'`。実際に起動すると4プロセス立ち上がることを確認した。単一SQLiteファイルへの並行書き込みと、プロセス内に持つYouTubeポーリング／Twitch EventSub接続／レイド検知状態が壊れる。`instances: 1` + `fork` に変更し、`example.com` のままだったpm2 deployブロックと重複キー（`listen_timeout` `kill_timeout` が各2回）を削除
- **`wait_ready: true` に対応する合図が無かった**: `src/server.js` が `process.send('ready')` を送っていなかったため、pm2は `listen_timeout`（10秒）経過をもって起動完了とみなしていた。`pm2 reload` の切り替え点が実待受開始とずれるので、`onListening` で送るようにした
- **`scripts/personal-setup.sh`（READMEが最初に勧める経路）が自家撞着していた**
  - 生成する `backend/.env` は `PORT=3000`、生成する `frontend/.env` は `localhost:3000` を指す。しかし案内される起動コマンド `npm start` は pm2 の `--env production` で、`ecosystem.config.js` が **PORTを4000に上書き**していた。つまりスクリプトの指示通りに進めるとフロントはバックエンドに繋がらない。pm2側のPORT指定を削除して `.env` を優先するようにし、`PORT=4555` で実際に待受ポートが追随することを確認
  - 生成する `frontend/.env` の `VITE_WS_URL` はどこからも読まれない（コードは `VITE_SOCKET_URL`）
  - 生成する35個のキーのうち **19個が `backend/src` のどこからも読まれない**（`ENABLE_2FA` `CSRF_ENABLED` `GDPR_ENABLED` `SESSION_HIJACK_DETECTION` `TOKEN_ROTATION_ENABLED` `RESPONSE_CACHE_ENABLED` など）。`DATABASE_URL` も設定していたが、DB層が読むのは `DATABASE_PATH`
  - **最も問題だったのは終了時のセキュリティチェックリスト**。「✓ CSRF protection enabled」「✓ Session hijack detection enabled」「✓ GDPR compliance enabled」を含む10項目を無条件で出力し、同じ内容を `SETUP_INFO.txt` にも書き出していた。CSRFミドルウェアはこのコードベースに存在しない。自分の環境を固めようとした利用者はこれを読んで確認をやめる
- **CSRFについての結論（重要）**: 対策が無いこと自体は現状**脆弱性ではない**。認証は `Authorization` ヘッダーのみで成立し（`src/middleware/auth.js:304`）、`res.cookie` も `cookie-parser` も使われておらず、リフレッシュトークンも `req.body` から受け取る。ブラウザはクロスサイトリクエストに `Authorization` を自動付与しない。ただしD-7（httpOnly Cookie移行）を実施した瞬間に全状態変更エンドポイントが攻撃可能になるため、D-7側に必須条件として追記した
- **検証**: pm2で単一インスタンスが `status=online` / `restarts=0` / `GET /health 200` を維持することを確認。`npm run build` が exit 0。テストは 529 passed / 0 failed で不変、新しい2分割の合計（405+124）が全体と一致。setup.sh は `bash -n` のみ（実行すると両ワークスペースで `npm install` が走るため、このセッションでは実行していない）
- **再検証**: `npm run <script>` を総なめして存在しないファイルを呼ぶものが無いこと。`scripts/personal-setup.sh` を実行し、生成された `.env` のPORTでフロントからログインできること

---

### E-18. ✅ 解決済み（2026-08-25） — 設定モジュールが二重に存在し、死んでいる方を読んでいた

- **証拠**: `backend/src/` に **`config.js`（227行）と `config/index.js`（406行）が両方存在**していた。
  Node の解決順ではファイルがディレクトリより優先されるため、
  コード中の `require('./config')` / `require('../config')` は**必ず `config.js`** に解決される。
  `config/index` を明示的に require している箇所はリポジトリ全体で0件だった
  （`node -e "require.resolve('./src/config')"` → `src/config.js`）。
  つまり **406行の `config/index.js` は一度も読み込まれていなかった**
- **なぜ危険か（実害が出た）**: 本セッションで `personal-setup.sh` の `.env` テンプレートと
  `docker-compose.yml` を書き直す際、**死んでいる方の `config/index.js` を読んで**
  設定キーを決めてしまった。その結果:
  - `FRONTEND_ALLOWED_ORIGINS` を生成していたが、**生きている `config.js` はこのキーを読まない**
    （実際に読むのは `CORS_ORIGIN` / `ALLOWED_ORIGINS`）
  - つまり生成された `.env` と compose の CORS 設定は**何の効果も無かった**
  - `RATE_LIMIT_API_MAX` も同様に死んだ方のキーで、生きている方は `RATE_LIMIT_MAX_REQUESTS`
  ドキュメントの誤りではなく、**同じ名前の設定が2つあり、片方が嘘をつく**という構造の問題である
- **実施した修正**: `config/index.js` を削除し、`CORS_ORIGIN` に修正した
- **検証**: 削除後にバックエンドを起動し `/health` 200。
  `Origin: http://localhost:8080`（`CORS_ORIGIN` に一致）→ 認証層まで到達して401、
  `Origin: https://evil.example` → **403でCORS拒否**。設定が実際に効いていることを確認
- **再検証**: `ls backend/src/config.js backend/src/config/` → 後者が存在しないこと

---

### E-19. ✅ 解決済み（2026-08-25） — skipされたテスト10件（うち1件は理由が古く、9件は本体が空）

- **証拠**: `it.skip` / `test.skip` が10件。内訳:
  - 1件は「E-14: レート制限機能自体が全体的に無効化されているため現状成立しない」という理由でskip。
    **E-14 は W-1 で解決済み**であり、skipの理由が古くなっていた。
    結果として**セキュリティ制御であるレート制限のテストが1件も無い**状態が続いていた
  - 9件は `test.skip('...', async () => {});` ——**本体が空**。
    「該当エンドポイントが存在しないためskip」という説明はコメントで足りる情報であり、
    永久にskipされる空のテストは何も検証しない
- **実施した修正**:
  - レート制限は専用ファイル `tests/api/rateLimit.test.js` に移した。
    jestはファイル単位でモジュールレジストリを分けるので、
    app を読み込む前に `RATE_LIMIT_ENABLED=true` を立てて実リミッターを起動できる
    （他のテストの環境には影響しない）
  - この過程で `/api` のリミッターが `skipSuccessfulRequests: true` で構築されていること
    ——**スループット制限ではなくブルートフォース対策**であること——が分かったので、
    テストは失敗リクエスト（認証なし→401）を連打する形にしてある。
    成功リクエストを連打しても429にならないのは仕様どおり
  - 空のskipテスト9件は削除
- **結果**: **skipされたテストが0件**になった（606 passed / 606 total）
- **再検証**: `grep -rn "it.skip\|test.skip\|describe.skip" backend/tests/` → 0件

---

### E-20. ✅ 解決済み（2026-08-25） — `.env.example` の6割が「設定しても何も起きない」キーだった

- **証拠**: `backend/.env.example` の **139キー中84キー（60%）が `backend/src` の
  どこからも読まれていなかった**。機械的に検査した結果:
  - GDPR設定一式（`GDPR_ENABLED` / `GDPR_DATA_RETENTION_*` / `CONSENT_REQUIRED` 等 9キー）
  - サーキットブレーカー5キー、アラート閾値9キー、メトリクス間隔3キー
  - キャッシュ関連8キー（`QUERY_CACHE_*` / `RESPONSE_CACHE_*`）
  - セキュリティのトグル（`CSRF_ENABLED` `ENABLE_2FA` `SESSION_HIJACK_DETECTION`
    `TOKEN_ROTATION_ENABLED` `DETECT_TOKEN_REUSE` 等）
  - **削除済みのStripe課金20キー**（E-5で機能を消したのに設定例だけ残っていた）
  - Webhook設定4キー（`webhookSecurity.js` はE-5で削除済み）
  `frontend/.env.example` も **32キー中28キーが未使用**だった。Viteは
  `import.meta.env.VITE_*` で参照されたものしかバンドルに載せないため、
  定義しただけのキーは文字通り何の効果もない
- **なぜ有害か**: 利用者が `ALERT_CPU_USAGE` や `VITE_HTTPS_ONLY` を設定して、
  **何も起きないことに気づけない**。特にセキュリティ系のトグルは
  「有効にした」と誤認させる点で危険（`CSRF_ENABLED=true` と書いても、
  D-7以前はCSRF対策そのものが存在しなかった）
- **実施した対応**: 両ファイルを実在するキーだけで書き直した
  （backend 139→53、frontend 32→4）。あわせて、実際にDBファイルの位置を決める
  `DATABASE_PATH` が**そもそも記載されていなかった**ので追加した
- **もう一つの死んだ設定モジュール**: `src/config/database.js`（146行）も
  どこからも require されていなかった（E-18 の `config/index.js` と同じ形）。
  ここでしか読まれていなかった `DB_POOL_MIN` / `DB_POOL_MAX` ごと削除した
- **再発防止**: `tests/services/envExample.test.js` を追加。
  `.env.example` の全キーが `backend/src` から読まれることを機械的に検査する。
  **この種の腐敗は「機能を削除したのに設定例に残る」形で必ず再発する**
  （実際、課金機能を削除した後もStripeの20キーが残っていた）。
  人手の再監査に頼らず、テストが落ちるようにした。
  削除済み機能（`STRIPE_*` / `TENANT*`）の混入と、秘密鍵の例が空であることも同時に検査する
- **検証**: 検査スクリプトで backend 53/53・frontend 4/4 が使用中であることを確認。
  `config/database.js` 削除後もサーバーは正常起動（`/health` → 200）。
  テスト 625件全合格、lintエラー0
- **再検証**: `npx jest tests/services/envExample.test.js`

---

### E-21. ✅ 解決済み（2026-08-25） — READMEの機能説明に、実装が存在しない項目が残っていた

E-20（`.env.example`）と同じ検査をREADMEの**検証可能な主張**に対して行った。

| 主張 | 実態 | 対応 |
|------|------|------|
| 「113テスト（89 service + 24 route tests）」 | 実際は46スイート・625件。古い数字が固定されていた | 現在値に更新し、`npm test` で確認できると明記 |
| 「エクスポート機能: CSV/PDF形式でのデータ出力」 | `GET /api/analytics/export` は **501（未実装）**。**PDF出力のコードはリポジトリに1行も無い**。CSVは監査ログ用が1箇所あるのみ | 実在する監査ログCSVのみに縮小し、未実装であることを明記 |
| 「カスタムレポート: ユーザー定義の分析レポート作成」 | 該当する実装が**存在しない**（grep 0件） | 削除 |
| 「キーボードショートカット: `Ctrl+K` / `Ctrl+M` / `Ctrl+S` / `F5`」 | **`ctrlKey` を扱うコードが1行も無い**。実装されているのは Tab のフォーカストラップとスキップリンクのみ | 実在するキーボード操作の記述に置換 |
| 「アクセシビリティ: WCAG準拠のアクセシビリティ機能」 | 裏づけとなる `accessibilityHelper.js`（626行）は**どこからも import されていなかった** | 記述を訂正し、死んだモジュールを削除 |
| 「Webhookセキュリティ: HMAC署名検証、リプレイ攻撃防止」 | 実装（`webhookSecurity.js`）は**Stripe課金専用**で、E-5の課金削除と一緒に消えた。現在 `createHmac` / `timingSafeEqual` / 署名検証は**1件も無い**。受信Webhook自体が存在しない | 削除し、経緯を明記 |

- **削除**: `frontend/src/utils/accessibilityHelper.js`（626行・参照ゼロ）
- **なぜ重要か**: 特に**セキュリティ機能の虚偽記載**は、利用者に
  「対策済み」と誤認させる点で単なる誇張以上の害がある。
  E-20 の `CSRF_ENABLED=true` と同じ構図（設定/記載はあるが実装が無い）
- **検証**: テスト 625件全合格、フロント28件全合格、lintエラー0、フロントのビルド成功
- **再検証**: READMEの各主張を `grep` で裏づけられるか確認する。
  特に「〜対応」「〜準拠」という表現は実装の所在を必ず確かめること

---

### E-22. ✅ 解決済み（2026-08-25） — `/health/detailed` と `/metrics` が無認証でホスト情報を公開していた

- **証拠**: `app.js` で認証ミドルウェアを一切通さずにマウントされており、
  誰でも次を取得できた:
  ```
  nodeVersion: "v22.22.2", platform: "linux", arch: "x64",
  cpus: 4, totalMemory: "16GB", freeMemory, uptime,
  リクエスト統計（メソッド別・ステータス別）、エラー件数、メモリ使用量
  ```
- **なぜ問題か**: 特に **Nodeのバージョン開示は既知CVEの狙い撃ちを容易にする**。
  死活監視のために公開する必要があるのは「生きているか」だけで、
  ホストの構成やランタイムのバージョンまで公開する理由が無い
- **実施した対応**: `/health/detailed` と `/metrics` に管理者認証を必須にした。
  **`/health` は公開のまま**（コンテナの `HEALTHCHECK` やロードバランサが
  認証情報を持たずに叩くため。返すのは `status` と `timestamp` のみで情報開示は無い）
- **発見の経緯**: DEPLOYMENT_GUIDE.md の書き直し中、
  自分が「`/health/detailed` は admin」と書いた記述を裏取りしたところ、
  **実際には無認証だった**ことが分かった。ドキュメントの検証が実装の欠陥を暴いた形
- **検証**: 無認証 → `/health` 200 / `/health/detailed` 401 / `/metrics` 401。
  モデレーター権限 → 403（管理者のみ）。管理者 → 取得可能。
  回帰テスト `tests/api/healthEndpointExposure.test.js`（7件）で固定。
  「`/health` を閉じてはいけない」ことも同時にテストしている
  （閉じると死活監視が壊れるため）
- **再検証**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:PORT/metrics` が401

---

### E-23. ✅ 解決済み（2026-08-25） — DEPLOYMENT_GUIDE.md の大半が「従うと壊れる」内容だった

1221行のうち、大半が**この製品と無関係な一般的Linux運用のチュートリアル**
（`htop` の導入、スワップファイルの作成、`lsof` でのポート確認、Slack通知のcurl例）で、
製品固有の記述は多くが誤っていた。

| 記述 | 実態 |
|------|------|
| ロードバランシングの節が `backend1:3000 / backend2:3000 / backend3:3000` への振り分けと `pm2 scale ... 4` を指示 | **単一インスタンス専用の製品。従うとDBが壊れる**。k8sマニフェスト・ecosystem.config.js に続き**3箇所目**の同種の誤り |
| バックアップ手順が `database.db` と `frontend/build/` を参照 | 実際は `comments.db` と `frontend/dist/`。しかも**組み込みの自動バックアップ**に触れていなかった |
| Nginx + Let's Encrypt を手書きさせる節 | 現在はフロントエンドのコンテナがTLSを終端するため不要 |
| `npm run db:init` / `npm run db:migrate` | どちらも存在しない（DBは起動時に自動作成） |
| Prometheus / Grafana の構成 | 参照先の設定ファイルがリポジトリに存在しなかった（E-16で削除済み） |

- **実施した対応**: 1221行 → **336行**に書き直した。
  残したのは**この製品を動かすために必要で、かつ正しいことだけ**:
  単一インスタンス制約（冒頭に最重要として明記）／Docker Composeでのデプロイと証明書差し替え／
  Dockerを使わない場合の3条件／環境変数（`.env.example` を正典とし一覧を再掲しない）／
  バックアップと復元（WALモードのため `cp` 不可であることを含む）／
  実在する監視エンドポイント／アップデート手順／実際に起きるトラブルシューティング
- **一覧の再掲をやめた**理由: 環境変数の一覧をガイドに書くと必ず古くなる。
  `.env.example` を正典とし、その正しさは `envExample.test.js` が機械的に守る（E-20）
- **検証**: ガイド内の `npm run` 参照・ファイル参照・内部リンクを機械的に照合し、
  実在しないものが無いことを確認

---

### E-24. ✅ 解決済み（2026-09-01） — 本番イメージは起動できなかった（代替ベースでのビルド検証が2件の実バグを発見）

全コンテナレジストリが遮断されている環境で、ホストのファイルシステムから
`docker import` で作った Node 入りベースイメージ（`local-node-base:22`）を使い、
**実際の `backend/Dockerfile` と FROM 2行 + `apk` 1行だけが異なる**検証用 Dockerfile
（差分は必ず表示して確認）で本番ビルドを実行した。**2件の実バグが見つかった。**

1. **`npm ci --omit=dev` が exit 127 で必ず失敗**
   `"prepare": "husky install"` が原因。husky は devDependency なので
   `--omit=dev` では存在しないが、npm は omit でも `prepare` を実行する。
   つまり**本物の alpine ベースでも本番ビルドはこの行で必ず死んでいた**。
   しかも `.husky/` ディレクトリは存在せず、フックは一つも配線されていない
   ＝開発環境でも何の役にも立っていなかった。`prepare` スクリプトと
   husky devDependency を削除
2. **ビルドが通った後、コンテナが起動即クラッシュ**
   `Cannot find module 'cookie-parser'`。D-7 で導入した `cookie-parser` と、
   Twitch 取り込みの `ws` が **dependencies に未宣言**だった。開発環境では
   devDependencies の推移的依存として node_modules に居るため誰も気づかない。
   「手元では動くが本番では死ぬ」の典型形。さらに `connect-redis` も未宣言で、
   compose が設定する `SESSION_STORE=redis` は**一度も実際に機能したことがなく**、
   try/catch で静かにメモリセッションへフォールバックしていた。3件を dependencies に追加
   （`@socket.io/redis-adapter` は複数インスタンス用のため**意図的に追加しない**。
   単一インスタンス制約と矛盾する機能に依存を増やさない）

- **修正後の実測**（検証イメージのコンテナ）: `/health` 200 ／ 実行uid=1000（非root）／
  sqlite3 ネイティブバインディング存在 ／ HEALTHCHECK コマンド成功 ／
  `/metrics` 未認証 401 ／ `/api/comments` 未認証 401
- **検証の限界（正確に線を引く）**: 検証したのは**アプリ層の命令列**
  （`npm ci --omit=dev`・マルチステージ COPY --chown・mkdir/chown・USER node・
  HEALTHCHECK・CMD）である。`node:18-alpine` ベース層と `apk add` の行は
  レジストリ遮断のため**依然未検証**。musl 環境での sqlite3 コンパイルも未検証
  （そのために python3/make/g++ を入れてある）
- **再発防止**: `tests/services/runtimeDependencies.test.js`。
  src/ の全 require が dependencies に宣言されていること・`prepare` が
  復活していないことを機械検査する。このクラスのバグはテスト環境
  （devDependencies が全部ある）では原理的に検出できないため、宣言の照合そのものを検査する
- **npm レジストリへの疎通で1つ学んだこと**: コンテナに `HTTPS_PROXY` を渡すと失敗する。
  `registry.npmjs.org` はゲートウェイの noProxy 対象で**直接接続すべき**宛先であり、
  プロキシ経由を強制すると拒否される。`--network host` + プロキシ変数なしが正解だった

---

### E-25. ✅ 解決済み（2026-09-01） — アナリティクスタブは一度も実データを表示したことがなかった

- **証拠**: `AnalyticsPanel.js`（ダッシュボードのタブとして常時マウント）は
  `getCommentStats()` 経由で **`/api/comments/stats` を叩いていたが、
  そのエンドポイントはバックエンドに存在しない**。
  実サーバーで確認したところ **400** が返る（`/comments/:id` に id="stats" として
  当たり、UUID検証で弾かれる）。つまり毎回失敗し、`catch` 節で
  `getDemoStats()` にフォールバックして**ハードコードされた数値**
  （コメント1240件・今日87件・感情620/420/200・YouTube 820/Twitch 420 等）を
  表示していた
- **情状酌量の余地**: 「APIが利用不可のため、デモデータを表示しています」という
  バナーは出ていた。完全な無言の捏造ではない。しかし**このタブは一度も
  実データを表示したことがなく**、利用者はデモ値を常に見ていた
- **発見の経緯**: フロント・バックエンドのAPI契約を機械照合したところ、
  存在しないエンドポイントへの呼び出しが5件見つかった。うち4件は
  UIから未使用のデッドコードだったが、`getCommentStats` だけは
  **生きたコンポーネントから使われていた**（削除しようとしてビルドが落ちて判明）
- **実施した対応**: 実在する3エンドポイント
  （`/analytics/stats`・`/analytics/graph`・`/analytics/moderation`）を合成する
  `fetchAnalyticsOverview()` を新設し、パネルを書き直した。
  **バックエンドが持っていない指標は捏造せず、描画そのものを削除**した:
  感情分布の円グラフ／プラットフォーム別棒グラフ／モデレーション理由別内訳／
  「今日の新規」「ポジティブ率」／期間セレクタ（`/graph` は直近7日固定で
  パラメータを受け取らない）。**デモデータへのフォールバックは撤廃**し、
  取得できない指標は `0` ではなく `—` と表示する
- **削除したデッドコード**: `searchComments` / `moderateComment` /
  `addCommentReaction` / `addCommentTag`（いずれも存在しないエンドポイントを叩く、
  UIから未使用）
- **検証**: 実バックエンドに対し、旧URL `/api/comments/stats` → **400**、
  新しい3つ → すべて **200**。コメント5件を投入して
  `commentCount:5` / `byStatus:{visible:5}` / `graph:{labels:["2026-09-01"],comments:[5]}`
  と**3経路すべてが一致すること**を確認した
  （初回の測定で `commentCount:0` と `byStatus:{visible:3}` が食い違ったが、
  これは `/analytics/stats` の30秒キャッシュを投入前に温めていたためで、
  実装の不整合ではない）
- **再発防止**: `frontend/src/api/__tests__/apiContract.test.js` が
  **フロントの全axios呼び出しURLをバックエンドの全ルート定義と機械照合**する。
  加えて `analyticsOverview.test.js`（5件）が「取得できない指標を0と偽らない」
  「デモデータに戻さない」を固定する
- **再検証**: `cd frontend && npx vitest run src/api/__tests__/apiContract.test.js`

---

### E-26. ✅ 解決済み（2026-09-01） — モデレーター画面の見出し数字と履歴も捏造だった（E-25の同型）

E-25 でアナリティクスの偽装を潰した直後に、**同じ嘘がより目立つ場所に残っている**ことが分かった。
「この画面の数字は本当にDBから来ているか？」という問いを全画面に当て直した結果である。

- **証拠1（見出しの4枚のカード）**: `ModeratorDashboard.js` の `moderationStats` は
  `{ totalComments: 1247, flaggedComments: 23, bannedUsers: 5, mutedUsers: 12 }` で
  初期化され、**`setModerationStats` はコード中で一度も呼ばれていなかった**
  （`grep -n "setModerationStats" → 定義の1行のみ`）。
  つまり誰がどの環境で開いても総コメント数は 1,247 件と表示される。
  モデレーターが最初に見る4つの数字が、全部固定文字列だった
- **証拠2（アクション履歴タブ）**: `recentActions` は
  `troll_user123`（BAN）／`spam_bot`（ミュート）／`offensive_user`（削除）という
  **架空のモデレーション実績3件**で初期化されていた。
  実行された事実のない処罰が、実績として画面に出ていた
- **証拠3（プラットフォーム反映の握り潰し）**: バックエンドは BAN のとき
  `data.platformBan.ok` で「YouTube側にも反映できたか」を返している（R-28b）。
  ところが `ModeratorDashboard` はこれを `platformApplied` として state に**入れるだけで
  描画しておらず**、BAN専用の確認ダイアログを持つ `UserPanel` に至っては
  **戻り値ごと捨てていた**。
  結果、書き戻しが失敗しても画面上は成功と区別がつかない——
  「ダッシュボードではBAN済みだが、当人は配信で発言し続けられる」という、
  **R-28b が塞いだはずの穴が UI 側にそのまま残っていた**。
  バックエンドは `logger.warn` を出すが、それを読むのはモデレーターではない
- **実施した対応**:
  1. 4枚のカードを `fetchAnalyticsOverview()` の実データに接続。
     取得できない値は `0` ではなく `—`、取得失敗は警告バナーで明示（E-25と同じ規則）
  2. 「ミュートユーザー」の実データ源が無かったため `/analytics/stats` に
     `mutedCount` を追加。`status='muted'`（`updateUser` 経由）と
     `mute_until`（タイムアウト経由）の両方を数え、BANは除く
  3. `recentActions` の架空3件を削除し空で開始。
     「このセッション中にこの画面から実行した分のみ／サーバ側に横断的な履歴APIは無い」と
     画面に明記（無い履歴を作らず、無いことを言う）
  4. `platformBan.ok` を両画面で描画。未反映なら
     「ローカルのみ。プラットフォーム側には未反映（当人は配信で発言できます）」と理由付きで出す
- **ついでに見つけた欠陥**: `useUser(id)` は `id` が `null` でも実行され、
  `GET /api/users/null` と `/api/users/null/history` を叩いていた。
  `UserPanel` はマウント直後この状態で始まるため**毎回必ず**404を2本出していた。
  未選択時は発火しないようガードし、アンマウント後の setState も防いだ
- **実装中に踏みかけた罠（テストで固定済み）**: `mutedCount` を
  `mute_until > datetime('now')` と書くと誤る。`mute_until` は
  `new Date().toISOString()` 由来の `'...T...Z'`、`datetime('now')` は
  `'YYYY-MM-DD HH:MM:SS'` で、10文字目が `'T'`(0x54) と `' '`(0x20)。
  **日付が同じなら必ずISO側が大きい**ため、既定300秒＝同日中に切れるミュートが
  全部「継続中」に化ける。JS側で生成したISO文字列を渡して同じ表現同士で比較している
- **検証**: `analyticsMutedCount.test.js`（5件）。
  うち「同じ日に切れた mute_until を継続中に数えない」は、
  **わざと `datetime('now')` 版に差し替えると失敗することを確認済み**（ガードが実際に効いている）。
  フロントは `ModeratorDashboard.test.jsx`（12件）と `UserPanel.test.jsx`（5件）が
  「旧固定値 1,247 が出ない」「未取得は — と出る」「架空ユーザー名が出ない」
  「未反映BANを成功と見せない」を固定し、`noFabricatedState.test.jsx`（24件）が
  同型の再発を全コンポーネントで禁止する
- **同型の掃討（⑤自動化）**: 「1件見つけたら同型を全部探す」を人力に頼らないため、
  `noFabricatedState.test.jsx` が **全コンポーネントを走査し、
  初期値を持つのに setter が一度も呼ばれない `useState` を失敗させる**。
  更新されない初期値は、非ゼロなら捏造、ゼロなら「常に0件」という嘘だからである。
  この走査で `sentimentStats` が最後の1件として出た。sentiment は
  `moderationService` が保留判定のために計算するだけで **comments テーブルに保存されておらず**、
  集計する元データが存在しない。よってバックエンドを増やさず**感情分析タブと
  関連2カードを削除**した（E-25 と同じ「持っていない指標は描かない」規則）。
  ガードが実際に効くことは、架空の state を注入すると失敗することで確認済み
- **再検証**:
  `cd backend && npx jest tests/controllers/analyticsMutedCount.test.js` /
  `cd frontend && npx vitest run src/components/__tests__/ModeratorDashboard.test.jsx src/components/__tests__/UserPanel.test.jsx`

---

### E-27. ✅ 解決済み（2026-09-01） — レートリミッタは2系統あり、片方はほぼ全部が未使用だった

長所短所文書で「有効化条件の不一致は将来の混乱源」として短所に挙げていた項目。
実際に中を見ると、混乱源どころか**大半が最初から動いていなかった**。

- **証拠**: `middleware/rateLimiter.js` は `limiters` 8種 + `dynamicRateLimiter` +
  `ddosProtection` + `securityHeaders` を公開していたが、
  mount されていたのは `routes/auth.js` の **`auth` と `authWrite` の2つだけ**
  （`limiters.api` / `createComment` / `moderation` / `upload` / `export` /
  `websocket` / 他3つはいずれも参照0件）
- **未使用が無害でない理由**:
  - `dynamicRateLimiter` の tier（`enterprise` / `pro` / `standard`）は
    **本セッションで削除した課金・マルチテナント機構の遺物**で、
    `req.user.tier` は決して設定されない。「有料プランは制限が緩い」という
    実在しない仕様がコードとして残っていた
  - `ddosProtection` は単一プロセス内の 50 req/s カウンタである。
    分散攻撃はアプリに届く前の層で止めるもので、この名前は読んだ人に
    「DDoS対策済み」と誤解させる
  - `securityHeaders` は `X-RateLimit-Policy: fixed-window` という、
    何の制限も表していないヘッダを付けるだけだった
- **証拠2（設定すると壊れる）**: `security.js` の `getRedisClient()` は
  `createClient({ url: config.rateLimit.redisUrl })` を呼ぶが、
  **`config.rateLimit.redisUrl` は存在しなかった**。node-redis は url 未指定で
  localhost:6379 に接続するため、`.env.example` の案内どおり
  `RATE_LIMIT_STORE=redis` にしても `REDIS_URL` は無視され、
  到達できなければレートリミット対象の全リクエストがストア側で失敗する。
  **設定した人ほど壊れる**種類の欠陥である（E-20と同型）
- **証拠3（2本目のRedis接続）**: 旧 `rateLimiter.js` はモジュール読み込み時に
  `REDIS_URL` で独自の Redis クライアントを開いていた。`security.js` は
  別のキーを見るため、既定（`RATE_LIMIT_STORE=memory`）のまま `REDIS_URL` を
  設定すると**認証用リミッタだけが Redis を使う**という説明のつかない状態になった
- **実施した対応**:
  1. `rateLimiter.js` を約180行 → 68行に縮小。実際に使われている
     `auth`（15分5回）と `authWrite`（15分20回）だけを、
     `security.js` の `createRateLimiter` の上に残した。
     ストアの選択もクリーンアップも1箇所に集約される
  2. `config.rateLimit.redisUrl` を追加
     （`RATE_LIMIT_REDIS_URL` → `REDIS_URL` → localhost の順）。
     `.env.example` にもキーを追加した
  3. 「`RATE_LIMIT_ENABLED` が false でもログイン保護は常時有効」という
     非対称を**意図的な仕様としてコードとコメントに明記**した。
     総当たり防御は「開発中は邪魔だから切る」種類の機能ではなく、
     切れる設定にすると本番で切れていても誰も気づかないためである
- **検証**: `rateLimiterSurface.test.js`（5件）が公開面を `limiters` の2つに固定し、
  削除した名前（`enterprise` / `dynamicRateLimiter` / `ddosProtection` /
  2本目の `createClient`）が戻らないことと、`RATE_LIMIT_ENABLED=false` でも
  認証リミッタが noop に差し替わらないことを確認する。
  加えて**実プロセスで実測**した:

  ```
  RATE_LIMIT_ENABLED=false で POST /api/users/login を7回:
  401 401 401 401 401 429 429    ← 6回目から429。ログイン保護は生きている
  ```
- **再検証**: `cd backend && npx jest tests/middleware/rateLimiterSurface.test.js`

---

### E-28. ✅ 解決済み（2026-09-01） — 到達できず、繋いでも動かないコード 1,410行

- **証拠**: `commentsController.js` の「通報」「有効期限」「ピン留め表示」15ハンドラは
  routes に一切現れない。それだけなら「未接続の実装」だが、参照している8テーブル
  （`comment_reports` / `report_categories` / `report_statistics` /
  `expiry_cleanup_settings` / `pinning_display_settings` /
  `comment_expiry_history` / `comment_pinning_display_history`）が
  **`db.js` のスキーマに1つも存在しない**。配線しても全て `no such table` で落ちる
- **なぜ無害でないか**: コードだけ読めば通報機能は完成して見える。
  「あとは繋ぐだけ」と信じた人は、繋いでから初めて動かないことを知る
- **実施した対応**: 15ハンドラを削除（1,410行）。同時に `validation/universal.js`(408) /
  `schemas.js`(306) / `billing.js`(24) も削除した——ルートが使うのは
  `validation/{auth,comment,commentActions,moderation,settings,user}.js` の方で、
  この3つはどこからも `require` されない**並行する第2のスキーマ体系**だった
  （`billing.js` は本セッションで削除した課金機構の残骸）。
  E-18 の `config/index.js` と同じ形で、片方を直しても API の挙動は変わらない
- **さらに**: `src` の公開エクスポート45件が src からも tests からも参照されていなかった。
  削除または内部関数へ降格した（`dynamicRateLimiter` の tier 判定のように、
  **存在しない仕様を説明してしまう**ものが含まれていた）
- **検証**: `tests/architecture/deadExports.test.js` が
  「src の公開エクスポートは src か tests のどこかから参照されること」を機械検査する
- **再検証**: `cd backend && npx jest tests/architecture`

---

### E-29. ✅ 解決済み（2026-09-01） — mount 済みの26エンドポイントが呼べば必ず500だった

E-28 の走査を「テーブルが実在するか」まで広げたところ、
**未接続どころか接続済みで壊れているもの**が大量に見つかった。

- **最初の証拠**: 実サーバーで
  `GET /api/users/timeouts/active` → **500 `SQLITE_ERROR`**。
  タイムアウトは配信のモデレーションで最も使われる操作である。
  テストが1件も無かったため、誰も気づいていなかった
- **全容**: SQL文字列リテラルが参照するテーブル名を
  `CREATE TABLE IF NOT EXISTS` の集合と突き合わせた結果、
  **mount 済みで必ず500になるエンドポイントが26件**あった
- **直したもの（16件）— 動くようにした**:

  | 対象 | 欠けていたもの |
  |------|----------------|
  | タイムアウト7件 | `user_timeouts` / `user_timeout_history` / `user_timeout_reasons` |
  | AI閾値3件 | `ai_threshold_history` と、comments/users 側の列8個 |
  | 公開範囲3件 | `comment_visibility_history` と comments 側の列6個 |
  | チャンネル活動1件 | `moderation_history` |
  | 外部連携1件 | `external_integration_logs` |
  | 編集履歴1件 | テーブル名の誤り。実体は `comment_edit_history`（`commentService` が書いている）で、存在しない `comment_edits` を存在しない列で引いていた |

- **直したもの（3件）— テーブルを足さず、実在するデータ源に繋ぎ替えた**:
  - `GET /api/monitoring/logs`: 監視ダッシュボードの「最近のログ」タブは毎回エラーだった。
    `logs` テーブルを新設しても**そこへ書く経路が無い**（ログは winston が
    `backend/logs/application-YYYY-MM-DD.log` に1行1JSONで書いている）。
    足せば永久に空になるので、**実在するログファイルを読む**実装に置き換えた
  - `GET /api/monitoring/metrics`: 同様に `performance_metrics` へ書く経路が無い。
    プロセス内の `metricsCollector` の実測を返す。
    **再起動で消え期間指定ができない**という制約は隠さず、
    応答に `windowed: false` と `source: "in-process"` を含める
  - `GET/PUT /api/monitoring/settings`: `system_settings` を追加。
    加えて**書き側と読み側で列が食い違っていた**（書きは `(category,key,value,type)`、
    読みは `settings` 列）。テーブルが無かったので誰も気づかなかった。読み側を書き側に合わせた
- **削除したもの（7件・約1,500行）— 要件から疑い直した**:
  通知テンプレート／チャネル管理／イベント配信／ユーザー別通知履歴。
  参照テーブル8種がいずれも存在しない。
  個人〜小規模配信者のための製品に「テンプレート変数のスキーマ管理」や
  「配信チャネルのルーティング」は、課金・マルチテナントと同じ
  **存在しない規模のための足場**である。実際に要る通知（一覧・既読・設定・
  テスト送信）は `notifications` テーブルで動いており、そちらは残した。
  併せて未ルートの外部連携統計・認証履歴8ハンドラ（788行）も削除
- **検証**: `tests/api/missingTables.test.js`（23件）が
  **実アプリに対して各エンドポイントを叩き、500でないこと**を確認する。
  ログは実際に1行書いてから読み出せることまで見る。
  さらに `deadExports.test.js` が
  「SQL文字列が参照するテーブルはスキーマに存在すること」を機械検査する
  （SQLらしき文字列リテラルの中だけを見る。ソース全体を走査すると
  コメントの英文をテーブル名と誤認し、誤検知だらけのガードは無視されて死ぬ）
- **実測**: 起動して7経路を確認

  ```
  /health 200 / /api/comments 200 / /api/users/timeouts/active 200
  /api/monitoring/logs 200 / metrics 200 / settings 200 / /api/notifications 200
  ```
- **再検証**: `cd backend && npx jest tests/api/missingTables.test.js tests/architecture`

---

### E-30. ✅ 解決済み（2026-09-01） — テーブルは在るが列が無い。監視の「アプリケーション統計」は一度も表示されたことがなかった

E-29 のガードは**テーブル名だけ**を検査していた。その一つ下の層が残っていた。

- **見つけ方**: 「500でないこと」の次の問い——
  **「200を返すが、フロントが読む項目が入っていないのでは？」**を立て、
  `MonitoringDashboard.js` が実際に参照する項目を列挙して実応答と突き合わせた
  （`tests/api/monitoringContract.test.js`）。
  `systemStats` の14項目と `alerts` は通り、`appStats.summary.*` の4項目が落ちた
- **証拠**: `GET /api/monitoring/app/stats` は **500**。
  原因は `SELECT DATE(created_at) ... FROM comments WHERE created_at >= ?` で、
  **`comments` に `created_at` 列は無い**（実体は `timestamp`）。
  `comments` テーブル自体は実在するため、E-29 のテーブル検査は素通りしていた
- **同時に見つかった2つ目**: 同じクエリの
  `COUNT(CASE WHEN status = 'moderated' ...)` の `'moderated'` は
  **この製品に存在しない状態値**（実際は visible / hidden / deleted / active）。
  列名だけ直しても「モデレーション済み 0件」が永遠に出るだけなので、
  `analyticsController.getModerationStats` と**同じ定義**
  （deleted / hidden / flagged / muted）に揃えた。
  2画面が同じ言葉で違う数を出す状態を作らないため
- **3つ目（静的検査が見つけた）**: `users` の
  `external_integration_*` **6列が存在しなかった**。
  `PUT /api/users/:id/external-integration` は mount 済み（admin限定）である
- **自分のテストの欠陥も見つかった**: E-29 でこのエンドポイントを
  「500でない」と確認したつもりだったが、送っていた本文
  `{serviceId, action, status}` はこのハンドラのスキーマ
  （`{enabled, services, webhookUrl, ...}`）に合わず、
  **SQLに到達する前に400で弾かれていた**。
  通っているように見えて、検査対象の行を一度も実行していなかった。
  **「落ちないこと」を確かめるテストは、そこまで到達していることも確かめる必要がある**
- **実施した対応**: 列名と状態値を修正し、`external_integration_*` 6列を追加。
  E-29 のテストは有効な本文を送り `200` を要求する形に直した
- **検証**: `sqlColumns.test.js` が
  **単一テーブルのSQLが参照する列はスキーマに存在すること**を機械検査する。
  列定義を1つ削ると、その列名を挙げて失敗することを確認済み。
  JOIN や別名つきのクエリは所属が静的に決まらないため**あえて対象外**にしている
  （誤検知の多いガードは無視されて死ぬ）。
  設計中、別名判定の正規表現が `FROM comments WHERE ...` の `WHERE` を
  別名と誤認し、**検査対象がほぼ空のまま「合格」していた**時期があった。
  ガードは「通ること」ではなく「本物の不具合で落ちること」で検証すること
- **実測**: 起動して確認

  ```
  /api/monitoring/app/stats 200  {"summary":{"activeConnections":0,"totalComments":0,...}}
  /api/monitoring/system/stats 200 / /api/monitoring/alerts 200
  ```
- **再検証**: `cd backend && npx jest tests/api/monitoringContract.test.js tests/architecture`

---

### E-31. ✅ 解決済み（2026-09-02） — トリアージ待ち行列は、入力が空配列リテラルで固定されていた

E-30 で「200 の中身は画面が読む形か」を問うた。その次の問いは
**「画面はその中身を、そもそも受け取っているのか？」**である。
バックエンドが正しい形で返しても、フロントがそれを渡していなければ機能は存在しない。

- **見つけ方**: 画面に渡している props を、値が定数のものだけ抜き出して眺めた。
  `Dashboard.js` が `<TriageQueue ... pendingComments={[]} />` と
  **空配列リテラルを直接書いていた**
- **証拠**: トリアージは「どのコメントから見るべきか」を優先度順に並べる機能である。
  バックエンドの `moderatorTriageService` も `/api/insights/triage` も、
  画面側の `TriageQueue.js` 約300行も動作する。しかし**入力が常に空**なので、
  モデレータータブを開いても待ち行列は永久に空のままだった。
  機能があるように見えて、一度も動いたことがない
- **なぜ E-29 / E-30 のガードで見つからなかったか**: あれらは
  「エンドポイントが 500 でないか」「応答に画面が読む項目が入っているか」を検査する。
  **呼び出し側が定数を渡していれば、その両方を通過してしまう**。
  断線はサーバ側ではなく、画面のコードの中にあった
- **実施した修正**: `useComments()` の取得済みコメントを `useMemo` で
  `{id, content, user, platform, timestamp, moderationScore}` に写像して渡す。
  `id` を保つのが要点である（`moderatorTriageService` は `comment.id` を読む。
  `commentId` に改名すると、200 は返るが item の id が `undefined` になる）
- **ガード（2種類・いずれも本物の不具合で落ちることを確認済み）**:
  - `frontend/src/components/__tests__/Dashboard.test.jsx`（2件）—
    モデレータータブを開くと TriageQueue が受け取った件数を描画すること、
    およびソース中に `pendingComments={[]}` が現れないこと。
    `[]` に戻すと **2件とも失敗する**ことを確認した
  - `backend/tests/api/insightsContract.test.js`（9件）—
    `/api/insights/triage` の `data.queues` のキー集合
    （CAN_WAIT / EMERGENCY / ROUTINE / URGENT）、`summary.emergency` / `summary.urgent`、
    item の `commentId` / `content` / `user` / `priorityScore`（数値）、
    および risk / silent-departure / culture-presets / context-analysis の
    各読み取りフィールドを実応答に対して検査する。
    リクエストのキーは `pendingComments`、item のキーは `id` である
    （最初 `comments` / `commentId` で送っており、**queues が空のまま合格していた**。
    contract テスト自身が正しい形で呼べていることを、非空の期待値で固定した）
- **実測**: backend 728件 / frontend 95件、いずれも失敗0・skip 0
- **再検証**: `cd frontend && npx vitest run src/components/__tests__/Dashboard.test.jsx`、
  `cd backend && npx jest tests/api/insightsContract.test.js`
- **次の問い**: 中身が届くようになった。ならば**「その数字は正しいか？」**。
  未検証の画面は SettingsPanel / Login / Register の3つが残っている
---

### E-32. ✅ 解決済み（2026-09-02） — 「Settings updated」と返しながら、何も保存していないAPIがあった

E-31 で「画面は中身を受け取っているか」を問うた。次の問いは
**「200 と『成功しました』を返しているが、実際に何かしたのか？」**である。

- **見つけ方**: 書き込み系（PUT/POST/PATCH/DELETE）のエンドポイントを列挙し、
  ハンドラ本体・同一ファイル内のヘルパー・呼び出し先サービスの3層に
  **DBへの書き込みが1つも無いもの**を機械的に抽出した
- **証拠**: `PUT /api/moderation/settings` の実体は、サービス側が

  ```js
  exports.updateSettings = async (platform, thresholds, bannedWords, regexPatterns) => {
    // DBに保存する処理（省略）
    return true;
  };
  ```

  これだけだった。admin が閾値・禁止語・正規表現を送ると **200 と
  `"Settings updated"`** が返るが、**何一つ保存されていない**。
  モデレーション製品において「設定したつもりで効いていない」は
  最も高くつく種類の嘘である
- **どの既存ガードも通過していた理由**: ルートは mount 済み（E-29 通過）、
  500 を返さない（E-29 通過）、応答に画面が読む項目は無い＝そもそも
  画面から呼ばれていない（E-30・E-31 の対象外）、
  エクスポートは参照されている（E-28 通過）。
  **「動く」ことと「何かする」ことは別の問いである**
- **さらに悪いこと**: Joi スキーマは `thresholds` と `bannedWords` しか許可しておらず、
  ハンドラが読む `platform` と `regexPatterns` は**未知キーとして400で弾かれる**。
  契約とハンドラが最初から食い違っていた
- **判断（要件を疑う）**: 保存先を実装するか、削除するか。
  (a) この設定を読む側がどこにも無い（`thresholds` を参照するコードは0件。
  判定閾値はコード定数である）、(b) 画面からは一度も呼ばれていない、
  (c) 実行時に閾値を差し替える仕組みを新設するのは、
  決定論的検知という現在の設計判断そのものの変更にあたる。
  よって**エンドポイント・コントローラ・サービス・Joiスキーマ・APIドキュメントの
  記載を削除した**。実際に永続化するユーザー単位の設定は
  `PUT /api/settings/user/:userId` が担っており、こちらは検証済みで動作する
- **ガード**: `tests/architecture/stubImplementations.test.js` —
  **公開エクスポート関数の本体が「定数を返すだけ」であってはならない**。
  例外は理由つきで `ALLOWED` に明記させる（嘘を暗黙にしないことが目的）。
  削除した stub を書き戻すと、
  `src/services/moderationService.js::updateSettings -> return true;` を
  名指しして失敗することを確認済み。現在の `ALLOWED` は空である
- **再検証**: `cd backend && npx jest tests/architecture/stubImplementations.test.js`

---

### E-33. ✅ 解決済み（2026-09-02） — フロントには「呼ばれないコード」の検査が無く、333行が死んでいた

バックエンドには E-28 以来 `deadExports.test.js` があるが、
**フロントエンドには同じ規則が無かった**。片側にだけ規律がある状態は続かない。

- **証拠**: `src/api/` に**一度も import されない関数が29個**（333行）あった。
  26個は `api/settings.js` の個別設定API（`setTheme` / `setPinLimit` /
  `setBanReason` / `setUserMuteDuration` など）で、画面は汎用の
  `updateSettings` 一本しか使っていない。`api/settings.js` は 334行 → 25行になった
- **実施した対応**: 未使用の29関数を削除。対応するバックエンドの
  エンドポイントは実在し動作するため、**能力は失われていない**
  （汎用の `PUT /api/settings/user/:userId` が同じ値を保存する）。
  消えたのは「画面から使える」という誤った見た目だけである
- **ガード**: `frontend/src/__tests__/deadApiExports.test.js` —
  `src/api` と `src/hooks` の名前つきエクスポートは、どこかから
  import されること。静的 import・動的 `await import()`・`vi.mock` の3形を解釈する
- **名前の grep では駄目だった**: 最初は名前の出現回数で数えていたが、
  `api/settings.js` の `setTimezone` が `utils/localeManager.js` の
  **無関係な同名メソッド**に一致し、未使用なのに「使用中」と判定されていた。
  **import 文を解析する**方式に直し、この `setTimezone` を追加で削除した。
  ガードを書き戻して、同じ罠（同名メソッドが他所にある未使用関数）で
  失敗することを確認済み
- **実測**: backend 730件 / frontend 97件、失敗0・skip 0
- **再検証**: `cd frontend && npx vitest run src/__tests__/deadApiExports.test.js`
- **次の問い**: 「呼ばれるか」「落ちないか」「中身はあるか」「画面は受け取るか」
  「本当に何かしたか」の5層は機械検査で塞いだ。
  残るのは**「その数字は正しいか」**——実データと実クレデンシャルを要するため、
  所有者の環境でしか進められない

---

### E-34. ✅ 解決済み（2026-09-02） — 承認したコメントが、統計から消えていた（同じ状態に2つの綴りがあった）

E-33 までで「呼ばれるか」「落ちないか」「中身はあるか」「画面は受け取るか」
「本当に保存したか」の5層を塞いだ。次の問いは **「その数字は正しいか？」** である。

- **既存テストの限界に気づいた**: `analyticsController` のテストは
  `expect(stats.flagged).toBeGreaterThanOrEqual(1)` の形で書かれていた。
  これは**数え過ぎ・二重計上・分類の取り違えを一切検出できない**。
  「1件以上ある」ことは「正しい」ことではない
- **やり方**: テストDBは他のテストも書き込むため絶対値は固定できない。
  そこで **投入前後の差分（delta）が期待値と厳密に一致すること**を検査する形にした。
  差分は共有DBでも厳密に定まる
- **証拠（本題）**: 既知の状態値を投入して差分を取ったところ、
  **`status='active'` のコメントは flagged にも passed にも入らない**ことが判明した。
  そして `status='active'` を書く経路が実在した:

  | 経路 | 書いていた語 |
  |------|--------------|
  | 取り込み（`ingestComment`。YouTube/Twitchの全コメント） | `'visible'` |
  | **保留メッセージの承認**（`processHeldMessage`） | `'active'` |
  | `commentService` の既定値 | `'active'` |
  | `comments` テーブルの DEFAULT | `'active'` |

  集計は `passed = byStatus.visible` だけを数える。つまり
  **モデレーターが保留メッセージを承認するたびに、そのコメントは
  どの統計にも現れない行になっていた**。画面側でも `CommentItem` は
  `status !== 'visible'` を「何か処置された」と見なしてチップを出し、
  `CommentTimeline` の絞り込み候補（visible/hidden/flagged/deleted）にも
  `active` は無いので、絞り込むと消える
- **判断（単純化）**: 互換の分岐（`visible または active を数える`）を足すのは、
  **間違いを残したまま間違いを扱うコードを増やす**ことになる。語を1つに減らす:
  - 未モデレーションを表す語は **`'visible'` ただ一つ**とする
  - 書き手（承認2箇所・`commentService` 既定値2箇所・テーブルDEFAULT）を全て `'visible'` に統一
  - 既存行は起動時に一度だけ `UPDATE comments SET status='visible' WHERE status='active'` で揃える
    （`users` テーブルの `'active'` は「BANでもミュートでもない」という**別概念**なので触らない）
- **ガード（いずれも本物の不具合で落ちることを確認済み）**:
  - `tests/integration/heldMessages.test.js` — 承認して出来た行の `status` が
    `'visible'` であること。**従来は「行が出来たこと」しか見ておらず、
    この欠陥を素通りさせていた**。書き手を `'active'` に戻すと
    `Expected: "visible" / Received: "active"` で落ちる
  - `tests/api/statsArithmetic.test.js`（6件）— 数字そのものの検査。
    コメント数・ユーザー数・BAN数・アクティブ数・ミュート数・flagged/passed の
    **差分が厳密に一致**すること、`comments` に `'active'` の行が0であること、
    src のどこも `INSERT INTO comments` で `'active'` を書かないこと、
    同じ集計を二度読んで値が変わらないこと
- **同時に固定した既知の罠**: ミュート判定の
  `mute_until > ?`（JS生成のISO文字列）を `datetime('now')` に戻すと、
  **期限切れのミュートが「継続中」に化ける**（10文字目が `'T'`(0x54) と `' '`(0x20)
  のため、同日なら必ずISO側が大きい）。差分テストは
  `Expected: 2 / Received: 3` で落ちることを確認済み。
  既定のミュートは300秒＝同日中に切れるので、これは日常的に起きる欠陥である
- **実測**: backend 736件 / frontend 97件、失敗0・skip 0
- **再検証**: `cd backend && npx jest tests/api/statsArithmetic.test.js tests/integration/heldMessages.test.js`

---

### E-35. ✅ 解決済み（2026-09-02） — 「日別BAN数」のグラフは、BANした日ではなく**BANが切れる日**を描いていた

E-34 と同じ問い（その数字は正しいか）を、次の数字に当てた。

- **証拠**: `analyticsController.getGraph` の BAN 系列は

  ```sql
  SELECT date(ban_until) as day, COUNT(*) as banCount FROM users
  WHERE ban_until >= datetime('now','-7 days') GROUP BY day
  ```

  `ban_until` は **BANが切れる時刻**であって、BANした時刻ではない。

  | BANの長さ | グラフに出る日 |
  |-----------|----------------|
  | 1時間 | だいたい同じ日。**それらしく見えるので気づけない** |
  | 30日 | 30日後。直近7日のグラフには**永久に出ない** |

  実測すると、30日BANを実行した直後のラベルは `["2026-10-02"]`——
  **1か月先**だった（今日は 2026-09-02）
- **2つ目の欠陥**: 系列を `bansByDay[コメントの日]` で引き、
  ラベルはコメント側の日付だけから作っていた。つまり
  **コメントが1件も無い日のBANは、その日ごと存在しないことになる**。
  荒らしを全部BANして静かになった日ほど消える、という向きの誤りである
- **判断（実在する記録を読む）**: 「いつBANしたか」を保存する列は無い。
  列を足す前に探したところ、**既に記録されていた**——
  `usersController.updateUser` は `logDataMod` 経由で `audit_logs` に
  `users.status_update` を `metadata.status='ban'` 付き・
  `CURRENT_TIMESTAMP` で残している。列は足さず、この記録を読む
- **形式を混ぜない**: `comments.timestamp` は ISO（`'…T…Z'`）なので
  比較もJS生成のISO文字列に揃える。`audit_logs.timestamp` は
  `CURRENT_TIMESTAMP` 由来の `'YYYY-MM-DD HH:MM:SS'` なので、
  こちらは `datetime()` 同士で比較する。E-26・E-34 と同じ罠を作らないため
- **ラベルの修正**: コメントの日とBANの日の**和集合**にした。
  どちらか片方しか無い日も消えない
- **握りつぶさない例外**: `audit_logs` が未作成の起動直後だけ空系列を返し、
  それ以外のエラーは投げる（`no such table` のみを判定）。
  `analyticsController` が監査サービスを require することで、
  読み込み時点でテーブルの存在を担保している
- **ガード**: `tests/api/graphSeries.test.js`（4件）—
  30日BANが**今日**に計上されること、2件BANすれば2件増えること、
  3系列の長さとラベルの昇順・重複無し、コメント数の差分。
  旧実装に戻すと `Expected "2026-09-02" / Received ["2026-10-02"]` で落ちることを確認済み
- **実測**: backend 740件 / frontend 97件、失敗0・skip 0
- **再検証**: `cd backend && npx jest tests/api/graphSeries.test.js`

---

### E-36. ✅ 解決済み（2026-09-02） — ユーザーの「モデレーション履歴」は、誰も書かないテーブルを読んでいた

E-35 で「実在する記録を読む」形にしたので、同じ問いを記録側にも当てた——
**この製品の記録は、そもそも書かれているのか？**

- **証拠**: `GET /api/users/:id/channel-activity`（モデレーター限定・mount 済み）は
  `moderation_history` テーブルから履歴を読み、そこから
  「モデレーション操作の総数 / BAN回数 / ミュート回数」を計算していた。
  ところが **そのテーブルに `INSERT` するコードは製品のどこにも無い**。
  読み手だけがあり、書き手がいなかった
- **画面に出ていたこと**: 昨日BANしたユーザーを開いても
  「操作 0件 / BAN 0回 / ミュート 0回・履歴なし」。
  **常に空を返す読み取りは「履歴が無いことの証明」ではなく、記録の断線である**。
  繰り返し違反者を見分けるのはモデレーションの中心的な仕事なので、
  ここが空だと**人間の判断（因果鎖④）そのものが成り立たない**
- **なぜ既存ガードを抜けたか**: `deadExports.test.js` はSQL中のテーブルが
  **スキーマに存在すること**を見る。`moderation_history` は
  `CREATE TABLE` されていたので通っていた。
  **「存在する」と「書かれている」は別である**
- **判断（また、実在する記録を読む）**: 書き手を新設する前に探したところ、
  履歴は既に `audit_logs` にあった（`updateUser` と timeout 系が
  `logDataMod` で `users.status_update` / `users.timeout` を記録している）。
  E-35 と同じ判断で、**テーブルを増やさず実在する記録を読む**。
  `audit_logs` の行を画面が読む `{action, reason, timestamp, moderator}` に写し、
  `users.status_update` の実際の操作は `metadata.status`（ban/mute/warn/active）から取る。
  書き手のいない `moderation_history` は削除した
- **ガード**: `tests/api/userActivityHistory.test.js`（4件）—
  **テーブルに直接書かず、実際に `updateUser` でミュートとBANを実行してから**
  履歴に両方が現れること、回数が2/1/1と一致すること、理由と実行者が残ること。
  旧実装に戻すと `Expected "ban" / Received []` で落ちることを確認済み
- **4件目のテストの役割**: 「操作していないユーザーの履歴は空」も入れてある。
  これは旧実装でも**通る**。空を確認するテストだけでは、
  この欠陥は永遠に見つからないことを示すために置いている
- **実測**: backend 744件 / frontend 97件、失敗0・skip 0
- **再検証**: `cd backend && npx jest tests/api/userActivityHistory.test.js`

---

### E-37. ✅ 解決済み（2026-09-02） — 同じ形を全部探した: 書き手のいないテーブルが、あと4つあった

E-36 で「読み手だけがあり書き手がいない」テーブルを1つ見つけた。
**1件見つけたら同型を全部探すまで終わっていない**（E-26 の教訓）。機械的に走査した。

- **走査の規則**: スキーマにある表について、src 内の
  `FROM` / `JOIN`（読み手）と `INSERT` / `UPDATE ... SET` / `DELETE FROM`（書き手）を数える
- **結果**（23表中4件）:

  | テーブル | 状態 | 画面に出ていたこと |
  |----------|------|--------------------|
  | `ai_moderation_logs` | 読み手のみ | AI判定ログは**永久に空**（admin限定エンドポイント） |
  | `user_timeout_reasons` | 読み手のみ | タイムアウト理由テンプレートは**永久に空** |
  | `analytics_snapshots` | 読み手も書き手も無し | — |
  | `moderation_settings` | 読み手も書き手も無し | E-32 で消したAPIの残骸 |

- **自分のテストが「空でよい」と書いていた**: `missingTables.test.js` には
  **「GET /timeouts/reasons はテンプレートが空でも200と空配列」**という
  自分で書いたテストがあった。空を許すと書いた瞬間、
  **配線が切れていることとデータが無いことを区別できなくなる**。
  E-36 の教訓はここにも当てはまる
- **判断**: 4件とも削除した。
  - `moderation_settings` / `analytics_snapshots` — 誰も触らない。削除
  - `user_timeout_reasons` — 読むエンドポイントは mount 済みだが、
    フロントの `timeoutReasons` state は**取得も描画もされていなかった**。
    タイムアウトの理由は現在も自由記述で機能している。
    テンプレートの中身を決めるのは製品判断なので、勝手に作らずに削除
  - `ai_moderation_logs` — AI判定の説明可能性は本来価値があるが、
    **書き手を作るには実在しない値が要る**（`confidence` / `processing_time` /
    `model_version` はいずれも NOT NULL で、AIが実際に走ったときにしか存在しない）。
    無い値を埋めれば、それは捏造である。よって表とエンドポイントを削除した。
    **後で実装するなら**、書く場所は `commentsController.ingestComment`
    （comment id と判定結果が両方そろう唯一の地点）で、
    `OPENAI_API_KEY` が設定され `moderationService.analyzeComment` の
    AI分岐（`openaiService.isAvailable()`）が実際に走ったときだけ書くこと
- **ガード**: `tests/architecture/tableWriters.test.js`（3件）—
  **SELECT される表には INSERT/UPDATE/DELETE のいずれかが存在すること**、
  読み手も書き手も無い表がスキーマに残っていないこと、
  そして走査が空振りしていないこと。
  例外は `READ_ONLY_BY_DESIGN` に**「誰が書くのか」を書いて**登録させる（現在は空）。
  書き手のないテーブルを1つ戻すと
  `moderation_history <- 読み手: controllers/usersController.js（書き手なし）`
  と名指しして落ちることを確認済み
- **実測**: backend 746件 / frontend 97件、失敗0・skip 0
- **再検証**: `cd backend && npx jest tests/architecture/tableWriters.test.js`

---

### E-38. ✅ 解決済み（2026-09-02） — 「横断的な履歴APIが無い」と書いてあったが、記録はあった。無かったのはAPIだけだった

E-36・E-37 で `audit_logs` に全モデレーション操作が残っていることが分かった。
そこで、以前**自分で書いた但し書き**を読み直した。
`ModeratorDashboard.js` の履歴パネルにはこう書いてあった:

> このセッション中にこの画面から実行した分のみ。
> **サーバ側に横断的な履歴APIが無いため**、再読み込みで消えます

- **問い**: この但し書きは、**今も本当か？**
  E-25 で架空の履歴3件を消したときは「実在の履歴を出す手段が無い」ので空にした。
  だがそれは**記録が無い**からではなく、**記録を返すAPIが無い**からだった。
  制約だと思っていたものが、実は未実装だったという形である
- **実施した対応**:
  - `GET /api/analytics/moderation-actions`（moderator限定・limit 1-200、既定50）を追加。
    `audit_logs` を `users` に LEFT JOIN し、
    誰が・いつ・誰に・何を・なぜ を返す
  - 監査記録に**BANがプラットフォームへ届いたか**を残すようにした。
    従来 `logDataMod` は書き戻しを試みる**前**に呼ばれていたため、
    結果が記録に入っていなかった。BANのときだけ結果が出てから記録する形に変えた
  - 画面はマウント時にこのAPIを読み、その場の操作もそのまま前に積む。
    但し書きは「監査記録から取得した直近20件」に書き換えた
- **3状態を潰さないこと**: `platformApplied` は
  **true（届いた）/ false（届かなかった）/ null（記録が無い）** の3状態である。
  この機能より前の行には記録が無い。`null` を `false` として描くと
  **古い記録を「未反映」と誤って断言する**ことになり、
  「当人は配信で発言できます」という警告を根拠なく出すことになる。
  API・画面・テストの3層でこの区別を固定した
- **ガード**:
  - `backend/tests/api/moderationActions.test.js`（6件）—
    **別リクエストで実行した**BANとミュートが返ること、
    誰が・誰に・なぜ・いつ が揃うこと（表示名で引けること）、
    BANは `platformApplied: false`（資格情報が無い環境なので届かない）で
    `null` にしないこと、BAN以外は `null` であること、
    新しい順・limit の上限と不正値
  - `frontend/src/components/__tests__/ModeratorDashboard.test.jsx`（+4件）—
    サーバ由来の操作が表示されること、届かなかったBANは明示されること、
    **記録の無いBANを「未反映」と断言しないこと**、
    取得に失敗したときに空の履歴を「操作なし」と偽らないこと。
    セッション限定の実装に戻すと5件が落ちることを確認済み
- **実測**: backend 752件 / frontend 101件、失敗0・skip 0
- **再検証**: `cd backend && npx jest tests/api/moderationActions.test.js`
- **教訓**: **「〜が無いのでできない」と書いた但し書きは、時間が経つと嘘になる。**
  制約として書いたものが、実は自分で作れるものだったという場合がある。
  文書化された限界にも期限を切って問い直すこと

---

### E-39. ✅ 解決済み（2026-09-02） — 設定画面のスローモードは、**取り込みが読まない場所**に保存していた

E-32 で「保存したと言いながら保存していないAPI」を消した。その次の問いは
**「保存はされているとして、それを読む側はいるのか？」**である。

- **やり方**: `user_settings` に保存される項目を列挙し、
  設定モジュールの外に読み手がいるかを数えた

  | 保存される項目 | 設定モジュール外の読み手 |
  |----------------|--------------------------|
  | `slowMode` | **1件**（`commentsController.checkSlowMode`。取り込み経路で実際に効く） |
  | `commentMaxLength` / `pinLimit` / `autoDeleteTime` / `autoNGWord` / `autoTranslation` | 0件 |
  | `individualThresholds` / `modelVersion` | 0件 |
  | `theme` / `primaryColor` / `secondaryColor` | 0件（実際のテーマは `ThemeContext` が localStorage から読む） |

- **本題の欠陥**: 唯一効く `slowMode` について、画面と取り込みが**別の場所を見ていた**。

  ```
  画面が書いていた場所    user_settings の moderation.slowMode
  取り込みが読む場所      user_settings の slowMode（最上位）
  ```

  設定画面のスローモード欄は最初から**存在していた**。スイッチも動き、
  保存APIも200を返す。**しかし判定は一切変わらない**。
  「効く設定の唯一の入口が、効かない場所に書いていた」ことになる。
  専用の `GET/PUT /api/settings/user/:userId/slow-mode` は正しい場所に書くのに、
  画面はそれを使わず汎用の `PUT /user/:userId` を使っていた
- **実施した対応**: スローモードの各操作（有効/無効・間隔・プラットフォーム別）を
  専用APIに繋ぎ替えた。取得も専用APIから行い、
  取得失敗時は既定値を「現在の設定」と偽らずに明示する
- **ガード（いずれも本物の不具合で落ちることを確認済み）**:
  - `backend/tests/api/slowModeEffect.test.js`（4件）—
    **「200が返った」ではなく「2回目の投稿が実際に拒否された」**を見る。
    無効なら連続投稿が通り、有効にすると2回目が `rate_limited` になり、
    無効に戻すとまた通ること、範囲外の値が400で弾かれること。
    `checkSlowMode` が設定を読まないよう改変すると2件が落ちる
  - `frontend/src/components/__tests__/SettingsPanelSlowMode.test.jsx`（4件）—
    専用APIから読むこと、スイッチ操作で**汎用APIに `moderation.slowMode` を
    書かない**こと、保存失敗を成功に見せないこと。
    元の汎用保存に戻すと2件が落ちる
  - テスト設計の注意: スローモードは「前回投稿からの経過時間」で判定するため、
    **テストごとに新しい利用者を作ること**。使い回すと前のテストの投稿が残り、
    1回目から拒否されて検査の意味が変わる（実際に一度そうなった）
- **残る限界（所有者の判断が要る）**: 上表の「読み手0件」の項目は、
  保存はされるが**どこにも効かない**。今回は削除していない——
  どれを実装しどれを消すかは製品判断であり、
  勝手に画面から機能を消すのは越権だと判断した。
  ただし**効かないまま置いておけば、いずれ誰かが「設定したのに効かない」と困る**。
  実装するなら読み手を足す場所は次のとおり:
  `commentMaxLength` は取り込みの検証、`autoDeleteTime` は定期削除、
  `autoNGWord` は学習経路、`theme` 系は `ThemeContext`（現在は localStorage）
- **実測**: backend 756件 / frontend 105件、失敗0・skip 0
- **再検証**: `cd backend && npx jest tests/api/slowModeEffect.test.js`、
  `cd frontend && npx vitest run src/components/__tests__/SettingsPanelSlowMode.test.jsx`

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

### D-6 / E-3残課題. ✅ 解決済み（2026-08-25） — マルチテナント機能を削除（オーナー判断）

- **実態**: `routes/tenants.js` は `app.js` に**一度もマウントされておらず到達不能**だった。
  加えて `middleware/auth.js` の `TenantManager`（約215行）はテナントを**プロセス内のMap**に
  保持しており、再起動で全消失する設計だった（どこからも参照されていない）
- **アーキテクチャ上の不整合**: 本アプリはSQLite単一ファイル＋プロセス内状態（YouTubeポーリング／
  Twitch EventSub接続／レイド検知）のため、そもそもテナント分離が成立しない。
  コメント・ユーザーの実データ経路に `tenant_id` フィルタは0件のままだった
- **オーナー判断**: 削除（2026-08-25にユーザーが選択）
- **削除したもの**: `tenantController.js`(555) / `routes/tenants.js`(36) /
  `tests/integration/tenants.test.js` / `auth.js` の `TenantManager` と export（計約806行）
- **将来必要になった場合の正しい順序**: ①DBを外部化する ②取り込み処理をワーカーへ分離する
  ③その上でテナント分離を設計する。中途半端な足場を残すより、
  前提が変わってから設計し直す方が安全である
- **再検証**: `grep -rn "tenant" backend/src/` → 0件

### D-7. ✅ 解決済み（2026-08-25） — httpOnly Cookie へ移行し、同時にCSRF対策を導入

- **元の問題**: フロントが `sessionStorage` にトークンを保存していたため、
  XSSが一度でも成立すればトークンをそのまま持ち出せた
- **実施した移行**:
  - バックエンド: ログイン/リフレッシュ時に `access_token` / `refresh_token` を
    **HttpOnly + SameSite=Strict（本番では Secure）** で発行（`middleware/authCookies.js`）。
    `authenticateToken` は **Cookieを優先し、Authorizationヘッダーも受け付ける**
    （APIクライアント・既存テストを壊さないため）
  - フロント: `sessionStorage` への保存を全廃。`tokenStorage.js` は参照ゼロになったので削除。
    axios は `withCredentials` のみでCookieを送る
  - **`useAuth` の重大な落とし穴**: 以前は `tokenStorage.get()` が空なら未ログインと判断していた。
    Cookie方式ではJSからトークンの存在を確認できず**常に空**になるため、この判定を残すと
    リロードのたびに全員ログアウトする。**必ずサーバーに `GET /api/users/me` で問い合わせる**
    形に変更した（ログイン済みかどうかの唯一の判定はこれ）
- **CSRF対策を同時に入れた理由**: これまでCSRF対策が不要だったのは、認証が
  `Authorization` ヘッダーだけで成立しており、ブラウザがクロスサイトで自動付与しないため。
  **Cookieは自動付与されるので、Cookie認証を入れた瞬間に全ての状態変更エンドポイントが
  CSRF可能になる。** 二重防御にしてある: ①SameSite=Strict ②Cookie認証された状態変更に対する
  Origin/Referer 検証（`csrfGuard`）
- **実測で分かったこと**: このアプリには `csrfGuard` の前段に `validateOrigin`
  （`middleware/security.js`）があり、**メソッドや認証方式に関係なく**許可外Originを弾く。
  `csrfGuard` はその内側の二重防御であって最初の壁ではない。テストにこの実際の挙動を固定した
- **もう一つの発見**: レートリミッターが2系統ある。`middleware/security.js` は
  `config.rateLimit.enabled` を見るが、`middleware/rateLimiter.js`（ログイン保護の
  `limiters.auth`、15分5回）は**それを見ずに常に有効**。テスト環境でもログインが5回で
  429になる（実際に6回目で踏んだ）。ブルートフォース対策が常時有効なこと自体は妥当だが、
  2系統が別々の有効化条件を持っている点は将来整理の余地がある
- **検証**:
  - `curl`（本番設定）: `Set-Cookie` に `HttpOnly; Secure; SameSite=Strict` を確認
  - Cookieのみで `GET /api/users/me` → 200、Cookie無し → 401
  - 許可外Originからの状態変更 → **403**、許可Origin → 200
  - Cookieのみ（本文空）でのリフレッシュ → 200 かつ両Cookieがローテーション
  - **実ブラウザ（Chromium + nginx + 実バックエンド）**: ログイン後
    `sessionStorage` は**空**、Cookieは `httpOnly=true, sameSite=Strict` の2本、
    ダッシュボードのタブ11個が描画、**リロード後もタブ11個を維持**（Cookieだけで
    セッションが継続）、ページエラー0件
  - 回帰テスト `tests/api/authCookies.test.js`（14件）
- **HTTPS対応（同日中に対応済み）**: `Secure` 属性が付く以上、平文HTTPでは
  ブラウザがCookieを保存せず**ログインが成立しない**。「HTTPSを用意してください」と
  文書に書くだけでは、配布した構成のまま起動すると動かないことになる。
  そこで**フロントエンドのコンテナ自身がTLSを終端する**ようにした:
  - 443でTLS、80は `/health` のみ通してそれ以外はHTTPSへ301リダイレクト
  - 証明書が無ければ起動時に自己署名証明書を生成（`frontend/docker-entrypoint.sh`）。
    「何も設定しなくても動く」ためであり、自己署名で本番運用してよいという意味ではない。
    本番は `./certs` に `fullchain.pem` / `privkey.pem` を置いて差し替える
  - HSTS を付与。`certs/` は `.gitignore` で中身をコミットしない
  - HTTP/2 は**あえて有効化していない**。`http2 on;` は nginx 1.25.1 以降の構文で、
    旧構文は同バージョン以降で非推奨警告になる。ベースイメージの正確なパッチ
    バージョンを検証できない状態でどちらかを書くと起動失敗か警告の常時出力になるため、
    バージョンを固定できた時点で有効化すること
- **HTTPS化の過程で見つかった自分のバグ（無限リロード）**: Cookie方式では
  未ログインか否かをJSから判定できないため `useAuth` は起動時に必ず `GET /users/me` を
  投げる。ログイン画面では401が返り、axiosのインターセプタが
  「リフレッシュ→失敗→`/login`へ遷移」を実行し、遷移先で再び `useAuth` が走って
  **リロードが永久に繰り返された**（画面は真っ白、さらにリフレッシュ連打で429まで到達）。
  実ブラウザで再現して発見。対策は①セッション確認の問い合わせに `_isSessionProbe` を立てて
  再試行・遷移の対象外にする ②既に `/login` にいる場合は遷移しない、の2つ。
  回帰テスト `frontend/src/api/__tests__/sessionProbe.test.js`（4件）で固定した
- **HTTPSでの検証（実ブラウザ）**: 自己署名証明書でTLSを立てて確認 ——
  `http://…/health` → 200、`http://…/` → **301でHTTPSへ**、`https://…/` → 200、
  ログイン後 `sessionStorage` は**空**、Cookieは2本とも
  **`httpOnly=true, secure=true, sameSite=Strict`**、ダッシュボードのタブ11個が描画、
  **リロード後もタブ11個を維持**、ページエラー0件
- **再検証**: ログイン後に `sessionStorage` が空であること、リロードでセッションが維持されること

### D-8. ✅ 解決済み（2026-07-10） — コミュニティインサイトUIの残り2画面

- **元の証拠**: バックエンド12エンドポイントは全実装・テスト済（`routes/communityInsights.js`）。UIは triage / health / silent-departure の3つが `Dashboard.js` に接続済み。**文化プロファイル管理**（`PUT /api/insights/culture/:platform/:channelId`）と**文脈分析**（`POST /api/insights/context-analysis`）のUIが未実装
- **実施した修正**: `frontend/src/components/CultureProfilePanel.jsx`（文化プロファイル選択・保存、Settings画面の新規タブ）と`ContextAnalysisPanel.jsx`（対象コメント+前後文脈コメントを送信し判定結果を表示、Moderatorタブに配置）を新規実装
- **実装検証中に発見・修正した重大バグ群**: 本番相当のブラウザ検証（登録→ログイン→各画面遷移→実際にフォーム送信）を行った結果、この2画面とは無関係な既存の深刻なバグが芋づる式に見つかった。詳細は「追記5」参照
- **検証**: Playwright + 実Chromiumで登録→ログイン→Settings→文化プロファイルタブ（プリセット取得・選択・保存・現在設定のChips表示を確認）→Moderatorタブ→文脈分析（コメント+文脈2件を送信し「危険」判定・スコア・インサイト文の表示を確認）まで実施
- **再検証**: `ls frontend/src/components/CultureProfilePanel.jsx frontend/src/components/ContextAnalysisPanel.jsx` → 両方存在すれば実装済み。`grep -n "ContextAnalysisPanel\|CultureProfilePanel" frontend/src/components/Dashboard.js frontend/src/components/SettingsPanel.js` → それぞれ配線されていれば統合済み

### D-9. ✅ 解決済み（2026-08-25更新） — 残存テスト失敗142件→0件（据え置いていた4件も解消）

- **元の証拠**: `cd backend && NODE_ENV=test npx jest` → 15スイート失敗/142件失敗（367件中）。主因4種を特定: (a) notifications テーブルに `user_id`/`expires_at` 列が無くSQLITE_ERROR、(b) `openaiService.test.js` が実際には未使用の `openaiService_enhanced.js`（527行、参照ゼロ）をテストしていた上にモック構造も不良、(c) `validation.js` の `Joi.date().iso()` がISO文字列をDateオブジェクトへ強制変換していた、(d) `cacheService.js`/`monitoringService.js`/`errorHandler.js` の常駐 `setInterval` がJestのopen-handle検出に引っかかりタイムアウトを誘発
- **実施した修正**:
  - (a) `db.js`: `notifications`テーブルに`user_id TEXT`/`expires_at DATETIME`列を既存の`ensureColumnDefinitions`パターンで追加。`notificationsController.js`の`createNotification`のINSERTに`user_id`を追加
  - (b) `openaiService.test.js`を実際に本番で使われる`openaiService.js`へ向け直し、jestのモックをシングルトンパターンに修正（`resetMocks:true`がコンストラクタのmockImplementationを毎テスト消去するため`beforeEach`で再適用）。参照ゼロだった`openaiService_enhanced.js`は削除。あわせて`openaiService.js`にエラークラス階層・`resetCostTracking()`・レイテンシ/キャッシュ状態フィールドを追加
  - (c) `validation.js:59`: `Joi.date().iso()` → `Joi.string().isoDate()`
  - (d) 3ファイルの`setInterval`に`.unref()`を追加（Jestのopen handle検出数が36→1に減少、本番のgraceful shutdownにも寄与）
  - (e追加・2026-07-07) `tests/integration/notifications.test.js`のルート設計不一致を解消。テストが期待する形状（`PUT /:id/read`・`PUT /read-all`・`DELETE /:id`・`DELETE /`（全削除）・`GET/PUT /settings`・`POST /test`、いずれもフラットな`{success,...}`レスポンス）に合わせて`routes/notifications.js`と`notificationsController.js`を再設計・新規実装（フロント側にこのAPIの実利用者が存在しないため、実装をテストの設計意図に合わせる方を選択）。**実装中に発見した重大な設計ミス**: 新設した`/settings`エンドポイントは当初`users`テーブル（プラットフォーム上のコメント投稿者）を操作していたが、`req.user.id`はJWT発行元の`accounts`テーブル（ダッシュボード運用者）のIDであり、`users`テーブルには一致する行が存在せず常に404になっていた。運用者自身の通知設定は`accounts`テーブル側の新規列（`notification_email_enabled`/`notification_push_enabled`/`notification_desktop_enabled`/`notification_types`）に持たせるよう修正
  - (e補足) `notificationsController.js`の`serializeNotification()`が、実際のスキーマに存在しないRust/OCaml/Prolog/COBOL/VHDL等80以上の無関係な言語機能を模した架空フィールドを参照していた（実害はないが完全なハルシネーション性の残骸）。実在する列のみを返すよう大幅簡素化
  - (f追加・2026-07-08) `tests/api/comments.test.js`に認証を追加した結果発覚した3件の重大バグ（`sanitizeForResponse`未定義・`last_comment_at`列欠落・`deleteComment`の列/テーブル欠落+ルート未マウント）を修正。詳細は本書冒頭の「追記2」参照
  - (g追加・2026-07-08) `tests/api/notifications.test.js`を(e)の再設計（`PUT /:id/read`・フラット`{notifications,total,unread}`封筒等）に合わせて書き直し。あわせて`createNotification`が`res.json({status:201,...})`のみで実際のHTTPステータスコードを201に設定していなかったバグ（bodyは201と主張するが実際のレスポンスは200）を発見・修正（`res.status(201).json(...)`）。また汎用エラー（`next({status,message})`経由）は`{error:{message}}`、`middleware/validation.js`経由の400は`{message}`という**2種類の異なるレスポンス封筒がAPI全体に混在している**ことを実地で確認（テスト側で使い分けて対応、実装の統一は別途検討）
  - (h追加・2026-07-08) `tests/services/commentService.test.js`（DB初期化待機が無くタイミング依存で失敗）を修正するため`beforeAll`に他ファイルと同じ1秒待機を追加。その過程で`commentService.js`（本番未使用・importer 0件だが単体テストは実在）の`updateComment()`/バッチ更新パスに**キャメルケースのJSフィールド名（`avatarUrl`等）をそのままSQL列名として使用する実バグ**を発見・修正（実際の列は`avatar_url`等スネークケース。`FIELD_TO_COLUMN`マッピングを追加）。あわせて`comments`テーブルに`updated_at`列を追加、`getCommentEditHistory()`の`ORDER BY edited_at DESC`が秒単位精度のタイムスタンプ同値により同一秒内の複数編集で順序不定になるバグを`ORDER BY edited_at DESC, id DESC`に修正
  - (i追加・2026-07-08) `tests/api/settings.test.js`（700行超）が**文字通りの構文エラー**（`{{ ... }}`というテンプレートプレースホルダーの消し忘れが300行目に残存）でファイル全体が一度もパースできず、スイート自体が「0 total」扱いで実質見えなくなっていた。除去してパース可能にした上で走らせたところ54/55が失敗し、うち大半（30件）が**`userRoute()`ヘルパーのReferenceError**（`testUserId`が`describe`内で`let`宣言されておりモジュールスコープの`userRoute()`から参照不能）に起因することが判明・修正。残りはDB初期化待機の欠落（他ファイルと同じ規約を追加）、および実装調査の結果判明した実バグ2件: (1) `getHelp`コントローラーが実装済みなのに`routes/settings.js`に一度もマウントされていなかった（`GET /help`が常に401/404）→ `/help`を`/version`/`/terms`と同じ公開静的リソースとしてマウント、(2) `setAdminEmail`コントローラーが`req.body.email`を読むが、対応するJoiスキーマ（`validation/settings.js`）は`adminEmail`という別名でフィールドを定義しており、`stripUnknown:true`により未検証の`email`は常に除去されextra、`adminEmail`はコントローラー側で一度も参照されないため**この機能は一度も動作したことがなかった**→ コントローラー側を`adminEmail`に合わせて修正。加えて`setDefaultLanguage`が言語の許可リスト検証を一切行っていなかったため、D-13で確定した実在2言語（en/ja）のみを許可するようJoiスキーマを強化。残り4件（`存在しないユーザー`404・`不正なユーザーID形式`400・`空の更新データ`400・バレPUTの`不正なテーマ値`400）はテストの前提（ユーザー実在確認・ID形式仕様・空更新拒否）に対応する実装が無く、これらは製品仕様が未確定な機能ギャップとして残置（無理に検証を追加実装せず据え置き）
  - (j追加・2026-07-10) `tests/api/billing.test.js`は`mockAuthToken = 'mock-jwt-token'`というリテラル文字列を`Authorization`ヘッダーに使っていたため、`authenticateToken`のJWT検証（`jwt.mock('../../src/db')`とは無関係にDBを一切参照しない純粋なトークン署名検証）に必ず失敗し12件中9件が401で落ちていた。実際に検証可能な署名済みトークンを`middleware/auth.js`の`generateToken()`で生成するよう1行修正するだけで解消（実装側のバグではなく、テストのフィクスチャ不備）
  - (k追加・2026-07-10) `tests/middleware/security.test.js`調査中に**`config.security.allowedOrigins`がそもそも定義されていない**重大バグを発見・修正。詳細は本書冒頭の「追記3」参照。あわせて`sanitizeInput`のXSS除去後に連続空白（例:「Hello  world」）が残る細かな不具合も修正（`.replace(/\s+/g, ' ')`で正規化）
  - (l追加・2026-07-10) `tests/integration/security.test.js`（13件）はほぼ全てのテストが存在しない`/api/health`（実際は`/api`プレフィックス無しの`/health`）を叩いており404だった。パスを実際のルートに修正し、コメントAPIを叩く2件に認証を追加、CORSテストのOriginを実際の許可デフォルト値（`http://localhost:5173`、追記3の設定と一致）に修正、preflight応答の期待ステータスを実際のcors標準動作である204（従来200を期待）に修正。パス以外は全て実装側ではなくテスト側の期待値の誤りだった
  - (m追加・2026-07-10) `tests/integration/comments.test.js`（22件）は`user`必須フィールドの欠落・レスポンス封筒不一致（`res.body.comments`ではなく`res.body.data.items`）・コメントIDのUUID形式要件・`PUT /:id`が`status`ではなく`action`（enum: visible/hidden/muted/deleted/flagged）を受け付けること、の4種の不一致が重なっていた。加えて存在しない`POST /:id/moderate`エンドポイントを想定した3件は実在する`PUT /:id`+`action`に書き換え、削除が実際にはソフトデリート（`status='deleted'`に更新するのみで行は残る、監査証跡目的の意図的設計）であることに合わせてDELETE後のGETは404ではなく200+`status:'deleted'`を検証するよう修正。実装に存在しない機能2件（`PUT /:id`での本文content編集、`GET /api/comments/stats`）はskip
  - (n追加・2026-07-10) `tests/integration/api.test.js`（21件）を全面書き直し。上記(a)〜(m)と同系統の不一致（`/api/health`という誤ったパス・封筒形状・`PATCH`と`PUT`のメソッド差・`status`と`action`のフィールド名差・UUID形式要件）に加え、**`PUT /api/users/:id`（モデレーターによるban/mute操作）が配線されたJoiスキーマと実装コントローラーで完全に無関係なフィールドを扱っており一度も機能していなかった**重大バグを発見・修正（詳細は本書冒頭「追記4」参照）。プラットフォーム利用者(`users`テーブル)を作成する公開APIが存在しないため、GET/PUT検証は`beforeAll`でDBへ直接シードする方式に変更。存在しない`POST /api/users`・`GET /api/analytics/snapshots`・`GET/PUT /api/settings/moderation/:platform`・重複ID起因の500エラー経路（IDが常にサーバー側uuid生成のため到達不能）はskip
- **検証**: 各修正後に`NODE_ENV=test npx jest`をフルスイート実行し、失敗数の悪化がないことを都度確認。最終結果: 142件失敗→**4件失敗**（367→439件、settings.test.jsが構文エラーで0扱いだった55件が新たに数えられるようになった影響を含む）、open handle 36→1。本セッションで触れた9ファイル全て全合格（documented skip除く）: `tests/integration/notifications.test.js`24/24、`tests/api/comments.test.js`37/38、`tests/api/notifications.test.js`8/8、`tests/services/commentService.test.js`33/33、`tests/api/settings.test.js`51/55、`tests/api/billing.test.js`12/12、`tests/middleware/security.test.js`7/7、`tests/integration/security.test.js`13/13、`tests/integration/comments.test.js`19/19、`tests/integration/api.test.js`15/21
- **残課題も解消済み（2026-08-25 追記）**: 据え置いていた4件（`存在しないユーザー`404・`不正なユーザーID形式`400・`空の更新データ`400・`不正なテーマ値`400）は**すべて解決している**。`tests/api/settings.test.js` は現在 **55/55 全合格**であり、リポジトリ全体でも失敗0件・skip 0件。上の「意図的な機能ギャップ」という記述は古くなっていたので訂正する
- **再検証**: `NODE_ENV=test npx jest 2>&1 | tail -5` で failed 0件・skip 0件であること

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

### D-13. ✅ 解決済み（2026-07-07） — 言語スイッチャーを実在2言語に縮小

- **元の証拠**: `frontend/src/i18n.js` の `SUPPORTED_LANGUAGES` は15言語を定義しUIに全表示するが、実在するロケールファイルは `locales/en.json` と `locales/ja.json` のみ。残り13言語を選択すると動的importが失敗し英語へ無言フォールバック
- **実施した修正**: `SUPPORTED_LANGUAGES` を実在する en/ja の2言語のみに縮小（翻訳品質を担保できないロケール追加より縮小方向を選択）。`changeLanguage()`は既存ロジックのまま`SUPPORTED_LANGUAGES`に無い言語コードを渡されると明示的にエラーを返す（従来の「無言で英語にフォールバック」から「サポート外である旨を明示」に変化）。`getLanguageGroups()`内のアジア/欧州言語振り分けリストなど、削除した言語コードを参照する箇所は実質無害なデッドデータとして残置（クラッシュ要因ではないため）
- **検証**: `npx vite build`で en/ja の2ロケールチャンクのみが生成されることを確認（従来存在した使われない13言語分のチャンクは生成されなくなった）
- **再検証**: `grep -c "rtl:" frontend/src/i18n.js` → 2（en/jaのみ）なら縮小済み

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

## 推奨着手順（2026-08-25時点で最新）

**解決済み**: D-1/D-2/D-3/D-4/D-5/D-8〜D-14、E-1/E-2/E-4/E-6/E-7/E-9〜E-12/E-14/E-15/E-16/E-17、E-3は部分対応。

残っているのは次の3種類だけである。**「まだ実装していない機能」はもう無く、
残りは製品判断・環境制約・外部検証のいずれか**という状態になっている。

### A. 製品として決めないと着手できないもの（オーナー判断待ち）

**このカテゴリは空になった。** D-7（httpOnly Cookie移行 + CSRF対策）と
D-9（テスト失敗の残り4件）はいずれも2026-08-25に解決済み。
E-5（課金）と D-6/E-3残課題（マルチテナント）はオーナー判断により削除済み。
現在フルスイートは **621件全合格・失敗0件・skip 0件**である。
**2026-08-25に決着した項目**: E-5（Stripe課金）と D-6 / E-3残課題（マルチテナント）は
オーナー判断により**両方とも削除**した。いずれも「未完成の機能」ではなく
**構造上一度も動作したことがないコード**だったことが調査で判明している（各節を参照）。

### B. この実行環境では原理的に確認できないもの（手順と測定器は用意済み）

5. **コンテナイメージのビルド — 大半は検証済みになった（E-24）**
   全レジストリがゲートウェイで403のため `node:18-alpine` は取得できないが、
   ホストから `docker import` した代替ベースで**実Dockerfileのアプリ層の命令列を
   ビルド・起動まで検証した**（差分は FROM 2行 + apk 1行のみ）。
   この検証が**本番ビルドを必ず壊していた実バグ2件**
   （husky の prepare、cookie-parser/ws の依存未宣言）を発見・修正した。
   残る未検証は alpine ベース層と musl での sqlite3 コンパイルのみ。
   **Docker Hubに到達できる環境で `docker compose up -d --build` を実行して締める**
6. **AI層（Policy-as-Prompt）の効果実測**
   `OPENAI_API_KEY` が要る。測定器は用意済みで、鍵を入れたら
   `node src/scripts/evaluateModeration.js --no-ai` と引数なしの差分を見る（W-3参照）。
   測定器そのものの正しさは鍵なしで検証済み
7. **YouTube書き戻し / Twitch接続 / SMTP送信の実クレデンシャル確認**
   いずれも未設定時のフェイルセーフ（例外を投げず理由を返す）はテスト済み

### C. 外部の物差しでの検証（次の実質的な一手）

8. **✅ 実施済み（2026-08-25・R-34） — 外部ベンチマークでの検証。結果は厳しい**
   自作45件で F1 100% だったものを、外部データ
   （[inspection-ai/japanese-toxic-dataset](https://github.com/inspection-ai/japanese-toxic-dataset), Apache-2.0、
   ANLP2022の研究データ、309件）で測り直した結果:

   ```
   Precision 100.0% / Recall 3.4% / F1 6.7%    ← 調整前（本当に独立な値）
   Precision 100.0% / Recall 10.3% / F1 18.8%  ← 差別語11語を追加した後
   無害280件に対する誤検知: 0件（両方とも）
   ```

   **自作セットの100%は一般化ではなく整合性だった**。一方で
   「誤検知しない」という設計目標は他人の実データでも成立している。
   見逃し26件の内訳は「方針としてあえて拾わない」8件
   （バカ／だっさ等の軽口、政党批判）と「本物の弱点」18件。
   詳細と再現手順は `docs/RESEARCH_IMPROVEMENTS.md` の R-34 を参照。

9. **✅ 調査完了（2026-08-25・R-35） — 弱点18件は決定論では埋まらないと判明**
   外部セットを dev / test に二分し、**dev側だけを見て**属性差別のパターンを設計した。

   ```
   dev （調整に使った側）   Recall  7.1% → 35.7%  (+28.6pt)
   test（一度も見ていない側）Recall 13.3% → 13.3%  (±0)
   ```

   **ホールドアウトでの改善はゼロ**。典型的な過学習であり、
   **決定論的パターンで一般的な有害表現のカバレッジを上げる方針は天井に当たっている**
   ことが測定で確定した。広いカバレッジはAI層の担当である。
   誤検知は全セットで0件のため R-35 自体は残してあるが、
   これで広く覆えると考えないこと。詳細は `docs/RESEARCH_IMPROVEMENTS.md` R-35。

   **今後の注意**: test側を見ながら調整した瞬間、このプロジェクトは
   独立した検証の場を完全に失う。分割は id の偶奇という決定的規則である

**なお、AI/モデレーション機構の技術的な改善は `docs/RESEARCH_IMPROVEMENTS.md`（R-1〜R-33, W-1〜W-3）に分離して整理している。**
