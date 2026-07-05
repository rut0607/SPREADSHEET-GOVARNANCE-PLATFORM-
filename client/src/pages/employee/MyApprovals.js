import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { CheckCircle, XCircle, Clock } from 'lucide-react';
import { ListSkeleton } from '../../components/shared/skeletons';

const MyApprovals = () => {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchApprovals();
  }, []);

  const fetchApprovals = async () => {
    try {
      const res = await api.get('/approvals');
      setApprovals(res.data.data.approvals);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  };

  const filtered = filter === 'all'
    ? approvals
    : approvals.filter(a => a.status === filter);

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <ListSkeleton items={4} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">My Change Requests</h1>
        <p className="text-gray-500 mt-1">Track the status of your submitted changes</p>
      </div>

      <div className="flex gap-2">
        {['all', 'pending', 'approved', 'rejected'].map(status => (
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

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Clock size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No requests found</h3>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(approval => (
            <div key={approval.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {approval.status === 'approved' && <CheckCircle size={18} className="text-green-500" />}
                    {approval.status === 'rejected' && <XCircle size={18} className="text-red-500" />}
                    {approval.status === 'pending' && <Clock size={18} className="text-orange-500" />}
                    <span className="font-medium text-gray-800">
                      {approval.worksheet?.name} → {approval.column?.display_name}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      approval.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : approval.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {approval.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 p-3 bg-gray-50 rounded-lg mb-2">
                    <div>
                      <p className="text-xs text-gray-400">Previous</p>
                      <p className="text-sm text-red-500 line-through">{approval.previous_value || '(empty)'}</p>
                    </div>
                    <span className="text-gray-400">→</span>
                    <div>
                      <p className="text-xs text-gray-400">Requested</p>
                      <p className="text-sm text-green-600 font-medium">{approval.requested_value}</p>
                    </div>
                  </div>
                  {approval.review_notes && (
                    <p className="text-sm text-gray-500 mt-2">
                      Note: {approval.review_notes}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 mt-2">
                    Submitted {new Date(approval.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default MyApprovals;