// ============================================================
// SISTEMA LOGÍSTICO LAGUNA ZAPOTAL – PWA OFFLINE-FIRST
// Archivo: pwa/app.js
// Tecnología: Vanilla JS + IndexedDB + Service Worker
// ============================================================

// ─── CONFIGURACIÓN ──────────────────────────────────────────
const CONFIG = {
  APPS_SCRIPT_URL: 'https://script.google.com/macros/s/AKfycbyAK0GSZdPZ4-bFhfX50ggMoLpxwh6GQKKW_TUm475N3vixMREmA1gcRBllglZ6OsJN/exec',
  DB_NAME: 'LogisticaZapotalDB',
  DB_VERSION: 1,
  SYNC_INTERVAL: 30000,  // cada 30 seg cuando hay conexión
  MEDIDAS_CASING: ['5 1/2', '9 5/8', '13 3/8'],
  PESOS_CASING: [15.5, 17, 20, 32.3, 40],
  PASILLOS: ['1.1', '1.2', '1.3', '1.4'],
};

// ─── BASE DE DATOS INDEXEDDB ─────────────────────────────────
class DB {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

      req.onupgradeneeded = (e) => {
        const db = e.target.result;

        // Cola de sincronización
        if (!db.objectStoreNames.contains('sync_queue')) {
          const cola = db.createObjectStore('sync_queue', { keyPath: 'uuid' });
          cola.createIndex('tipo', 'tipo', { unique: false });
          cola.createIndex('estado', 'estado', { unique: false });
          cola.createIndex('fecha', 'fecha', { unique: false });
        }

        // Cache de inventario local
        if (!db.objectStoreNames.contains('inventario_cache')) {
          db.createObjectStore('inventario_cache', { keyPath: 'codigo' });
        }

        // Materiales escaneados (QR)
        if (!db.objectStoreNames.contains('qr_cache')) {
          db.createObjectStore('qr_cache', { keyPath: 'id_material' });
        }
      };

      req.onsuccess = (e) => { this.db = e.target.result; resolve(this); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  // Agregar operación a la cola
  async encolar(tipo, data) {
    const uuid = generarUUID();
    const record = {
      uuid,
      tipo,
      data: { ...data, uuid },
      estado: 'pendiente',
      fecha: new Date().toISOString(),
      intentos: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sync_queue', 'readwrite');
      const req = tx.objectStore('sync_queue').add(record);
      req.onsuccess = () => resolve(uuid);
      req.onerror = () => reject(req.error);
    });
  }

  // Obtener todos los registros pendientes
  async obtenerPendientes() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sync_queue', 'readonly');
      const idx = tx.objectStore('sync_queue').index('estado');
      const req = idx.getAll('pendiente');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  // Marcar como sincronizado
  async marcarSincronizado(uuid) {
    return this._actualizarEstado(uuid, 'sincronizado');
  }

  async marcarError(uuid, error) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sync_queue', 'readwrite');
      const os = tx.objectStore('sync_queue');
      const req = os.get(uuid);
      req.onsuccess = () => {
        const rec = req.result;
        rec.estado = 'error';
        rec.error_msg = error;
        rec.intentos = (rec.intentos || 0) + 1;
        const upd = os.put(rec);
        upd.onsuccess = resolve;
        upd.onerror = () => reject(upd.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  _actualizarEstado(uuid, estado) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('sync_queue', 'readwrite');
      const os = tx.objectStore('sync_queue');
      const req = os.get(uuid);
      req.onsuccess = () => {
        const rec = req.result;
        rec.estado = estado;
        const upd = os.put(rec);
        upd.onsuccess = resolve;
        upd.onerror = () => reject(upd.error);
      };
    });
  }

  async guardarInventarioCache(items) {
    const tx = this.db.transaction('inventario_cache', 'readwrite');
    const os = tx.objectStore('inventario_cache');
    items.forEach(item => os.put(item));
    return new Promise((r, rj) => {
      tx.oncomplete = r;
      tx.onerror = () => rj(tx.error);
    });
  }

  async buscarInventarioCache(codigo) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('inventario_cache', 'readonly');
      const req = tx.objectStore('inventario_cache').get(codigo);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async guardarQRCache(material) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction('qr_cache', 'readwrite');
      const req = tx.objectStore('qr_cache').put(material);
      req.onsuccess = resolve;
      req.onerror = () => reject(req.error);
    });
  }
}

