const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tenantController');
const auth = require('../middleware/auth');

// テナント作成
router.post('/', auth('admin'), ctrl.createTenant);

// テナント一覧取得
router.get('/', auth('admin'), ctrl.getTenants);

// テナント情報取得
router.get('/:tenantId', auth('admin'), ctrl.getTenant);

// テナント更新
router.put('/:tenantId', auth('admin'), ctrl.updateTenant);

// テナント削除
router.delete('/:tenantId', auth('admin'), ctrl.deleteTenant);

// APIキー再生成
router.post('/:tenantId/regenerate-key', auth('admin'), ctrl.regenerateApiKey);

// テナント使用状況取得
router.get('/:tenantId/usage', auth('admin'), ctrl.getTenantUsage);

// テナント認証ミドルウェア
router.use('/tenant', ctrl.authenticateTenant);

module.exports = router;
