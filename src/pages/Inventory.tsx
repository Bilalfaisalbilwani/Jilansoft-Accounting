import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type InventoryItem, type Supplier } from '../db';
import { useBusiness } from '../contexts/BusinessContext';
import { formatCurrency, exportToExcel, exportToCSV } from '../utils';
import { toast } from '../components/Toast';
import {
  Plus,
  Search,
  Download,
  Trash2,
  Edit2,
  AlertTriangle,
  MoveHorizontal,
  Package,
  ArrowUpDown,
  Tag,
  Briefcase,
  X,
} from 'lucide-react';

export default function Inventory() {
  const { settings } = useBusiness();
  const { currencySymbol, currency } = settings;

  // State Management
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [stockFilter, setStockFilter] = useState('ALL'); // ALL, LOW_STOCK, OUT_OF_STOCK
  const [sortBy, setSortBy] = useState<keyof InventoryItem>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Modals state
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [adjustingItem, setAdjustingItem] = useState<InventoryItem | null>(null);

  // Form State for Add/Edit
  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    category: '',
    purchasePrice: '',
    sellingPrice: '',
    openingStock: '',
    currentStock: '',
    minimumStock: '',
    supplierId: '',
    description: '',
  });

  // Form State for Quick Stock Adjustment
  const [adjustData, setAdjustData] = useState({
    type: 'ADD' as 'ADD' | 'REMOVE',
    quantity: '',
    reason: 'Stock Count Correction',
  });

  // Query Database
  const inventoryItems = useLiveQuery(() => db.inventory.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());

  // Aggregate Stats
  const totalItems = inventoryItems?.length || 0;
  const totalStockValuation = inventoryItems?.reduce((acc, item) => acc + (item.currentStock * item.purchasePrice), 0) || 0;
  const lowStockCount = inventoryItems?.filter(item => item.currentStock <= item.minimumStock).length || 0;
  const outOfStockCount = inventoryItems?.filter(item => item.currentStock === 0).length || 0;

  // Sorting Handler
  const toggleSort = (field: keyof InventoryItem) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // Handle Form submit for Add/Edit
  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const purchaseVal = parseFloat(formData.purchasePrice);
    const sellingVal = parseFloat(formData.sellingPrice);
    const openingStockVal = parseInt(formData.openingStock || '0');
    const currentStockVal = parseInt(formData.currentStock || '0');
    const minStockVal = parseInt(formData.minimumStock || '0');
    const supplierIdVal = formData.supplierId ? parseInt(formData.supplierId) : undefined;

    if (!formData.name.trim()) {
      toast.error('Validation Error', 'Product Name is required.');
      return;
    }

    if (isNaN(purchaseVal) || purchaseVal < 0 || isNaN(sellingVal) || sellingVal < 0) {
      toast.error('Validation Error', 'Prices must be non-negative numeric values.');
      return;
    }

    try {
      const payload: InventoryItem = {
        name: formData.name.trim(),
        sku: formData.sku.trim() || `SKU-${Date.now().toString().slice(-6)}`,
        barcode: formData.barcode.trim(),
        category: formData.category.trim() || 'General',
        purchasePrice: purchaseVal,
        sellingPrice: sellingVal,
        openingStock: openingStockVal,
        currentStock: editingItem ? editingItem.currentStock : currentStockVal, // do not let add form overwrite current stock if editing
        minimumStock: minStockVal,
        supplierId: supplierIdVal,
        description: formData.description.trim(),
      };

      if (editingItem && editingItem.id) {
        payload.id = editingItem.id;
        payload.currentStock = editingItem.currentStock; // preserve stock on edit
        await db.inventory.put(payload);
        toast.success('Product Updated', `${payload.name} has been updated in database.`);
      } else {
        await db.inventory.add(payload);
        toast.success('Product Added', `${payload.name} has been added to inventory.`);
      }

      setShowAddEditModal(false);
      setEditingItem(null);
    } catch (err) {
      console.error(err);
      toast.error('Operation Failed', 'Could not save inventory item.');
    }
  };

  // Open modal for editing
  const openEditModal = (item: InventoryItem) => {
    setEditingItem(item);
    setFormData({
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      category: item.category,
      purchasePrice: String(item.purchasePrice),
      sellingPrice: String(item.sellingPrice),
      openingStock: String(item.openingStock),
      currentStock: String(item.currentStock),
      minimumStock: String(item.minimumStock),
      supplierId: item.supplierId ? String(item.supplierId) : '',
      description: item.description,
    });
    setShowAddEditModal(true);
  };

  // Open modal for adjustment
  const openAdjustmentModal = (item: InventoryItem) => {
    setAdjustingItem(item);
    setAdjustData({
      type: 'ADD',
      quantity: '',
      reason: 'Stock Count Correction',
    });
    setShowAdjustModal(true);
  };

  // Save stock adjustment
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustingItem || !adjustingItem.id) return;

    const qty = parseInt(adjustData.quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Invalid Quantity', 'Please enter a valid quantity greater than 0.');
      return;
    }

    try {
      const newStock = adjustData.type === 'ADD' 
        ? adjustingItem.currentStock + qty 
        : Math.max(0, adjustingItem.currentStock - qty);

      // Save to Inventory Table
      await db.inventory.update(adjustingItem.id, { currentStock: newStock });

      // Log a quick general transaction of type CASH_IN/CASH_OUT if value changed or just track it
      await db.transactions.add({
        date: new Date().toISOString().split('T')[0],
        amount: qty * adjustingItem.purchasePrice,
        type: adjustData.type === 'ADD' ? 'PURCHASE' : 'SALE',
        category: 'Stock Adjustment',
        description: `Manual adjustment: ${adjustingItem.name} (${adjustData.type === 'ADD' ? '+' : '-'}${qty} items). Reason: ${adjustData.reason}`,
        paymentMethod: 'Internal',
        reference: `ADJ-${adjustingItem.sku}`,
        notes: `Prior: ${adjustingItem.currentStock}, New: ${newStock}`,
      });

      toast.success('Stock Adjusted', `Stock level for ${adjustingItem.name} is now ${newStock}.`);
      setShowAdjustModal(false);
      setAdjustingItem(null);
    } catch (err) {
      console.error(err);
      toast.error('Adjustment Failed', 'Could not save stock adjustment.');
    }
  };

  // Handle deletion
  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}" from inventory?`)) {
      return;
    }

    try {
      await db.inventory.delete(id);
      toast.success('Product Deleted', 'Product has been removed from catalog.');
    } catch (err) {
      console.error(err);
      toast.error('Delete Failed', 'Could not delete product.');
    }
  };

  // Filter & Search & Sort operations
  let processedItems = inventoryItems ? [...inventoryItems] : [];

  processedItems = processedItems.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.barcode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;

    let matchesStock = true;
    if (stockFilter === 'LOW_STOCK') {
      matchesStock = item.currentStock <= item.minimumStock && item.currentStock > 0;
    } else if (stockFilter === 'OUT_OF_STOCK') {
      matchesStock = item.currentStock === 0;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  // Sort
  processedItems.sort((a, b) => {
    const valA = a[sortBy] ?? '';
    const valB = b[sortBy] ?? '';
    
    if (typeof valA === 'number' && typeof valB === 'number') {
      return sortOrder === 'asc' ? valA - valB : valB - valA;
    }
    return sortOrder === 'asc'
      ? String(valA).localeCompare(String(valB))
      : String(valB).localeCompare(String(valA));
  });

  // Extract unique categories for filter
  const uniqueCategories = Array.from(new Set(inventoryItems?.map((i) => i.category) || []));

  const handleExportExcel = () => {
    const exportData = processedItems.map((item) => ({
      Name: item.name,
      SKU: item.sku,
      Barcode: item.barcode || '-',
      Category: item.category,
      'Purchase Cost': item.purchasePrice,
      'Selling Price': item.sellingPrice,
      'Current Stock': item.currentStock,
      'Min Stock Threshold': item.minimumStock,
      'Description': item.description || '-',
    }));
    exportToExcel(exportData, 'Inventory_Valuation_Report');
  };

  const handleExportCSV = () => {
    const exportData = processedItems.map((item) => ({
      Name: item.name,
      SKU: item.sku,
      Barcode: item.barcode || '-',
      Category: item.category,
      'Purchase Cost': item.purchasePrice,
      'Selling Price': item.sellingPrice,
      'Current Stock': item.currentStock,
      'Min Stock Threshold': item.minimumStock,
      'Description': item.description || '-',
    }));
    exportToCSV(exportData, 'Inventory_Valuation_Report');
  };

  return (
    <div className="space-y-6" id="inventory-view">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
            Inventory & Products Catalog
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Track stock levels, record valuations, set purchase vs retail prices, and log stock adjustments.
          </p>
        </div>
        <button
          onClick={() => {
            setEditingItem(null);
            setFormData({
              name: '',
              sku: '',
              barcode: '',
              category: '',
              purchasePrice: '',
              sellingPrice: '',
              openingStock: '0',
              currentStock: '0',
              minimumStock: '5',
              supplierId: '',
              description: '',
            });
            setShowAddEditModal(true);
          }}
          className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Product</span>
        </button>
      </div>

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="inventory-stats">
        {/* Total holding valuation */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <Package className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Holding Valuation</p>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {formatCurrency(totalStockValuation, currencySymbol, currency)}
            </h3>
          </div>
        </div>

        {/* Total Unique Items */}
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 flex items-center gap-4 shadow-sm">
          <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 rounded-xl">
            <Tag className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Unique Products</p>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {totalItems} Items
            </h3>
          </div>
        </div>

        {/* Low Stock count alert */}
        <div className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 flex items-center gap-4 shadow-sm ${lowStockCount > 0 ? 'border-amber-200 dark:border-amber-900/50 bg-amber-50/10 dark:bg-amber-950/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
          <div className={`p-2.5 rounded-xl ${lowStockCount > 0 ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Low Stock Items</p>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {lowStockCount} Flags
            </h3>
          </div>
        </div>

        {/* Out of stock alert */}
        <div className={`bg-white dark:bg-zinc-900 border rounded-2xl p-4 flex items-center gap-4 shadow-sm ${outOfStockCount > 0 ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/10 dark:bg-rose-950/10' : 'border-zinc-200 dark:border-zinc-800'}`}>
          <div className={`p-2.5 rounded-xl ${outOfStockCount > 0 ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Out of Stock</p>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mt-1">
              {outOfStockCount} Items
            </h3>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm flex flex-col lg:flex-row gap-4 items-center">
        {/* Search */}
        <div className="relative w-full lg:flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search by name, SKU, barcode, category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 w-full lg:w-auto">
          {/* Category selection */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            {uniqueCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          {/* Stock Level selection */}
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value)}
            className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 focus:outline-none"
          >
            <option value="ALL">All Stock Levels</option>
            <option value="LOW_STOCK">Low Stock Warning</option>
            <option value="OUT_OF_STOCK">Out of Stock</option>
          </select>

          {/* Exporting options */}
          <div className="flex items-center gap-1.5 border-l border-zinc-200 dark:border-zinc-800 pl-3">
            <button
              onClick={handleExportExcel}
              disabled={processedItems.length === 0}
              className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-50 cursor-pointer"
              title="Export Valuation Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportCSV}
              disabled={processedItems.length === 0}
              className="p-1.5 text-zinc-500 hover:text-indigo-600 hover:bg-zinc-50 dark:hover:bg-zinc-800 rounded-lg disabled:opacity-50 cursor-pointer"
              title="Export Valuation CSV"
            >
              <Download className="w-4 h-4 text-emerald-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Datatable catalog list */}
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                <th className="p-4 cursor-pointer select-none" onClick={() => toggleSort('name')}>
                  <div className="flex items-center gap-1">
                    <span>Product Name</span>
                    <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                  </div>
                </th>
                <th className="p-4 cursor-pointer select-none" onClick={() => toggleSort('sku')}>
                  <div className="flex items-center gap-1">
                    <span>SKU</span>
                    <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                  </div>
                </th>
                <th className="p-4">Category</th>
                <th className="p-4 text-right cursor-pointer select-none" onClick={() => toggleSort('purchasePrice')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Purchase Cost</span>
                    <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                  </div>
                </th>
                <th className="p-4 text-right cursor-pointer select-none" onClick={() => toggleSort('sellingPrice')}>
                  <div className="flex items-center justify-end gap-1">
                    <span>Retail Price</span>
                    <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                  </div>
                </th>
                <th className="p-4 text-center cursor-pointer select-none" onClick={() => toggleSort('currentStock')}>
                  <div className="flex items-center justify-center gap-1">
                    <span>Stock Level</span>
                    <ArrowUpDown className="w-3 h-3 text-zinc-400" />
                  </div>
                </th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60 text-sm text-zinc-700 dark:text-zinc-300">
              {processedItems.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center p-12 text-zinc-400">
                    <p className="font-medium text-base">No inventory products found</p>
                    <p className="text-xs mt-1">Try adapting criteria or build a new product card.</p>
                  </td>
                </tr>
              ) : (
                processedItems.map((item) => {
                  const isLow = item.currentStock <= item.minimumStock;
                  const isOut = item.currentStock === 0;

                  return (
                    <tr key={item.id} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                      <td className="p-4 font-semibold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                        {item.name}
                      </td>
                      <td className="p-4 font-mono text-xs text-zinc-500 whitespace-nowrap">{item.sku}</td>
                      <td className="p-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 bg-zinc-100 dark:bg-zinc-800 rounded text-xs font-medium text-zinc-600 dark:text-zinc-400">
                          {item.category}
                        </span>
                      </td>
                      <td className="p-4 text-right whitespace-nowrap font-medium text-zinc-500">
                        {formatCurrency(item.purchasePrice, currencySymbol, currency)}
                      </td>
                      <td className="p-4 text-right whitespace-nowrap font-bold text-zinc-800 dark:text-zinc-200">
                        {formatCurrency(item.sellingPrice, currencySymbol, currency)}
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${isOut ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600' : isLow ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600' : 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400'}`}>
                            {item.currentStock} in stock
                          </span>
                          {isOut ? (
                            <span className="text-[10px] text-rose-500 font-semibold mt-1 uppercase">Out of Stock</span>
                          ) : isLow ? (
                            <span className="text-[10px] text-amber-500 font-semibold mt-1 uppercase">Low (Min: {item.minimumStock})</span>
                          ) : null}
                        </div>
                      </td>
                      <td className="p-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => openAdjustmentModal(item)}
                            className="p-1.5 text-zinc-500 hover:text-indigo-600 rounded-lg cursor-pointer"
                            title="Adjust Stock"
                          >
                            <MoveHorizontal className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEditModal(item)}
                            className="p-1.5 text-zinc-500 hover:text-indigo-600 rounded-lg cursor-pointer"
                            title="Edit Product"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => item.id && handleDelete(item.id, item.name)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg cursor-pointer"
                            title="Delete Product"
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

      {/* Product Add / Edit Modal */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                <span>{editingItem ? 'Edit Product Card' : 'Add New Product Card'}</span>
              </h3>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
              {/* Product Name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Product Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dell XPS Desktop"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              {/* SKU & Barcode */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">SKU (Auto-Generates If Blank)</label>
                  <input
                    type="text"
                    placeholder="e.g. DELL-XPS-01"
                    value={formData.sku}
                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Barcode</label>
                  <input
                    type="text"
                    placeholder="e.g. 881203912803"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Category & Supplier */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Electronics, Furniture"
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Supplier</label>
                  <select
                    value={formData.supplierId}
                    onChange={(e) => setFormData({ ...formData, supplierId: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  >
                    <option value="">No Supplier Selected</option>
                    {suppliers?.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Purchase Price vs Selling Price */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Cost Price ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Selling Price ({currencySymbol}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none font-bold"
                  />
                </div>
              </div>

              {/* Stock Levels: Hide current Stock on EDIT to prevent accidental overwrites */}
              <div className="grid grid-cols-2 gap-4">
                {!editingItem && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-zinc-500 uppercase">Opening Stock</label>
                    <input
                      type="number"
                      placeholder="0"
                      value={formData.openingStock}
                      onChange={(e) => setFormData({ ...formData, openingStock: e.target.value, currentStock: e.target.value })}
                      className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-zinc-500 uppercase">Minimum Alert Stock Threshold</label>
                  <input
                    type="number"
                    placeholder="5"
                    value={formData.minimumStock}
                    onChange={(e) => setFormData({ ...formData, minimumStock: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Description (Optional)</label>
                <textarea
                  placeholder="Enter details about materials, specs, features..."
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none resize-none"
                />
              </div>

              {/* Footer */}
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
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Stock Adjustment Modal */}
      {showAdjustModal && adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl max-w-md w-full overflow-hidden flex flex-col">
            <div className="p-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                <MoveHorizontal className="w-5 h-5 text-indigo-500" />
                <span>Adjust Product Stock</span>
              </h3>
              <button
                onClick={() => setShowAdjustModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 p-1.5 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="p-5 space-y-4">
              <div className="p-3 bg-zinc-50 dark:bg-zinc-950 border border-zinc-100 dark:border-zinc-800 rounded-xl text-xs space-y-1">
                <p className="font-semibold text-zinc-800 dark:text-zinc-200">Product: {adjustingItem.name}</p>
                <p className="text-zinc-500">SKU: {adjustingItem.sku} | Barcode: {adjustingItem.barcode || '-'}</p>
                <p className="text-zinc-500">Current Catalog Balance: <span className="font-bold text-indigo-600 dark:text-indigo-400">{adjustingItem.currentStock} units</span></p>
              </div>

              {/* Adjustment Direction */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Adjustment Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAdjustData({ ...adjustData, type: 'ADD' })}
                    className={`py-2 px-4 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${adjustData.type === 'ADD' ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' : 'bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400'}`}
                  >
                    Add Stock (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdjustData({ ...adjustData, type: 'REMOVE' })}
                    className={`py-2 px-4 rounded-xl text-sm font-semibold border transition-all cursor-pointer ${adjustData.type === 'REMOVE' ? 'bg-rose-50 border-rose-500 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400' : 'bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-400'}`}
                  >
                    Reduce Stock (-)
                  </button>
                </div>
              </div>

              {/* Adjustment Quantity */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Adjustment Quantity</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 5"
                  value={adjustData.quantity}
                  onChange={(e) => setAdjustData({ ...adjustData, quantity: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              {/* Reason for adjustment */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-500 uppercase">Reason for Adjustment</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Stock count check, damaged items..."
                  value={adjustData.reason}
                  onChange={(e) => setAdjustData({ ...adjustData, reason: e.target.value })}
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 text-zinc-700 dark:text-zinc-300 rounded-xl text-sm font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  Apply Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
