const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  getAllRoles,
  createRole,
  updateRole,
  deleteRole
} = require('../controllers/roleController');

router.get('/', authenticate, getAllRoles);
router.post('/', authenticate, requireAdmin, createRole);
router.put('/:id', authenticate, requireAdmin, updateRole);
router.delete('/:id', authenticate, requireAdmin, deleteRole);

module.exports = router;