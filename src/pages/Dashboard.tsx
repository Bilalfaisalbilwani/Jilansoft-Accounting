import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency } from '../utils';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  AlertTriangle,
  Calendar,
  Layers,
  ShoppingBag,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

export default function Dashboard() {
  const { settings } = useBusiness();
  const { currencySymbol, currency } = settings;

  // --- REACTIVE QUERIES ---
  const stats = useLiveQuery(async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const currentMonthPrefix = todayStr.substring(0, 7); // "YYYY-MM"

    // Fetch all records for calculation
    const allSales = await db.sales.toArray();
    const allExpenses = await db.expenses.toArray();
    const allIncome = await db.income.toArray();
    const allPurchases = await db.purchases.toArray();
    const allInventory = await db.inventory.toArray();
    const allTransactions = await db.transactions.toArray();

    // 1. Today's Sales
    const todaySalesAmount = allSales
      .filter((s) => s.date === todayStr)
      .reduce((acc, s) => acc + s.total, 0);

    // 2. Today's Expenses
    const todayExpensesAmount = allExpenses
      .filter((e) => e.date === todayStr)
      .reduce((acc, e) => acc + e.amount, 0);

    // 3. Current Cash
    // Calculated as (Total Cash In) - (Total Cash Out) from transactions
    let currentCash = 0;
    allTransactions.forEach((t) => {
      if (t.type === 'CASH_IN' || t.type === 'INCOME' || t.type === 'SALE') {
        currentCash += t.amount;
      } else if (t.type === 'CASH_OUT' || t.type === 'EXPENSE' || t.type === 'PURCHASE') {
        currentCash -= t.amount;
      }
    });

    // 4. Inventory Value
    const inventoryValuation = allInventory.reduce(
      (acc, item) => acc + item.currentStock * item.purchasePrice,
      0
    );

    // 5. Low Stock Items
    const lowStockItems = allInventory.filter(
      (item) => item.currentStock <= item.minimumStock
    );

    // 6. This Month's Revenue (Sales + Income)
    const thisMonthSales = allSales
      .filter((s) => s.date.startsWith(currentMonthPrefix))
      .reduce((acc, s) => acc + s.total, 0);
    const thisMonthIncome = allIncome
      .filter((i) => i.date.startsWith(currentMonthPrefix))
      .reduce((acc, i) => acc + i.amount, 0);
    const thisMonthRevenue = thisMonthSales + thisMonthIncome;

    // 7. This Month's Expenses (Purchases + Expenses)
    const thisMonthExpensesOnly = allExpenses
      .filter((e) => e.date.startsWith(currentMonthPrefix))
      .reduce((acc, e) => acc + e.amount, 0);
    const thisMonthPurchases = allPurchases
      .filter((p) => p.date.startsWith(currentMonthPrefix))
      .reduce((acc, p) => acc + p.total, 0);
    const thisMonthExpenseTotal = thisMonthExpensesOnly + thisMonthPurchases;

    // 8. Today's Profit
    // Sales Profit + Today Income - Today Expense
    const todaySalesProfit = allSales
      .filter((s) => s.date === todayStr)
      .reduce((acc, s) => acc + s.profit, 0);
    const todayIncome = allIncome
      .filter((i) => i.date === todayStr)
      .reduce((acc, i) => acc + i.amount, 0);
    const todayProfit = todaySalesProfit + todayIncome - todayExpensesAmount;

    // 9. Charts Data (By Month, last 6 months)
    const months = [];
    const d = new Date();
    for (let i = 5; i >= 0; i--) {
      const pastMonth = new Date(d.getFullYear(), d.getMonth() - i, 1);
      const prefix = pastMonth.toISOString().substring(0, 7);
      months.push({
        prefix,
        label: pastMonth.toLocaleString('default', { month: 'short', year: '2-digit' }),
        sales: 0,
        expenses: 0,
        profit: 0,
        cashFlow: 0,
      });
    }

    months.forEach((m) => {
      // Sales in month
      const sSum = allSales
        .filter((s) => s.date.startsWith(m.prefix))
        .reduce((acc, s) => acc + s.total, 0);
      const sProfit = allSales
        .filter((s) => s.date.startsWith(m.prefix))
        .reduce((acc, s) => acc + s.profit, 0);

      // Income in month
      const iSum = allIncome
        .filter((i) => i.date.startsWith(m.prefix))
        .reduce((acc, i) => acc + i.amount, 0);

      // Expenses in month
      const eSum = allExpenses
        .filter((e) => e.date.startsWith(m.prefix))
        .reduce((acc, e) => acc + e.amount, 0);

      // Purchases in month
      const pSum = allPurchases
        .filter((p) => p.date.startsWith(m.prefix))
        .reduce((acc, p) => acc + p.total, 0);

      m.sales = sSum;
      m.expenses = eSum + pSum;
      m.profit = sProfit + iSum - (eSum + pSum);

      // Cash flow calculation for month
      let cf = 0;
      allTransactions
        .filter((t) => t.date.startsWith(m.prefix))
        .forEach((t) => {
          if (t.type === 'CASH_IN' || t.type === 'INCOME' || t.type === 'SALE') {
            cf += t.amount;
          } else if (t.type === 'CASH_OUT' || t.type === 'EXPENSE' || t.type === 'PURCHASE') {
            cf -= t.amount;
          }
        });
      m.cashFlow = cf;
    });

    // 10. Inventory distribution by category for simple PieChart
    const categoryValuations: { [cat: string]: number } = {};
    allInventory.forEach((item) => {
      const cat = item.category || 'Uncategorized';
      categoryValuations[cat] = (categoryValuations[cat] || 0) + item.currentStock * item.purchasePrice;
    });
    const pieData = Object.keys(categoryValuations).map((name) => ({
      name,
      value: categoryValuations[name],
    }));

    // Recent Transactions (limit 5)
    const recentTx = [...allTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);

    return {
      todaySales: todaySalesAmount,
      todayExpense: todayExpensesAmount,
      todayProfit,
      currentCash,
      inventoryValuation,
      lowStockCount: lowStockItems.length,
      lowStockList: lowStockItems,
      thisMonthRevenue,
      thisMonthExpense: thisMonthExpenseTotal,
      chartData: months,
      pieData: pieData.length > 0 ? pieData : [{ name: 'Empty', value: 0 }],
      recentTransactions: recentTx,
    };
  });

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] gap-4" id="loading-state">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Loading ledger data...</p>
      </div>
    );
  }

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4'];

  return (
    <div className="space-y-6" id="dashboard-view">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Business Dashboard
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Real-time financial status of your business (100% Offline & Private).
          </p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs font-medium text-zinc-600 dark:text-zinc-400">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span>As of Today: {new Date().toLocaleDateString()}</span>
        </div>
      </div>

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="kpi-grid">
        {/* Today's Sales */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Today's Sales</p>
              <h3 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 mt-2">
                {formatCurrency(stats.todaySales, currencySymbol, currency)}
              </h3>
            </div>
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <ShoppingBag className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="text-emerald-500 font-semibold">Active</span>
            <span>retail transactions</span>
          </div>
        </div>

        {/* Today's Expense */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Today's Expense</p>
              <h3 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 mt-2">
                {formatCurrency(stats.todayExpense, currencySymbol, currency)}
              </h3>
            </div>
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <TrendingDown className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            <span>Operational expenses</span>
          </div>
        </div>

        {/* Today's Profit */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Today's Net Profit</p>
              <h3 className={`text-2xl font-bold mt-2 ${stats.todayProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {formatCurrency(stats.todayProfit, currencySymbol, currency)}
              </h3>
            </div>
            <div className={`p-2.5 rounded-xl ${stats.todayProfit >= 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'}`}>
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            {stats.todayProfit >= 0 ? (
              <ArrowUpRight className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <ArrowDownRight className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>Net margin on sales</span>
          </div>
        </div>

        {/* Current Cash */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm relative overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Current Cash</p>
              <h3 className="text-2xl font-bold text-zinc-950 dark:text-zinc-50 mt-2">
                {formatCurrency(stats.currentCash, currencySymbol, currency)}
              </h3>
            </div>
            <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
              <DollarSign className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
            <Layers className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Liquid business cash</span>
          </div>
        </div>
      </div>

      {/* Secondary Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4" id="secondary-metrics">
        {/* Inventory Value */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Inventory Value</p>
              <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(stats.inventoryValuation, currencySymbol, currency)}
              </h4>
            </div>
          </div>
        </div>

        {/* Low Stock count */}
        <div className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 flex items-center justify-between shadow-sm ${stats.lowStockCount > 0 ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/10 dark:bg-amber-950/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-xl ${stats.lowStockCount > 0 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">Low Stock Items</p>
              <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {stats.lowStockCount} items
              </h4>
            </div>
          </div>
        </div>

        {/* This Month Revenue */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">This Month Revenue</p>
              <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(stats.thisMonthRevenue, currencySymbol, currency)}
              </h4>
            </div>
          </div>
        </div>

        {/* This Month Expense */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-xl">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wider">This Month Expenses</p>
              <h4 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-0.5">
                {formatCurrency(stats.thisMonthExpense, currencySymbol, currency)}
              </h4>
            </div>
          </div>
        </div>
      </div>

      {/* Charts section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="charts-grid">
        {/* Main Sales & Expense Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Revenue & Expense Performance</h3>
              <p className="text-xs text-zinc-400">Monthly breakdown of top-line revenues vs operational expenses.</p>
            </div>
          </div>
          <div className="h-80 w-full" id="revenue-expense-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                <XAxis dataKey="label" stroke="#a1a1aa" fontSize={11} tickLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#18181b',
                  }}
                  formatter={(value: any) => [formatCurrency(Number(value), currencySymbol, currency), '']}
                />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Area name="Sales & Income" type="monotone" dataKey="sales" stroke="#6366f1" strokeWidth={2} fillOpacity={1} fill="url(#colorSales)" />
                <Area name="Expenses & Purchases" type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={2} fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Inventory Value Distribution Pie */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col">
          <div>
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Inventory Valuation</h3>
            <p className="text-xs text-zinc-400">Total holding value divided by product category.</p>
          </div>
          <div className="h-64 w-full flex-1 flex items-center justify-center mt-2 relative" id="inventory-pie-chart">
            {stats.pieData[0]?.value === 0 ? (
              <div className="text-center text-xs text-zinc-400">No inventory value recorded.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {stats.pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value), currencySymbol, currency)} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" iconSize={6} wrapperStyle={{ fontSize: '10px' }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Additional Charts: Profit & Cash Flow */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6" id="secondary-charts">
        {/* Net Profit Trend */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Monthly Net Profit Margin</h3>
          <div className="h-64 w-full" id="profit-bar-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                <XAxis dataKey="label" stroke="#a1a1aa" fontSize={11} tickLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [formatCurrency(Number(value), currencySymbol, currency), 'Net Profit']}
                />
                <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                  {stats.chartData.map((entry, idx) => (
                    <Cell key={`cell-${idx}`} fill={entry.profit >= 0 ? '#10b981' : '#f43f5e'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cash Flow Chart */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Net Cash Flow</h3>
          <div className="h-64 w-full" id="cash-flow-chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                <XAxis dataKey="label" stroke="#a1a1aa" fontSize={11} tickLine={false} />
                <YAxis stroke="#a1a1aa" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid #e4e4e7',
                    borderRadius: '8px',
                    fontSize: '12px',
                  }}
                  formatter={(value: any) => [formatCurrency(Number(value), currencySymbol, currency), 'Net Cash Flow']}
                />
                <Area type="monotone" dataKey="cashFlow" stroke="#f59e0b" strokeWidth={2} fill="#f59e0b" fillOpacity={0.1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Transactions & Low Stock Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" id="alerts-panels">
        {/* Recent Transactions list */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Recent Transactions</h3>
            <span className="text-xs text-zinc-400">Last 5 operations</span>
          </div>
          {stats.recentTransactions.length === 0 ? (
            <div className="text-center py-8 text-zinc-400 text-sm">No recent transactions.</div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
              {stats.recentTransactions.map((tx) => {
                const isPositive = tx.type === 'CASH_IN' || tx.type === 'INCOME' || tx.type === 'SALE';
                return (
                  <div key={tx.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {tx.description || tx.category}
                      </p>
                      <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1.5">
                        <span>{tx.date}</span>
                        <span>•</span>
                        <span>{tx.paymentMethod}</span>
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {isPositive ? '+' : '-'}{formatCurrency(tx.amount, currencySymbol, currency)}
                      </p>
                      <span className="inline-block text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-zinc-500 dark:text-zinc-400 mt-1">
                        {tx.type.replace('_', ' ')}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Low Stock Warning Panel */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              <span>Low Stock Alerts</span>
            </h3>
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 rounded-full">
              {stats.lowStockCount} Items
            </span>
          </div>
          {stats.lowStockCount === 0 ? (
            <div className="text-center py-12 text-zinc-400 text-sm">
              ✨ All products have healthy inventory levels.
            </div>
          ) : (
            <div className="space-y-3">
              {stats.lowStockList.map((item) => (
                <div key={item.id} className="p-3 bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 rounded-xl flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{item.name}</p>
                    <p className="text-xs text-zinc-400 mt-0.5">SKU: {item.sku}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      Stock: <span className="text-rose-500 font-bold">{item.currentStock}</span> / {item.minimumStock}
                    </p>
                    <span className="inline-block text-[10px] font-medium bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded mt-1">
                      Min Alert Threshold
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
