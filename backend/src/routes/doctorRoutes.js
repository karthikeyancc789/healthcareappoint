const express = require('express');
const router = express.Router();
const doctorController = require('../controllers/doctorController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('DOCTOR'));

router.get('/profile', doctorController.getMyProfile);
router.get('/appointments', doctorController.myAppointments);
router.get('/appointments/:appointmentId/pre-visit-summary', doctorController.getPreVisitSummary);
router.post('/appointments/:appointmentId/visit-notes', doctorController.submitVisitNotes);

router.put('/me/working-hours', doctorController.updateMyWorkingHours);
router.put('/:doctorId/working-hours', doctorController.updateWorkingHours);
module.exports = router;
