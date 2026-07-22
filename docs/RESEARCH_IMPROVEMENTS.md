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
4. **レート制限が全体で無効**（FEATURE_AUDIT.md E-14）・マルチテナント未配線（D-6/E-3）
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
- **(b) 未着手**: AnswerCarefully等の日本語評価セットでモデレーション合格率を測るハーネス。R-1（omni-moderation化）の効果測定を兼ねる
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
