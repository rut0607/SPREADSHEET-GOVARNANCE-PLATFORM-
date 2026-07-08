const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');
const { notifyAdmins } = require('../services/pushService');
const XLSX = require('xlsx');

const DOWNTIME_CATEGORIES = {
  'Machine Issues': ['Machine Breakdown', 'Routine Maintenance', 'Electrical Fault', 'Mechanical Fault'],
  'Material Issues': ['Raw Material Shortage', 'Material Quality Rejection', 'Waiting for Material'],
  'Power Issues': ['Power Cut', 'Load Shedding', 'Generator Failure'],
  'Operational Issues': ['Operator Absent', 'Shift Change Delay', 'Safety Inspection'],
  Other: ['Other']
};

const MIN_DURATION_HOURS = 0.5;
const MAX_DURATION_HOURS = 12;

const machineNameOf = (row) => row?.data?.machine_no || row?.row_identifier || 'a machine';

const submitDowntime = async (req, res) => {
  try {
    const { row_id, worksheet_id, downtime_date, category, reason, custom_reason, duration_hours, shift, notes } = req.body;

    if (!row_id || !worksheet_id || !downtime_date || !category || !reason || duration_hours === undefined) {
      return res.status(400).json({
        success: false,
        message: 'row_id, worksheet_id, downtime_date, category, reason and duration_hours are required'
      });
    }

    if (!Object.prototype.hasOwnProperty.call(DOWNTIME_CATEGORIES, category)) {
      return res.status(400).json({
        success: false,
        message: `Invalid category. Must be one of: ${Object.keys(DOWNTIME_CATEGORIES).join(', ')}`
      });
    }

    if (!DOWNTIME_CATEGORIES[category].includes(reason)) {
      return res.status(400).json({
        success: false,
        message: `Invalid reason for category "${category}". Must be one of: ${DOWNTIME_CATEGORIES[category].join(', ')}`
      });
    }

    if (category === 'Other' && !custom_reason?.trim()) {
      return res.status(400).json({ success: false, message: 'custom_reason is required when category is Other' });
    }

    const parsedDuration = parseFloat(duration_hours);
    if (isNaN(parsedDuration) || parsedDuration < MIN_DURATION_HOURS || parsedDuration > MAX_DURATION_HOURS) {
      return res.status(400).json({
        success: false,
        message: `duration_hours must be between ${MIN_DURATION_HOURS} and ${MAX_DURATION_HOURS}`
      });
    }

    const assignment = await prisma.machineAssignment.findFirst({
      where: { employee_id: req.user.id, row_id, is_active: true }
    });

    if (!assignment) {
      return res.status(403).json({ success: false, message: 'You are not assigned to this machine' });
    }

    const row = await prisma.rowData.findUnique({ where: { id: row_id } });
    if (!row) {
      return res.status(404).json({ success: false, message: 'Machine row not found' });
    }

    const normalizedShift = (shift || 'day').toLowerCase() === 'night' ? 'night' : 'day';

    const downtime = await prisma.machineDowntime.create({
      data: {
        employee_id: req.user.id,
        row_id,
        worksheet_id,
        downtime_date: new Date(`${downtime_date}T00:00:00.000Z`),
        category,
        reason,
        custom_reason: category === 'Other' ? custom_reason : null,
        duration_hours: parsedDuration,
        shift: normalizedShift,
        notes: notes || null,
        status: 'submitted'
      }
    });

    const machineName = machineNameOf(row);
    const reasonLabel = category === 'Other' ? custom_reason : reason;

    const admins = await prisma.userProfile.findMany({
      where: { is_admin: true, is_active: true },
      select: { id: true }
    });

    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map((admin) => ({
          user_id: admin.id,
          title: 'Machine Downtime Logged',
          message: `${req.user.full_name} logged ${parsedDuration}h of downtime on ${machineName} — ${category}: ${reasonLabel}.`,
          type: 'warning'
        }))
      });
    }

    notifyAdmins({
      title: 'Machine Downtime Logged',
      body: `${req.user.full_name} logged ${parsedDuration}h downtime on ${machineName} (${category}: ${reasonLabel}).`
    }).catch(() => {});

    res.status(201).json({ success: true, message: 'Downtime logged successfully', data: { downtime } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Submit downtime error:', error);
    res.status(500).json({ success: false, message: 'Failed to log downtime' });
  }
};

const getMyDowntime = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const records = await prisma.machineDowntime.findMany({
      where: { employee_id: req.user.id, downtime_date: { gte: thirtyDaysAgo } },
      include: {
        row: { select: { id: true, row_identifier: true, data: true } },
        worksheet: { select: { id: true, name: true, display_name: true } }
      },
      orderBy: { downtime_date: 'desc' }
    });

    res.json({ success: true, data: { records } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get my downtime error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch downtime records' });
  }
};

