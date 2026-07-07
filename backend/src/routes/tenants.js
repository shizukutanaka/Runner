const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tenantController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// 管理ダッシュボード向け操作（内部JWT認証）
// 注意: authenticateToken は requireRole が req.user を参照するために必須。
// 従来は requireRole のみが指定されており、req.user が一度も設定されないため
// 正規のadminトークンを持つリクエストも含め常に401になっていた
const adminAuth = [authenticateToken, requireRole('admin')];

// テナント作成
router.post('/', adminAuth, ctrl.createTenant);

// テナント一覧取得
router.get('/', adminAuth, ctrl.getTenants);

// テナント情報取得
router.get('/:tenantId', adminAuth, ctrl.getTenant);

// テナント更新
router.put('/:tenantId', adminAuth, ctrl.updateTenant);

// テナント削除（無効化中。tenantController.deleteTenant参照）
router.delete('/:tenantId', adminAuth, ctrl.deleteTenant);

// APIキー再生成
router.post('/:tenantId/regenerate-key', adminAuth, ctrl.regenerateApiKey);

// テナント使用状況取得
router.get('/:tenantId/usage', adminAuth, ctrl.getTenantUsage);

// 外部テナントAPI利用者向け認証（x-api-key / Bearer<APIキー>、上記の内部JWT認証とは別系統）
router.use('/tenant', ctrl.authenticateTenant);

module.exports = router;
