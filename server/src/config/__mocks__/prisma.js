const mockModel = () => ({
  findUnique: jest.fn(),
  findMany: jest.fn(),
  findFirst: jest.fn(),
  create: jest.fn(),
  createMany: jest.fn(),
  update: jest.fn(),
  updateMany: jest.fn(),
  delete: jest.fn(),
  deleteMany: jest.fn(),
  count: jest.fn()
});

module.exports = {
  userProfile: mockModel(),
  role: mockModel(),
  spreadsheetSource: mockModel(),
  spreadsheetVersion: mockModel(),
  worksheet: mockModel(),
  columnDefinition: mockModel(),
  rowData: mockModel(),
  rolePermission: mockModel(),
  userPermission: mockModel(),
  approvalRequest: mockModel(),
  auditLog: mockModel(),
  notification: mockModel(),
  $queryRaw: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  connectWithRetry: jest.fn()
};
