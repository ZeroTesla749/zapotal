// ============================================================
// SISTEMA LOGÍSTICO LAGUNA ZAPOTAL – PWA app.js v3
// ============================================================

const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycby9UIJfk3yg_gP9bGebgQBenPepsYsrEQkSG_my-5dk1-GXjjNknlF09rE3Xq2SmzQ/exec',
  DB_NAME:         'LogisticaZapotalDB',
  DB_VERSION:      2,
  SYNC_INTERVAL:   30000,
  MEDIDAS_CASING:  ['5 1/2', '9 5/8', '13 3/8'],
  PESOS_CASING:    [15.5, 17, 20, 32.3, 40],
};

// ─── BASE DE DATOS INDEXEDDB ─────────────────────────────────
class DB {
  constructor() { this.db = null; }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('sync_queue')) {
          const cola = db.createObjectStore('sync_queue', { keyPath: 'uuid' });
          cola.createIndex('tipo',   'tipo',   { unique: false });
          cola.createIndex('estado', 'estado', { unique: false });
        }
        if (!db.objectStoreNames.contains('cache_racks')) {
          db.createObjectStore('cache_racks', { keyPath: 'ID_RACK' });
        }
        if (!db.objectStoreNames.contains('cache_catalogo')) {
          db.createObjectStore('cache_catalogo', { keyPath: 'clave' });
        }
      };

      req.onsuccess  = (e) => { this.db = e.target.result; resolve(this); };
      req.onerror    = (e) => reject(e.target.error);
    });
  }

  async encolar(tipo, data) {
    const uuid   = generarUUID();
    const record = {
      uuid, tipo,
      data:    { ...data, uuid },
      estado:  'pendiente',
      fecha:   new Date().toISOString(),
      intentos: 0,
    };
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('sync_queue', 'readwrite');
      const req = tx.objectStore('sync_queue').add(record);
      req.onsuccess = () => resolve(uuid);
      req.onerror   = () => reject(req.error);
    });
  }

  async obtenerPendientes() {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('sync_queue', 'readonly');
      const idx = tx.objectStore('sync_queue').index('estado');
      const req = idx.getAll('pendiente');
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  async marcarSincronizado(uuid) {
    return this._actualizarEstado(uuid, 'sincronizado');
  }

  async marcarError(uuid, error) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('sync_queue', 'readwrite');
      const os  = tx.objectStore('sync_queue');
      const req = os.get(uuid);
      req.onsuccess = () => {
        const rec     = req.result;
        if (!rec) { resolve(); return; }
        rec.estado    = 'error';
        rec.error_msg = error;
        rec.intentos  = (rec.intentos || 0) + 1;
        const upd     = os.put(rec);
        upd.onsuccess = resolve;
        upd.onerror   = () => reject(upd.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  _actualizarEstado(uuid, estado) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('sync_queue', 'readwrite');
      const os  = tx.objectStore('sync_queue');
      const req = os.get(uuid);
      req.onsuccess = () => {
        if (!req.result) { resolve(); return; }
        const rec  = req.result;
        rec.estado = estado;
        const upd  = os.put(rec);
        upd.onsuccess = resolve;
        upd.onerror   = () => reject(upd.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ─── CACHE RACKS ─────────────────────────────────────────
  async guardarCacheRacks(racks) {
    const tx = this.db.transaction('cache_racks', 'readwrite');
    const os = tx.objectStore('cache_racks');
    // Limpiar primero
    os.clear();
    racks.forEach(r => { if (r.ID_RACK) os.put(r); });
    return new Promise((r, rj) => { tx.oncomplete = r; tx.onerror = () => rj(tx.error); });
  }

  async obtenerCacheRacks() {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('cache_racks', 'readonly');
      const req = tx.objectStore('cache_racks').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  }

  // ─── CACHE CATÁLOGO ──────────────────────────────────────
  async guardarCacheCatalogo(clave, valor) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('cache_catalogo', 'readwrite');
      const req = tx.objectStore('cache_catalogo').put({ clave, valor, ts: Date.now() });
      req.onsuccess = resolve;
      req.onerror   = () => reject(req.error);
    });
  }

  async obtenerCacheCatalogo(clave) {
    return new Promise((resolve, reject) => {
      const tx  = this.db.transaction('cache_catalogo', 'readonly');
      const req = tx.objectStore('cache_catalogo').get(clave);
      req.onsuccess = () => resolve(req.result ? req.result.valor : null);
      req.onerror   = () => reject(req.error);
    });
  }
}

// ─── SINCRONIZADOR ───────────────────────────────────────────
class Sincronizador {
  constructor(db) {
    this.db        = db;
    this.corriendo = false;
    this._iniciado = false;
  }

  iniciar() {
    if (this._iniciado) return;
    this._iniciado = true;

    window.addEventListener('online', () => {
      setTimeout(() => this.sincronizar(), 1000);
    });

    setInterval(() => {
      if (navigator.onLine && !this.corriendo) this.sincronizar();
    }, CONFIG.SYNC_INTERVAL);
  }

  async sincronizar() {
    if (this.corriendo) return;
    this.corriendo = true;

    const pendientes = await this.db.obtenerPendientes();
    if (pendientes.length === 0) { this.corriendo = false; return; }

    console.log(`[SYNC] ${pendientes.length} registros pendientes`);
    UI.mostrarSyncBanner(pendientes.length);

    let ok = 0, err = 0;
    for (const rec of pendientes) {
      // Marcar ANTES de enviar para evitar duplicados al reiniciar
      await this.db.marcarSincronizado(rec.uuid);
      try {
        await fetch(CONFIG.APPS_SCRIPT_URL, {
          method:  'POST',
          mode:    'no-cors',
          body:    JSON.stringify({ tipo: rec.tipo, data: rec.data }),
          headers: { 'Content-Type': 'text/plain' },
        });
        ok++;
        console.log(`[SYNC] ✓ Enviado: ${rec.uuid.slice(0,8)}`);
      } catch (e) {
        await this.db.marcarError(rec.uuid, e.message);
        err++;
      }
    }

    console.log(`[SYNC] ✓ ${ok} OK, ✗ ${err} errores`);
    UI.ocultarSyncBanner();
    if (ok > 0) UI.mostrarToast(`${ok} REGISTRO(S) SINCRONIZADO(S)`);
    this.corriendo = false;
  }
}

// ─── MÓDULOS DE FORMULARIOS ──────────────────────────────────
class FormRecepcionCasing {
  constructor(db) { this.db = db; }

  async guardar(datos) {
    if (!datos.n_for || !datos.codigo_spring || !datos.tubos_totales)
      throw new Error('CAMPOS REQUERIDOS: N° FOR, CÓDIGO SPRING, TUBOS TOTALES');
    if (!CONFIG.MEDIDAS_CASING.includes(datos.medida_casing))
      throw new Error(`MEDIDA INVÁLIDA. USE: ${CONFIG.MEDIDAS_CASING.join(', ')}`);

    datos.fecha = datos.fecha || hoy();
    const uuid  = await this.db.encolar('recepcion_casing', datos);
    return uuid;
  }
}

class FormRecepcionAIB {
  constructor(db) { this.db = db; }

  async guardar(datos, packingListItems = []) {
    if (!datos.n_container || !datos.sku_modelo)
      throw new Error('N° CONTAINER Y MODELO AIB SON REQUERIDOS');

    const uuidAIB = await this.db.encolar('recepcion_aib', datos);

    if (packingListItems.length > 0) {
      await this.db.encolar('packing_list_aib', {
        uuid_recepcion_aib: uuidAIB,
        id_aib:      `AIB-${datos.n_container}-${datos.sku_modelo}`,
        n_container: datos.n_container,
        items:       packingListItems,
      });
    }
    return uuidAIB;
  }
}

class FormDespacho {
  constructor(db) { this.db = db; }

  async guardarCasing(datos) {
    if (!datos.n_rq || !datos.pozo_destino)
      throw new Error('N° RQ Y POZO DESTINO SON REQUERIDOS');
    return await this.db.encolar('despacho_casing', datos);
  }

  async guardarAIB(datos) {
    if (!datos.n_rq || !datos.pozo_destino)
      throw new Error('N° RQ Y POZO DESTINO SON REQUERIDOS');
    return await this.db.encolar('despacho_aib', datos);
  }
}

// ─── ESCÁNER QR ──────────────────────────────────────────────
class EscanerQR {
  constructor(db) { this.db = db; this.stream = null; this.activo = false; }

  async iniciarCamara(videoEl, onDetected) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      videoEl.srcObject = this.stream;
      this.activo = true;

      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (!this.activo) return;
          try {
            const codes = await detector.detect(videoEl);
            if (codes.length > 0) await this._procesarCodigo(codes[0].rawValue, onDetected);
          } catch (_) {}
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else {
        UI.mostrarToast('ESCÁNER NO DISPONIBLE. USA EL CÓDIGO MANUAL.');
      }
    } catch (e) { throw new Error('NO SE PUDO ACCEDER A LA CÁMARA: ' + e.message); }
  }

  detener() {
    this.activo = false;
    if (this.stream) { this.stream.getTracks().forEach(t => t.stop()); this.stream = null; }
  }

  async _procesarCodigo(rawValue, onDetected) {
    this.detener();
    onDetected(rawValue, null);
  }
}

