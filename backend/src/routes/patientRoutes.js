const express = require('express');
const router = express.Router();
const patientController = require('../controllers/patientController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Doctor search is open to any logged-in patient; listing itself has no PHI.
router.get('/doctors', requireAuth, requireRole('PATIENT'), patientController.searchDoctors);
router.get('/doctors/:doctorId/slots', requireAuth, requireRole('PATIENT'), patientController.getSlots);

router.post('/appointments/hold', requireAuth, requireRole('PATIENT'), patientController.holdSlot);
router.post('/appointments/:appointmentId/symptoms', requireAuth, requireRole('PATIENT'), patientController.submitSymptoms);
router.post('/appointments/:appointmentId/confirm', requireAuth, requireRole('PATIENT'), patientController.confirmAppointment);
router.get('/appointments', requireAuth, requireRole('PATIENT'), patientController.myAppointments);
router.post('/appointments/:appointmentId/cancel', requireAuth, requireRole('PATIENT'), patientController.cancelAppointment);

module.exports = router;
