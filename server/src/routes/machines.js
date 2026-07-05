const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  assignMachine,
  unassignMachine,
  getEmployeeAssignments,
  getAllAssignments,
  setEfficiencyThreshold,
  getEfficiencyThresholds
} = require('../controllers/machineController');

router.post('/assign', authenticate, requireAdmin, assignMachine);
router.delete('/assign/:id', authenticate, requireAdmin, unassignMachine);
router.get('/assignments', authenticate, requireAdmin, getAllAssignments);
router.get('/employee/:employeeId', authenticate, getEmployeeAssignments);
router.post('/threshold', authenticate, requireAdmin, setEfficiencyThreshold);
router.get('/thresholds', authenticate, getEfficiencyThresholds);

module.exports = router;
