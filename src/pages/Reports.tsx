import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency, formatDate, exportToExcel, exportToCSV } from '../utils';
import { toast } from '../components/Toast';
import {
  Calendar,
  Download,
  FileText,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Package,
  Users,
  Briefcase,
  Layers,
  Search,
  Printer,
  X,
  Eye,
} from 'lucide-react';

export default function Reports() {
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

  // Query and compute report stats for the selected date range
  const stats = useLiveQuery(async () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999); // inclusive of end date

    // 1. Sales
    const allSales = await db.sales.toArray();
    const inRangeSales = allSales.filter((s) => {
      const d = new Date(s.date);
      return d >= start && d <= end;
    });
    const totalSalesVolume = inRangeSales.reduce((acc, s) => acc + s.total, 0);
    const totalSalesProfit = inRangeSales.reduce((acc, s) => acc + s.profit, 0);

    // 2. Purchases
    const allPurchases = await db.purchases.toArray();
    const inRangePurchases = allPurchases.filter((p) => {
      const d = new Date(p.date);
      return d >= start && d <= end;
    });
    const totalPurchasesVolume = inRangePurchases.reduce((acc, p) => acc + p.total, 0);

    // 3. Expenses
    const allExpenses = await db.expenses.toArray();
    const inRangeExpenses = allExpenses.filter((e) => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });
    const totalExpensesVolume = inRangeExpenses.reduce((acc, e) => acc + e.amount, 0);

    // 4. Extra Income
    const allIncome = await db.income.toArray();
    const inRangeIncome = allIncome.filter((i) => {
      const d = new Date(i.date);
      return d >= start && d <= end;
    });
    const totalIncomeVolume = inRangeIncome.reduce((acc, i) => acc + i.amount, 0);

    // 5. Total Transactions
    const allTx = await db.transactions.toArray();
    const inRangeTx = allTx.filter((t) => {
      const d = new Date(t.date);
      return d >= start && d <= end;
    });

    // 6. Customers & Suppliers counts
    const customersCount = await db.customers.count();
    const suppliersCount = await db.suppliers.count();

    // 7. Inventory total asset value
    const inventory = await db.inventory.toArray();
    const totalInventoryValue = inventory.reduce((acc, item) => acc + item.currentStock * item.purchasePrice, 0);
    const totalInventoryItems = inventory.reduce((acc, item) => acc + item.currentStock, 0);

    // 8. Cost of Goods Sold (COGS) in range
    const saleItems = await db.saleItems.toArray();
    const inRangeSaleIds = inRangeSales.map((s) => s.id);
    const inRangeSaleItems = saleItems.filter((item) => inRangeSaleIds.includes(item.saleId));
    const totalCOGS = inRangeSaleItems.reduce((acc, item) => acc + item.quantity * item.costPrice, 0);

    return {
      salesCount: inRangeSales.length,
      salesVolume: totalSalesVolume,
      salesProfit: totalSalesProfit,
      purchasesCount: inRangePurchases.length,
      purchasesVolume: totalPurchasesVolume,
      expensesVolume: totalExpensesVolume,
      incomeVolume: totalIncomeVolume,
      transactionsCount: inRangeTx.length,
      customersCount,
      suppliersCount,
      totalInventoryValue,
      totalInventoryItems,
      totalCOGS,
      inRangeSales,
      inRangeExpenses,
      inRangeIncome,
      inRangePurchases,
      inRangeTx,
      inventoryList: inventory,
    };
  }, [startDate, endDate]);

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
    toast.info('Report Period Updated', `Filters updated.`);
  };

  // Active Preview State
  const [activeReportPreview, setActiveReportPreview] = useState<'sales' | 'purchases' | 'expenses' | 'inventory' | 'cash_flow' | 'profit' | null>(null);

  // Dedicated Report Downloads
  const downloadSalesReport = () => {
    if (!stats || stats.inRangeSales.length === 0) {
      toast.error('Export Error', 'No sales data in this date range.');
      return;
    }
    const data = stats.inRangeSales.map((s) => ({
      'Invoice Number': s.invoiceNumber,
      Date: formatDate(s.date),
      Total: s.total,
      Profit: s.profit,
      Notes: s.notes || '',
    }));
    exportToExcel(data, `Sales_Report_${startDate}_to_${endDate}`);
  };

  const downloadPurchaseReport = async () => {
    if (!stats || stats.inRangePurchases.length === 0) {
      toast.error('Export Error', 'No purchase records in this date range.');
      return;
    }
    const suppliers = await db.suppliers.toArray();
    const data = stats.inRangePurchases.map((p) => {
      const sup = suppliers.find((s) => s.id === p.supplierId);
      return {
        'Bill Number': p.billNumber,
        Date: formatDate(p.date),
        Supplier: sup ? sup.name : 'Walk-In Supplier',
        Total: p.total,
        Notes: p.notes || '',
      };
    });
    exportToExcel(data, `Purchase_Report_${startDate}_to_${endDate}`);
  };

  const downloadExpenseReport = () => {
    if (!stats || stats.inRangeExpenses.length === 0) {
      toast.error('Export Error', 'No expense logs in this range.');
      return;
    }
    const data = stats.inRangeExpenses.map((e) => ({
      Date: formatDate(e.date),
      Category: e.category,
      Amount: e.amount,
      Description: e.description,
      'Payment Method': e.paymentMethod,
    }));
    exportToExcel(data, `Expense_Report_${startDate}_to_${endDate}`);
  };

  const downloadInventoryValuation = () => {
    if (!stats || stats.inventoryList.length === 0) {
      toast.error('Export Error', 'No items in the product inventory.');
      return;
    }
    const data = stats.inventoryList.map((item) => ({
      'Product Name': item.name,
      SKU: item.sku,
      'Purchase Cost': item.purchasePrice,
      'Selling Price': item.sellingPrice,
      'Stock Level': item.currentStock,
      'Asset Valuation': item.currentStock * item.purchasePrice,
    }));
    exportToExcel(data, `Inventory_Valuation_Report`);
  };

  const downloadCashFlowReport = () => {
    if (!stats || stats.inRangeTx.length === 0) {
      toast.error('Export Error', 'No ledger cash flow in this date range.');
      return;
    }
    const data = stats.inRangeTx.map((t) => ({
      Date: formatDate(t.date),
      Type: t.type,
      Category: t.category,
      Description: t.description || '',
      'Payment Method': t.paymentMethod || '',
      Reference: t.reference || '',
      Amount: t.amount,
      Flow: ['CASH_IN', 'INCOME', 'SALE'].includes(t.type) ? 'CASH IN (+)' : 'CASH OUT (-)',
    }));
    exportToExcel(data, `Cash_Flow_Ledger_${startDate}_to_${endDate}`);
  };

  const downloadProfitReport = () => {
    if (!stats) return;
    const grossRevenue = stats.salesVolume + stats.incomeVolume;
    const grossProfit = grossRevenue - stats.totalCOGS;
    const netProfit = grossProfit - stats.expensesVolume;

    const data = [
      { Category: '1. Operating Revenue', Metric: 'Retail Product Sales', Amount: stats.salesVolume },
      { Category: '1. Operating Revenue', Metric: 'Secondary Income streams', Amount: stats.incomeVolume },
      { Category: '1. Operating Revenue', Metric: 'Total Gross Revenues (A)', Amount: grossRevenue },
      { Category: '2. Cost of Goods Sold', Metric: 'Wholesale Cost COGS (B)', Amount: stats.totalCOGS },
      { Category: '2. Cost of Goods Sold', Metric: 'Gross Profit Margins (A - B)', Amount: grossProfit },
      { Category: '3. Operating Expenses', Metric: 'Overheads & Utility Outlays (C)', Amount: stats.expensesVolume },
      { Category: '3. Operating Expenses', Metric: 'Net Profit margin (A - B - C)', Amount: netProfit },
    ];
    exportToExcel(data, `Profit_Summary_Report_${startDate}_to_${endDate}`);
  };

  return (
    <div className="space-y-6" id="reports-view">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
          Financial & Audit Reports
        </h1>
        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
          Perform analytical audit checks, filter operational records, and compile multi-format spreadsheets.
        </p>
      </div>

      {/* Date Range Selector Box */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
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

      {/* Grid: Financial Summary of Range */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Sales Volume */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Gross Sales Revenue</span>
              <TrendingUp className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-xl font-bold mt-2 text-zinc-900 dark:text-zinc-100">
              {formatCurrency(stats.salesVolume, currencySymbol, currency)}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">{stats.salesCount} Invoices generated</p>
          </div>

          {/* Retail Margin */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Retail Profit Margin</span>
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xl font-bold mt-2 text-emerald-600">
              {formatCurrency(stats.salesProfit, currencySymbol, currency)}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">Estimations based on supply cost</p>
          </div>

          {/* Operational Overheads */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Overhead Expenses</span>
              <TrendingDown className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-xl font-bold mt-2 text-rose-600">
              {formatCurrency(stats.expensesVolume, currencySymbol, currency)}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">Utility & overhead cost registries</p>
          </div>

          {/* Inventory Asset Valuation */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Inventory Asset Worth</span>
              <Package className="w-4 h-4 text-indigo-500" />
            </div>
            <p className="text-xl font-bold mt-2 text-zinc-900 dark:text-zinc-100">
              {formatCurrency(stats.totalInventoryValue, currencySymbol, currency)}
            </p>
            <p className="text-[10px] text-zinc-400 mt-1">{stats.totalInventoryItems} physical items stocked</p>
          </div>
        </div>
      )}

      {/* Box: Download Dedicated Reports */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4 print:hidden">
        <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
          Generate Compilation Sheets
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Sales Card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between h-44 shadow-xs">
            <div>
              <TrendingUp className="w-5 h-5 text-indigo-600 mb-2" />
              <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">Retail Sales Sheet</h4>
              <p className="text-[10px] text-zinc-400 mt-1">Logs invoices, tax returns, discounts, and net sales profits in range.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setActiveReportPreview('sales')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View & Print</span>
              </button>
              <button
                onClick={downloadSalesReport}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Purchase Card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between h-44 shadow-xs">
            <div>
              <Package className="w-5 h-5 text-sky-600 mb-2" />
              <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">Supply Procurement Sheet</h4>
              <p className="text-[10px] text-zinc-400 mt-1">Logs bulk wholesale purchases, bill numbers, and supplier outlays.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setActiveReportPreview('purchases')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View & Print</span>
              </button>
              <button
                onClick={downloadPurchaseReport}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Overhead Expenses Card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between h-44 shadow-xs">
            <div>
              <TrendingDown className="w-5 h-5 text-rose-600 mb-2" />
              <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">Overhead Expenses Sheet</h4>
              <p className="text-[10px] text-zinc-400 mt-1">Breakdown of operational utility costs, rent, tea, salaries, etc.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setActiveReportPreview('expenses')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View & Print</span>
              </button>
              <button
                onClick={downloadExpenseReport}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Inventory valuation Card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between h-44 shadow-xs">
            <div>
              <Layers className="w-5 h-5 text-amber-500 mb-2" />
              <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">Inventory Valuation Sheet</h4>
              <p className="text-[10px] text-zinc-400 mt-1">Calculates physical holding stock counts, costs, and asset worth.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setActiveReportPreview('inventory')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View & Print</span>
              </button>
              <button
                onClick={downloadInventoryValuation}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Cash Flow Card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between h-44 shadow-xs">
            <div>
              <DollarSign className="w-5 h-5 text-emerald-600 mb-2" />
              <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">Cash Flow Ledger Journal</h4>
              <p className="text-[10px] text-zinc-400 mt-1">Unified general book double-entry logging cash in vs outflows.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setActiveReportPreview('cash_flow')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View & Print</span>
              </button>
              <button
                onClick={downloadCashFlowReport}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>

          {/* Net Profit Card */}
          <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl flex flex-col justify-between h-44 shadow-xs">
            <div>
              <FileText className="w-5 h-5 text-indigo-500 mb-2" />
              <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200">Net Profit Statement</h4>
              <p className="text-[10px] text-zinc-400 mt-1">Consolidated P&L summary, gross margins, overheads, nets.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setActiveReportPreview('profit')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View & Print</span>
              </button>
              <button
                onClick={downloadProfitReport}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-zinc-500 hover:text-zinc-700 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Excel</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* INTERACTIVE PRINT PREVIEW MODAL */}
      {activeReportPreview && stats && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/60 backdrop-blur-sm print:relative print:bg-white print:p-0 print:z-0">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl print:shadow-none print:border-none print:max-h-none print:rounded-none">
            {/* Modal Actions Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-150 dark:border-zinc-800/80 print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-zinc-850 dark:text-zinc-150 uppercase tracking-tight text-sm">
                  {activeReportPreview.replace('_', ' ')} Audit Preview
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print / Save PDF</span>
                </button>
                <button
                  onClick={() => setActiveReportPreview(null)}
                  className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-600 transition cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Print content sheets */}
            <div className="overflow-y-auto p-6 md:p-8 space-y-6 print:overflow-visible print:p-0" id="reports-printable-area">
              {/* Report Letterhead Header */}
              <div className="text-center pb-6 border-b border-zinc-100 dark:border-zinc-800/80">
                <h1 className="text-3xl font-extrabold text-indigo-600 dark:text-indigo-400 uppercase tracking-tight">
                  {settings.businessName}
                </h1>
                <h2 className="text-lg font-black text-zinc-800 dark:text-zinc-200 mt-1 uppercase tracking-widest">
                  {activeReportPreview === 'sales' && 'RETAIL SALES REGISTER'}
                  {activeReportPreview === 'purchases' && 'SUPPLY PROCUREMENT JOURNAL'}
                  {activeReportPreview === 'expenses' && 'OPERATIONAL EXPENSES REGISTER'}
                  {activeReportPreview === 'inventory' && 'INVENTORY VALUATION LEDGER'}
                  {activeReportPreview === 'cash_flow' && 'CASH FLOW JOURNAL'}
                  {activeReportPreview === 'profit' && 'PROFIT & LOSS STATEMENT'}
                </h2>
                <p className="text-xs text-zinc-400 font-mono mt-1">
                  Report Period: {startDate} to {endDate}
                </p>
                <p className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  Generated privately on offline client node • 100% Secure
                </p>
              </div>

              {/* REPORT 1: SALES */}
              {activeReportPreview === 'sales' && (
                <div className="space-y-4">
                  <table className="w-full text-left text-xs text-zinc-700 dark:text-zinc-300">
                    <thead>
                      <tr className="uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2">
                        <th className="py-2">Date</th>
                        <th className="py-2">Invoice #</th>
                        <th className="py-2 text-right">Tax</th>
                        <th className="py-2 text-right">Profit</th>
                        <th className="py-2 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {stats.inRangeSales.map((s) => (
                        <tr key={s.id} className="py-2.5">
                          <td className="py-2">{formatDate(s.date)}</td>
                          <td className="py-2 font-mono font-bold text-indigo-600 dark:text-indigo-400">{s.invoiceNumber}</td>
                          <td className="py-2 text-right">{formatCurrency(s.taxAmount, currencySymbol, currency)}</td>
                          <td className="py-2 text-right text-emerald-600 font-semibold">{formatCurrency(s.profit, currencySymbol, currency)}</td>
                          <td className="py-2 text-right font-bold">{formatCurrency(s.total, currencySymbol, currency)}</td>
                        </tr>
                      ))}
                      {stats.inRangeSales.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-400">No sales transactions found in range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-850 flex justify-end gap-6 text-sm">
                    <div>
                      <span className="text-zinc-400 text-xs">Total Sales Revenue:</span>
                      <p className="font-extrabold text-zinc-900 dark:text-zinc-100">{formatCurrency(stats.salesVolume, currencySymbol, currency)}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400 text-xs">Total Estimated Profit:</span>
                      <p className="font-extrabold text-emerald-600">{formatCurrency(stats.salesProfit, currencySymbol, currency)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* REPORT 2: PURCHASES */}
              {activeReportPreview === 'purchases' && (
                <div className="space-y-4">
                  <table className="w-full text-left text-xs text-zinc-700 dark:text-zinc-300">
                    <thead>
                      <tr className="uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2">
                        <th className="py-2">Date</th>
                        <th className="py-2">Bill #</th>
                        <th className="py-2">Notes</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {stats.inRangePurchases.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2">{formatDate(p.date)}</td>
                          <td className="py-2 font-mono font-bold text-sky-600 dark:text-sky-400">{p.billNumber}</td>
                          <td className="py-2 text-zinc-400 truncate max-w-xs">{p.notes || '-'}</td>
                          <td className="py-2 text-right font-bold">{formatCurrency(p.total, currencySymbol, currency)}</td>
                        </tr>
                      ))}
                      {stats.inRangePurchases.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-zinc-400">No supply purchases found in range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-850 text-right text-sm">
                    <span className="text-zinc-400 text-xs">Total Wholesale Procurements:</span>
                    <p className="font-extrabold text-zinc-900 dark:text-zinc-100">{formatCurrency(stats.purchasesVolume, currencySymbol, currency)}</p>
                  </div>
                </div>
              )}

              {/* REPORT 3: EXPENSES */}
              {activeReportPreview === 'expenses' && (
                <div className="space-y-4">
                  <table className="w-full text-left text-xs text-zinc-700 dark:text-zinc-300">
                    <thead>
                      <tr className="uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2">
                        <th className="py-2">Date</th>
                        <th className="py-2">Category</th>
                        <th className="py-2">Description</th>
                        <th className="py-2">Payment Method</th>
                        <th className="py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {stats.inRangeExpenses.map((e) => (
                        <tr key={e.id}>
                          <td className="py-2">{formatDate(e.date)}</td>
                          <td className="py-2"><span className="px-2 py-0.5 bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded text-[10px] font-bold">{e.category}</span></td>
                          <td className="py-2 text-zinc-500">{e.description || '-'}</td>
                          <td className="py-2 text-zinc-400">{e.paymentMethod}</td>
                          <td className="py-2 text-right font-bold text-rose-600">-{formatCurrency(e.amount, currencySymbol, currency)}</td>
                        </tr>
                      ))}
                      {stats.inRangeExpenses.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-400">No overhead expenses found in range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-850 text-right text-sm">
                    <span className="text-zinc-400 text-xs">Total Overhead Expenses:</span>
                    <p className="font-extrabold text-rose-600">{formatCurrency(stats.expensesVolume, currencySymbol, currency)}</p>
                  </div>
                </div>
              )}

              {/* REPORT 4: INVENTORY */}
              {activeReportPreview === 'inventory' && (
                <div className="space-y-4">
                  <table className="w-full text-left text-xs text-zinc-700 dark:text-zinc-300">
                    <thead>
                      <tr className="uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2">
                        <th className="py-2">Product Name</th>
                        <th className="py-2">SKU</th>
                        <th className="py-2 text-right">Unit Cost</th>
                        <th className="py-2 text-right">Retail Price</th>
                        <th className="py-2 text-center">In Stock</th>
                        <th className="py-2 text-right">Asset Valuation</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {stats.inventoryList.map((item) => (
                        <tr key={item.id}>
                          <td className="py-2 font-bold text-zinc-900 dark:text-zinc-100">{item.name}</td>
                          <td className="py-2 font-mono text-zinc-400">{item.sku}</td>
                          <td className="py-2 text-right">{formatCurrency(item.purchasePrice, currencySymbol, currency)}</td>
                          <td className="py-2 text-right">{formatCurrency(item.sellingPrice, currencySymbol, currency)}</td>
                          <td className="py-2 text-center font-semibold">{item.currentStock}</td>
                          <td className="py-2 text-right font-bold">{formatCurrency(item.currentStock * item.purchasePrice, currencySymbol, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="pt-4 border-t border-zinc-200 dark:border-zinc-850 flex justify-end gap-6 text-sm">
                    <div>
                      <span className="text-zinc-400 text-xs">Total Pieces:</span>
                      <p className="font-extrabold text-zinc-900 dark:text-zinc-100 text-right">{stats.totalInventoryItems}</p>
                    </div>
                    <div>
                      <span className="text-zinc-400 text-xs">Total Gross Asset Valuation:</span>
                      <p className="font-extrabold text-indigo-600">{formatCurrency(stats.totalInventoryValue, currencySymbol, currency)}</p>
                    </div>
                  </div>
                </div>
              )}

              {/* REPORT 5: CASH FLOW */}
              {activeReportPreview === 'cash_flow' && (
                <div className="space-y-4">
                  <table className="w-full text-left text-xs text-zinc-700 dark:text-zinc-300">
                    <thead>
                      <tr className="uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-200 dark:border-zinc-800 pb-2">
                        <th className="py-2">Date</th>
                        <th className="py-2">Type</th>
                        <th className="py-2">Category</th>
                        <th className="py-2">Reference</th>
                        <th className="py-2 text-right">Amount Change</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                      {stats.inRangeTx.map((tx) => {
                        const isIn = ['CASH_IN', 'INCOME', 'SALE'].includes(tx.type);
                        return (
                          <tr key={tx.id}>
                            <td className="py-2">{formatDate(tx.date)}</td>
                            <td className="py-2"><span className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold ${isIn ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600'}`}>{tx.type}</span></td>
                            <td className="py-2 text-zinc-500">{tx.category}</td>
                            <td className="py-2 font-mono text-zinc-400">{tx.reference || '-'}</td>
                            <td className={`py-2 text-right font-extrabold ${isIn ? 'text-emerald-600' : 'text-rose-600'}`}>
                              {isIn ? '+' : '-'}{formatCurrency(tx.amount, currencySymbol, currency)}
                            </td>
                          </tr>
                        );
                      })}
                      {stats.inRangeTx.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-400">No transaction journal lines found in range.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* REPORT 6: NET PROFIT */}
              {activeReportPreview === 'profit' && (
                <div className="space-y-6 max-w-2xl mx-auto text-sm text-zinc-800 dark:text-zinc-200">
                  <div className="space-y-3">
                    <h3 className="font-extrabold text-xs uppercase tracking-widest text-indigo-500">1. Operating Income / Revenue</h3>
                    <div className="flex justify-between pl-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                      <span>Gross Sales Revenue (Product Delivery):</span>
                      <span className="font-bold">{formatCurrency(stats.salesVolume, currencySymbol, currency)}</span>
                    </div>
                    <div className="flex justify-between pl-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                      <span>Secondary Revenue Streams / Other Income:</span>
                      <span className="font-bold">{formatCurrency(stats.incomeVolume, currencySymbol, currency)}</span>
                    </div>
                    <div className="flex justify-between bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl font-extrabold">
                      <span>Total Gross Revenues (A):</span>
                      <span>{formatCurrency(stats.salesVolume + stats.incomeVolume, currencySymbol, currency)}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-extrabold text-xs uppercase tracking-widest text-rose-500">2. Cost of Sales / Wholesale COGS</h3>
                    <div className="flex justify-between pl-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                      <span>Calculated Cost of Goods Sold (COGS):</span>
                      <span className="font-bold text-rose-600">-{formatCurrency(stats.totalCOGS, currencySymbol, currency)}</span>
                    </div>
                    <div className="flex justify-between bg-zinc-50 dark:bg-zinc-950 p-2.5 rounded-xl font-extrabold">
                      <span>Gross Profit Margin (A - B):</span>
                      <span className="text-emerald-600">{formatCurrency((stats.salesVolume + stats.incomeVolume) - stats.totalCOGS, currencySymbol, currency)}</span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-extrabold text-xs uppercase tracking-widest text-rose-500">3. Operational Overheads</h3>
                    <div className="flex justify-between pl-4 py-1.5 border-b border-zinc-100 dark:border-zinc-800">
                      <span>General Overhead outlays:</span>
                      <span className="font-bold text-rose-600">-{formatCurrency(stats.expensesVolume, currencySymbol, currency)}</span>
                    </div>
                    <div className="flex justify-between bg-indigo-50 dark:bg-indigo-950/40 p-3 rounded-xl font-black text-indigo-600 dark:text-indigo-400 text-base">
                      <span>Net Operating Margin:</span>
                      <span>{formatCurrency(((stats.salesVolume + stats.incomeVolume) - stats.totalCOGS) - stats.expensesVolume, currencySymbol, currency)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Print Sheet Sign-off */}
              <div className="text-center pt-8 border-t border-zinc-100 dark:border-zinc-850">
                <p className="text-xs text-zinc-400 font-bold">End of Audit Statement</p>
                <p className="text-[10px] text-zinc-300 dark:text-zinc-850 mt-2">
                  SwiftBooks Accounting Database Node • Device Local Storage Node
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
