/**
 * ================================================================
 * LAGUNA ZAPOTAL — SETUP DE GOOGLE SHEET
 * ================================================================
 * INSTRUCCIONES DE USO:
 *  1. Abre Google Sheets → Extensions → Apps Script
 *  2. Pega este archivo completo (reemplaza el contenido)
 *  3. Guarda (Ctrl+S)
 *  4. En el menú superior del editor: Run → "setupCompleto"
 *  5. Acepta los permisos cuando te lo pida
 *  6. Vuelve al Sheet → verás las hojas creadas automáticamente
 *
 * LUEGO, para exponer la API a la app Android:
 *  1. Deploy → New Deployment
 *  2. Tipo: Web App
 *  3. Execute as: Me
 *  4. Who has access: Anyone
 *  5. Deploy → copia la URL generada
 *  6. Pega esa URL en la app Android (SheetsConfig.kt → SHEET_WEBAPP_URL)
 * ================================================================
 */


// ── CONFIGURACIÓN GENERAL ─────────────────────────────────────────
// Puedes cambiar estos nombres si quieres otras etiquetas en el Sheet

const NOMBRE_HOJA_CASING = "Inventario_Casing";   // Racks de tubería (P1.1, P1.2, P1.3)
const NOMBRE_HOJA_AIB    = "Inventario_AIB";       // Equipos de bombeo (P1.4)
const NOMBRE_HOJA_LOG    = "Log_Sincronizacion";   // Registro de cambios
const NOMBRE_HOJA_CONFIG = "Configuracion";        // Parámetros del sistema


// ================================================================
// FUNCIÓN PRINCIPAL — ejecuta todo el setup
// ================================================================
function setupCompleto() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  Logger.log("=== Iniciando setup Laguna Zapotal ===");

  crearHojaCasing(ss);
  crearHojaAIB(ss);
  crearHojaLog(ss);
  crearHojaConfig(ss);
  formatearTodasLasHojas(ss);

  // Elimina la hoja por defecto "Sheet1" si existe
  const hojaDefault = ss.getSheetByName("Sheet1") || ss.getSheetByName("Hoja1");
  if (hojaDefault) ss.deleteSheet(hojaDefault);

  SpreadsheetApp.getUi().alert(
    "✅ Setup completado\n\n" +
    "Hojas creadas:\n" +
    "• " + NOMBRE_HOJA_CASING + "\n" +
    "• " + NOMBRE_HOJA_AIB + "\n" +
    "• " + NOMBRE_HOJA_LOG + "\n" +
    "• " + NOMBRE_HOJA_CONFIG + "\n\n" +
    "Siguiente paso: Deploy → New Deployment → Web App\n" +
    "y pega la URL en SheetsConfig.kt de la app Android."
  );
}


// ================================================================
// HOJA 1 — INVENTARIO CASING (Pasillos 1.1, 1.2, 1.3)
// ================================================================
function crearHojaCasing(ss) {
  // Borra la hoja si ya existe (permite re-ejecutar el setup limpio)
  let hoja = ss.getSheetByName(NOMBRE_HOJA_CASING);
  if (hoja) ss.deleteSheet(hoja);
  hoja = ss.insertSheet(NOMBRE_HOJA_CASING);

  // ── ENCABEZADOS ──────────────────────────────────────────────
  // Si necesitas agregar una columna, añádela al final del array
  // y actualiza también la entidad RackEntity.kt en la app Android
  const headers = [
    "rack_id",          // A — ID único (ej: P11A_R01) — NO MODIFICAR
    "pasillo",          // B — 1.1, 1.2 o 1.3
    "fila",             // C — A o B (fila superior/inferior del patio)
    "numero_rack",      // D — R01, R02 … R16/R18
    "estado",           // E — libre | parcial | lleno
    "medida_casing",    // F — ej: 9⅝" · 47 lb/ft · N80
    "peso_lbft",        // G — ej: 47
    "capacidad_pct",    // H — 0 a 100
    "observaciones",    // I — texto libre
    "ultima_actualizacion",  // J — timestamp ISO
    "sincronizado"      // K — TRUE/FALSE (usado por la app)
  ];
  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);

  // ── DATOS INICIALES ───────────────────────────────────────────
  // Todos los racks en estado "libre" al inicio.
  // La app Android actualizará estos datos vía sync.
  const filas = [];

  // Pasillo 1.1 — Fila A (R01–R08) y Fila B (R09–R16)
  for (let i = 1; i <= 8;  i++) filas.push(crearFilaCasing("P11A", "1.1", "A", i));
  for (let i = 9; i <= 16; i++) filas.push(crearFilaCasing("P11B", "1.1", "B", i));

  // Pasillo 1.2 — Fila A (R01–R08) y Fila B (R09–R16)
  for (let i = 1; i <= 8;  i++) filas.push(crearFilaCasing("P12A", "1.2", "A", i));
  for (let i = 9; i <= 16; i++) filas.push(crearFilaCasing("P12B", "1.2", "B", i));

  // Pasillo 1.3 — Bloque A (R01–R06), Bloque B (R07–R11), Bloque C (R12–R18)
  for (let i = 1;  i <= 6;  i++) filas.push(crearFilaCasing("P13A", "1.3", "A", i));
  for (let i = 7;  i <= 11; i++) filas.push(crearFilaCasing("P13B", "1.3", "B", i));
  for (let i = 12; i <= 18; i++) filas.push(crearFilaCasing("P13C", "1.3", "C", i));

  if (filas.length > 0) {
    hoja.getRange(2, 1, filas.length, headers.length).setValues(filas);
  }

  // ── VALIDACIONES DE DATOS ─────────────────────────────────────
  // Columna E (estado) — solo permite los tres valores válidos
  const reglaEstado = SpreadsheetApp.newDataValidation()
    .requireValueInList(["libre", "parcial", "lleno"], true)
    .setAllowInvalid(false)
    .build();
  hoja.getRange("E2:E200").setDataValidation(reglaEstado);

  // Columna H (capacidad) — solo números 0-100
  const reglaCap = SpreadsheetApp.newDataValidation()
    .requireNumberBetween(0, 100)
    .setAllowInvalid(false)
    .build();
  hoja.getRange("H2:H200").setDataValidation(reglaCap);

  Logger.log("✓ Hoja Casing creada con " + filas.length + " racks");
}

