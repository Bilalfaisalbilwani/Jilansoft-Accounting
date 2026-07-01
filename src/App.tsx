import React, { useState, useEffect } from 'react';
import { db, seedInitialData, clearAllDatabaseData } from './db';
import { BusinessProvider, useBusiness } from './contexts/BusinessContext';
import { ToastProvider, toast } from './components/Toast';
import { formatCurrency } from './utils';

// Import Pages
import Dashboard from './pages/Dashboard';
import CashIn from './pages/CashIn';
import CashOut from './pages/CashOut';
import Expenses from './pages/Expenses';
import Income from './pages/Income';
import Inventory from './pages/Inventory';
import Sales from './pages/Sales';
import Purchases from './pages/Purchases';
import Customers from './pages/Customers';
import Suppliers from './pages/Suppliers';
import Reports from './pages/Reports';
import ProfitLoss from './pages/ProfitLoss';
import Settings from './pages/Settings';

// Import Icons
import {
  LayoutDashboard,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  Package,
  FileText,
  ShoppingBag,
  Users,
  Briefcase,
  TrendingUp,
  Settings as SettingsIcon,
  BarChart3,
  Search,
  Menu,
  X,
  Database,
  SearchCode,
  RefreshCw,
  Sun,
  Moon,
} from 'lucide-react';

type TabType =
  | 'DASHBOARD'
  | 'CASH_IN'
  | 'CASH_OUT'
  | 'EXPENSES'
  | 'INVENTORY'
  | 'SALES'
  | 'PURCHASES'
  | 'CUSTOMERS'
  | 'SUPPLIERS'
  | 'REPORTS'
  | 'PROFIT_LOSS'
  | 'SETTINGS';

