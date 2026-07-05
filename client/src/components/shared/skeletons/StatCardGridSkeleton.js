import React from 'react';
import Skeleton from './Skeleton';

const StatCardGridSkeleton = ({ count = 4 }) => (
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
    {Array.from({ length: count }, (_, idx) => (
      <div key={idx} className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
        <div className="flex items-center gap-3">
          <Skeleton className="w-10 h-10 rounded-xl flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-6 w-10" />
          </div>
        </div>
      </div>
    ))}
  </div>
);

export default StatCardGridSkeleton;
