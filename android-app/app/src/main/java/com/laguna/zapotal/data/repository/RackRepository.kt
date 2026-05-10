package com.laguna.zapotal.data.repository

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import androidx.lifecycle.LiveData
import com.laguna.zapotal.data.local.AppDatabase
import com.laguna.zapotal.data.local.entity.RackEntity
import com.laguna.zapotal.data.remote.PeticionActualizar
import com.laguna.zapotal.data.remote.PeticionBatch
import com.laguna.zapotal.data.remote.SheetsConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.time.Instant

// ================================================================
// RACKREPOSITORY.KT — Repositorio (Single Source of Truth)
// ================================================================
// Esta clase coordina la BD local (Room/SQLite) y la API remota
// (Google Sheets). La UI SOLO habla con el repositorio.
//
// Lógica híbrida offline/online:
//   - LECTURA: siempre desde la BD local (rápida, sin internet)
//   - ESCRITURA: guarda en BD local + marca pendienteSync=true
//   - SYNC: cuando hay internet, sube los cambios pendientes
//           y descarga los últimos datos del Sheet
// ================================================================

class RackRepository(private val context: Context) {

    private val dao     = AppDatabase.getInstance(context).rackDao()
    private val apiService = SheetsConfig.crearServicio()

    // ── LECTURAS (siempre locales, LiveData reactivo) ─────────────

    val todosLosRacks: LiveData<List<RackEntity>>    = dao.todosLosRacks()
    val racksCasing:   LiveData<List<RackEntity>>    = dao.raksCasing()
    val racksAIB:      LiveData<List<RackEntity>>    = dao.racksAIB()
    val casingLibres:  LiveData<Int>                 = dao.casingLibres()
    val casingLlenos:  LiveData<Int>                 = dao.casingLlenos()
    val aibLibres:     LiveData<Int>                 = dao.aibLibres()
    val aibEnUso:      LiveData<Int>                 = dao.aibEnUso()

    // ── BÚSQUEDAS ─────────────────────────────────────────────────

    /**
     * Busca racks de CASING por diámetro/medida Y/O peso.
     * Cualquier campo puede dejarse vacío para no filtrar por él.
     * Ej: buscarCasing("9⅝", "") → todos los 9⅝ sin importar peso
     *     buscarCasing("", "47") → todos los de 47 lb/ft
     *     buscarCasing("9⅝", "47") → solo los 9⅝ de 47 lb/ft
     */
    fun buscarCasing(medida: String, peso: String): LiveData<List<RackEntity>> =
        dao.buscarCasing(medida.trim(), peso.trim())

    /**
     * Búsqueda rápida de casing — un solo término, busca en medida y peso.
     * Útil para el campo de búsqueda rápida con un solo input.
     */
    fun buscarCasingRapido(termino: String): LiveData<List<RackEntity>> =
        dao.buscarCasingRapido(termino.trim())

    /**
     * Busca equipos AIB por MODELO y/o N° DE SERIE.
     * Ambos campos son opcionales e independientes.
     * Ej: buscarAIB("GN-60HP", "")      → todos los GN-60HP
     *     buscarAIB("", "SN-2024-0341") → busca por número de serie exacto
     *     buscarAIB("GN", "SN-2024")    → combina ambos filtros
     */
    fun buscarAIB(modelo: String, nserie: String): LiveData<List<RackEntity>> =
        dao.buscarAIB(modelo.trim(), nserie.trim())

    /**
     * Búsqueda unificada AIB — un solo término busca en MODELO o N° SERIE.
     * El usuario no necesita saber en cuál campo está el dato.
     */
    fun buscarAIBRapido(termino: String): LiveData<List<RackEntity>> =
        dao.buscarAIBRapido(termino.trim())

    // ── ESCRITURA LOCAL (funciona siempre, sin internet) ──────────

    /**
     * Actualiza un rack en la BD local y lo marca para sincronizar.
     * La UI siempre llama este método — el sync lo hace WorkManager aparte.
     */
    suspend fun actualizarRackLocal(rack: RackEntity) = withContext(Dispatchers.IO) {
        dao.actualizar(rack.copy(
            pendienteSync       = true,
            sincronizado        = false,
            ultimaActualizacion = Instant.now().toString()
        ))
    }