function AppContent() {
  const { settings, updateSetting } = useBusiness();
  const { businessName, currencySymbol, currency } = settings;

  // Layout States
  const [activeTab, setActiveTab] = useState<TabType>('DASHBOARD');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Global Search State
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{
    sales: any[];
    purchases: any[];
    expenses: any[];
    customers: any[];
    suppliers: any[];
    inventory: any[];
  } | null>(null);

  // Trigger Live Global Search
  useEffect(() => {
    if (!globalSearchTerm.trim()) {
      setSearchResults(null);
      return;
    }

    const term = globalSearchTerm.toLowerCase();

    async function doGlobalSearch() {
      // 1. Search Sales
      const sales = await db.sales
        .filter((s) => s.invoiceNumber.toLowerCase().includes(term) || (s.notes && s.notes.toLowerCase().includes(term)))
        .limit(3)
        .toArray();

      // 2. Search Purchases
      const purchases = await db.purchases
        .filter((p) => p.billNumber.toLowerCase().includes(term) || (p.notes && p.notes.toLowerCase().includes(term)))
        .limit(3)
        .toArray();

      // 3. Search Expenses
      const expenses = await db.expenses
        .filter((e) => e.description.toLowerCase().includes(term) || e.category.toLowerCase().includes(term))
        .limit(3)
        .toArray();

      // 4. Search Customers
      const customers = await db.customers
        .filter((c) => c.name.toLowerCase().includes(term) || c.phone.includes(term))
        .limit(3)
        .toArray();

      // 5. Search Suppliers
      const suppliers = await db.suppliers
        .filter((s) => s.name.toLowerCase().includes(term) || s.phone.includes(term))
        .limit(3)
        .toArray();

      // 6. Search Inventory
      const inventory = await db.inventory
        .filter((i) => i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term))
        .limit(3)
        .toArray();

      setSearchResults({ sales, purchases, expenses, customers, suppliers, inventory });
    }

    const debounceId = setTimeout(doGlobalSearch, 200);
    return () => clearTimeout(debounceId);
  }, [globalSearchTerm]);

  // Sidebar link config
  const navItems = [
    { id: 'DASHBOARD', label: 'Overview Dashboard', icon: LayoutDashboard },
    { id: 'CASH_IN', label: 'Cash Inflow Logs', icon: ArrowDownLeft },
    { id: 'CASH_OUT', label: 'Cash Outflow Logs', icon: ArrowUpRight },
    { id: 'EXPENSES', label: 'Overhead Expenses', icon: Receipt },
    { id: 'INVENTORY', label: 'Product Inventory', icon: Package },
    { id: 'SALES', label: 'Sales & Invoicing', icon: FileText },
    { id: 'PURCHASES', label: 'Supply Procurement', icon: ShoppingBag },
    { id: 'CUSTOMERS', label: 'Customer Profiles', icon: Users },
    { id: 'SUPPLIERS', label: 'Supplier Catalog', icon: Briefcase },
    { id: 'REPORTS', label: 'Financial Reports', icon: BarChart3 },
    { id: 'PROFIT_LOSS', label: 'Profit & Loss Sheet', icon: TrendingUp },
    { id: 'SETTINGS', label: 'System Settings', icon: SettingsIcon },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 text-zinc-800 dark:text-zinc-100 flex flex-col md:flex-row" id="ledger-main-container">
      {/* 1. MOBILE HEADER BAR */}
      <header className="md:hidden bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-850 px-4 py-3.5 flex items-center justify-between shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-black text-white text-sm">
            {businessName.slice(0, 2).toUpperCase()}
          </div>
          <span className="font-extrabold text-sm tracking-tight text-zinc-900 dark:text-zinc-100">{businessName}</span>
        </div>
        <button
          onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
          className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-500 cursor-pointer"
        >
          {mobileSidebarOpen ? <X className="w-5.5 h-5.5" /> : <Menu className="w-5.5 h-5.5" />}
        </button>
      </header>

      {/* 2. SIDEBAR NAVIGATION - DESKTOP & MOBILE OVERLAY */}
      <aside
        className={`bg-white dark:bg-zinc-900 border-r border-zinc-200 dark:border-zinc-850 flex flex-col shrink-0 z-40
          w-64 md:sticky md:top-0 md:h-screen
          fixed inset-y-0 left-0 md:translate-x-0 transform ${mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          transition-transform duration-300 md:flex
        `}
      >
        {/* Company info branding block */}
        <div className="p-5 border-b border-zinc-250/60 dark:border-zinc-850/60 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white font-extrabold flex items-center justify-center shrink-0 shadow-md">
              {businessName.slice(0, 2).toUpperCase()}
            </div>
            <div className="truncate">
              <h2 className="font-black text-sm text-zinc-900 dark:text-zinc-50 tracking-tight leading-none truncate">{businessName}</h2>
              <span className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-1 inline-block">● Offline Mode</span>
            </div>
          </div>
        </div>

        {/* Links Navigation Area */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1 pr-2 scrollbar-thin scrollbar-thumb-zinc-200">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id as TabType);
                  setMobileSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3.5 px-3.5 py-2.5 rounded-xl text-left text-xs font-semibold transition-all cursor-pointer relative
                  ${isActive ? 'bg-indigo-600 text-white shadow-md font-bold' : 'text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-850 hover:text-zinc-800 dark:hover:text-zinc-200'}
                `}
              >
                <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-white' : 'text-zinc-400 dark:text-zinc-500'}`} />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <span className="absolute right-3.5 w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Footer brand credit */}
        <div className="p-4 border-t border-zinc-250/40 dark:border-zinc-850/40 text-center text-[10px] text-zinc-400 font-mono shrink-0">
          Offline Ledger Books v1.0
        </div>
      </aside>

      {/* 3. MAIN APP VIEWPORT */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* TOP BAR: SEARCH & STATUS */}
        <div className="bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-850 px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4 sticky top-0 z-25 shrink-0 print:hidden shadow-xs">
          {/* Live Global Search Input Box */}
          <div className="relative max-w-md w-full">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Live Global Search across invoices, products, clients..."
              value={globalSearchTerm}
              onChange={(e) => setGlobalSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 font-medium"
            />

            {/* Live Search Results Dropdown Panel */}
            {searchResults && (
              <div className="absolute top-full left-0 right-0 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl mt-2 p-4 shadow-2xl z-50 max-h-96 overflow-y-auto space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <span className="text-[10px] uppercase font-bold text-zinc-400 flex items-center gap-1">
                    <SearchCode className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Real-Time Index Results</span>
                  </span>
                  <button onClick={() => setGlobalSearchTerm('')} className="text-xs text-zinc-400 hover:text-zinc-600 font-semibold cursor-pointer">
                    Dismiss
                  </button>
                </div>

                {/* Clients Group */}
                {searchResults.customers.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-extrabold text-indigo-500 tracking-widest block">Customers</span>
                    {searchResults.customers.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setGlobalSearchTerm('');
                          setActiveTab('CUSTOMERS');
                        }}
                        className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-lg text-xs cursor-pointer flex justify-between"
                      >
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{c.name}</span>
                        <span className="text-[10px] text-zinc-400">{c.phone}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Suppliers Group */}
                {searchResults.suppliers.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-extrabold text-indigo-500 tracking-widest block">Suppliers</span>
                    {searchResults.suppliers.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setGlobalSearchTerm('');
                          setActiveTab('SUPPLIERS');
                        }}
                        className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-lg text-xs cursor-pointer flex justify-between"
                      >
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{s.name}</span>
                        <span className="text-[10px] text-zinc-400">{s.phone}</span>
                      </div>
                    ))}
                  </div>
                )}                 {/* Invoices Group */}
                {searchResults.sales.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-extrabold text-indigo-500 tracking-widest block">Sales Invoices</span>
                    {searchResults.sales.map((s) => (
                      <div
                        key={s.id}
                        onClick={() => {
                          setGlobalSearchTerm('');
                          setActiveTab('SALES');
                        }}
                        className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-lg text-xs cursor-pointer flex justify-between"
                      >
                        <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">{s.invoiceNumber}</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-100">{formatCurrency(s.total, currencySymbol, currency)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Purchases Group */}
                {searchResults.purchases.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-extrabold text-indigo-500 tracking-widest block">Procurement Bills</span>
                    {searchResults.purchases.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => {
                          setGlobalSearchTerm('');
                          setActiveTab('PURCHASES');
                        }}
                        className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-lg text-xs cursor-pointer flex justify-between"
                      >
                        <span className="font-bold font-mono text-sky-600 dark:text-sky-400">{p.billNumber}</span>
                        <span className="font-bold text-zinc-800 dark:text-zinc-100">{formatCurrency(p.total, currencySymbol, currency)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Products Catalog Group */}
                {searchResults.inventory.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[9px] uppercase font-extrabold text-indigo-500 tracking-widest block">Products Catalog</span>
                    {searchResults.inventory.map((i) => (
                      <div
                        key={i.id}
                        onClick={() => {
                          setGlobalSearchTerm('');
                          setActiveTab('INVENTORY');
                        }}
                        className="p-2 hover:bg-zinc-50 dark:hover:bg-zinc-850 rounded-lg text-xs cursor-pointer flex justify-between"
                      >
                        <span className="font-semibold text-zinc-800 dark:text-zinc-200">{i.name}</span>
                        <span className="text-[10px] text-zinc-400 font-mono">Stock: {i.currentStock}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Empty State search */}
                {searchResults.sales.length === 0 &&
                  searchResults.purchases.length === 0 &&
                  searchResults.expenses.length === 0 &&
                  searchResults.customers.length === 0 &&
                  searchResults.suppliers.length === 0 &&
                  searchResults.inventory.length === 0 && (
                    <div className="text-center py-6 text-xs text-zinc-400 font-medium">
                      No indexes found for "{globalSearchTerm}"
                    </div>
                  )}
              </div>
            )}
          </div>

          {/* Quick Stats overview of Ledger Node */}
          <div className="flex items-center gap-3.5 self-end md:self-auto text-xs">
            {/* Quick Dark Mode Toggle */}
            <button
              onClick={() => updateSetting('theme', settings.theme === 'dark' ? 'light' : 'dark')}
              className="p-1.5 bg-zinc-50 hover:bg-zinc-100 dark:bg-zinc-850 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 rounded-xl border border-zinc-200 dark:border-zinc-850 transition cursor-pointer flex items-center justify-center shrink-0"
              title={settings.theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {settings.theme === 'dark' ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 text-indigo-500" />
              )}
            </button>

            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Device Ledger Status:</span>
            <div className="bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 border border-emerald-100 dark:border-emerald-900/40 px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 shadow-xs">
              <Database className="w-3.5 h-3.5" />
              <span>DEXIE SECURE ON-DEVICE</span>
            </div>
          </div>
        </div>

        {/* CONTAINER VIEW FOR CURRENT TAB */}
        <div className="flex-1 p-6 overflow-y-auto">
          {activeTab === 'DASHBOARD' && <Dashboard />}
          {activeTab === 'CASH_IN' && <CashIn />}
          {activeTab === 'CASH_OUT' && <CashOut />}
          {activeTab === 'EXPENSES' && <Expenses />}
          {activeTab === 'INVENTORY' && <Inventory />}
          {activeTab === 'SALES' && <Sales />}
          {activeTab === 'PURCHASES' && <Purchases />}
          {activeTab === 'CUSTOMERS' && <Customers />}
          {activeTab === 'SUPPLIERS' && <Suppliers />}
          {activeTab === 'REPORTS' && <Reports />}
          {activeTab === 'PROFIT_LOSS' && <ProfitLoss />}
          {activeTab === 'SETTINGS' && <Settings />}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  const [dbSeeded, setDbSeeded] = useState(false);

  // Auto seed on boot and ensure any pre-existing dummy data is cleared
  useEffect(() => {
    async function initDB() {
      try {
        // One-time automatic clear of dummy data so the user starts with a completely blank database
        const hasAutoCleared = localStorage.getItem('has_cleared_dummy_for_user_v2');
        if (!hasAutoCleared) {
          await clearAllDatabaseData();
          localStorage.setItem('has_cleared_dummy_for_user_v2', 'true');
        }
        await seedInitialData();
        setDbSeeded(true);
      } catch (err) {
        console.error('Failed to initialize database seeding', err);
        // Fallback to continue running the app
        setDbSeeded(true);
      }
    }
    initDB();
  }, []);

  if (!dbSeeded) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4">
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-sm text-center shadow-xl space-y-4">
          <Database className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
          <h2 className="text-lg font-black tracking-tight text-zinc-900 dark:text-zinc-50">Initializing Secure Ledger</h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Seeding on-device IndexedDB with compliant, high-density sample transactions and catalog items. Please wait...
          </p>
          <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-600 w-1/2 rounded-full animate-ping" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <StrictModeProviders>
      <BusinessProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </BusinessProvider>
    </StrictModeProviders>
  );
}

// StrictMode wrapped helper
function StrictModeProviders({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
