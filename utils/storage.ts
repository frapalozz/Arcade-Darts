export const storage = {
  setItem: (key: string, value: string): boolean => {
    try {
      localStorage.setItem(key, value);
      sessionStorage.setItem(key, value);
      return true;
    } catch {
      try {
        sessionStorage.setItem(key, value);
        alert('Usato sessionStorage al posto di localStorage');
        return true;
      } catch {
        return false;
      }
    }
  },
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key) ?? sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  removeItem: (key: string) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {}
  }
};

// Usa storage.setItem / getItem / removeItem in tutto il codice