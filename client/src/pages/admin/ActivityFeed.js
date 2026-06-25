import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Activity, User, FileSpreadsheet, CheckSquare, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const ActivityFeed = () => {
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchActivity();
  }, []);

  const fetchActivity = async () => {
    try {
      const res = await api.get('/approvals?limit=50');
      setApprovals(res.data.data.approvals);
    } catch (error) {
      toast.error('Failed to fetch activity');
    } finally {
      setLoading(false);
    }
  };

  const getActivityIcon = (status) => {
    switch (status) {
      case 'approved': return <CheckSquare size={16} className="text-green-500" />;
      case 'rejected': return <CheckSquare size={16} className="text-red-500" />;
      default: return <Clock size={16} className="text-orange-500" />;
    }
  };

  const getActivityColor = (status) => {
    switch (status) {
      case 'approved': return 'border-green-200 bg-green-50';
      case 'rejected': return 'border-red-200 bg-red-50';
      default: return 'border-orange-200 bg-orange-50';
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Activity Feed</h1>
        <p className="text-gray-500 mt-1">Recent platform activity and changes</p>
      </div>

      {approvals.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Activity size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No activity yet</h3>
          <p className="text-gray-500 mt-1">Activity will appear here as employees make changes</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
          {approvals.map(activity => (
            <div key={activity.id} className="p-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-start gap-4">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border flex-shrink-0 ${getActivityColor(activity.status)}`}>
                  {getActivityIcon(activity.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">
                    <span className="font-medium">{activity.requester?.full_name}</span>
                    {' '}requested change in{' '}
                    <span className="font-medium text-primary-600">{activity.worksheet?.name}</span>
                    {' '}→{' '}
                    <span className="font-medium">{activity.column?.display_name}</span>
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-xs text-gray-400">
                      {new Date(activity.created_at).toLocaleString()}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      activity.status === 'approved'
                        ? 'bg-green-100 text-green-700'
                        : activity.status === 'rejected'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-orange-100 text-orange-700'
                    }`}>
                      {activity.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-2 p-2 bg-gray-50 rounded-lg">
                    <span className="text-xs text-red-500 line-through">
                      {activity.previous_value || '(empty)'}
                    </span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className="text-xs text-green-600 font-medium">
                      {activity.requested_value}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ActivityFeed;