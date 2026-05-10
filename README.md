# Laguna Zapotal — App de Inventario
## Guía completa de instalación y uso

---

## ARQUITECTURA DEL PROYECTO

```
LagunaZapotal/
│
├── google-script/
│   └── Setup_LagunaZapotal.gs     ← Script para Google Sheets (ejecutar primero)
│
├── android-app/                   ← Proyecto Android Studio completo
│   ├── build.gradle               ← Configuración raíz
│   ├── settings.gradle
│   └── app/
│       ├── build.gradle           ← Dependencias de la app
│       └── src/main/
│           ├── java/com/laguna/zapotal/
│           │   ├── LagunaApp.kt           ← Application class
│           │   ├── MainActivity.kt        ← Única Activity
│           │   ├── data/
│           │   │   ├── local/
│           │   │   │   ├── AppDatabase.kt         ← BD SQLite local (Room)
│           │   │   │   ├── entity/RackEntity.kt   ← Modelo de datos
│           │   │   │   └── dao/RackDao.kt         ← Consultas SQL + BÚSQUEDA
│           │   │   ├── remote/
│           │   │   │   └── SheetsApiService.kt    ← Cliente HTTP Google Sheets
│           │   │   └── repository/
│           │   │       └── RackRepository.kt      ← Lógica offline/online
│           │   └── ui/
│           │       ├── inventario/
│           │       │   ├── RackViewModel.kt       ← ViewModel compartido
│           │       │   └── BusquedaFragment.kt    ← Pantalla de búsqueda
│           │       └── sync/
│           │           └── SyncWorker.kt          ← Sync automático background
│           ├── manifests/
│           │   └── AndroidManifest.xml
│           └── res/
│               ├── layout/
│               │   ├── activity_main.xml
│               │   ├── fragment_busqueda.xml
│               │   └── item_resultado_busqueda.xml
│               ├── navigation/nav_graph.xml
│               ├── menu/bottom_nav_menu.xml
│               ├── values/ (colors, strings, themes)
│               └── xml/network_security_config.xml
│
└── github-config/
    └── .gitignore                 ← Archivos a excluir del repositorio

```

---

## PASO 1 — CONFIGURAR GOOGLE SHEETS

1. Crea un Google Sheet nuevo (o abre uno existente)
2. Ve a **Extensions → Apps Script**
3. Borra el contenido del editor y pega el contenido de `google-script/Setup_LagunaZapotal.gs`
4. Guarda con `Ctrl+S`
5. En el menú superior: **Run → setupCompleto**
6. Acepta los permisos (Google te pedirá autorización)
7. Vuelve al Sheet — verás 4 hojas creadas:
   - `Inventario_Casing` (pasillos 1.1, 1.2, 1.3)
   - `Inventario_AIB` (pasillo 1.4 — 78 equipos)
   - `Log_Sincronizacion`
   - `Configuracion`

### Desplegar como Web App (para que la app Android se conecte)

1. En el editor de Apps Script: **Deploy → New Deployment**
2. Tipo: **Web App**
3. Execute as: **Me**
4. Who has access: **Anyone**
5. Clic en **Deploy**
6. **Copia la URL** que aparece (algo como `https://script.google.com/macros/s/ABC.../exec`)

---

## PASO 2 — CONFIGURAR LA APP ANDROID

### Pegar la URL del Web App

Abre el archivo:
```
android-app/app/src/main/java/com/laguna/zapotal/data/remote/SheetsApiService.kt
```

Busca la línea:
```kotlin
const val SHEET_WEBAPP_URL = "https://script.google.com/macros/s/REEMPLAZA_ESTA_URL/exec"
```

Reemplaza `REEMPLAZA_ESTA_URL` con la URL que copiaste en el Paso 1.

### Abrir en Android Studio

