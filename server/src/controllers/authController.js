const { supabaseAdmin } = require('../config/supabase');
const prisma = require('../config/prisma');

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password'
      });
    }

    const userProfile = await prisma.userProfile.findUnique({
      where: { id: data.user.id },
      include: { role: true }
    });

    if (!userProfile) {
      return res.status(401).json({
        success: false,
        message: 'User profile not found. Contact administrator.'
      });
    }

    if (!userProfile.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been disabled. Contact administrator.'
      });
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        user: {
          id: userProfile.id,
          full_name: userProfile.full_name,
          email: userProfile.email,
          role: userProfile.role,
          is_admin: userProfile.is_admin,
          is_active: userProfile.is_active
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed. Please try again.'
    });
  }
};

const logout = async (req, res) => {
  try {
    await supabaseAdmin.auth.signOut();
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed'
    });
  }
};

const getMe = async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        user: {
          id: req.user.id,
          full_name: req.user.full_name,
          email: req.user.email,
          role: req.user.role,
          is_admin: req.user.is_admin,
          is_active: req.user.is_active
        }
      }
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get user information'
    });
  }
};

const refreshToken = async (req, res) => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required'
      });
    }

    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token
    });

    if (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    res.json({
      success: true,
      data: {
        token: data.session.access_token,
        refresh_token: data.session.refresh_token
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Token refresh failed'
    });
  }
};

const resetPasswordRequest = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email);

    if (error) {
      return res.status(400).json({
        success: false,
        message: 'Failed to send reset email'
      });
    }

    res.json({
      success: true,
      message: 'Password reset email sent if account exists'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Password reset failed'
    });
  }
};

module.exports = {
  login,
  logout,
  getMe,
  refreshToken,
  resetPasswordRequest
};