const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('DOCTOR'));

router.get('/appointments', doctorController.myAppointments);
router.get('/appointments/:appointmentId/pre-visit-summary', doctorController.getPreVisitSummary);
router.post('/appointments/:appointmentId/visit-notes', doctorController.submitVisitNotes);

module.exports = router;
