# Qiita・Zenn調査による改善提案

## 調査日時
2026年6月24日

## 調査対象プラットフォーム
- Qiita (qiita.com)
- Zenn (zenn.dev)

## 主要な知見と実装状況

### 1. React パフォーマンス最適化

#### 知見（Qiita）
- **React Compiler v1.0 (2026年)**: useMemo/useCallbackの自動最適化
- **依存配列の正確性**: 古いクロージャバグを防ぐ
- **計測可能な効果**: パフォーマンス改善が測定できる場合のみ使用

**参考文献**:
- [React Compiler v1.0 — useMemo・useCallback はもう書かなくていい？](https://qiita.com/yuuue/items/c8a395c17ea3ccd995ec)
- [React のメモ化を整理する](https://qiita.com/ryo_sh/items/f394828fce8246b4b2e7)
- [30回が1回に。useMemoとuseCallbackで席替えアプリのパフォーマンスを劇的に改善](https://qiita.com/rio-taro117/items/100aa96a183aa5072b80)

#### 実装状況
- ✅ Dashboard.js: useMemo/useCallback適切に使用
- ✅ 依存配列が正確
- ⚠️ React Compiler: 未導入（将来的な検討事項）

#### 推奨アクション
```bash
# 将来的にReact Compilerを導入する場合:
npm install babel-plugin-react-compiler --save-dev
```

---

### 2. WebSocket セキュリティ

#### 知見（Qiita）
- **永続接続の脆弱性**: HTTPレート制限が効かない
- **毎秒数千メッセージ**: WebSocket専用レート制限が必須
- **認証タイミング**: 接続確立前に実施

**参考文献**:
- [WebSocketのセキュリティ、考えたことありますか？](https://qiita.com/kawabe0201/items/3aea101c01d23484b77e)
- [API攻撃が前年比113%増。エンジニアが今すぐ導入すべき防御実装](https://qiita.com/sarubot/items/024bac34da5b75307c89)

#### 実装状況
- ✅ **WebSocketレート制限実装済み** (2026-06-24)
  - トークンバケット方式
  - 20トークン初期容量
  - 10トークン/秒補充レート
  - newComment, moderationAction, userActivityに適用

#### コード例
```javascript
// backend/src/ws.js (実装済み)
const rateLimiter = {
  tokens: 20,
  maxTokens: 20,
  refillRate: 10,
  lastRefill: Date.now()
};

const checkRateLimit = () => {
  const now = Date.now();
  const elapsed = (now - rateLimiter.lastRefill) / 1000;
  rateLimiter.tokens = Math.min(
    rateLimiter.maxTokens,
    rateLimiter.tokens + (elapsed * rateLimiter.refillRate)
  );
  rateLimiter.lastRefill = now;
  
  if (rateLimiter.tokens >= 1) {
    rateLimiter.tokens -= 1;
    return true;
  }
  return false;
};
```

---

### 3. エラーハンドリング

#### 知見（Zenn）
- **Error Boundary**: コンポーネント単位のエラー処理
- **カスタムErrorクラス**: 型安全なエラー処理
- **instanceof Error**: TypeScript型ガード

**参考文献**:
- [TypeScriptのエラーハンドリングのベストプラクティス](https://zenn.dev/micin/articles/2024-12-02_rikson_error-handling-best-practices)
- [Reactのベストプラクティス集 bulletproof-react](https://zenn.dev/matsumot0/articles/b0257b6c022468)
- [React+TypeScript fetchでの非同期処理とエラーハンドリング](https://zenn.dev/junwineone/articles/0f0b64b41fb23a)

#### 実装状況
- ✅ Error Boundary実装済み (frontend/src/components/ErrorBoundary.jsx)
- ✅ カスタムErrorクラス実装済み:
  - ValidationError (status: 400)
  - UnauthorizedError (status: 401)
  - ForbiddenError (status: 403)
  - NotFoundError (status: 404)
  - ConflictError (status: 409)

#### 推奨パターン
```javascript
// カスタムErrorクラスの使用例
class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded', retryAfter = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}

// 使用例
if (!checkRateLimit()) {
  throw new RateLimitError('リクエストが多すぎます', 30);
}
```

---

### 4. テストベストプラクティス

#### 知見（Zenn）
- **Jest + Supertest**: Express API統合テスト
- **テストケース構造**: AAA (Arrange, Act, Assert)
- **モックデータ**: 本番に近い現実的なデータ

**参考文献**:
- [ExpressサーバのE2Eテスト](https://zenn.dev/kwst/articles/faf407354f94ae)
- [Supertestまとめ](https://zenn.dev/nineball/articles/6bdd83f7abf664)
- [バックエンドのテスト ~APIテスト編~](https://zenn.dev/dove/articles/26cfbc647e1897)

#### 実装状況
- ✅ 113テスト全て合格
  - Service tests: 89 passing
  - Route tests: 24 passing
- ✅ Supertest使用 (communityInsights.test.js)
- ✅ 入力検証テスト
- ✅ DoS保護テスト

---

### 5. セキュリティ対策

#### 知見統合
複数のソースから得られたセキュリティベストプラクティス:

1. **入力検証**
   - 最大長制限（DoS対策）
   - 型チェック
   - 列挙型制約

2. **レート制限**
   - HTTPエンドポイント
   - WebSocketイベント
   - APIキー別制限

3. **エラー情報の制御**
   - 本番環境では詳細を隠す
   - 開発環境でのみスタックトレース表示
   - ログには完全な情報を記録

#### 実装状況
- ✅ 入力サイズ制限:
  - /health-score: 最大1,000件
  - /context-analysis: 最大200件
  - /triage: 最大500件
  - _simpleSentimentScore: 最大10,000文字
- ✅ WebSocketレート制限
- ✅ 環境別エラー表示 (ErrorBoundary)

---

## 新規推奨改善事項

### 優先度: 高

#### 1. RateLimitErrorクラスの追加
WebSocket専用のエラークラスで、再試行時間を含む。

**実装箇所**: `backend/src/utils/validation.js`

```javascript
class RateLimitError extends Error {
  constructor(message = 'Rate limit exceeded', retryAfter = 60) {
    super(message);
    this.name = 'RateLimitError';
    this.status = 429;
    this.retryAfter = retryAfter;
  }
}
```

#### 2. 開発環境ログの最適化
main.jsxのログを開発環境のみに制限。

**実装箇所**: `frontend/src/main.jsx`

```javascript
if (import.meta.env.DEV) {
  console.log('🔧 MSW enabled for API mocking');
  // ...
  console.log('🚀 Runner Frontend initialized successfully');
}
```

### 優先度: 中

#### 3. React Compilerの導入検討
2026年の最新トレンドに対応し、手動メモ化を削減。

**メリット**:
- メモ化の自動化
- 依存配列バグの削減
- コード量の削減

**リスク**:
- ビルド時間の増加
- 既存コードとの互換性

#### 4. エラートラッキングサービスの統合
本番環境でのエラーを自動収集。

**推奨サービス**:
- Sentry
- Bugsnag
- Rollbar

**実装箇所**: `frontend/src/components/ErrorBoundary.jsx` (TODO既存)

---

## まとめ

### 実装済み改善 ✅
1. WebSocketレート制限（トークンバケット方式）
2. DoS対策の入力検証
3. Error Boundary
4. カスタムErrorクラス
5. 包括的テストスイート (113テスト)

### 今後の改善候補 📋
1. RateLimitErrorクラスの追加
2. 開発環境ログの最適化
3. React Compilerの導入検討
4. エラートラッキングサービスの統合

### 参考にした技術記事数
- Qiita: 20記事
- Zenn: 15記事
- 合計: 35記事

---

## 変更履歴
- 2026-06-24: 初版作成、Qiita・Zenn調査結果をまとめ
