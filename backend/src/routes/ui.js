const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/uiController');
const validate = require('../middleware/validation');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { strictRateLimit } = require('../middleware/security');
const uiSchema = require('../validation/ui');

router.use(strictRateLimit);
router.use(authenticateToken);
router.use(requireRole('admin'));

router.put('/layout', validate({ body: uiSchema.saveLayout }), ctrl.saveLayout);
router.put('/colors', validate({ body: uiSchema.setColorPattern }), ctrl.setColorPattern);
router.put('/accessibility', validate({ body: uiSchema.setAccessibility }), ctrl.setAccessibility);
router.put('/font', validate({ body: uiSchema.setFont }), ctrl.setFont);
router.put('/zoom', validate({ body: uiSchema.setZoom }), ctrl.setZoom);
router.put('/auto-dark', validate({ body: uiSchema.setAutoDarkMode }), ctrl.setAutoDarkMode);
router.put('/badge', validate({ body: uiSchema.setBadge }), ctrl.setBadge);
router.put('/help', validate({ body: uiSchema.setHelp }), ctrl.setHelp);
router.put('/language', validate({ body: uiSchema.setLanguage }), ctrl.setLanguage);
router.put('/custom-css', validate({ body: uiSchema.setCustomCss }), ctrl.setCustomCss);

module.exports = router;
