import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type Purchase, type PurchaseItem, type Supplier, type InventoryItem } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency, formatDate } from '../utils';
import { toast } from '../components/Toast';
import {
  Plus,
  Search,
  Printer,
  FileText,
  Briefcase,
  Package,
  Trash2,
  ChevronLeft,
  Calendar,
  Layers,
  Calculator,
  X,
  PlusCircle,
  TrendingDown,
} from 'lucide-react';

interface PurchaseCartItem {
  inventoryItem: InventoryItem;
  quantity: number;
  unitCost: number;
}

export default function Purchases() {
  const { settings } = useBusiness();
  const { currencySymbol, currency } = settings;

  // View Mode
  const [viewMode, setViewMode] = useState<'LIST' | 'CREATE' | 'PRINT'>('LIST');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPrintPurchase, setSelectedPrintPurchase] = useState<Purchase | null>(null);
  const [selectedPrintSupplier, setSelectedPrintSupplier] = useState<Supplier | null>(null);
  const [selectedPrintItems, setSelectedPrintItems] = useState<any[]>([]);

  // Creation State
  const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
  const [purchaseCart, setPurchaseCart] = useState<PurchaseCartItem[]>([]);
  const [billNotes, setBillNotes] = useState('');
  const [billDate, setBillDate] = useState(new Date().toISOString().split('T')[0]);
  const [billNumber, setBillNumber] = useState(`BILL-2026-${Date.now().toString().slice(-4)}`);

  // Dropdown Product temp selection
  const [selectedItemToAddId, setSelectedItemToAddId] = useState<string>('');
  const [itemAddQuantity, setItemAddQuantity] = useState('1');
  const [itemAddCost, setItemAddCost] = useState('');

  // Queries
  const purchases = useLiveQuery(() => db.purchases.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());
  const inventory = useLiveQuery(() => db.inventory.toArray());

  // Calculations for creation
  const billTotal = purchaseCart.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);

  // Add Item to Cart
  const handleAddItemToCart = () => {
    if (!selectedItemToAddId) {
      toast.error('Item Required', 'Please select a product.');
      return;
    }

    const itemObj = inventory?.find((i) => i.id === parseInt(selectedItemToAddId));
    if (!itemObj) return;

    const qty = parseInt(itemAddQuantity);
    const cost = parseFloat(itemAddCost || String(itemObj.purchasePrice));

    if (isNaN(qty) || qty <= 0) {
      toast.error('Invalid Quantity', 'Please enter a valid quantity.');
      return;
    }

    if (isNaN(cost) || cost < 0) {
      toast.error('Invalid Cost', 'Please enter a valid cost price.');
      return;
    }

    // Add to cart or increment
    const existingIdx = purchaseCart.findIndex((i) => i.inventoryItem.id === itemObj.id);
    if (existingIdx > -1) {
      const updated = [...purchaseCart];
      updated[existingIdx].quantity += qty;
      updated[existingIdx].unitCost = cost; // override with newly input cost
      setPurchaseCart(updated);
    } else {
      setPurchaseCart([
        ...purchaseCart,
        {
          inventoryItem: itemObj,
          quantity: qty,
          unitCost: cost,
        },
      ]);
    }

    toast.success('Product Added to Bill', `${qty}x ${itemObj.name} added.`);
    setSelectedItemToAddId('');
    setItemAddQuantity('1');
    setItemAddCost('');
  };

  // Remove Item
  const handleRemoveFromCart = (index: number) => {
    setPurchaseCart(purchaseCart.filter((_, idx) => idx !== index));
  };

  // Submit Purchase Bill
  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedSupplierId) {
      toast.error('Supplier Required', 'Please select a supplier for this bill.');
      return;
    }

    if (purchaseCart.length === 0) {
      toast.error('Cart is Empty', 'Please add at least one inventory item.');
      return;
    }

    const supplierObj = suppliers?.find((s) => s.id === parseInt(selectedSupplierId));
    if (!supplierObj) return;

    try {
      // 1. Create Purchase row
      const purchaseId = await db.purchases.add({
        date: billDate,
        supplierId: supplierObj.id,
        billNumber,
        total: billTotal,
        notes: billNotes,
      });

      // 2. Insert items and increase inventory stock
      for (const item of purchaseCart) {
        if (!item.inventoryItem.id) continue;

        // Save Item
        await db.purchaseItems.add({
          purchaseId,
          inventoryId: item.inventoryItem.id,
          quantity: item.quantity,
          unitCost: item.unitCost,
          total: item.quantity * item.unitCost,
        });

        // Increase Stock Level & Update purchasePrice if changed
        const currentInv = await db.inventory.get(item.inventoryItem.id);
        if (currentInv) {
          const newStock = currentInv.currentStock + item.quantity;
          await db.inventory.update(item.inventoryItem.id, {
            currentStock: newStock,
            purchasePrice: item.unitCost, // dynamically updates standard purchasePrice based on latest bill
          });
        }
      }

      // 3. Log financial Cash Out transaction
      await db.transactions.add({
        date: billDate,
        amount: billTotal,
        type: 'PURCHASE',
        category: 'Inventory Purchase',
        description: `Procurement Stock Bill - ${billNumber} from ${supplierObj.name}`,
        paymentMethod: 'Multiple / Bank',
        reference: billNumber,
        notes: billNotes,
        linkId: purchaseId,
      });

      // 4. Update supplier outstanding owed balance if needed
      if (supplierObj.id) {
        const newSuppBalance = supplierObj.balance + billTotal;
        await db.suppliers.update(supplierObj.id, { balance: newSuppBalance });
      }

      toast.success('Procurement Bill Saved', `Procurement ${billNumber} recorded and stock increased.`);
      
      // Load printable inspect view
      await handlePrintView(purchaseId);
    } catch (err) {
      console.error(err);
      toast.error('Billing Failed', 'Could not save purchase procurement bill.');
    }
  };

  // Print view
  const handlePrintView = async (purchaseId: number) => {
    try {
      const purObj = await db.purchases.get(purchaseId);
      if (!purObj) return;

      const supplierObj = await db.suppliers.get(purObj.supplierId || 0);
      const itemsList = await db.purchaseItems.where('purchaseId').equals(purchaseId).toArray();

      const hydratedItems = [];
      for (const item of itemsList) {
        const invObj = await db.inventory.get(item.inventoryId);
        hydratedItems.push({
          ...item,
          name: invObj ? invObj.name : 'Unknown Product',
          sku: invObj ? invObj.sku : 'N/A',
        });
      }

      setSelectedPrintPurchase(purObj);
      setSelectedPrintSupplier(supplierObj || null);
      setSelectedPrintItems(hydratedItems);
      setViewMode('PRINT');
    } catch (err) {
      console.error(err);
      toast.error('Print Error', 'Could not compile printing profile.');
    }
  };

  // Reset
  const handleCancelCreate = () => {
    setPurchaseCart([]);
    setSelectedSupplierId('');
    setBillNotes('');
    setViewMode('LIST');
  };

  // Delete / Void Purchase Bill
  const handleDeletePurchase = async (purchaseId: number) => {
    if (!window.confirm('Are you sure you want to void and delete this purchase bill? This will reverse the stock increase and decrease the supplier balance.')) {
      return;
    }

    try {
      const pur = await db.purchases.get(purchaseId);
      if (!pur) {
        toast.error('Not Found', 'Purchase bill could not be found.');
        return;
      }

      // 1. Fetch bill items and restore stock level
      const items = await db.purchaseItems.where('purchaseId').equals(purchaseId).toArray();
      for (const item of items) {
        const inv = await db.inventory.get(item.inventoryId);
        if (inv) {
          await db.inventory.update(item.inventoryId, {
            currentStock: Math.max(0, inv.currentStock - item.quantity)
          });
        }
      }

      // 2. Delete linked purchase items
      await db.purchaseItems.where('purchaseId').equals(purchaseId).delete();

      // 3. Revert supplier balance
      if (pur.supplierId) {
        const supp = await db.suppliers.get(pur.supplierId);
        if (supp) {
          await db.suppliers.update(pur.supplierId, {
            balance: Math.max(0, supp.balance - pur.total)
          });
        }
      }

      // 4. Delete financial transaction record
      const tx = await db.transactions.where('linkId').equals(purchaseId).and(t => t.type === 'PURCHASE').first();
      if (tx && tx.id) {
        await db.transactions.delete(tx.id);
      }

      // 5. Delete the purchase record
      await db.purchases.delete(purchaseId);

      toast.success('Procurement Voided', 'Purchase bill deleted and inventory levels restored.');
    } catch (err) {
      console.error(err);
      toast.error('Void Failed', 'Could not delete the purchase bill.');
    }
  };

  // Filter List
  const filteredPurchases = purchases?.filter((p) => {
    const sObj = suppliers?.find((s) => s.id === p.supplierId);
    const sName = sObj ? sObj.name.toLowerCase() : '';
    return (
      p.billNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
      sName.includes(searchTerm.toLowerCase()) ||
      (p.notes && p.notes.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }) || [];

  return (
    <div className="space-y-6" id="purchases-view">
      {/* HEADER SECTION */}
      {viewMode === 'LIST' && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Procurement & Supply Bills
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              Log raw restocks, track manufacturer wholesale invoices, and automatically inflate stock balances.
            </p>
          </div>
          <button
            onClick={() => {
              setBillNumber(`BILL-2026-${Date.now().toString().slice(-4)}`);
              setBillDate(new Date().toISOString().split('T')[0]);
              setViewMode('CREATE');
            }}
            className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>Record Purchase Bill</span>
          </button>
        </div>
      )}

      {/* VIEW 1: PURCHASES LIST */}
      {viewMode === 'LIST' && (
        <>
          {/* Search bar */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative">
            <Search className="absolute left-7 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              placeholder="Search purchases by bill number, supplier name, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none"
            />
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                    <th className="p-4">Bill Number</th>
                    <th className="p-4">Date</th>
                    <th className="p-4">Supplier</th>
                    <th className="p-4 text-right">Items Quantity</th>
                    <th className="p-4 text-right">Bill Total</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-sm text-zinc-700 dark:text-zinc-300">
                  {filteredPurchases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center p-12 text-zinc-400">
                        <p className="font-medium text-base">No procurement bills logged</p>
                        <p className="text-xs mt-1">Record wholesale restocks to increase physical product stock levels.</p>
                      </td>
                    </tr>
                  ) : (
                    filteredPurchases.map((p) => {
                      const supp = suppliers?.find((s) => s.id === p.supplierId);
                      return (
                        <tr key={p.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                          <td className="p-4 font-mono font-bold text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                            {p.billNumber}
                          </td>
                          <td className="p-4 whitespace-nowrap">{formatDate(p.date)}</td>
                          <td className="p-4 font-medium whitespace-nowrap">{supp ? supp.name : 'Unknown Supplier'}</td>
                          <td className="p-4 text-right whitespace-nowrap font-medium text-zinc-500">
                            Verified items
                          </td>
                          <td className="p-4 text-right font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap animate-fade-in">
                            {formatCurrency(p.total, currencySymbol, currency)}
                          </td>
                          <td className="p-4 text-center whitespace-nowrap">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => p.id && handlePrintView(p.id)}
                                className="inline-flex items-center gap-1 bg-zinc-50 dark:bg-zinc-850 border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-zinc-100 transition cursor-pointer text-indigo-600 dark:text-indigo-400"
                              >
                                <Printer className="w-3.5 h-3.5" />
                                <span>Inspect Bill</span>
                              </button>
                              <button
                                onClick={() => p.id && handleDeletePurchase(p.id)}
                                className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                                title="Void Bill"
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

      {/* VIEW 2: NEW PURCHASE BILL */}
      {viewMode === 'CREATE' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancelCreate}
              className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-850 rounded-lg cursor-pointer text-zinc-500"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Draft Procurement Bill</h1>
              <p className="text-xs text-zinc-400">Add physical items to purchase and select corresponding wholesale supplier.</p>
            </div>
          </div>

          <form onSubmit={handleSavePurchase} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Column: Form Details & Items */}
            <div className="lg:col-span-2 space-y-6">
              {/* Supplier & Details Box */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Supplier Selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Select Supplier *</span>
                  </label>
                  <select
                    required
                    value={selectedSupplierId}
                    onChange={(e) => setSelectedSupplierId(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  >
                    <option value="">-- Choose Supplier --</option>
                    {suppliers?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} (Owed: {formatCurrency(s.balance, currencySymbol, currency)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Bill Date</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={billDate}
                    onChange={(e) => setBillDate(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                {/* Bill Number */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Bill Number</label>
                  <input
                    type="text"
                    required
                    value={billNumber}
                    onChange={(e) => setBillNumber(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Items Card List */}
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-4">
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-500" />
                  <span>Procurement Products</span>
                </h3>

                {/* Bar adding tools */}
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl flex flex-col md:flex-row gap-3 items-end">
                  <div className="flex-1 space-y-1 w-full">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Select Catalog Product</label>
                    <select
                      value={selectedItemToAddId}
                      onChange={(e) => {
                        setSelectedItemToAddId(e.target.value);
                        const iObj = inventory?.find((i) => i.id === parseInt(e.target.value));
                        setItemAddCost(iObj ? String(iObj.purchasePrice) : '');
                      }}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs text-zinc-850 focus:outline-none"
                    >
                      <option value="">-- Choose Product --</option>
                      {inventory?.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name} (SKU: {item.sku} | Std Cost: {formatCurrency(item.purchasePrice, currencySymbol, currency)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-24 space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Unit Cost ({currencySymbol})</label>
                    <input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      value={itemAddCost}
                      onChange={(e) => setItemAddCost(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-850 focus:outline-none"
                    />
                  </div>

                  <div className="w-20 space-y-1">
                    <label className="text-[10px] font-bold text-zinc-400 uppercase">Quantity</label>
                    <input
                      type="number"
                      min="1"
                      value={itemAddQuantity}
                      onChange={(e) => setItemAddQuantity(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1 text-xs text-zinc-850 focus:outline-none"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddItemToCart}
                    className="inline-flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-3.5 py-2 rounded-lg cursor-pointer shrink-0"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Add Item</span>
                  </button>
                </div>

                {/* Active Procurement Cart table */}
                <div className="overflow-x-auto pt-2">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-zinc-100 dark:border-zinc-800 text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
                        <th className="pb-3">Product Name</th>
                        <th className="pb-3 text-right">Cost Price</th>
                        <th className="pb-3 text-center">Procured Qty</th>
                        <th className="pb-3 text-right">Line Total</th>
                        <th className="pb-3 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-850 text-xs">
                      {purchaseCart.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-400">
                            Bill is empty. Select products above to populate procurement quantities.
                          </td>
                        </tr>
                      ) : (
                        purchaseCart.map((item, index) => (
                          <tr key={index} className="align-middle">
                            <td className="py-3 font-semibold text-zinc-800 dark:text-zinc-200">
                              <p>{item.inventoryItem.name}</p>
                              <span className="text-[10px] text-zinc-400 font-mono">SKU: {item.inventoryItem.sku}</span>
                            </td>
                            <td className="py-3 text-right font-medium">
                              {formatCurrency(item.unitCost, currencySymbol, currency)}
                            </td>
                            <td className="py-3 text-center font-bold">
                              {item.quantity} units
                            </td>
                            <td className="py-3 text-right font-bold text-zinc-800 dark:text-zinc-200">
                              {formatCurrency(item.quantity * item.unitCost, currencySymbol, currency)}
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

            {/* Right Column: Financial Summary Box */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-5 shadow-sm space-y-5">
                <h3 className="text-sm font-bold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b border-zinc-100 dark:border-zinc-800">
                  <Calculator className="w-4 h-4 text-indigo-500" />
                  <span>Procurement Summary</span>
                </h3>

                <div className="flex justify-between text-xs text-zinc-500 font-medium">
                  <span>Gross subtotal:</span>
                  <span className="font-bold text-zinc-700 dark:text-zinc-300">
                    {formatCurrency(billTotal, currencySymbol, currency)}
                  </span>
                </div>

                <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-600 dark:text-zinc-300">Bill Grand Total:</span>
                  <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">
                    {formatCurrency(billTotal, currencySymbol, currency)}
                  </span>
                </div>

                <div className="p-3 bg-rose-50/50 dark:bg-rose-950/10 border border-rose-100/40 dark:border-rose-950/40 rounded-xl flex items-center justify-between text-xs">
                  <span className="font-semibold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                    <TrendingDown className="w-3.5 h-3.5" />
                    <span>Total Cost Outflow:</span>
                  </span>
                  <span className="font-bold text-rose-600 dark:text-rose-400">
                    {formatCurrency(billTotal, currencySymbol, currency)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase">Supplier Notes / Bill terms</label>
                  <textarea
                    placeholder="e.g. Due on delivery, credit terms Net-45..."
                    rows={3}
                    value={billNotes}
                    onChange={(e) => setBillNotes(e.target.value)}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-xs focus:outline-none resize-none"
                  />
                </div>

                {/* Submits */}
                <div className="pt-2 flex flex-col gap-2">
                  <button
                    type="submit"
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-md text-center"
                  >
                    Save procurement bill & inflate stock
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelCreate}
                    className="w-full py-2 bg-zinc-100 dark:bg-zinc-850 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 rounded-xl text-xs font-semibold transition-all cursor-pointer text-center"
                  >
                    Discard Bill Draft
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* VIEW 3: INSPECT BILL DETAILS */}
      {viewMode === 'PRINT' && selectedPrintPurchase && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl print:hidden">
            <button
              onClick={() => setViewMode('LIST')}
              className="inline-flex items-center gap-1 text-sm font-semibold text-zinc-500 hover:text-zinc-700 cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
              <span>Back to Supply Bill Registry</span>
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Supply Bill</span>
            </button>
          </div>

          <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 max-w-3xl mx-auto shadow-lg text-zinc-800 dark:text-zinc-200 print:shadow-none print:border-none print:p-0" id="purchase-printable-sheet">
            <div className="flex justify-between items-start pb-6 border-b border-zinc-100 dark:border-zinc-900">
              <div>
                <h1 className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 tracking-tight">
                  {settings.businessName}
                </h1>
                <p className="text-xs text-zinc-400 mt-1">Procurement Registry Inbound</p>
              </div>
              <div className="text-right">
                <h2 className="text-xl font-black text-zinc-900 dark:text-zinc-50 uppercase tracking-widest">SUPPLY BILL</h2>
                <p className="text-xs text-zinc-400 font-mono mt-1">No: {selectedPrintPurchase.billNumber}</p>
                <p className="text-xs text-zinc-400 font-mono">Date: {formatDate(selectedPrintPurchase.date)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 py-6 border-b border-zinc-100 dark:border-zinc-900 text-xs">
              <div>
                <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">Supplier / Vendor:</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-150">
                  {selectedPrintSupplier ? selectedPrintSupplier.name : 'Unknown Wholesaler'}
                </p>
                {selectedPrintSupplier && (
                  <>
                    <p className="text-zinc-400 mt-1">{selectedPrintSupplier.phone}</p>
                    <p className="text-zinc-400 truncate">{selectedPrintSupplier.email}</p>
                    <p className="text-zinc-400 truncate">{selectedPrintSupplier.address}</p>
                  </>
                )}
              </div>
              <div>
                <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">Inbound Ship To:</p>
                <p className="font-semibold text-zinc-900 dark:text-zinc-150">{settings.businessName}</p>
                <p className="text-zinc-400 mt-1">Physical Stock Warehouse</p>
              </div>
            </div>

            <div className="py-6 border-b border-zinc-100 dark:border-zinc-900">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider border-b border-zinc-100 dark:border-zinc-900 pb-2">
                    <th className="pb-2">Procured Product SKU</th>
                    <th className="pb-2 text-right">Unit Wholesale Cost</th>
                    <th className="pb-2 text-center">Qty Received</th>
                    <th className="pb-2 text-right">Line Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {selectedPrintItems.map((item, idx) => (
                    <tr key={idx}>
                      <td className="py-3">
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">{item.name}</p>
                        <span className="text-[10px] text-zinc-400 font-mono">SKU: {item.sku}</span>
                      </td>
                      <td className="py-3 text-right">
                        {formatCurrency(item.unitCost, currencySymbol, currency)}
                      </td>
                      <td className="py-3 text-center font-semibold">{item.quantity} units</td>
                      <td className="py-3 text-right font-bold text-zinc-900 dark:text-zinc-150">
                        {formatCurrency(item.quantity * item.unitCost, currencySymbol, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="py-6 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                {selectedPrintPurchase.notes && (
                  <>
                    <p className="font-bold text-zinc-400 uppercase tracking-wider text-[10px] mb-1.5">Supplier Bill terms:</p>
                    <p className="text-zinc-500 italic mt-1">{selectedPrintPurchase.notes}</p>
                  </>
                )}
              </div>
              <div className="text-right flex flex-col justify-end">
                <div className="flex justify-between text-base font-extrabold border-t border-zinc-100 dark:border-zinc-900 pt-3">
                  <span className="text-rose-600">Grand Bill Cost:</span>
                  <span className="text-rose-600">
                    {formatCurrency(selectedPrintPurchase.total, currencySymbol, currency)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
