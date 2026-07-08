const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');
const cache = require('../services/cacheService');

const getAllRoles = async (req, res) => {
  try {
    const cacheKey = 'roles:all';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: { roles: cached }, cached: true });
    }

    const roles = await prisma.role.findMany({
      orderBy: { created_at: 'desc' }
    });

    cache.set(cacheKey, roles, 600);
    res.json({ success: true, data: { roles } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get all roles error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch roles' });
  }
};

const createRole = async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Role name is required' });
    }
    if (name.length > 100) {
      return res.status(400).json({ success: false, message: 'Role name must not exceed 100 characters' });
    }

    const existing = await prisma.role.findUnique({ where: { name } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'Role with this name already exists' });
    }

    const role = await prisma.role.create({
      data: { name, description, is_active: true }
    });

    cache.del('roles:all');
    res.status(201).json({ success: true, message: 'Role created successfully', data: { role } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Create role error:', error);
    res.status(500).json({ success: false, message: 'Failed to create role' });
  }
};

const updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, is_active } = req.body;

    const role = await prisma.role.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(is_active !== undefined && { is_active })
      }
    });

    cache.del('roles:all');
    res.json({ success: true, message: 'Role updated successfully', data: { role } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Update role error:', error);
    res.status(500).json({ success: false, message: 'Failed to update role' });
  }
};

const deleteRole = async (req, res) => {
  try {
    const { id } = req.params;

    const usersWithRole = await prisma.userProfile.count({ where: { role_id: id } });

    if (usersWithRole > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete role. ${usersWithRole} user(s) are assigned to this role.`
      });
    }

    await prisma.role.delete({ where: { id } });
    cache.del('roles:all');

    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Delete role error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete role' });
  }
};

module.exports = { getAllRoles, createRole, updateRole, deleteRole };