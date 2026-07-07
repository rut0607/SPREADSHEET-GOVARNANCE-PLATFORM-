const prisma = require('../config/prisma');

const assignMachine = async (req, res) => {
  try {
    const { employee_id, row_id, worksheet_id } = req.body;

    if (!employee_id || !row_id || !worksheet_id) {
      return res.status(400).json({
        success: false,
        message: 'employee_id, row_id and worksheet_id are required'
      });
    }

    const existing = await prisma.machineAssignment.findFirst({
      where: { employee_id, row_id, is_active: true }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: 'This machine is already assigned to this employee'
      });
    }

    const assignment = await prisma.machineAssignment.create({
      data: {
        employee_id,
        row_id,
        worksheet_id,
        assigned_by: req.user.id,
        is_active: true
      },
      include: {
        employee: { select: { id: true, full_name: true, email: true } },
        row: { select: { id: true, row_identifier: true, data: true } },
        worksheet: { select: { id: true, name: true, display_name: true } }
      }
    });

    res.status(201).json({
      success: true,
      message: 'Machine assigned successfully',
      data: { assignment }
    });
  } catch (error) {
    console.error('Assign machine error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign machine' });
  }
};

const unassignMachine = async (req, res) => {
  try {
    const { id } = req.params;

    const assignment = await prisma.machineAssignment.findUnique({ where: { id } });
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    await prisma.machineAssignment.update({
      where: { id },
      data: { is_active: false }
    });

    res.json({ success: true, message: 'Machine unassigned successfully' });
  } catch (error) {
    console.error('Unassign machine error:', error);
    res.status(500).json({ success: false, message: 'Failed to unassign machine' });
  }
};

const getEmployeeAssignments = async (req, res) => {
  try {
    const { employeeId } = req.params;

    if (!req.user.is_admin && req.user.id !== employeeId) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const assignments = await prisma.machineAssignment.findMany({
      where: { employee_id: employeeId, is_active: true },
      include: {
        row: { select: { id: true, row_identifier: true, data: true } },
        worksheet: {
          select: {
            id: true,
            name: true,
            display_name: true,
            column_definitions: { where: { is_active: true }, orderBy: { column_index: 'asc' } }
          }
        }
      },
      orderBy: { created_at: 'desc' }
    });

    const seenRowIds = new Set();
    const dedupedAssignments = assignments.filter(assignment => {
      if (seenRowIds.has(assignment.row_id)) return false;
      seenRowIds.add(assignment.row_id);
      return true;
    });

    res.json({ success: true, data: { assignments: dedupedAssignments } });
  } catch (error) {
    console.error('Get employee assignments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch employee assignments' });
  }
};

const getAllAssignments = async (req, res) => {
  try {
    const assignments = await prisma.machineAssignment.findMany({
      where: { is_active: true },
      include: {
        employee: { select: { id: true, full_name: true, email: true, role: { select: { name: true } } } },
        row: { select: { id: true, row_identifier: true, data: true } },
        worksheet: { select: { id: true, name: true, display_name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    const grouped = {};
    for (const assignment of assignments) {
      const key = assignment.employee.id;
      if (!grouped[key]) {
        grouped[key] = {
          employee: assignment.employee,
          machines: [],
          seenRowIds: new Set()
        };
      }

      if (grouped[key].seenRowIds.has(assignment.row_id)) continue;
      grouped[key].seenRowIds.add(assignment.row_id);

      grouped[key].machines.push({
        assignment_id: assignment.id,
        row: assignment.row,
        worksheet: assignment.worksheet,
        created_at: assignment.created_at
      });
    }

    const dedupedAssignments = Object.values(grouped).map(({ employee, machines }) => ({ employee, machines }));

    res.json({ success: true, data: { assignments: dedupedAssignments } });
  } catch (error) {
    console.error('Get all assignments error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assignments' });
  }
};

const setEfficiencyThreshold = async (req, res) => {
  try {
    const { worksheet_id, process_type, min_threshold, alert_enabled } = req.body;

    if (!worksheet_id || !process_type) {
      return res.status(400).json({
        success: false,
        message: 'worksheet_id and process_type are required'
      });
    }

    const threshold = await prisma.efficiencyThreshold.upsert({
      where: {
        worksheet_id_process_type: { worksheet_id, process_type }
      },
      update: {
        min_threshold: min_threshold !== undefined ? min_threshold : undefined,
        alert_enabled: alert_enabled !== undefined ? alert_enabled : undefined
      },
      create: {
        worksheet_id,
        process_type,
        min_threshold: min_threshold !== undefined ? min_threshold : 85.00,
        alert_enabled: alert_enabled !== undefined ? alert_enabled : true,
        created_by: req.user.id
      }
    });

    res.json({
      success: true,
      message: 'Efficiency threshold saved successfully',
      data: { threshold }
    });
  } catch (error) {
    console.error('Set efficiency threshold error:', error);
    res.status(500).json({ success: false, message: 'Failed to save efficiency threshold' });
  }
};

const getEfficiencyThresholds = async (req, res) => {
  try {
    const thresholds = await prisma.efficiencyThreshold.findMany({
      include: {
        worksheet: { select: { id: true, name: true, display_name: true } },
        creator: { select: { id: true, full_name: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    res.json({ success: true, data: { thresholds } });
  } catch (error) {
    console.error('Get efficiency thresholds error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch efficiency thresholds' });
  }
};

module.exports = {
  assignMachine,
  unassignMachine,
  getEmployeeAssignments,
  getAllAssignments,
  setEfficiencyThreshold,
  getEfficiencyThresholds
};
