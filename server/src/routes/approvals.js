const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  createApprovalRequest,
  getPendingApprovals,
  getAllApprovals,
  reviewApproval
} = require('../controllers/approvalController');

router.post('/', authenticate, createApprovalRequest);
router.get('/pending', authenticate, requireAdmin, getPendingApprovals);
router.get('/', authenticate, getAllApprovals);
router.put('/:id/review', authenticate, requireAdmin, reviewApproval);

module.exports = router;