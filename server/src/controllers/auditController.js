const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');

const CSV_HEADERS = [
  'Date', 'User', 'Role', 'Sheet', 'Field',
  'Previous Value', 'New Value', 'Status', 'Review Notes'
];

const escapeCsvValue = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toCsvRow = (values) => values.map(escapeCsvValue).join(',');

const exportAuditCsv = async (req, res) => {
  try {
    const approvals = await prisma.approvalRequest.findMany({
      include: {
        requester: {
          select: { full_name: true, role: { select: { name: true } } }
        },
        worksheet: { select: { name: true, display_name: true } },
        column: { select: { display_name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const rows = approvals.map((a) => toCsvRow([
      new Date(a.created_at).toISOString(),
      a.requester?.full_name || '',
      a.requester?.role?.name || '',
      a.worksheet?.display_name || a.worksheet?.name || '',
      a.column?.display_name || '',
      a.previous_value || '',
      a.requested_value || '',
      a.status,
      a.review_notes || ''
    ]));

    const csv = [toCsvRow(CSV_HEADERS), ...rows].join('\n');
    const fileName = `audit-log-export-${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.status(200).send(csv);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Audit export error:', error);
    res.status(500).json({ success: false, message: 'Failed to export audit log' });
  }
};

module.exports = { exportAuditCsv };
