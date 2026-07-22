# Runner 開発指示書（AI Agent Handbook — Opus / Sonnet 向け）

**基準日: 2026-07-18** / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`（公開用 `master` へ fast-forward 運用）

## この文書の目的と役割分担

本書は、このリポジトリで作業する将来の Claude（Opus/Sonnet等）セッションが**再調査なしで安全に作業を引き継ぐための指示書**である。3つのドキュメントの役割分担:

| ドキュメント | 役割 |
|---|---|
| `docs/FEATURE_AUDIT.md` | 機能過不足の監査カタログ（D-x/E-x項目、証拠と再検証コマンド付き） |
| `docs/RESEARCH_IMPROVEMENTS.md` | 2024-2026年の研究/API動向にもとづく改善バックログ（R-1〜R-19、出典検証済み） |
| **本書** | **作業規約・環境の罠・検証プロトコル・優先順位付き作業指示（Work Orders）** |

着手前に必ず: (1) 本書の§3〜§5を読む → (2) 該当する Work Order の参照先（FEATURE_AUDIT/RESEARCH_IMPROVEMENTS の該当項目）の再検証コマンドを実行して現状を確認する。**両ドキュメントの記載は本書作成後に変わっている可能性があるため、再検証コマンドの実行を省略しないこと。**

## 1. 長所（実地検証済み・変更時に壊さないこと）

1. **実動する認証基盤** — 登録/ログイン/2FA/リフレッシュトークンローテーション（旧トークン即無効化）/パスワードリセット。curl+実ブラウザでE2E検証済み
2. **YouTube Live Chat 実取込** — クォータ追跡（日次1万units・超過前ブロック）・APIの`pollingIntervalMillis`尊重・指数バックオフ・連続エラー自動停止（`services/youtubeIngestionService.js`）
3. **フェイルセーフ設計の一貫性** — 全APIキー未設定でも警告のみで起動しルールベースにフォールバック。**新機能もこの規約に必ず従うこと**
4. **テスト運用規律** — 459テスト・失敗4件（意図的据え置き）。「ベースライン悪化ゼロ」を毎変更で確認する文化が確立
5. **差別化機能群（UI込み）** — 健全性スコア/離脱検知（取込配線+再起動ウォームアップ済み・R-19）/文化プロファイル（DB永続化済み・R-18）/文脈分析
6. **モデレーションの近代化済み部分** — omni-moderation化(R-1)・実翻訳配線(R-10)・NGワード+回避対策（全角/ゼロ幅/ホモグリフ・R-5a/R-11）・構造化フラグ理由+UIバッジ(R-14a/b)・カスタムフィルタ復旧(R-5補足)
7. **業務ワークフロー** — 保留キュー（理由バッジ付き）・ソフトデリート+削除履歴の監査証跡・モデレータートリアージ

## 2. 短所（残存課題のみ・2026-07-18時点）

| # | 内容 | 参照 |
|---|---|---|
| 1 | **Twitch未実装**（製品名の約束に対し片翼。実装経路は確定済み） | R-7 / W-2 |
| 2 | **レート制限が全体で無効**（ブルートフォース対策が本番で機能しない） | E-14 / W-1 |
| 3 | **スタブAPI約48関数**がハードコード値を返す | E-1/E-2 / W-4 |
| 4 | **文脈分析が素朴ヒューリスティック**（感情平均±0.3補正） | R-4 / W-3 |
| 5 | マルチテナント未配線 / httpOnly Cookie未移行 | D-6/E-3, D-7 / W-8, W-9 |
| 6 | 規制対応（DSA/OSA/情プラ法）未着手 | R-13 / W-10 |
| 7 | Stripe課金のフロント未接続 | E-5 / W-11 |

## 3. 絶対規約（Non-negotiables）

- **テストベースライン**: `cd backend && rm -f data/test.db && NODE_ENV=test npx jest --runInBand` → **4 failed / 445 passed / 459 total** が基準（本書作成時点）。失敗4件は `tests/api/settings.test.js` の仕様未確定分（意図的据え置き）。**これを1件でも増やす変更は禁止**。並列実行は共有 test.db の競合で偽の失敗（20件超）を出すため、**必ず `--runInBand` + 事前の `rm -f data/test.db`**
- **フェイルセーフ**: 外部キー/サービス未設定でもクラッシュせず警告のみで全機能動作させる（例: `openaiService.isAvailable()` チェック→ルールベース続行、`ng-words.json` 読込失敗→空リスト+警告）
- **UI変更は実ブラウザ検証必須**: frontend/ ディレクトリから `require('playwright-core')`（トップレベルの `playwright` は無い）、実行ファイルは `/opt/pw-browsers/chromium`、スクリプトは **`.cjs` 拡張子**（frontend は `"type":"module"`）。検証不能な場合は成果報告にその旨を明記する
- **スキーマ変更**: `CREATE TABLE IF NOT EXISTS` は**既存テーブルに対してno-op**（列は追加されない）。既存テーブルへの列追加は `db.js` の `ensureColumnDefinitions()` パターン（`PRAGMA table_info` 照合→`ALTER TABLE ADD COLUMN`）を使用
- **コミット**: 「なぜ」を含む詳細な英語メッセージ。関連ドキュメント（FEATURE_AUDIT/RESEARCH_IMPROVEMENTSの該当項目ステータス）の更新を同時に行う
- **公開フロー**: feature ブランチへ push 後、`git push origin <branch>:master`（fast-forward）で公開用 master を最新化。**force-push・履歴書き換え禁止**。push失敗時は指数バックオフ（2s/4s/8s/16s）で最大4回リトライ

## 4. 環境の罠（リモート実行環境固有・実測済み）

- `pkill` が **exit 144** を返し `&&` チェーンを壊す → kill と後続確認を**別々のコマンド**に分割する
- Edit ツールが日本語/`\uXXXX` エスケープ混在ファイルで「not found」を起こすことがある → **python3 ヒアドキュメント**による置換にフォールバック
- バックグラウンド起動は `nohup <cmd> > <log> 2>&1 &` + `disown` を**単独コマンド**で実行し、ログファイルを直接 tail する（ツールの自動出力キャプチャは空になることがある）
- dev環境は JWT/SESSION シークレットが**サーバー再起動ごとに再生成**される → 再起動後は旧トークンが無効。検証時は再ログインする
- ログインエンドポイントに**ブルートフォース保護**あり → curl検証を繰り返すと429。バックエンド再起動でカウンタがリセットされる
- ネットワーク: arxiv.org / dl.acm.org / developers.google.com / npmjs.com（ページ）等への WebFetch は**プロキシ403**（WebSearch・`npm view`は可）。**GitHub APIはセッションで無効**（PR/Release作成・可視性変更は不可）。**git の tag push も403**（ブランチ push は可）
- `npm run dev` の predev スクリプト（`checkEnv.js`）が壊れている → devサーバーは `NODE_ENV=development PORT=3000 node src/server.js` で直接起動する

## 5. 検証プロトコル（変更種別ごとの必須手順）

| 変更種別 | 必須検証 |
|---|---|
| backend コード | `node --check <file>` → §3のjestフル実行 → キー未設定での起動スモーク（`timeout 8 node -e "require('./src/app.js'); console.log('OK'); process.exit(0)"`） |
| frontend | `npx eslint <file>` → `npx vite build` → devサーバー(`npx vite --port 5173`)+Playwright実ブラウザ確認+スクリーンショット |
| スキーマ | 既存 dev DB（`backend/data/database.db`、**削除しない**）に対して起動し、移行ログ（Added missing column等）を確認 |
| API E2E | devサーバー起動 → curl で register→login→対象API。レスポンスの形状（封筒: 正常`{status,data,message}` / validation 400はフラット`{message}` / errorHandler経由はネスト`{error:{...}}`）まで確認 |

## 6. 優先順位付き作業指示（Work Orders）

各項目: **目的 / 対象 / 手順概要 / 完了条件**。着手前に参照先の再検証コマンドで現状確認すること。

### W-1. レート制限の有効化（E-14）★推奨着手順1位
- **目的**: 本番のブルートフォース/DoS対策の復旧（現在は全APIで実質無効）
- **対象**: `backend/src/config.js`（`rateLimit.enabled` の定義）・`middleware/rateLimiter.js`・`app.js` の配線確認
- **手順**: FEATURE_AUDIT E-14 の再検証→有効化→**大量リクエストを送る既存テスト（comments系パフォーマンステスト等）が429で落ちるため、テスト環境では無効化 or 閾値緩和を同時に実装**
- **完了条件**: 本番相当設定で429が返ること・テストはベースライン維持

### W-2. Twitch 実装（R-7）★製品名の約束
- **目的**: 「YouTube & Twitch」の片翼を実装
- **設計（確定済み・RESEARCH_IMPROVEMENTS R-7参照）**: EventSub WebSocket + `channel.chat.message` 購読（**IRC不要**）。**Conduitベース**で購読設計。Shared Chat 対応として `source_broadcaster_user_id` と自チャンネルの一致チェック（重複アクション防止）を最初から実装。`automod.message.hold` は既存 `held_messages` テーブルへ
- **対象**: `services/twitchIngestionService.js`（新規、`youtubeIngestionService.js` をひな形に）・`server.js`（require+shutdown）・`routes/twitch.js`
- **完了条件**: 取込が必ず `commentsController.ingestComment()` を通ること（モデレーション/保留/離脱検知が自動適用される）・キー未設定時は警告のみで無効化

### W-3. Policy-as-Prompt 文脈分析（R-4）
- **前提**: OpenAI APIキーが使える環境で着手（本リポジトリの検証環境では実LLM経路を検証できなかった）
- **手順**: 文化プロファイル→ポリシー文変換を `creatorCultureService` に追加 → 直近N件の文脈と併せて chat モデルで判定する関数を `openaiService` に追加 → `routes/communityInsights.js` の `_contextAdjustedScore` をLLM版に置換（**キー未設定時は既存ヒューリスティックへフォールバック維持**）
- **コスト設計**: プロンプトキャッシュ前提の「大きな固定ポリシー文+短い可変部」構成（根拠: RESEARCH_IMPROVEMENTS R-4）。Batch APIはリアルタイム用途に不可
- **完了条件**: キー有無両方でテストが通ること・モックOpenAIクライアントでのプロンプト構築ユニットテスト

### W-4. スタブAPIトリアージ（E-1/E-2）
- **対象**: `moderationController.js` 約35関数・`analyticsController.js` 13関数
- **判断基準**: フロントから実際に呼ばれている→本実装 / どこからも呼ばれていない→削除（前例: R-3・R-10のデッドコード削除、E-9〜E-12）
- **手順**: 関数ごとに `grep -rn "<エンドポイントパス>" frontend/src` で利用有無を確認 → 数関数単位でコミット
- **完了条件**: 「デモ応答」「ハードコード値」を返すAPIがゼロになる（実装 or 削除で）

### W-5. 日本語評価ハーネス（R-5b）
- AnswerCarefully 等の日本語安全性データセットからサンプルを取り、`analyzeComment`/omni-moderation の検出率を計測するテスト/スクリプトを追加。R-1の効果測定を兼ねる

### W-6. YouTube 新イベント種別の取込（R-8）
- 対象タイプ確定済み: `membershipGiftingEvent`/`giftMembershipReceivedEvent`/`newSponsorEvent`/`memberMilestoneChatEvent`/`pollEvent`/`superStickerEvent`。`ingestComment` メタデータへ保存しインサイト入力に活用

### W-7. streamList 調査（R-6）
- **注意**: `liveChatMessages.streamList` は **gRPC**（RESTではない）。取込層の設計変更を伴う中規模タスク。着手前にネットワーク制限のない環境で公式ドキュメントを直接確認すること

### W-8〜W-11. 製品判断待ち（勝手に着手しない）
- **W-8** マルチテナント本実装（D-6/E-3）・**W-9** httpOnly Cookie移行（D-7）・**W-10** 規制対応（R-13、法的要求事項の整理は RESEARCH_IMPROVEMENTS に済み）・**W-11** Stripe課金UI（E-5）
- いずれもスキーマ設計/対応市場/法務の判断が必要。**ユーザーの明示指示があった場合のみ着手**し、判断材料は各参照先に整理済み

## 7. 定型コマンド集

```bash
# テスト（ベースライン確認）
cd backend && rm -f data/test.db && NODE_ENV=test npx jest --runInBand 2>&1 | grep -E "Test Suites:|Tests:"

# devサーバー起動（predevが壊れているため直接起動）
cd backend && nohup env NODE_ENV=development PORT=3000 node src/server.js > /tmp/backend.log 2>&1 &
# （disownは別コマンドで）

# フロントdevサーバー
cd frontend && nohup npx vite --port 5173 > /tmp/frontend.log 2>&1 &

# E2E認証の定型
RAND=$RANDOM
curl -s -X POST http://localhost:3000/api/users/register -H "Content-Type: application/json" \
  -d "{\"username\":\"qa$RAND\",\"email\":\"qa$RAND@example.com\",\"password\":\"TestPass123!\"}"
TOKEN=$(curl -s -X POST http://localhost:3000/api/users/login -H "Content-Type: application/json" \
  -d "{\"username\":\"qa$RAND\",\"password\":\"TestPass123!\"}" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")

# 公開（feature→masterのfast-forward）
git push origin claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC
git push origin claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC:master
```
