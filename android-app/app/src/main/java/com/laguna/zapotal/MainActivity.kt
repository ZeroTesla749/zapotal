package com.laguna.zapotal

import android.app.Application
import android.os.Bundle
import android.view.MenuItem
import androidx.appcompat.app.AppCompatActivity
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.google.android.material.bottomnavigation.BottomNavigationView
import com.laguna.zapotal.ui.sync.SyncWorker

// ================================================================
// LAGUNAAPP.KT — Clase Application (punto de entrada de la app)
// ================================================================
// Se ejecuta UNA VEZ cuando la app arranca.
// Aquí se inicia el sync periódico en background.
// ================================================================

class LagunaApp : Application() {
    override fun onCreate() {
        super.onCreate()
        // Programa la sincronización automática cada 15 minutos
        // (solo cuando hay internet, WorkManager se encarga del resto)
        SyncWorker.programarSyncPeriodico(this)
    }
}


// ================================================================
// MAINACTIVITY.KT — Única Activity de la app
// ================================================================
// Contiene el NavHostFragment y el BottomNavigationView.
// La navegación entre pantallas se hace con Navigation Component.
//
// Pantallas (Fragments):
//   1. Plano       — vista 2D del layout con todos los racks
//   2. Inventario  — lista completa con edición rack por rack
//   3. Búsqueda    — búsqueda por casing (diámetro+peso) o AIB (modelo+serie)
//   4. Sync        — estado de sincronización con Google Sheets
// ================================================================

class MainActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        // Conectar BottomNavigation con NavController
        val navHost = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as NavHostFragment
        val navController = navHost.navController

        val bottomNav = findViewById<BottomNavigationView>(R.id.bottom_nav)
        bottomNav.setupWithNavController(navController)
    }
}
