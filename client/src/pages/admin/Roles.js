import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { Shield, Plus, Edit, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
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

const RolesPage = () => {
  const [roles, setRoles] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showPermissionModal, setShowPermissionModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState(null);
  const [worksheetData, setWorksheetData] = useState(null);
  const [selectedWorksheet, setSelectedWorksheet] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [rolesRes, sourcesRes] = await Promise.all([
        api.get('/roles'),
        api.get('/spreadsheets')
      ]);
      setRoles(rolesRes.data.data.roles);
      setSources(sourcesRes.data.data.sources);
    } catch (error) {
      toast.error('Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/roles', formData);
      toast.success('Role created successfully');
      setShowCreateModal(false);
      setFormData({ name: '', description: '' });
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to create role');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (role) => {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await api.delete(`/roles/${role.id}`);
      toast.success('Role deleted');
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete role');
    }
  };

  const openPermissionModal = async (role) => {
    setSelectedRole(role);
    setShowPermissionModal(true);
    if (sources.length > 0) {
      const firstSource = sources[0];
      if (firstSource.worksheets?.length > 0) {
        await loadWorksheetPermissions(firstSource.worksheets[0], role.id);
      }
    }
  };

  const loadWorksheetPermissions = async (worksheet, roleId) => {
    setSelectedWorksheet(worksheet);
    try {
      const [columnsRes, permsRes] = await Promise.all([
        api.get(`/spreadsheets/worksheet/${worksheet.id}/data?limit=1`),
        api.get(`/permissions/role/${roleId}`)
      ]);

      const columns = columnsRes.data.data.worksheet.columns;
      const existingPerms = permsRes.data.data.permissions.filter(
        p => p.worksheet.id === worksheet.id
      );

      const permMap = {};
      columns.forEach(col => {
        const existing = existingPerms.find(p => p.column.id === col.id);
        permMap[col.id] = {
          column_id: col.id,
          column_key: col.column_key,
          display_name: col.display_name,
          worksheet_id: worksheet.id,
          can_view: existing ? existing.can_view : true,
          can_edit: existing ? existing.can_edit : false,
          requires_approval: existing ? existing.requires_approval : false
        };
      });

      setWorksheetData({ columns, worksheet });
      setPermissions(permMap);
    } catch (error) {
      toast.error('Failed to load permissions');
    }
  };

  const handleSavePermissions = async () => {
    setSubmitting(true);
    try {
      const permsArray = Object.values(permissions).map(p => ({
        worksheet_id: p.worksheet_id,
        column_id: p.column_id,
        can_view: p.can_view,
        can_edit: p.can_edit,
        requires_approval: p.requires_approval
      }));

      await api.post(`/permissions/role/${selectedRole.id}`, {
        permissions: permsArray
      });

      toast.success('Permissions saved successfully');
      setShowPermissionModal(false);
    } catch (error) {
      toast.error('Failed to save permissions');
    } finally {
      setSubmitting(false);
    }
  };

  const togglePermission = (columnId, field) => {
    setPermissions(prev => ({
      ...prev,
      [columnId]: {
        ...prev[columnId],
        [field]: !prev[columnId][field],
        ...(field === 'can_edit' && !prev[columnId][field] === false && {
          requires_approval: false
        })
      }
    }));
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
          <h1 className="text-2xl font-bold text-gray-800">Roles & Permissions</h1>
          <p className="text-gray-500 mt-1">{roles.length} roles configured</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg transition-colors font-medium"
        >
          <Plus size={18} />
          Add Role
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {roles.map(role => (
          <div key={role.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                  <Shield size={20} className="text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-800">{role.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    role.is_active
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }`}>
                    {role.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleDelete(role)}
                className="p-1.5 hover:bg-red-50 text-red-400 hover:text-red-600 rounded-lg transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>

            {role.description && (
              <p className="text-sm text-gray-500 mt-3">{role.description}</p>
            )}

            <button
              onClick={() => openPermissionModal(role)}
              className="w-full mt-4 px-3 py-2 border border-primary-200 text-primary-600 hover:bg-primary-50 rounded-lg transition-colors text-sm font-medium"
            >
              Configure Permissions
            </button>
          </div>
        ))}
      </div>

      {showCreateModal && (
        <Modal title="Create New Role" onClose={() => setShowCreateModal(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="e.g. Quality Control"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="Describe this role's responsibilities"
                rows={3}
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg transition-colors"
              >
                {submitting ? 'Creating...' : 'Create Role'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {showPermissionModal && selectedRole && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-screen flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-100">
              <div>
                <h2 className="text-lg font-semibold text-gray-800">
                  Permissions for {selectedRole.name}
                </h2>
                <p className="text-sm text-gray-500 mt-0.5">
                  Configure what this role can view, edit, or needs approval for
                </p>
              </div>
              <button
                onClick={() => setShowPermissionModal(false)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-auto p-6">
              {sources.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No spreadsheets uploaded yet. Upload a spreadsheet first to configure permissions.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="flex gap-2 flex-wrap">
                    {sources.map(source =>
                      source.worksheets?.map(ws => (
                        <button
                          key={ws.id}
                          onClick={() => loadWorksheetPermissions(ws, selectedRole.id)}
                          className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                            selectedWorksheet?.id === ws.id
                              ? 'bg-primary-600 text-white'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          {source.name} - {ws.name}
                        </button>
                      ))
                    )}
                  </div>

                  {worksheetData && (
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="text-left px-4 py-3 font-medium text-gray-700">Column</th>
                            <th className="text-center px-4 py-3 font-medium text-gray-700">Can View</th>
                            <th className="text-center px-4 py-3 font-medium text-gray-700">Can Edit</th>
                            <th className="text-center px-4 py-3 font-medium text-gray-700">Needs Approval</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {worksheetData.columns.map(col => (
                            <tr key={col.id} className="hover:bg-gray-50">
                              <td className="px-4 py-3">
                                <div>
                                  <p className="font-medium text-gray-800">{col.display_name}</p>
                                  <p className="text-xs text-gray-400">{col.data_type}</p>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={permissions[col.id]?.can_view || false}
                                  onChange={() => togglePermission(col.id, 'can_view')}
                                  className="w-4 h-4 text-primary-600 rounded"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={permissions[col.id]?.can_edit || false}
                                  onChange={() => togglePermission(col.id, 'can_edit')}
                                  className="w-4 h-4 text-primary-600 rounded"
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={permissions[col.id]?.requires_approval || false}
                                  onChange={() => togglePermission(col.id, 'requires_approval')}
                                  disabled={!permissions[col.id]?.can_edit}
                                  className="w-4 h-4 text-primary-600 rounded disabled:opacity-40"
                                />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button
                onClick={() => setShowPermissionModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSavePermissions}
                disabled={submitting || !worksheetData}
                className="flex-1 px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg transition-colors"
              >
                {submitting ? 'Saving...' : 'Save Permissions'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPage;