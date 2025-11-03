# 機能実装チェックリスト / Feature Implementation Checklist

## 日本語セクション

### 概要
本一覧はコメント管理ソフトウェアの機能実装状況を整理し、重要度が高い事項から軽量な作業を優先的に実装する方針を示します。

### 管理方針
- 実装状況とテスト状況を節目ごとに更新します。
- 重複する機能が見つかった場合は統合し、本表に集約します。
- 定期的に未着手項目の優先度を見直し、安定運用に必要な改善を継続します。

### チェックリスト
| No. | 機能名 / Feature | 概要 / Description | 担当モジュール / Module | 実装状況 / Implementation | テスト状況 / Testing | 備考 / Notes |
|-----|--------|------|---------------|----------|------------|------|
| 1 | コメント取得 / Comment Retrieval | コメント一覧取得API / Comment list retrieval API | backend/commentsController | 完了 / Completed | 済 / Tested |  |
| 2 | コメント投稿 / Comment Submission | コメント投稿API / Comment submission API | backend/commentsController | 完了 / Completed | 済 / Tested |  |
| 3 | コメント編集 / Comment Editing | コメント編集API / Comment editing API | backend/commentsController | 完了 / Completed | 済 / Tested |  |
| 4 | コメント削除 / Comment Deletion | コメント削除API / Comment deletion API | backend/commentsController | 完了 / Completed | 済 / Tested |  |
| 5 | ユーザー一覧 / User List | ユーザー一覧取得API / User list retrieval API | backend/usersController | 完了 / Completed | 済 / Tested |  |
| 6 | ユーザー詳細 / User Details | ユーザー詳細取得API / User detail retrieval API | backend/usersController | 完了 / Completed | 済 / Tested |  |
| 7 | BAN / Ban Management | ユーザーBAN操作API / User ban management API | backend/usersController | 完了 / Completed | 済 / Tested |  |
| 8 | ミュート / Mute Management | ユーザーミュートAPI / User mute API | backend/usersController | 完了 / Completed | 済 / Tested |  |
| 9 | 履歴取得 / History Retrieval | ユーザー履歴取得API / User history retrieval API | backend/usersController | 完了 / Completed | 済 / Tested |  |
| 10 | AIモデレーション / AI Moderation | コメントAI判定API / Comment AI evaluation API | backend/moderationController | 完了 / Completed | 済 / Tested |  |
| 11 | NGワード管理 / NG Word Management | NGワード設定API / NG word configuration API | backend/moderationController | 完了 / Completed | 済 / Tested |  |
| 12 | 閾値設定 / Threshold Configuration | モデレーション閾値設定API / Moderation threshold configuration API | backend/moderationController | 完了 / Completed | 済 / Tested |  |
| 13 | 通知一覧 / Notification List | 通知一覧取得API / Notification list retrieval API | backend/notificationsController | 完了 / Completed | 済 / Tested |  |
| 14 | 通知送信 / Notification Dispatch | 通知送信API / Notification dispatch API | backend/notificationsController | 完了 / Completed | 済 / Tested |  |
| 15 | ダッシュボード統計 / Dashboard Analytics | コメント/ユーザー統計API / Comment and user statistics API | backend/analyticsController | 完了 / Completed | 済 / Tested |  |
| 16 | グラフデータ / Graph Data | 統計グラフ用API / Statistical graph API | backend/analyticsController | 完了 / Completed | 済 / Tested |  |
| 17 | WebSocket通信 / WebSocket Communication | コメント/ユーザーリアルタイム反映 / Real-time updates for comments and users | backend/ws, frontend/ws.js | 完了 / Completed | 済 / Tested |  |
| 18 | ロール認証 / Role Authorization | 管理者/一般ユーザー認可 / Permissions for administrators and standard users | backend/auth, middleware | 完了 / Completed | 済 / Tested |  |
| 19 | テーマ設定 / Theme Configuration | ダーク/ライト切替UI / Dark and light mode toggle UI | frontend/ThemeContext | 完了 / Completed | 済 / Tested |  |
| 20 | 設定管理 / Settings Management | 各種設定取得/保存API / Settings retrieval and persistence API | backend/settingsController | 完了 / Completed | 済 / Tested |  |
| 21 | コメント最大文字数設定 / Comment Length Limit | コメント投稿の最大文字数を設定 / Configure maximum characters for comments | backend/settingsController | 完了 / Completed | 未 / Not Tested |  |
| 22 | コメント自動翻訳ON/OFF / Comment Auto-Translation Toggle | コメントの自動翻訳機能切替 / Toggle automatic translation for comments | backend/settingsController | 完了 / Completed | 未 / Not Tested |  |
| 23 | NGワード自動追加 / NG Word Auto Addition | NGワードの自動追加API / Automatic NG word registration API | backend/settingsController | 完了 / Completed | 未 / Not Tested |  |
| 24 | ユーザー通知設定 / User Notification Settings | ユーザーごとの通知ON/OFF / Per-user notification toggle | backend/usersController | 未着手 / Not Started | 未 / Not Tested |  |
| 25 | AI閾値個別設定 / Per-Comment AI Threshold | コメントごとのAI判定閾値設定 / Configure AI threshold per comment | backend/moderationController | 未着手 / Not Started | 未 / Not Tested |  |
| 26 | コメントピン固定数設定 / Pin Limit Configuration | ピン固定可能なコメント数設定 / Set allowable number of pinned comments | backend/settingsController | 完了 / Completed | 未 / Not Tested |  |
| 27 | ユーザーごとのテーマ設定 / User Theme Preferences | ユーザー単位のテーマ管理 / Manage themes per user | backend/settingsController | 未着手 / Not Started | 未 / Not Tested |  |
| 28 | コメント自動削除時間設定 / Comment Auto-Deletion Timer | コメントの自動削除までの時間設定 / Configure auto-removal timing | backend/settingsController | 完了 / Completed | 未 / Not Tested |  |
| 29 | ユーザーごとのBAN理由記録 / Ban Reason Logging | BAN時の理由記録API / Record ban reasons API | backend/usersController | 未着手 / Not Started | 未 / Not Tested |  |
| 30 | コメント編集履歴取得 / Comment Edit History | コメント編集履歴取得API / Comment edit history API | backend/commentsController | 未着手 / Not Started | 未 / Not Tested |  |
| 31 | コメントごとのリアクション設定 / Comment Reactions | コメントごとにリアクションを付与 / Assign reactions per comment | backend/commentsController | 未着手 / Not Started | 未 / Not Tested |  |
| 32 | ユーザーごとのミュート期間設定 / User Mute Duration | ミュート期間の個別設定 / Configure mute duration per user | backend/usersController | 未着手 / Not Started | 未 / Not Tested |  |
| 33 | AI判定ログ取得 / AI Decision Logs | AI判定の詳細ログ取得API / Retrieve detailed AI moderation logs | backend/moderationController | 未着手 / Not Started | 未 / Not Tested |  |
| 34 | コメントごとのタグ付与 / Comment Tagging | コメントにタグを付与 / Assign tags to comments | backend/commentsController | 未着手 / Not Started | 未 / Not Tested |  |
| 35 | ユーザーごとのコメント色設定 / Comment Color per User | コメント表示色の個別設定 / Configure comment display colors per user | backend/usersController | 未着手 / Not Started | 未 / Not Tested |  |
| 36 | コメントごとの画像添付 / Comment Image Attachments | コメントに画像を添付 / Attach images to comments | backend/commentsController | 未着手 / Not Started | 未 / Not Tested |  |
| 37 | コメントごとの動画添付 / Comment Video Attachments | コメントに動画を添付 / Attach videos to comments | backend/commentsController | 未着手 / Not Started | 未 / Not Tested |  |
| 38 | コメントごとのリンク自動検出 / Comment Link Detection | コメント内リンクの自動検出 / Detect links within comments automatically | backend/commentsController | 未着手 / Not Started | 未 / Not Tested |  |
| 39 | ユーザーごとの通知サウンド設定 / Notification Sounds per User | 通知サウンドの個別設定 / Configure notification sounds per user | backend/usersController | 未着手 / Not Started | 未 / Not Tested |  |
| 40 | コメントごとの重要度設定 / Comment Priority | コメントの重要度を設定 / Assign priority levels to comments | backend/commentsController | 未着手 / Not Started | 未 / Not Tested |  |
| 41  | コメントごとの公開範囲設定 | コメントの公開範囲を設定 | backend/commentsController | 未着手 | 未 |  |
| 42  | コメントごとの削除理由記録 | コメント削除時の理由記録 | backend/commentsController | 未着手 | 未 |  |
| 43  | コメントごとの編集権限設定 | 編集可能ユーザーの設定 | backend/commentsController | 未着手 | 未 |  |
| 44  | コメントごとのピン解除API | ピン解除専用API | backend/commentsController | 未着手 | 未 |  |
| 45  | ユーザーごとのブロックリスト管理 | ブロックリストAPI | backend/usersController | 未着手 | 未 |  |
| 46  | コメントごとのAI自動翻訳 | AIによる自動翻訳API | backend/moderationController | 未着手 | 未 |  |
| 47  | コメントごとの通報API | コメント通報API | backend/commentsController | 未着手 | 未 |  |
| 48  | コメントごとの既読管理 | 既読ステータス管理API | backend/commentsController | 未着手 | 未 |  |
| 49  | コメントごとの編集禁止設定 | 編集禁止フラグAPI | backend/commentsController | 未着手 | 未 |  |
| 50  | コメントごとの公開期限設定 | 公開期限付きコメントAPI | backend/commentsController | 未着手 | 未 |  |
| 51  | コメントごとのフォントサイズ設定 | フォントサイズ個別設定API | backend/commentsController | 未着手 | 未 |  |
| 52  | コメントごとの表示順設定 | 表示順個別設定API | backend/commentsController | 未着手 | 未 |  |
| 53  | コメントごとのアバター設定 | アバター画像個別設定API | backend/commentsController | 未着手 | 未 |  |
| 54  | コメントごとの背景色設定 | 背景色個別設定API | backend/commentsController | 未着手 | 未 |  |
| 55  | コメントごとのハイライト設定 | ハイライト表示API | backend/commentsController | 未着手 | 未 |  |
| 56  | コメントごとの固定表示設定 | 固定表示API | backend/commentsController | 未着手 | 未 |  |
| 57  | コメントごとの自動アーカイブ設定 | 自動アーカイブAPI | backend/commentsController | 未着手 | 未 |  |
| 58  | コメントごとの外部共有設定 | 外部サービス共有API | backend/commentsController | 未着手 | 未 |  |
| 59  | コメントごとの編集履歴取得 | 編集履歴取得API | backend/commentsController | 未着手 | 未 |  |
| 60  | コメントごとの通知頻度設定 | 通知頻度個別設定API | backend/commentsController | 未着手 | 未 |  |
| 61  | ユーザーごとの通知頻度設定 | 通知頻度個別設定API | backend/usersController | 未着手 | 未 |  |
| 62  | ユーザーごとの外部連携ON/OFF | 外部サービス連携API | backend/usersController | 未着手 | 未 |  |
| 63  | ユーザーごとのプロフィール画像設定 | プロフィール画像API | backend/usersController | 未着手 | 未 |  |
| 64  | ユーザーごとの自己紹介文設定 | 自己紹介文API | backend/usersController | 未着手 | 未 |  |
| 65  | ユーザーごとの言語設定 | 言語個別設定API | backend/usersController | 未着手 | 未 |  |
| 66  | ユーザーごとのタイムゾーン設定 | タイムゾーンAPI | backend/usersController | 未着手 | 未 |  |
| 67  | ユーザーごとのサブスク状態管理 | サブスクAPI | backend/billingController, backend/stripeService | 完了 / Completed | 済 / Tested | Stripe統合完了 |
| 68  | ユーザーごとの認証履歴取得 | 認証履歴API | backend/usersController | 未着手 | 未 |  |
| 69  | ユーザーごとのセキュリティ設定 | セキュリティAPI | backend/usersController | 未着手 | 未 |  |
| 70  | AI判定閾値詳細設定 | 詳細閾値設定API | backend/moderationController | 未着手 | 未 |  |
| 71  | AI判定自動学習ON/OFF | 自動学習API | backend/moderationController | 未着手 | 未 |  |
| 72  | AI判定モデル切替 | モデル切替API | backend/moderationController | 未着手 | 未 |  |
| 73  | AI判定の再学習API | 再学習API | backend/moderationController | 未着手 | 未 |  |
| 74  | AI判定の説明表示 | 判定説明API | backend/moderationController | 未着手 | 未 |  |
| 75  | AI判定結果のエクスポート | 結果エクスポートAPI | backend/moderationController | 未着手 | 未 |  |
| 76  | NGワード自動収集API | NGワード自動収集API | backend/moderationController | 未着手 | 未 |  |
| 77  | NGワードごとの重み付け設定 | 重み付けAPI | backend/moderationController | 未着手 | 未 |  |
| 78  | NGワードの履歴取得 | NGワード履歴API | backend/moderationController | 未着手 | 未 |  |
| 79  | NGワードの外部連携API | 外部NGワードAPI | backend/moderationController | 未着手 | 未 |  |
| 80  | NGワードの自動翻訳API | NGワード翻訳API | backend/moderationController | 未着手 | 未 |  |
| 81  | 設定ごとのバージョン管理 | バージョン管理API | backend/settingsController | 未着手 | 未 |  |
| 82  | 設定ごとのインポート/エクスポート | 設定インポート/エクスポートAPI | backend/settingsController | 未着手 | 未 |  |
| 83  | 設定ごとの履歴取得 | 設定履歴API | backend/settingsController | 未着手 | 未 |  |
| 84  | 設定ごとの自動バックアップ | 自動バックアップAPI | backend/settingsController | 未着手 | 未 |  |
| 85  | 設定ごとの自動復元 | 自動復元API | backend/settingsController | 未着手 | 未 |  |
| 86  | 設定ごとのアクセス権限設定 | アクセス権限API | backend/settingsController | 未着手 | 未 |  |
| 87  | 設定ごとの通知設定 | 通知設定API | backend/settingsController | 未着手 | 未 |  |
| 88  | 設定ごとのUIテーマ設定 | UIテーマAPI | backend/settingsController | 未着手 | 未 |  |
| 89  | 設定ごとの自動適用 | 自動適用API | backend/settingsController | 未着手 | 未 |  |
| 90  | 設定ごとの有効期限設定 | 有効期限API | backend/settingsController | 未着手 | 未 |  |
| 91  | UIごとのレイアウト保存 | レイアウト保存API | frontend/ThemeContext | 未着手 | 未 |  |
| 92  | UIごとのカラーパターン設定 | カラーパターンAPI | frontend/ThemeContext | 未着手 | 未 |  |
| 93  | UIごとのアクセシビリティ設定 | アクセシビリティAPI | frontend/ThemeContext | 未着手 | 未 |  |
| 94  | UIごとのフォント変更 | フォント変更API | frontend/ThemeContext | 未着手 | 未 |  |
| 95  | UIごとの拡大縮小設定 | 拡大縮小API | frontend/ThemeContext | 未着手 | 未 |  |
| 96  | UIごとのダークモード自動切替 | 自動切替API | frontend/ThemeContext | 未着手 | 未 |  |
| 97  | UIごとの通知バッジ設定 | 通知バッジAPI | frontend/ThemeContext | 未着手 | 未 |  |
| 98  | UIごとのヘルプ表示設定 | ヘルプ表示API | frontend/ThemeContext | 未着手 | 未 |  |
| 99  | UIごとの言語切替 | 言語切替API | frontend/ThemeContext | 未着手 | 未 |  |
| 100 | UIごとのカスタムCSS設定 | カスタムCSSAPI | frontend/ThemeContext | 未着手 | 未 |  |
| ... | ... | ... | ... | ... | ... | ... |
| 1000 | Feature1000 | 自動生成API | backend/src/routes/Feature1000.js | 未着手 | 未 | 自動生成 |
