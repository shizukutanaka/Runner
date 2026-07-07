const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const validate = require('../middleware/validation');
const authSchema = require('../validation/auth');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { limiters } = require('../middleware/rateLimiter');

router.post('/register', limiters.authWrite, validate(authSchema.register), authController.register);
router.post('/login', limiters.auth, validate(authSchema.login), authController.login);
router.get('/me', authenticateToken, authController.me);
router.post('/logout', authenticateToken, authController.logout);
router.post('/refresh', limiters.authWrite, validate(authSchema.refresh), authController.refresh);
router.post('/forgot-password', limiters.authWrite, validate(authSchema.forgotPassword), authController.forgotPassword);
router.post('/reset-password', limiters.authWrite, validate(authSchema.resetPassword), authController.resetPassword);
router.put('/change-password', authenticateToken, validate(authSchema.changePassword), authController.changePassword);
router.post('/enable-2fa', authenticateToken, authController.enable2FA);
router.post('/verify-2fa', authenticateToken, validate(authSchema.verify2FA), authController.verify2FA);

// アカウント管理（管理者用）
router.get('/accounts', authenticateToken, requireRole('admin'), authController.listAccounts);
router.put('/accounts/:id/role', authenticateToken, requireRole('admin'), validate(authSchema.setRole), authController.setAccountRole);

module.exports = router;
