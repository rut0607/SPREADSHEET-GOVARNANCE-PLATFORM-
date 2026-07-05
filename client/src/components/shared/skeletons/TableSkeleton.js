import React from 'react';
import Skeleton from './Skeleton';

const WIDTHS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-1/3', 'w-5/6', 'w-2/5'];

const TableSkeleton = ({ rows = 6, columns = 5 }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
    <div className="p-4 border-b border-gray-100">
      <Skeleton className="h-4 w-40" />
    </div>
    <table className="w-full">
      <tbody className="divide-y divide-gray-100">
        {Array.from({ length: rows }, (_, rowIdx) => (
          <tr key={rowIdx}>
            {Array.from({ length: columns }, (_, colIdx) => (
              <td key={colIdx} className="px-6 py-4">
                <Skeleton className={`h-4 ${WIDTHS[(rowIdx + colIdx) % WIDTHS.length]}`} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

export default TableSkeleton;
