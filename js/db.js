// ═══════════════════════════════════════════════════════════════
// KONKURSOX — DB.JS
// IndexedDB wrapper para persistencia de archivos binarios.
// Stores:
//   'archivos'  — blobs de la biblioteca (id → { id, blob, tipo, nombre, ... })
//   'sfx'       — blobs de SFX del sistema (eventoId → blob)
//   'sfx-custom'— blobs de SFX personalizados (sfxId → blob)
// ═══════════════════════════════════════════════════════════════

const DB_NAME    = 'KonkursoxDB';
const DB_VERSION = 1;

let _db = null;

function dbAbrir() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('archivos'))
        db.createObjectStore('archivos', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sfx'))
        db.createObjectStore('sfx', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('sfx-custom'))
        db.createObjectStore('sfx-custom', { keyPath: 'id' });
    };

    req.onsuccess  = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror    = (e) => reject(e.target.error);
  });
}

// ── CRUD genérico ─────────────────────────────────────────────────
function dbGuardar(store, objeto) {
  return dbAbrir().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(objeto);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  }));
}

function dbObtener(store, id) {
  return dbAbrir().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(id);
    req.onsuccess = (e) => resolve(e.target.result || null);
    req.onerror   = (e) => reject(e.target.error);
  }));
}

function dbObtenerTodos(store) {
  return dbAbrir().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = (e) => resolve(e.target.result || []);
    req.onerror   = (e) => reject(e.target.error);
  }));
}

function dbEliminar(store, id) {
  return dbAbrir().then(db => new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = (e) => reject(e.target.error);
  }));
}

// ── API de archivos de biblioteca ─────────────────────────────────
async function dbGuardarArchivo(id, blob, meta) {
  await dbGuardar('archivos', { id, blob, ...meta });
}

async function dbObtenerArchivoUrl(id) {
  const rec = await dbObtener('archivos', id);
  if (!rec?.blob) return null;
  return URL.createObjectURL(rec.blob);
}

async function dbEliminarArchivo(id) {
  await dbEliminar('archivos', id);
}

// ── API de SFX sistema ────────────────────────────────────────────
async function dbGuardarSfxSistema(eventoId, blob, fileName) {
  await dbGuardar('sfx', { id: eventoId, blob, fileName });
}

async function dbObtenerSfxSistema(eventoId) {
  return dbObtener('sfx', eventoId);
}

async function dbEliminarSfxSistema(eventoId) {
  await dbEliminar('sfx', eventoId);
}

// ── API de SFX personalizados ─────────────────────────────────────
async function dbGuardarSfxCustom(sfxId, blob, fileName) {
  await dbGuardar('sfx-custom', { id: sfxId, blob, fileName });
}

async function dbObtenerSfxCustom(sfxId) {
  return dbObtener('sfx-custom', sfxId);
}

async function dbEliminarSfxCustom(sfxId) {
  await dbEliminar('sfx-custom', sfxId);
}
