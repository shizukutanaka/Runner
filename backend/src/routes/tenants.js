const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tenantController');
const { requireRole } = require('../middleware/auth');

// テナント作成
router.post('/', requireRole('admin'), ctrl.createTenant);

// テナント一覧取得
router.get('/', requireRole('admin'), ctrl.getTenants);

// テナント情報取得
router.get('/:tenantId', requireRole('admin'), ctrl.getTenant);

// テナント更新
router.put('/:tenantId', requireRole('admin'), ctrl.updateTenant);

// テナント削除
router.delete('/:tenantId', requireRole('admin'), ctrl.deleteTenant);

// APIキー再生成
router.post('/:tenantId/regenerate-key', requireRole('admin'), ctrl.regenerateApiKey);

// テナント使用状況取得
router.get('/:tenantId/usage', requireRole('admin'), ctrl.getTenantUsage);

// テナント認証ミドルウェア
router.use('/tenant', ctrl.authenticateTenant);

module.exports = router;
