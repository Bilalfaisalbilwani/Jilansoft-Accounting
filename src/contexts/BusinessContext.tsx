import React, { createContext, useContext, useState, useEffect } from 'react';
import { db } from '../db';

export interface BusinessSettings {
  businessName: string;
  businessLogo: string;
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  theme: 'light' | 'dark';
  categories_expense: string[];
  categories_income: string[];
  paymentMethods: string[];
}

interface BusinessContextType {
  settings: BusinessSettings;
  updateSetting: (key: keyof BusinessSettings, value: any) => Promise<void>;
  loading: boolean;
}

const defaultSettings: BusinessSettings = {
  businessName: 'SwiftBooks Trading',
  businessLogo: '',
  currency: 'USD',
  currencySymbol: '$',
  dateFormat: 'YYYY-MM-DD',
  theme: 'light',
  categories_expense: ['Rent', 'Electricity', 'Salary', 'Petrol', 'Transport', 'Internet', 'Maintenance', 'Tea', 'Office Expense', 'Misc'],
  categories_income: ['Other Income', 'Investment', 'Commission', 'Service Income', 'Profit Adjustment'],
  paymentMethods: ['Cash', 'Bank Transfer', 'Credit Card', 'Cheque']
};

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<BusinessSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadSettings() {
      try {
        const stored = await db.settings.toArray();
        const settingsMap: Partial<BusinessSettings> = {};
        
        stored.forEach(item => {
          if (item.key in defaultSettings) {
            settingsMap[item.key as keyof BusinessSettings] = item.value;
          }
        });

        const mergedSettings = {
          ...defaultSettings,
          ...settingsMap
        };

        setSettings(mergedSettings);

        // Apply dark mode theme if configured
        if (mergedSettings.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    }

    loadSettings();
  }, []);

  const updateSetting = async (key: keyof BusinessSettings, value: any) => {
    try {
      await db.settings.put({ key, value });
      setSettings(prev => {
        const updated = { ...prev, [key]: value };
        
        // Handle theme update immediately
        if (key === 'theme') {
          if (value === 'dark') {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
        }
        
        return updated;
      });
    } catch (err) {
      console.error(`Failed to update setting ${key}`, err);
    }
  };

  return (
    <BusinessContext.Provider value={{ settings, updateSetting, loading }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const context = useContext(BusinessContext);
  if (!context) {
    throw new Error('useBusiness must be used within a BusinessProvider');
  }
  return context;
}
