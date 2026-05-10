package com.laguna.zapotal.data.local.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

// ================================================================
// RACKENTITY.KT — Entidad Room (tabla SQLite local)
// ================================================================
// Una sola tabla guarda TANTO casing como AIB.
// Los campos exclusivos de cada tipo se dejan null cuando no aplican.
//
// ► Para agregar un campo nuevo:
//   1. Agrégalo aquí con su tipo y valor por defecto
//   2. Incrementa la versión de la BD en AppDatabase.kt (version = X)
//   3. Escribe la migración en AppDatabase.MIGRATION_X_Y
//   4. Agrega el campo en el Google Sheet (Setup_LagunaZapotal.gs)
// ================================================================

@Entity(tableName = "racks")
data class RackEntity(

    // ── IDENTIFICACIÓN (comunes a casing y AIB) ─────────────────
    @PrimaryKey
    val rackId: String,          // Ej: "P11A_R01", "P14_R23"

    val pasillo: String,         // "1.1", "1.2", "1.3" → casing | "1.4" → AIB
    val fila: String,            // "A", "B", "C" para casing | fila Y original para AIB
    val numeroRack: String,      // "R01" … "R78"
    val tipo: String,            // "casing" | "aib"

    val estado: String = "libre",
    // Casing: "libre" | "parcial" | "lleno"
    // AIB:    "libre" | "en_uso"  | "en_mantenimiento"

    // ── CAMPOS EXCLUSIVOS DE CASING ──────────────────────────────
    val medidaCasing: String? = null,   // Ej: 9⅝" · 47 lb/ft · N80
    val pesoLbft: String?     = null,   // Ej: "47"
    val capacidadPct: Int     = 0,      // 0–100 %

    // ── CAMPOS EXCLUSIVOS DE AIB ─────────────────────────────────
    val modeloAib: String?    = null,   // Ej: GN-60HP Series A
    val numeroSerie: String?  = null,   // Ej: SN-2024-0341
    val potenciaHp: String?   = null,   // Ej: "60"

    // ── CAMPOS COMUNES ───────────────────────────────────────────
    val observaciones: String? = null,

    // Control de sincronización
    val ultimaActualizacion: String = "",   // ISO 8601
    val pendienteSync: Boolean = false,     // true = modificado offline, pendiente subir al Sheet
    val sincronizado: Boolean  = false
)
