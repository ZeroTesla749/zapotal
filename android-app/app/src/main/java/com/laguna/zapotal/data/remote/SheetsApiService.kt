package com.laguna.zapotal.data.remote

import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*

// ================================================================
// SHEETSAPISERVICE.KT — Cliente HTTP para Google Sheets Web App
// ================================================================
// Retrofit genera automáticamente el código de red a partir de esta
// interfaz. Todas las llamadas son suspend (corrutinas) para no
// bloquear el hilo principal de la UI.
// ================================================================

// ── MODELOS DE DATOS (Request / Response) ────────────────────────

data class RackRemoto(
    val rack_id:              String  = "",
    val pasillo:              String  = "",
    val fila:                 String  = "",
    val numero_rack:          String  = "",
    val estado:               String  = "libre",
    // Casing
    val medida_casing:        String? = null,
    val peso_lbft:            String? = null,
    val capacidad_pct:        Int     = 0,
    // AIB
    val modelo_aib:           String? = null,
    val numero_serie:         String? = null,
    val potencia_hp:          String? = null,
    // Comunes
    val observaciones:        String? = null,
    val ultima_actualizacion: String  = "",
    val sincronizado:         Boolean = false
)

data class RespuestaTodo(
    val ok:     Boolean,
    val casing: List<RackRemoto> = emptyList(),
    val aib:    List<RackRemoto> = emptyList(),
    val config: Map<String, String> = emptyMap()
)

data class RespuestaSimple(
    val ok:      Boolean,
    val mensaje: String? = null,
    val error:   String? = null
)

data class PeticionActualizar(
    val accion:      String = "actualizar_rack",
    val rack_id:     String,
    val campos:      Map<String, Any>,
    val dispositivo: String = android.os.Build.MODEL
)

data class PeticionBatch(
    val accion: String = "sync_batch",
    val racks:  List<PeticionActualizar>
)

data class RespuestaBatch(
    val ok:         Boolean,
    val procesados: Int     = 0,
    val errores:    Int     = 0
)

// ── INTERFAZ RETROFIT ────────────────────────────────────────────

interface SheetsApiService {

    // GET — Verificar que el Web App esté activo
    @GET(".")
    suspend fun ping(
        @Query("accion") accion: String = "ping"
    ): Response<RespuestaSimple>

    // GET — Descargar todo el inventario (casing + AIB + config)
    @GET(".")
    suspend fun leerTodo(
        @Query("accion") accion: String = "leer_todo"
    ): Response<RespuestaTodo>

    // POST — Actualizar un rack individual
    @POST(".")
    suspend fun actualizarRack(
        @Body peticion: PeticionActualizar
    ): Response<RespuestaSimple>

    // POST — Sincronizar lote de racks modificados offline
    @POST(".")
    suspend fun syncBatch(
        @Body peticion: PeticionBatch
    ): Response<RespuestaBatch>
}

// ── CONFIGURACIÓN DE RETROFIT ─────────────────────────────────────

object SheetsConfig {

    // ◄◄◄ PEGA AQUÍ LA URL DE TU GOOGLE APPS SCRIPT WEB APP ◄◄◄
    // Obtenla en: Apps Script → Deploy → New Deployment → Web App → Copy URL
    // Ejemplo: "https://script.google.com/macros/s/AKfycby.../exec"
    const val SHEET_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzVaE35-yQX1fAuRmxEEIRwnn8-h1vEq9zh4JxMP9Tfq1mpDGrgUBUXV6MX7iYx4AFi/exec"

    // Tiempo máximo de espera para las peticiones de red (segundos)
    const val TIMEOUT_SEGUNDOS = 30L

    fun crearServicio(): SheetsApiService {
        val okHttp = okhttp3.OkHttpClient.Builder()
            .connectTimeout(TIMEOUT_SEGUNDOS, java.util.concurrent.TimeUnit.SECONDS)
            .readTimeout(TIMEOUT_SEGUNDOS, java.util.concurrent.TimeUnit.SECONDS)
            // En debug, loggea todas las peticiones HTTP en Logcat
            .addInterceptor(okhttp3.logging.HttpLoggingInterceptor().apply {
                level = okhttp3.logging.HttpLoggingInterceptor.Level.BODY
            })
            // Interceptor para seguir redirecciones (Google Apps Script las usa)
            .followRedirects(true)
            .followSslRedirects(true)
            .build()

        return Retrofit.Builder()
            .baseUrl(SHEET_WEBAPP_URL)
            .client(okHttp)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(SheetsApiService::class.java)
    }
}
