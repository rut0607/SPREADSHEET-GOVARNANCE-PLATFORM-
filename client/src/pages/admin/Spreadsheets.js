import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { FileSpreadsheet, Upload, Eye, Trash2, X, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

const Modal = ({ title, onClose, children }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
      <div className="flex items-center justify-between p-6 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
        <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
          <X size={18} />
        </button>
      </div>
      <div className="p-6">{children}</div>
    </div>
  </div>
);

const SpreadsheetsPage = () => {
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({ name: '', file: null });
  const [uploading, setUploading] = useState(false);
  const [selectedSource, setSelectedSource] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSources();
  }, []);

  const fetchSources = async () => {
    try {
      const res = await api.get('/spreadsheets');
      setSources(res.data.data.sources);
    } catch (error) {
      toast.error('Failed to fetch spreadsheets');
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!uploadData.file) {
      toast.error('Please select a file');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('name', uploadData.name);
      await api.post('/spreadsheets/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('Spreadsheet uploaded successfully');
      setShowUploadModal(false);
      setUploadData({ name: '', file: null });
      fetchSources();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Spreadsheets</h1>
          <p className="text-gray-500 mt-1">{sources.length} spreadsheet{sources.length !== 1 ? 's' : ''} connected</p>
        </div>
        <button
          onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Upload size={18} />
          Upload Excel
        </button>
      </div>

      {sources.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <FileSpreadsheet size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700 mb-2">No spreadsheets yet</h3>
          <p className="text-gray-500 mb-6">Upload your first Excel file to get started</p>
          <button
            onClick={() => setShowUploadModal(true)}
            className="bg-primary-600 hover:bg-primary-700 text-white px-6 py-2 rounded-lg transition-colors font-medium"
          >
            Upload Excel File
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {sources.map(source => (
            <div key={source.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileSpreadsheet size={24} className="text-green-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-800 text-lg">{source.name}</h3>
                    <p className="text-sm text-gray-500 mt-0.5">
                      Type: {source.source_type.toUpperCase()} •
                      Uploaded by: {source.creator?.full_name || 'Unknown'} •
                      {new Date(source.created_at).toLocaleDateString()}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {source.worksheets?.map(ws => (
                        <span
                          key={ws.id}
                          className="px-3 py-1 bg-blue-50 text-blue-700 text-xs rounded-full font-medium cursor-pointer hover:bg-blue-100 transition-colors"
                          onClick={() => setSelectedSource({ source, worksheet: ws })}
                        >
                          {ws.name} ({ws.row_count} rows)
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setSelectedSource({ source, worksheet: source.worksheets?.[0] })}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors font-medium"
                  >
                    <Eye size={16} />
                    View Data
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showUploadModal && (
        <Modal title="Upload Excel File" onClose={() => setShowUploadModal(false)}>
          <form onSubmit={handleUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Spreadsheet Name
              </label>
              <input
                type="text"
                required
                value={uploadData.name}
                onChange={e => setUploadData({ ...uploadData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="e.g. Production Data Q1 2026"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Excel File
              </label>
              <div
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploadData.file ? (
                  <div>
                    <FileSpreadsheet size={24} className="text-green-500 mx-auto mb-2" />
                    <p className="text-sm font-medium text-gray-700">{uploadData.file.name}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {(uploadData.file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                ) : (
                  <div>
                    <Upload size={24} className="text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Click to select Excel file</p>
                    <p className="text-xs text-gray-400 mt-1">.xlsx or .xls files only</p>
                  </div>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => setUploadData({ ...uploadData, file: e.target.files[0] })}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowUploadModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg transition-colors"
              >
                {uploading ? 'Uploading...' : 'Upload'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {selectedSource && (
        <WorksheetViewer
          source={selectedSource.source}
          worksheet={selectedSource.worksheet}
          onClose={() => setSelectedSource(null)}
        />
      )}
    </div>
  );
};

const WorksheetViewer = ({ source, worksheet, onClose }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSheet, setActiveSheet] = useState(worksheet);

  useEffect(() => {
    if (activeSheet) fetchData(activeSheet.id);
  }, [activeSheet]);

  const fetchData = async (worksheetId) => {
    setLoading(true);
    try {
      const res = await api.get(`/spreadsheets/worksheet/${worksheetId}/data`);
      setData(res.data.data);
    } catch (error) {
      toast.error('Failed to fetch worksheet data');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-6xl max-h-screen flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">{source.name}</h2>
            <div className="flex gap-2 mt-2">
              {source.worksheets?.map(ws => (
                <button
                  key={ws.id}
                  onClick={() => setActiveSheet(ws)}
                  className={`px-3 py-1 text-xs rounded-full font-medium transition-colors ${
                    activeSheet?.id === ws.id
                      ? 'bg-primary-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {ws.name}
                </button>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : data ? (
            <div>
              <p className="text-sm text-gray-500 mb-4">
                {data.pagination.total} rows • {data.worksheet.columns.length} columns
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-gray-50">
                      {data.worksheet.columns.map(col => (
                        <th key={col.id} className="text-left px-4 py-3 font-medium text-gray-700 border border-gray-200 whitespace-nowrap">
                          {col.display_name}
                          <span className="ml-1 text-xs text-gray-400">({col.data_type})</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, i) => (
                      <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        {data.worksheet.columns.map(col => (
                          <td key={col.id} className="px-4 py-2 border border-gray-200 text-gray-700 whitespace-nowrap">
                            {row.data[col.column_key] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <p className="text-gray-500 text-center">No data available</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpreadsheetsPage;