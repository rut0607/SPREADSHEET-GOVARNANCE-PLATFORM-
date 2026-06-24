const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  getAllUsers,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser,
  getUserById
} = require('../controllers/userController');

router.get('/', authenticate, requireAdmin, getAllUsers);
router.post('/', authenticate, requireAdmin, createUser);
router.get('/:id', authenticate, requireAdmin, getUserById);
router.put('/:id', authenticate, requireAdmin, updateUser);
router.post('/:id/reset-password', authenticate, requireAdmin, resetUserPassword);
router.delete('/:id', authenticate, requireAdmin, deleteUser);

module.exports = router;