const getDailyDowntimeReport = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ success: false, message: 'date query parameter is required' });
    }

    const targetDate = new Date(`${date}T00:00:00.000Z`);
    const records = await prisma.machineDowntime.findMany({
      where: { downtime_date: targetDate },
      include: {
        employee: { select: { id: true, full_name: true } },
        row: { select: { id: true, row_identifier: true, data: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const categories = {};
    for (const category of Object.keys(DOWNTIME_CATEGORIES)) categories[category] = [];

    let totalHours = 0;
    for (const record of records) {
      const entry = {
        id: record.id,
        employee_name: record.employee.full_name,
        machine_name: machineNameOf(record.row),
        row_id: record.row_id,
        category: record.category,
        reason: record.category === 'Other' ? record.custom_reason : record.reason,
        duration_hours: parseFloat(record.duration_hours),
        shift: record.shift,
        status: record.status
      };
      if (!categories[record.category]) categories[record.category] = [];
      categories[record.category].push(entry);
      totalHours += entry.duration_hours;
    }

    res.json({
      success: true,
      data: {
        date,
        categories,
        total_records: records.length,
        total_hours: parseFloat(totalHours.toFixed(2))
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get daily downtime report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch daily downtime report' });
  }
};

const getDowntimeSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate query parameters are required' });
    }

    const records = await prisma.machineDowntime.findMany({
      where: {
        downtime_date: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T23:59:59.999Z`)
        }
      },
      include: {
        row: { select: { id: true, row_identifier: true, data: true } },
        employee: { select: { id: true, full_name: true } }
      },
      orderBy: { downtime_date: 'desc' }
    });

    const byMachine = new Map();
    const byCategory = new Map();
    const byReason = new Map();
    const byDay = new Map();
    let totalHours = 0;

    for (const record of records) {
      const hours = parseFloat(record.duration_hours);
      totalHours += hours;

      const machineName = machineNameOf(record.row);
      byMachine.set(machineName, (byMachine.get(machineName) || 0) + hours);

      byCategory.set(record.category, (byCategory.get(record.category) || 0) + hours);

      const reasonLabel = record.category === 'Other' ? (record.custom_reason || 'Other') : record.reason;
      byReason.set(reasonLabel, (byReason.get(reasonLabel) || 0) + 1);

      const dayKey = record.downtime_date.toISOString().split('T')[0];
      byDay.set(dayKey, (byDay.get(dayKey) || 0) + hours);
    }

    const machinesSorted = Array.from(byMachine.entries())
      .map(([machine_name, total_hours]) => ({ machine_name, total_hours: parseFloat(total_hours.toFixed(2)) }))
      .sort((a, b) => b.total_hours - a.total_hours);

    const categoriesSorted = Array.from(byCategory.entries())
      .map(([category, total_hours]) => ({ category, total_hours: parseFloat(total_hours.toFixed(2)) }))
      .sort((a, b) => b.total_hours - a.total_hours);

    const mostCommonReason = Array.from(byReason.entries()).sort((a, b) => b[1] - a[1])[0];
    const dayWithMostDowntime = Array.from(byDay.entries()).sort((a, b) => b[1] - a[1])[0];

    const recordList = records.map(r => ({
      id: r.id,
      date: r.downtime_date.toISOString().split('T')[0],
      employee_id: r.employee.id,
      employee_name: r.employee.full_name,
      row_id: r.row_id,
      machine_name: machineNameOf(r.row),
      category: r.category,
      reason: r.category === 'Other' ? (r.custom_reason || 'Other') : r.reason,
      duration_hours: parseFloat(r.duration_hours),
      shift: r.shift,
      status: r.status,
      notes: r.notes
    }));

    res.json({
      success: true,
      data: {
        startDate,
        endDate,
        total_hours: parseFloat(totalHours.toFixed(2)),
        total_records: records.length,
        by_machine: machinesSorted,
        by_category: categoriesSorted,
        most_common_reason: mostCommonReason ? { reason: mostCommonReason[0], count: mostCommonReason[1] } : null,
        day_with_most_downtime: dayWithMostDowntime ? { date: dayWithMostDowntime[0], total_hours: parseFloat(dayWithMostDowntime[1].toFixed(2)) } : null,
        machines_with_most_downtime: machinesSorted.slice(0, 5),
        records: recordList
      }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get downtime summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch downtime summary' });
  }
};

const resolveDowntime = async (req, res) => {
  try {
    const { id } = req.params;
    const { resolution_notes } = req.body;

    const record = await prisma.machineDowntime.findUnique({ where: { id } });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Downtime record not found' });
    }

    const updated = await prisma.machineDowntime.update({
      where: { id },
      data: { status: 'resolved', resolution_notes: resolution_notes || null }
    });

    res.json({ success: true, message: 'Downtime record resolved successfully', data: { downtime: updated } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Resolve downtime error:', error);
    res.status(500).json({ success: false, message: 'Failed to resolve downtime record' });
  }
};

const exportDowntimeExcel = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate query parameters are required' });
    }

    const records = await prisma.machineDowntime.findMany({
      where: {
        downtime_date: {
          gte: new Date(`${startDate}T00:00:00.000Z`),
          lte: new Date(`${endDate}T23:59:59.999Z`)
        }
      },
      include: {
        row: { select: { row_identifier: true, data: true } },
        employee: { select: { full_name: true } }
      },
      orderBy: { downtime_date: 'asc' }
    });

    const rows = records.map(r => ({
      Date: r.downtime_date.toISOString().split('T')[0],
      Employee: r.employee.full_name,
      Machine: machineNameOf(r.row),
      Category: r.category,
      Reason: r.category === 'Other' ? (r.custom_reason || 'Other') : r.reason,
      'Duration (hrs)': parseFloat(r.duration_hours),
      Shift: r.shift,
      Status: r.status,
      Notes: r.notes || ''
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), 'Downtime Log');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=downtime_log_${startDate}_to_${endDate}.xlsx`);
    res.send(buffer);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Export downtime Excel error:', error);
    res.status(500).json({ success: false, message: 'Failed to export downtime log' });
  }
};

module.exports = {
  DOWNTIME_CATEGORIES,
  submitDowntime,
  getMyDowntime,
  getDailyDowntimeReport,
  getDowntimeSummary,
  resolveDowntime,
  exportDowntimeExcel
};
