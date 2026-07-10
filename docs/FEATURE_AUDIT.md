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

### E-14. ★★ レート制限機能がアプリ全体で無効化されている（2026-07-08発見）

- **証拠**: `middleware/security.js`の`buildLimiter(configNode, extra)`は`if (!config.rateLimit.enabled) return noopLimiter;`で始まるが、`config.js`の`rateLimit`オブジェクトには`windowMs`/`maxRequests`しか無く、**`enabled`キーも、`strict`/`general`/`api`のネストされた設定オブジェクトも一切定義されていない**。そのため`config.rateLimit.enabled`は常に`undefined`（falsy）となり、`strictRateLimit`/`generalRateLimit`/`apiRateLimit`の3つ全てが常に`noopLimiter`（何もしない通過ミドルウェア）になる。本番・開発・テストの全環境で発生する設計上の欠落であり、環境変数の設定漏れではない
- **影響**: 認証エンドポイント（ログイン試行のブルートフォース）、コメント投稿API、その他全APIがレート制限による保護を一切受けていない
- **推奨アクション**: `config.js`に`rateLimit.enabled`（既定`true`、`RATE_LIMIT_ENABLED`環境変数等で無効化可能）と、`strict`/`general`/`api`それぞれの`windowMs`/`max`設定を追加する。ただし有効化すると本テストスイート内の連続リクエストを伴うテスト（`tests/api/comments.test.js`のパフォーマンステスト等、認証済みリクエストを100件以上連続送信するもの）が429で失敗し始める可能性が高いため、有効化は既存テストへの影響を検証しながら計画的に行うこと（今回は検出のみに留め、有効化はスコープ外とした）
- **再検証**: `grep -n "rateLimit:" -A 5 backend/src/config.js` → `enabled`キーが無ければ未対応

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

### D-9. ✅ 大部分解決済み（2026-07-07） — 残存テスト失敗を142件→103件に削減

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
- **検証**: 各修正後に`NODE_ENV=test npx jest`をフルスイート実行し、失敗数の悪化がないことを都度確認。最終結果: 142件失敗→**24件失敗**（367→439件、settings.test.jsが構文エラーで0扱いだった55件が新たに数えられるようになった影響を含む）、open handle 36→1。`tests/integration/notifications.test.js`は24/24、`tests/api/comments.test.js`は37/38（1件skip）、`tests/api/notifications.test.js`は8/8、`tests/services/commentService.test.js`は33/33、`tests/api/settings.test.js`は51/55、`tests/api/billing.test.js`は12/12、`tests/middleware/security.test.js`は7/7、`tests/integration/security.test.js`は13/13、`tests/integration/comments.test.js`は19/19（3件skip）、全合格
- **既知の残課題**: 残り24件は全て`tests/integration/api.test.js`（18件）と`tests/api/settings.test.js`の意図的な機能ギャップ4件（`存在しないユーザー`404・`不正なユーザーID形式`400・`空の更新データ`400・`不正なテーマ値`400、いずれも製品仕様未確定のため実装追加を見送り）に集約された。`tests/integration/api.test.js`は調査済み: 認証ヘッダー皆無に加え、HTTPメソッド不一致（`PATCH`だが実装は`PUT`）・レスポンス封筒不一致（フラットなオブジェクトを期待するが実装は`{status,data,message}`）・クライアント指定IDを尊重する前提（実装は`ingestComment`内で常に`uuidv4()`をサーバー側生成、意図的なセキュリティ設計）・レート制限テスト（E-14参照、無効化されているため原理的に不成立）が同時に絡んでおり、他ファイルのような単一原因の修正では済まない規模。着手するなら「実装に合わせてテストを全面書き直す」前提で臨むこと
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

## 推奨着手順

**2026-07-07時点で下記のほぼ全項目が着手・一定水準まで解決済み**（D-2/D-5/E-3/D-9/E-9/E-10/E-11/E-12/D-13、notifications.test.jsのルート不一致含む）。残るのは製品判断が必要な大型項目のみ:

1. **D-6 アカウント⇔チャンネル担当制 + E-3残課題（マルチテナント本実装）**: 両方ともスキーマ設計の製品判断が必要なため意思決定が先
2. **D-7 httpOnly Cookie移行**: D-5（リフレッシュトークン）確立後の次段として着手可能だが、CORS設定・フロントのトークン管理全体に影響する規模のため計画的に着手すること
3. **Twitch連携**（D-2で見送ったIRC/EventSub部分）
4. **`tests/api/notifications.test.js`の設計統一**: 同一機能に対し`tests/integration/notifications.test.js`と非互換な設計（`POST /:id/read`・`{status,data,message}`封筒）を前提としている。どちらを正式仕様とするか判断した上でテストか実装のどちらかを書き直す
5. **D-9残り103件**: 個別原因の精査が必要（`tests/api/comments.test.js`など、認証まわりのテスト実行順序依存の疑いがある大型失敗クラスタが残っている）
