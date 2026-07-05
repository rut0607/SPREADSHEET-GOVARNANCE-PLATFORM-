jest.mock('../../config/prisma');
jest.mock('../../config/supabase');

const prisma = require('../../config/prisma');
const { reviewApproval } = require('../../controllers/approvalController');

const mockRes = () => ({
  json: jest.fn(),
  status: jest.fn().mockReturnThis()
});

describe('reviewApproval - status validation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects a status other than "approved" or "rejected" with a 400', async () => {
    const req = { params: { id: 'appr-1' }, body: { status: 'deleted' }, user: { id: 'admin-1' } };
    const res = mockRes();

    await reviewApproval(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Status must be approved or rejected'
    });
    // Validation should fail before ever touching the database.
    expect(prisma.approvalRequest.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a missing status with a 400', async () => {
    const req = { params: { id: 'appr-1' }, body: {}, user: { id: 'admin-1' } };
    const res = mockRes();

    await reviewApproval(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Status must be approved or rejected'
    });
  });

  it('accepts "approved" as valid and proceeds past status validation', async () => {
    prisma.approvalRequest.findUnique.mockResolvedValue(null);
    const req = { params: { id: 'appr-1' }, body: { status: 'approved' }, user: { id: 'admin-1' } };
    const res = mockRes();

    await reviewApproval(req, res);

    // Reaches the "not found" branch rather than being blocked by status validation.
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Approval request not found' });
  });

  it('accepts "rejected" as valid and proceeds past status validation', async () => {
    prisma.approvalRequest.findUnique.mockResolvedValue(null);
    const req = { params: { id: 'appr-1' }, body: { status: 'rejected' }, user: { id: 'admin-1' } };
    const res = mockRes();

    await reviewApproval(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Approval request not found' });
  });
});
