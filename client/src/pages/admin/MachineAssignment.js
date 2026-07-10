import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { Cpu, UserCircle, X, Plus, Settings2, Save, Search } from 'lucide-react';
import { ListSkeleton } from '../../components/shared/skeletons';
import { DEFAULT_EFFICIENCY_THRESHOLD } from '../../constants/thresholds';

const MachineAssignment = () => {
  const [employees, setEmployees] = useState([]);
  const [allMachines, setAllMachines] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [assignedMachines, setAssignedMachines] = useState([]);
  const [thresholds, setThresholds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [assignedLoading, setAssignedLoading] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [machineSearch, setMachineSearch] = useState('');
  const [thresholdForm, setThresholdForm] = useState({ worksheet_id: '', process_type: '', min_threshold: DEFAULT_EFFICIENCY_THRESHOLD, alert_enabled: true });
  const [editingThresholdId, setEditingThresholdId] = useState(null);
  const [savingThreshold, setSavingThreshold] = useState(false);

  useEffect(() => {
    fetchInitialData();
  }, []);

  const fetchInitialData = async () => {
    try {
      const [usersRes, sourcesRes, thresholdsRes] = await Promise.all([
        api.get('/users'),
        api.get('/spreadsheets'),
        api.get('/machines/thresholds')
      ]);

      setEmployees(usersRes.data.data.users.filter(u => !u.is_admin));
      setThresholds(thresholdsRes.data.data.thresholds);

      const sources = sourcesRes.data.data.sources;
      const worksheets = sources.flatMap(s => s.worksheets.map(ws => ({ ...ws, sourceName: s.name })));

      const machinesByWorksheet = await Promise.all(
        worksheets.map(async ws => {
          const res = await api.get(`/spreadsheets/worksheet/${ws.id}/data?limit=1000`);
          return res.data.data.rows.map(row => ({
            row_id: row.id,
            worksheet_id: ws.id,
            worksheet_name: ws.display_name || ws.name,
            machine_name: row.data?.machine_no || row.row_identifier || `Row ${row.row_index + 1}`,
            process_type: row.data?.process || '—'
          }));
        })
      );

      setAllMachines(machinesByWorksheet.flat());
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedMachines = useCallback(async (employeeId) => {
    setAssignedLoading(true);
    try {
      const res = await api.get(`/machines/employee/${employeeId}`);
      setAssignedMachines(res.data.data.assignments);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setAssignedLoading(false);
    }
  }, []);

  const selectEmployee = (employee) => {
    setSelectedEmployee(employee);
    fetchAssignedMachines(employee.id);
  };

  const handleAssign = async (machine) => {
    try {
      await api.post('/machines/assign', {
        employee_id: selectedEmployee.id,
        row_id: machine.row_id,
        worksheet_id: machine.worksheet_id
      });
      toast.success(`${machine.machine_name} assigned to ${selectedEmployee.full_name}`);
      fetchAssignedMachines(selectedEmployee.id);
    } catch (error) {
      // error toast handled by the axios response interceptor
    }
  };

  const handleUnassign = async (assignmentId, machineName) => {
    try {
      await api.delete(`/machines/assign/${assignmentId}`);
      toast.success(`${machineName} unassigned`);
      fetchAssignedMachines(selectedEmployee.id);
    } catch (error) {
      // error toast handled by the axios response interceptor
    }
  };

  const handleSaveThreshold = async (e) => {
    e.preventDefault();
    setSavingThreshold(true);
    try {
      await api.post('/machines/threshold', thresholdForm);
      toast.success('Efficiency threshold saved');
      setThresholdForm({ worksheet_id: '', process_type: '', min_threshold: DEFAULT_EFFICIENCY_THRESHOLD, alert_enabled: true });
      setEditingThresholdId(null);
      const res = await api.get('/machines/thresholds');
      setThresholds(res.data.data.thresholds);
    } catch (error) {
      // error toast handled by the axios response interceptor
    } finally {
      setSavingThreshold(false);
    }
  };

  const startEditThreshold = (threshold) => {
    setEditingThresholdId(threshold.id);
    setThresholdForm({
      worksheet_id: threshold.worksheet_id,
      process_type: threshold.process_type,
      min_threshold: parseFloat(threshold.min_threshold),
      alert_enabled: threshold.alert_enabled
    });
  };

  const worksheetOptions = useMemo(() => {
    const seen = new Map();
    allMachines.forEach(m => seen.set(m.worksheet_id, m.worksheet_name));
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [allMachines]);

  const filteredEmployees = employees.filter(e =>
    e.full_name.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    e.email.toLowerCase().includes(employeeSearch.toLowerCase())
  );

  const assignedRowIds = new Set(assignedMachines.map(a => a.row.id));
  const availableMachines = allMachines
    .filter(m => !assignedRowIds.has(m.row_id))
    .filter(m => m.machine_name.toLowerCase().includes(machineSearch.toLowerCase()));

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div>
          <div className="h-7 w-56 bg-gray-200 rounded animate-pulse" />
          <div className="h-4 w-72 bg-gray-200 rounded animate-pulse mt-2" />
        </div>
        <ListSkeleton items={5} />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Cpu size={24} className="text-primary-600" />
          Machine Assignment
        </h1>
        <p className="text-gray-500 mt-1">Assign machines to employees and configure efficiency thresholds</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 lg:col-span-1">
          <div className="p-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800 mb-3">Employees</h2>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                maxLength={100}
                placeholder="Search employees..."
                value={employeeSearch}
                onChange={e => setEmployeeSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
          </div>
          <div className="max-h-[32rem] overflow-y-auto divide-y divide-gray-100">
            {filteredEmployees.map(employee => (
              <button
                key={employee.id}
                onClick={() => selectEmployee(employee)}
                className={`w-full text-left p-4 flex items-center gap-3 transition-colors ${
                  selectedEmployee?.id === employee.id ? 'bg-primary-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="w-9 h-9 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <UserCircle size={20} className="text-primary-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{employee.full_name}</p>
                  <p className="text-xs text-gray-500 truncate">{employee.role?.name || 'No role'}</p>
                </div>
              </button>
            ))}
            {filteredEmployees.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-500">No employees found</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          {!selectedEmployee ? (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
              <Cpu size={40} className="text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">Select an employee to manage their machine assignments</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-100">
                  <h2 className="font-semibold text-gray-800">
                    Assigned Machines — {selectedEmployee.full_name}
                  </h2>
                </div>
                <div className="divide-y divide-gray-100">
                  {assignedLoading ? (
                    <div className="p-6"><ListSkeleton items={2} /></div>
                  ) : assignedMachines.length === 0 ? (
                    <p className="p-6 text-center text-sm text-gray-500">No machines assigned yet</p>
                  ) : (
                    assignedMachines.map(assignment => (
                      <div key={assignment.assignment_id || assignment.id} className="p-4 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-800">{assignment.row.data?.machine_no || assignment.row.row_identifier}</p>
                          <p className="text-xs text-gray-500">{assignment.worksheet.display_name || assignment.worksheet.name}</p>
                        </div>
                        <button
                          onClick={() => handleUnassign(assignment.id, assignment.row.data?.machine_no || assignment.row.row_identifier)}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        >
                          <X size={14} />
                          Unassign
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                <div className="p-4 border-b border-gray-100 space-y-3">
                  <h2 className="font-semibold text-gray-800">Available Machines</h2>
                  <div className="relative">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      maxLength={100}
                      placeholder="Search machines..."
                      value={machineSearch}
                      onChange={e => setMachineSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                    />
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto divide-y divide-gray-100">
                  {availableMachines.map(machine => (
                    <div key={`${machine.worksheet_id}_${machine.row_id}`} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-800">{machine.machine_name}</p>
                        <p className="text-xs text-gray-500">{machine.worksheet_name} • {machine.process_type}</p>
                      </div>
                      <button
                        onClick={() => handleAssign(machine)}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg transition-colors"
                      >
                        <Plus size={14} />
                        Assign
                      </button>
                    </div>
                  ))}
                  {availableMachines.length === 0 && (
                    <p className="p-6 text-center text-sm text-gray-500">No available machines</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-5 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800 flex items-center gap-2">
            <Settings2 size={18} className="text-primary-600" />
            Efficiency Thresholds
          </h2>
          <p className="text-sm text-gray-500 mt-1">Set the minimum OE% per process type before an alert is raised</p>
        </div>
        <div className="p-5 border-b border-gray-100">
          <form onSubmit={handleSaveThreshold} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 mb-1">Worksheet</label>
              <select
                required
                value={thresholdForm.worksheet_id}
                onChange={e => setThresholdForm({ ...thresholdForm, worksheet_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              >
                <option value="">Select worksheet</option>
                {worksheetOptions.map(ws => (
                  <option key={ws.id} value={ws.id}>{ws.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Process Type</label>
              <input
                type="text"
                required
                maxLength={100}
                value={thresholdForm.process_type}
                onChange={e => setThresholdForm({ ...thresholdForm, process_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
                placeholder="e.g. weaving"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Min Threshold (%)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="100"
                required
                value={thresholdForm.min_threshold}
                onChange={e => setThresholdForm({ ...thresholdForm, min_threshold: e.target.value })}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={thresholdForm.alert_enabled}
                  onChange={e => setThresholdForm({ ...thresholdForm, alert_enabled: e.target.checked })}
                  className="rounded"
                />
                Alerts On
              </label>
              <button
                type="submit"
                disabled={savingThreshold}
                className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-300 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Save size={14} />
                {editingThresholdId ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Worksheet</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Process Type</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Min Threshold</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Alerts</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {thresholds.map(threshold => (
                <tr key={threshold.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-gray-700">{threshold.worksheet?.display_name || threshold.worksheet?.name}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{threshold.process_type}</td>
                  <td className="px-5 py-3 text-sm text-gray-700">{parseFloat(threshold.min_threshold)}%</td>
                  <td className="px-5 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${threshold.alert_enabled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {threshold.alert_enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => startEditThreshold(threshold)}
                      className="text-xs font-medium text-primary-600 hover:text-primary-700"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {thresholds.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-500">No thresholds configured yet</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default MachineAssignment;
