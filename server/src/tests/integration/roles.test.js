jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const request = require('supertest');
const app = require('../../index');
const prisma = require('../../config/prisma');
const { supabaseAdmin } = require('../../config/supabase');
const cache = require('../../services/cacheService');

describe('GET /api/roles', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.flush();
  });

  it('returns 401 when no token is provided', async () => {
    const res = await request(app).get('/api/roles');

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'No token provided' });
  });

  it('returns roles for a request with a valid token', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    prisma.userProfile.findUnique.mockResolvedValue({
      id: 'user-1', full_name: 'Jane', email: 'jane@example.com',
      is_admin: false, is_active: true, role: null
    });
    prisma.role.findMany.mockResolvedValue([
      { id: 'role-1', name: 'Quality Control', description: null, is_active: true }
    ]);

    const res = await request(app)
      .get('/api/roles')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.roles).toHaveLength(1);
    expect(res.body.data.roles[0].name).toBe('Quality Control');
  });
});
