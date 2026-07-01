import * as XLSX from 'xlsx';

// --- CURRENCY & DATE FORMATTING ---

export function formatCurrency(amount: number, currencySymbol: string = '$', currencyCode: string = 'USD'): string {
  // Gracefully handle undefined or null amounts
  const num = typeof amount === 'number' ? amount : 0;
  
  try {
    const formatter = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode || 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    
    // Some browsers return the symbol automatically. If custom symbol is specified,
    // we can replace or prepend as needed. But standard Intl is best!
    let formatted = formatter.format(num);
    
    // If the system currency symbol is different from standard locale, override
    if (currencySymbol && currencySymbol !== '$' && currencyCode === 'USD') {
      formatted = formatted.replace('$', currencySymbol);
    }
    return formatted;
  } catch (e) {
    return `${currencySymbol}${num.toFixed(2)}`;
  }
}

export function formatDate(dateString: string, formatStyle: string = 'YYYY-MM-DD'): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  if (formatStyle === 'DD/MM/YYYY') {
    return `${day}/${month}/${year}`;
  }
  if (formatStyle === 'MM/DD/YYYY') {
    return `${month}/${day}/${year}`;
  }
  
  // Default YYYY-MM-DD
  return `${year}-${month}-${day}`;
}

// --- EXPORT TO EXCEL / CSV ---

export function exportToExcel(data: any[], fileName: string) {
  if (!data || data.length === 0) return;
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
}

export function exportToCSV(data: any[], fileName: string) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]).join(',');
  const rows = data.map(row => 
    Object.values(row).map(val => {
      const str = String(val === null || val === undefined ? '' : val).replace(/"/g, '""');
      return str.includes(',') || str.includes('\n') ? `"${str}"` : str;
    }).join(',')
  ).join('\n');
  
  const blob = new Blob([headers + '\n' + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${fileName}_${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- SHADCN-LIKE CLASS MERGING UTILITY ---
export function cn(...classes: (string | undefined | false | null)[]) {
  return classes.filter(Boolean).join(' ');
}
