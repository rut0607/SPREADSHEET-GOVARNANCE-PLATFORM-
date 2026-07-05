const { supabaseAdmin } = require('../config/supabase');
const prisma = require('../config/prisma');

const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.userProfile.findMany({
      include: { role: true },
      orderBy: { created_at: 'desc' }
    });
    res.json({ success: true, data: { users } });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch users' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await prisma.userProfile.findUnique({
      where: { id },
      include: { role: true }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: { user } });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user' });
  }
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const createUser = async (req, res) => {
  try {
    const { full_name, email, password, role_id, is_admin } = req.body;

    if (!full_name || !full_name.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }
    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ success: false, message: 'A valid email address is required' });
    }
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (authError) return res.status(400).json({ success: false, message: authError.message });
    const userProfile = await prisma.userProfile.create({
      data: {
        id: authData.user.id,
        full_name,
        email,
        role_id: role_id || null,
        is_admin: is_admin || false,
        is_active: true
      },
      include: { role: true }
    });
    res.status(201).json({ success: true, message: 'User created successfully', data: { user: userProfile } });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Failed to create user' });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, role_id, is_active, is_admin } = req.body;
    const userProfile = await prisma.userProfile.update({
      where: { id },
      data: {
        ...(full_name && { full_name }),
        ...(role_id !== undefined && { role_id }),
        ...(is_active !== undefined && { is_active }),
        ...(is_admin !== undefined && { is_admin })
      },
      include: { role: true }
    });
    res.json({ success: true, message: 'User updated successfully', data: { user: userProfile } });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user' });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, { password: new_password });
    if (error) return res.status(400).json({ success: false, message: error.message });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Failed to reset password' });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ success: false, message: 'Cannot delete your own account' });
    }
    await prisma.userProfile.delete({ where: { id } });
    await supabaseAdmin.auth.admin.deleteUser(id);
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete user' });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  resetUserPassword,
  deleteUser
};
