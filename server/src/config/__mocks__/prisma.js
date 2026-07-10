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

const mockPrisma = {
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
  machineAssignment: mockModel(),
  efficiencyThreshold: mockModel(),
  dailyProductionEntry: mockModel(),
  efficiencyAlert: mockModel(),
  weeklyReport: mockModel(),
  pushSubscription: mockModel(),
  machineDowntime: mockModel(),
  $queryRaw: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  connectWithRetry: jest.fn()
};

// Mirrors Prisma's two $transaction forms: an array of pending queries, or an
// interactive callback receiving the client (here, the same mock instance).
mockPrisma.$transaction = jest.fn((arg) => (
  typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg)
));

module.exports = mockPrisma;
