import React, { useState, useEffect } from 'react';
import { useBusiness } from '../contexts/BusinessContext';
import { db, clearAllDatabaseData } from '../db';
import { toast } from '../components/Toast';
import {
  Settings as SettingsIcon,
  Briefcase,
  DollarSign,
  Calendar,
  Layers,
  Save,
  Trash2,
  Plus,
  RefreshCw,
  Download,
  Upload,
  Moon,
  Sun,
} from 'lucide-react';

export default function Settings() {
  const { settings, updateSetting } = useBusiness();

  // Settings State Form
  const [businessName, setBusinessName] = useState(settings.businessName);
  const [currency, setCurrency] = useState(settings.currency);
  const [currencySymbol, setCurrencySymbol] = useState(settings.currencySymbol);
  const [dateFormat, setDateFormat] = useState(settings.dateFormat);
  const [theme, setTheme] = useState(settings.theme);

  // Synchronize local state with settings updates (e.g. from the quick theme toggle in header)
  useEffect(() => {
    setBusinessName(settings.businessName);
    setCurrency(settings.currency);
    setCurrencySymbol(settings.currencySymbol);
    setDateFormat(settings.dateFormat);
    setTheme(settings.theme);
  }, [settings]);

  // Custom Categories input states
  const [newExpenseCategory, setNewExpenseCategory] = useState('');
  const [newIncomeCategory, setNewIncomeCategory] = useState('');
  const [newPaymentMethod, setNewPaymentMethod] = useState('');

  // Handle Save profile info
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateSetting('businessName', businessName.trim());
      await updateSetting('currency', currency);
      await updateSetting('currencySymbol', currencySymbol);
      await updateSetting('dateFormat', dateFormat);
      await updateSetting('theme', theme);
      toast.success('Settings Saved', 'Business profile configurations updated successfully.');
    } catch (err) {
      console.error(err);
      toast.error('Save Failed', 'Could not persist business profile settings.');
    }
  };

  // Category Add / Delete Utilities
  const handleAddExpenseCategory = async () => {
    if (!newExpenseCategory.trim()) return;
    if (settings.categories_expense.includes(newExpenseCategory.trim())) {
      toast.error('Duplicate Category', 'This category already exists.');
      return;
    }
    const updated = [...settings.categories_expense, newExpenseCategory.trim()];
    await updateSetting('categories_expense', updated);
    setNewExpenseCategory('');
    toast.success('Category Added', 'Operational expense category registered.');
  };

  const handleDeleteExpenseCategory = async (cat: string) => {
    if (settings.categories_expense.length <= 1) {
      toast.error('Minimum Required', 'At least one expense category is required.');
      return;
    }
    const updated = settings.categories_expense.filter(c => c !== cat);
    await updateSetting('categories_expense', updated);
    toast.info('Category Removed', 'Expense category deleted.');
  };

  const handleAddIncomeCategory = async () => {
    if (!newIncomeCategory.trim()) return;
    if (settings.categories_income.includes(newIncomeCategory.trim())) {
      toast.error('Duplicate Category', 'This category already exists.');
      return;
    }
    const updated = [...settings.categories_income, newIncomeCategory.trim()];
    await updateSetting('categories_income', updated);
    setNewIncomeCategory('');
    toast.success('Category Added', 'Secondary income category registered.');
  };

  const handleDeleteIncomeCategory = async (cat: string) => {
    if (settings.categories_income.length <= 1) {
      toast.error('Minimum Required', 'At least one income category is required.');
      return;
    }
    const updated = settings.categories_income.filter(c => c !== cat);
    await updateSetting('categories_income', updated);
    toast.info('Category Removed', 'Income category deleted.');
  };

  const handleAddPaymentMethod = async () => {
    if (!newPaymentMethod.trim()) return;
    if (settings.paymentMethods.includes(newPaymentMethod.trim())) {
      toast.error('Duplicate Method', 'This payment method already exists.');
      return;
    }
    const updated = [...settings.paymentMethods, newPaymentMethod.trim()];
    await updateSetting('paymentMethods', updated);
    setNewPaymentMethod('');
    toast.success('Payment Method Added', 'Custom payment method registered.');
  };

  const handleDeletePaymentMethod = async (method: string) => {
    if (settings.paymentMethods.length <= 1) {
      toast.error('Minimum Required', 'At least one payment method is required.');
      return;
    }
    const updated = settings.paymentMethods.filter(m => m !== method);
    await updateSetting('paymentMethods', updated);
    toast.info('Method Removed', 'Payment method deleted.');
  };

  // ==========================================
  // ONE-CLICK DATABASE BACKUP AND RESTORE
  // ==========================================

  // 1. BACKUP TO JSON FILE
  const handleBackupDatabase = async () => {
    try {
      const customers = await db.customers.toArray();
      const suppliers = await db.suppliers.toArray();
      const inventory = await db.inventory.toArray();
      const transactions = await db.transactions.toArray();
      const sales = await db.sales.toArray();
      const saleItems = await db.saleItems.toArray();
      const purchases = await db.purchases.toArray();
      const purchaseItems = await db.purchaseItems.toArray();
      const expenses = await db.expenses.toArray();
      const income = await db.income.toArray();
      const settingsTable = await db.settings.toArray();

      const backupObj = {
        appletId: 'offline-ledger',
        version: 1,
        timestamp: new Date().toISOString(),
        tables: {
          customers,
          suppliers,
          inventory,
          transactions,
          sales,
          saleItems,
          purchases,
          purchaseItems,
          expenses,
          income,
          settings: settingsTable,
        }
      };

      const jsonString = JSON.stringify(backupObj, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `OfflineLedger_DurableBackup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup Successful', 'Your entire offline database has been compiled and downloaded securely.');
    } catch (err) {
      console.error(err);
      toast.error('Backup Failed', 'Could not gather IndexedDB collections.');
    }
  };

  // 2. RESTORE FROM JSON FILE
  const handleRestoreDatabase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('WARNING: Restoring will overwrite all existing data in this browser tab permanently. Do you wish to proceed?')) {
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const backup = JSON.parse(text);

        if (backup.appletId !== 'offline-ledger' || !backup.tables) {
          toast.error('Invalid File format', 'This JSON is not a compatible Offline Ledger backup file.');
          return;
        }

        const tables = backup.tables;

        // Perform transactional bulk clear and write
        await db.transaction('rw', [
          db.customers,
          db.suppliers,
          db.inventory,
          db.transactions,
          db.sales,
          db.saleItems,
          db.purchases,
          db.purchaseItems,
          db.expenses,
          db.income,
          db.settings
        ], async () => {
          // Clear everything
          await db.customers.clear();
          await db.suppliers.clear();
          await db.inventory.clear();
          await db.transactions.clear();
          await db.sales.clear();
          await db.saleItems.clear();
          await db.purchases.clear();
          await db.purchaseItems.clear();
          await db.expenses.clear();
          await db.income.clear();
          await db.settings.clear();

          // Repopulate
          if (tables.customers?.length) await db.customers.bulkAdd(tables.customers);
          if (tables.suppliers?.length) await db.suppliers.bulkAdd(tables.suppliers);
          if (tables.inventory?.length) await db.inventory.bulkAdd(tables.inventory);
          if (tables.transactions?.length) await db.transactions.bulkAdd(tables.transactions);
          if (tables.sales?.length) await db.sales.bulkAdd(tables.sales);
          if (tables.saleItems?.length) await db.saleItems.bulkAdd(tables.saleItems);
          if (tables.purchases?.length) await db.purchases.bulkAdd(tables.purchases);
          if (tables.purchaseItems?.length) await db.purchaseItems.bulkAdd(tables.purchaseItems);
          if (tables.expenses?.length) await db.expenses.bulkAdd(tables.expenses);
          if (tables.income?.length) await db.income.bulkAdd(tables.income);
          if (tables.settings?.length) await db.settings.bulkAdd(tables.settings);
        });

        toast.success('Ledger Restored', 'Database restoration is complete! Reloading...');
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } catch (err) {
        console.error(err);
        toast.error('Restore Failed', 'Failed to parse backup JSON. File might be corrupted.');
      }
    };
    reader.readAsText(file);
  };
  
  const handleClearAllData = async () => {
    if (!window.confirm('CRITICAL WARNING: This will permanently delete all customers, suppliers, inventory items, sales invoices, purchase bills, and transactions from this device. This action cannot be undone. Do you really want to clear all data?')) {
      return;
    }

    try {
      await clearAllDatabaseData();
      toast.success('Database Cleared', 'All offline ledger data and dummy records have been permanently removed.');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      console.error(err);
      toast.error('Clear Failed', 'Could not clear database tables.');
    }
  };

  return (
    <div className="space-y-6" id="settings-view">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          System settings
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Configure offline parameters, customize operational category listings, and perform manual database backups.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile and general Settings Form */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handleSaveProfile} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2.5 flex items-center gap-1.5">
              <Briefcase className="w-4 h-4 text-indigo-500" />
              <span>Business Profile Settings</span>
            </h3>

            {/* Business Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-500 uppercase">Registered Company Name</label>
              <input
                type="text"
                required
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
              />
            </div>

            {/* Currency Name & Symbol */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Currency Standard (e.g. USD)</label>
                <input
                  type="text"
                  required
                  placeholder="USD"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Currency Symbol (e.g. $)</label>
                <input
                  type="text"
                  required
                  placeholder="$"
                  value={currencySymbol}
                  onChange={(e) => setCurrencySymbol(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>
            </div>

            {/* Theme and Date Format */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">System Theme</label>
                <div className="flex bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-1 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setTheme('light');
                      updateSetting('theme', 'light');
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition ${theme === 'light' ? 'bg-white text-indigo-600 shadow-xs' : 'text-zinc-500'}`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light Theme</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTheme('dark');
                      updateSetting('theme', 'dark');
                    }}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition ${theme === 'dark' ? 'bg-zinc-900 text-indigo-400 shadow-xs' : 'text-zinc-500'}`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark Theme</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Date format representation</label>
                <select
                  value={dateFormat}
                  onChange={(e) => setDateFormat(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                >
                  <option value="YYYY-MM-DD">YYYY-MM-DD (2026-07-01)</option>
                  <option value="DD-MM-YYYY">DD-MM-YYYY (01-07-2026)</option>
                  <option value="MM-DD-YYYY">MM-DD-YYYY (07-01-2026)</option>
                </select>
              </div>
            </div>

            {/* Save Button */}
            <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800/60 flex justify-end">
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>Save general Settings</span>
              </button>
            </div>
          </form>

          {/* Categorizations Customize grids */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Expense Categories Manager */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>Expense Categories</span>
              </h4>

              {/* Add row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Internet"
                  value={newExpenseCategory}
                  onChange={(e) => setNewExpenseCategory(e.target.value)}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1 text-xs text-zinc-850 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddExpenseCategory}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-xl cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Category pills list */}
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {settings.categories_expense.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold rounded text-xs"
                  >
                    <span>{cat}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteExpenseCategory(cat)}
                      className="text-zinc-400 hover:text-rose-500 font-bold ml-1 text-[10px] cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Income Categories Manager */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h4 className="text-xs font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1">
                <Layers className="w-4 h-4 text-indigo-500" />
                <span>Income Categories</span>
              </h4>

              {/* Add row */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Consultancy"
                  value={newIncomeCategory}
                  onChange={(e) => setNewIncomeCategory(e.target.value)}
                  className="flex-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1 text-xs text-zinc-850 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleAddIncomeCategory}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-xl cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {/* Category list */}
              <div className="flex flex-wrap gap-1.5 max-h-48 overflow-y-auto pr-1">
                {settings.categories_income.map((cat) => (
                  <span
                    key={cat}
                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 font-semibold rounded text-xs"
                  >
                    <span>{cat}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteIncomeCategory(cat)}
                      className="text-zinc-400 hover:text-rose-500 font-bold ml-1 text-[10px] cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right side block: Backup & Restore durable offline */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2.5 flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 text-indigo-500" />
              <span>Durable Offline Backup</span>
            </h3>

            <p className="text-xs text-zinc-500 leading-relaxed">
              Durable offline apps run 100% on your device. We recommend downloading a backup copy occasionally to safeguard your accounts from browser cache cleanups.
            </p>

            {/* Actions list */}
            <div className="space-y-3 pt-2">
              {/* Backup Trigger */}
              <button
                type="button"
                onClick={handleBackupDatabase}
                className="w-full inline-flex items-center justify-center gap-2 bg-indigo-50 dark:bg-indigo-950/20 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-900/40 p-3 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs"
              >
                <Download className="w-4 h-4" />
                <span>One-Click JSON Backup</span>
              </button>

              {/* Restore Trigger */}
              <div className="relative">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreDatabase}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full"
                />
                <button
                  type="button"
                  className="w-full inline-flex items-center justify-center gap-2 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl text-xs font-bold text-zinc-600 dark:text-zinc-400 transition"
                >
                  <Upload className="w-4 h-4" />
                  <span>Restore Database from File</span>
                </button>
              </div>
            </div>

            <div className="pt-4 border-t border-zinc-100 dark:border-zinc-850 text-[10px] text-zinc-400 text-center leading-relaxed">
              All restorations are transactional and safe.
            </div>
          </div>

          {/* Database Maintenance (Clear Dummy Data) */}
          <div className="bg-white dark:bg-zinc-900 border border-rose-200 dark:border-rose-900/40 rounded-2xl p-5 shadow-sm space-y-4 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-rose-800 dark:text-rose-400 uppercase tracking-wider border-b border-rose-100 dark:border-rose-950/40 pb-2.5 flex items-center gap-1.5 animate-pulse">
              <Trash2 className="w-4 h-4 text-rose-500" />
              <span>Database Maintenance</span>
            </h3>

            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
              Permanently delete all customers, suppliers, inventory, transactions, and invoice logs from this browser's database. Ideal for clearing initial dummy/sample data to start fresh.
            </p>

            <button
              type="button"
              onClick={handleClearAllData}
              className="w-full inline-flex items-center justify-center gap-2 bg-rose-50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 p-3 rounded-xl text-xs font-bold transition cursor-pointer shadow-xs hover:shadow-md"
            >
              <Trash2 className="w-4 h-4" />
              <span>Clear All Database Data</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
