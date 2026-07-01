import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency } from '../utils';
import {
  TrendingUp,
  FileText,
  DollarSign,
  TrendingDown,
  Calculator,
  Percent,
  Calendar,
  Printer,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { toast } from '../components/Toast';

export default function ProfitLoss() {
  const { settings } = useBusiness();
  const { currencySymbol, currency } = settings;

  // Range States
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  const setPreset = (preset: 'TODAY' | 'WEEK' | 'MONTH' | 'YEAR') => {
    const today = new Date();
    const endStr = today.toISOString().split('T')[0];
    setEndDate(endStr);

    if (preset === 'TODAY') {
      setStartDate(endStr);
    } else if (preset === 'WEEK') {
      const start = new Date();
      start.setDate(today.getDate() - 7);
      setStartDate(start.toISOString().split('T')[0]);
    } else if (preset === 'MONTH') {
      const start = new Date();
      start.setMonth(today.getMonth() - 1);
      setStartDate(start.toISOString().split('T')[0]);
    } else if (preset === 'YEAR') {
      const start = new Date();
      start.setFullYear(today.getFullYear() - 1);
      setStartDate(start.toISOString().split('T')[0]);
    }
    toast.info('P&L Period Updated', `Filters updated.`);
  };

  // Compute all P&L Metrics from IndexedDB filtered by date
  const plMetrics = useLiveQuery(async () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // 1. Core Sales Revenue
    const allSales = await db.sales.toArray();
    const inRangeSales = allSales.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });
    const totalSalesRevenue = inRangeSales.reduce((acc, s) => acc + s.total, 0);

    // 2. Cost of Goods Sold (COGS)
    const saleItems = await db.saleItems.toArray();
    const inRangeSaleIds = inRangeSales.map((s) => s.id);
    const inRangeSaleItems = saleItems.filter((item) => inRangeSaleIds.includes(item.saleId));
    const totalCOGS = inRangeSaleItems.reduce((acc, item) => acc + item.quantity * item.costPrice, 0);

    // 3. Other extra income streams
    const allIncome = await db.income.toArray();
    const inRangeIncome = allIncome.filter((i) => {
      const d = new Date(i.date);
      return d >= start && d <= end;
    });
    const totalExtraIncome = inRangeIncome.reduce((acc, i) => acc + i.amount, 0);

    // 4. Operational Overhead Expenses
    const allExpenses = await db.expenses.toArray();
    const inRangeExpenses = allExpenses.filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
    const totalOverheadExpenses = inRangeExpenses.reduce((acc, e) => acc + e.amount, 0);

    // Dynamic Calculations
    const grossRevenue = totalSalesRevenue + totalExtraIncome;
    const grossProfit = grossRevenue - totalCOGS;
    const netProfit = grossProfit - totalOverheadExpenses;
    const netProfitMargin = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

    // Build monthly comparative breakdown for the last 6 months
    const monthlyData = [];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    
    // Get last 6 months list dynamically
    const today = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthIndex = d.getMonth();
      const year = d.getFullYear();
      const monthLabel = `${months[monthIndex]} ${year}`;

      // Filter databases for this specific month
      const startOfMonth = new Date(year, monthIndex, 1);
      const endOfMonth = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);

      // Monthly sales
      const mSales = allSales.filter(s => {
        const sd = new Date(s.date);
        return sd >= startOfMonth && sd <= endOfMonth;
      });
      const mSalesRev = mSales.reduce((acc, s) => acc + s.total, 0);

      // Monthly other income
      const mInc = allIncome.filter(i => {
        const id = new Date(i.date);
        return id >= startOfMonth && id <= endOfMonth;
      });
      const mIncVal = mInc.reduce((acc, i) => acc + i.amount, 0);

      // Monthly Expenses
      const mExp = allExpenses.filter(e => {
        const ed = new Date(e.date);
        return ed >= startOfMonth && ed <= endOfMonth;
      });
      const mExpVal = mExp.reduce((acc, e) => acc + e.amount, 0);

      // Monthly COGS
      const mSaleIds = mSales.map(s => s.id);
      const mSaleItems = saleItems.filter(item => mSaleIds.includes(item.saleId));
      const mCOGS = mSaleItems.reduce((acc, item) => acc + item.quantity * item.costPrice, 0);

      const mGrossRev = mSalesRev + mIncVal;
      const mGrossProfit = mGrossRev - mCOGS;
      const mNetProfit = mGrossProfit - mExpVal;

      monthlyData.push({
        month: monthLabel,
        Revenue: mGrossRev,
        Expenses: mExpVal + mCOGS,
        'Net Profit': mNetProfit,
      });
    }

    return {
      totalSalesRevenue,
      totalCOGS,
      totalExtraIncome,
      totalOverheadExpenses,
      grossRevenue,
      grossProfit,
      netProfit,
      netProfitMargin,
      monthlyData,
    };
  });

  return (
    <div className="space-y-6" id="profit-loss-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Profit & Loss Statement
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Review dynamic, automatically compiled statements for business viability, operational margins, and cost adjustments.
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 text-xs font-bold px-4 py-2.5 rounded-xl transition cursor-pointer self-start sm:self-auto shadow-sm"
        >
          <Printer className="w-4 h-4" />
          <span>Print Statement</span>
        </button>
      </div>

      {/* Date Range Selector Box */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 print:hidden">
        <div className="flex flex-col sm:flex-row items-end justify-between gap-4">
          <div className="grid grid-cols-2 gap-4 w-full sm:w-auto">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">From Date</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-400 uppercase">To Date</label>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Quick presets */}
          <div className="flex items-center gap-1.5 self-start sm:self-auto w-full sm:w-auto justify-end">
            <button
              onClick={() => setPreset('TODAY')}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={() => setPreset('WEEK')}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setPreset('MONTH')}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Last Month
            </button>
            <button
              onClick={() => setPreset('YEAR')}
              className="px-3 py-1.5 bg-zinc-50 dark:bg-zinc-950 hover:bg-zinc-100 dark:hover:bg-zinc-800 border border-zinc-200 dark:border-zinc-800 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Last Year
            </button>
          </div>
        </div>
      </div>

      {/* Print-only Header */}
      <div className="hidden print:block text-center pb-6 border-b border-zinc-200 mb-6">
        <h1 className="text-3xl font-extrabold text-zinc-900 uppercase tracking-wide">{settings.businessName}</h1>
        <h2 className="text-xl font-bold text-zinc-600 mt-1">PROFIT & LOSS STATEMENT</h2>
        <p className="text-xs text-zinc-400 mt-1 font-mono">Period: {startDate} to {endDate}</p>
        <p className="text-[10px] text-zinc-400 font-mono mt-0.5">Generated securely on-device • 100% Private Offline Ledger</p>
      </div>

      {/* Main stats cards layout */}
      {plMetrics && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Revenue card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Gross Revenue (A)</span>
              <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
                {formatCurrency(plMetrics.grossRevenue, currencySymbol, currency)}
              </p>
              <div className="mt-3 space-y-1 text-xs text-zinc-500">
                <div className="flex justify-between">
                  <span>Product Sales Revenue:</span>
                  <span className="font-semibold">{formatCurrency(plMetrics.totalSalesRevenue, currencySymbol, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Secondary Income:</span>
                  <span className="font-semibold">{formatCurrency(plMetrics.totalExtraIncome, currencySymbol, currency)}</span>
                </div>
              </div>
            </div>

            {/* Expenses card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Total Expenses & COGS (B)</span>
              <p className="text-2xl font-black text-rose-600 mt-2">
                {formatCurrency(plMetrics.totalCOGS + plMetrics.totalOverheadExpenses, currencySymbol, currency)}
              </p>
              <div className="mt-3 space-y-1 text-xs text-zinc-500">
                <div className="flex justify-between">
                  <span>Cost of Goods Sold (COGS):</span>
                  <span className="font-semibold">{formatCurrency(plMetrics.totalCOGS, currencySymbol, currency)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Operational Overheads:</span>
                  <span className="font-semibold">{formatCurrency(plMetrics.totalOverheadExpenses, currencySymbol, currency)}</span>
                </div>
              </div>
            </div>

            {/* Net Profits card */}
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Net Profit / Viability (A - B)</span>
              <p className={`text-2xl font-black mt-2 ${plMetrics.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {formatCurrency(plMetrics.netProfit, currencySymbol, currency)}
              </p>
              <div className="mt-3 space-y-1 text-xs text-zinc-500">
                <div className="flex justify-between">
                  <span>Gross Profit Margin:</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {formatCurrency(plMetrics.grossProfit, currencySymbol, currency)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Net Profit Margin Rate:</span>
                  <span className="font-semibold text-emerald-600">
                    {plMetrics.netProfitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Statement Layout & Chart Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profit & Loss spreadsheet ledger */}
            <div className="lg:col-span-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2.5 flex items-center gap-1.5">
                <Calculator className="w-4 h-4 text-indigo-500" />
                <span>P&L Statement Sheet</span>
              </h3>

              <div className="space-y-4 text-xs">
                {/* Income part */}
                <div className="space-y-2">
                  <p className="font-bold text-indigo-600 dark:text-indigo-400 text-[10px] uppercase tracking-wider">1. Operating Income</p>
                  <div className="flex justify-between pl-2">
                    <span className="text-zinc-500">Product Retail Invoices:</span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(plMetrics.totalSalesRevenue, currencySymbol, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between pl-2 pb-1 border-b border-zinc-100 dark:border-zinc-850">
                    <span className="text-zinc-500">Secondary Operating Streams:</span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(plMetrics.totalExtraIncome, currencySymbol, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-sm bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg">
                    <span>Total Revenue:</span>
                    <span>{formatCurrency(plMetrics.grossRevenue, currencySymbol, currency)}</span>
                  </div>
                </div>

                {/* COGS part */}
                <div className="space-y-2">
                  <p className="font-bold text-rose-500 text-[10px] uppercase tracking-wider">2. Cost Of Goods Sold</p>
                  <div className="flex justify-between pl-2 pb-1 border-b border-zinc-100 dark:border-zinc-850">
                    <span className="text-zinc-500">Materials Wholesale Purchase COGS:</span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(plMetrics.totalCOGS, currencySymbol, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-sm bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg">
                    <span>Gross Profit (A - COGS):</span>
                    <span className="text-emerald-600">{formatCurrency(plMetrics.grossProfit, currencySymbol, currency)}</span>
                  </div>
                </div>

                {/* Overheads part */}
                <div className="space-y-2">
                  <p className="font-bold text-rose-500 text-[10px] uppercase tracking-wider">3. Operational Overheads</p>
                  <div className="flex justify-between pl-2 pb-1 border-b border-zinc-100 dark:border-zinc-850">
                    <span className="text-zinc-500">General Overhead Expenses:</span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      {formatCurrency(plMetrics.totalOverheadExpenses, currencySymbol, currency)}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-sm bg-zinc-50 dark:bg-zinc-950 p-2 rounded-lg">
                    <span>Net Operating Profit:</span>
                    <span className={plMetrics.netProfit >= 0 ? 'text-emerald-600' : 'text-rose-600'}>
                      {formatCurrency(plMetrics.netProfit, currencySymbol, currency)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Comparison Charts */}
            <div className="lg:col-span-2 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col h-full min-h-[400px]">
              <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2.5 mb-4 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-indigo-500" />
                <span>Monthly comparative margins (Last 6 Months)</span>
              </h3>
              <div className="h-80 w-full flex-1">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={plMetrics.monthlyData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" className="dark:stroke-zinc-800" />
                    <XAxis dataKey="month" stroke="#a1a1aa" fontSize={10} tickLine={false} />
                    <YAxis stroke="#a1a1aa" fontSize={10} tickLine={false} />
                    <Tooltip formatter={(value: any) => formatCurrency(Number(value), currencySymbol, currency)} />
                    <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="Revenue" fill="#6366f1" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Net Profit" fill="#10b981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
