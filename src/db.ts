import Dexie, { type Table } from 'dexie';

// --- DATABASE INTERFACES ---

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  openingBalance: number;
  currentBalance: number;
  notes: string;
}

export interface Supplier {
  id?: number;
  name: string;
  phone: string;
  email: string;
  address: string;
  balance: number;
  notes: string;
}

export interface InventoryItem {
  id?: number;
  name: string;
  sku: string;
  barcode: string;
  category: string;
  purchasePrice: number;
  sellingPrice: number;
  openingStock: number;
  currentStock: number;
  minimumStock: number;
  supplierId?: number;
  description: string;
}

export interface Expense {
  id?: number;
  date: string; // ISO format: YYYY-MM-DD
  amount: number;
  category: string;
  description: string;
  paymentMethod: string;
  reference: string;
  notes: string;
}

export interface Income {
  id?: number;
  date: string; // ISO format: YYYY-MM-DD
  amount: number;
  category: string;
  description: string;
  paymentMethod: string;
  reference: string;
  notes: string;
}

export interface Sale {
  id?: number;
  date: string; // ISO format: YYYY-MM-DD
  customerId?: number;
  invoiceNumber: string;
  discount: number; // Flat amount discount
  taxRate: number; // Percentage
  taxAmount: number;
  total: number;
  profit: number;
  notes: string;
}

export interface SaleItem {
  id?: number;
  saleId: number;
  inventoryId: number;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discount: number; // Flat discount
  tax: number; // Flat tax
  total: number;
}

export interface Purchase {
  id?: number;
  date: string; // ISO format: YYYY-MM-DD
  supplierId?: number;
  billNumber: string;
  total: number;
  notes: string;
}

export interface PurchaseItem {
  id?: number;
  purchaseId: number;
  inventoryId: number;
  quantity: number;
  unitCost: number;
  total: number;
}

export interface Transaction {
  id?: number;
  date: string; // ISO format: YYYY-MM-DD
  amount: number;
  type: 'CASH_IN' | 'CASH_OUT' | 'EXPENSE' | 'INCOME' | 'SALE' | 'PURCHASE';
  category: string;
  description: string;
  paymentMethod: string;
  reference: string;
  notes: string;
  linkId?: number; // IDs from expenses, income, sales, purchases
}

export interface AppSetting {
  key: string;
  value: any;
}

export interface BackupHistory {
  id?: number;
  date: string;
  status: 'success' | 'failed';
  description: string;
  fileSize: string;
}

// --- DEXIE CLASS DEFINITION ---

class OfflineLedgerDB extends Dexie {
  customers!: Table<Customer, number>;
  suppliers!: Table<Supplier, number>;
  inventory!: Table<InventoryItem, number>;
  expenses!: Table<Expense, number>;
  income!: Table<Income, number>;
  sales!: Table<Sale, number>;
  saleItems!: Table<SaleItem, number>;
  purchases!: Table<Purchase, number>;
  purchaseItems!: Table<PurchaseItem, number>;
  transactions!: Table<Transaction, number>;
  settings!: Table<AppSetting, string>;
  backupHistory!: Table<BackupHistory, number>;

  constructor() {
    super('OfflineLedgerDB');
    this.version(1).stores({
      customers: '++id, name, phone, email',
      suppliers: '++id, name, phone, email',
      inventory: '++id, name, sku, barcode, category, supplierId',
      expenses: '++id, date, category, paymentMethod',
      income: '++id, date, category, paymentMethod',
      sales: '++id, date, customerId, invoiceNumber',
      saleItems: '++id, saleId, inventoryId',
      purchases: '++id, date, supplierId, billNumber',
      purchaseItems: '++id, purchaseId, inventoryId',
      transactions: '++id, date, type, category, linkId',
      settings: 'key',
      backupHistory: '++id, date',
    });
  }
}

export const db = new OfflineLedgerDB();

// --- AUTOMATIC DATA SEEDING ---

export async function clearAllDatabaseData() {
  await db.customers.clear();
  await db.suppliers.clear();
  await db.inventory.clear();
  await db.expenses.clear();
  await db.income.clear();
  await db.sales.clear();
  await db.saleItems.clear();
  await db.purchases.clear();
  await db.purchaseItems.clear();
  await db.transactions.clear();
  await db.backupHistory.clear();
}

export async function seedInitialData() {
  const settingsCount = await db.settings.count();
  if (settingsCount > 0) return; // DB already seeded

  console.log('Seeding initial offline accounting database settings...');

  // 1. Settings only - no dummy records
  await db.settings.bulkAdd([
    { key: 'businessName', value: 'Jilansoft Accounting' },
    { key: 'businessLogo', value: 'JS' },
    { key: 'currency', value: 'USD' },
    { key: 'currencySymbol', value: '$' },
    { key: 'dateFormat', value: 'YYYY-MM-DD' },
    { key: 'theme', value: 'light' },
    { key: 'categories_expense', value: ['Rent', 'Electricity', 'Salary', 'Petrol', 'Transport', 'Internet', 'Maintenance', 'Tea', 'Office Expense', 'Misc'] },
    { key: 'categories_income', value: ['Other Income', 'Investment', 'Commission', 'Service Income', 'Profit Adjustment'] },
    { key: 'paymentMethods', value: ['Cash', 'Bank Transfer', 'Credit Card', 'Cheque'] }
  ]);

  console.log('Database configuration seeding successfully completed!');
}