// ─── CATÁLOGO ONLINE/OFFLINE ──────────────────────────────────
class CatalogoManager {
  constructor(db) { this.db = db; }

  async sincronizarDesdeSheets() {
    if (!navigator.onLine) return false;
    try {
      const resp = await fetch(CONFIG.APPS_SCRIPT_URL + '?accion=catalogo_aib');
      const json = await resp.json();
      if (json.codigo === 200) {
        await this.db.guardarCacheCatalogo('catalogo_aib', json.data);
        return json.data;
      }
    } catch (e) { console.log('[CATALOGO] Error:', e.message); }
    return null;
  }

  async sincronizarRacksDesdeSheets() {
    if (!navigator.onLine) return false;
    try {
      const resp = await fetch(CONFIG.APPS_SCRIPT_URL + '?accion=catalogo_racks');
      const json = await resp.json();
      if (json.codigo === 200 && json.data) {
        await this.db.guardarCacheRacks(json.data);
        return json.data;
      }
    } catch (e) { console.log('[RACKS] Error:', e.message); }
    return null;
  }

  async obtenerCatalogoAIB() {
    // Intentar desde Sheets primero
    const online = await this.sincronizarDesdeSheets();
    if (online) return online;
    // Fallback: cache local
    return await this.db.obtenerCacheCatalogo('catalogo_aib') || { modelos: [], containers: [] };
  }

