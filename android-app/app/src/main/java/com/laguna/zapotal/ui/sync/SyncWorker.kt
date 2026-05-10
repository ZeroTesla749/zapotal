package com.laguna.zapotal.ui.sync

import android.content.Context
import androidx.work.*
import com.laguna.zapotal.data.repository.RackRepository
import java.util.concurrent.TimeUnit

// ================================================================
// SYNCWORKER.KT — Sincronización automática en background
// ================================================================
// WorkManager ejecuta este Worker periódicamente aunque la app
// esté cerrada. Solo sincroniza cuando hay internet disponible
// (constraint NET_CONNECTED).
//
// ► Para cambiar el intervalo: edita INTERVALO_MINUTOS
// ► Para desactivar sync automático: comenta la llamada a
//   programarSyncPeriodico() en LagunaApp.kt
// ================================================================

class SyncWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {

    companion object {
        // Nombre único de la tarea periódica — NO cambiar (se usa para cancelar/reprogramar)
        const val NOMBRE_TRABAJO = "sync_laguna_zapotal"

        // Intervalo de sincronización automática en minutos
        // WorkManager tiene un mínimo de 15 minutos por restricciones del SO
        const val INTERVALO_MINUTOS = 15L

        /**
         * Programa la sincronización periódica.
         * Llama esto UNA VEZ al iniciar la app (desde LagunaApp.kt).
         * Si ya existe una tarea con este nombre, WorkManager la reutiliza
         * (no crea duplicados).
         */
        fun programarSyncPeriodico(context: Context) {
            // Solo ejecutar cuando hay conexión a internet
            val restricciones = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val peticion = PeriodicWorkRequestBuilder<SyncWorker>(
                INTERVALO_MINUTOS, TimeUnit.MINUTES
            )
                .setConstraints(restricciones)
                // Reintentar con backoff exponencial si falla (ej: servidor caído)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 5, TimeUnit.MINUTES)
                .addTag("sync_sheets")
                .build()

            WorkManager.getInstance(context).enqueueUniquePeriodicWork(
                NOMBRE_TRABAJO,
                ExistingPeriodicWorkPolicy.KEEP,  // No reemplaza si ya existe
                peticion
            )
        }

        /**
         * Fuerza una sincronización inmediata (llamada desde el botón Sync en la UI).
         * No reemplaza la tarea periódica.
         */
        fun sincronizarAhora(context: Context) {
            val restricciones = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val peticion = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(restricciones)
                .addTag("sync_manual")
                .build()

            WorkManager.getInstance(context).enqueue(peticion)
        }
    }

    // Se ejecuta en un hilo de background
    override suspend fun doWork(): Result {
        val repo = RackRepository(applicationContext)
        return when (val resultado = repo.sincronizarCompleto()) {
            is RackRepository.ResultadoSync.Exito -> {
                android.util.Log.i("SyncWorker", "✓ ${resultado.mensaje}")
                Result.success()
            }
            is RackRepository.ResultadoSync.Error -> {
                android.util.Log.e("SyncWorker", "✗ ${resultado.mensaje}")
                Result.retry()  // WorkManager reintentará con backoff
            }
            is RackRepository.ResultadoSync.SinConexion -> {
                android.util.Log.w("SyncWorker", "Sin conexión, se reintentará")
                Result.retry()
            }
        }
    }
}
