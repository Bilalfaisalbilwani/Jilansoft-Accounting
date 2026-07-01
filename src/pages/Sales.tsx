import React, { useState, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Sale, type SaleItem, type Customer, type InventoryItem } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency, formatDate } from '../utils';
import { toast } from '../components/Toast';
import {
  Plus,
  Search,
  Printer,
  FileText,
  User,
  Package,
  Trash2,
  ChevronLeft,
  Calendar,
  Layers,
  Percent,
  Calculator,
  X,
  PlusCircle,
  TrendingUp,
} from 'lucide-react';

interface InvoiceCartItem {
  inventoryItem: InventoryItem;
  quantity: number;
  unitPrice: number;
  discount: number; // Flat discount
  tax: number; // Flat tax
}

export default function Sales() {
  const { settings } = useBusiness();
  const { currencySymbol, currency } = settings;

  // Navigation State
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'PRINT'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPrintSale, setSelectedPrintSale] = useState<Sale | null>(null);
  const [selectedPrintCustomer, setSelectedPrintCustomer] = useState<Customer | null>(null);
  const [selectedPrintItems, setSelectedPrintItems] = useState<any[]>([]);

  // Create Invoice Cart State
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [invoiceCart, setInvoiceCart] = useState<InvoiceCartItem[]>([]);
  const [generalDiscount, setGeneralDiscount] = useState('0'); // Flat discount on subtotal
  const [taxRate, setTaxRate] = useState('0'); // percentage
  const [invoiceNotes, setInvoiceNotes] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [invoiceNumber, setInvoiceNumber] = useState(`INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);

  // Dropdown Product Selector Temp State
  const [selectedItemToAddId, setSelectedItemToAddId] = useState<string>('');
  const [itemAddQuantity, setItemAddQuantity] = useState('1');

  // Query Database
  const sales = useLiveQuery(() => db.sales.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());
  const inventory = useLiveQuery(() => db.inventory.toArray());

  // Calculations for active creation cart
  const subtotal = invoiceCart.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const flatDiscount = parseFloat(generalDiscount) || 0;
  const rateTax = parseFloat(taxRate) || 0;
  const taxAmount = Math.max(0, (subtotal - flatDiscount) * (rateTax / 100));
  const invoiceTotal = Math.max(0, subtotal - flatDiscount + taxAmount);

  const totalCost = invoiceCart.reduce((sum, item) => sum + item.quantity * item.inventoryItem.purchasePrice, 0);
  const estimatedProfit = Math.max(0, invoiceTotal - taxAmount - totalCost);

  // Add Item to creation Cart
  const handleAddItemToCart = () => {
    if (!selectedItemToAddId) {
      toast.error('Item Required', 'Please select a product to add.');
      return;
    }

    const itemObj = inventory?.find((i) => i.id === parseInt(selectedItemToAddId));
    if (!itemObj) return;

    const qty = parseInt(itemAddQuantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Invalid Quantity', 'Please enter a valid quantity greater than 0.');
      return;
    }

    if (itemObj.currentStock < qty) {
      toast.error('Low Stock Alert', `Only ${itemObj.currentStock} units available for ${itemObj.name}.`);
      return;
    }

    // Check if already exists in cart
    const existingIdx = invoiceCart.findIndex((i) => i.inventoryItem.id === itemObj.id);
    if (existingIdx > -1) {
      const updated = [...invoiceCart];
      const newQty = updated[existingIdx].quantity + qty;
      if (itemObj.currentStock < newQty) {
        toast.error('Insufficient Stock', `Cannot exceed available ${itemObj.name} stock (${itemObj.currentStock}).`);
        return;
      }
      updated[existingIdx].quantity = newQty;
      setInvoiceCart(updated);
    } else {
      setInvoiceCart([
        ...invoiceCart,
        {
          inventoryItem: itemObj,
          quantity: qty,
          unitPrice: itemObj.sellingPrice,
          discount: 0,
          tax: 0,
        },
      ]);
    }

    toast.success('Added to Invoice', `${qty}x ${itemObj.name} added.`);
    setSelectedItemToAddId('');
    setItemAddQuantity('1');
  };

  // Remove Item from Cart
  const handleRemoveFromCart = (index: number) => {
    const name = invoiceCart[index].inventoryItem.name;
    setInvoiceCart(invoiceCart.filter((_, idx) => idx !== index));
    toast.info('Removed Item', `${name} removed from invoice list.`);
  };

  // Save the full Invoice
  const handleSaveInvoice = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      toast.error('Customer Required', 'Please select a customer for this invoice.');
      return;
    }

    if (invoiceCart.length === 0) {
      toast.error('Invoice is Empty', 'Please add at least one product.');
      return;
    }

    const customerObj = customers?.find((c) => c.id === parseInt(selectedCustomerId));
    if (!customerObj) return;

    try {
      // 1. Create the Sale record
      const saleId = await db.sales.add({
        date: invoiceDate,
        customerId: customerObj.id,
        invoiceNumber,
        discount: flatDiscount,
        taxRate: rateTax,
        taxAmount,
        total: invoiceTotal,
        profit: estimatedProfit,
        notes: invoiceNotes,
      });

      // 2. Insert items and update stock levels
      for (const item of invoiceCart) {
        if (!item.inventoryItem.id) continue;

        // Insert item record
        await db.saleItems.add({
          saleId,
          inventoryId: item.inventoryItem.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          costPrice: item.inventoryItem.purchasePrice,
          discount: 0,
          tax: 0,
          total: item.quantity * item.unitPrice,
        });

        // Decrease stock level
        const currentStock = await db.inventory.get(item.inventoryItem.id);
        if (currentStock) {
          const newStock = Math.max(0, currentStock.currentStock - item.quantity);
          await db.inventory.update(item.inventoryItem.id, { currentStock: newStock });
        }
      }

      // 3. Log financial Cash In transaction
      await db.transactions.add({
        date: invoiceDate,
        amount: invoiceTotal,
        type: 'SALE',
        category: 'Sale Revenue',
        description: `Customer Invoice - ${invoiceNumber} for ${customerObj.name}`,
        paymentMethod: 'Multiple / Credit',
        reference: invoiceNumber,
        notes: invoiceNotes,
        linkId: saleId,
      });

      // 4. Update customer current balance outstanding if needed (for simplicity, we track balances)
      if (customerObj.id) {
        const newCustBalance = customerObj.currentBalance + invoiceTotal;
        await db.customers.update(customerObj.id, { currentBalance: newCustBalance });
      }

      toast.success('Invoice Finalized', `Invoice ${invoiceNumber} generated!`);
      
      // Navigate to printable invoice immediately
      await handlePrintView(saleId);
    } catch (err) {
      console.error(err);
      toast.error('Invoicing Failed', 'Could not save sales invoice record.');
    }
  };

  // Open Printable Invoice View
  const handlePrintView = async (saleId: number) => {
    try {
      const saleObj = await db.sales.get(saleId);
      if (!saleObj) return;

      const customerObj = await db.customers.get(saleObj.customerId || 0);
      const itemsList = await db.saleItems.where('saleId').equals(saleId).toArray();
      
      const hydratedItems = [];
      for (const item of itemsList) {
        const invObj = await db.inventory.get(item.inventoryId);
        hydratedItems.push({
          ...item,
          name: invObj ? invObj.name : 'Unknown Product',
          sku: invObj ? invObj.sku : 'N/A',
        });
      }

      setSelectedPrintSale(saleObj);
      setSelectedPrintCustomer(customerObj || null);
      setSelectedPrintItems(hydratedItems);
      setViewMode('PRINT');
    } catch (err) {
      console.error(err);
      toast.error('Print Error', 'Could not compile printing data.');
    }
  };

  // Reset Cart and go back
  const handleCancelCreate = () => {
    setInvoiceCart([]);
    setSelectedCustomerId('');
    setGeneralDiscount('0');
    setTaxRate('0');
    setInvoiceNotes('');
    setViewMode('LIST');
  };

  // Delete / Void Sales Invoice
  const handleDeleteSale = async (saleId: number) => {
    if (!window.confirm('Are you sure you want to void and delete this invoice? This will reverse the stock reduction and decrease the customer balance.')) {
      return;
    }

    try {
      const sale = await db.sales.get(saleId);
      if (!sale) {
        toast.error('Not Found', 'Invoice record could not be found.');
        return;
      }

      // 1. Fetch sale items and restore stock level
      const items = await db.saleItems.where('saleId').equals(saleId).toArray();
      for (const item of items) {
        const inv = await db.inventory.get(item.inventoryId);
        if (inv) {
          await db.inventory.update(item.inventoryId, {
            currentStock: inv.currentStock + item.quantity
          });
        }
      }

      // 2. Delete linked sale items
      await db.saleItems.where('saleId').equals(saleId).delete();

      // 3. Revert customer balance
      if (sale.customerId) {
        const cust = await db.customers.get(sale.customerId);
        if (cust) {
          await db.customers.update(sale.customerId, {
            currentBalance: Math.max(0, cust.currentBalance - sale.total)
          });
        }
      }

      // 4. Delete financial transaction record
      const tx = await db.transactions.where('linkId').equals(saleId).and(t => t.type === 'SALE').first();
      if (tx && tx.id) {
        await db.transactions.delete(tx.id);
      }

      // 5. Delete the sale record itself
      await db.sales.delete(saleId);

      toast.success('Invoice Voided', 'Invoice deleted and stock levels restored successfully.');
    } catch (err) {
      console.error(err);
      toast.error('Void Failed', 'Could not delete the invoice.');
    }
  };

  // Filter Sales list
  const filteredSales = sales?.filter((s) => {
    const cust = customers?.find((c) => c.id === s.customerId);
    const custName = cust ? cust.name.toLowerCase() : '';
    return (
      s.invoiceNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      custName.includes(searchTerm.toLowerCase()) ||
      (s.notes && s.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }) || [];

  return (
    <div className="space-y-6" id="sales-view">
      {/* HEADER SECTION */}
      {viewMode === 'LIST' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Invoicing & Retail Sales
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Issue professional invoices, reduce stock, record receipts, and monitor retail margins.
            </p>
          </div>
          <button
            onClick={() => {
              setInvoiceNumber(`INV-${new Date().getFullYear()}-${Date.now().toString().slice(-4)}`);
              setInvoiceDate(new Date().toISOString().split('T')[0]);
              setViewMode('CREATE');
            }}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Generate Invoice</span>
          </button>
        </div>
      )}

      {/* VIEW 1: SALES LIST */}
      {viewMode === 'LIST' && (
        <>
          {/* Search bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search invoices by invoice number, customer name, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
            />
          </div>

          {/* Table list */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <th className="p-4">Invoice No</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Customer</th>
                    <th className="p-4 text-right">Discount</th>
                    <th className="p-4 text-right">Tax Paid</th>
                    <th className="p-4 text-right">Invoice Total</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-sm text-zinc-700 dark:text-zinc-300">
                  {filteredSales.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center p-12 text-zinc-400">
                        <p className="font-medium text-base">No invoices logged</p>
                        <p className="text-xs mt-1">Generate a new invoice to reduce stock levels and log sales.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredSales.map((s) => {
                      const cust = customers?.find((c) => c.id === s.customerId);
                      return (
                        <tr key={s.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                          <td className="p-4 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                            {s.invoiceNumber}
                          </td>
                          <td className="p-4 whitespace-nowrap">{formatDate(s.date)}</td>
                          <td className="p-4 font-medium whitespace-nowrap">{cust ? cust.name : 'Unknown Customer'}</td>
                          <td className="p-4 text-right font-medium text-zinc-500 whitespace-nowrap">
                            {formatCurrency(s.discount, currencySymbol, currency)}
                          </td>
                          <td className="p-4 text-right font-medium text-zinc-500 whitespace-nowrap">
                            {formatCurrency(s.taxAmount, currencySymbol, currency)}
                          </td>
                          <td className="p-4 text-right font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                            {formatCurrency(s.total, currencySymbol, currency)}
                          </td>
                          <td className="p-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => s.id && handlePrintView(s.id)}
                                className="inline-flex items-center gap-1 bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-zinc-100 transition cursor-pointer text-indigo-600 dark:text-indigo-400"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Print / Inspect</span>
                              </button>
                              <button
                                onClick={() => s.id && handleDeleteSale(s.id)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                                title="Void Invoice"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* VIEW 2: NEW INVOICE CREATION */}
      {viewMode === 'CREATE' && (
        <div className="space-y-6">
          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancelCreate}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg cursor-pointer text-zinc-500"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Draft New Retail Invoice</h1>
              <p className="text-xs text-zinc-400">Fill details, select inventory products, and save.</p>
            </div>
          </div>

          <form onSubmit={handleSaveInvoice} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Block: Bill Details & Cart */}
            <div className="lg:col-span-2 space-y-6">
              {/* Box 1: Customer & Invoice Info */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Customer Selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <User className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Select Customer *</span>
                  </label>
                  <select
                    required
                    value={selectedCustomerId}
                    onChange={(e) => setSelectedCustomerId(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  >
                    <option value="">-- Choose Customer --</option>
                    {customers?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} (Debt: {formatCurrency(c.currentBalance, currencySymbol, currency)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Invoice Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                {/* Invoice Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Invoice Number</label>
                  <input
                    type="text"
                    required
                    value={invoiceNumber}
                    onChange={(e) => setInvoiceNumber(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Box 2: Cart Items Editor */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>Invoice Products list</span>
                </h3>

                {/* Add product drawer selection bar */}
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 space-y-1 w-full">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Select Product Catalog Item</label>
                    <select
                      value={selectedItemToAddId}
                      onChange={(e) => setSelectedItemToAddId(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-850 dark:text-zinc-150 focus:outline-none"
                    >
                      <option value="">-- Choose Catalog Product --</option>
                      {inventory?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} ({formatCurrency(item.sellingPrice, currencySymbol, currency)} | Stock: {item.currentStock})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24 space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={itemAddQuantity}
                      onChange={(e) => setItemAddQuantity(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-850 dark:text-zinc-150 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItemToCart}
                    className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg cursor-pointer shrink-0"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Add Item</span>
                  </button>
                </div>

                {/* Active Items Table */}
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        <th className="pb-3">Product Description</th>
                        <th className="pb-3 text-right">Price</th>
                        <th className="pb-3 text-center">Qty</th>
                        <th className="pb-3 text-right">Total</th>
                        <th className="pb-3 text-center">Delete</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850 text-xs">
                      {invoiceCart.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-400">
                            Invoice is empty. Select products above to populate the cart.
                          </td>
                        </tr>
                      ) : (
                        invoiceCart.map((item, index) => (
                          <tr key={index} className="align-middle">
                            <td className="py-3 font-semibold text-zinc-800 dark:text-zinc-200">
                              <p>{item.inventoryItem.name}</p>
                              <span className="text-[10px] text-zinc-400 font-mono">SKU: {item.inventoryItem.sku}</span>
                            </td>
                            <td className="py-3 text-right font-medium">
                              {formatCurrency(item.unitPrice, currencySymbol, currency)}
                            </td>
                            <td className="py-3 text-center font-bold">
                              {item.quantity}
                            </td>
                            <td className="py-3 text-right font-bold text-zinc-800 dark:text-zinc-200">
                              {formatCurrency(item.quantity * item.unitPrice, currencySymbol, currency)}
                            </td>
                            <td className="py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveFromCart(index)}
                                className="p-1 text-zinc-400 hover:text-rose-500 rounded-md cursor-pointer"
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

            {/* Right Block: Bill Summary Card */}
            <div className="lg:col-span-1 space-y-6">
              {/* Financial Box */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-5">
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <Calculator className="w-4 h-4 text-indigo-500" />
                  <span>Invoice Financials</span>
                </h3>

                {/* Subtotal */}
                <div className="flex justify-between text-xs text-zinc-500 font-medium">
                  <span>Subtotal sum:</span>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    {formatCurrency(subtotal, currencySymbol, currency)}
                  </span>
                </div>

                {/* General flat discount */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase flex justify-between">
                    <span>Flat Discount ({currencySymbol})</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-zinc-400">{currencySymbol}</span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={generalDiscount}
                      onChange={(e) => setGeneralDiscount(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-7 pr-3 py-1.5 text-xs focus:outline-none text-right font-semibold"
                    />
                  </div>
                </div>

                {/* Tax Rate Percentage */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase flex justify-between">
                    <span>Tax Rate Percentage (%)</span>
                    {taxAmount > 0 && (
                      <span className="text-indigo-600 font-bold">+{formatCurrency(taxAmount, currencySymbol, currency)}</span>
                    )}
                  </label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                    <input
                      type="number"
                      placeholder="0"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-9 pr-3 py-1.5 text-xs focus:outline-none text-right font-semibold"
                    />
                  </div>
                </div>

                {/* Total Grand */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Grand Total:</span>
                  <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(invoiceTotal, currencySymbol, currency)}
                  </span>
                </div>

                {/* Estimated Retail Margin */}
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/40 dark:border-emerald-950/20 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Estimated Retail Profit:</span>
                  </span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    {formatCurrency(estimatedProfit, currencySymbol, currency)}
                  </span>
                </div>

                {/* Notes */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Invoice Terms / Notes</label>
                  <textarea
                    placeholder="e.g. Terms Net-30. Thank you for your business!"
                    rows={2}
                    value={invoiceNotes}
                    onChange={(e) => setInvoiceNotes(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-xs focus:outline-none resize-none"
                  />
                </div>

                {/* Submit buttons */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md text-center"
                  >
                    Save & Generate Invoice
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelCreate}
                    className="w-full py-2 bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center"
                  >
                    Discard Draft
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* VIEW 3: PRINTABLE INVOICE SHEET */}
      {viewMode === 'PRINT' && selectedPrintSale && (
        <div className="space-y-6">
          {/* Controls Bar (Do not print this bar!) */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl print:hidden">
            <button
              onClick={() => setViewMode('LIST')}
              className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-500 hover:text-zinc-700 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Back to Invoice History</span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Invoice</span>
              </button>
            </div>
          </div>

          {/* Actual Invoice Paper (This layout is printable!) */}
          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-3xl mx-auto shadow-lg text-zinc-800 dark:text-zinc-200 print:shadow-none print:border-none print:p-0 print:m-0" id="invoice-printable-sheet">
            {/* Logo & Headline */}
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4 pb-6 border-b border-zinc-100 dark:border-zinc-900">
              <div>
                <h1 className="text-2xl font-extrabold text-indigo-600 dark:text-indigo-400 tracking-tight">
                  {settings.businessName || 'Offline Ledger Books'}
                </h1>
                <p className="text-xs text-zinc-400 mt-1">Professional Retail & Ledger Books</p>
              </div>
              <div className="text-right sm:text-right">
                <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-widest">INVOICE</h2>
                <p className="text-xs text-zinc-400 font-mono mt-1">No: {selectedPrintSale.invoiceNumber}</p>
                <p className="text-xs text-zinc-400 font-mono">Date: {formatDate(selectedPrintSale.date)}</p>
              </div>
            </div>

            {/* Billed To / Billed From */}
            <div className="grid grid-cols-2 gap-6 py-6 border-b border-zinc-100 dark:border-zinc-900 text-xs">
              <div>
                <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">Billed From:</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-150">{settings.businessName}</p>
                <p className="text-zinc-400 mt-1">Offline Local Storage Device</p>
                <p className="text-zinc-400">Private Database Node</p>
              </div>
              <div>
                <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">Billed To:</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-150">
                  {selectedPrintCustomer ? selectedPrintCustomer.name : 'Walk-In Customer'}
                </p>
                {selectedPrintCustomer && (
                  <>
                    <p className="text-zinc-400 mt-1">{selectedPrintCustomer.phone}</p>
                    <p className="text-zinc-400 truncate">{selectedPrintCustomer.email}</p>
                    <p className="text-zinc-400 truncate">{selectedPrintCustomer.address}</p>
                  </>
                )}
              </div>
            </div>

            {/* Items Table */}
            <div className="py-6 border-b border-zinc-100 dark:border-zinc-900">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-100 dark:border-zinc-900 pb-2">
                    <th className="pb-2">Catalog Product Description</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2 text-center">Qty</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {selectedPrintItems.map((item, index) => (
                    <tr key={index}>
                      <td className="py-3">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{item.name}</p>
                        <span className="text-[10px] text-zinc-400 font-mono">SKU: {item.sku}</span>
                      </td>
                      <td className="py-3 text-right">
                        {formatCurrency(item.unitPrice, currencySymbol, currency)}
                      </td>
                      <td className="py-3 text-center font-semibold">{item.quantity}</td>
                      <td className="py-3 text-right font-bold text-zinc-900 dark:text-zinc-150">
                        {formatCurrency(item.quantity * item.unitPrice, currencySymbol, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Total Block */}
            <div className="py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              {/* Left: Notes */}
              <div>
                {selectedPrintSale.notes && (
                  <>
                    <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">Invoice Notes:</p>
                    <p className="text-zinc-500 italic mt-1 leading-relaxed">{selectedPrintSale.notes}</p>
                  </>
                )}
              </div>

              {/* Right: Calculations */}
              <div className="space-y-2 border-t sm:border-t-0 sm:pt-0 pt-4">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Subtotal sum:</span>
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {formatCurrency(selectedPrintItems.reduce((acc, i) => acc + i.quantity * i.unitPrice, 0), currencySymbol, currency)}
                  </span>
                </div>
                {selectedPrintSale.discount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Discount adjustment:</span>
                    <span className="font-semibold text-rose-500">
                      -{formatCurrency(selectedPrintSale.discount, currencySymbol, currency)}
                    </span>
                  </div>
                )}
                {selectedPrintSale.taxAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-zinc-400">Government Tax ({selectedPrintSale.taxRate}%):</span>
                    <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                      +{formatCurrency(selectedPrintSale.taxAmount, currencySymbol, currency)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-extrabold border-t border-zinc-100 dark:border-zinc-900 pt-2.5">
                  <span className="text-indigo-600 dark:text-indigo-400">Grand Total:</span>
                  <span className="text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(selectedPrintSale.total, currencySymbol, currency)}
                  </span>
                </div>
              </div>
            </div>

            {/* Footer Signoff */}
            <div className="text-center pt-8 border-t border-zinc-100 dark:border-zinc-900 mt-8">
              <p className="text-xs text-zinc-400 font-medium">Thank you for your business!</p>
              <p className="text-[10px] text-zinc-300 dark:text-zinc-800 mt-2 font-mono">
                Generated securely on-device with Offline Ledger Ledger Engine
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