// Genera una fila de datos para un rack de casing
function crearFilaCasing(prefijo, pasillo, fila, numero) {
  const numStr = String(numero).padStart(2, "0");
  const id = prefijo + "_R" + numStr;
  return [
    id,           // rack_id
    pasillo,      // pasillo
    fila,         // fila
    "R" + numStr, // numero_rack
    "libre",      // estado inicial
    "",           // medida_casing
    "",           // peso_lbft
    0,            // capacidad_pct
    "",           // observaciones
    new Date().toISOString(),  // ultima_actualizacion
    false         // sincronizado
  ];
}


// ================================================================
// HOJA 2 — INVENTARIO AIB (Pasillo 1.4)
// ================================================================
function crearHojaAIB(ss) {
  let hoja = ss.getSheetByName(NOMBRE_HOJA_AIB);
  if (hoja) ss.deleteSheet(hoja);
  hoja = ss.insertSheet(NOMBRE_HOJA_AIB);

  const headers = [
    "rack_id",            // A — ID único (ej: P14_R01)
    "pasillo",            // B — siempre 1.4
    "fila_y",             // C — posición Y original del layout (460,540,580,680,720,820)
    "numero_rack",        // D — R01 … R78
    "estado",             // E — libre | en_uso | en_mantenimiento
    "modelo_aib",         // F — ej: GN-60HP Series A
    "numero_serie",       // G — ej: SN-2024-0341
    "potencia_hp",        // H — potencia en HP
    "observaciones",      // I — texto libre
    "ultima_actualizacion",   // J — timestamp ISO
    "sincronizado"        // K — TRUE/FALSE
  ];
  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);

  // ── DATOS INICIALES ───────────────────────────────────────────
  // 6 filas × 13 columnas = 78 equipos AIB
  // Orden igual al HTML original: fila y=460 primero (R66-R78), etc.
  const filas_aib = [
    { y: 460, inicio: 66 },   // R66–R78
    { y: 540, inicio: 53 },   // R53–R65
    { y: 580, inicio: 40 },   // R40–R52
    { y: 680, inicio: 27 },   // R27–R39
    { y: 720, inicio: 14 },   // R14–R26
    { y: 820, inicio:  1 }    // R01–R13
  ];

  const filas = [];
  filas_aib.forEach(({ y, inicio }) => {
    for (let col = 0; col < 13; col++) {
      const n = inicio + col;
      const numStr = String(n).padStart(2, "0");
      filas.push([
        "P14_R" + numStr,        // rack_id
        "1.4",                   // pasillo
        y,                       // fila_y (posición layout original)
        "R" + numStr,            // numero_rack
        "libre",                 // estado inicial
        "",                      // modelo_aib
        "",                      // numero_serie
        "",                      // potencia_hp
        "",                      // observaciones
        new Date().toISOString(),
        false
      ]);
    }
  });

  hoja.getRange(2, 1, filas.length, headers.length).setValues(filas);

  // Validación de estado para AIB (incluye "en_mantenimiento")
  const reglaEstado = SpreadsheetApp.newDataValidation()
    .requireValueInList(["libre", "en_uso", "en_mantenimiento"], true)
    .setAllowInvalid(false)
    .build();
  hoja.getRange("E2:E200").setDataValidation(reglaEstado);

  Logger.log("✓ Hoja AIB creada con " + filas.length + " equipos");
}


