# 削除した改善サマリー群について（2026-08-25）

リポジトリのルートに、2025年11月ごろの作業を記録した改善サマリーが8ファイル・
合計3,020行ありました。これらを削除し、経緯をこのファイルに残します。

削除したファイル:

| ファイル | 行数 |
|----------|------|
| `QUALITY_IMPROVEMENTS_SUMMARY.md` | 874 |
| `QUICK_WINS_IMPLEMENTATION_SUMMARY.md` | 510 |
| `PERFORMANCE_OPTIMIZATIONS.md` | 468 |
| `IMPROVEMENT_SUMMARY.md` | 383 |
| `ANALYSIS_STRENGTHS_WEAKNESSES.md` | 311 |
| `IMPLEMENTATION_PROGRESS.md` | 201 |
| `OPTIMIZATION_SUMMARY.md` | 136 |
| `IMPROVEMENTS.md` | 137 |

## なぜ削除したか

**記録として不正確なだけでなく、従うと壊れる指針になっていたため**です。
単なる重複整理ではありません。

### 1. 測定していない数値を「達成した改善」として記載していた

`QUICK_WINS_IMPLEMENTATION_SUMMARY.md` の冒頭:

```
- Runtime throughput: 200-300% improvement
- Image size: 50-70% reduction
- Security vulnerabilities: 90% reduction
```

いずれも**測定された値ではなく、変更前に見込んだ期待値**でした。
そして、その期待の根拠になった変更は3つとも**実際には動作しませんでした**。

| 記載された改善 | 実態 |
|----------------|------|
| 「Throughput 200-300%（`instances: 'max'` によるクラスターモード）」 | 本アプリは**単一インスタンス専用**。SQLiteの単一ファイルへ複数プロセスが書き込むとDBが破損し、YouTube APIのクォータをプロセス数だけ多重消費する。E-17で `instances: 1` + fork に修正済み |
| 「Image size 50-70%削減／脆弱性90%削減（Distrolessへの移行）」 | その `backend/Dockerfile` は**一度も起動できなかった**。alpine(musl)でビルドしdistroless(glibc)で実行するためsqlite3のネイティブバイナリが読めず、`--ignore-scripts` でそもそも生成すらされず、distrolessには `node` がPATHに無いためヘルスチェックが永久にunhealthyだった（E-16） |
| 「設定ファイル統合: 環境変数管理を `config/index.js` に統一」（`OPTIMIZATION_SUMMARY.md`） | その `config/index.js` は**どこからも読み込まれていなかった**。Nodeの解決順で `config.js` が優先されるため、406行が完全に死んでいた（E-18） |

### 2. 存在しない機能を「長所」として列挙していた

`ANALYSIS_STRENGTHS_WEAKNESSES.md` は次を強みとして挙げていました。

- 「GDPR コンプライアンス: データ保持、同意管理」
  → `gdprCompliance.js`（487行）はどこからも参照されておらず削除済み。
    `GDPR_*` 環境変数も9個すべてコードから読まれていなかった（E-20）
- 「Circuit Breaker: 外部API障害対策」
  → `CIRCUIT_BREAKER_*` 環境変数5個はいずれも未使用だった（E-20）

### 3. 最も危険な点

これらを読んだ将来の担当者が
**「クラスターモードは200-300%の効果があった」と信じて復活させる**可能性がありました。
そうすればデータベースが壊れます。

同じ指示は `k8s/` マニフェスト、`ecosystem.config.js`、`DEPLOYMENT_GUIDE.md` の
ロードバランシング節にもあり、**リポジトリ内で4箇所**が複数インスタンス化を勧めていました。
すべて修正・削除済みです。

## 何が残っているか

作業の記録が必要なら、次を参照してください。**いずれも証拠付きで維持されています。**

- [`docs/FEATURE_AUDIT.md`](FEATURE_AUDIT.md) — 実装状況の監査。
  各項目に「証拠」「実施した対応」「検証」「再検証の手順」を持つ
- [`docs/RESEARCH_IMPROVEMENTS.md`](RESEARCH_IMPROVEMENTS.md) — モデレーション性能の
  **実測値**と改善記録（外部ベンチマークでの測定を含む）
- `git log` — 削除したファイルの全文はここに残っています

## 今後のために

改善を記録するときは、**期待値と実測値を必ず区別**してください。
`QUICK_WINS_IMPLEMENTATION_SUMMARY.md` は "Expected Improvements" という見出しで
書き始めながら、冒頭の要約では達成済みのように読める形になっていました。
その2つが混ざった瞬間に、記録は資産ではなく負債になります。
