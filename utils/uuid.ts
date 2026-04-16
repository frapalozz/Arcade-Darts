// utils/uuid.ts
export function generateUUID(): string {
  // Browser moderni (HTTPS o localhost) + Node.js 15.6+
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback: Math.random() (non garantisce unicità assoluta, ma sufficiente per ID di sessione)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}