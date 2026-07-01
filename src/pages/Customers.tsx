import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Customer, type Sale } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency, formatDate } from '../utils';
import { toast } from '../components/Toast';
import {
  Plus,
  Search,
  User,
  Phone,
  Mail,
  MapPin,
  Trash2,
  Edit2,
  History,
  FileText,
  DollarSign,
  X,
} from 'lucide-react';

export default function Customers() {
  const { settings } = useBusiness();
  const { currencySymbol, currency } = settings;

  // State Management
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomerForHistory, setSelectedCustomerForHistory] = useState<Customer | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    openingBalance: '',
    notes: '',
  });

  // Query database
  const customers = useLiveQuery(() => db.customers.toArray());

  // Customer specific sales (for history drawer)
  const customerSales = useLiveQuery(async () => {
    if (!selectedCustomerForHistory || !selectedCustomerForHistory.id) return [];
    const list = await db.sales
      .where('customerId')
      .equals(selectedCustomerForHistory.id)
      .toArray();
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedCustomerForHistory]);

  // Handle save customer
  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    const openingBalVal = parseFloat(formData.openingBalance || '0');

    if (!formData.name.trim()) {
      toast.error('Validation Error', 'Customer Name is required.');
      return;
    }

    try {
      const payload: Customer = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
        openingBalance: openingBalVal,
        currentBalance: editingCustomer ? editingCustomer.currentBalance : openingBalVal, // keep current balance on edits
        notes: formData.notes.trim(),
      };

      if (editingCustomer && editingCustomer.id) {
        payload.id = editingCustomer.id;
        payload.currentBalance = editingCustomer.currentBalance; // preserve current balance on edits
        await db.customers.put(payload);
        toast.success('Customer Updated', `${payload.name} updated successfully.`);
      } else {
        await db.customers.add(payload);
        toast.success('Customer Added', `${payload.name} added to ledger directory.`);
      }

      setShowAddEditModal(false);
      setEditingCustomer(null);
    } catch (err) {
      console.error(err);
      toast.error('Operation Failed', 'Could not save customer information.');
    }
  };

  // Open Edit Modal
  const openEditModal = (c: Customer) => {
    setEditingCustomer(c);
    setFormData({
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      openingBalance: String(c.openingBalance),
      notes: c.notes,
    });
    setShowAddEditModal(true);
  };

  // Delete Customer
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete customer "${name}"? This will delete their profile from the ledger.`)) {
      return;
    }

    try {
      await db.customers.delete(id);
      toast.success('Customer Removed', 'Customer deleted successfully.');
      if (selectedCustomerForHistory?.id === id) {
        setSelectedCustomerForHistory(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Delete Failed', 'Failed to delete customer.');
    }
  };

  // Filter list
  const filteredCustomers = customers?.filter((c) => {
    return (
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.address.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }) || [];

  return (
    <div className="space-y-6" id="customers-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Customer Directory
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Maintain customer profiles, balance adjustments, credit tracking, and detailed transaction ledgers.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingCustomer(null);
            setFormData({
              name: '',
              phone: '',
              email: '',
              address: '',
              openingBalance: '0',
              notes: '',
            });
            setShowAddEditModal(true);
          }}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Customer</span>
        </button>
      </div>

      {/* Grid of panels (Master Details Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Customer Directory Table (Master List) */}
        <div className={`lg:col-span-2 space-y-4`}>
          {/* Search Bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search customers by name, phone, email, address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Customer Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredCustomers.length === 0 ? (
              <div className="col-span-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
                <p className="font-medium text-base">No customers registered</p>
                <p className="text-xs mt-1">Add profiles to link with invoicing or track outstanding debt.</p>
              </div>
            ) : (
              filteredCustomers.map((c) => (
                <div
                  key={c.id}
                  className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative cursor-pointer ${selectedCustomerForHistory?.id === c.id ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-zinc-200 dark:border-zinc-800'}`}
                  onClick={() => setSelectedCustomerForHistory(c)}
                >
                  <div>
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">{c.name}</h3>
                        <p className="text-xs text-zinc-400 mt-1">ID: CUST-0{c.id}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Current Balance</span>
                        <p className={`font-bold mt-0.5 text-sm ${c.currentBalance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-600 dark:text-zinc-300'}`}>
                          {formatCurrency(c.currentBalance, currencySymbol, currency)}
                        </p>
                      </div>
                    </div>

                    {/* Contact details */}
                    <div className="mt-4 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {c.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{c.phone}</span>
                        </p>
                      )}
                      {c.email && (
                        <p className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{c.email}</span>
                        </p>
                      )}
                      {c.address && (
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{c.address}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions Row */}
                  <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedCustomerForHistory(c)}
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Ledger History</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(c)}
                        className="p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg cursor-pointer"
                        title="Edit Info"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => c.id && handleDelete(c.id, c.name)}
                        className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Customer History Drawer (Details Pane) */}
        <div className="lg:col-span-1">
          {selectedCustomerForHistory ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col h-full min-h-[400px]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Ledger History</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedCustomerForHistory.name}</p>
                </div>
                <button
                  onClick={() => setSelectedCustomerForHistory(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Balance Summary Box */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 grid grid-cols-2 gap-2 text-center">
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Opening Bal</span>
                  <p className="font-bold text-zinc-700 dark:text-zinc-300 mt-1">
                    {formatCurrency(selectedCustomerForHistory.openingBalance, currencySymbol, currency)}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Due Debt Balance</span>
                  <p className={`font-bold mt-1 ${selectedCustomerForHistory.currentBalance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                    {formatCurrency(selectedCustomerForHistory.currentBalance, currencySymbol, currency)}
                  </p>
                </div>
              </div>

              {/* Customer Notes */}
              {selectedCustomerForHistory.notes && (
                <div className="p-3 bg-indigo-50/25 dark:bg-indigo-950/10 border border-indigo-100/40 dark:border-indigo-950/40 rounded-xl text-xs">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-400">Internal Profile Notes:</span>
                  <p className="text-zinc-600 dark:text-zinc-400 mt-1 italic">{selectedCustomerForHistory.notes}</p>
                </div>
              )}

              {/* Transactions list */}
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Historical Invoices</h4>
                {!customerSales || customerSales.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl text-zinc-400 text-xs">
                    No sales invoices linked with this customer yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {customerSales.map((sale) => (
                      <div key={sale.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/80 rounded-xl flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{sale.invoiceNumber}</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(sale.date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                            {formatCurrency(sale.total, currencySymbol, currency)}
                          </p>
                          <span className="text-[9px] uppercase font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 mt-1 inline-block">
                            Invoice
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-zinc-50 dark:bg-zinc-900/40 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400 h-full flex flex-col justify-center min-h-[400px]">
              <History className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
              <p className="font-semibold text-sm">Ledger Profile Inspector</p>
              <p className="text-xs mt-1">Select any customer on the left to inspect their invoice history and detailed credit ledgers.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Customer Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <User className="w-5 h-5 text-indigo-500" />
                <span>{editingCustomer ? 'Edit Customer Info' : 'Add New Customer'}</span>
              </h3>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-5 space-y-4">
              {/* Full Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Customer / Business Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Acme Corp or John Doe"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Phone & Email */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" />
                    <span>Phone Number</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 555-0192"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" />
                    <span>Email Address</span>
                  </label>
                  <input
                    type="email"
                    placeholder="e.g. billing@acme.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Billing Address</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 123 Enterprise Way, NY"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              {/* Opening Balance */}
              {!editingCustomer && (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Opening Receivable Balance ({currencySymbol})</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.openingBalance}
                    onChange={(e) => setFormData({ ...formData, openingBalance: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none font-semibold text-amber-600"
                  />
                  <p className="text-[10px] text-zinc-400 mt-1">If customer already owes you funds before tracking them here, insert it above.</p>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Internal Notes (Optional)</label>
                <textarea
                  placeholder="e.g. Net-30 customer, VIP buyer..."
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none resize-none"
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Save Customer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
