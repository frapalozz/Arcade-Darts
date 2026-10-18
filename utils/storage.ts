/**
 * Wrapper sicuro attorno a localStorage:
 * - non lancia mai (Safari in navigazione privata, storage pieno o bloccato)
 * - se localStorage non è disponibile ripiega su sessionStorage e poi su memoria
 * - nessun alert e nessuna doppia scrittura
 */
const memory = new Map<string, string>();

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function backends(): Store[] {
    const list: Store[] = [];
    try {
        if (typeof localStorage !== 'undefined') list.push(localStorage);
    } catch {}
    try {
        if (typeof sessionStorage !== 'undefined') list.push(sessionStorage);
    } catch {}
    return list;
}

export const storage = {
    setItem: (key: string, value: string): boolean => {
        for (const store of backends()) {
            try {
                store.setItem(key, value);
                memory.delete(key);
                return true;
            } catch {
                // quota esaurita / storage bloccato: prova il backend successivo
            }
        }
        memory.set(key, value);
        return false; // salvato solo in memoria (non sopravvive a un reload)
    },
    getItem: (key: string): string | null => {
        for (const store of backends()) {
            try {
                const value = store.getItem(key);
                if (value !== null) return value;
            } catch {}
        }
        return memory.get(key) ?? null;
    },
    removeItem: (key: string): void => {
        memory.delete(key);
        for (const store of backends()) {
            try {
                store.removeItem(key);
            } catch {}
        }
    },
};

export type SafeStorage = typeof storage;
