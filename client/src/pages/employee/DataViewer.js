import React, { useState, useEffect, useMemo, useCallback } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FileSpreadsheet, Search, Send, X, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { TableSkeleton } from '../../components/shared/skeletons';

const getColumnDropdownOptions = (column) => {
  if (column.data_type === 'dropdown' && column.dropdown_options) {
    return Array.isArray(column.dropdown_options) ? column.dropdown_options : [];
  }
  return [];
};

const DataRow = React.memo(({
  row, columns, striped, editingColumnId, editValue, submitting,
  canEdit, needsApproval, onCellClick, onEditValueChange, onSaveEdit, onCancelEdit
}) => (
  <tr className={striped ? 'bg-gray-50' : 'bg-white'}>
    {columns.map(col => {
      const isEditing = editingColumnId === col.id;
      const editable = canEdit(col.id);
      const approval = needsApproval(col.id);
      const dropdownOptions = getColumnDropdownOptions(col);

      return (
        <td
          key={col.id}
          className={`px-4 py-2 whitespace-nowrap ${
            editable
              ? approval
                ? 'bg-orange-50 cursor-pointer hover:bg-orange-100'
                : 'bg-green-50 cursor-pointer hover:bg-green-100'
              : ''
          }`}
          onClick={() => !isEditing && onCellClick(row, col)}
        >
          {isEditing ? (
            <div className="flex items-center gap-1">
              {dropdownOptions.length > 0 ? (
                <select
                  value={editValue}
                  onChange={e => onEditValueChange(e.target.value)}
                  className="border border-primary-400 rounded px-2 py-1 text-sm outline-none focus:ring-2 focus:ring-primary-300"
                  autoFocus
                >
                  <option value="">Select...</option>
                  {dropdownOptions.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={col.data_type === 'number' || col.data_type === 'currency' ? 'number' : 'text'}
                  value={editValue}
                  onChange={e => onEditValueChange(e.target.value)}
                  maxLength={1000}
                  className="border border-primary-400 rounded px-2 py-1 text-sm outline-none w-32 focus:ring-2 focus:ring-primary-300"
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') onSaveEdit(row, col, editValue);
                    if (e.key === 'Escape') onCancelEdit();
                  }}
                />
              )}
              <button
                onClick={() => onSaveEdit(row, col, editValue)}
                disabled={submitting}
                className="p-1 text-green-600 hover:bg-green-100 rounded"
              >
                {approval ? <Send size={14} /> : <Check size={14} />}
              </button>
              <button
                onClick={onCancelEdit}
                className="p-1 text-red-400 hover:bg-red-50 rounded"
              >
                <X size={14} />
              </button>
            </div>
          ) : (
            <span className="text-gray-700">
              {row.data[col.column_key] || '—'}
            </span>
          )}
        </td>
      );
    })}
  </tr>
));