1. Abre **Android Studio**
2. **File → Open** → selecciona la carpeta `android-app/`
3. Espera que Gradle sincronice (puede tardar 2-5 minutos la primera vez)
4. Conecta tu teléfono Android con cable USB
5. Activa **Opciones de desarrollador → Depuración USB** en tu teléfono
6. Clic en **Run ▶** (botón verde)

> **Nota:** La app funciona completamente sin internet desde el primer arranque.
> Los datos se cargan localmente. El sync con Google Sheets es opcional.

---

## PASO 3 — SUBIR A GITHUB (la app NO depende de GitHub)

> GitHub es solo para guardar el código fuente. El APK instalado en el teléfono
> funciona de forma completamente independiente.

```bash
# Desde la raíz del proyecto LagunaZapotal/
git init
git add .
git commit -m "feat: inventario Laguna Zapotal v1.0"

# Crea el repositorio en github.com (puede ser privado)
git remote add origin https://github.com/TU_USUARIO/laguna-zapotal.git
git push -u origin main
```

El archivo `.gitignore` ya excluye:
- Archivos de compilación (build/, .gradle/)
- Archivos locales de Android Studio (.idea/, *.iml)
- El APK generado
- Archivos de keystore (claves de firma — NUNCA subir al repo)

---

## FUNCIONALIDADES DE LA APP

### 🗺️ Plano (Tab 1)
- Vista 2D del terreno fiel al layout original
- Racks de casing con tubos azules (pasillos 1.1, 1.2, 1.3)
- Equipos AIB naranjas (pasillo 1.4)
- Puntos de color: 🟢 libre · 🟠 parcial/en uso · 🔴 lleno
- Tap en rack → abre detalle y formulario de edición

### 📋 Inventario (Tab 2)
- Lista completa de todos los racks
- Filtros por pasillo
- Edición directa de cada rack
- Cambios guardados inmediatamente en local

### 🔍 Búsqueda (Tab 3)

**Casing:**
- Buscar por **diámetro/medida** (ej: "9⅝", "7")
- Buscar por **peso** (ej: "47", "29")
- Ambos campos son independientes — uno solo ya filtra
- Resultado muestra: medida · peso · capacidad% · **UBICACIÓN exacta**

**Equipos AIB:**
- Buscar por **modelo** (ej: "GN-60HP")
- Buscar por **N° de serie** (ej: "SN-2024")
- Búsqueda cruzada: si escribes en N° serie con modelo vacío, busca en ambos
- Resultado muestra: modelo · N° serie · potencia · **UBICACIÓN exacta**

### 🔄 Sync (Tab 4)
- Estado de la última sincronización
- Botón de sync manual
- Sync automático cada 15 minutos (cuando hay internet)
- Indicador de racks pendientes de subir al Sheet

---

## MODIFICACIONES COMUNES

| ¿Qué quiero cambiar? | Archivo |
|---|---|
| URL del Google Sheet | `SheetsApiService.kt` → `SHEET_WEBAPP_URL` |
| Intervalo de sync automático | `SyncWorker.kt` → `INTERVALO_MINUTOS` |
| Colores de la app | `res/values/colors.xml` |
| Textos y etiquetas | `res/values/strings.xml` |
| Agregar un campo nuevo al rack | `RackEntity.kt` → incrementar versión en `AppDatabase.kt` |
| Agregar una pantalla | `nav_graph.xml` + nuevo Fragment + `bottom_nav_menu.xml` |
| Cambiar estructura del Sheet | `Setup_LagunaZapotal.gs` → re-ejecutar `setupCompleto()` |

---

## NOTAS TÉCNICAS

- **Sin internet**: Room/SQLite guarda todo localmente. La app es 100% funcional offline.
- **Con internet**: WorkManager sincroniza automáticamente en background.
- **Conflictos de sync**: gana el dato más reciente por timestamp.
- **La app NO depende de GitHub**: el APK instalado es autónomo.
- **Actualizar el APK**: genera un nuevo APK desde Android Studio → Build → Build APK.

---

*Proyecto: Laguna Zapotal — Inventario de Casing y Equipos AIB*