  async obtenerRacks(soloConStock = false) {
    await this.sincronizarRacksDesdeSheets();
    const racks = await this.db.obtenerCacheRacks();
    if (soloConStock) return racks.filter(r => parseInt(r.STOCK_ACTUAL || r.CAPACIDAD_MAX) > 0);
    return racks;
  }

  async guardarModelo(modelo, desc) {
    const uuid = await this.db.encolar('catalogo_modelo', { modelo, desc });
    // Actualizar cache local inmediatamente
    const cat = await this.db.obtenerCacheCatalogo('catalogo_aib') || { modelos: [], containers: [] };
    if (!cat.modelos.find(m => m.modelo === modelo)) {
      cat.modelos.push({ modelo, desc });
      await this.db.guardarCacheCatalogo('catalogo_aib', cat);
    }
    return uuid;
  }

  async guardarContainer(container, desc) {
    const uuid = await this.db.encolar('catalogo_container', { container, desc });
    const cat  = await this.db.obtenerCacheCatalogo('catalogo_aib') || { modelos: [], containers: [] };
    if (!cat.containers.find(c => c.container === container)) {
      cat.containers.push({ container, desc });
      await this.db.guardarCacheCatalogo('catalogo_aib', cat);
    }
    return uuid;
  }

  async guardarRack(datos) {
    return await this.db.encolar('catalogo_rack', datos);
  }
}

// ─── UI ──────────────────────────────────────────────────────
const UI = {
  mostrarToast(msg, tipo) {
    const t = document.getElementById('toast');
    if (!t) { console.log('[TOAST]', msg); return; }
    t.textContent = msg;
    t.className   = 'visible' + (tipo === 'error' ? ' error' : '');
    clearTimeout(UI._toastTimer);
    UI._toastTimer = setTimeout(() => { if (t) t.className = ''; }, 4000);
  },
  mostrarSyncBanner(n) {
    const el = document.getElementById('sync-banner');
    if (!el) return;
    el.textContent  = `🔄 SINCRONIZANDO ${n} REGISTRO(S)...`;
    el.style.display = 'block';
  },
  ocultarSyncBanner() {
    const el = document.getElementById('sync-banner');
    if (el) el.style.display = 'none';
  },
  indicadorOnline() {
    const el = document.getElementById('estado-conexion');
    if (!el) return;
    el.textContent = navigator.onLine ? '🟢 Online' : '🔴 Offline';
  },
};

// ─── GENERADOR UUID ──────────────────────────────────────────
function generarUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function hoy() { return new Date().toISOString().split('T')[0]; }

// ─── INICIALIZACIÓN ──────────────────────────────────────────
let dbInstance, sync, catalogoMgr;

async function initApp() {
  try {
    dbInstance  = await new DB().init();
    sync        = new Sincronizador(dbInstance);
    catalogoMgr = new CatalogoManager(dbInstance);
    sync.iniciar();

    window.App = {
      db:              dbInstance,
      sync,
      catalogo:        catalogoMgr,
      SCRIPT_URL:      CONFIG.APPS_SCRIPT_URL,
      recepcionCasing: new FormRecepcionCasing(dbInstance),
      recepcionAIB:    new FormRecepcionAIB(dbInstance),
      despacho:        new FormDespacho(dbInstance),
      escaner:         new EscanerQR(dbInstance),
      UI,
    };

    window.addEventListener('online',  UI.indicadorOnline);
    window.addEventListener('offline', UI.indicadorOnline);
    UI.indicadorOnline();

    // Sincronizar catálogos al iniciar si hay conexión
    if (navigator.onLine) {
      catalogoMgr.sincronizarDesdeSheets().then(() => {
        if (typeof actualizarSelectsAIB === 'function') actualizarSelectsAIB();
      });
      catalogoMgr.sincronizarRacksDesdeSheets();
    }

    console.log('[APP] Sistema inicializado correctamente.');
  } catch (e) {
    console.error('[APP] Error de inicialización:', e);
    alert('Error al iniciar la aplicación: ' + e.message);
  }
}

