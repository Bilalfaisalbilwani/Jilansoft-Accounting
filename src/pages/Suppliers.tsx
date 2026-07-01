import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Supplier, type Purchase } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency, formatDate } from '../utils';
import { toast } from '../components/Toast';
import {
  Plus,
  Search,
  Briefcase,
  Phone,
  Mail,
  MapPin,
  Trash2,
  Edit2,
  History,
  X,
} from 'lucide-react';

export default function Suppliers() {
  const { settings } = useBusiness();
  const { currencySymbol, currency } = settings;

  // State Management
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [selectedSupplierForHistory, setSelectedSupplierForHistory] = useState<Supplier | null>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    address: '',
    balance: '',
    notes: '',
  });

  // Query Database
  const suppliers = useLiveQuery(() => db.suppliers.toArray());

  // Supplier specific purchases (for history)
  const supplierPurchases = useLiveQuery(async () => {
    if (!selectedSupplierForHistory || !selectedSupplierForHistory.id) return [];
    const list = await db.purchases
      .where('supplierId')
      .equals(selectedSupplierForHistory.id)
      .toArray();
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [selectedSupplierForHistory]);

  // Handle Save
  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    const balanceVal = parseFloat(formData.balance || '0');

    if (!formData.name.trim()) {
      toast.error('Validation Error', 'Supplier Name is required.');
      return;
    }

    try {
      const payload: Supplier = {
        name: formData.name.trim(),
        phone: formData.phone.trim(),
        email: formData.email.trim(),
        address: formData.address.trim(),
        balance: balanceVal,
        notes: formData.notes.trim(),
      };

      if (editingSupplier && editingSupplier.id) {
        payload.id = editingSupplier.id;
        await db.suppliers.put(payload);
        toast.success('Supplier Updated', `${payload.name} has been updated.`);
      } else {
        await db.suppliers.add(payload);
        toast.success('Supplier Added', `${payload.name} added to catalog.`);
      }

      setShowAddEditModal(false);
      setEditingSupplier(null);
    } catch (err) {
      console.error(err);
      toast.error('Operation Failed', 'Could not save supplier information.');
    }
  };

  // Open Edit Modal
  const openEditModal = (s: Supplier) => {
    setEditingSupplier(s);
    setFormData({
      name: s.name,
      phone: s.phone,
      email: s.email,
      address: s.address,
      balance: String(s.balance),
      notes: s.notes || '',
    });
    setShowAddEditModal(true);
  };

  // Delete Supplier
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete supplier "${name}"?`)) {
      return;
    }

    try {
      await db.suppliers.delete(id);
      toast.success('Supplier Removed', 'Supplier deleted successfully.');
      if (selectedSupplierForHistory?.id === id) {
        setSelectedSupplierForHistory(null);
      }
    } catch (err) {
      console.error(err);
      toast.error('Delete Failed', 'Failed to delete supplier.');
    }
  };

  // Filter list
  const filteredSuppliers = suppliers?.filter((s) => {
    return (
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.address.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }) || [];

  return (
    <div className="space-y-6" id="suppliers-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Supplier Directory
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Maintain wholesale profiles, verify bills, and trace historical supply purchases.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingSupplier(null);
            setFormData({
              name: '',
              phone: '',
              email: '',
              address: '',
              balance: '0',
              notes: '',
            });
            setShowAddEditModal(true);
          }}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Supplier</span>
        </button>
      </div>

      {/* Grid of panels (Master Details Layout) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Suppliers list */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search suppliers by name, email, phone, address..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Suppliers Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredSuppliers.length === 0 ? (
              <div className="col-span-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-12 text-center text-zinc-400">
                <p className="font-medium text-base">No suppliers registered</p>
                <p className="text-xs mt-1">Insert supplier profiles to link with purchase orders or raw restocks.</p>
              </div>
            ) : (
              filteredSuppliers.map((s) => (
                <div
                  key={s.id}
                  className={`bg-white dark:bg-zinc-900 border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative cursor-pointer ${selectedSupplierForHistory?.id === s.id ? 'border-indigo-500 ring-2 ring-indigo-500/20' : 'border-zinc-200 dark:border-zinc-800'}`}
                  onClick={() => setSelectedSupplierForHistory(s)}
                >
                  <div>
                    {/* Header */}
                    <div className="flex justify-between items-start">
                      <div>
                        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 text-base">{s.name}</h3>
                        <p className="text-xs text-zinc-400 mt-1">ID: SUPP-0{s.id}</p>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Owed Balance</span>
                        <p className={`font-bold mt-0.5 text-sm ${s.balance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-zinc-600 dark:text-zinc-300'}`}>
                          {formatCurrency(s.balance, currencySymbol, currency)}
                        </p>
                      </div>
                    </div>

                    {/* Contact info */}
                    <div className="mt-4 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {s.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span>{s.phone}</span>
                        </p>
                      )}
                      {s.email && (
                        <p className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{s.email}</span>
                        </p>
                      )}
                      {s.address && (
                        <p className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                          <span className="truncate">{s.address}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-5 pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-between items-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedSupplierForHistory(s)}
                      className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-700 font-semibold cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Procurement History</span>
                    </button>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => openEditModal(s)}
                        className="p-1.5 text-zinc-400 hover:text-indigo-600 rounded-lg cursor-pointer"
                        title="Edit Info"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => s.id && handleDelete(s.id, s.name)}
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

        {/* Supplier History pane */}
        <div className="lg:col-span-1">
          {selectedSupplierForHistory ? (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col h-full min-h-[400px]">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <div>
                  <h3 className="font-bold text-zinc-900 dark:text-zinc-100">Procurement Bills</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{selectedSupplierForHistory.name}</p>
                </div>
                <button
                  onClick={() => setSelectedSupplierForHistory(null)}
                  className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Total Balance Owed */}
              <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl p-4 text-center">
                <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Owed Outstanding Balance</span>
                <p className={`text-lg font-bold mt-1 ${selectedSupplierForHistory.balance > 0 ? 'text-rose-600' : 'text-zinc-700 dark:text-zinc-300'}`}>
                  {formatCurrency(selectedSupplierForHistory.balance, currencySymbol, currency)}
                </p>
              </div>

              {/* Notes */}
              {selectedSupplierForHistory.notes && (
                <div className="p-3 bg-indigo-50/25 dark:bg-indigo-950/10 border border-indigo-100/40 dark:border-indigo-950/40 rounded-xl text-xs">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-400">Supplier Notes:</span>
                  <p className="text-zinc-600 dark:text-zinc-400 mt-1 italic">{selectedSupplierForHistory.notes}</p>
                </div>
              )}

              {/* Purchases history */}
              <div>
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Historical Supply Bills</h4>
                {!supplierPurchases || supplierPurchases.length === 0 ? (
                  <div className="text-center py-10 border border-dashed border-zinc-100 dark:border-zinc-800 rounded-xl text-zinc-400 text-xs">
                    No procurement bills logged with this supplier yet.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {supplierPurchases.map((purchase) => (
                      <div key={purchase.id} className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800/80 rounded-xl flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{purchase.billNumber}</p>
                          <p className="text-[10px] text-zinc-400 mt-0.5">{formatDate(purchase.date)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                            {formatCurrency(purchase.total, currencySymbol, currency)}
                          </p>
                          <span className="text-[9px] uppercase font-bold bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 mt-1 inline-block">
                            Supply Bill
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
              <Briefcase className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
              <p className="font-semibold text-sm">Procurement Inspector</p>
              <p className="text-xs mt-1">Select any supplier on the left to inspect linked inventory procurement bills and outstanding debts.</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Supplier Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-500" />
                <span>{editingSupplier ? 'Edit Supplier Info' : 'Add New Supplier'}</span>
              </h3>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-5 space-y-4">
              {/* Supplier Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Supplier / Wholesaler Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Global Tech Distributors"
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
                    placeholder="e.g. 555-9001"
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
                    placeholder="e.g. sales@globaltech.com"
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
                  <span>Warehouse Address</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. 99 Warehouse Road, WA"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              {/* Outstanding Balance */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                  <span>Owed Opening Balance ({currencySymbol})</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.balance}
                  onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none font-semibold text-rose-600"
                />
                <p className="text-[10px] text-zinc-400 mt-1">If you already owe this supplier money, input the balance above.</p>
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Internal Supplier Notes (Optional)</label>
                <textarea
                  placeholder="e.g. High-priority supplier, Net-45 credit..."
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
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
