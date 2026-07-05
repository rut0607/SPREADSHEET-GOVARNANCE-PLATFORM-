jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const request = require('supertest');
const app = require('../../index');
const prisma = require('../../config/prisma');
const { supabaseAdmin } = require('../../config/supabase');
const cache = require('../../services/cacheService');

describe('PUT /api/spreadsheets/row/:rowId', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('updates the row via the controller (not a duplicate inline handler) and invalidates the worksheet cache', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    prisma.userProfile.findUnique.mockResolvedValue({
      id: 'user-1', full_name: 'Jane', email: 'jane@example.com',
      is_admin: false, is_active: true, role: null
    });
    prisma.rowData.findUnique.mockResolvedValue({ id: 'row-1', worksheet_id: 'ws-1', data: { name: 'old' } });
    prisma.rowData.update.mockResolvedValue({ id: 'row-1', worksheet_id: 'ws-1', data: { name: 'new' } });
    prisma.auditLog.create.mockResolvedValue({});

    const delPatternSpy = jest.spyOn(cache, 'delPattern');

    const res = await request(app)
      .put('/api/spreadsheets/row/row-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ data: { name: 'new' }, column_id: 'col-1', previous_value: 'old', new_value: 'new' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      success: true,
      message: 'Row updated successfully',
      data: { row: { id: 'row-1', worksheet_id: 'ws-1', data: { name: 'new' } } }
    });
    // The controller's updateRow invalidates the worksheet cache; the old inline
    // route handler did not, so this specifically guards against re-introducing
    // that duplicate/incomplete version.
    expect(delPatternSpy).toHaveBeenCalledWith('worksheet:ws-1');

    delPatternSpy.mockRestore();
  });

  it('rejects an empty data object with a 400 before touching the database', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    prisma.userProfile.findUnique.mockResolvedValue({
      id: 'user-1', full_name: 'Jane', email: 'jane@example.com',
      is_admin: false, is_active: true, role: null
    });

    const res = await request(app)
      .put('/api/spreadsheets/row/row-1')
      .set('Authorization', 'Bearer valid-token')
      .send({ data: {} });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ success: false, message: 'data must be a non-empty object' });
    expect(prisma.rowData.findUnique).not.toHaveBeenCalled();
  });
});