// ================================================================
// HOJA 3 — LOG DE SINCRONIZACIÓN
// ================================================================
function crearHojaLog(ss) {
  let hoja = ss.getSheetByName(NOMBRE_HOJA_LOG);
  if (hoja) ss.deleteSheet(hoja);
  hoja = ss.insertSheet(NOMBRE_HOJA_LOG);

  const headers = [
    "timestamp",      // A — fecha/hora del evento
    "tipo",           // B — SYNC_UP | SYNC_DOWN | ERROR
    "rack_id",        // C — rack afectado
    "campo",          // D — campo modificado
    "valor_anterior", // E
    "valor_nuevo",    // F
    "dispositivo"     // G — identificador del dispositivo Android
  ];
  hoja.getRange(1, 1, 1, headers.length).setValues([headers]);

  // Fila de ejemplo para referencia
  hoja.getRange(2, 1, 1, headers.length).setValues([[
    new Date().toISOString(), "SETUP", "—", "—", "—", "—", "setup_inicial"
  ]]);

  Logger.log("✓ Hoja Log creada");
}


// ================================================================
// HOJA 4 — CONFIGURACIÓN DEL SISTEMA
// ================================================================
function crearHojaConfig(ss) {
  let hoja = ss.getSheetByName(NOMBRE_HOJA_CONFIG);
  if (hoja) ss.deleteSheet(hoja);
  hoja = ss.insertSheet(NOMBRE_HOJA_CONFIG);

  // Parámetros clave–valor que la app puede leer en el arranque
  const config = [
    ["clave",                 "valor",          "descripcion"],
    ["version_schema",        "1",               "Versión del esquema de datos — incrementar al cambiar columnas"],
    ["intervalo_sync_min",    "15",              "Minutos entre sincronizaciones automáticas"],
    ["nombre_sitio",          "Laguna Zapotal",  "Nombre del sitio que aparece en la app"],
    ["total_racks_casing",    "50",              "Total de racks de casing (P1.1+P1.2+P1.3)"],
    ["total_equipos_aib",     "78",              "Total de equipos AIB (P1.4)"],
    ["escala_plano",          "0.82",            "Factor de escala del plano 2D"],
    ["ultima_actualizacion",  new Date().toISOString(), "Timestamp del último setup"]
  ];
  hoja.getRange(1, 1, config.length, 3).setValues(config);

  Logger.log("✓ Hoja Config creada");
}


// ================================================================
// FORMATO VISUAL DE TODAS LAS HOJAS
// ================================================================
function formatearTodasLasHojas(ss) {
  const hojas = [NOMBRE_HOJA_CASING, NOMBRE_HOJA_AIB, NOMBRE_HOJA_LOG, NOMBRE_HOJA_CONFIG];

  hojas.forEach(nombre => {
    const hoja = ss.getSheetByName(nombre);
    if (!hoja) return;

    // Encabezado — fondo azul oscuro, texto blanco, negrita
    const numCols = hoja.getLastColumn();
    const encabezado = hoja.getRange(1, 1, 1, numCols);
    encabezado.setBackground("#1a3a5c");
    encabezado.setFontColor("#ffffff");
    encabezado.setFontWeight("bold");
    encabezado.setFontSize(10);

    // Ajustar ancho de columnas automáticamente
    hoja.autoResizeColumns(1, numCols);

    // Fijar la primera fila (encabezado siempre visible al hacer scroll)
    hoja.setFrozenRows(1);

    // Alternar colores de filas para mejor lectura
    if (hoja.getLastRow() > 1) {
      const dataRange = hoja.getRange(2, 1, hoja.getLastRow() - 1, numCols);
      // Banding (rayas alternadas)
      dataRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, false, false);
    }
  });

  // Colores especiales para columna "estado" en Casing
  colorearEstados(ss, NOMBRE_HOJA_CASING, "E");
  colorearEstados(ss, NOMBRE_HOJA_AIB,    "E");

  Logger.log("✓ Formato aplicado a todas las hojas");
}

function colorearEstados(ss, nombreHoja, columna) {
  // No se pueden aplicar colores condicionales vía Apps Script fácilmente,
  // así que se hace manual en las filas existentes.
  // La app Android actualiza el Sheet y el color se aplica al leer.
  // Si quieres reglas de color automáticas, agrégalas manualmente en
  // Format → Conditional Formatting en Google Sheets.
}


