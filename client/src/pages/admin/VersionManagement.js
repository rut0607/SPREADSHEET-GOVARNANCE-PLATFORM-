import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { History, Upload, RotateCcw, CheckCircle, X, AlertTriangle, BarChart2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { ListSkeleton } from '../../components/shared/skeletons';
import ConfirmDialog from '../../components/shared/ConfirmDialog';

const VersionManagement = () => {
  const [sources, setSources] = useState([]);
  const [selectedSource, setSelectedSource] = useState(null);
  const [versions, setVersions] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadData, setUploadData] = useState({ file: null, notes: '' });
  const [uploading, setUploading] = useState(false);
  const [activeTab, setActiveTab] = useState('versions');
  const [confirmRestoreVersion, setConfirmRestoreVersion] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    fetchSources();
  }, []);

  useEffect(() => {
    if (selectedSource) {
      fetchVersions(selectedSource.id);
      fetchReport(selectedSource.id);
    }
  }, [selectedSource]);

  const fetchSources = async () => {
    try {
      const res = await api.get('/spreadsheets');
      const sources = res.data.data.sources;
      setSources(sources);
      if (sources.length > 0) setSelectedSource(sources[0]);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  };

  const fetchVersions = async (sourceId) => {
    setVersionsLoading(true);
    try {
      const res = await api.get(`/versions/${sourceId}`);
      setVersions(res.data.data.versions);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setVersionsLoading(false);
    }
  };

  const fetchReport = async (sourceId) => {
    setReportLoading(true);
    try {
      const res = await api.get(`/versions/${sourceId}/report/validation`, { skipErrorToast: true });
      setReport(res.data.data.report);
    } catch (error) {
      console.error('Report error:', error);
    } finally {
      setReportLoading(false);
    }
  };

  const handleUploadVersion = async (e) => {
    e.preventDefault();
    if (!uploadData.file) {
      toast.error('Please select a file');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadData.file);
      formData.append('notes', uploadData.notes);
      await api.post(`/versions/${selectedSource.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast.success('New version uploaded successfully');
      setShowUploadModal(false);
      setUploadData({ file: null, notes: '' });
      fetchVersions(selectedSource.id);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setUploading(false);
    }
  };

  const confirmRestore = async () => {
    const { versionId, versionNumber } = confirmRestoreVersion;
    setConfirmRestoreVersion(null);
    try {
      await api.put(`/versions/${selectedSource.id}/restore/${versionId}`);
      toast.success(`Restored to version ${versionNumber}`);
      fetchVersions(selectedSource.id);
    } catch (error) {
      // error toast handled by the axios response interceptor
    }
  };

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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Version Management</h1>
          <p className="text-gray-500 mt-1">Track, compare and restore spreadsheet versions</p>
        </div>
        {selectedSource && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
          >
            <Upload size={18} />
            Upload New Version
          </button>
        )}
      </div>

      {sources.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <History size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-700">No spreadsheets found</h3>
          <p className="text-gray-500 mt-1">Upload a spreadsheet first to manage versions</p>
        </div>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            {sources.map(source => (
              <button
                key={source.id}
                onClick={() => setSelectedSource(source)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  selectedSource?.id === source.id
                    ? 'bg-primary-600 text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                {source.name}
              </button>
            ))}
          </div>

          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab('versions')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'versions'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Version History
            </button>
            <button
              onClick={() => setActiveTab('report')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'report'
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              Validation Report
            </button>
          </div>

          {activeTab === 'versions' && (
            <div className="space-y-3">
              {versionsLoading ? (
                <div className="flex items-center justify-center min-h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : versions.length === 0 ? (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                  <History size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-gray-500">No versions found</p>
                </div>
              ) : (
                versions.map(version => (
                  <div key={version.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                          version.is_current
                            ? 'bg-primary-100 text-primary-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          v{version.version_number}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-800">
                              Version {version.version_number}
                            </p>
                            {version.is_current && (
                              <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-gray-500 mt-0.5">
                            {new Date(version.created_at).toLocaleString()}
                          </p>
                          {version.notes && (
                            <p className="text-sm text-gray-400 mt-0.5">{version.notes}</p>
                          )}
                        </div>
                      </div>
                      {!version.is_current && (
                        <button
                          onClick={() => setConfirmRestoreVersion({ versionId: version.id, versionNumber: version.version_number })}
                          className="flex items-center gap-2 px-3 py-1.5 border border-gray-200 hover:border-primary-300 hover:bg-primary-50 text-gray-600 hover:text-primary-600 rounded-lg transition-colors text-sm font-medium"
                        >
                          <RotateCcw size={14} />
                          Restore
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'report' && (
            <div className="space-y-4">
              {reportLoading ? (
                <div className="flex items-center justify-center min-h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : report ? (
                report.worksheets.map(ws => (
                  <div key={ws.worksheet_name} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <BarChart2 size={20} className="text-primary-600" />
                      <h3 className="font-semibold text-gray-800">{ws.worksheet_name}</h3>
                      <span className="text-sm text-gray-500">
                        {ws.total_rows} rows • {ws.total_columns} columns
                      </span>
                    </div>

                    {ws.issues.length > 0 && (
                      <div className="mb-4 space-y-2">
                        <p className="text-sm font-medium text-gray-700">Issues Found</p>
                        {ws.issues.map((issue, i) => (
                          <div key={i} className={`flex items-center gap-2 p-3 rounded-lg ${
                            issue.severity === 'high'
                              ? 'bg-red-50 text-red-700'
                              : 'bg-orange-50 text-orange-700'
                          }`}>
                            <AlertTriangle size={16} />
                            <span className="text-sm">
                              {issue.column}: {issue.count} {issue.type.replace('_', ' ')}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {ws.issues.length === 0 && (
                      <div className="flex items-center gap-2 p-3 bg-green-50 rounded-lg mb-4">
                        <CheckCircle size={16} className="text-green-500" />
                        <span className="text-sm text-green-700">No issues found in this worksheet</span>
                      </div>
                    )}

                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Column</th>
                            <th className="text-left px-3 py-2 font-medium text-gray-600">Type</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Total</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Empty</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Unique</th>
                            <th className="text-center px-3 py-2 font-medium text-gray-600">Duplicates</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {ws.column_stats.map(stat => (
                            <tr key={stat.column} className="hover:bg-gray-50">
                              <td className="px-3 py-2 font-medium text-gray-800">{stat.column}</td>
                              <td className="px-3 py-2 text-gray-500">{stat.data_type}</td>
                              <td className="px-3 py-2 text-center text-gray-700">{stat.total_values}</td>
                              <td className={`px-3 py-2 text-center ${stat.empty_count > 0 ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                                {stat.empty_count}
                              </td>
                              <td className="px-3 py-2 text-center text-gray-700">{stat.unique_count}</td>
                              <td className={`px-3 py-2 text-center ${stat.duplicate_count > 0 ? 'text-orange-500 font-medium' : 'text-gray-400'}`}>
                                {stat.duplicate_count}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
                  <p className="text-gray-500">No report available</p>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {showUploadModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-800">Upload New Version</h2>
              <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X size={18} />
              </button>
            </div>
            <div className="p-6">
              <form onSubmit={handleUploadVersion} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Version Notes</label>
                  <input
                    type="text"
                    value={uploadData.notes}
                    onChange={e => setUploadData({ ...uploadData, notes: e.target.value })}
                    maxLength={500}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                    placeholder="e.g. Updated Q2 data"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Excel File</label>
                  <div
                    className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-primary-400 transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadData.file ? (
                      <p className="text-sm font-medium text-gray-700">{uploadData.file.name}</p>
                    ) : (
                      <div>
                        <Upload size={24} className="text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">Click to select Excel file</p>
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
            </div>
          </div>
        </div>
      )}

      {confirmRestoreVersion && (
        <ConfirmDialog
          title="Restore Version"
          message={`Restore to version ${confirmRestoreVersion.versionNumber}? Current data will be replaced.`}
          confirmText="Restore"
          danger
          onConfirm={confirmRestore}
          onCancel={() => setConfirmRestoreVersion(null)}
        />
      )}
    </div>
  );
};

export default VersionManagement;