const { supabaseAdmin } = require('../config/supabase');
const prisma = require('../config/prisma');

const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.split(' ')[1];

    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    const userProfile = await prisma.userProfile.findUnique({
      where: { id: user.id },
      include: { role: true }
    });

    if (!userProfile) {
      return res.status(401).json({
        success: false,
        message: 'User profile not found'
      });
    }

    if (!userProfile.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Account is disabled'
      });
    }

    req.user = userProfile;
    req.token = token;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error'
    });
  }
};

const requireAdmin = async (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({
      success: false,
      message: 'Admin access required'
    });
  }
  next();
};

module.exports = { authenticate, requireAdmin };