const express = require('express');
const router = express.Router();
const { asyncHandler } = require('../utils/asyncHandler');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);
router.use(requireRole('moderator'));

// W-13: この学術論文検索は **一度も実装されたことがない**。
// 旧実装は 200 + 空配列 + 「SEMANTIC_SCHOLAR_API_KEY を設定すれば有効化される」
// というメッセージを返していたが、実際には `SEMANTIC_SCHOLAR_API_KEY` を読むコードは
// リポジトリのどこにも存在せず、キーを設定しても何も起こらない。
// その結果フロントは 200 を成功として扱い「関連論文が見つかりませんでした」と表示し、
// **検索が実行された上で0件だった** かのようにユーザーへ嘘をついていた。
// 未実装の外部I/Oは 501 を返す（W-4 の analytics export/import/external と同じ規約）。
const notImplemented = (feature) => (req, res) => {
  res.status(501).json({
    status: 501,
    implemented: false,
    message: `${feature}は未実装です（学術論文検索の外部連携は本製品にまだ組み込まれていません）`
  });
};

router.get('/search', notImplemented('学術論文の検索'));

router.get('/:paperId', notImplemented('論文情報の取得'));

router.get('/related/:channelId', notImplemented('チャンネル関連論文の取得'));

// comments が不正な場合は従来どおり 400 を優先し、正しい入力に対して 501 を返す
router.post('/related-comments', asyncHandler(async (req, res) => {
  const { comments } = req.body;
  if (!Array.isArray(comments) || comments.length === 0) {
    return res.status(400).json({ status: 400, message: 'comments must be a non-empty array' });
  }
  return notImplemented('コメントからの関連論文提案')(req, res);
}));

module.exports = router;