// ─── SINCRONIZADOR ───────────────────────────────────────────
class Sincronizador {
  constructor(db) {
    this.db = db;
    this.corriendo = false;
  }

  iniciar() {
    window.addEventListener('online', () => this.sincronizar());
    setInterval(() => {
      if (navigator.onLine) this.sincronizar();
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
      try {
        // Marcar sincronizado ANTES de enviar para evitar duplicados
        await this.db.marcarSincronizado(rec.uuid);

        await fetch(CONFIG.APPS_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          body: JSON.stringify({ tipo: rec.tipo, data: rec.data }),
          headers: { 'Content-Type': 'text/plain' },
        });
        ok++;
        console.log(`[SYNC] ✓ Enviado: ${rec.uuid.slice(0, 8)}`);
      } catch (e) {
        await this.db.marcarError(rec.uuid, e.message);
        err++;
      }
    }

    console.log(`[SYNC] ✓ ${ok} OK, ✗ ${err} errores`);
    UI.ocultarSyncBanner();
    if (ok > 0) UI.mostrarToast(`${ok} registros sincronizados con éxito`);
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
  
    const uuid = await this.db.encolar('recepcion_casing', datos);
    UI.mostrarToast(`RECEPCIÓN GUARDADA. UUID: ${uuid.slice(0,8)}...`);
    return uuid;
  }
}

class FormRecepcionAIB {
  constructor(db) { this.db = db; }

  async guardar(datos, packingListItems = []) {
    if (!datos.n_container || !datos.sku_modelo)
      throw new Error('N° Container y SKU/Modelo son requeridos');

    const uuidAIB = await this.db.encolar('recepcion_aib', datos);

    if (packingListItems.length > 0) {
      await this.db.encolar('packing_list_aib', {
        uuid_recepcion_aib: uuidAIB,
        id_aib: `AIB-${datos.n_container}-${datos.sku_modelo}`,
        items: packingListItems,
      });
    }

    UI.mostrarToast(`AIB guardado. UUID: ${uuidAIB.slice(0, 8)}...`);
    return uuidAIB;
  }
}

class FormDespacho {
  constructor(db) { this.db = db; }

  async guardarCasing(datos) {
    if (!datos.n_rq || !datos.pozo_destino)
      throw new Error('N° RQ y Pozo Destino son requeridos');

    return await this.db.encolar('despacho_casing', datos);
  }

  async guardarAIB(datos) {
    if (!datos.n_rq || !datos.pozo_destino || !datos.n_container)
      throw new Error('N° RQ, Pozo Destino y N° Container son requeridos');

    return await this.db.encolar('despacho_aib', datos);
  }
}

// ─── ESCÁNER QR ──────────────────────────────────────────────
class EscanerQR {
  constructor(db) {
    this.db = db;
    this.stream = null;
    this.activo = false;
  }

