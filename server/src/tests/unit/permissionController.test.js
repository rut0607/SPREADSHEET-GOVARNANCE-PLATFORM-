jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const prisma = require('../../config/prisma');
const cache = require('../../services/cacheService');
const { getEffectivePermissions } = require('../../controllers/permissionController');

const mockRes = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis()
});

describe('getEffectivePermissions - admin users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.flush();
  });

  it('returns full can_view/can_edit permissions for every active column, bypassing role/user permission tables', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({ role_id: null, is_admin: true });
    prisma.columnDefinition.findMany.mockResolvedValue([
      { id: 'col-1', column_key: 'name', display_name: 'Name', data_type: 'text' },
      { id: 'col-2', column_key: 'salary', display_name: 'Salary', data_type: 'currency' }
    ]);

    const req = { params: { userId: 'admin-1', worksheetId: 'ws-1' } };
    const res = mockRes();

    await getEffectivePermissions(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        permissions: [
          {
            column_id: 'col-1', column_key: 'name', display_name: 'Name', data_type: 'text',
            can_view: true, can_edit: true, requires_approval: false, source: 'admin'
          },
          {
            column_id: 'col-2', column_key: 'salary', display_name: 'Salary', data_type: 'currency',
            can_view: true, can_edit: true, requires_approval: false, source: 'admin'
          }
        ]
      }
    });
    // Admins should never consult role/user permission tables.
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
    expect(prisma.userPermission.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    prisma.userProfile.findUnique.mockResolvedValue(null);

    const req = { params: { userId: 'missing-user', worksheetId: 'ws-1' } };
    const res = mockRes();

    await getEffectivePermissions(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'User not found' });
  });

  it('merges role permissions with user-level overrides for non-admin users', async () => {
    prisma.userProfile.findUnique.mockResolvedValue({ role_id: 'role-1', is_admin: false });
    prisma.rolePermission.findMany.mockResolvedValue([
      {
        column_id: 'col-1',
        can_view: true, can_edit: false, requires_approval: true,
        column: { column_key: 'name', display_name: 'Name', data_type: 'text' }
      }
    ]);
    prisma.userPermission.findMany.mockResolvedValue([
      {
        column_id: 'col-1',
        can_view: true, can_edit: true, requires_approval: false,
        column: { column_key: 'name', display_name: 'Name', data_type: 'text' }
      }
    ]);

    const req = { params: { userId: 'user-1', worksheetId: 'ws-1' } };
    const res = mockRes();

    await getEffectivePermissions(req, res);

    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        permissions: [
          {
            column_id: 'col-1', column_key: 'name', display_name: 'Name', data_type: 'text',
            can_view: true, can_edit: true, requires_approval: false, source: 'user_override'
          }
        ]
      }
    });
  });
});
