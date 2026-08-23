const express = require('express');
const router = express.Router();
const calendarController = require('../controllers/calendarController');
const { requireAuth } = require('../middleware/auth');

router.get('/oauth/connect', requireAuth, calendarController.connect);
// Google redirects the browser here directly (no Authorization header),
// so this route is NOT behind requireAuth — the userId travels in `state`.
router.get('/oauth/callback', calendarController.callback);

module.exports = router;
