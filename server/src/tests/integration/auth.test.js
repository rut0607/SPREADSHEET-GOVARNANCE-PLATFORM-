jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const request = require('supertest');
const app = require('../../index');
const prisma = require('../../config/prisma');
const { supabaseAdmin } = require('../../config/supabase');

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('logs in successfully with valid credentials', async () => {
    supabaseAdmin.auth.signInWithPassword.mockResolvedValue({
      data: {
        user: { id: 'user-1' },
        session: { access_token: 'tok-abc', refresh_token: 'refresh-abc' }
      },
      error: null
    });
    prisma.userProfile.findUnique.mockResolvedValue({
      id: 'user-1',
      full_name: 'Jane Admin',
      email: 'jane@example.com',
      role: { id: 'role-1', name: 'Admin' },
      is_admin: true,
      is_active: true
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jane@example.com', password: 'correct-password' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBe('tok-abc');
    expect(res.body.data.user.email).toBe('jane@example.com');
  });

  it('rejects invalid credentials with a 401', async () => {
    supabaseAdmin.auth.signInWithPassword.mockResolvedValue({
      data: null,
      error: { message: 'Invalid login credentials' }
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'jane@example.com', password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ success: false, message: 'Invalid email or password' });
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });
});
