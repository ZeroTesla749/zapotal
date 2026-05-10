package com.laguna.zapotal.data.local

import android.content.Context
import androidx.room.*
import androidx.sqlite.db.SupportSQLiteDatabase
import com.laguna.zapotal.data.local.dao.RackDao
import com.laguna.zapotal.data.local.entity.RackEntity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

// ================================================================
// APPDATABASE.KT — Base de datos local Room (SQLite)
// ================================================================
// Singleton que gestiona la BD local. Todos los datos del inventario
// se guardan aquí en el teléfono y funcionan SIN INTERNET.
//
// ► IMPORTANTE — Cuando agregues columnas a RackEntity:
//   1. Incrementa el número de version (ej: version = 2)
//   2. Agrega la migración MIGRATION_1_2 con el ALTER TABLE
//   3. Agrégala al array de migrations en databaseBuilder()
// ================================================================

@Database(
    entities  = [RackEntity::class],
    version   = 1,          // ◄ Incrementar al cambiar el esquema
    exportSchema = true     // Exporta el esquema a /schemas para control de versiones
)
abstract class AppDatabase : RoomDatabase() {

    abstract fun rackDao(): RackDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        // Obtiene la instancia única de la BD (patrón Singleton)
        fun getInstance(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "laguna_zapotal.db"   // ◄ Nombre del archivo de BD en el dispositivo
                )
                // ── MIGRACIONES ───────────────────────────────────
                // Cuando cambies el schema, agrega migraciones aquí
                // en lugar de usar fallbackToDestructiveMigration()
                // (que borraría todos los datos).
                //
                // Ejemplo de migración futura:
                // .addMigrations(MIGRATION_1_2)
                //
                .addCallback(PoblarDatosIniciales())  // Carga racks al instalar
                .build()
                .also { INSTANCE = it }
            }
        }

        // ── EJEMPLO DE MIGRACIÓN (para referencia futura) ─────────
        // val MIGRATION_1_2 = object : Migration(1, 2) {
        //     override fun migrate(db: SupportSQLiteDatabase) {
        //         // Agrega una columna nueva sin borrar datos
        //         db.execSQL("ALTER TABLE racks ADD COLUMN fecha_ingreso TEXT DEFAULT ''")
        //     }
        // }

        // ── DATOS INICIALES ───────────────────────────────────────
        // Se ejecuta UNA SOLA VEZ al crear la BD por primera vez.
        // Carga todos los racks del layout en estado "libre".
        // Cuando el usuario sincronice con Google Sheets, se actualizarán.
        private class PoblarDatosIniciales : RoomDatabase.Callback() {
            override fun onCreate(db: SupportSQLiteDatabase) {
                super.onCreate(db)
                CoroutineScope(Dispatchers.IO).launch {
                    INSTANCE?.rackDao()?.insertarTodos(generarRacksIniciales())
                }
            }
        }

        // Genera la lista completa de racks con la distribución del layout
        fun generarRacksIniciales(): List<RackEntity> {
            val racks = mutableListOf<RackEntity>()
            val ts = System.currentTimeMillis().toString()

            // ── PASILLO 1.1 — Casing ──────────────────────────────
            for (i in 1..8)  racks.add(casing("P11A", "1.1", "A", i, ts))
            for (i in 9..16) racks.add(casing("P11B", "1.1", "B", i, ts))

            // ── PASILLO 1.2 — Casing ──────────────────────────────
            for (i in 1..8)  racks.add(casing("P12A", "1.2", "A", i, ts))
            for (i in 9..16) racks.add(casing("P12B", "1.2", "B", i, ts))

            // ── PASILLO 1.3 — Casing ──────────────────────────────
            for (i in 1..6)  racks.add(casing("P13A", "1.3", "A", i, ts))
            for (i in 7..11) racks.add(casing("P13B", "1.3", "B", i, ts))
            for (i in 12..18)racks.add(casing("P13C", "1.3", "C", i, ts))

            // ── PASILLO 1.4 — AIB ─────────────────────────────────
            // Filas en el mismo orden que el layout HTML original
            val filasAIB = listOf(
                "460" to 66,   // R66–R78 (fila superior)
                "540" to 53,
                "580" to 40,
                "680" to 27,
                "720" to 14,
                "820" to 1     // R01–R13 (fila inferior)
            )
            filasAIB.forEach { (filaY, inicio) ->
                for (col in 0 until 13) {
                    val n = inicio + col
                    val numStr = n.toString().padStart(2, '0')
                    racks.add(RackEntity(
                        rackId   = "P14_R$numStr",
                        pasillo  = "1.4",
                        fila     = filaY,         // posición Y del layout para referencia visual
                        numeroRack = "R$numStr",
                        tipo     = "aib",
                        ultimaActualizacion = ts
                    ))
                }
            }
            return racks
        }

        // Helper para crear un rack de casing
        private fun casing(prefijo: String, pasillo: String, fila: String, num: Int, ts: String): RackEntity {
            val numStr = num.toString().padStart(2, '0')
            return RackEntity(
                rackId   = "${prefijo}_R$numStr",
                pasillo  = pasillo,
                fila     = fila,
                numeroRack = "R$numStr",
                tipo     = "casing",
                ultimaActualizacion = ts
            )
        }
    }
}
