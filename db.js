// Minimal IndexedDB helper (no libraries)
const DB_NAME = "allowance_tracker_db";
const DB_VER = 1;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("claims")) {
        const store = db.createObjectStore("claims", { keyPath: "id" });
        store.createIndex("byDate", "dateKey", { unique: false });
        store.createIndex("byMonth", "monthKey", { unique: false });
      }
      if (!db.objectStoreNames.contains("dayTags")) {
        db.createObjectStore("dayTags", { keyPath: "dateKey" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(storeName, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
  });
}

const DB = {
  async getMeta(key) {
    return tx("meta", "readonly", (s) => new Promise((res) => {
      const r = s.get(key);
      r.onsuccess = () => res(r.result ? r.result.value : undefined);
      r.onerror = () => res(undefined);
    }));
  },
  async setMeta(key, value) {
    return tx("meta", "readwrite", (s) => s.put({ key, value }));
  },

  async putClaim(claim) {
    return tx("claims", "readwrite", (s) => s.put(claim));
  },
  async deleteClaim(id) {
    return tx("claims", "readwrite", (s) => s.delete(id));
  },
  async listClaimsByMonth(monthKey) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("claims", "readonly");
      const store = t.objectStore("claims").index("byMonth");
      const out = [];
      const req = store.openCursor(IDBKeyRange.only(monthKey));
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
  async listClaimsByDate(dateKey) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("claims", "readonly");
      const store = t.objectStore("claims").index("byDate");
      const out = [];
      const req = store.openCursor(IDBKeyRange.only(dateKey));
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },
  async listAllClaims() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("claims", "readonly");
      const store = t.objectStore("claims");
      const out = [];
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        out.push(cur.value);
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },

  async setDayTag(dateKey, tag) {
    return tx("dayTags", "readwrite", (s) => s.put({ dateKey, tag }));
  },
  async getDayTag(dateKey) {
    return tx("dayTags", "readonly", (s) => new Promise((res) => {
      const r = s.get(dateKey);
      r.onsuccess = () => res(r.result ? r.result.tag : "");
      r.onerror = () => res("");
    }));
  },
  async listDayTagsForMonth(monthKey) {
    // monthKey = YYYY-MM, tags stored by dateKey = YYYY-MM-DD
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction("dayTags", "readonly");
      const store = t.objectStore("dayTags");
      const out = {};
      const req = store.openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve(out);
        const k = cur.value.dateKey;
        if (k.startsWith(monthKey)) out[k] = cur.value.tag;
        cur.continue();
      };
      req.onerror = () => reject(req.error);
    });
  },

  async wipeAll() {
    const db = await openDB();
    await Promise.all([
      new Promise((res, rej) => { const t=db.transaction("claims","readwrite"); t.objectStore("claims").clear(); t.oncomplete=res; t.onerror=()=>rej(t.error); }),
      new Promise((res, rej) => { const t=db.transaction("dayTags","readwrite"); t.objectStore("dayTags").clear(); t.oncomplete=res; t.onerror=()=>rej(t.error); }),
      new Promise((res, rej) => { const t=db.transaction("meta","readwrite"); t.objectStore("meta").clear(); t.oncomplete=res; t.onerror=()=>rej(t.error); }),
    ]);
  }
};
