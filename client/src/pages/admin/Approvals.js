import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { CheckCircle, XCircle, Clock, Filter } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../../components/shared/skeletons';

const ApprovalsPage = () => {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [reviewNotes, setReviewNotes] = useState({});
  const [submitting, setSubmitting] = useState(null);

  useEffect(() => {
    fetchApprovals();
  }, [filter]);

  const fetchApprovals = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/approvals?status=${filter}`);
      setApprovals(res.data.data.approvals);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (approvalId, status) => {
    setSubmitting(approvalId + status);
    try {
      await api.put(`/approvals/${approvalId}/review`, {
        status,
        review_notes: reviewNotes[approvalId] || ''
      });
      toast.success(`Request ${status} successfully`);
      fetchApprovals();
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setSubmitting(null);
    }
  };

  const statusConfig = {
    pending: { label: 'Pending', color: 'bg-orange-100 text-orange-700' },
    approved: { label: 'Approved', color: 'bg-green-100 text-green-700' },
    rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700' }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Approval Requests</h1>
        <p className="text-gray-500 mt-1">Review and manage change requests from employees</p>
      </div>

      <div className="flex gap-2">
        {['pending', 'approved', 'rejected'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
              filter === status
                ? 'bg-primary-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {status}
          </button>
        ))}
      </div>

      {loading ? (
        <ListSkeleton items={4} />
      ) : approvals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <CheckCircle size={48} className="text-green-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No {filter} requests</h3>
          <p className="text-gray-500 mt-1">All caught up</p>
        </div>
      ) : (
        <div className="space-y-4">
          {approvals.map(approval => (
            <div key={approval.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusConfig[approval.status].color}`}>
                      {statusConfig[approval.status].label}
                    </span>
                    <span className="text-xs text-gray-400">
                      {new Date(approval.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Requested By</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">
                        {approval.requester?.full_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Sheet</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">
                        {approval.worksheet?.name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Field</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">
                        {approval.column?.display_name}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-400 uppercase tracking-wider">Row</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">
                        {approval.row?.row_identifier}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg mb-4">
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">Previous Value</p>
                      <p className="text-sm text-red-600 font-medium">
                        {approval.previous_value || '(empty)'}
                      </p>
                    </div>
                    <div className="text-gray-400">→</div>
                    <div className="flex-1">
                      <p className="text-xs text-gray-400 mb-1">Requested Value</p>
                      <p className="text-sm text-green-600 font-medium">
                        {approval.requested_value}
                      </p>
                    </div>
                  </div>

                  {approval.status === 'pending' && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Add review notes (optional)"
                        value={reviewNotes[approval.id] || ''}
                        onChange={e => setReviewNotes(prev => ({
                          ...prev,
                          [approval.id]: e.target.value
                        }))}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      />
                      <div className="flex gap-3">
                        <button
                          onClick={() => handleReview(approval.id, 'approved')}
                          disabled={submitting === approval.id + 'approved'}
                          className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-300 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                          <CheckCircle size={16} />
                          {submitting === approval.id + 'approved' ? 'Approving...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReview(approval.id, 'rejected')}
                          disabled={submitting === approval.id + 'rejected'}
                          className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg transition-colors text-sm font-medium"
                        >
                          <XCircle size={16} />
                          {submitting === approval.id + 'rejected' ? 'Rejecting...' : 'Reject'}
                        </button>
                      </div>
                    </div>
                  )}

                  {approval.status !== 'pending' && approval.review_notes && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">Review Notes</p>
                      <p className="text-sm text-gray-700">{approval.review_notes}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        by {approval.reviewer?.full_name} on {new Date(approval.reviewed_at).toLocaleString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ApprovalsPage;