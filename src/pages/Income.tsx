import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Income } from '../db';
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
  PieChart as PieIcon,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function Income() {
  const { settings } = useBusiness();
  const { currencySymbol, currency, categories_income, paymentMethods } = settings;

  // States
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showAddModal, setShowAddModal] = useState(false);

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    amount: '',
    category: categories_income[0] || 'Commission',
    description: '',
    paymentMethod: paymentMethods[0] || 'Cash',
    reference: '',
    notes: '',
  });

  // Query database
  const incomeList = useLiveQuery(async () => {
    const arr = await db.income.toArray();
    return arr.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  });

  // Analytics
  const chartData = useLiveQuery(async () => {
    const list = await db.income.toArray();
    const categories: { [cat: string]: number } = {};
    
    categories_income.forEach(c => { categories[c] = 0; });

    list.forEach(i => {
      categories[i.category] = (categories[i.category] || 0) + i.amount;
    });

    return Object.keys(categories)
      .map(name => ({ name, value: categories[name] }))
      .filter(item => item.value > 0)
      .sort((a, b) => b.value - a.value);
  }, [incomeList, categories_income]);

  // Save Income
  const handleSaveIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(formData.amount);

    if (isNaN(amt) || amt <= 0) {
      toast.error('Invalid Amount', 'Please write a positive income.');
      return;
    }

    try {
      // 1. Add to income
      const incId = await db.income.add({
        date: formData.date,
        amount: amt,
        category: formData.category,
        description: formData.description.trim(),
        paymentMethod: formData.paymentMethod,
        reference: formData.reference.trim(),
        notes: formData.notes.trim(),
      });

      // 2. Add to cash in transactions
      await db.transactions.add({
        date: formData.date,
        amount: amt,
        type: 'INCOME',
        category: formData.category,
        description: formData.description.trim() || `Operational Income: ${formData.category}`,
        paymentMethod: formData.paymentMethod,
        reference: formData.reference.trim(),
        notes: formData.notes.trim(),
        linkId: incId,
      });

      toast.success('Income Logged', `${formData.category} of ${formatCurrency(amt, currencySymbol, currency)} recorded.`);
      setShowAddModal(false);

      setFormData({
        date: new Date().toISOString().split('T')[0],
        amount: '',
        category: categories_income[0] || 'Commission',
        description: '',
        paymentMethod: paymentMethods[0] || 'Cash',
        reference: '',
        notes: '',
      });
    } catch (err) {
      console.error(err);
      toast.error('Logging Failed', 'Could not record income.');
    }
  };

  // Delete
  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this income record?')) {
      return;
    }

    try {
      await db.income.delete(id);
      
      const tx = await db.transactions.where('linkId').equals(id).and(t => t.type === 'INCOME').first();
      if (tx && tx.id) {
        await db.transactions.delete(tx.id);
      }

      toast.success('Income Deleted', 'Income record removed.');
    } catch (err) {
      console.error(err);
      toast.error('Delete Failed', 'Failed to remove income.');
    }
  };

  // Filter
  const filteredIncome = incomeList?.filter((i) => {
    const matchesSearch =
      i.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      i.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (i.reference && i.reference.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory = categoryFilter === 'ALL' || i.category === categoryFilter;
    return matchesSearch && matchesCategory;
  }) || [];

  const COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f43f5e'];

  const handleExportExcel = () => {
    const data = filteredIncome.map((i) => ({
      Date: formatDate(i.date),
      Amount: i.amount,
      Category: i.category,
      Description: i.description,
      'Payment Method': i.paymentMethod,
      Reference: i.reference || '-',
      Notes: i.notes || '-',
    }));
    exportToExcel(data, 'Income_Log');
  };

  const handleExportCSV = () => {
    const data = filteredIncome.map((i) => ({
      Date: formatDate(i.date),
      Amount: i.amount,
      Category: i.category,
      Description: i.description,
      'Payment Method': i.paymentMethod,
      Reference: i.reference || '-',
      Notes: i.notes || '-',
    }));
    exportToCSV(data, 'Income_Log');
  };

  return (
    <div className="space-y-6" id="income-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Operational Income
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Log investments, commissions, service fees, interest yields, and other secondary revenue streams.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Record Revenue</span>
        </button>
      </div>

      {/* Grid: charts and tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Analytics bar chart */}
        <div className="lg:col-span-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col h-full min-h-[300px]">
          <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800 pb-2.5 mb-4">
            <PieIcon className="w-4 h-4 text-indigo-500" />
            <span>Revenue Categories</span>
          </h3>
          {chartData && chartData.length > 0 ? (
            <div className="h-64 w-full flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                  <XAxis type="number" stroke="#a1a1aa" fontSize={10} tickLine={false} />
                  <YAxis dataKey="name" type="category" stroke="#a1a1aa" fontSize={10} tickLine={false} width={80} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value), currencySymbol, currency)} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center text-xs text-zinc-400">
              No secondary revenue logged. Fill a revenue form.
            </div>
          )}
        </div>

        {/* List of Income Block */}
        <div className="lg:col-span-2 space-y-4">
          {/* Search/Filter Bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col sm:flex-row gap-3 items-center">
            <div className="relative w-full sm:flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
              <input
                type="text"
                placeholder="Search description, reference, category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
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

              <button
                onClick={handleExportExcel}
                disabled={filteredIncome.length === 0}
                className="p-1.5 text-zinc-500 hover:text-indigo-600 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl cursor-pointer disabled:opacity-50"
                title="Export Excel"
              >
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* List Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <th className="p-4">Date</th>
                    <th className="p-4">Category</th>
                    <th className="p-4">Description</th>
                    <th className="p-4">Payment</th>
                    <th className="p-4 text-right">Amount</th>
                    <th className="p-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-sm text-zinc-700 dark:text-zinc-300">
                  {filteredIncome.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-12 text-zinc-400">
                        <p className="font-medium text-base">No income logs registered</p>
                        <p className="text-xs mt-1">Secondary revenue streams appear here once saved.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredIncome.map((i) => (
                      <tr key={i.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                        <td className="p-4 whitespace-nowrap">{formatDate(i.date)}</td>
                        <td className="p-4 whitespace-nowrap">
                          <span className="px-2.5 py-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-bold rounded text-xs uppercase">
                            {i.category}
                          </span>
                        </td>
                        <td className="p-4 font-normal">{i.description}</td>
                        <td className="p-4 whitespace-nowrap">{i.paymentMethod}</td>
                        <td className="p-4 text-right font-bold text-emerald-600 whitespace-nowrap">
                          {formatCurrency(i.amount, currencySymbol, currency)}
                        </td>
                        <td className="p-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => i.id && handleDelete(i.id)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            title="Delete Income"
                          >
                            <Trash2 className="w-4 h-4" />
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
      </div>

      {/* Add Income Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col animate-scale-up">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-500" />
                <span>Record Secondary Revenue</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveIncome} className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Receipt Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <DollarSign className="w-3.5 h-3.5" />
                    <span>Amount ({currencySymbol}) *</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none font-semibold text-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
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
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  >
                    {paymentMethods.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                  <Hash className="w-3.5 h-3.5" />
                  <span>Reference ID / Receipt Number (Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. TRN-7712"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Description *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Received consultancy fee"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Notes (Optional)</label>
                <textarea
                  placeholder="Additional details..."
                  rows={2}
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-xs focus:outline-none resize-none"
                />
              </div>

              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Save Revenue
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
