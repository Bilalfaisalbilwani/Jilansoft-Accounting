import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency, formatDate, exportToExcel, exportToCSV } from '../utils';
import { toast } from '../components/Toast';
import {
  Plus,
  Search,
  Download,
  Trash2,
  Calendar,
  Filter,
  DollarSign,
  FileText,
  CreditCard,
  Hash,
  X,
  Edit,
} from 'lucide-react';

export default function CashIn() {
  const { settings } = useBusiness();
  const { currencySymbol, currency, categories_income, paymentMethods } = settings;

  // State Management
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [paymentFilter, setPaymentFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: categories_income[0] || 'Other Income',
    description: '',
    paymentMethod: paymentMethods[0] || 'Cash',
    reference: '',
    notes: '',
  });

  // Query Cash In Transactions
  const cashInTransactions = useLiveQuery(async () => {
    const list = await db.transactions
      .filter((t) => t.type === 'CASH_IN' || t.type === 'INCOME')
      .toArray();
    // Sort descending by date
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // Handle Form Submission
  const handleAddCashIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formData.amount);
    
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    try {
      // 1. Create linked entry in income table first
      const incId = await db.income.add({
        date: formData.date,
        amount: amountNum,
        category: formData.category,
        description: formData.description,
        paymentMethod: formData.paymentMethod,
        reference: formData.reference,
        notes: formData.notes,
      });

      // 2. Add record to transactions table with the linked ID
      await db.transactions.add({
        date: formData.date,
        amount: amountNum,
        type: 'CASH_IN',
        category: formData.category,
        description: formData.description,
        paymentMethod: formData.paymentMethod,
        reference: formData.reference,
        notes: formData.notes,
        linkId: incId,
      });

      toast.success('Cash In Recorded', `Amount of ${formatCurrency(amountNum, currencySymbol, currency)} added successfully.`);
      setShowAddModal(false);
      
      // Reset form
      setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        category: categories_income[0] || 'Other Income',
        description: '',
        paymentMethod: paymentMethods[0] || 'Cash',
        reference: '',
        notes: '',
      });
    } catch (err) {
      console.error(err);
      toast.error('Operation Failed', 'Could not record cash in. Try again.');
    }
  };

  // Handle Row Deletion (with Cascade delete on linked income record)
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this cash-in transaction? This action is irreversible.')) {
      return;
    }

    try {
      const tx = await db.transactions.get(id);
      if (tx) {
        if (tx.linkId) {
          await db.income.delete(tx.linkId);
        }
        await db.transactions.delete(id);
      }
      toast.success('Transaction Deleted', 'The cash-in entry has been removed.');
    } catch (err) {
      console.error(err);
      toast.error('Delete Failed', 'Failed to delete the transaction.');
    }
  };

  // Edit State Management
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [editFormData, setEditFormData] = useState({
    date: '',
    amount: '',
    category: '',
    description: '',
    paymentMethod: '',
    reference: '',
    notes: '',
  });

  const handleStartEdit = (t: any) => {
    setEditingTx(t);
    setEditFormData({
      date: t.date,
      amount: t.amount.toString(),
      category: t.category,
      description: t.description || '',
      paymentMethod: t.paymentMethod,
      reference: t.reference || '',
      notes: t.notes || '',
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(editFormData.amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast.error('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    try {
      if (!editingTx?.id) return;

      // Update parent transaction
      await db.transactions.update(editingTx.id, {
        date: editFormData.date,
        amount: amountNum,
        category: editFormData.category,
        description: editFormData.description,
        paymentMethod: editFormData.paymentMethod,
        reference: editFormData.reference,
        notes: editFormData.notes,
      });

      // Update linked income if linkId exists
      if (editingTx.linkId) {
        await db.income.update(editingTx.linkId, {
          date: editFormData.date,
          amount: amountNum,
          category: editFormData.category,
          description: editFormData.description,
          paymentMethod: editFormData.paymentMethod,
          reference: editFormData.reference,
          notes: editFormData.notes,
        });
      }

      toast.success('Transaction Updated', 'Changes have been saved successfully.');
      setShowEditModal(false);
      setEditingTx(null);
    } catch (err) {
      console.error(err);
      toast.error('Update Failed', 'Could not update transaction.');
    }
  };

  // Filtering & Search logic
  const filteredData = cashInTransactions?.filter((t) => {
    const matchesSearch =
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.reference && t.reference.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (t.notes && t.notes.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = categoryFilter === 'ALL' || t.category === categoryFilter;
    const matchesPayment = paymentFilter === 'ALL' || t.paymentMethod === paymentFilter;
    return matchesSearch && matchesCategory && matchesPayment;
  }) || [];

  const handleExportExcel = () => {
    const exportData = filteredData.map((t) => ({
      Date: formatDate(t.date),
      Amount: t.amount,
      Category: t.category,
      Description: t.description,
      'Payment Method': t.paymentMethod,
      Reference: t.reference || '-',
      Notes: t.notes || '-',
    }));
    exportToExcel(exportData, 'Cash_In_Report');
  };

  const handleExportCSV = () => {
    const exportData = filteredData.map((t) => ({
      Date: formatDate(t.date),
      Amount: t.amount,
      Category: t.category,
      Description: t.description,
      'Payment Method': t.paymentMethod,
      Reference: t.reference || '-',
      Notes: t.notes || '-',
    }));
    exportToCSV(exportData, 'Cash_In_Report');
  };

  return (
    <div className="space-y-6" id="cash-in-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Cash In (Receipts)
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Log capitals, equity, investments, and non-sales operational inflows here.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Cash In</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        {/* Search Input */}
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by category, description, reference, notes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filter Selection Grid */}
        <div className="flex flex-wrap gap-3 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-semibold uppercase">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {categories_income.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Payment Filter */}
          <select
            value={paymentFilter}
            onChange={(e) => setPaymentFilter(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 focus:outline-none"
          >
            <option value="ALL">All Payments</option>
            {paymentMethods.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          {/* Exporting options */}
          <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-800 pl-3">
            <button
              onClick={handleExportExcel}
              disabled={filteredData.length === 0}
              className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-50 cursor-pointer"
              title="Export to Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportCSV}
              disabled={filteredData.length === 0}
              className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-50 cursor-pointer"
              title="Export to CSV"
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Datatable Section */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <th className="p-4">Date</th>
                <th className="p-4">Category</th>
                <th className="p-4">Description</th>
                <th className="p-4">Payment Method</th>
                <th className="p-4">Reference</th>
                <th className="p-4 text-right">Amount</th>
                <th className="p-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-sm text-zinc-700 dark:text-zinc-300">
              {filteredData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-12 text-zinc-400">
                    <p className="font-medium text-base">No transactions found</p>
                    <p className="text-xs mt-1">Try resetting filters or log a new Cash In entry.</p>
                  </td>
                </tr>
              ) : (
                filteredData.map((t) => (
                  <tr key={t.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                    <td className="p-4 font-medium whitespace-nowrap">{formatDate(t.date)}</td>
                    <td className="p-4 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 rounded-full text-xs font-medium">
                        {t.category}
                      </span>
                    </td>
                    <td className="p-4 font-normal">{t.description || <span className="text-zinc-400">No Description</span>}</td>
                    <td className="p-4 whitespace-nowrap">{t.paymentMethod}</td>
                    <td className="p-4 whitespace-nowrap font-mono text-xs text-zinc-500">
                      {t.reference || <span className="text-zinc-300 dark:text-zinc-700">-</span>}
                    </td>
                    <td className="p-4 text-right font-bold text-emerald-600 whitespace-nowrap">
                      {formatCurrency(t.amount, currencySymbol, currency)}
                    </td>
                    <td className="p-4 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => handleStartEdit(t)}
                          className="p-1.5 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg cursor-pointer"
                          title="Edit Record"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => t.id && handleDelete(t.id)}
                          className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                          title="Delete Record"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Cash In modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-500" />
                <span>Record Cash In Inflow</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleAddCashIn} className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
              {/* Grid 1: Date & Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Transaction Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Amount ({currencySymbol})</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                </div>
              </div>

              {/* Grid 2: Category & Payment Method */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {categories_income.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Payment Method</span>
                  </label>
                  <select
                    value={formData.paymentMethod}
                    onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {paymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Reference / Slip Number (Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. TXN-81203"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Brief Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Investment from Partner"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Detailed Notes (Optional)</label>
                <textarea
                  placeholder="Enter any additional details..."
                  rows={3}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  Save Inflow
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Cash In modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Edit className="w-5 h-5 text-indigo-500" />
                <span>Edit Cash Inflow Entry</span>
              </h3>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingTx(null);
                }}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleEditSubmit} className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
              {/* Grid 1: Date & Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Transaction Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.date}
                    onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Amount ({currencySymbol})</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={editFormData.amount}
                    onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                  />
                </div>
              </div>

              {/* Grid 2: Category & Payment Method */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Category</label>
                  <select
                    value={editFormData.category}
                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {categories_income.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Payment Method</span>
                  </label>
                  <select
                    value={editFormData.paymentMethod}
                    onChange={(e) => setEditFormData({ ...editFormData, paymentMethod: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {paymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Reference */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Reference / Slip Number (Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. TXN-81203"
                  value={editFormData.reference}
                  onChange={(e) => setEditFormData({ ...editFormData, reference: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Brief Description</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Investment from Partner"
                  value={editFormData.description}
                  onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Detailed Notes (Optional)</label>
                <textarea
                  placeholder="Enter any additional details..."
                  rows={3}
                  value={editFormData.notes}
                  onChange={(e) => setEditFormData({ ...editFormData, notes: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingTx(null);
                  }}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
