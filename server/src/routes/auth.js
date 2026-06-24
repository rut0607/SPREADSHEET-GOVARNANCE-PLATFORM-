const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  login,
  logout,
  getMe,
  refreshToken,
  resetPasswordRequest
} = require('../controllers/authController');

router.post('/login', login);
router.post('/logout', authenticate, logout);
router.get('/me', authenticate, getMe);
router.post('/refresh', refreshToken);
router.post('/reset-password', resetPasswordRequest);

module.exports = router;