const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');

const CSV_HEADERS = [
  'Timestamp', 'User', 'Role', 'Action Type', 'Sheet', 'Field',
  'Previous Value', 'New Value'
];

const escapeCsvValue = (value) => {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const toCsvRow = (values) => values.map(escapeCsvValue).join(',');

// Shared by getAuditLogs and exportAuditCsv so pagination and CSV export always
// reflect the same filtered set.
const buildAuditLogWhereClause = (query) => {
  const where = {};
  if (query.action_type) where.action_type = query.action_type;
  if (query.user_id) where.user_id = query.user_id;
  if (query.startDate || query.endDate) {
    where.created_at = {};
    if (query.startDate) where.created_at.gte = new Date(`${query.startDate}T00:00:00.000Z`);
    if (query.endDate) where.created_at.lte = new Date(`${query.endDate}T23:59:59.999Z`);
  }
  return where;
};

const getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const skip = (page - 1) * limit;

    const where = buildAuditLogWhereClause(req.query);

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        include: {
          user: { select: { id: true, full_name: true, role: { select: { name: true } } } },
          worksheet: { select: { id: true, name: true, display_name: true } },
          column: { select: { id: true, display_name: true } },
          row: { select: { id: true, row_identifier: true } }
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit
      })
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          total,
          page,
          limit,
          total_pages: Math.ceil(total / limit)
        }
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get audit logs error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch audit logs' });
  }
};

const exportAuditCsv = async (req, res) => {
  try {
    const where = buildAuditLogWhereClause(req.query);

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { full_name: true, role: { select: { name: true } } } },
        worksheet: { select: { name: true, display_name: true } },
        column: { select: { display_name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const rows = logs.map((log) => toCsvRow([
      new Date(log.created_at).toISOString(),
      log.user?.full_name || '',
      log.user?.role?.name || '',
      log.action_type,
      log.worksheet?.display_name || log.worksheet?.name || '',
      log.column?.display_name || '',
      log.previous_value || '',
      log.new_value || ''
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

module.exports = { getAuditLogs, exportAuditCsv };