// ================================================================
// API WEB — ENDPOINT PARA LA APP ANDROID
// ================================================================
// Esta función se ejecuta cuando la app hace GET/POST al Web App URL.
// NO la renombres — Google Apps Script la llama automáticamente.

function doGet(e) {
  const accion = e.parameter.accion || "ping";

  if (accion === "ping") {
    // Health check — la app verifica conexión con esto
    return jsonResponse({ ok: true, mensaje: "Laguna Zapotal API activa", ts: new Date().toISOString() });
  }

  if (accion === "leer_todo") {
    // Devuelve TODO el inventario — la app descarga al sincronizar
    return jsonResponse({
      ok: true,
      casing: leerHoja(NOMBRE_HOJA_CASING),
      aib:    leerHoja(NOMBRE_HOJA_AIB),
      config: leerConfig()
    });
  }

  if (accion === "leer_casing") {
    return jsonResponse({ ok: true, data: leerHoja(NOMBRE_HOJA_CASING) });
  }

  if (accion === "leer_aib") {
    return jsonResponse({ ok: true, data: leerHoja(NOMBRE_HOJA_AIB) });
  }

  return jsonResponse({ ok: false, error: "Acción desconocida: " + accion });
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const accion  = payload.accion || "";

    if (accion === "actualizar_rack") {
      // La app envía los cambios de un rack individual
      return jsonResponse(actualizarRack(payload));
    }

    if (accion === "sync_batch") {
      // La app envía un lote de racks modificados offline
      return jsonResponse(syncBatch(payload.racks || []));
    }

    return jsonResponse({ ok: false, error: "Acción POST desconocida" });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.toString() });
  }
}

// Actualiza un rack individual en el Sheet
function actualizarRack(payload) {
  const ss      = SpreadsheetApp.getActiveSpreadsheet();
  const esAIB   = payload.rack_id.startsWith("P14");
  const hoja    = ss.getSheetByName(esAIB ? NOMBRE_HOJA_AIB : NOMBRE_HOJA_CASING);
  const datos   = hoja.getDataRange().getValues();
  const headers = datos[0];

  // Buscar la fila del rack por rack_id (columna A)
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === payload.rack_id) {
      // Actualizar solo los campos enviados
      const campos = payload.campos || {};
      Object.keys(campos).forEach(campo => {
        const colIndex = headers.indexOf(campo);
        if (colIndex >= 0) {
          hoja.getRange(i + 1, colIndex + 1).setValue(campos[campo]);
        }
      });
      // Timestamp de actualización y marcar como sincronizado
      const colTS   = headers.indexOf("ultima_actualizacion");
      const colSync = headers.indexOf("sincronizado");
      if (colTS   >= 0) hoja.getRange(i + 1, colTS   + 1).setValue(new Date().toISOString());
      if (colSync >= 0) hoja.getRange(i + 1, colSync + 1).setValue(true);

      // Registrar en el log
      registrarLog("SYNC_UP", payload.rack_id, JSON.stringify(campos), payload.dispositivo || "android");
      return { ok: true, rack_id: payload.rack_id };
    }
  }
  return { ok: false, error: "Rack no encontrado: " + payload.rack_id };
}

// Sincroniza un lote de racks (modificados offline)
function syncBatch(racks) {
  const resultados = racks.map(r => actualizarRack(r));
  const errores    = resultados.filter(r => !r.ok);
  return {
    ok:         errores.length === 0,
    procesados: racks.length,
    errores:    errores.length,
    detalle:    resultados
  };
}

// Lee una hoja y la devuelve como array de objetos JSON
function leerHoja(nombreHoja) {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const hoja  = ss.getSheetByName(nombreHoja);
  if (!hoja) return [];
  const datos   = hoja.getDataRange().getValues();
  const headers = datos[0];
  return datos.slice(1).map(fila => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = fila[i]);
    return obj;
  });
}

// Lee la hoja de configuración como mapa clave→valor
function leerConfig() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  const hoja  = ss.getSheetByName(NOMBRE_HOJA_CONFIG);
  if (!hoja) return {};
  const datos = hoja.getDataRange().getValues();
  const config = {};
  datos.slice(1).forEach(fila => { config[fila[0]] = fila[1]; });
  return config;
}

// Registra un evento en la hoja de log
function registrarLog(tipo, rackId, detalle, dispositivo) {
  const ss   = SpreadsheetApp.getActiveSpreadsheet();
  const hoja = ss.getSheetByName(NOMBRE_HOJA_LOG);
  if (!hoja) return;
  hoja.appendRow([new Date().toISOString(), tipo, rackId, detalle, "", "", dispositivo]);
}

// Helper para devolver JSON con los headers CORS correctos
function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
