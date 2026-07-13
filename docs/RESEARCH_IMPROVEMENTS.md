# 最新研究・API動向にもとづく改善点（Research-Driven Improvements）

**作成日: 2026-07-11 / 最終更新: 2026-07-13** / 対象ブランチ: `claude/research-and-improve-011CUhKHj4EELmH43vbvh3BC`

## この文書の目的

本書は、この製品（YouTube/Twitch コメントモデレーションプラットフォーム）の AI/モデレーション機構を、**2024〜2026年の関連論文・公式API動向・データセット**と突き合わせて洗い出した改善点リストである。`docs/FEATURE_AUDIT.md`（機能過不足）とは別軸で、「実装は動いているが、技術選択が古い・研究的により良い手法がある」項目を扱う。

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

1. **Twitch未実装**: 製品名が「YouTube/Twitch」を約束するのに片翼のみ（実装経路はR-7で確定済み）
2. ~~NGワード実効リストがプレースホルダ~~ → **R-5aで解消済み**（2026-07-13）
3. **in-memory状態の揮発**: 文化プロファイル・離脱検知の追跡データが再起動で消える（DB永続化が未着手）
4. **レート制限が全体で無効**（FEATURE_AUDIT.md E-14）・マルチテナント未配線（D-6/E-3）
5. **大量のスタブAPI**: moderationController約35関数・analyticsController 13関数がハードコード値を返す（E-1/E-2。今回さらに翻訳モック2件とカスタムフィルタの全滅バグを解消したが、残りは個別トリアージ待ち）
6. **文脈分析が素朴ヒューリスティック**: 感情スコア平均±0.3補正のみ。改善方針はR-4（Policy-as-Prompt）で確定済みだが未実装

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

### R-10. ✅ モック翻訳を実翻訳へ配線替え（2026-07-13実施済み）

- **元の問題**: `moderationController.translateText`/`autoTranslate` はハードコードEN↔JA語彙のモックで、未収録語には `[ja→en] テキスト` という**機械翻訳風の偽装文字列**を返していた。一方 `openaiService.translateText()` には実際に動くLLM翻訳が存在していたが未配線。`moderationService.js` 内にも同内容のデッドモック2関数（約130行、export無し）が重複していた
- **実施した修正**: HTTP層2エンドポイントを `openaiService.translateText()` へ配線替え。**キー未設定/失敗時は原文を `available:false` 付きで返し、偽装翻訳は返さない**。デッドモック2関数は削除。言語検出は `moderationService.detectLanguage()`（20言語対応の文字/単語ベース検出、従来未exportだった実用ロジック）をexport化して `autoTranslate` の簡易3言語判定を置換
- **検証**: devサーバー起動+curlで `POST /api/moderation/translation/translate`（原文+available:false+明示メッセージ）・`/auto-translate`（ja検出・same_languageスキップ・per-target error）を確認。フルテスト悪化ゼロ
- **再検証**: `grep -n "openaiService.translateText" backend/src/controllers/moderationController.js` → 2箇所ヒットすれば適用済み

---

## 検証（本ブランチで実施済みの R-1/R-3/R-5a/R-5補足/R-10）

1. `cd backend && rm -f data/test.db && NODE_ENV=test npx jest --runInBand` → **4 failed / 433 passed / 447 total**（既存の失敗4件のみ・悪化ゼロ。R-5a/R-5補足の新規8テストを含む）
2. `node --check` 各修正ファイル → 構文OK
3. OpenAIキー未設定時のフォールバックを devサーバー+curl で実地確認（モデレーション: ルールベース続行 / 翻訳: 原文+available:false / 起動: 警告のみで正常）

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
