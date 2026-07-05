jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const request = require('supertest');
const app = require('../../index');
const prisma = require('../../config/prisma');
const { supabaseAdmin } = require('../../config/supabase');

describe('POST /api/approvals', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates an approval request for an authenticated user with valid data', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    prisma.userProfile.findUnique.mockResolvedValue({
      id: 'user-1', full_name: 'Jane', email: 'jane@example.com',
      is_admin: false, is_active: true, role: null
    });
    prisma.approvalRequest.create.mockResolvedValue({
      id: 'appr-1',
      requester: { id: 'user-1', full_name: 'Jane', email: 'jane@example.com' },
      worksheet: { id: 'ws-1', name: 'Sheet1' },
      column: { id: 'col-1', display_name: 'Salary' }
    });
    prisma.userProfile.findMany.mockResolvedValue([{ id: 'admin-1' }]);
    prisma.notification.createMany.mockResolvedValue({ count: 1 });

    const res = await request(app)
      .post('/api/approvals')
      .set('Authorization', 'Bearer valid-token')
      .send({
        worksheet_id: 'ws-1',
        row_id: 'row-1',
        column_id: 'col-1',
        previous_value: '1000',
        requested_value: '2000'
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approval.id).toBe('appr-1');
    expect(prisma.approvalRequest.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        requested_by: 'user-1',
        worksheet_id: 'ws-1',
        row_id: 'row-1',
        column_id: 'col-1',
        requested_value: '2000'
      })
    }));
  });
});
