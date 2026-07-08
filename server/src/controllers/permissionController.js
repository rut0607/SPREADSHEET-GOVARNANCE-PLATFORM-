const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');
const cache = require('../services/cacheService');

const getRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params;

    const permissions = await prisma.rolePermission.findMany({
      where: { role_id: roleId },
      include: {
        worksheet: { select: { id: true, name: true, display_name: true } },
        column: { select: { id: true, column_key: true, display_name: true, data_type: true } }
      }
    });

    res.json({ success: true, data: { permissions } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get role permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch permissions' });
  }
};

const setRolePermissions = async (req, res) => {
  try {
    const { roleId } = req.params;
    const { permissions } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'Permissions array is required' });
    }

    await prisma.rolePermission.deleteMany({ where: { role_id: roleId } });

    if (permissions.length > 0) {
      await prisma.rolePermission.createMany({
        data: permissions.map(p => ({
          role_id: roleId,
          worksheet_id: p.worksheet_id,
          column_id: p.column_id,
          can_view: p.can_view !== undefined ? p.can_view : true,
          can_edit: p.can_edit !== undefined ? p.can_edit : false,
          requires_approval: p.requires_approval !== undefined ? p.requires_approval : false
        }))
      });
    }

    cache.delPattern('permissions:');

    res.json({ success: true, message: 'Role permissions updated successfully' });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Set role permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to update permissions' });
  }
};

const getUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;

    const permissions = await prisma.userPermission.findMany({
      where: { user_id: userId },
      include: {
        worksheet: { select: { id: true, name: true, display_name: true } },
        column: { select: { id: true, column_key: true, display_name: true, data_type: true } }
      }
    });

    res.json({ success: true, data: { permissions } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get user permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch user permissions' });
  }
};

const setUserPermissions = async (req, res) => {
  try {
    const { userId } = req.params;
    const { permissions } = req.body;

    if (!permissions || !Array.isArray(permissions)) {
      return res.status(400).json({ success: false, message: 'Permissions array is required' });
    }

    await prisma.userPermission.deleteMany({ where: { user_id: userId } });

    if (permissions.length > 0) {
      await prisma.userPermission.createMany({
        data: permissions.map(p => ({
          user_id: userId,
          worksheet_id: p.worksheet_id,
          column_id: p.column_id,
          can_view: p.can_view !== undefined ? p.can_view : true,
          can_edit: p.can_edit !== undefined ? p.can_edit : false,
          requires_approval: p.requires_approval !== undefined ? p.requires_approval : false
        }))
      });
    }

    cache.delPattern('permissions:');

    res.json({ success: true, message: 'User permissions updated successfully' });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Set user permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to update user permissions' });
  }
};

const getEffectivePermissions = async (req, res) => {
  try {
    const { userId, worksheetId } = req.params;
    const cacheKey = `permissions:${userId}:${worksheetId}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: { permissions: cached }, cached: true });
    }

    const user = await prisma.userProfile.findUnique({
      where: { id: userId },
      select: { role_id: true, is_admin: true }
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.is_admin) {
      const columns = await prisma.columnDefinition.findMany({
        where: { worksheet_id: worksheetId, is_active: true },
        orderBy: { column_index: 'asc' }
      });

      const adminPermissions = columns.map(col => ({
        column_id: col.id,
        column_key: col.column_key,
        display_name: col.display_name,
        data_type: col.data_type,
        can_view: true,
        can_edit: true,
        requires_approval: false,
        source: 'admin'
      }));

      cache.set(cacheKey, adminPermissions, 600);
      return res.json({ success: true, data: { permissions: adminPermissions } });
    }

    const rolePermissions = user.role_id ? await prisma.rolePermission.findMany({
      where: { role_id: user.role_id, worksheet_id: worksheetId },
      include: { column: true }
    }) : [];

    const userPermissions = await prisma.userPermission.findMany({
      where: { user_id: userId, worksheet_id: worksheetId },
      include: { column: true }
    });

    const permissionMap = {};

    for (const rp of rolePermissions) {
      permissionMap[rp.column_id] = {
        column_id: rp.column_id,
        column_key: rp.column.column_key,
        display_name: rp.column.display_name,
        data_type: rp.column.data_type,
        can_view: rp.can_view,
        can_edit: rp.can_edit,
        requires_approval: rp.requires_approval,
        source: 'role'
      };
    }

    for (const up of userPermissions) {
      permissionMap[up.column_id] = {
        column_id: up.column_id,
        column_key: up.column.column_key,
        display_name: up.column.display_name,
        data_type: up.column.data_type,
        can_view: up.can_view,
        can_edit: up.can_edit,
        requires_approval: up.requires_approval,
        source: 'user_override'
      };
    }

    const result = Object.values(permissionMap);
    cache.set(cacheKey, result, 300);

    res.json({ success: true, data: { permissions: result } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get effective permissions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch effective permissions' });
  }
};

module.exports = {
  getRolePermissions,
  setRolePermissions,
  getUserPermissions,
  setUserPermissions,
  getEffectivePermissions
};