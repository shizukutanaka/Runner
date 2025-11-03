const express = require('express');
const router = express.Router();
const commentsController = require('../controllers/commentsController');
const validate = require('../middleware/validation');
const commentSchema = require('../validation/comment');
const commentActionSchema = require('../validation/commentActions');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.use(authenticateToken);

router.get(
  '/',
  requireRole('moderator'),
  validate({ query: commentSchema.list }),
  commentsController.getComments
);

router.post(
  '/',
  requireRole('moderator'),
  validate({ body: commentSchema.create }),
  commentsController.createComment
);

router.put(
  '/:id',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.updateStatus
  }),
  commentsController.updateComment
);

router.post(
  '/summary',
  requireRole('moderator'),
  validate({ body: commentSchema.summary }),
  commentsController.summarizeComments
);

router.post(
  '/auto-answer',
  requireRole('moderator'),
  validate({ body: commentSchema.autoAnswer }),
  commentsController.autoAnswer
);

router.put(
  '/:id/avatar',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.setAvatar
  }),
  commentsController.setAvatar
);

router.put(
  '/:id/background',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.setBackground
  }),
  commentsController.setBackgroundColor
);

router.put(
  '/:id/highlight',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.setHighlight
  }),
  commentsController.setHighlight
);

router.put(
  '/:id/pin',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.setPin
  }),
  commentsController.setPin
);

router.put(
  '/:id/auto-archive',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.setAutoArchive
  }),
  commentsController.setAutoArchive
);

router.put(
  '/:id/external-share',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.setExternalShare
  }),
  commentsController.setExternalShare
);

router.get(
  '/:id/edit-history',
  requireRole('moderator'),
  validate({ params: commentActionSchema.commentIdParam }),
  commentsController.getEditHistory
);

router.put(
  '/:id/notification-frequency',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.notificationFrequency
  }),
  commentsController.setNotificationFrequency
);

// コメント公開範囲設定関連
router.get(
  '/:id/visibility',
  requireRole('moderator'),
  validate({ params: commentActionSchema.commentIdParam }),
  commentsController.getCommentVisibility
);

router.put(
  '/:id/visibility',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    body: commentActionSchema.visibility
  }),
  commentsController.setCommentVisibility
);

router.post(
  '/visibility/batch',
  requireRole('moderator'),
  validate({ body: commentActionSchema.batchVisibility }),
  commentsController.batchUpdateCommentVisibility
);

router.get(
  '/:id/visibility/history',
  requireRole('moderator'),
  validate({
    params: commentActionSchema.commentIdParam,
    query: commentActionSchema.pagination
  }),
  commentsController.getCommentVisibilityHistory
);

module.exports = router;
