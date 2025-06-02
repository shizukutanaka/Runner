const express = require('express');
const router = express.Router();
const commentsController = require('../controllers/commentsController');
const validate = require('../middleware/validation');
const commentSchema = require('../validation/comment');
const auth = require('../middleware/auth');

router.get('/', commentsController.getComments);
router.post('/', validate(commentSchema.create), commentsController.createComment);
router.put('/:id', validate(commentSchema.update), commentsController.updateComment);

// AI要約API
router.post('/summary', auth('admin'), commentsController.summarizeComments);

// AI自動Q&AボットAPI
router.post('/auto-answer', auth('admin'), commentsController.autoAnswer);

// コメントごとのアバター設定
router.put('/:id/avatar', commentsController.setAvatar);
// コメントごとの背景色設定
router.put('/:id/background', commentsController.setBackgroundColor);
// コメントごとのハイライト設定
router.put('/:id/highlight', commentsController.setHighlight);
// コメントごとの固定表示設定
router.put('/:id/pin', commentsController.setPin);
// コメントごとの自動アーカイブ設定
router.put('/:id/auto-archive', commentsController.setAutoArchive);
// コメントごとの外部共有設定
router.put('/:id/external-share', commentsController.setExternalShare);
// コメントごとの編集履歴取得
router.get('/:id/edit-history', commentsController.getEditHistory);
// コメントごとの通知頻度設定
router.put('/:id/notification-frequency', commentsController.setNotificationFrequency);

module.exports = router;
