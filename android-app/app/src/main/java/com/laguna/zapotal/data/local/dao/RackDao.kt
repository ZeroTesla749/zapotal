package com.laguna.zapotal.data.local.dao

import androidx.lifecycle.LiveData
import androidx.room.*
import com.laguna.zapotal.data.local.entity.RackEntity

// ================================================================
// RACKDAO.KT — Data Access Object (Room)
// ================================================================
// Todas las consultas a la base de datos local SQLite.
// Room genera el código SQL automáticamente a partir de las anotaciones.
//
// ► Para agregar una nueva consulta:
//   1. Agrega un método con @Query("SELECT ...")
//   2. Usa LiveData<List<T>> para que la UI se actualice automáticamente
//   3. Usa suspend fun para operaciones de escritura (corrutinas)
// ================================================================

@Dao
interface RackDao {

    // ── INSERCIÓN Y ACTUALIZACIÓN ─────────────────────────────────

    // Inserta o reemplaza racks (usado al sincronizar desde el Sheet)
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertarTodos(racks: List<RackEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertar(rack: RackEntity)

    // Actualiza un rack existente
    @Update
    suspend fun actualizar(rack: RackEntity)

    // ── LECTURAS GENERALES ────────────────────────────────────────

    // Todos los racks — LiveData: la UI se refresca automáticamente
    @Query("SELECT * FROM racks ORDER BY pasillo, fila, numeroRack")
    fun todosLosRacks(): LiveData<List<RackEntity>>

    // Solo los racks de casing (pasillos 1.1, 1.2, 1.3)
    @Query("SELECT * FROM racks WHERE tipo = 'casing' ORDER BY pasillo, fila, numeroRack")
    fun raksCasing(): LiveData<List<RackEntity>>

    // Solo los equipos AIB (pasillo 1.4)
    @Query("SELECT * FROM racks WHERE tipo = 'aib' ORDER BY fila, numeroRack")
    fun racksAIB(): LiveData<List<RackEntity>>

    // Un rack específico por ID
    @Query("SELECT * FROM racks WHERE rackId = :id LIMIT 1")
    suspend fun porId(id: String): RackEntity?

    // Racks pendientes de sincronizar (modificados offline)
    @Query("SELECT * FROM racks WHERE pendienteSync = 1")
    suspend fun pendientesDeSync(): List<RackEntity>

    // ── BÚSQUEDA DE CASING ────────────────────────────────────────
    // Busca por DIÁMETRO (medida) y/o PESO del casing.
    // El operador LIKE con % busca coincidencias parciales.
    // Ej: buscar "9" encuentra "9⅝"", "9-5/8"", etc.
    // Ej: buscar "47" en peso encuentra "47 lb/ft"

    @Query("""
        SELECT * FROM racks
        WHERE tipo = 'casing'
        AND (
            (:medida = '' OR medidaCasing LIKE '%' || :medida || '%')
            AND
            (:peso   = '' OR pesoLbft     LIKE '%' || :peso   || '%')
        )
        ORDER BY pasillo, fila, numeroRack
    """)
    fun buscarCasing(medida: String, peso: String): LiveData<List<RackEntity>>

    // Búsqueda rápida de casing con un solo término (busca en medida Y peso)
    @Query("""
        SELECT * FROM racks
        WHERE tipo = 'casing'
        AND (
            medidaCasing LIKE '%' || :termino || '%'
            OR pesoLbft  LIKE '%' || :termino || '%'
            OR observaciones LIKE '%' || :termino || '%'
        )
        ORDER BY pasillo, fila, numeroRack
    """)
    fun buscarCasingRapido(termino: String): LiveData<List<RackEntity>>

    // ── BÚSQUEDA DE AIB ───────────────────────────────────────────
    // Busca por MODELO y/o N° DE SERIE del equipo AIB.
    // Ambos campos son opcionales — si se deja vacío no filtra por ese campo.

    @Query("""
        SELECT * FROM racks
        WHERE tipo = 'aib'
        AND (
            (:modelo  = '' OR modeloAib    LIKE '%' || :modelo  || '%')
            AND
            (:nserie  = '' OR numeroSerie  LIKE '%' || :nserie  || '%')
        )
        ORDER BY fila, numeroRack
    """)
    fun buscarAIB(modelo: String, nserie: String): LiveData<List<RackEntity>>

    // Búsqueda unificada AIB — busca el término en MODELO o N° SERIE simultáneamente
    // Útil cuando el usuario no sabe exactamente en cuál campo está el dato
    @Query("""
        SELECT * FROM racks
        WHERE tipo = 'aib'
        AND (
            modeloAib   LIKE '%' || :termino || '%'
            OR numeroSerie LIKE '%' || :termino || '%'
            OR potenciaHp  LIKE '%' || :termino || '%'
            OR observaciones LIKE '%' || :termino || '%'
        )
        ORDER BY fila, numeroRack
    """)
    fun buscarAIBRapido(termino: String): LiveData<List<RackEntity>>

    // ── ESTADÍSTICAS ──────────────────────────────────────────────

    @Query("SELECT COUNT(*) FROM racks WHERE tipo = 'casing' AND estado = 'libre'")
    fun casingLibres(): LiveData<Int>

    @Query("SELECT COUNT(*) FROM racks WHERE tipo = 'casing' AND estado = 'lleno'")
    fun casingLlenos(): LiveData<Int>

    @Query("SELECT COUNT(*) FROM racks WHERE tipo = 'aib' AND estado = 'libre'")
    fun aibLibres(): LiveData<Int>

    @Query("SELECT COUNT(*) FROM racks WHERE tipo = 'aib' AND estado = 'en_uso'")
    fun aibEnUso(): LiveData<Int>
}