const DataViewer = () => {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [worksheetData, setWorksheetData] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [limit] = useState(50);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await api.get('/spreadsheets');
      const sources = res.data.data.sources;
      setSources(sources);
      if (sources.length > 0 && sources[0].worksheets?.length > 0) {
        await loadWorksheet(sources[0].worksheets[0], 1);
      }
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  };

  const loadWorksheet = async (worksheet, pageNum = 1) => {
    setSelectedWorksheet(worksheet);
    setDataLoading(true);
    setPage(pageNum);
    setSearch('');
    setEditingCell(null);
    try {
      const [dataRes, permsRes] = await Promise.all([
        api.get(`/spreadsheets/worksheet/${worksheet.id}/data?page=${pageNum}&limit=${limit}`),
        api.get(`/permissions/effective/${user.id}/worksheet/${worksheet.id}`)
      ]);
      setWorksheetData(dataRes.data.data);
      setPermissions(permsRes.data.data.permissions);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setDataLoading(false);
    }
  };

  const changePage = async (newPage) => {
    if (!selectedWorksheet) return;
    setDataLoading(true);
    setPage(newPage);
    try {
      const res = await api.get(`/spreadsheets/worksheet/${selectedWorksheet.id}/data?page=${newPage}&limit=${limit}`);
      setWorksheetData(res.data.data);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setDataLoading(false);
    }
  };

  const canEdit = useCallback((columnId) => {
    return user.is_admin || permissions.find(p => p.column_id === columnId)?.can_edit || false;
  }, [user, permissions]);

  const needsApproval = useCallback((columnId) => {
    return !user.is_admin && permissions.find(p => p.column_id === columnId)?.requires_approval || false;
  }, [user, permissions]);

  const handleCellClick = useCallback((row, column) => {
    if (!canEdit(column.id)) return;
    setEditingCell({ rowId: row.id, columnId: column.id, columnKey: column.column_key });
    setEditValue(row.data[column.column_key] || '');
  }, [canEdit]);

  const handleCancelEdit = useCallback(() => setEditingCell(null), []);
  const handleEditValueChange = useCallback((value) => setEditValue(value), []);

  const handleSaveEdit = useCallback(async (row, column, value) => {
    if (value === row.data[column.column_key]) {
      setEditingCell(null);
      return;
    }

    setSubmitting(true);
    try {
      if (needsApproval(column.id)) {
        await api.post('/approvals', {
          worksheet_id: selectedWorksheet.id,
          row_id: row.id,
          column_id: column.id,
          previous_value: row.data[column.column_key] || '',
          requested_value: value
        });
        toast.success('Change submitted for approval');
      } else {
        const updatedData = { ...row.data, [column.column_key]: value };
        await api.put(`/spreadsheets/row/${row.id}`, {
          data: updatedData,
          column_id: column.id,
          previous_value: row.data[column.column_key] || '',
          new_value: value
        });
        setWorksheetData(prev => ({
          ...prev,
          rows: prev.rows.map(r =>
            r.id === row.id ? { ...r, data: updatedData } : r
          )
        }));
        toast.success('Change saved successfully');
      }
      setEditingCell(null);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setSubmitting(false);
    }
  }, [needsApproval, selectedWorksheet]);

  const filteredRows = useMemo(() => worksheetData?.rows.filter(row =>
    search === '' || Object.values(row.data).some(val =>
      val?.toString().toLowerCase().includes(search.toLowerCase())
    )
  ) || [], [worksheetData, search]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <div>
          <div className="h-7 w-40 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  if (sources.length === 0) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <FileSpreadsheet size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No data available</h3>
          <p className="text-gray-500 mt-1">Ask your admin to upload spreadsheet data</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Data Viewer</h1>
        <p className="text-gray-500 mt-1">View and edit data based on your permissions</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {sources.map(source =>
          source.worksheets?.map(ws => (
            <button
              key={ws.id}
              onClick={() => loadWorksheet(ws, 1)}
              className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                selectedWorksheet?.id === ws.id
                  ? 'bg-primary-600 text-white'
                  : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {source.name} - {ws.name}
            </button>
          ))
        )}
      </div>

      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Search data..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          maxLength={255}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none text-sm"
        />
      </div>

      {dataLoading ? (
        <div className="flex items-center justify-center min-h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : worksheetData ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <p className="text-sm text-gray-500">
              {worksheetData.pagination.total} total rows •
              showing {((page - 1) * limit) + 1} to {Math.min(page * limit, worksheetData.pagination.total)}
            </p>
            <div className="flex items-center gap-4 text-xs text-gray-400">
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 bg-green-100 border border-green-300 rounded"></div>
                Editable
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 bg-orange-100 border border-orange-300 rounded"></div>
                Needs Approval
              </span>
              <span className="flex items-center gap-1">
                <div className="w-3 h-3 bg-gray-100 border border-gray-300 rounded"></div>
                Read Only
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {worksheetData.worksheet.columns.map(col => (
                    <th key={col.id} className="text-left px-4 py-3 font-medium text-gray-700 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        {col.display_name}
                        {canEdit(col.id) && (
                          <span className={`w-2 h-2 rounded-full ${
                            needsApproval(col.id) ? 'bg-orange-400' : 'bg-green-400'
                          }`}></span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row, i) => {
                  const isEditingThisRow = editingCell?.rowId === row.id;
                  return (
                    <DataRow
                      key={row.id}
                      row={row}
                      columns={worksheetData.worksheet.columns}
                      striped={i % 2 !== 0}
                      editingColumnId={isEditingThisRow ? editingCell.columnId : null}
                      editValue={isEditingThisRow ? editValue : ''}
                      submitting={submitting}
                      canEdit={canEdit}
                      needsApproval={needsApproval}
                      onCellClick={handleCellClick}
                      onEditValueChange={handleEditValueChange}
                      onSaveEdit={handleSaveEdit}
                      onCancelEdit={handleCancelEdit}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>

          {worksheetData.pagination.total_pages > 1 && search === '' && (
            <div className="p-4 border-t border-gray-100 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                Page {page} of {worksheetData.pagination.total_pages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => changePage(page - 1)}
                  disabled={page === 1}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={16} />
                  Previous
                </button>
                <div className="flex gap-1">
                  {Array.from({ length: Math.min(5, worksheetData.pagination.total_pages) }, (_, i) => {
                    let pageNum;
                    if (worksheetData.pagination.total_pages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= worksheetData.pagination.total_pages - 2) {
                      pageNum = worksheetData.pagination.total_pages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <button
                        key={pageNum}
                        onClick={() => changePage(pageNum)}
                        className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                          page === pageNum
                            ? 'bg-primary-600 text-white'
                            : 'border border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>
                <button
                  onClick={() => changePage(page + 1)}
                  disabled={page === worksheetData.pagination.total_pages}
                  className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default DataViewer;