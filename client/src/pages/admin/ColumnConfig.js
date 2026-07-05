import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Settings, Save, Plus, X, Tag } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../../components/shared/skeletons';

const ColumnConfig = () => {
  const [sources, setSources] = useState([]);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [columns, setColumns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dropdownInput, setDropdownInput] = useState({});

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await api.get('/spreadsheets');
      setSources(res.data.data.sources);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  };

  const loadWorksheetColumns = async (worksheet) => {
    setSelectedWorksheet(worksheet);
    try {
      const res = await api.get(`/spreadsheets/worksheet/${worksheet.id}/data?limit=1`);
      setColumns(res.data.data.worksheet.columns.map(col => ({
        ...col,
        dropdown_options: col.dropdown_options || []
      })));
    } catch (error) {
      // error toast handled by the axios response interceptor
    }
  };

  const updateColumn = (columnId, field, value) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId ? { ...col, [field]: value } : col
    ));
  };

  const addDropdownOption = (columnId) => {
    const input = dropdownInput[columnId];
    if (!input || !input.trim()) return;

    setColumns(prev => prev.map(col => {
      if (col.id !== columnId) return col;
      const existing = col.dropdown_options || [];
      if (existing.includes(input.trim())) return col;
      return { ...col, dropdown_options: [...existing, input.trim()] };
    }));

    setDropdownInput(prev => ({ ...prev, [columnId]: '' }));
  };

  const removeDropdownOption = (columnId, option) => {
    setColumns(prev => prev.map(col =>
      col.id === columnId
        ? { ...col, dropdown_options: col.dropdown_options.filter(o => o !== option) }
        : col
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await Promise.all(columns.map(col =>
        api.put(`/spreadsheets/column/${col.id}`, {
          display_name: col.display_name,
          data_type: col.data_type,
          is_required: col.is_required,
          is_unique: col.is_unique,
          is_identifier: col.is_identifier,
          dropdown_options: col.dropdown_options
        })
      ));
      toast.success('Column configuration saved successfully');
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-48 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <ListSkeleton items={3} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Column Configuration</h1>
          <p className="text-gray-500 mt-1">Configure data types, validation rules and dropdown options</p>
        </div>
        {selectedWorksheet && columns.length > 0 && (
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <Settings size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No spreadsheets found</h3>
          <p className="text-gray-500 mt-1">Upload a spreadsheet first to configure columns</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {sources.map(source =>
              source.worksheets?.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => loadWorksheetColumns(ws)}
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

          {selectedWorksheet && columns.length > 0 && (
            <div className="space-y-4">
              {columns.map(col => (
                <div key={col.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Display Name</label>
                      <input
                        type="text"
                        value={col.display_name}
                        onChange={e => updateColumn(col.id, 'display_name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Data Type</label>
                      <select
                        value={col.data_type}
                        onChange={e => updateColumn(col.id, 'data_type', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                      >
                        <option value="text">Text</option>
                        <option value="number">Number</option>
                        <option value="date">Date</option>
                        <option value="currency">Currency</option>
                        <option value="boolean">Boolean</option>
                        <option value="dropdown">Dropdown</option>
                        <option value="email">Email</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="block text-xs font-medium text-gray-500">Validation</label>
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.is_required}
                            onChange={e => updateColumn(col.id, 'is_required', e.target.checked)}
                            className="rounded"
                          />
                          Required field
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.is_unique}
                            onChange={e => updateColumn(col.id, 'is_unique', e.target.checked)}
                            className="rounded"
                          />
                          Unique values only
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={col.is_identifier}
                            onChange={e => updateColumn(col.id, 'is_identifier', e.target.checked)}
                            className="rounded"
                          />
                          Row identifier
                        </label>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Column Key</label>
                      <p className="text-sm text-gray-400 font-mono bg-gray-50 px-3 py-2 rounded-lg">
                        {col.column_key}
                      </p>
                    </div>
                  </div>

                  {col.data_type === 'dropdown' && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <label className="block text-xs font-medium text-gray-500 mb-2">
                        Dropdown Options
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {(col.dropdown_options || []).map(option => (
                          <span
                            key={option}
                            className="flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 text-xs rounded-full"
                          >
                            <Tag size={10} />
                            {option}
                            <button
                              onClick={() => removeDropdownOption(col.id, option)}
                              className="ml-1 hover:text-red-500 transition-colors"
                            >
                              <X size={10} />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={dropdownInput[col.id] || ''}
                          onChange={e => setDropdownInput(prev => ({ ...prev, [col.id]: e.target.value }))}
                          onKeyDown={e => e.key === 'Enter' && addDropdownOption(col.id)}
                          className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                          placeholder="Add option and press Enter"
                        />
                        <button
                          onClick={() => addDropdownOption(col.id)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors"
                        >
                          <Plus size={14} />
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {selectedWorksheet && columns.length === 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
              <p className="text-gray-500">No columns found in this worksheet</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ColumnConfig;