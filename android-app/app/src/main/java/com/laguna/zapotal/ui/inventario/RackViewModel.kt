package com.laguna.zapotal.ui.inventario

import android.app.Application
import androidx.lifecycle.*
import com.laguna.zapotal.data.local.entity.RackEntity
import com.laguna.zapotal.data.repository.RackRepository
import kotlinx.coroutines.launch

// ================================================================
// RACKVIEWMODEL.KT — ViewModel compartido por todos los fragments
// ================================================================
// Sobrevive a rotaciones de pantalla y actúa de intermediario
// entre la UI y el Repository. La UI solo observa LiveData aquí.
// ================================================================

class RackViewModel(application: Application) : AndroidViewModel(application) {

    private val repo = RackRepository(application)

    // ── DATOS GENERALES ───────────────────────────────────────────
    val racksCasing = repo.racksCasing
    val racksAIB    = repo.racksAIB
    val casingLibres = repo.casingLibres
    val casingLlenos = repo.casingLlenos
    val aibLibres    = repo.aibLibres
    val aibEnUso     = repo.aibEnUso

    // ── ESTADO DE SINCRONIZACIÓN (observado por la UI) ────────────
    private val _estadoSync = MutableLiveData<String>()
    val estadoSync: LiveData<String> = _estadoSync

    private val _haySincronizando = MutableLiveData(false)
    val haySincronizando: LiveData<Boolean> = _haySincronizando

    // ── BÚSQUEDA CASING ───────────────────────────────────────────
    // MutableLiveData con los términos de búsqueda actuales
    private val _filtroCasingMedida = MutableLiveData("")
    private val _filtroCasingPeso   = MutableLiveData("")

    // resultadosBusquedaCasing se recalcula cada vez que cambian los filtros
    val resultadosBusquedaCasing: LiveData<List<RackEntity>> =
        MediatorLiveData<List<RackEntity>>().apply {
            // Fuente reactiva: búsqueda por término rápido
            var fuente: LiveData<List<RackEntity>>? = null

            fun actualizar() {
                val medida = _filtroCasingMedida.value ?: ""
                val peso   = _filtroCasingPeso.value   ?: ""
                fuente?.let { removeSource(it) }
                fuente = repo.buscarCasing(medida, peso)
                addSource(fuente!!) { value = it }
            }

            addSource(_filtroCasingMedida) { actualizar() }
            addSource(_filtroCasingPeso)   { actualizar() }
            actualizar()
        }

    fun setBusquedaCasing(medida: String, peso: String) {
        _filtroCasingMedida.value = medida
        _filtroCasingPeso.value   = peso
    }

    // ── BÚSQUEDA AIB ──────────────────────────────────────────────
    private val _filtroAIBModelo = MutableLiveData("")
    private val _filtroAIBNSerie = MutableLiveData("")

    val resultadosBusquedaAIB: LiveData<List<RackEntity>> =
        MediatorLiveData<List<RackEntity>>().apply {
            var fuente: LiveData<List<RackEntity>>? = null

            fun actualizar() {
                val modelo = _filtroAIBModelo.value ?: ""
                val nserie = _filtroAIBNSerie.value ?: ""
                fuente?.let { removeSource(it) }
                fuente = repo.buscarAIB(modelo, nserie)
                addSource(fuente!!) { value = it }
            }

            addSource(_filtroAIBModelo) { actualizar() }
            addSource(_filtroAIBNSerie) { actualizar() }
            actualizar()
        }

    fun setBusquedaAIB(modelo: String, nserie: String) {
        _filtroAIBModelo.value = modelo
        _filtroAIBNSerie.value = nserie
    }

    // ── ACTUALIZAR UN RACK ────────────────────────────────────────
    fun guardarRack(rack: RackEntity) = viewModelScope.launch {
        repo.actualizarRackLocal(rack)
    }

    // ── SINCRONIZAR MANUALMENTE ───────────────────────────────────
    fun sincronizar() = viewModelScope.launch {
        _haySincronizando.value = true
        _estadoSync.value = "Sincronizando…"
        val resultado = repo.sincronizarCompleto()
        _estadoSync.value = when (resultado) {
            is RackRepository.ResultadoSync.Exito       -> "✓ ${resultado.mensaje}"
            is RackRepository.ResultadoSync.Error       -> "✗ ${resultado.mensaje}"
            is RackRepository.ResultadoSync.SinConexion -> "Sin conexión — datos guardados localmente"
        }
        _haySincronizando.value = false
    }

    fun hayInternet() = repo.hayInternet()
}

// Factory necesario para pasar Application al ViewModel
class RackViewModelFactory(private val app: Application) : ViewModelProvider.Factory {
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        @Suppress("UNCHECKED_CAST")
        return RackViewModel(app) as T
    }
}
