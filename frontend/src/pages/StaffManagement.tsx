import React, { useState, useEffect } from 'react';
import { Users, UserPlus, Shield, Key, Trash2, Edit2, Check, X, Lock, ShieldCheck, UserCheck, ShoppingCart, Package, Clock, Truck, BarChart3, Settings } from 'lucide-react';
import { api } from '../services/api';
import { SupervisorPinModal } from '../components/SupervisorPinModal';
import { AVAILABLE_MODULES, type AppModule } from '../types';

interface StaffManagementProps {
  currentUser?: any;
  onElevateToAdmin?: () => void;
  onUserUpdated?: (user: any) => void;
}

export const StaffManagement: React.FC<StaffManagementProps> = ({
  currentUser,
  onElevateToAdmin,
  onUserUpdated,
}) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isAdminAuthModalOpen, setIsAdminAuthModalOpen] = useState<boolean>(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);

  const [formData, setFormData] = useState<{
    username: string;
    pin: string;
    role: string;
    permissions: AppModule[];
  }>({
    username: '',
    pin: '',
    role: 'cashier',
    permissions: ['pos'],
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getUsers();
      setUsers(data);
    } catch (err) {
      console.error('Failed to load users:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingUser(null);
    setFormData({
      username: '',
      pin: '',
      role: 'cashier',
      permissions: ['pos'],
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: any) => {
    setEditingUser(user);
    setFormData({
      username: user.username,
      pin: '',
      role: user.role,
      permissions: Array.isArray(user.permissions) ? user.permissions : ['pos'],
    });
    setErrorMessage(null);
    setIsModalOpen(true);
  };

  const toggleModule = (modId: AppModule) => {
    // If editing the main admin account and trying to deselect staff or settings, prevent lockout
    if ((editingUser?.id === 'usr_admin' || editingUser?.username === 'admin') && (modId === 'staff' || modId === 'settings')) {
      alert('The primary administrator must retain Staff & Access Control and Settings permissions to prevent system lockout.');
      return;
    }

    setFormData((prev) => {
      const exists = prev.permissions.includes(modId);
      const nextPerms = exists 
        ? prev.permissions.filter((m) => m !== modId)
        : [...prev.permissions, modId];
      return { ...prev, permissions: nextPerms };
    });
  };

  const handleRoleChange = (newRole: string) => {
    let defaultPerms: AppModule[] = ['pos'];
    if (newRole === 'admin') {
      defaultPerms = ['pos', 'inventory', 'customers', 'shifts', 'procurement', 'reports', 'staff', 'settings'];
    } else if (newRole === 'supervisor') {
      defaultPerms = ['pos', 'inventory', 'customers', 'shifts', 'reports'];
    }
    setFormData({
      ...formData,
      role: newRole,
      permissions: defaultPerms,
    });
  };

  const handleDelete = async (id: string, username: string) => {
    if (window.confirm(`Are you sure you want to delete user "${username}"?`)) {
      try {
        await api.deleteUser(id);
        loadUsers();
      } catch (err: any) {
        alert(err.message);
      }
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (formData.permissions.length === 0) {
      setErrorMessage('Please select at least one module for this user.');
      return;
    }

    try {
      if (editingUser) {
        const payload: any = {
          username: formData.username,
          role: formData.role,
          permissions: formData.permissions,
        };
        if (formData.pin) payload.pin = formData.pin;
        const updated = await api.updateUser(editingUser.id, payload);

        // If the edited user is currently logged in, sync session immediately
        if (currentUser?.id === editingUser.id) {
          const syncedUser = {
            ...currentUser,
            username: updated.username,
            role: updated.role,
            permissions: updated.permissions,
          };
          localStorage.setItem('pos_user', JSON.stringify(syncedUser));
          if (onUserUpdated) onUserUpdated(syncedUser);
        }
      } else {
        await api.createUser({
          username: formData.username,
          pin: formData.pin,
          role: formData.role,
          permissions: formData.permissions,
        });
      }
      setIsModalOpen(false);
      loadUsers();
    } catch (err: any) {
      setErrorMessage(err.message || 'Operation failed');
    }
  };

  const hasStaffAccess = Array.isArray(currentUser?.permissions)
    ? currentUser.permissions.includes('staff')
    : currentUser?.role === 'admin';

  if (!hasStaffAccess) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center h-[calc(100vh-53px)] bg-slate-950 p-6 select-none">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl flex flex-col items-center text-center space-y-4 animate-in fade-in zoom-in-95">
          <div className="w-16 h-16 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400 shadow-lg shadow-indigo-950/40">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white tracking-tight">Access Restricted</h2>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Staff accounts, cashiers, supervisors, and authentication PINs can only be managed by an <strong>Administrator</strong>.
            </p>
            <div className="mt-3 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] text-slate-400 inline-block font-mono">
              Current User: <strong className="text-slate-200">{currentUser?.username || 'cashier1'}</strong> ({currentUser?.role?.toUpperCase() || 'CASHIER'})
            </div>
          </div>

          {onElevateToAdmin && (
            <button
              onClick={() => setIsAdminAuthModalOpen(true)}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2 mt-2 shadow-lg shadow-indigo-950/40"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>Authorize with Admin PIN</span>
            </button>
          )}
        </div>

        <SupervisorPinModal
          isOpen={isAdminAuthModalOpen}
          actionDescription="Unlock Staff & Role Management"
          onClose={() => setIsAdminAuthModalOpen(false)}
          onAuthorized={() => {
            setIsAdminAuthModalOpen(false);
            if (onElevateToAdmin) onElevateToAdmin();
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-53px)] bg-slate-950 p-6 overflow-y-auto">
      <div className="max-w-6xl mx-auto w-full space-y-6 pb-12">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-indigo-400" />
              <span>User Creation & Access Provisioning (RBAC)</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Create cashiers, supervisors, and administrators, configure login PINs, and manage operational permissions.
            </p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-950/40 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create New User</span>
          </button>
        </div>

        {/* Access Provisioning & Roles Matrix Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-inner">
          <div className="flex items-center gap-2 pb-3 border-b border-slate-800 text-xs font-bold uppercase tracking-wider text-slate-300">
            <Shield className="w-4 h-4 text-indigo-400" />
            <span>Role Permissions & Access Matrix</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 text-xs">
            {/* Cashier Role */}
            <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400"></span>
                <h3 className="font-bold text-slate-100 text-sm">Cashier Role</h3>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Standard counter clerk handling sales, customer billing, and register operations.
              </p>
              <ul className="text-[11px] text-slate-300 space-y-1 pt-1">
                <li className="flex items-center gap-1.5 text-emerald-400">✓ Fast Barcode Scanning & Billing</li>
                <li className="flex items-center gap-1.5 text-emerald-400">✓ Cash & Card Tender & Receipts</li>
                <li className="flex items-center gap-1.5 text-emerald-400">✓ Hold & Recall Active Carts</li>
                <li className="flex items-center gap-1.5 text-slate-500">✕ Custom Discounts &gt; $5 (Requires Sup.)</li>
                <li className="flex items-center gap-1.5 text-slate-500">✕ Access Admin & System Settings</li>
              </ul>
            </div>

            {/* Supervisor Role */}
            <div className="bg-slate-950/60 border border-amber-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
                <h3 className="font-bold text-slate-100 text-sm">Supervisor Role</h3>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Floor supervisor approving cashier exceptions and inspecting mid-shift registers.
              </p>
              <ul className="text-[11px] text-slate-300 space-y-1 pt-1">
                <li className="flex items-center gap-1.5 text-emerald-400">✓ All Cashier Billing Privileges</li>
                <li className="flex items-center gap-1.5 text-amber-400">✓ Authorize Large Custom Discounts</li>
                <li className="flex items-center gap-1.5 text-amber-400">✓ Mid-Shift X-Report Cash Audits</li>
                <li className="flex items-center gap-1.5 text-amber-400">✓ Void Line Items & Transactions</li>
                <li className="flex items-center gap-1.5 text-slate-500">✕ Create / Delete Staff Accounts</li>
              </ul>
            </div>

            {/* Admin Role */}
            <div className="bg-slate-950/60 border border-indigo-500/30 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-400"></span>
                <h3 className="font-bold text-slate-100 text-sm">Administrator Role</h3>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Store owner or general manager with unrestricted system control.
              </p>
              <ul className="text-[11px] text-slate-300 space-y-1 pt-1">
                <li className="flex items-center gap-1.5 text-indigo-400">✓ Full Access to All Modules</li>
                <li className="flex items-center gap-1.5 text-indigo-400">✓ User Creation & PIN Management</li>
                <li className="flex items-center gap-1.5 text-indigo-400">✓ Modular Feature Switchboard (Toggles)</li>
                <li className="flex items-center gap-1.5 text-indigo-400">✓ End-of-Day Z-Report Settlement</li>
                <li className="flex items-center gap-1.5 text-indigo-400">✓ Inventory Master & Procurement</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Staff Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
          <div className="px-5 py-3 border-b border-slate-800 font-bold text-xs text-slate-300 uppercase tracking-wider flex items-center justify-between">
            <span>Staff Roster & Active Accounts ({users.length})</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300 border-collapse">
              <thead className="bg-slate-850 border-b border-slate-800 text-slate-400 uppercase font-semibold text-[11px] tracking-wider">
                <tr>
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role Presets</th>
                  <th className="py-3 px-4">Assigned Modules (Access Rights)</th>
                  <th className="py-3 px-4">PIN Status</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {users.map((u) => {
                  const isAdmin = u.role === 'admin';
                  const isSupervisor = u.role === 'supervisor';
                  const perms = Array.isArray(u.permissions) ? u.permissions : [];

                  return (
                    <tr key={u.id} className="hover:bg-slate-800/40 transition text-xs">
                      <td className="py-3 px-4 font-semibold text-white flex items-center gap-2.5">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs ${
                          isAdmin ? 'bg-indigo-500/20 text-indigo-400' : isSupervisor ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400'
                        }`}>
                          {u.username.slice(0, 2).toUpperCase()}
                        </div>
                        <span>{u.username}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide font-mono ${
                          isAdmin
                            ? 'bg-indigo-950 text-indigo-300 border border-indigo-800'
                            : isSupervisor
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex flex-wrap gap-1 max-w-sm">
                          {perms.length === 7 ? (
                            <span className="px-2 py-0.5 rounded-md bg-indigo-950/90 border border-indigo-700/70 text-indigo-300 font-mono text-[10px] font-bold">
                              ★ All Modules (Full Access)
                            </span>
                          ) : perms.length === 0 ? (
                            <span className="text-[10px] text-rose-400 italic">No modules granted</span>
                          ) : (
                            perms.map((p: string) => {
                              const mod = AVAILABLE_MODULES.find((m) => m.id === p);
                              return (
                                <span
                                  key={p}
                                  className="px-2 py-0.5 rounded-md bg-slate-800/90 border border-slate-700 text-slate-200 text-[10px] font-medium"
                                  title={mod?.description || p}
                                >
                                  {mod?.name || p}
                                </span>
                              );
                            })
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-400">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Lock className="w-3 h-3 text-slate-500" />
                          <span>•••• (Protected)</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Active'}
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        <button
                          onClick={() => handleOpenEdit(u)}
                          className="p-1.5 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Edit User / Assign Modules"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(u.id, u.username)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Delete User"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* User Add / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-400" />
                <span>{editingUser ? `Configure Staff: ${editingUser.username}` : 'Create New Staff Member'}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMessage && (
              <div className="mx-6 mt-4 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs text-center">
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Username *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="e.g. cashier2 or sarah"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-indigo-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    {editingUser ? 'New PIN (Leave blank to keep unchanged)' : '4-Digit Login PIN *'}
                  </label>
                  <input
                    type="password"
                    maxLength={6}
                    required={!editingUser}
                    value={formData.pin}
                    onChange={(e) => setFormData({ ...formData, pin: e.target.value })}
                    placeholder="e.g. 5566"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white font-mono tracking-widest outline-hidden focus:border-indigo-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Role Title / Primary Classification *
                </label>
                <select
                  value={formData.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-indigo-400 font-semibold"
                >
                  <option value="cashier">Cashier (Default POS Billing Counter)</option>
                  <option value="supervisor">Supervisor (Cashier + X-Report + Discounts)</option>
                  <option value="admin">Administrator (Complete System Ownership)</option>
                </select>
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Selecting a role pre-fills default modules, which you can freely customize below.
                </span>
              </div>

              {/* Dynamic Module Permission Selector */}
              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div>
                    <label className="block text-xs font-bold text-indigo-300 uppercase tracking-wider">
                      Assigned System Modules ({formData.permissions.length} / {AVAILABLE_MODULES.length})
                    </label>
                    <p className="text-[11px] text-slate-400">
                      Select which navigation modules and workspaces are accessible to this user.
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: ['pos'] })}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-400 font-semibold transition cursor-pointer"
                    >
                      Cashier
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: ['pos', 'inventory', 'customers', 'shifts', 'reports'] })}
                      className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 font-semibold transition cursor-pointer"
                    >
                      Supervisor
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, permissions: AVAILABLE_MODULES.map((m) => m.id) })}
                      className="px-2 py-1 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 font-bold transition cursor-pointer"
                    >
                      All Modules
                    </button>
                  </div>
                </div>

                {/* Module Checklist Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                  {AVAILABLE_MODULES.map((mod) => {
                    const isChecked = formData.permissions.includes(mod.id);
                    const isMainAdminRequired = (editingUser?.id === 'usr_admin' || editingUser?.username === 'admin') && (mod.id === 'staff' || mod.id === 'settings');

                    return (
                      <div
                        key={mod.id}
                        onClick={() => !isMainAdminRequired && toggleModule(mod.id)}
                        className={`p-3 rounded-2xl border transition flex items-start gap-3 cursor-pointer ${
                          isChecked
                            ? 'bg-slate-800/90 border-indigo-500/70 shadow-sm'
                            : 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700 opacity-60 hover:opacity-100'
                        } ${isMainAdminRequired ? 'cursor-not-allowed opacity-90' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          disabled={isMainAdminRequired}
                          onChange={() => !isMainAdminRequired && toggleModule(mod.id)}
                          className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-400 cursor-pointer"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-bold ${isChecked ? 'text-white' : 'text-slate-300'}`}>
                              {mod.name}
                            </span>
                            {isMainAdminRequired && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-950 text-indigo-400 border border-indigo-800 font-mono font-bold uppercase">
                                Protected
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight mt-1">
                            {mod.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-white text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-indigo-950/40 cursor-pointer"
                >
                  {editingUser ? 'Update Staff Member' : 'Save Staff Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
