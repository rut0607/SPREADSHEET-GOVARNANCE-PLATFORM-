const express = require('express');
const router = express.Router();
const { authenticate, requireAdmin } = require('../middleware/auth');
const {
  getRolePermissions,
  setRolePermissions,
  getUserPermissions,
  setUserPermissions,
  getEffectivePermissions
} = require('../controllers/permissionController');

router.get('/role/:roleId', authenticate, requireAdmin, getRolePermissions);
router.post('/role/:roleId', authenticate, requireAdmin, setRolePermissions);
router.get('/user/:userId', authenticate, requireAdmin, getUserPermissions);
router.post('/user/:userId', authenticate, requireAdmin, setUserPermissions);
router.get('/effective/:userId/worksheet/:worksheetId', authenticate, getEffectivePermissions);

module.exports = router;