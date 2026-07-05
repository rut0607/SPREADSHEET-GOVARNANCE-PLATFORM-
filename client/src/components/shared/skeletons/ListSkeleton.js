import React from 'react';
import Skeleton from './Skeleton';

const ListSkeleton = ({ items = 4, withAvatar = false }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 divide-y divide-gray-100">
    {Array.from({ length: items }, (_, idx) => (
      <div key={idx} className="p-4 flex items-center gap-3">
        {withAvatar && <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />}
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    ))}
  </div>
);

export default ListSkeleton;
