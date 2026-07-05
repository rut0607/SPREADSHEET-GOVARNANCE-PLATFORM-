const prisma = require('../config/prisma');

const createApprovalRequest = async (req, res) => {
  try {
    const { worksheet_id, row_id, column_id, previous_value, requested_value } = req.body;

    if (!worksheet_id || !String(worksheet_id).trim()) {
      return res.status(400).json({ success: false, message: 'worksheet_id is required' });
    }
    if (!row_id || !String(row_id).trim()) {
      return res.status(400).json({ success: false, message: 'row_id is required' });
    }
    if (!column_id || !String(column_id).trim()) {
      return res.status(400).json({ success: false, message: 'column_id is required' });
    }
    if (requested_value === undefined || requested_value === null) {
      return res.status(400).json({ success: false, message: 'requested_value is required' });
    }

    const approval = await prisma.approvalRequest.create({
      data: {
        requested_by: req.user.id,
        worksheet_id,
        row_id,
        column_id,
        previous_value: previous_value || '',
        requested_value,
        status: 'pending'
      },
      include: {
        requester: { select: { id: true, full_name: true, email: true } },
        worksheet: { select: { id: true, name: true } },
        column: { select: { id: true, display_name: true } }
      }
    });

    // Create notifications for all admins
    const admins = await prisma.userProfile.findMany({
      where: { is_admin: true, is_active: true },
      select: { id: true }
    });

    if (admins.length > 0) {
      await prisma.notification.createMany({
        data: admins.map(admin => ({
          user_id: admin.id,
          title: 'New Approval Request',
          message: `${req.user.full_name} requested a change in ${approval.worksheet.name} - ${approval.column.display_name}`,
          type: 'approval_request',
          related_approval_id: approval.id
        }))
      });
    }

    res.status(201).json({
      success: true,
      message: 'Approval request submitted successfully',
      data: { approval }
    });
  } catch (error) {
    console.error('Create approval error:', error);
    res.status(500).json({ success: false, message: 'Failed to create approval request' });
  }
};

const getPendingApprovals = async (req, res) => {
  try {
    const approvals = await prisma.approvalRequest.findMany({
      where: { status: 'pending' },
      include: {
        requester: { select: { id: true, full_name: true, email: true } },
        worksheet: { select: { id: true, name: true, display_name: true } },
        column: { select: { id: true, display_name: true, data_type: true } },
        row: { select: { id: true, row_identifier: true, data: true } }
      },
      orderBy: { created_at: 'desc' }
    });

    res.json({ success: true, data: { approvals } });
  } catch (error) {
    console.error('Get pending approvals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch approvals' });
  }
};

const getAllApprovals = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const whereClause = {};
    if (status) whereClause.status = status;

    if (!req.user.is_admin) {
      whereClause.requested_by = req.user.id;
    }

    const total = await prisma.approvalRequest.count({ where: whereClause });

    const approvals = await prisma.approvalRequest.findMany({
      where: whereClause,
      include: {
        requester: { select: { id: true, full_name: true, email: true } },
        reviewer: { select: { id: true, full_name: true, email: true } },
        worksheet: { select: { id: true, name: true, display_name: true } },
        column: { select: { id: true, display_name: true, data_type: true } },
        row: { select: { id: true, row_identifier: true } }
      },
      orderBy: { created_at: 'desc' },
      skip,
      take: parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        approvals,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          total_pages: Math.ceil(total / parseInt(limit))
        }
      }
    });
  } catch (error) {
    console.error('Get all approvals error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch approvals' });
  }
};

const reviewApproval = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, review_notes } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be approved or rejected' });
    }

    const approval = await prisma.approvalRequest.findUnique({
      where: { id },
      include: {
        requester: { select: { id: true, full_name: true } },
        column: { select: { id: true, column_key: true, display_name: true } }
      }
    });

    if (!approval) {
      return res.status(404).json({ success: false, message: 'Approval request not found' });
    }

    if (approval.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'This request has already been reviewed' });
    }

    // Update approval status
    const updatedApproval = await prisma.approvalRequest.update({
      where: { id },
      data: {
        status,
        reviewed_by: req.user.id,
        review_notes: review_notes || '',
        reviewed_at: new Date()
      }
    });

    // If approved, update the actual row data
    if (status === 'approved') {
      const row = await prisma.rowData.findUnique({ where: { id: approval.row_id } });
      if (row) {
        const updatedData = { ...row.data, [approval.column.column_key]: approval.requested_value };
        await prisma.rowData.update({
          where: { id: approval.row_id },
          data: { data: updatedData }
        });
      }

      // Log to audit
      await prisma.auditLog.create({
        data: {
          user_id: approval.requested_by,
          action_type: 'approved_edit',
          worksheet_id: approval.worksheet_id,
          row_id: approval.row_id,
          column_id: approval.column_id,
          previous_value: approval.previous_value,
          new_value: approval.requested_value,
          metadata: { reviewed_by: req.user.id, review_notes }
        }
      });
    }

    // Notify the requester
    await prisma.notification.create({
      data: {
        user_id: approval.requested_by,
        title: status === 'approved' ? 'Change Approved' : 'Change Rejected',
        message: status === 'approved'
          ? `Your change request for ${approval.column.display_name} has been approved`
          : `Your change request for ${approval.column.display_name} has been rejected. ${review_notes || ''}`,
        type: 'approval_result',
        related_approval_id: id
      }
    });

    res.json({
      success: true,
      message: `Approval request ${status} successfully`,
      data: { approval: updatedApproval }
    });
  } catch (error) {
    console.error('Review approval error:', error);
    res.status(500).json({ success: false, message: 'Failed to review approval request' });
  }
};

module.exports = {
  createApprovalRequest,
  getPendingApprovals,
  getAllApprovals,
  reviewApproval
};