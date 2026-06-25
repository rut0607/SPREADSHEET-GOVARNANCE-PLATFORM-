import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { FileSpreadsheet, Search, Edit2, Send, X, Check } from 'lucide-react';
import toast from 'react-hot-toast';

const DataViewer = () => {
  const { user } = useAuth();
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [worksheetData, setWorksheetData] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await api.get('/spreadsheets');
      const sources = res.data.data.sources;
      setSources(sources);
      if (sources.length > 0 && sources[0].worksheets?.length > 0) {
        setSelectedSource(sources[0]);
        await loadWorksheet(sources[0].worksheets[0]);
      }
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const loadWorksheet = async (worksheet) => {
    setSelectedWorksheet(worksheet);
    setDataLoading(true);
    try {
      const [dataRes, permsRes] = await Promise.all([
        api.get(`/spreadsheets/worksheet/${worksheet.id}/data?limit=200`),
        api.get(`/permissions/effective/${user.id}/worksheet/${worksheet.id}`)
      ]);
      setWorksheetData(dataRes.data.data);
      setPermissions(permsRes.data.data.permissions);
    } catch (error) {
      toast.error('Failed to load worksheet');
    } finally {
      setDataLoading(false);
    }
  };

  const getPermission = (columnId) => {
    return permissions.find(p => p.column_id === columnId);
  };

  const canEdit = (columnId) => {
    if (user.is_admin) return true;
    const perm = getPermission(columnId);
    return perm?.can_edit || false;
  };

  const needsApproval = (columnId) => {
    if (user.is_admin) return false;
    const perm = getPermission(columnId);
    return perm?.requires_approval || false;
  };

  const handleCellClick = (row, column) => {
    if (!canEdit(column.id)) return;
    setEditingCell({ rowId: row.id, columnId: column.id, columnKey: column.column_key });
    setEditValue(row.data[column.column_key] || '');
  };

  const handleSaveEdit = async (row, column) => {
    if (editValue === row.data[column.column_key]) {
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
          requested_value: editValue
        });
        toast.success('Change submitted for approval');
      } else {
        const updatedData = { ...row.data, [column.column_key]: editValue };
        await api.put(`/spreadsheets/row/${row.id}`, { data: updatedData });
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
      toast.error('Failed to save change');
    } finally {
      setSubmitting(false);
    }
  };

  const filteredRows = worksheetData?.rows.filter(row =>
    Object.values(row.data).some(val =>
      val?.toString().toLowerCase().includes(search.toLowerCase())
    )
  ) || [];

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
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
              onClick={() => { setSelectedSource(source); loadWorksheet(ws); }}
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
              {filteredRows.length} rows • {worksheetData.worksheet.columns.length} columns
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
                          <span className={`w-2 h-2 rounded-full ${needsApproval(col.id) ? 'bg-orange-400' : 'bg-green-400'}`}></span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredRows.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    {worksheetData.worksheet.columns.map(col => {
                      const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === col.id;
                      const editable = canEdit(col.id);
                      const approval = needsApproval(col.id);

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
                          onClick={() => !isEditing && handleCellClick(row, col)}
                        >
                          {isEditing ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editValue}
                                onChange={e => setEditValue(e.target.value)}
                                className="border border-primary-400 rounded px-2 py-1 text-sm outline-none w-32 focus:ring-2 focus:ring-primary-300"
                                autoFocus
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleSaveEdit(row, col);
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                              />
                              <button
                                onClick={() => handleSaveEdit(row, col)}
                                disabled={submitting}
                                className="p-1 text-green-600 hover:bg-green-100 rounded"
                              >
                                {approval ? <Send size={14} /> : <Check size={14} />}
                              </button>
                              <button
                                onClick={() => setEditingCell(null)}
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
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DataViewer;