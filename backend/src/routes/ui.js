const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/uiController');

router.put('/layout', ctrl.saveLayout);
router.put('/colors', ctrl.setColorPattern);
router.put('/accessibility', ctrl.setAccessibility);
router.put('/font', ctrl.setFont);
router.put('/zoom', ctrl.setZoom);
router.put('/auto-dark', ctrl.setAutoDarkMode);
router.put('/badge', ctrl.setBadge);
router.put('/help', ctrl.setHelp);
router.put('/language', ctrl.setLanguage);
router.put('/custom-css', ctrl.setCustomCss);

module.exports = router;
