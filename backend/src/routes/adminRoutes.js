const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');

router.use(requireAuth, requireRole('ADMIN'));

router.post('/doctors', adminController.createDoctor);
router.get('/doctors', adminController.listDoctors);
router.patch('/doctors/:doctorId', adminController.updateDoctor);
router.post('/doctors/:doctorId/leave', adminController.setDoctorLeave);

module.exports = router;
