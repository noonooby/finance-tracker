// IndexedDB Setup and Operations
const DB_NAME = 'FinanceTrackerDB';
const DB_VERSION = 2;

export const initDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      
      if (!db.objectStoreNames.contains('creditCards')) {
        db.createObjectStore('creditCards', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('loans')) {
        db.createObjectStore('loans', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('reservedFunds')) {
        db.createObjectStore('reservedFunds', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('income')) {
        db.createObjectStore('income', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('transactions')) {
        db.createObjectStore('transactions', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('categories')) {
        db.createObjectStore('categories', { keyPath: 'id' });
      }
    };
  });
};

export const dbOperation = async (storeName, operation, data = null) => {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([storeName], operation === 'get' || operation === 'getAll' ? 'readonly' : 'readwrite');
    const store = transaction.objectStore(storeName);
    
    let request;
    if (operation === 'getAll') {
      request = store.getAll();
    } else if (operation === 'get') {
      request = store.get(data);
    } else if (operation === 'put') {
      request = store.put(data);
    } else if (operation === 'delete') {
      request = store.delete(data);
    }
    
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};
