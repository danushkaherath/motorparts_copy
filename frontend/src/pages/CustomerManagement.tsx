import React, { useState, useEffect } from 'react';
import { 
  Users, 
  UserPlus, 
  Search, 
  Star, 
  Phone, 
  Mail, 
  MapPin, 
  ShoppingBag, 
  Calendar, 
  Edit, 
  Trash2, 
  X, 
  Check, 
  Receipt, 
  History,
  Sliders
} from 'lucide-react';
import type { Customer, AppSettings } from '../types';
import { api } from '../services/api';

interface CustomerManagementProps {
  settings: AppSettings | null;
  currentUser?: any;
  onSettingsUpdated?: (newSettings: AppSettings) => void;
}

export const CustomerManagement: React.FC<CustomerManagementProps> = ({
  settings,
  currentUser,
  onSettingsUpdated,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  
  // History Modal
  const [historyCustomer, setHistoryCustomer] = useState<Customer | null>(null);
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  // Form fields
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    points: 0,
    notes: '',
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const currency = settings?.currency_symbol || '$';
  const loyaltyPointValue = parseFloat(settings?.loyalty_point_value || '1.0') || 1.0;

  // Loyalty Rules Modal (Admin Only)
  const [isRulesModalOpen, setIsRulesModalOpen] = useState<boolean>(false);
  const [spendPerPointInput, setSpendPerPointInput] = useState<string>(settings?.loyalty_spend_per_point || '100');
  const [pointValueInput, setPointValueInput] = useState<string>(settings?.loyalty_point_value || '1.0');
  const [isLoyaltyActive, setIsLoyaltyActive] = useState<boolean>(settings?.feature_loyalty !== 'false');
  const [isSavingRules, setIsSavingRules] = useState<boolean>(false);
  const [rulesSuccessMsg, setRulesSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setSpendPerPointInput(settings.loyalty_spend_per_point || '100');
      setPointValueInput(settings.loyalty_point_value || '1.0');
      setIsLoyaltyActive(settings.feature_loyalty !== 'false');
    }
  }, [settings]);

  const handleSaveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSavingRules(true);
      const res = await api.updateSettings({
        loyalty_spend_per_point: spendPerPointInput,
        loyalty_point_value: pointValueInput,
        feature_loyalty: isLoyaltyActive ? 'true' : 'false',
      });
      if (onSettingsUpdated && res.settings) {
        onSettingsUpdated(res.settings);
      }
      setRulesSuccessMsg('Loyalty rules updated successfully!');
      setTimeout(() => {
        setRulesSuccessMsg(null);
        setIsRulesModalOpen(false);
      }, 1200);
    } catch (err: any) {
      alert('Failed to save rules: ' + err.message);
    } finally {
      setIsSavingRules(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    try {
      setLoading(true);
      const data = await api.getCustomers();
      setCustomers(data.customers || []);
    } catch (err) {
      console.error('Failed to load customers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAdd = () => {
    setEditingCustomer(null);
    setFormData({
      name: '',
      phone: '',
      email: '',
      address: '',
      points: 0,
      notes: '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email || '',
      address: customer.address || '',
      points: customer.points || 0,
      notes: customer.notes || '',
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleOpenHistory = async (customer: Customer) => {
    setHistoryCustomer(customer);
    try {
      setLoadingOrders(true);
      const orders = await api.getCustomerOrders(customer.id);
      setCustomerOrders(orders);
    } catch (err) {
      console.error('Failed to load customer orders:', err);
      setCustomerOrders([]);
    } finally {
      setLoadingOrders(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!formData.name.trim() || !formData.phone.trim()) {
      setFormError('Name and Mobile Phone are required.');
      return;
    }

    try {
      setIsSubmitting(true);
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, {
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          points: Number(formData.points) || 0,
          notes: formData.notes.trim() || undefined,
        });
      } else {
        await api.createCustomer({
          name: formData.name.trim(),
          phone: formData.phone.trim(),
          email: formData.email.trim() || undefined,
          address: formData.address.trim() || undefined,
          points: Number(formData.points) || 0,
          notes: formData.notes.trim() || undefined,
        });
      }
      setIsModalOpen(false);
      loadCustomers();
    } catch (err: any) {
      setFormError(err.message || 'Failed to save customer');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (confirm(`Are you sure you want to delete customer "${name}"?`)) {
      try {
        await api.deleteCustomer(id);
        loadCustomers();
      } catch (err: any) {
        alert('Failed to delete customer: ' + err.message);
      }
    }
  };

  // Filter customers by search term
  const filteredCustomers = (customers || []).filter((c) => {
    if (!c) return false;
    const term = searchTerm.toLowerCase().trim();
    if (!term) return true;
    const nameMatch = (c.name || '').toLowerCase().includes(term);
    const phoneMatch = (c.phone || '').toLowerCase().includes(term);
    const emailMatch = c.email ? c.email.toLowerCase().includes(term) : false;
    return nameMatch || phoneMatch || emailMatch;
  });

  // Calculate statistics safely
  const totalPoints = (customers || []).reduce((acc, c) => acc + (Number(c.points) || 0), 0);
  const totalRevenue = (customers || []).reduce((acc, c) => acc + (Number(c.total_spent) || 0), 0);
  const totalVisits = (customers || []).reduce((acc, c) => acc + (Number(c.visits_count) || 0), 0);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-950 p-3 sm:p-6 overflow-y-auto select-none">
      <div className="max-w-7xl mx-auto w-full space-y-4 sm:space-y-6 pb-12">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl font-black text-white flex items-center gap-2">
              <Users className="w-5 h-5 text-pink-400" />
              <span>Customer Directory & Loyalty Program</span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Manage registered shoppers, monitor rewards points, and review customer purchase history.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {currentUser?.role === 'admin' && (
              <button
                onClick={() => setIsRulesModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-750 text-amber-300 rounded-xl text-xs font-bold transition shadow-md cursor-pointer"
                title="Admin: Configure Loyalty Points Earning Formula and Redemption Value"
              >
                <Sliders className="w-4 h-4 text-amber-400" />
                <span>Loyalty Rules (Admin)</span>
              </button>
            )}

            <button
              onClick={handleOpenAdd}
              className="flex items-center gap-2 px-4 py-2 bg-pink-600 hover:bg-pink-500 text-white rounded-xl text-xs font-bold transition shadow-md shadow-pink-950/40 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>+ Register Customer</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Total Customers</span>
              <Users className="w-4 h-4 text-pink-400" />
            </div>
            <div className="text-2xl font-black text-white mt-1 font-mono">{customers.length}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Registered accounts</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Active Points Balance</span>
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
            </div>
            <div className="text-2xl font-black text-amber-400 mt-1 font-mono">{totalPoints.toLocaleString()}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Worth {currency}{(totalPoints * loyaltyPointValue).toFixed(2)} in discounts
            </div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Customer Revenue</span>
              <ShoppingBag className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-black text-emerald-400 mt-1 font-mono">
              {currency}{totalRevenue.toFixed(2)}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Tracked POS sales</div>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Total Store Visits</span>
              <Calendar className="w-4 h-4 text-cyan-400" />
            </div>
            <div className="text-2xl font-black text-cyan-400 mt-1 font-mono">{totalVisits}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Checkouts completed</div>
          </div>
        </div>

        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by customer name, mobile phone number, or email..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 outline-hidden focus:border-pink-500"
            />
          </div>
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-xl cursor-pointer"
            >
              Clear
            </button>
          )}
        </div>

        {/* Customers Table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Customer Name & Contact</th>
                  <th className="py-3 px-4">Mobile Phone</th>
                  <th className="py-3 px-4 text-center">Loyalty Points</th>
                  <th className="py-3 px-4 text-right">Total Spent</th>
                  <th className="py-3 px-4 text-center">Visits</th>
                  <th className="py-3 px-4">Member Since</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      Loading customer directory...
                    </td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-500">
                      No customers match your search query.
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((cust) => (
                    <tr key={cust.id} className="hover:bg-slate-800/40 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-white text-sm">{cust.name}</div>
                        {cust.email && (
                          <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <Mail className="w-3 h-3 text-slate-500" />
                            <span>{cust.email}</span>
                          </div>
                        )}
                        {cust.address && (
                          <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-slate-600" />
                            <span>{cust.address}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 font-mono font-bold text-cyan-300">
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-500" />
                          <span>{cust.phone}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 font-bold font-mono text-xs">
                          <Star className="w-3 h-3 fill-amber-400" />
                          <span>{Number(cust.points || 0)} pts</span>
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {currency}{((Number(cust.points) || 0) * loyaltyPointValue).toFixed(2)} value
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-400">
                        {currency}{Number(cust.total_spent || 0).toFixed(2)}
                      </td>

                      <td className="py-3 px-4 text-center font-mono text-slate-300">
                        <span className="px-2 py-0.5 rounded-lg bg-slate-800 border border-slate-700 text-[11px]">
                          {Number(cust.visits_count || 0)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">
                        {cust.created_at ? new Date(cust.created_at).toLocaleDateString() : 'Active'}
                      </td>

                      <td className="py-3 px-4 text-right space-x-1">
                        <button
                          onClick={() => handleOpenHistory(cust)}
                          className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="View Order History"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleOpenEdit(cust)}
                          className="p-1.5 text-slate-400 hover:text-pink-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Edit Customer / Adjust Points"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(cust.id, cust.name)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Delete Customer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="w-5 h-5 text-pink-400" />
                <span>{editingCustomer ? `Edit Customer: ${editingCustomer.name}` : 'Register New Customer'}</span>
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="mx-6 mt-4 p-2.5 rounded-xl bg-rose-950/60 border border-rose-800/80 text-rose-300 text-xs text-center shrink-0">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Kasun Perera"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-pink-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Mobile Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="e.g. 0771234567"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white font-mono outline-hidden focus:border-pink-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="e.g. kasun@example.com"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-pink-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                    <span>Loyalty Points Balance</span>
                    <span className="text-[10px] text-amber-400 font-normal">
                      Value: {currency}{(formData.points * loyaltyPointValue).toFixed(2)}
                    </span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={formData.points}
                    onChange={(e) => setFormData({ ...formData, points: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-amber-300 font-mono outline-hidden focus:border-pink-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Physical Address (Optional)
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="e.g. 124 Main Street, Colombo 03"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-pink-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Internal Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="e.g. VIP regular shopper, preferred delivery instructions..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2 px-3 text-xs text-white outline-hidden focus:border-pink-400 resize-none"
                />
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-md shadow-pink-950/40"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingCustomer ? 'Update Customer' : 'Register Customer'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Customer Purchase History Modal */}
      {historyCustomer && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
                  <Receipt className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white">{historyCustomer.name}</h2>
                  <p className="text-xs text-slate-400 font-mono">{historyCustomer.phone} • Purchase History</p>
                </div>
              </div>
              <button
                onClick={() => setHistoryCustomer(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1 space-y-3">
              {loadingOrders ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  Loading order history...
                </div>
              ) : customerOrders.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No orders found for this customer yet.
                </div>
              ) : (
                customerOrders.map((ord) => (
                  <div 
                    key={ord.id}
                    className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-200">{ord.order_number}</span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          ord.payment_method === 'CASH' 
                            ? 'bg-emerald-500/20 text-emerald-300' 
                            : ord.payment_method === 'CARD'
                            ? 'bg-cyan-500/20 text-cyan-300'
                            : 'bg-purple-500/20 text-purple-300'
                        }`}>
                          {ord.payment_method}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono mt-1">
                        {new Date(ord.created_at).toLocaleString()} • Cashier: {ord.cashier_name}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="font-mono font-bold text-sm text-emerald-400">
                        {currency}{(ord.total_amount || 0).toFixed(2)}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] mt-0.5 justify-end font-mono">
                        {ord.points_earned > 0 && (
                          <span className="text-emerald-400">+{ord.points_earned} pts</span>
                        )}
                        {ord.points_redeemed > 0 && (
                          <span className="text-amber-400">-{ord.points_redeemed} pts</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 text-right">
              <button
                type="button"
                onClick={() => setHistoryCustomer(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Loyalty Program Rules Modal */}
      {isRulesModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center z-[90] p-4 select-none">
          <div className="bg-slate-900 border border-slate-750 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-950/40">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Loyalty Point Rules Configuration</span>
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-mono uppercase font-bold border border-amber-500/40">
                      Admin Control
                    </span>
                  </h2>
                  <p className="text-xs text-slate-400">Decide how shoppers earn points and discount redemption value.</p>
                </div>
              </div>
              <button
                onClick={() => setIsRulesModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {rulesSuccessMsg && (
              <div className="mx-6 mt-4 p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-800/80 text-emerald-300 text-xs text-center font-bold shrink-0">
                {rulesSuccessMsg}
              </div>
            )}

            <form onSubmit={handleSaveRules} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Program Status Toggle */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-200">Loyalty Program Status</div>
                  <div className="text-[11px] text-slate-400">Enable points accumulation and counter redemption</div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsLoyaltyActive(!isLoyaltyActive)}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                    isLoyaltyActive ? 'bg-pink-600 justify-end' : 'bg-slate-700 justify-start'
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md" />
                </button>
              </div>

              {/* Rule 1: Earning Ratio */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Spend to Earn 1 Point ({currency}) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  required
                  value={spendPerPointInput}
                  onChange={(e) => setSpendPerPointInput(e.target.value)}
                  placeholder="e.g. 100"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm text-amber-300 font-mono font-bold outline-hidden focus:border-amber-400"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Customer earns <strong>1 point</strong> for every <strong>{currency}{spendPerPointInput || '100'}</strong> spent.
                  <br />
                  <span className="text-slate-500 font-mono text-[10px]">
                    Formula: Points Earned = Math.floor(Order Total / {spendPerPointInput || '100'})
                  </span>
                </p>
              </div>

              {/* Rule 2: Redemption Value */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Discount Value Per 1 Point Redeemed ({currency}) *
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  required
                  value={pointValueInput}
                  onChange={(e) => setPointValueInput(e.target.value)}
                  placeholder="e.g. 1.00"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl py-2.5 px-3 text-sm text-emerald-300 font-mono font-bold outline-hidden focus:border-emerald-400"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Each redeemed point reduces the checkout total by <strong>{currency}{pointValueInput || '1.00'}</strong>.
                </p>
              </div>

              {/* Live Calculator Simulation Box */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
                <div className="text-slate-400 font-semibold uppercase tracking-wider text-[10px]">
                  Live Preview with Current Settings:
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>If customer spends {currency}500.00:</span>
                  <span className="font-bold text-amber-300 font-mono">
                    +{Math.floor(500 / (parseFloat(spendPerPointInput) || 100))} pts
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>If customer spends {currency}1,000.00:</span>
                  <span className="font-bold text-amber-300 font-mono">
                    +{Math.floor(1000 / (parseFloat(spendPerPointInput) || 100))} pts
                  </span>
                </div>
                <div className="flex justify-between text-slate-400 text-[11px] pt-1.5 border-t border-slate-800">
                  <span>10 points redeemed at checkout:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    -{currency}{(10 * (parseFloat(pointValueInput) || 1.0)).toFixed(2)} discount
                  </span>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsRulesModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingRules}
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold rounded-xl text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md shadow-amber-950/40"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSavingRules ? 'Saving...' : 'Save Loyalty Rules'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
