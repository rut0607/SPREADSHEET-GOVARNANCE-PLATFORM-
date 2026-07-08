const prisma = require('../config/prisma');
const { handlePrismaError } = require('../utils/prismaErrorHandler');
const XLSX = require('xlsx');
const { generateAndSaveWeeklyReport } = require('../services/weeklyReportService');

const getWeeklyReports = async (req, res) => {
  try {
    const reports = await prisma.weeklyReport.findMany({
      orderBy: { week_start: 'desc' },
      select: {
        id: true,
        week_start: true,
        week_end: true,
        generated_at: true,
        report_data: true
      }
    });

    const summaries = reports.map((report) => ({
      id: report.id,
      week_start: report.week_start,
      week_end: report.week_end,
      generated_at: report.generated_at,
      overall: report.report_data?.overall || null
    }));

    res.json({ success: true, data: { reports: summaries } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get weekly reports error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch weekly reports' });
  }
};

const getWeeklyReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await prisma.weeklyReport.findUnique({ where: { id } });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Weekly report not found' });
    }

    res.json({ success: true, data: { report } });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Get weekly report error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch weekly report' });
  }
};

const generateReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ success: false, message: 'startDate and endDate are required' });
    }

    const weekStart = new Date(`${startDate}T00:00:00.000Z`);
    const weekEnd = new Date(`${endDate}T00:00:00.000Z`);

    if (isNaN(weekStart.getTime()) || isNaN(weekEnd.getTime()) || weekStart > weekEnd) {
      return res.status(400).json({ success: false, message: 'Invalid date range' });
    }

    const report = await generateAndSaveWeeklyReport(weekStart, weekEnd);

    res.status(201).json({
      success: true,
      message: 'Report generated successfully',
      data: { report }
    });
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Generate report error:', error);
    res.status(500).json({ success: false, message: 'Failed to generate report' });
  }
};

const exportWeeklyReport = async (req, res) => {
  try {
    const { id } = req.params;
    const report = await prisma.weeklyReport.findUnique({ where: { id } });

    if (!report) {
      return res.status(404).json({ success: false, message: 'Weekly report not found' });
    }

    const { overall, machines, employees } = report.report_data;

    const overviewRows = [{
      'Week Start': report.report_data.week_start,
      'Week End': report.report_data.week_end,
      'Total Entries': overall?.total_entries ?? '',
      'Average OE %': overall?.average_oe ?? '',
      'Total Machines': overall?.total_machines ?? '',
      'Total Employees': overall?.total_employees ?? ''
    }];

    const machineRows = (machines || []).map((m) => ({
      Machine: m.machine_name,
      Process: m.process_type,
      'Total Entries': m.total_entries,
      'Average OE %': m.average_oe ?? '',
      'Best Day': m.best_day ? `${m.best_day.date} (${m.best_day.oe_percentage}%)` : '',
      'Worst Day': m.worst_day ? `${m.worst_day.date} (${m.worst_day.oe_percentage}%)` : '',
      Trend: m.trend,
      'Trend Delta': m.trend_delta ?? ''
    }));

    const employeeRows = (employees || []).map((e) => ({
      Employee: e.employee_name,
      'Machines Covered': e.machines_covered,
      'Average OE %': e.average_oe ?? '',
      'Submission Rate %': e.submission_rate,
      'Days Below Threshold': e.days_below_threshold
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(overviewRows), 'Overview');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(machineRows), 'Machines');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(employeeRows), 'Employees');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=weekly_report_${report.report_data.week_start}_to_${report.report_data.week_end}.xlsx`);
    res.send(buffer);
  } catch (error) {
    if (handlePrismaError(error, res)) return;
    console.error('Export weekly report error:', error);
    res.status(500).json({ success: false, message: 'Failed to export weekly report' });
  }
};

module.exports = { getWeeklyReports, getWeeklyReport, generateReport, exportWeeklyReport };