    // ── SINCRONIZACIÓN ────────────────────────────────────────────

    /**
     * Resultado de una operación de sincronización.
     * La UI muestra el mensaje al usuario.
     */
    sealed class ResultadoSync {
        data class Exito(val mensaje: String)  : ResultadoSync()
        data class Error(val mensaje: String)  : ResultadoSync()
        object SinConexion                     : ResultadoSync()
    }

    /**
     * SYNC COMPLETO — descarga el Sheet y sube los cambios pendientes.
     * Se llama desde SyncWorker (WorkManager) en background.
     */
    suspend fun sincronizarCompleto(): ResultadoSync = withContext(Dispatchers.IO) {
        if (!hayInternet()) return@withContext ResultadoSync.SinConexion

        try {
            // PASO 1: Subir cambios pendientes (offline → Sheet)
            val pendientes = dao.pendientesDeSync()
            if (pendientes.isNotEmpty()) {
                val lote = pendientes.map { rack ->
                    PeticionActualizar(
                        rack_id = rack.rackId,
                        campos  = construirCamposActualizar(rack)
                    )
                }
                val respBatch = apiService.syncBatch(PeticionBatch(racks = lote))
                if (respBatch.isSuccessful && respBatch.body()?.ok == true) {
                    // Marcar como sincronizados
                    pendientes.forEach { dao.actualizar(it.copy(pendienteSync = false, sincronizado = true)) }
                }
            }

            // PASO 2: Descargar últimos datos del Sheet (Sheet → local)
            val respTodo = apiService.leerTodo()
            if (respTodo.isSuccessful) {
                val body = respTodo.body()
                if (body?.ok == true) {
                    val todos = mutableListOf<RackEntity>()
                    body.casing.forEach { r ->
                        todos.add(RackEntity(
                            rackId              = r.rack_id,
                            pasillo             = r.pasillo,
                            fila                = r.fila,
                            numeroRack          = r.numero_rack,
                            tipo                = "casing",
                            estado              = r.estado,
                            medidaCasing        = r.medida_casing,
                            pesoLbft            = r.peso_lbft,
                            capacidadPct        = r.capacidad_pct,
                            observaciones       = r.observaciones,
                            ultimaActualizacion = r.ultima_actualizacion,
                            sincronizado        = true,
                            pendienteSync       = false
                        ))
                    }
                    body.aib.forEach { r ->
                        todos.add(RackEntity(
                            rackId              = r.rack_id,
                            pasillo             = r.pasillo,
                            fila                = r.fila,
                            numeroRack          = r.numero_rack,
                            tipo                = "aib",
                            estado              = r.estado,
                            modeloAib           = r.modelo_aib,
                            numeroSerie         = r.numero_serie,
                            potenciaHp          = r.potencia_hp,
                            observaciones       = r.observaciones,
                            ultimaActualizacion = r.ultima_actualizacion,
                            sincronizado        = true,
                            pendienteSync       = false
                        ))
                    }
                    dao.insertarTodos(todos)
                    return@withContext ResultadoSync.Exito(
                        "Sincronizado: ${body.casing.size} casing · ${body.aib.size} AIB"
                    )
                }
            }
            ResultadoSync.Error("El servidor no respondió correctamente")
        } catch (e: Exception) {
            ResultadoSync.Error("Error de red: ${e.message}")
        }
    }

    // Helper — construye el mapa de campos a enviar al Sheet
    private fun construirCamposActualizar(rack: RackEntity): Map<String, Any> {
        val campos = mutableMapOf<String, Any>(
            "estado"              to rack.estado,
            "ultima_actualizacion" to rack.ultimaActualizacion
        )
        if (rack.tipo == "casing") {
            rack.medidaCasing?.let  { campos["medida_casing"] = it }
            rack.pesoLbft?.let      { campos["peso_lbft"]     = it }
            campos["capacidad_pct"] = rack.capacidadPct
        } else {
            rack.modeloAib?.let    { campos["modelo_aib"]    = it }
            rack.numeroSerie?.let  { campos["numero_serie"]  = it }
            rack.potenciaHp?.let   { campos["potencia_hp"]   = it }
        }
        rack.observaciones?.let { campos["observaciones"] = it }
        return campos
    }

    // Verifica si hay conexión a internet activa
    fun hayInternet(): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps    = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}
