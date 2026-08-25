# 最新研究・API動向にもとづく改善点（Research-Driven Improvements）

**作成日: 2026-07-11 / 最終更新: 2026-07-13** / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`

## この文書の目的

本書は、この製品（YouTube/Twitch コメントモデレーションプラットフォーム）の AI/モデレーション機構を、**2024〜2026年の関連論文・公式API動向・データセット**と突き合わせて洗い出した改善点リストである。`docs/FEATURE_AUDIT.md`（機能過不足）とは別軸で、「実装は動いているが、技術選択が古い・研究的により良い手法がある」項目を扱う。

**作業規約・環境の罠・検証プロトコル・優先順位付き作業指示（Work Orders）は `docs/AI_AGENT_HANDBOOK.md` を参照。** 本書の各改善項目（R-x）は Handbook の Work Orders から参照される。

## プロダクト評価（長所/短所）— 2026-07-13時点・実地検証ベース

本セッションでの実コード読解・全テスト実行・実ブラウザE2E検証にもとづく事実ベースの評価。

### 長所

1. **実動する認証基盤**: 登録/ログイン/2FA/リフレッシュトークンローテーション（旧トークン即無効化）/パスワードリセットまで一通り実装され、curl+実ブラウザでE2E検証済み
2. **実データのYouTube Live Chat取り込み**: `liveChatMessages.list`のポーリングでAPIの`pollingIntervalMillis`を尊重し、日次クォータ追跡（1万units・超過前ブロック）・指数バックオフ・連続エラー時の自動停止を備える
3. **フェイルセーフ設計の一貫性**: OpenAI/YouTube/SMTP等のキーが未設定でも警告のみで起動し、ルールベースにフォールバックして全機能が動作する（今回の翻訳配線・NGワード読込も同じ規約で実装）
4. **テスト基盤と運用規律**: 447テスト・失敗4件（意図的な仕様未確定分のみ）まで削減済み。「ベースライン悪化ゼロ」を毎変更で確認する運用が確立
5. **差別化になりうるコミュニティインサイト群**: 健全性スコア（6シグナル加重）/常連離脱検知/文化プロファイル/文脈分析という「単なるNGワードフィルタではない」機能群がUI込みで存在
6. **モデレーション業務のワークフロー対応**: 保留メッセージキュー、ソフトデリート+削除履歴テーブルの監査証跡、モデレータートリアージなど、実務フローを意識した設計

### 短所

1. **Twitch未実装**: 製品名が「YouTube/Twitch」を約束するのに片翼のみ（実装経路はR-7で確定済み、Conduits/Shared Chat対応も含め設計を更新済み）
2. ~~NGワード実効リストがプレースホルダ~~ → **R-5aで解消済み**。~~全角/ゼロ幅/ホモグリフによる回避に無防備~~ → **R-11で解消済み**（2026-07-13）
3. ~~**in-memory状態の揮発**~~ → **R-18（文化プロファイル）・R-19（離脱検知）でDB永続化済み**（2026-07-18）
4. ~~レート制限が全体で無効~~ → **E-14/W-1で解決済み**（2026-07-18・本番のみ既定有効）。マルチテナント未配線（D-6/E-3）は残
5. **大量のスタブAPI**: moderationController約35関数・analyticsController 13関数がハードコード値を返す（E-1/E-2。今回さらに翻訳モック2件とカスタムフィルタの全滅バグを解消したが、残りは個別トリアージ待ち）
6. **文脈分析が素朴ヒューリスティック**: 感情スコア平均±0.3補正のみ。改善方針はR-4（Policy-as-Prompt）で確定済み・コスト面の裏付け（プロンプトキャッシュ）も確認済みだが未実装
7. ~~本番依存にブラウザ向けライブラリ（aframe/three）・未使用の脆弱な依存（multer, CVE-2025-47944）が混入~~ → **R-12で解消済み**（2026-07-13）
8. **規制対応が未着手**: EU DSA型の機械可読な削除理由・透明化データベース連携は無し。日本市場向けなら情プラ法の7日以内対応が優先度の高い実務要件（R-13、製品判断待ち）

- 各項目に **根拠（論文/公式ドキュメントのURL）**・**対象ファイル**・**再検証コマンド** を付す
- 出典は全て実在を確認済み（arXiv ID・公式ドキュメント）
- 「即効」= 数行〜1ファイルで完了・根拠が確定的、「中期」= 設計判断が軽く研究裏付けあり、「長期」= 製品判断が必要

## 現状の技術スタック（コード棚卸し結果・2026-07-11時点）

| 機能 | 現状の実装 | ファイル |
|---|---|---|
| 有害性検出 | OpenAI Moderations エンドポイント | `services/openaiService.js` `detectToxicContent()` |
| 感情分析 | OpenAI chat + ルールベース(JP/EN正規表現)フォールバック | `openaiService.js` / `moderationService.js` |
| 文脈分析 | 前後コメントの感情スコア平均±0.3補正のヒューリスティック | `routes/communityInsights.js` `_contextAdjustedScore()` |
| 文化プロファイル | 5プリセットの静的しきい値乗算（in-memory Map、永続化なし） | `services/creatorCultureService.js` |
| NGワード | `ng-words.json`データファイル（ja/en）+ ゼロ幅/NFKC/confusables正規化による回避対策済み（R-5a/R-11） | `moderationService.js` `normalizeForMatching()` |
| YouTube取込 | `liveChatMessages.list` ポーリング（`pollingIntervalMillis`尊重・クォータ追跡）。`streamList`（gRPCサーバープッシュ）は実在確認済み・未移行 | `services/youtubeIngestionService.js` |
| Twitch取込 | **未実装**（クレデンシャル設定のみ）。実装経路はConduits/Shared Chat対応込みで確定済み（R-7） | — |
| 翻訳 | `openaiService.translateText()`へ配線済み（R-10、実LLM翻訳、キー未設定時は原文+available:false） | `moderationController.js` `translateText`/`autoTranslate` |

---

## 即効（本ブランチで実施済み ✅）

### R-1. ✅ OpenAI Moderation モデルを `omni-moderation-latest` へ更新

- **根拠**: OpenAI は2024-09に `omni-moderation-latest`（GPT-4oベース）を公開し、旧 `text-moderation-latest` の後継とした。**多言語（日本語含む）精度が向上**し、カテゴリも拡張（illicit等追加）。料金は引き続き無料。(https://platform.openai.com/docs/guides/moderation, https://openai.com/index/upgrading-the-moderation-api/)
- **元の問題**: `openaiService.js:258` は `openai.moderations.create({ input: text })` とモデル未指定で呼び、返り値のラベルだけ `'text-moderation-latest'` とハードコードしていた（API側デフォルトも旧モデル）
- **実施した修正**: `config.services.openai.moderationModel`（環境変数 `OPENAI_MODERATION_MODEL`、既定 `omni-moderation-latest`）を新設し、`moderations.create({ model, input })` で明示指定。`.env.example` にも追記
- **再検証**: `grep -n "omni-moderation-latest" backend/src/config.js` → ヒットすれば適用済み

### R-2. ✅ （調査の結果、既に解決済みと判明）

- **調査時の懸念**: `youtubeIngestionService.js` が参照する `config.services.youtube.pollingInterval`/`maxResults` が config に未定義との情報があった
- **実際**: `config.js:100-101` に両方とも定義済み（`YOUTUBE_POLLING_INTERVAL`/`YOUTUBE_MAX_RESULTS`、既定5000/100）。過去のセッションで解決済みか、当初から存在。**対応不要**

### R-3. ✅ `Math.random()` モックのAIモデレーション関数群を削除

- **根拠/元の問題**: `moderationService.js` に OpenAI/Google Perspective/Azure の3プロバイダーを模した約240行の関数群（`performAIModeration` / `performMultiProviderAIModeration` / `normalizeAIModerationResult` / `AI_MODERATION_PROVIDERS`）が存在したが、**実体は `Math.random()` でスコアを生成する完全なモック**。どこからも export/参照されておらず、HTTP層（`moderationController.performAIModeration`）は既に実物の `openaiService.detectToxicContent` を直接呼んでいた。偽装コードが「多プロバイダー対応済み」という誤解を生む状態だった
- **Perspective API は 2026-12-31 にサービス終了**が公式告知されており（https://developers.perspectiveapi.com/, https://www.lassomoderation.com/blog/perspective-api/）、この方向への再実装は行わない
- **実施した修正**: デッドモック群を削除し、経緯を説明するコメントに置換。テスト悪化ゼロを確認（4 failed / 425 passed 維持）
- **再検証**: `grep -c "Math.random" backend/src/services/moderationService.js` → 3（チャットボットの応答ランダム選択のみ）なら適用済み

---

## 中期（研究裏付けあり・未実装・次段の着手候補）

### R-4. ★ 文脈分析を Policy-as-Prompt 化（ヒューリスティック置換）

- **根拠**:
  - **Policy-as-Prompt** (arXiv:2502.18695, ACM FAccT 2025) — コミュニティガイドラインを自然言語プロンプトとして LLM に直接埋め込む方式。手動アノテーション不要で、ポリシー変更へ即応できる。(https://arxiv.org/abs/2502.18695)
  - **ToxiTwitch** (arXiv:2601.15605) — ライブ配信チャットは前後文脈を含めたハイブリッド判定で検出精度が向上。(https://arxiv.org/abs/2601.15605)
- **現状の弱点**: `_contextAdjustedScore()`（`routes/communityInsights.js`）は「前後コメントの感情スコア平均を出し、`(avg-0.5)*0.3` で対象スコアを補正」という素朴なヒューリスティック。文脈の意味理解をしていない
- **改善案**: 既存の**文化プロファイル（5プリセット）をシステムプロンプトのポリシー文へ変換**し、`detectToxicContent`/文脈分析で直近N件のチャット文脈と一緒に LLM へ渡す。本製品の「文化プロファイル」機能は Policy-as-Prompt の理想的な入力になっている（既に器がある）
- **対象ファイル**: `services/creatorCultureService.js`（プリセット→ポリシー文変換の追加）, `routes/communityInsights.js`（`_contextAdjustedScore`のLLM版）, `services/openaiService.js`（文脈付きモデレーション関数の追加）
- **注意**: OpenAI キー未設定環境では既存のルールベースにフォールバックする現行規約を維持すること
- **コスト面の裏付け（2026-07-13ラウンド2で追加確認）**: 固定の大きな文化プロファイル/ポリシー文をシステムプロンプトとして毎回送る設計はコストが心配されるが、OpenAIのプロンプトキャッシュは1024トークン以上のプロンプトに**追加の実装なしで自動適用**され、GPT-5系モデルではキャッシュ済み入力トークンが最大90%割引になる（2026-05-29以降キャッシュ保持は既定24時間に延長）。これにより「大きな固定ポリシー文+短い可変部分（文脈コメント）」という構成は同期的なリアルタイム応答を保ちながら低コストで運用できる。一方、OpenAI Batch API（トークン一律50%引き）は非同期・最大24時間の完了待ちでリアルタイムモデレーションには不向きであり、夜間バッチ分析等のオフライン用途に限定すべき。(https://developers.openai.com/api/docs/guides/prompt-caching, https://developers.openai.com/api/docs/guides/batch) ※本セッションでは`developers.openai.com`への直接fetchがブロックされたため、WebSearch経由の一次情報照合による確認

### R-5. 日本語有害性の実カバレッジ整備 — (a) ✅ 実施済み / (b) 未着手

- **根拠**:
  - **AnswerCarefully** (鈴木ら, NLP2025) — 日本語LLM安全性データセット v2.0（評価336件/開発1,464件）。(https://www.anlp.jp/proceedings/annual_meeting/2025/pdf_dir/Q2-3.pdf)
  - リコー等が14カテゴリの日本語ガードレールモデルを2025年に公開するなど、日本語有害性検出のリソースが充実してきた。(https://jp.ricoh.com/release/2025/1225_1)
- **元の弱点**: 実効NGリストが `['badword','spamword']` のプレースホルダで**キーワードモデレーションが実質無効**。日本語カバレッジがほぼ無い
- **(a) ✅ 実施済み（2026-07-13）**: `src/data/ng-words.json` を新設（ja/en・abuse/threat/spamカテゴリ別、明白に敵対的/スパム的な語句に限定した実用最小リスト）。`analyzeComment()` が起動時に読み込み、英語は小文字化比較で大文字小文字を区別せず検出。読込失敗時は空リスト+警告のフェイルセーフ。`tests/services/moderationService.test.js`（新規8テスト）で検証。文脈依存語（ゲーム実況の「殺す」等）は意図的に収録せず、文化プロファイル/AI分析側に委ねる設計
- **(b) 実施済み（2026-08-08）— 評価ハーネスと実測値**: `src/scripts/evaluateModeration.js`（Precision/Recall/F1 を difficulty 別に集計）と `src/data/moderation-eval-set.json`（ライブ配信チャットを想定した日本語20件のラベル付きコーパス）を新設。公開ベンチマーク（**WildGuardTestJP**: 英語WildGuardTestベースの日本語ガードレール評価、入出力の有害性と応答拒否を多角評価 / **AnswerCarefully** / リコーのガードレールモデル）はライセンス・配布条件のため同梱できないが、**同じ形式に変換すれば差し替えて評価できる**設計にした
  - **実測結果（キーワード層のみ・OpenAIキー無し）**: 全体 **Precision 88.9% / Recall 61.5% / F1 72.7%**
  - **難易度別**: `direct`（明示的NG語）**100%** / `evasion`（表記回避）**75%** / `indirect`（語彙に頼らない攻撃）**0%** / `hard-negative` 誤検知 1/7
  - **この数値が示すこと（重要）**: 語彙一致層は明示的な語に対しては機能している一方、**「その顔で配信とか、よく人前に出られるね」「昨日どこにいたか知ってるよ」のようなNG語を含まない攻撃は原理的に1件も検知できない**。さらに「やっと死ねる（ゲーム完走の肯定表現）」を誤検知する。**つまり語彙リストの拡充では解決せず、R-4（Policy-as-Prompt によるLLM文脈判定）が必要**という実証的な根拠が得られた。単に語を足すと誤検知が増える（例: ひらがな「しね」は「気にしねー」に誤爆するため意図的に未追加）
  - **副次的な確認**: R-11のゼロ幅文字除去は正常動作（`死`+ZWSP+`ね`は検知）。未検知の1件はひらがな置換という語彙カバレッジの問題であり、正規化の不具合ではないことを切り分けた
  - **回帰テスト**: `tests/services/moderationEval.test.js` が上記の実測値を下限として固定。**`indirect` が改善したらR-4の効果測定として期待値を引き上げる**運用
  - **再検証**: `node src/scripts/evaluateModeration.js`（人間向け）/ `--json`（CI用）
  - **出典**: [WildGuardTestJP (SB Intuitions, 2025-09)](https://www.sbintuitions.co.jp/blog/entry/2025/09/16/160351) / [リコー ガードレールモデル (2025-12)](https://jp.ricoh.com/release/2025/1225_1) / [日本語誹謗中傷検出の裁判例データセット](https://www.jstage.jst.go.jp/article/jnlp/31/4/31_1598/_article/-char/ja/)
- **再検証**: `NODE_ENV=test npx jest tests/services/moderationService.test.js` → 8件合格なら(a)維持

### R-5補足. ✅ 実装検証中に発見・修正した既存バグ: カスタムフィルタ全滅（2026-07-13）

- **発見の経緯**: R-5a検証のスモークテストで、全コメント分析ごとに `[CustomFilter] Error applying filter` 警告が3件ずつ出ることに気づいた
- **原因**: `applyCustomFilters()` の regex 処理が、`/.../i` 定義済みパターンに無条件で `'i'` フラグを連結し `'ii'` を生成 → `SyntaxError: Invalid flags` → catch で握りつぶし。デフォルト3フィルタ群（spam-patterns / offensive-language / repeated-chars）は大半のパターンが `i` フラグ付き定義のため、**カスタムフィルタ機能全体が一度も動作していなかった**（offensive-language の +70/block、spam-patterns の +30/flag が常に不発）
- **修正**: パターンが既に `i` フラグを持つ場合はそのまま使用。回帰テストを `tests/services/moderationService.test.js` に追加
- **再検証**: `node -e` で `analyzeComment('you are a fucking idiot')` → score≥70・isSpam:true になること

### R-6. YouTube 取込のクォータ最適化 — `streamList` の実在を確認（2026-07-13ラウンド2で決着）

- **前回の状態**: 「サーバープッシュ型メソッドが使えるか未検証の最適化仮説」として保留していた
- **確認結果**: `liveChatMessages.streamList` という**実在するgRPCサーバーストリーミングメソッド**が公式に存在する（サービス`V3DataLiveChatMessageService`、`stream_list.proto`定義）。`pollingIntervalMillis`ベースのポーリングを避けるため明示的に位置づけられている。接続確立時に履歴を返し、以後`nextPageToken`で定期的に再接続する方式（無限に張りっぱなしの1本のストリームではなく、接続ウィンドウ単位のプッシュ）。(https://developers.google.com/youtube/v3/live/streaming-live-chat, メソッドリファレンス: https://developers.google.com/youtube/v3/live/docs/liveChatMessages/streamList)
  - **確認手法の限界**: 本セッションのサンドボックスから`developers.google.com`への直接WebFetchがプロキシにブロックされたため、複数の独立したWebSearchクエリが同一のメソッド名・proto定義・サービス名を収束的に返したことを根拠に「確認済み」としている。**実装着手前に、ネットワーク制限のない環境で上記URLを直接開いて再確認すること**
- **実装コスト上の重要な注意**: 現行実装はREST（`googleapis`ライブラリ経由のJSON API）のみを使用しているが、`streamList`は**gRPC**であり、Node.jsでの利用には`@grpc/grpc-js`等の別クライアントスタックが必要になる可能性が高い。「数行の変更でポーリングをやめられる」規模ではなく、**取り込み層の設計変更を伴う中規模タスク**として計画すること
- **対象ファイル**: `services/youtubeIngestionService.js`

### R-7. ★ Twitch 実装の経路確定 — Conduits/Shared Chat対応も含めて更新（2026-07-13ラウンド2）

- **根拠（前回確認済み）**: Twitch の現行公式チャット統合経路は **EventSub WebSocket + `channel.chat.message` 購読**（IRC/PubSubはレガシー）。AutoModと連携するなら `automod.message.hold`（`moderator:manage:automod` スコープ必須）で保留メッセージを受信できる。(https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- **追加確認（今回）**:
  - **Conduits**（2024-01-25 GA）: サブスクリプションを単一のWebSocket/Webhook接続に縛らない新しいEventSubトランスポート。Conduitを作成し複数の「シャード」（各々WebSocketまたはWebhookでバック）を割り当て、EventSubがチャンネルIDごとにハッシュルーティングする。無効なシャードは1回だけ他シャードへの再試行を経て、失敗すれば通知が破棄される。単一接続よりスケーラブルで信頼性の高い設計。(https://dev.twitch.tv/docs/eventsub/handling-conduit-events/)
  - **Shared Chat**（2024年導入の複数チャンネル合同配信機能）: `channel.shared_chat.begin`/`.update`/`.end` というEventSubイベントが追加され、`channel.chat.message`等のペイロードには`source_broadcaster_user_id`が付与されるようになった。**モデレーションボット設計への直接的な影響**: Shared Chatではメッセージ/モデレーションが参加チャンネル全体にミラーされるため、`source_broadcaster_user_id`と自身が購読している`broadcaster_user_id`を突き合わせないと、同一メッセージへの多重アクション（二重BAN等）が発生しうる。(https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/, https://dev.twitch.tv/docs/chat/moderation)
- **現状**: `config.services.twitch` にクレデンシャルはあるが実装ゼロ。`['youtube','twitch']` のバリデーション白リストにだけ `twitch` が並ぶ張りぼて状態
- **改善案**: `services/twitchIngestionService.js` を新規作成。**単一WebSocketではなくConduitベース**でEventSub購読を設計し、`channel.chat.message`を`commentsController.ingestComment()`（プラットフォーム`twitch`）へ投入。Shared Chat対応のため、受信イベントの`source_broadcaster_user_id`が自チャンネルと一致する場合のみ処理する重複排除ロジックを最初から組み込む。`automod.message.hold`は既存の held-messages キュー（`db.js` の `held_messages` テーブル）へ接続。**IRC実装は不要**
- **対象ファイル**: `services/twitchIngestionService.js`（新規）, `server.js`（require+shutdown）, `routes/twitch.js`（監視開始/停止、youtube.jsのミラー）

### R-8. エモート/スタンプ/新イベント種別をモデレーション入力に含める（2026-07-13ラウンド2で対象を具体化）

- **根拠**:
  - **ToxiTwitch** (arXiv:2601.15605) / **E2T2: Emote Embedding for Twitch Toxicity Detection** (CSCW 2024) — エモートを考慮すると配信チャットの有害性検出精度が向上。エモートは配信文化の中核であり、テキストだけでは意味が欠落する。(https://arxiv.org/abs/2601.15605, https://doi.org/10.1145/3678884.3681840)
- **現状**: YouTube のスタンプ・メンバーシップギフト等のイベント種別が `ingestComment` のメタデータに取り込まれていない
- **今回具体化した対象イベント種別**（`liveChatMessage.snippet.type`。いずれも公式ドキュメントで確認済み）:
  - `membershipGiftingEvent` / `giftMembershipReceivedEvent`（メンバーシップ贈答）
  - `newSponsorEvent` / `memberMilestoneChatEvent`（新規メンバー・継続記念）
  - `pollEvent`（ライブ投票。数値型コード「20」は未確認のため実装時に要再確認）
  - `superStickerEvent`（Super Chatとは別オブジェクト`superStickerDetails`を持つ）
  (https://developers.google.com/youtube/v3/live/docs/liveChatMessages, https://developers.google.com/youtube/v3/live/docs/superChatEvents)
- **改善案**: これらのイベント種別とスタンプ情報を `ingestComment` のメタデータへ保存し、モデレーション/インサイトの入力に含める（例: メンバーシップ贈答直後のコメントは信頼度が高い等、文化プロファイルの補助シグナルとして活用できる）
- **対象ファイル**: `services/youtubeIngestionService.js`, `controllers/commentsController.js` `ingestComment()`

---

## 長期（製品判断が必要・当面はドキュメント記載のみ）

### R-9. SLM-Mod 路線（コミュニティ固有の微調整済み小型モデル）

- **根拠**: **SLM-Mod** (arXiv:2410.13155, NAACL 2025) — 15B未満の小型モデルをコミュニティ固有に微調整すると、ゼロショットLLMを**精度+11.5%・再現率+25.7%**で上回り、リアルタイム照会コストとレイテンシも低い。(https://arxiv.org/abs/2410.13155, https://aclanthology.org/2025.naacl-long.441/)
- **判断材料**: 本製品の「配信者ごとの文化プロファイル」はコミュニティ固有モデレーションと親和性が高い。ただし微調整モデルのホスティングにはGPU/推論基盤が必要で、現行のデプロイ想定（Node.js単体 + OpenAI API）とは乖離する。**当面は `gpt-4o-mini` + few-shot（R-4のPolicy-as-Prompt）で代替可能**。ユーザー数・コメント量が API コストを圧迫する規模になった段階で再検討
- **実施しない理由**: ローカルML基盤の導入は本タスクのスコープ外・実行環境要件が不一致

### R-10. ✅ モック翻訳を実翻訳へ配線替え（2026-07-13実施済み）

- **元の問題**: `moderationController.translateText`/`autoTranslate` はハードコードEN↔JA語彙のモックで、未収録語には `[ja→en] テキスト` という**機械翻訳風の偽装文字列**を返していた。一方 `openaiService.translateText()` には実際に動くLLM翻訳が存在していたが未配線。`moderationService.js` 内にも同内容のデッドモック2関数（約130行、export無し）が重複していた
- **実施した修正**: HTTP層2エンドポイントを `openaiService.translateText()` へ配線替え。**キー未設定/失敗時は原文を `available:false` 付きで返し、偽装翻訳は返さない**。デッドモック2関数は削除。言語検出は `moderationService.detectLanguage()`（20言語対応の文字/単語ベース検出、従来未exportだった実用ロジック）をexport化して `autoTranslate` の簡易3言語判定を置換
- **検証**: devサーバー起動+curlで `POST /api/moderation/translation/translate`（原文+available:false+明示メッセージ）・`/auto-translate`（ja検出・same_languageスキップ・per-target error）を確認。フルテスト悪化ゼロ
- **再検証**: `grep -n "openaiService.translateText" backend/src/controllers/moderationController.js` → 2箇所ヒットすれば適用済み

### R-11. ✅ NGワード回避対策（leetspeak/全角/ゼロ幅/ホモグリフ）を実装（2026-07-13ラウンド2）

- **根拠**（複数の独立した2024-2026論文で確認、詳細は出典一覧参照）:
  - 全角文字・ホモグリフ（同形異字）・ゼロ幅文字による文字レベル攻撃は、Unicode正規化を行わないモデレーションシステムに対し**42〜67%の回避成功率**を示す（arXiv:2508.14070v1）
  - ホモグリフ置換（例: キリル文字によるラテン文字の視覚的すり替え）はAI検出器の精度をほぼランダムまで低下させる（SilverSpeak, arXiv:2406.11239）
  - ゼロ幅文字（ZWSP/ZWJ/ZWNJ）を単語内に挿入して自動フィルタを回避する手法は、実際のモデレーション回避・フィッシングメール回避の両方で実地に確認されている（practitioner write-ups）
  - Unicode公式のUTS #39は confusables.txt（約6,565文字のマッピング）とskeleton algorithmを回避検出の標準手法として定義している。ただしNFKC正規化単体とconfusables.txtは31文字で食い違いがあり、正規化だけでは不十分（https://www.unicode.org/reports/tr39/）
- **元の問題**: R-5aで実装したNGワード部分一致は、全角文字・ホモグリフ・ゼロ幅文字による回避に対して無防備だった（例:「ｋｙｓ」「κys」「死␣ね」でNGワード判定をすり抜けられる）
- **実施した修正**: `moderationService.js`にゼロ幅文字除去（U+200B/200C/200D/2060/FEFF）+NFKC正規化を常時適用する`normalizeForMatching()`を追加し、NGワード照合の主判定文字列として使用。加えて軽量な依存ゼロのnpmパッケージ`confusables`（`remove()`関数でホモグリフをASCIIへ正規化）による追加照合候補をOR条件で併用
  - **重要な設計判断**: `confusables.remove()`は日本語の仮名を誤って英字と誤認することがある（実測: "こんにちは"→"こhにちは"）。そのため主判定文字列の置き換えには使わず、あくまで追加の照合候補としてのみ使用し、誤爆しても主判定（日本語NGワードの検出精度）には影響しない設計にした
- **検証**: `tests/services/moderationService.test.js`に4件追加（全角/ホモグリフ/ゼロ幅の回避を検出できること、confusables正規化が無害な日本語コメントを誤検出させないこと）。devサーバー+curlで実際の`POST /api/comments`に全角「ｋｙｓ」を送信し、モデレーションで正しく拒否されることを確認
- **再検証**: `grep -n "normalizeForMatching\|removeConfusables" backend/src/services/moderationService.js` → ヒットすれば適用済み。`NODE_ENV=test npx jest tests/services/moderationService.test.js` → 全件合格を確認

### R-12. ✅ 依存関係のクリーンアップ（未使用・危険な依存の削除、2026-07-13ラウンド2）

Web調査で確認した事実と、実コードでの参照ゼロをgrepで確認した上で削除:

- **`aframe`（WebXR/ARフレームワーク）・`three`（three.js、3Dグラフィックス）**: `backend/src/`のどこからも一度もimport/requireされていない。両者ともブラウザ向けのクライアントサイドライブラリで、コメントモデレーションのバックエンドが本番依存として持つ正当な理由がない（クライアント側のデモ/プレビューが存在するならdevDependencyとしてもあり得るが、それすら本製品には該当しない）。**混入経緯不明の死重**として削除
- **`multer`（ファイルアップロード処理ミドルウェア）**: `backend/src/`のどこにも`.single(`/`.array(`/`.fields(`等の呼び出しが無く、ファイルアップロード機能自体が存在しない。加えて確認済みの現行バージョン（1.4.5-lts.1）には**CVE-2025-47944**（不正なmultipartリクエストによるDoS、2.0.0で修正、https://github.com/advisories/GHSA-4pg4-qvpc-4q3h）が存在する。未使用かつ既知の脆弱性を持つ依存のため、バージョン更新ではなく完全削除を選択
- **`ioredis`**: `redis`（node-redis）と機能が競合する別実装のRedisクライアントで、実コードでは一貫して`redis`のみが使用されており`ioredis`はどこからも一度もrequireされていない。Redis公式ドキュメントもnode-redisを新規プロジェクトの推奨クライアントとして位置づけている（https://redis.io/docs/latest/develop/clients/nodejs/migration/）。削除
- **`react-window`（フロントエンド）**: 仮想リストライブラリだが、実際に使われているのは`react-virtuoso`のみで`react-window`はどこからも一度もimportされていない。削除
- **`pm2`は維持**: `npm start`等のスクリプトが`pm2 start ecosystem.config.js`をCLI経由で呼んでおり、実運用で使われているため削除しない
- **検証**: `npm uninstall`後、`node -e "require('./src/app.js')"`でバックエンド起動を確認、フロントは`npx vite build`で本番ビルド成功を確認。フルテストスイート悪化ゼロ
- **再検証**: `grep -E "aframe|\"three\"|multer|ioredis" backend/package.json` → ヒットなしなら削除済み。`grep "react-window" frontend/package.json` → ヒットなしなら削除済み

---

## 追加調査（2026-07-13ラウンド2・ドキュメント記載のみ・未実装）

以下はWeb調査で確認したが、規模またはネットワーク制約による確認限界のため、今回は実装せずバックログとして記載する。

### R-13. 規制対応 — EU DSA・英国OSA・日本の情プラ法

**確認済みの法的要求事項（本セッションではDSA/OSA関連ドメインへの直接fetchがサンドボックスでブロックされたため、収束的なWebSearch照合による確認）**:
- **EU DSA第17条**: コンテンツの削除・可視性制限・アカウント停止等のあらゆるモデレーション措置に対し、「明確かつ具体的な理由の説明」を利用者に提示することが法的義務。措置の種類・期間・根拠となった事実・法的/契約上の根拠・自動判定の有無を含める必要がある
- **EU DSA透明化データベース**: 2025年7月1日発効の実施規則により、理由説明を欧州委員会運営の機械可読な公開データベースへ提出することが義務化（標準化されたカテゴリ・キーワード使用）
- **EU DSA控訴の仕組み**: 内部苦情処理システム（決定後最低6ヶ月維持）＋認定された裁判外紛争解決機関へのアクセス権（90日以内、複雑な場合180日まで延長）
- **英国OSA**: Ofcomの違法コンテンツ実施規範（2025年3月17日施行）により、苦情処理手続きとモデレーション機能の設置が義務。記録保持は「要求に応じて」提出可能な状態を求めるが、DSAと異なり固定の保持期間や機械可読フォーマットは法定されていない
- **日本の情プラ法（情報流通プラットフォーム対処法、2025年4月施行）**: 大規模プラットフォーム事業者に対し、誹謗中傷・個人情報暴露（晒し）投稿の削除要請に概ね7日以内の対応を法的に義務付け。晒し+誹謗中傷の組み合わせは刑法230条（名誉毀損罪、3年以下の懲役または50万円以下の罰金）の対象になりうる
- **製品への示唆**: 本製品は既に削除履歴テーブル（監査証跡）を持つが、DSA型の「機械可読な理由コード」「透明化データベースへの提出」「認定ODS機関への導線」は未実装。日本市場中心の製品であれば情プラ法の7日以内対応が最優先の実務要件になりうる
- **出典**: https://www.eu-digital-services-act.com/Digital_Services_Act_Article_17.html, https://digital-strategy.ec.europa.eu/en/faqs/dsa-transparency-database-questions-and-answers, https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act, https://note.com/slimed/n/n8465989acbc1
- **実施しない理由**: 法務判断・製品として対応市場を確定する経営判断が必要なため、実装せずバックログ化

### R-14. モデレーターUX/トリアージ設計の知見 — (a) 構造化フラグ理由 ✅ / (b) 保留理由バッジUI ✅ / (c) ポジティブキュー 未着手

**確認済みの知見**（2024-2026 CSCW/FAccT系研究、arXiv直接fetchはブロックされたためWebSearchでの抄録照合による確認）:
- 構造化された説明（フラグ理由をスパン単位・ポリシータグ付きで提示）は、自由記述の説明より約7.4%モデレーターの判断を高速化する（精度は犠牲にしない）(arXiv:2406.04106)
- 単一の時系列ソートキューはモデレーターの多様な目的（精度・公平性・ワークフロー適合）に応えられず、設定可能なフィルタ/ソート/ワークフロー別ビューが求められる（arXiv:2409.16840）
- 「ポジティブキュー」（望ましいコンテンツを表彰対象として提示するAI支援機能）は、罰則一辺倒のレビュー負荷を軽減し、実際のモデレーターに好評だった（arXiv:2509.18437）
- AIによる説明の**提示形式**（顕著性マップ vs 反実仮想的書き換え）は、モデレーター自身の属性によって心理的影響が異なる（反ヘイトスピーチのケースで、当事者性の高いモデレーターほど反実仮想的説明で不快感が強い）— 速度/精度だけでなく心理的公平性も設計指標に含めるべき（arXiv:2310.15055）
- **本製品の現状との突き合わせ**: `TriageQueue.jsx`は既に重要度によるフィルタ機能を持っており、単一の時系列キューという指摘には部分的に対応済み。一方、構造化された説明サーフェス（どのNGワード/フィルタがヒットしたかは`flaggedWords`/`customFilterMatches`として既に持っているため、UI側でこれを可視化すれば低コストで実現可能）と「ポジティブキュー」は未実装
- **(a) ✅ 実施済み（2026-07-13）**: `analyzeComment()` が返すモデレーション結果に `flaggedCategories`（abuse/threat/spam のどれでヒットしたか）を追加。`ng-words.json` のカテゴリ構造を起動時に語→カテゴリのMapとして読み込み、照合時に重複なくカテゴリを記録する。この構造化理由は拒否時のAPIレスポンス（`data.moderation.flaggedCategories`）・保留メッセージ・運用ログの全てに自動で伝播する。`tests/services/moderationService.test.js` に5テスト追加、実APIでも `POST /api/comments`（「住所特定した」→`flaggedCategories:["threat"]`）で確認済み
- **(b) ✅ 実施済み（2026-07-18）**: 保留メッセージキューUI（`HeldMessagesQueue.jsx`）に構造化された保留理由バッジを追加。`checkMessageHold()` の `reasons` 配列に `ng_word_category` 理由（カテゴリ＋語、脅迫は high severity）を追加し、フロントの `extractReasonBadges()` が `ng_word_category`（暴言/脅迫/スパム）・`multiple_links`（リンク多数）・`negative_sentiment`（ネガティブ感情）・`repeated_chars`（連続文字）を色分けChipで表示する。**従来 `reasons` はDBに保存されていたがUIには一切表示されていなかった**ため、これらの理由が初めてモデレーターに可視化される。実ブラウザ（Playwright+Chromium）で保留メッセージを投入し、脅迫/暴言/リンク多数/ネガティブ感情の4バッジが正しい色で描画されることをスクリーンショットで確認済み
- **(c) 未着手**: 「ポジティブキュー」新機能（望ましいコンテンツを表彰対象として提示）は製品判断が必要
- **再検証**: `grep -n "flaggedCategories" backend/src/services/moderationService.js`（(a)）・`grep -n "extractReasonBadges" frontend/src/components/HeldMessagesQueue.jsx`（(b)）→ ヒットすれば適用済み
- **出典**: 詳細URLは出典一覧参照

### R-15. リアルタイム基盤のスケーリング知見（Socket.IOバックプレッシャ）

- **確認済みの知見**（GitHub Issue/Discussionは直接fetch確認済み、公式ドキュメントはWebSearch照合）:
  - Socket.IOにはバックプレッシャの組み込みプリミティブが無い。遅いクライアントへの書き込みバッファは無制限に増大しうり、大量接続下でメモリ枯渇のリスクがある（Socket.IO自身のGitHub Issueで確認済み、https://github.com/socketio/socket.io/issues/4435）
  - `socket.volatile.emit()`は転送不可能時にパケットを意図的に破棄する仕組みだが、根本的に遅いクライアントの問題は解決しない（https://github.com/socketio/socket.io/discussions/5063）
- **本製品への示唆**: `websocketScaling.js`は既にRedis Adapter対応済みだが、クライアント側のバックプレッシャ監視（書き込みバッファサイズの監視・閾値超過時の切断等）は未実装と見られる。大規模配信での長時間運用前に確認すべき項目
- **実施しない理由**: 現行の接続規模で問題が顕在化していないため、監視項目として記録するに留める

### R-16. カンファレンス動画・業界事例からの知見

**2025年の主要カンファレンスで発表された、実運用スケールのモデレーション事例**（WebSearchで確認、TrustCon関連の1件は内容不一致のため除外済み）:
- **GDC 2025 Machine Learning Summit**（Twitch, Linda Liu）: "Smart Detection"システムがTwitchチャット全体の95%以上をカバーし、チャンネルごとに学習するNLPモデルとLLMによるラベリング支援を使用（https://schedule.gdconf.com/session/machine-learning-summit-twitch-chat-safety-scalable-and-personalized-moderation-with-deep-learning/909659）
- **Stanford Trust & Safety Research Conference 2025**: Discordの検出/レビュー/エンフォースメントという3層抽象化モデルに基づくワークショップ（録画なし、公開アジェンダのみ）
- **Roblox Developer Conference 2025 基調講演**: テキスト/画像/3Dオブジェクト/シーンをリアルタイムに横断的にスクリーニングするモデレーションスタック（28言語、75万リクエスト/秒規模）(https://about.roblox.com/newsroom/2025/09/roblox-rdc-2025)
- **本製品への示唆**: いずれも自社スケール特有の事例であり直接転用はできないが、「チャンネル/コミュニティ単位で学習するモデル」という設計思想はR-9（SLM-Mod）・R-4（文化プロファイル活用）の方向性と一致する
- **実施しない理由**: インスピレーション/裏付け情報としての記載に留める

### R-17. 日本語有害表現検出・国内プラットフォーム事例

- **確認済みの知見**（WebSearchでの照合、jstage/ANLP等の一次情報への直接fetchはブロック）:
  - 2024年の日本語裁判例データセット研究は、クラウド annotator の「有害と感じる」主観ラベルではなく、実際の名誉毀損裁判の判決を根拠とするラベル付けを試みている（https://www.jstage.jst.go.jp/article/jnlp/31/4/31_1598/_article/-char/ja/）
  - SHOWROOM（国内大手ライブ配信プラットフォーム）は、キーワードブロックリストを超えたニューラルネットワークによる文脈判定AIを独自開発・特許出願しており、遠回しな言い方や複数投稿に分割したコメントによる回避も検出する（https://ledge.ai/showroom-comment/）
  - ニコニコ動画は2024年のサイバー攻撃からの復旧後、荒らしコメントの大量流入に対しコミュニティ主導のNGワードフィルタ拡張機能で対応する、プラットフォーム側AI頼みではないハイブリッドなモデレーションの実例を示している（https://togetter.com/li/2384569）
- **本製品への示唆**: SHOWROOMの「遠回しな言い方」「複数投稿分割」への対応は、本製品のR-4（文脈分析のPolicy-as-Prompt化）が目指す方向性そのもの。ニコニコの事例は、AIモデレーションと並行してユーザー/モデレーターが独自にNGワードを追加できる仕組み（`ng-words.json`は現状コード内データファイルだが、将来的に運用者がUIから編集できるようにする価値を示唆）
- **実施しない理由**: R-4/R-5の実装が進んだ段階で改めて参照する背景情報として記載に留める

### R-18. ✅ 文化プロファイルのDB永続化（2026-07-18・短所#3の一部解消）

- **元の問題**: `creatorCultureService.js` は文化プロファイル（配信者ごとのモデレーション厳格度設定、D-8でUIも追加済み）を in-memory の `Map` にのみ保持していた。プロセス再起動で全設定が消え、D-8のUIから設定しても再起動後には既定（entertainment）へ戻ってしまうため、実運用に耐えなかった
- **実施した修正**: `db.js` に `culture_profiles` テーブル（`channel_key` PK・`culture_type`・`custom_overrides` JSON・`updated_at`）を追加。サービスは起動時にDBから全プロファイルをMapへ復元し、`setProfile()` 時にMap更新（同期・読み取りの高速な真実の源）＋DBへのUPSERT（fire-and-forget・ベストエフォート永続化）を行う。**ルート層は同期APIのまま変更不要**。DB書き込み失敗時は警告ログのみで動作継続（既存のフェイルセーフ規約踏襲）
- **検証**: 単体テスト2件追加（新インスタンス＝再起動相当でプロファイルが復元される／未設定チャンネルは既定のまま）。**実サーバーで本当に再起動をまたいで永続化されることを確認**: `PUT /api/insights/culture/youtube/qatest-channel`で`gaming`設定→サーバー再起動→起動ログに「Restored 1 culture profile(s) from DB」→`GET`で`gaming`が返る（未設定チャンネルは`entertainment`のまま）
- **再検証**: `grep -n "culture_profiles" backend/src/db.js backend/src/services/creatorCultureService.js` → 双方ヒットすれば適用済み
- **残課題**: 離脱検知（`silentDepartureDetector.js`）→ R-19で解消済み

### R-19. ✅ サイレント離脱検知をコメント取込に配線＋再起動時ウォームアップ（2026-07-18）

- **元の問題（2つ）**:
  1. **データ源が無かった**: `silentDepartureDetector.record()` は取込パイプライン（`ingestComment`）から一度も呼ばれておらず、手動の `POST /api/insights/record-activity` エンドポイントからしかデータを受け取れなかった。つまり通常のコメント投稿では離脱検知に一切データが供給されず、**機能が実質的に空回り**していた（常に `regularUserCount: 0`）
  2. **再起動で揮発**: in-memory の `Map` のみで保持し、再起動で全アクティビティ履歴が消えていた
- **実施した修正**:
  1. `ingestComment` のコメント挿入成功パスで `departureDetector.record(platform, 'default', user, ts)` を呼ぶよう配線（insightsのUIが `channelId='default'` で問い合わせるのに合わせた）。検知器はin-memoryのため記録失敗は本処理に影響させない
  2. `silentDepartureDetector` の起動時に、既存の `comments` テーブルから直近ウィンドウ（7日+1日）分のアクティビティを読み戻してウォームアップ。**コメント自体は既にDB永続化されている**ため新しい書き込みパスは不要で、再起動をまたいで常連/離脱判定を継続できる
- **検証**: 単体テスト1件追加（新インスタンス＝再起動相当でcommentsから常連を復元）。**実サーバーでE2E確認**: 同一ユーザー`loyalfan`から3コメント投稿 → `GET /api/insights/silent-departure/youtube/default` で `regularUserCount:1`（配線前は常に0）→ サーバー再起動 → 起動ログ「Warmed 3 activity record(s) from comments table」→ 再度 `regularUserCount:1`（ウォームアップで維持）
- **再検証**: `grep -n "departureDetector.record" backend/src/controllers/commentsController.js`（配線）・`grep -n "_warmFromComments" backend/src/services/silentDepartureDetector.js`（ウォームアップ）→ 双方ヒットすれば適用済み

### R-20. 🔴【第一原理分析】モデレーション判断がプラットフォームへ書き戻されない（2026-08-08発見・土台のみ実施）

**第一原理からの導出**: 配信者が求める価値は「有害コメントを手作業より速く確実に処理する」こと。これを成立させる最小の因果連鎖は **①取込 → ②判定 → ③プラットフォーム上での実行 → ④人間の介在 → ⑤記録**。このうち **③が完全に欠落**している。

- **確認済みの事実（backend全走査）**: モデレーション判断は一切プラットフォームに反映されない。**ダッシュボードで「削除」したコメントはYouTube上では見えたまま、「BAN」したユーザーは配信で発言し続けられる**
  - 削除 `commentsController.js` → `UPDATE comments SET status='deleted'` のみ
  - BAN `usersController.js` → `UPDATE users SET status, ban_until` のみ（`platform` 値は保存されるだけで未使用）
  - 保留却下 `moderationController.js` → `held_messages.status` を反転するだけ
  - `youtubeIngestionService.js` は **read専用**（`videos.list` と `liveChatMessages.list` の2つのみ）。docstringにも「監視型API」と明記され、クォータ表にも書き込み分の予算が無い
  - → **現状の製品は「読み取り専用ミラー＋ローカル判断台帳」**
- **構造的ブロッカー4つと技術的裏付け**:
  1. **認証**: 現状はAPIキー認証。`liveChatMessages.delete` / `liveChatBans.insert` は**OAuth 2.0 + `youtube.force-ssl` スコープが必須**（同スコープは "See, edit, and permanently delete your YouTube videos, ratings, comments and captions" を要求する強い権限）。OAuth2クライアント/リフレッシュトークンはコードにも `.env.example` にも存在しない
  2. **識別子の欠落** → ✅ **本コミットで解消**（下記）
  3. 書き込み呼び出し自体が未実装
  4. **クォータ会計**: 書き込み操作は概ね **50 units/回**（日次既定 10,000 units）。削除・BANを多用すると取込用の予算を圧迫するため、既存のクォータ追跡に書き込み分を計上する必要がある
- **✅ 本コミットで実施（ブロッカー②の解消・書き戻しの前提条件）**: `comments` に `platform_message_id` / `author_channel_id` を追加（`ensureColumnDefinitions()` パターン）。`youtubeIngestionService` が**従来捨てていた** `item.id` と `item.authorDetails.channelId` を `ingestComment` へ渡し保存する。これが無い限り、将来どう実装しても**書き戻し対象を指定できない**
- **未実施（次段）**: OAuth2資格情報の用意（運用/製品判断が必要）、書き込み呼び出し、クォータ計上。詳細な作業指示は `AI_AGENT_HANDBOOK.md` W-12
- **再検証**: `grep -n "platform_message_id" backend/src/db.js backend/src/controllers/commentsController.js` → 双方ヒットすれば土台は適用済み
- **出典**: [LiveChatMessages: delete](https://developers.google.com/youtube/v3/live/docs/liveChatMessages/delete) / [LiveChatBans: insert](https://developers.google.com/youtube/v3/live/docs/liveChatBans/insert) / [determine quota cost](https://developers.google.com/youtube/v3/determine_quota_cost)

### R-21. 🟡【第一原理分析】因果連鎖に寄与しないルート群を削除（2026-08-08実施）

- **確認済みの事実**: 以下3ルート（計182 LOC）は第一原理の5段階のいずれにも属さず、**フロントエンドからの参照がゼロ**、かつプレースホルダ文字列を返すだけだった
  - `innovativeTechnologies.js`(72行) — 機能フラグ一覧を返すだけ
  - `advancedAIServices.js`(58行) — `"configure OPENAI_API_KEY for full functionality"` を返すだけ。**実際のAI判定は `moderationService`/`openaiService` が担っており完全な重複surface**
  - `integratedAnalysis.js`(52行) — `"combine multiple insight APIs..."` を返すだけ
- **実施**: 3ファイルと `app.js` のマウント（`/api/analysis`, `/api/ai`, `/api/innovative`）を削除（前例: R-3/R-10、E-9〜E-12のデッドコード削除）
- **✅ 残課題も解消（2026-08-15・W-13）**: `papers.js` は学術論文検索で**常に 200 + 空配列**を返し、フロントはそれを成功として扱って「関連論文が見つかりませんでした」と表示していた。つまり**検索が実行された上で0件だった、とユーザーに嘘をついていた**。さらに調査すると、案内していた `SEMANTIC_SCHOLAR_API_KEY` を**読むコードはリポジトリのどこにも存在せず**、キーを設定しても何も起こらない（＝実現不可能な約束）ことが判明した。W-4のanalytics export/import/external と同じ規約で **501 + `implemented:false`** を返すよう変更。フロントは既存のエラー経路がそのメッセージを表示するため**コンポーネント改修は不要**だった。**実ブラウザで確認**: ダイアログに「コメントからの関連論文提案は未実装です（学術論文検索の外部連携は本製品にまだ組み込まれていません）」と表示され、「見つかりませんでした」は表示されない。不正入力の400は従来どおり維持
- **再検証**: `grep -rn "innovativeTechnologies\|advancedAIServices\|integratedAnalysis" backend/src frontend/src` → 0件

### R-22. ✅ ヘイトレイド（協調攻撃）検知の実装（2026-08-08）

- **研究的根拠**: Han et al., *"Hate Raids on Twitch: Understanding Real-Time Human-Bot Coordinated Attacks in Live Streaming Communities"* (CSCW 2023, arXiv:2305.16248) は、ライブ配信固有の脅威が**人間とボットが連携した集団攻撃（hate raid）**であり、周縁化された配信者を標的にすること、配信者の対抗手段が技術的手段に大きく依存していることを示した。関連研究として2025年のTwitchライブチャットにおける毒性カスケード研究、ライブ配信の新しい反社会的行動("Fanchuan", arXiv:2509.00780)もある
- **元の問題（第一原理＋研究の突き合わせで発見）**: 本製品の `analyzeComment()` は**1コメント単位の判定しか行わない**。しかしレイドの本質は「**1件ずつ見れば無害に見えるメッセージでも、短時間に多数のアカウントから同一/類似内容が投げ込まれれば攻撃**」という点にある。この横断的シグナルを見る層が**一切存在しなかった**（`actorSystemService.js` の "coordinated" はメッセージ配信チャネルの意味で無関係。かつ同サービスはどこからも参照されないデッドコード）
- **実施した実装**: `services/raidDetector.js` を新設。研究が挙げる中心シグナル「複数アカウントの同時類似投稿」を実装し、誤検知を避けるため単一シグナルではなく合成スコアで判定する:
  1. **類似内容クラスタ**（異なるユーザーによる同一/類似投稿の割合）— 重み0.6
  2. 流量スパイク — 重み0.2
  3. 初出ユーザー比率（レイドは使い捨てアカウントを伴う）— 重み0.2
  - 類似判定は NFKC 正規化＋記号/空白除去＋3連以上の繰り返し圧縮で表記ゆれを吸収（「死ね!!!」「し　ね」「死ねええええ」を同一視）
  - 取込パイプライン（`ingestComment`）に配線。エンドポイント `GET /api/insights/raid-detection/:platform/:channelId`
- **検証**: 単体テスト8件（検知・回避表記・**同一ユーザー連投は協調でないので非検知**・**内容がバラバラな通常の盛り上がりは誤検知しない**・ウィンドウ外除外等）。**実サーバーE2Eで研究の主張を再現**: 10アカウントが同一文「このチャンネルはもう終わり」を投稿 → **全件が個別モデレーションを通過（201）**したにもかかわらずレイド検知が `score:0.87, raidDetected:true`。対照として同数10アカウントの**内容がバラバラな通常チャットは `score:0.27` で非検知**
- **✅ R-22b リアルタイム通知（同日追加）**: 当初の実装は `GET /api/insights/raid-detection/...` の**ポーリング専用**で、レイド中にモデレーターが自発的に叩かない限り気づけなかった。レイドは短時間で押し寄せるため**検知していても届かなければ無価値**である。`checkForAlert()` を追加し、取込パイプラインから「**非レイド→レイド の遷移の瞬間だけ**」既存のWebSocket（`io.to('dashboard')`）へ `raidAlert` イベントを送出する。通知の洪水を防ぐため、解析は2秒間隔に間引き、通知は遷移時のみ＋2分のクールダウン付き。**実サーバーのWebSocketクライアントで受信を確認**（13アカウントのレイド→`raidAlert` score 0.89 を受信）。単体テスト4件追加（遷移時のみ通知・継続中は再通知しない・通常チャットでは通知しない・呼び出しの間引き）
- **今後**: 検知後の自動対応（スローモード自動有効化等）は未実装。またプラットフォーム書き戻し（R-20）が実装されれば、クラスタ単位の一括BANが可能になる
- **再検証**: `NODE_ENV=test npx jest tests/services/raidDetector.test.js` → 8件合格
- **出典**: https://arxiv.org/pdf/2305.16248 (CSCW 2023, https://dl.acm.org/doi/10.1145/3610191) / https://arxiv.org/pdf/2509.00780

### R-23. 評価ハーネスの検証中に発見した感情分析の2欠陥（2026-08-08・修正済み）

R-5bの評価ハーネス（R-5b）でAI経路との差分を調べる過程で、**感情分析まわりに2つの実害のある欠陥**を発見・修正した。どちらもテストが無く、静かに機能していなかった。

**欠陥1: ネガティブ感情による保留ルールが一度も発火していなかった**
- `analyzeSentiment()` の `score` は**感情価（valence）**で、`negative=0.2 / neutral=0.5 / positive=0.75` と**低いほどネガティブ**。一方 `checkMessageHold()` の条件は `sentiment === 'negative' && sentimentScore >= negativeSentimentThreshold(0.8)` だった
- ネガティブ判定時のスコアは**常に0.2**なので `0.2 >= 0.8` は**永遠に偽**。つまりこの保留ルールは**構造的に発火し得ないデッドルール**だった（NGワードを含まない強いネガティブコメントが保留されず素通りしていた）
- **修正**: 感情価を強度へ変換（`negativity = 1 - valence`）してから閾値と比較。**実サーバーで確認**: 「最悪だしつまらない、ひどい」→ **202 Held**（`negative_sentiment`, `negativity: 0.8`）。通常コメント3件は 201 のまま（誤検知なし）

**欠陥2: AI感情分析の結果を取得しながら捨てていた**
- `analyzeComment()` は `openaiService.analyzeSentiment()` を実行して `aiAnalysis.sentiment` に格納していたが、その後**ルールベースの結果で `result.sentiment` / `sentimentScore` を無条件に上書き**していた
- 結果、**課金とレイテンシを払って取得したAI判定が下流の判断（保留ルール等）に一切使われず捨てられていた**
- **修正**: AI結果が利用可能かつ `confidence >= 0.5` のときはそちらを優先し、無ければ従来のルールベースへフォールバック。どちらを使ったかを `sentimentSource` ('ai'|'rule') として明示。**キー未設定時の挙動は不変**（フェイルセーフ規約を維持）
- 併せて、AI側プロンプトの `score` の向きが未定義で解釈が曖昧だったため「0.0=最もネガティブ / 1.0=最もポジティブ」と明記し、ルールベースと**同じ感情価スケール**に揃えた

- **意義**: R-5bの実測で `indirect`（語彙に頼らない攻撃）が0%だったが、欠陥1の修正により**NGワードを含まない強いネガティブコメントは保留キューに載る**ようになり、人間の判断へ回る経路ができた
- **回帰テスト**: `tests/services/sentimentHold.test.js`（4件）
- **再検証**: `grep -n "sentimentSource" backend/src/services/moderationService.js` / `grep -n "negativity" backend/src/controllers/commentsController.js`

### R-24. Policy-as-Prompt の実装（2026-08-08・R-4の骨格を実装 / 実LLM検証は未実施）

R-5bの実測で `indirect`（NG語を含まない遠回しな攻撃）が**0%**と判明したため、R-4で設計だけ確定していた Policy-as-Prompt を実装した。

**根拠となる研究（2本・賛否両方）**:
- **Palla et al., "Policy-as-Prompt: Rethinking Content Moderation in the Age of Large Language Models"**（FAccT 2025, arXiv:2502.18695）— 抽象的なポリシーをアノテーションガイドラインや学習データへ「操作化」する従来工程を、ポリシーを自然言語プロンプトとして直接LLMへ与える形に置き換えうると論じる
- **Neumann et al., "It is not enough to give your moderation rules to ChatGPT: Policy-as-Prompt Moderation and Its Potential Impacts on Community Governance"**（MuC 2026 Workshop, arXiv:2607.12149）— **批判的な後続研究**。プロンプトを書くだけでは意味のあるコミュニティガバナンスにならないと結論づける。特に **prompt stack**（基盤モデル開発者のプロンプトが下流の指示より優先される階層構造）のため、**運営者が書いたルールが必ず効くとは限らない**

**実装（批判を設計制約として取り込んだ）**:
- `creatorCultureService.buildPolicyPrompt()` — 既存の文化プロファイル（5プリセット＋個別上書き）を自然言語のポリシー文へ変換。R-4が指摘したとおり「器は既にあった」ため、許容度・フラグ（`allow_trash_talk` 等）が方針文へそのまま反映される
- `openaiService.moderateWithPolicy()` — ポリシー文をsystemメッセージ、可変部（文脈＋対象コメント）をuserメッセージに置く。**大きな固定部分を先頭に置くことでプロンプトキャッシュが効く構成**（R-4のコスト設計に対応）
- **arXiv:2607.12149 に基づく3つの制約**:
  1. LLMの判定は **助言（`advisory: true`）** であり、**決定論的なNGワード判定を覆さない**（LLMが「問題なし」と言っても NG語ヒットは維持される）
  2. LLM単独で自動処罰しない。加点して `needsHumanReview` を立て、**人間のレビューへ寄せる**
  3. どのポリシー（`cultureType`）で判定したかを必ず結果に残し、**監査可能**にする

**検証**: 実LLMは呼べない（キー未設定）ため、`openaiService` をモックした8テストで検証。ポリシー文が文化ごとに実際に異なること、助言として扱われること、**LLMが「問題なし」でもNGワード判定が覆らないこと**、LLM利用不可でも解析が成立すること（フェイルセーフ規約）を確認。キー未設定時の評価ハーネスの数値は**変化なし**（F1 72.7%）で、既存動作への影響がないことを確認済み

**未実施**: 実APIキーでの動作確認と、`indirect` が実際に改善するかの測定。**キーが用意でき次第 `node src/scripts/evaluateModeration.js` を実行すれば、R-5bのハーネスがそのまま効果測定になる**（これがW-5をW-3より先に実装した理由）

- **再検証**: `grep -n "buildPolicyPrompt" backend/src/services/creatorCultureService.js` / `NODE_ENV=test npx jest tests/services/policyAsPrompt.test.js` → 8件合格
- **出典**: https://arxiv.org/abs/2502.18695 (FAccT 2025) / https://arxiv.org/abs/2607.12149 (MuC 2026 Workshop)

### R-25. レイド自動防御（検知→自動隔離）の実装（2026-08-15）

R-22/R-22b で検知とリアルタイム通知までは実装したが、対応は依然として**人間の手動操作頼み**だった。

- **根拠となる研究**:
  - Han et al., "Hate Raids on Twitch: Understanding Real-Time Human-Bot Coordinated Attacks in Live Streaming Communities"（CSCW 2023, arXiv:2305.16248）— レイドは**短時間に大量のメッセージでモデレーターを圧倒する**性質を持ち、1件ずつの人力対応はスケールしない。同研究は **moderation-by-design**（防御をシステム設計自体に織り込む）というレンズを推奨する
  - Jhaver et al., "Hate Raids on Twitch: Echoes of the Past, New Modalities, and Implications for Platform Governance"（CSCW 2023, arXiv:2301.03946）— **フォロワー限定チャット・メール認証・高度なモデレーション・ボット排除を全て設定していた配信者が2度攻撃された**実例を報告。攻撃者は既存の防御を回避する術を知っているため、**単一の防御策に依存せず、かつ自動処罰は避けるべき**という設計判断の根拠になる
- **実装**: `raidDetector` に防御モード（5分）を追加。レイド検知の瞬間に起動し、防御中は次を**保留キューへ自動隔離**する:
  1. `cluster` — レイドを構成した類似内容と一致する投稿
  2. `first_seen` — **防御開始後に初めて現れたアカウント**（使い捨てアカウント対策）。既知の常連は巻き込まない
  - 隔離は `holdMessage()` の再利用（`holdReason: 'raid_defense'`、trigger を `reasons` に記録し監査可能）。フロントの保留キューに「レイド防御(同一内容/新規アカウント)」バッジを表示
- **ガバナンス制約（R-24から継続・arXiv:2607.12149）**: **自動で拒否（削除）はしない。保留＝人間のレビュー行きに留める。** モデレーターは `DELETE /api/insights/raid-defense/:platform/:channelId` でいつでも手動解除できる
- **副次的改善**: レイド検知への記録を取込の**冒頭（モデレーション前）へ移動**した。従来は記録がINSERT後にあったため、**個別モデレーションで拒否された攻撃メッセージが協調攻撃の証拠としてカウントされていなかった**
- **E2E検証で発見・修正した欠陥**: 当初実装では、手動解除してもレイド判定がウィンドウ内で継続している限り**1秒後には自動で再起動**してしまい、「人間のオーバーライド」が実質的に機能していなかった。これは自ら課したガバナンス制約に反するため、手動解除後は5分間、自動再起動を抑止する（検知とアラート自体は継続し、モデレーターには知らせ続ける）よう修正
- **実サーバーE2E**: 13アカウントのレイド→防御起動。**新規攻撃者の同一文=202隔離(cluster) / 全く新規のアカウント=202隔離(first_seen) / レイド前から居た常連の通常発言=201（誤爆なし）**。保留キューに trigger 付きで3件記録。手動解除後は同じ攻撃文が201で通り、防御は再起動しないことを確認
- **未実施**: プラットフォーム側のスローモード/フォロワー限定の自動有効化とクラスタ単位の一括BAN（いずれもW-12のOAuth待ち。本実装のローカル隔離はその代替として、少なくとも自社の表示・配信経路から攻撃を除去する）
- **再検証**: `NODE_ENV=test npx jest tests/services/raidDetector.test.js` → 20件合格
- **出典**: https://arxiv.org/pdf/2305.16248 (CSCW 2023) / https://arxiv.org/pdf/2301.03946 (CSCW 2023)

### R-26. 累犯エスカレーションとCAPS検知 — 関連ソフトウェアとの機能比較から（2026-08-15）

- **調査軸**: 論文だけでなく **関連ソフトウェア**（Nightbot / Moobot / StreamElements / Fossabot 等の主要チャットモデレーションBot）の標準機能と突き合わせた。各社の比較記事によれば、**caps（大文字乱用）フィルタ・シンボル/エモートスパム・anti-flood・リンク保護・段階的処罰（警告→タイムアウト→BAN）** はいずれのBotも備える事実上の標準機能である
- **本製品に欠けていた2点**:
  1. **CAPSフィルタが存在しない**（`grep -i caps` で0件）
  2. **累犯エスカレーションが存在しない** — 自動判定は**初犯と常習犯をまったく同じに扱っていた**。`user_timeouts` テーブルは存在するがモデレーターの手動操作専用で、自動判定は過去の違反履歴を一切参照していなかった
- **実施した実装**:
  - **CAPS検知**: 英字が8文字以上ある場合のみ大文字比率70%以上で検知（日本語主体チャットで「OK」「www」等を誤検知しないための条件）。単体では拒否に至らない軽度シグナル（+15点）
  - **累犯エスカレーション**: 直近24時間の違反回数（`comments` の deleted/hidden/flagged/muted ＋ `held_messages` の pending/rejected）を集計し、1回以上=要注視 / 3回以上=タイムアウト推奨 / 5回以上=BAN推奨として `reasons` に付与。**BANは自動実行せず推奨提示に留める**（R-24/R-25と同じガバナンス制約）。保留キューUIに「累犯N回・タイムアウト推奨」バッジを表示
- **⚠️ 実装中に自ら作り込んだ過剰検知を発見・修正**: 当初エスカレーションを無条件に追加したところ、**過去に1件でも違反のあるユーザーの無害なコメントまで全て保留**される挙動になり、**既存テストが12件失敗**した。主要Botでもエスカレーションは「フィルタに引っかかったとき」に段階が上がる設計であり、**エスカレーションは既存の疑いを強めるものであって単体で保留を発生させてはならない**。他の理由が1つ以上ある場合にのみ付与するよう修正し、この不変条件を回帰テスト（「【過剰検知ガード】常習犯でも無害なコメント単体では保留にしない」）で固定した
- **検証**: 単体テスト8件。実ブラウザで「累犯4回・タイムアウト推奨」バッジの描画を確認（スクリーンショット取得済み）。フルスイート **0 failed / 504 passed**
- **未実装（関連ソフトウェアとの残差）**: シンボル/エモートスパム比率フィルタ、リンクの「permit」一時許可コマンド
- **出典**: https://streamingequip.com/en/blog/best-streaming-chatbot/ / https://www.streamscheme.com/best-twitch-bots/

### R-27. シンボル/エモート連投スパム検知（2026-08-15・R-26の残差を解消）

- **背景**: R-26で関連ソフトウェア（Nightbot/Moobot/StreamElements等）との比較から残差として記録していた「シンボル/エモートスパム比率フィルタ」を実装
- **最重要の設計判断 — 英語圏Botの素朴な移植は日本語配信を壊す**: 各社Botは「記号比率が閾値を超えたらスパム」という単純なフィルタを持つが、これを日本語チャットにそのまま適用すると、**顔文字「(´・ω・｀)」「(・∀・)ノ」、笑い「www」、拍手「88888」、絵文字リアクション**を軒並みスパム判定してしまう。これらは荒らしではなく**日本語配信文化そのもの**であり、潰せば製品として使い物にならない
- **採用したロジック**（誤検知を避けるための2条件）:
  1. **12文字以上**の場合のみ判定（`www` `8888` `!!!` 等の短い表現を保護）
  2. 判定は「**同一の記号/絵文字が10回以上連続**」（コードポイント単位でサロゲートペア対応）または「**文字（日本語/英字/数字）が全体の10%未満**」に限定。顔文字は多様な記号の組み合わせであり同一文字の長い連打にはならないため、この条件では引っかからない
  - 検知しても **+20点の軽度シグナル**に留め、単体では拒否しない
- **検証**: 単体テスト11件。**検知すべき3ケース**（記号連打/絵文字連打/記号のみ長文）と、**誤検知ガード7ケース**（顔文字・顔文字複数・www・8888・絵文字リアクション・通常の日本語・短い記号）を明示的に固定。フルスイート **0 failed / 515 passed**
- **関連ソフトウェアとの残差（未実装）**: リンクの `permit` 一時許可コマンド（モデレーターが特定ユーザーに一時的にリンク投稿を許可する機能）。コマンド体系と一時状態の設計が必要なため次段
- **出典**: R-26と同じ比較記事（https://streamingequip.com/en/blog/best-streaming-chatbot/ 他）

### R-28. プラットフォーム書き戻しの実装（2026-08-15・R-20の中核欠落をコード側で解消）

**イーロン・マスク式アルゴリズムのステップ1「要求を疑え」を適用した結果の着手**。R-20で「OAuth資格情報が無いから実装できない」として保留していたが、要求を分解すると **「資格情報が無い」ことと「コードが無い」ことは別問題**だった。資格情報は運用judgmentだが、コードは今書ける。

- **実装内容**:
  - `config.services.youtube` に `clientId`/`clientSecret`/`refreshToken` を追加（`.env.example` にも解説付きで追記）
  - `youtubeIngestionService` に **認証の用途分離**を導入: 読み取りは従来どおりAPIキー、書き込みは OAuth2 クライアント（`_getWriteClient()`）。**APIキーでは `liveChatMessages.delete` / `liveChatBans.insert` は原理的に実行できない**ため
  - `deleteLiveChatMessage(platformMessageId)` / `banUser(liveChatId, authorChannelId, {type,durationSeconds})` を実装
  - **クォータ会計**: 書き込みは50ユニット/回として `QUOTA_COST` に追加し、取り込みと**同一の日次カウンタ**で管理（書き込みが取り込み予算を食い潰さないように）
  - `commentsController` の削除経路から呼び出し。**循環参照（commentsController ⇄ youtubeIngestionService）を避けるため遅延require**を使用
- **透明性の設計（重要）**: 削除レスポンスに `platformDeletion: {attempted, ok, reason}` を必ず含め、メッセージも「ローカルのみ」か「プラットフォームにも反映」かを区別する。**「ダッシュボードでは消えたがYouTubeでは残っている」状態を黙って作らない**ことが目的
- **フェイルセーフ規約の遵守**: OAuth未設定/識別子なし/クォータ超過のいずれでも**ローカル削除は必ず維持**し、取り込みも通常動作する
- **実サーバーで判定木を全経路検証**:
  | ケース | platformDeletion | ローカル削除 |
  |---|---|---|
  | 識別子なし（HTTP投稿） | `attempted:false, reason:missing_platform_message_id` | ✅ deleted |
  | 識別子あり（YouTube取込相当） | `attempted:true, ok:false, reason:oauth_not_configured` | ✅ deleted |
- **残るのは資格情報のみ**: `YOUTUBE_CLIENT_ID`/`SECRET`/`REFRESH_TOKEN`（`youtube.force-ssl` スコープ）を設定すれば、コード変更なしに書き戻しが有効化される。**コード側の欠落は解消済み**
- **✅ R-28b BAN書き戻しも配線完了（同日）**: `banUserOnActiveChats(authorChannelId, options)` を追加し、`usersController.updateUser` のBAN経路から呼ぶようにした。BANには対象の**チャンネルID**が必要だが `users` テーブルには存在しないため、**直近のコメントから `author_channel_id` を引く**。監視中のライブチャット全てに適用し、チャットごとの結果を返す（実運用では同時配信は1本のことが多い）。レスポンスに `platformBan {attempted, ok, reason, results}` を含め、メッセージも「ローカルのみ」「プラットフォームにも反映」を区別。**実サーバー検証**: 管理者権限でBAN実行 → `platformBan: {attempted:false, reason:'oauth_not_configured'}`（＝チャンネルID検索は成功。失敗なら `author_channel_id_unknown` が返る）、`users.status='ban'` とローカルBANは維持
- **✅ R-28c 保留却下の書き戻しも配線完了（同日）— これで「実行」段階が3経路すべて完成**: `held_messages` に `platform_message_id`/`author_channel_id` を追加（`ensureColumnDefinitions`）し、保留時に識別子を保存、却下時に `deleteLiveChatMessage` を呼ぶようにした。**実サーバー検証**: 識別子付き保留メッセージを却下 → `platformDeletion: {attempted:true, ok:false, reason:'oauth_not_configured'}`、ローカル却下は成功（200）
- **「実行」段階の完成状況**:
  | 経路 | 書き戻し | 透明な結果報告 | フェイルセーフ |
  |---|---|---|---|
  | コメント削除 | ✅ R-28 | `platformDeletion` | ✅ ローカル削除維持 |
  | ユーザーBAN | ✅ R-28b | `platformBan` | ✅ ローカルBAN維持 |
  | 保留却下 | ✅ R-28c | `platformDeletion` | ✅ ローカル却下維持 |
- **検証**: 単体テスト5件（OAuth未設定時に例外を投げずフェイルセーフに振る舞うこと）。フルスイート **0 failed / 520 passed**

### R-29. ✅ Twitch 取り込みの実装 — 製品名の約束を果たす（2026-08-15）

**マスク式ステップ1「要求を疑え」の結論**: 「Twitch対応」は疑うべき曖昧な要求ではなく、**製品名そのものが約束している要求**（YouTube & Twitch コメント管理ダッシュボード）。実装するか改名するかの二択で、実装を選んだ。

- **経路はR-7で確定済みの設計に従った**: **EventSub WebSocket + `channel.chat.message` 購読**（IRC/PubSubはレガシーのため不使用）
- **Shared Chat の二重処理対策（最も間違えやすい点）**: 2024年導入の合同配信ではメッセージが参加チャンネル全体にミラーされ、ペイロードに `source_broadcaster_user_id` が付く。これを自チャンネルと突き合わせないと**同一メッセージを多重処理し二重BAN等が発生する**。取り込み時点でミラーを除外する実装にし、**回帰テストで固定**
- **取り込みは必ず `commentsController.ingestComment()` を通す**: これによりモデレーション・保留・離脱検知・レイド検知・**書き戻し用識別子の保存（R-28）**が YouTube と完全に同一に適用される。Twitch専用のモデレーション経路は作らない
- **認証の注意点**: `channel.chat.message` の購読には **ユーザーアクセストークン（`chat:read` スコープ）が必須**で、アプリトークンでは購読できない。`TWITCH_USER_ACCESS_TOKEN` / `TWITCH_USER_ID` を新設
- **実装物**: `services/twitchIngestionService.js`（EventSub接続・自動再接続の指数バックオフ・連続エラー時の自動停止）、`routes/twitch.js`（監視の開始/停止/状況）、`server.js` のシャットダウン配線
- **フェイルセーフ規約**: クレデンシャル未設定でも警告のみでアプリは通常起動し、YouTube取り込みに影響しない。監視開始要求時のみ **503**（偽の成功を返さない）
- **検証**: 単体テスト9件（フェイルセーフ4件＋**Shared Chatミラー除外を含む取り込み判定5件**）。実サーバーで `GET /api/twitch/watch` → `{enabled:false, watches:[]}`、未設定での監視開始 → **503**、必須パラメータ欠如 → **400** を確認。フルスイート **0 failed / 529 passed**
- **残**: 実クレデンシャルでの疎通確認（本環境にTwitchアカウントが無いため未実施）。AutoMod連携（`automod.message.hold` → `held_messages`）は次段

---

## 検証（本ブランチで実施済みの R-1/R-3/R-5a/R-5補足/R-10/R-11/R-12/R-14/R-18/R-19）

1. `cd backend && rm -f data/test.db && NODE_ENV=test npx jest --runInBand` → **4 failed / 437 passed / 451 total**（既存の失敗4件のみ・悪化ゼロ。R-5a/R-5補足/R-11の新規12テストを含む）
2. `node --check` 各修正ファイル → 構文OK
3. OpenAIキー未設定時のフォールバックを devサーバー+curl で実地確認（モデレーション: ルールベース続行 / 翻訳: 原文+available:false / 起動: 警告のみで正常）
4. R-11: devサーバー+curlで実際の`POST /api/comments`に全角文字回避（「ｋｙｓ loser」）を送信し、モデレーションが正しく拒否（`status:422`, `flaggedWords:["kys"]`）することを確認
5. R-12: `npm uninstall`後にバックエンド（`node -e "require('./src/app.js')"`）・フロントエンド（`npx vite build`）双方の起動/ビルドを確認

## 出典一覧

### 第1ラウンド（2026-07-11）
- OpenAI Moderation (omni-moderation-latest): https://platform.openai.com/docs/guides/moderation
- Perspective API 終了告知: https://developers.perspectiveapi.com/ , https://www.lassomoderation.com/blog/perspective-api/
- Policy-as-Prompt (arXiv:2502.18695, FAccT 2025): https://arxiv.org/abs/2502.18695
- ToxiTwitch (arXiv:2601.15605): https://arxiv.org/abs/2601.15605
- E2T2: Emote Embedding for Twitch Toxicity Detection (CSCW 2024): https://doi.org/10.1145/3678884.3681840
- SLM-Mod (arXiv:2410.13155, NAACL 2025): https://arxiv.org/abs/2410.13155 , https://aclanthology.org/2025.naacl-long.441/
- AnswerCarefully (NLP2025): https://www.anlp.jp/proceedings/annual_meeting/2025/pdf_dir/Q2-3.pdf
- リコー 日本語ガードレールモデル (2025): https://jp.ricoh.com/release/2025/1225_1
- Twitch EventSub Subscription Types: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/

### 第2ラウンド（2026-07-13・8アングル並列調査+敵対的URL検証で確認済み）

**NGワード回避（R-11）**:
- SilverSpeak: ホモグリフ攻撃によるAI検出器の精度低下 (arXiv:2406.11239): https://arxiv.org/pdf/2406.11239
- 特殊文字攻撃（ホモグリフ/ゼロ幅/エンコーディング）の体系的評価 (arXiv:2508.14070v1): https://arxiv.org/html/2508.14070v1
- ASCII-artによるトキシシティ検出回避 (arXiv:2409.18708): https://arxiv.org/pdf/2409.18708
- ゼロ幅文字を使った実地でのフィルタ回避・フィッシング回避: https://lightcapai.medium.com/bypassing-content-moderation-filters-techniques-challenges-and-implications-4d329f43a6c1 , https://cybersecuritynews.com/phishing-attack-using-zero-width-characters/
- Unicode UTS #39（confusables.txt・skeleton algorithm）: https://www.unicode.org/reports/tr39/
- confusables/NFKC正規化の不一致に関する分析: https://paultendo.github.io/posts/unicode-confusables-nfkc-conflict/
- `obscenity`（npm、リートスピーク対応の英語プロファニティフィルタ）: https://github.com/jo3-l/obscenity
- `confusables`（npm、本実装で採用）: https://github.com/gc/confusables

**規制対応（R-13）**:
- EU DSA第17条（理由説明義務）: https://www.eu-digital-services-act.com/Digital_Services_Act_Article_17.html
- EU DSA透明化データベース: https://digital-strategy.ec.europa.eu/en/faqs/dsa-transparency-database-questions-and-answers
- EU DSA透明性報告義務: https://digital-strategy.ec.europa.eu/en/policies/dsa-brings-transparency
- EU DSA控訴/裁判外紛争解決: https://digital-strategy.ec.europa.eu/en/policies/dsa-out-court-dispute-settlement
- 英国OSA違法コンテンツ対応義務: https://www.ofcom.org.uk/online-safety/illegal-and-harmful-content/illegal-content-duties-under-the-online-safety-act
- 日本の情プラ法・晒し規制: https://note.com/slimed/n/n8465989acbc1

**モデレーターUX（R-14）**:
- 構造化説明によるモデレーター判断速度向上 (arXiv:2406.04106): https://arxiv.org/pdf/2406.04106
- 単一モドキューの限界 (arXiv:2409.16840): https://arxiv.org/html/2409.16840
- ポジティブキュー (arXiv:2509.18437): https://arxiv.org/abs/2509.18437
- 説明形式の心理的公平性 (arXiv:2310.15055): https://arxiv.org/abs/2310.15055

**リアルタイム基盤（R-15）**:
- Socket.IOバックプレッシャの欠如: https://github.com/socketio/socket.io/issues/4435
- `socket.volatile.emit()`の限界: https://github.com/socketio/socket.io/discussions/5063
- OpenAIプロンプトキャッシュ: https://developers.openai.com/api/docs/guides/prompt-caching
- OpenAI Batch API: https://developers.openai.com/api/docs/guides/batch

**プラットフォームAPI（R-6/R-7/R-8）**:
- YouTube liveChatMessages（新イベント種別・streamList）: https://developers.google.com/youtube/v3/live/docs/liveChatMessages , https://developers.google.com/youtube/v3/live/streaming-live-chat
- Twitch Conduits: https://dev.twitch.tv/docs/eventsub/handling-conduit-events/

**カンファレンス（R-16）**:
- GDC 2025 Twitch Smart Detection: https://schedule.gdconf.com/session/machine-learning-summit-twitch-chat-safety-scalable-and-personalized-moderation-with-deep-learning/909659
- Roblox RDC 2025基調講演: https://about.roblox.com/newsroom/2025/09/roblox-rdc-2025

**日本市場（R-17）**:
- 日本語裁判例データセット: https://www.jstage.jst.go.jp/article/jnlp/31/4/31_1598/_article/-char/ja/
- SHOWROOM文脈判定AI: https://ledge.ai/showroom-comment/
- ニコニコ動画コミュニティNGフィルタ: https://togetter.com/li/2384569

**依存関係（R-12）**:
- Multer CVE-2025-47944: https://github.com/advisories/GHSA-4pg4-qvpc-4q3h
- Redis公式移行ガイド（node-redis推奨）: https://redis.io/docs/latest/develop/clients/nodejs/migration/

**調査手法に関する注記**: 本ラウンドはWorkflowツールによる8アングル並列調査＋各アングルの引用URLを独立エージェントが敵対的に検証する2段階方式で実施した。検証段階で以下の誤りを発見・修正済み: (1) evasion角度の1件で引用URLが主張内容と無関係だったため差し替え、(2) mod-ux角度で1件（CSCW論文）が実際には別内容を論じていたため削除、(3) dependencies角度でMulterのCVE番号2件が誤り（存在しないCVE番号・URL使い回し）だったため確認できた1件（CVE-2025-47944）のみ採用、(4) conferences角度でTrustCon/Roblox Sentinelの1件が内容不一致のため削除。また、本セッションのサンドボックス環境ではarxiv.org/dl.acm.org/developers.google.com等多数のドメインへの直接WebFetchがプロキシでブロックされたため、該当箇所は独立した複数のWebSearchクエリの収束的な一致をもって「確認済み」とした（本文中に個別に注記）。実装着手前にネットワーク制限のない環境での再確認を推奨する。

## R-30. 日本語NGワードの語境界ガードと仮名表記の取りこぼし

**問題**: 日本語には英語の `\b` に相当する語境界が無いため、NGワード照合が
`includes()` の部分一致になり、無関係な語の内部に噛んでいた。評価ハーネス(R-5b)で
実際に出た誤検知が「ラスボス倒した！やっと死ねる…完走おめでとう」——
可能形の「死ねる」が「死ね」に一致していた。ゲーム配信では日常的な言い回しである。

同時に、日本語チャットで最も多い回避形である仮名表記（`しね` / `シネ`）が
NGワードリストに入っておらず、素通りしていた（`死ね` `タヒね` `4ね` はあった）。

この2つは表裏一体で、ガード無しに `しね` を追加すると関東方言の「気にしねえよ」や
外来語「シネマ」が全部落ちる。片方だけを直すことはできない。

**実装**: 語ごとに「直後に来たら不一致とみなす文字」「直前に来たら不一致とみなす文字」を
持つガードを追加した（`NG_WORD_MATCH_GUARDS`）。語を消すのではなく用法で切り分けるのは、
「死ねよ」「死ねー！」のような実際の暴言を取りこぼさないため。

| 語 | 直後ガード | 抑止する語 | 通す語 |
|----|-----------|-----------|--------|
| 死ね | `る` `れ` `ま` | 死ねる／死ねれば／死ねます | 死ねよ／死ねー！ |
| しね | `る` `れ` `ま` `え` `ぇ` `ー` | しねえ／しねぇ／しねー（方言のしない） | しね!! |
| シネ | `ル` `レ` `マ` | シネマ | シネ |
| 氏ね | `る` `れ` `ま` | — | 氏ね |

`しね` には直前ガード `で$` も持たせた（「そうでしね」= ですねの打ち間違い）。

**効果**: Precision 88.9% → **100%**、evasion検知率 75% → **100%**、
hard-negativeの誤検知 1件 → **0件**。F1 72.7% → 81.8%。

**テスト**: `tests/services/ngWordBoundary.test.js`（16件）。
検知側7件と過剰検知ガード9件で、どちらか片方だけを壊す変更を防ぐ。

---

## R-31. つきまとい・監視の示唆検知

**問題**: 既存のthreatリストは「住所特定した」「i know where you live」のような
直截な表現しか拾えなかった。評価セットの
「昨日どこにいたか知ってるよ。いつも同じ道通ってるね」は、
**単語単体では完全に無害な語だけ**で構成されているため素通りしていた。

Han et al. のヘイトレイド研究（arXiv:2305.16248）では、配信者が最も深刻に受け取るのは
罵倒そのものではなく「現実の身元・所在を握っている」という示唆だと報告されている。
語彙フィルタの構造的な死角がちょうどそこに当たっていた。

**実装**: `STALKING_PATTERNS` として3つの正規表現を追加（カテゴリは `threat`）。
誤検知が特に危険な領域なので、いずれも
**①配信者の現実の所在・移動**と**②それを把握しているという主張**が
同一文中に揃うことを条件にしている。単独の語では発火しない。

- `stalking:knows_whereabouts` — 「どこにいたか知ってる」「どこ住んでるか知ってる」
- `stalking:near_real_location` — 「家の前で待ってた」「職場の近くで見た」
- `stalking:followed` — 「後をつけた」「尾行」

検知結果は保留（人間のレビュー）に回すのみで、自動処罰はしない（本製品の一貫した方針）。

**効果**: indirect検知率 0% → 25%。F1 81.8% → **87.0%**（Precision 100%を維持）。

**テスト**: `tests/services/stalkingPatterns.test.js`（14件）。
過剰検知ガード側を8件と厚くしてある——「このマップ、敵がいつも同じ道通ってくる」
「家の前に敵が湧く」「今日は職場の近くのカフェから配信してます」など、
ゲーム配信で普通に出る言い回しに当たらないことを固定する。

---

## 現時点のモデレーション検出性能

### 自作の評価セット（45件）

```
Precision 100.0% / Recall 100.0% / F1 100.0%
  direct 5件 100% / evasion 4件 100% / indirect 7件 100% / hard-negative 29件 誤検知0
```

### 外部ベンチマーク（ANLP2022 日本語有害表現データセット, 309件）— こちらが実態

```
Precision 100.0% / Recall 10.3% / F1 18.8%
  有害 29件 → 検知 3件
  無害 280件 → 誤検知 0件
```

**この2つの落差が、このプロジェクトで最も重要な事実である。**

自作セットの100%は、**パターンを書いた人間がケースも書いている**ことによる整合性であって、
一般化の証拠ではなかった。外部の物差し（[inspection-ai/japanese-toxic-dataset](https://github.com/inspection-ai/japanese-toxic-dataset), Apache-2.0、
ANLP2022「日本語有害表現スキーマの提案と評価」のデータ）を当てると Recall は **3.4%** だった。
差別語を追加して 10.3% になったが、**この10.3%は外部データを見た後の調整を含むので、
もはや完全に独立な数字ではない**（3.4%が調整前の、本当に独立な値）。

一方で **Precision 100% / 無害280件に対し誤検知0件** は独立に確認できた値であり、
「誤検知しない」という設計目標は他人が書いた実データでも成立している。

### 見逃し26件の内訳（意図的な方針か、弱点か）

| 区分 | 件数 | 例 |
|------|------|-----|
| 方針としてあえて拾わない | 8 | 「いやバカじゃん」「だっさ」「無能」（迷惑行為）、「自民党の弱体化が〜」（偏向表現） |
| 拾えていない＝弱点 | 18 | 「中国人って素行が悪いからなぁ」「女のわけわからん話」「ハゲいらいらで草」「働けよ無職」 |

前者は**配信チャット向けの製品としての判断**である。「バカ」「だっさ」は日本語配信では
日常的な軽口であり、拾えばチャット文化を壊す。政党批判を有害表現として扱うのは検閲になる。

後者は本物の弱点で、その大半が**属性への言及 + 一般化された貶め**という共通構造を持つ
（女／中国人／低身長／ハゲ／無職 + 断定的な悪評）。R-33 と同じ2成分共起の設計で
到達できる見込みがあるが、**外部セットを見ながら調整すると、それは訓練データになり
独立な検証の場を失う**。追加の外部セットを確保してから着手すべきである。

### 再現手順

```bash
git clone --depth 1 https://github.com/inspection-ai/japanese-toxic-dataset.git /tmp/jtox
node src/scripts/convertJapaneseToxicDataset.js /tmp/jtox/data/subset.csv > /tmp/jtox-eval.json
node src/scripts/evaluateModeration.js --file=/tmp/jtox-eval.json
```

データ本体はリポジトリに同梱していない（上流を都度取得する）。
ラベル変換規則は結果を見る前に決めてあり、アノテーターの判断が割れた128件は
「人間の合意が無いものを機械の正解にしない」ため除外している（除外件数は必ず出力する）。

---

## R-32. Twitch AutoMod 保留の取り込みと書き戻し

**問題**: Twitch の AutoMod が止めたメッセージはチャットに出ないまま **Twitch 側のキュー**に溜まる。
本製品はそれを一切知らないため、モデレーターは**二つのキューを見張る**ことになっていた。
本製品の保留キューを空にしても Twitch 側に未処理が残り続ける、という状態が常態化する。

製品名が「YouTube & Twitch」を名乗る以上、Twitch の一次モデレーション機構との
接続が無いのは因果鎖④（人間のレビュー）の欠損にあたる。

**実装**:

1. `startWatching` で `automod.message.hold`（version 2）も購読する。
   追加スコープ `moderator:manage:automod` が要るため、**失敗してもチャット取り込みは続行**する
   （AutoMod連携が無いせいで監視ごと止まるのは割に合わない）。`stopWatching` では両方解除する
2. 受信した保留は `held_messages` に `source='twitch_automod'` で記録し、
   AutoMod の判定（`reason` / `category` / `level` / `blocked_term`）をそのまま保留理由に残す。
   **判定はやり直さない**。承認/却下は人間が行う（自動処罰をしない方針は AutoMod 経由でも同じ）
3. `manageAutoModMessage(messageId, action)` で `POST /helix/moderation/automod/message` に
   `ALLOW` / `DENY` を返す

**取り違えやすい点（テストで固定した）**: AutoMod 保留のメッセージは**まだ公開されていない**。
したがって却下時の書き戻しは「削除」ではなく **DENY**、承認は **ALLOW**（＝ここで初めて公開される）。
これを YouTube と同じ「却下＝削除」で実装すると、
**モデレーターが承認したのに視聴者には永遠に見えない**という形で表面化する。
`moderationController.processHeldMessage` は `source` を見て書き戻し先を切り替える。

**フェイルセーフ**: 未設定・API失敗のいずれでも例外を投げず理由を返し、
ローカルの承認/却下は確定させる（書き戻しだけが落ちる）。

**テスト**: `tests/services/twitchAutoMod.test.js`（10件）と
`tests/integration/autoModWriteBack.test.js`（3件）。
後者はHTTPエンドポイント経由で承認→ALLOW / 却下→DENY が実際に送られること、
書き戻し失敗時もローカルが `rejected` で確定することを確認する。

**副次的な整理**: `dbRun` / `dbGet` / `dbAll` の Promise ラッパーが各コントローラに
私的にコピーされていたため、`src/db.js` から公開してサービス層からも使えるようにした
（既存のローカル定義は挙動が同一なので手を付けていない）。

## W-3. AI層の効果測定を「鍵が来た瞬間に測れる」状態にした

**問題**: R-24 で Policy-as-Prompt を実装したものの、効果は
「OPENAI_API_KEY を設定して評価ハーネスを再実行する」としか書かれていなかった。
実際には**測れない状態**だった:

1. ハーネスは AI層の有無をレポートに一切出さないため、鍵未設定で出た
   決定論層だけの数値を「AI込みの性能」と読み違える余地があった
2. AI層を**切って**測る手段が無く、鍵があっても
   「AI層が何を足したのか」を同じ物差しで比較できなかった

**実装**:

- `--no-ai` オプション: `moderationService` を読み込む前に
  `openaiService.isAvailable()` を潰し、決定論層だけを測る
- レポート冒頭に必ず**構成**を出す。AI層無効時は
  「この数値は語彙・パターン層だけの性能です」と明示する
- AI層有効時は「AI層だけが拾った件数」を出す。
  語彙・パターンによる根拠（`flaggedWords` / `symbolSpam` / リンク数）が
  一つも無いのに検知されたケースを数えるので、決定論層との**二重計上をしない**
- `--json` 出力にも `aiActive` / `aiFlaggedCount` を含める

**鍵が用意できたときの手順**（これが W-3 の答えになる）:

```bash
node src/scripts/evaluateModeration.js --no-ai   # 決定論層のみ
node src/scripts/evaluateModeration.js           # AI層込み
```

同一の評価セット・同一の物差しなので、差分がそのまま AI層の寄与になる。
**見るべきは indirect の検知率**（決定論層は構造上ここを埋められない）と、
その代償として Precision がどれだけ落ちるか。

**測定器自体の検証**: `tests/services/evaluationHarnessAi.test.js`（5件）。
`openaiService` をモックして AI層有効/無効の両方でハーネスを走らせ、
構成が正しく報告されること・AI層の寄与が二重計上されないこと・
AI層を入れると indirect の検知率が実際に動くこと・
**AI層があっても決定論的に検知済みのケースは検知されたまま**であること
（arXiv:2607.12149 の助言制約）を固定した。
鍵が無くても測定器の正しさは確かめられる、という切り分けである。

## R-33. 語彙に頼らない標的型ハラスメントの検知（indirect層を決定論で埋めた）

**前提の見直し**: R-30/R-31 の時点で「残る indirect 3件は決定論では追うべきでない、
AI層の担当」と結論していた。これは**間違いだった**。正しくは
「単独の語では追えない」であって、R-31（つきまとい）で有効だった
**2成分以上の共起を要求する**設計を使えば決定論でも到達できる。

**実装**: `TARGETED_HARASSMENT_PATTERNS` の3種（カテゴリは abuse）。
いずれも片方の成分だけでは絶対に発火しない。

| id | 成分1 | 成分2 |
|----|-------|-------|
| `harassment:appearance_shaming` | 容姿・声への言及＋人前での活動 | 呆れ／恥の標識（よく〜ね／恥ずかし／やめ） |
| `harassment:worthlessness_and_quit` | 配信・活動そのものの無価値化 | 中止の要求（自称・過去形は除外） |
| `harassment:rumor_mongering` | **人**に対する未確認の悪評 | 伝聞の枠組み（本当ですか／噂／らしい） |

**開発過程で最も重要だったこと**: 初版は自作の評価セットで F1 100% を出したが、
**パターンを見ずに書き出した実在しそうなチャット8件のうち5件を誤検知**した。

| 誤検知した無害な発話 | 何と取り違えたか | 対処 |
|---|---|---|
| その顔でよく笑えるねw かわいい | 親愛のいじり→容姿侮辱 | 成分1から「よく」を外し、活動を表す語を必須にした |
| その顔で配信とか最高 | 賞賛→侮辱 | 成分2から「とか」を外した（揶揄にも賞賛にも付き識別力が無い） |
| このクエスト意味ないから途中でやめたらいいよ | ゲーム内の助言→活動否定 | 無価値化の対象を配信・活動そのものに限定 |
| 才能ないから引退しますw | 自虐→攻撃 | 中止要求から「引退します／しよう／したい」を除外 |
| 誰も見てないうちに引退した装備売っちゃおう | 無関係な文→攻撃 | 同上に「引退した」を追加 |

この5件は評価セットと回帰テストの両方に入れてある。

**効果**: indirect検知率 25% → **100%**、全体 F1 87.0% → **100%**（45件）。
Precision は 100% のまま。

**テスト**: `tests/services/targetedHarassment.test.js`（22件）。
検知6件に対し**過剰検知ガード15件**と、意図的に非対称にしてある。

**副次的な変更**: `moderationEval.test.js` にあった
「【既知の限界】indirectは0%しか検知できない」という現状記録のテストは、
限界の記録から**回帰の防波堤**（`recall >= 0.85`）に役割を変えた。
同様に `evaluationHarnessAi.test.js` の「AI層を入れるとindirectが上がる」は
上げようが無くなったため、「AI層を有効にしてもどの難易度でも検知率は下がらない」
——arXiv:2607.12149 の助言制約が集計レベルでも守られること——に変えた。

## R-34. 外部ベンチマークによる検証（自作セットの100%は一般化ではなかった）

**動機**: R-33 まで、モデレーション性能は自作の評価セットで測っていた。
そこで F1 100% が出ていたが、**パターンを書いた人間がケースも書いている**以上、
それは整合性の証拠にすぎない。実際 R-33 の初版は自作セットで100%を出しながら、
想定外のチャット8件中5件を誤検知した。

**実装**: `src/scripts/convertJapaneseToxicDataset.js`。
[inspection-ai/japanese-toxic-dataset](https://github.com/inspection-ai/japanese-toxic-dataset)（Apache-2.0、
ANLP2022「日本語有害表現スキーマの提案と評価」）の437文を評価ハーネス形式に変換する。
1文につき複数人がラベルを付けているので、**過半の合意があるものだけ**を採用し、
判断が割れた128件は除外する（規則は結果を見る前に決定。除外件数は必ず標準エラーに出す）。

**結果**: 上の「現時点のモデレーション検出性能」を参照。要約すると
**自作セット F1 100% に対し、外部セットでは Recall 3.4%**（差別語追加後で10.3%）。
一方で **無害280件に対する誤検知は0件** で、Precision は他人のデータでも保たれた。

**この結果を受けて追加したもの**: 良性の用法がほぼ無い差別語11語を
`ng-words.json` に `discrimination` カテゴリとして追加した。
「バカ」「だっさ」「無能」等の軽口や、政党批判は**意図的に追加していない**
（前者は配信チャット文化、後者は政治的検閲になるため）。

**得られた教訓（今後のセッションへ）**:
自分で書いた評価セットの数字を製品の性能として報告してはならない。
このリポジトリでは `--file=` で外部セットを差し替えられるようにしてあるので、
モデレーション層に手を入れたら**必ず外部セットでも測ること**。
そして外部セットを見ながら調整を繰り返すと、それは訓練データに変わり
独立な検証の場を失う——調整は最小限に留め、何回調整したかを明記すること。

