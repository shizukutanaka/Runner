# 最新研究・API動向にもとづく改善点（Research-Driven Improvements）

**作成日: 2026-07-11** / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`

## この文書の目的

本書は、この製品（YouTube/Twitch コメントモデレーションプラットフォーム）の AI/モデレーション機構を、**2024〜2026年の関連論文・公式API動向・データセット**と突き合わせて洗い出した改善点リストである。`docs/FEATURE_AUDIT.md`（機能過不足）とは別軸で、「実装は動いているが、技術選択が古い・研究的により良い手法がある」項目を扱う。

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
| NGワード | コード内埋め込み・英語偏重・実効リストは`['badword','spamword']`プレースホルダ | `moderationService.js` `YOUTUBE_COMMUNITY_FILTERS` |
| YouTube取込 | `liveChatMessages.list` ポーリング（`pollingIntervalMillis`尊重・クォータ追跡） | `services/youtubeIngestionService.js` |
| Twitch取込 | **未実装**（クレデンシャル設定のみ） | — |
| 翻訳 | ハードコード語彙のモック（openaiServiceには実翻訳あり・未配線） | `moderationService.js` `translateText()` |

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

### R-5. ★ 日本語有害性の実カバレッジ整備 + NGワードのデータファイル化

- **根拠**:
  - **AnswerCarefully** (鈴木ら, NLP2025) — 日本語LLM安全性データセット v2.0（評価336件/開発1,464件）。(https://www.anlp.jp/proceedings/annual_meeting/2025/pdf_dir/Q2-3.pdf)
  - リコー等が14カテゴリの日本語ガードレールモデルを2025年に公開するなど、日本語有害性検出のリソースが充実してきた。(https://jp.ricoh.com/release/2025/1225_1)
- **現状の弱点**: 実効NGリストが `['badword','spamword']` のプレースホルダ。`YOUTUBE_COMMUNITY_FILTERS` は英語約50語。日本語カバレッジがほぼ無い
- **改善案**: (a) NGワードを `data/ng-words.{ja,en}.json` 等のデータファイルへ外出しし、コード再デプロイなしで更新可能に。(b) 日本語評価セット（AnswerCarefully等）でモデレーションの合格率を測るテストハーネスを追加し、`omni-moderation-latest` 化（R-1）の効果を数値で確認
- **対象ファイル**: `services/moderationService.js`（`YOUTUBE_COMMUNITY_FILTERS`のデータ化）, `tests/` に評価ハーネス新規

### R-6. YouTube 取込のクォータ最適化（`streamList` 調査）

- **現状**: `liveChatMessages.list` をポーリング（1回5ユニット、日次1万上限で自動停止）。長時間配信ではクォータが逼迫しうる
- **改善案**: YouTube Live Streaming API のサーバープッシュ型メソッド（`liveChatMessages` の streaming 応答）が利用可能か公式ドキュメントで確認し、使えるならポーリング回数を削減。**着手前に公式ドキュメントで該当メソッドの実在とクォータ影響を必ず確認**すること（本項目は未検証の最適化仮説）
- **対象ファイル**: `services/youtubeIngestionService.js`

### R-7. ★ Twitch 実装の経路確定（EventSub WebSocket）

- **根拠**: Twitch の現行公式チャット統合経路は **EventSub WebSocket + `channel.chat.message` 購読**（IRC/PubSubはレガシー）。AutoModと連携するなら `automod.message.hold`（`moderator:manage:automod` スコープ必須）で保留メッセージを受信できる。(https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/)
- **現状**: `config.services.twitch` にクレデンシャルはあるが実装ゼロ。`['youtube','twitch']` のバリデーション白リストにだけ `twitch` が並ぶ張りぼて状態
- **改善案**: `services/twitchIngestionService.js` を新規作成。EventSub WebSocket で `channel.chat.message` を購読 → `commentsController.ingestComment()`（プラットフォーム`twitch`）へ投入。`automod.message.hold` は既存の held-messages キュー（`db.js` の `held_messages` テーブル）へ接続。**IRC実装は不要**
- **対象ファイル**: `services/twitchIngestionService.js`（新規）, `server.js`（require+shutdown）, `routes/twitch.js`（監視開始/停止、youtube.jsのミラー）

### R-8. エモート/スタンプ認識をモデレーション入力に含める

- **根拠**:
  - **ToxiTwitch** (arXiv:2601.15605) / **E2T2: Emote Embedding for Twitch Toxicity Detection** (CSCW 2024) — エモートを考慮すると配信チャットの有害性検出精度が向上。エモートは配信文化の中核であり、テキストだけでは意味が欠落する。(https://arxiv.org/abs/2601.15605, https://doi.org/10.1145/3678884.3681840)
- **現状**: YouTube のスタンプ・メンバーシップギフト等のイベント種別が `ingestComment` のメタデータに取り込まれていない
- **改善案**: YouTube `liveChatMessages` の `snippet.type`（`textMessageEvent`/`superChatEvent`/`membershipGiftingEvent`等）とスタンプ情報を `ingestComment` のメタデータへ保存し、モデレーション/インサイトの入力に含める
- **対象ファイル**: `services/youtubeIngestionService.js`, `controllers/commentsController.js` `ingestComment()`

---

## 長期（製品判断が必要・当面はドキュメント記載のみ）

### R-9. SLM-Mod 路線（コミュニティ固有の微調整済み小型モデル）

- **根拠**: **SLM-Mod** (arXiv:2410.13155, NAACL 2025) — 15B未満の小型モデルをコミュニティ固有に微調整すると、ゼロショットLLMを**精度+11.5%・再現率+25.7%**で上回り、リアルタイム照会コストとレイテンシも低い。(https://arxiv.org/abs/2410.13155, https://aclanthology.org/2025.naacl-long.441/)
- **判断材料**: 本製品の「配信者ごとの文化プロファイル」はコミュニティ固有モデレーションと親和性が高い。ただし微調整モデルのホスティングにはGPU/推論基盤が必要で、現行のデプロイ想定（Node.js単体 + OpenAI API）とは乖離する。**当面は `gpt-4o-mini` + few-shot（R-4のPolicy-as-Prompt）で代替可能**。ユーザー数・コメント量が API コストを圧迫する規模になった段階で再検討
- **実施しない理由**: ローカルML基盤の導入は本タスクのスコープ外・実行環境要件が不一致

### R-10. モック翻訳の実装置換 or 削除

- **現状**: `moderationService.translateText()` はハードコードEN↔JA語彙のモック。一方 `openaiService` には実際に動く chat ベース翻訳が既にある（未配線）
- **改善案**: HTTP層（`moderationController.translateText`, `routes/moderation.js:60`）を `openaiService` の実翻訳へ配線替えするか、使われていないなら削除。配線替えのみで解消可能な軽微項目
- **対象ファイル**: `controllers/moderationController.js`, `services/moderationService.js`

---

## 検証（本ブランチで実施済みの R-1/R-3）

1. `cd backend && rm -f data/test.db && NODE_ENV=test npx jest --runInBand` → **4 failed / 425 passed / 439 total**（既存ベースライン維持・悪化ゼロ）
2. `node --check backend/src/services/moderationService.js` / `openaiService.js` → 構文OK
3. OpenAIキー未設定時のフォールバック（`detectToxicContent` が `{isToxic:false, error:'OpenAI not available'}` を返す）は既存のガードで維持

## 出典一覧

- OpenAI Moderation (omni-moderation-latest): https://platform.openai.com/docs/guides/moderation
- Perspective API 終了告知: https://developers.perspectiveapi.com/ , https://www.lassomoderation.com/blog/perspective-api/
- Policy-as-Prompt (arXiv:2502.18695, FAccT 2025): https://arxiv.org/abs/2502.18695
- ToxiTwitch (arXiv:2601.15605): https://arxiv.org/abs/2601.15605
- E2T2: Emote Embedding for Twitch Toxicity Detection (CSCW 2024): https://doi.org/10.1145/3678884.3681840
- SLM-Mod (arXiv:2410.13155, NAACL 2025): https://arxiv.org/abs/2410.13155 , https://aclanthology.org/2025.naacl-long.441/
- AnswerCarefully (NLP2025): https://www.anlp.jp/proceedings/annual_meeting/2025/pdf_dir/Q2-3.pdf
- リコー 日本語ガードレールモデル (2025): https://jp.ricoh.com/release/2025/1225_1
- Twitch EventSub Subscription Types: https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/
