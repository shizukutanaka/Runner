const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/notificationsController');

router.get('/', ctrl.getNotifications);
router.post('/', ctrl.createNotification);

module.exports = router;
