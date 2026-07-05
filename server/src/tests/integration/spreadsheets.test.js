jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const request = require('supertest');
const app = require('../../index');
const prisma = require('../../config/prisma');
const { supabaseAdmin } = require('../../config/supabase');
const cache = require('../../services/cacheService');

describe('GET /api/spreadsheets', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cache.flush();
  });

  it('returns spreadsheet sources for a request with a valid token', async () => {
    supabaseAdmin.auth.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    prisma.userProfile.findUnique.mockResolvedValue({
      id: 'user-1', full_name: 'Jane', email: 'jane@example.com',
      is_admin: false, is_active: true, role: null
    });
    prisma.spreadsheetSource.findMany.mockResolvedValue([
      { id: 'src-1', name: 'Payroll', source_type: 'excel', worksheets: [], creator: null }
    ]);

    const res = await request(app)
      .get('/api/spreadsheets')
      .set('Authorization', 'Bearer valid-token');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sources).toHaveLength(1);
    expect(res.body.data.sources[0].name).toBe('Payroll');
  });
});