  async iniciarCamara(videoEl, onDetected) {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }  // cámara trasera
      });
      videoEl.srcObject = this.stream;
      this.activo = true;

      // Usar BarcodeDetector API (disponible en Android Chrome)
      if ('BarcodeDetector' in window) {
        const detector = new BarcodeDetector({ formats: ['qr_code'] });
        const tick = async () => {
          if (!this.activo) return;
          try {
            const codes = await detector.detect(videoEl);
            if (codes.length > 0) {
              await this._procesarCodigo(codes[0].rawValue, onDetected);
            }
          } catch (_) { }
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else {
        // Fallback: entrada manual
        console.warn('[QR] BarcodeDetector no disponible. Usar entrada manual.');
        UI.mostrarToast('Escáner QR no disponible. Ingrese el código manualmente.', 'warning');
      }

    } catch (e) {
      throw new Error('No se pudo acceder a la cámara: ' + e.message);
    }
  }

  detener() {
    this.activo = false;
    if (this.stream) {
      this.stream.getTracks().forEach(t => t.stop());
      this.stream = null;
    }
  }

  async _procesarCodigo(rawValue, onDetected) {
    this.detener();

    // Buscar en cache local primero
    let material = await this.db.buscarInventarioCache(rawValue);

    if (!material && navigator.onLine) {
      // Consultar al backend
      try {
        const resp = await fetch(
          `${CONFIG.APPS_SCRIPT_URL}?accion=buscar_material&codigo=${encodeURIComponent(rawValue)}`
        );
        const json = await resp.json();
        if (json.codigo === 200) {
          material = json.data;
          await this.db.guardarQRCache({ id_material: rawValue, ...material });
        }
      } catch (_) { }
    }

    onDetected(rawValue, material);
  }
}

// ─── CAPTURA FOTOGRÁFICA ─────────────────────────────────────
class CapturaFoto {
  static async tomarFoto(inputFileEl) {
    return new Promise((resolve, reject) => {
      inputFileEl.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) { resolve(null); return; }

        const reader = new FileReader();
        reader.onload = (ev) => resolve({
          base64: ev.target.result,
          nombre: file.name,
          tipo: file.type,
          tamaño: file.size,
          fecha: new Date().toISOString(),
        });
        reader.onerror = reject;
        reader.readAsDataURL(file);
      };
      inputFileEl.click();
    });
  }
}

// ─── UTILIDADES DE UI ────────────────────────────────────────
const UI = {
  mostrarToast(msg, tipo = 'success') {
    const el = document.getElementById('toast') || document.createElement('div');
    el.id = 'toast';
    el.textContent = msg;
    el.className = `toast toast--${tipo}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  },

  mostrarSyncBanner(n) {
    let el = document.getElementById('sync-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'sync-banner';
      el.className = 'sync-banner';
      document.body.prepend(el);
    }
    el.textContent = `🔄 Sincronizando ${n} registros...`;
    el.style.display = 'block';
  },

  ocultarSyncBanner() {
    const el = document.getElementById('sync-banner');
    if (el) el.style.display = 'none';
  },

  indicadorOnline() {
    const el = document.getElementById('estado-conexion');
    if (!el) return;
    const online = navigator.onLine;
    el.textContent = online ? '🟢 En línea' : '🔴 Sin conexión (offline)';
    el.className = `estado-conexion ${online ? 'online' : 'offline'}`;
  },
};

// ─── GENERADOR UUID ──────────────────────────────────────────
function generarUUID() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

function hoy() {
  return new Date().toISOString().split('T')[0];
}

// ─── INICIALIZACIÓN ──────────────────────────────────────────
let dbInstance, sync;

async function initApp() {
  try {
    dbInstance = await new DB().init();
    sync = new Sincronizador(dbInstance);
    sync.iniciar();

    // Exponer módulos globalmente
    window.App = {
      db: dbInstance,
      sync,
      recepcionCasing: new FormRecepcionCasing(dbInstance),
      recepcionAIB: new FormRecepcionAIB(dbInstance),
      despacho: new FormDespacho(dbInstance),
      escaner: new EscanerQR(dbInstance),
      CapturaFoto,
      UI,
    };

    // Listeners de conexión
    window.addEventListener('online', UI.indicadorOnline);
    window.addEventListener('offline', UI.indicadorOnline);
    UI.indicadorOnline();

    console.log('[APP] Sistema inicializado correctamente.');

  } catch (e) {
    console.error('[APP] Error de inicialización:', e);
    alert('Error al iniciar la aplicación: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', initApp);
