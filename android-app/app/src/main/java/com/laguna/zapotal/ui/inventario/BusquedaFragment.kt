package com.laguna.zapotal.ui.inventario

import android.os.Bundle
import android.text.Editable
import android.text.TextWatcher
import android.view.*
import android.widget.*
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import com.laguna.zapotal.R
import com.laguna.zapotal.data.local.entity.RackEntity
import com.laguna.zapotal.databinding.FragmentBusquedaBinding

// ================================================================
// BUSQUEDAFRAGMENT.KT — Pantalla de búsqueda
// ================================================================
// Dos tabs: uno para buscar Casing y otro para buscar AIB.
// Cada resultado muestra la UBICACIÓN exacta en el plano.
// ================================================================

class BusquedaFragment : Fragment() {

    private var _binding: FragmentBusquedaBinding? = null
    private val binding get() = _binding!!
    private val vm: RackViewModel by activityViewModels()

    // Adaptadores de la lista de resultados
    private lateinit var adapterCasing: ResultadosAdapter
    private lateinit var adapterAIB:    ResultadosAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentBusquedaBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        configurarAdaptadores()
        configurarBusquedaCasing()
        configurarBusquedaAIB()
        configurarTabs()
    }

    // ── BÚSQUEDA DE CASING ────────────────────────────────────────

    private fun configurarBusquedaCasing() {
        // Observa los resultados y actualiza la lista en tiempo real
        vm.resultadosBusquedaCasing.observe(viewLifecycleOwner) { racks ->
            adapterCasing.setDatos(racks)
            // Muestra un mensaje cuando no hay resultados
            binding.tvSinResultadosCasing.visibility =
                if (racks.isEmpty()) View.VISIBLE else View.GONE
        }

        // Campo: Diámetro / Medida del casing
        binding.etBuscarMedida.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { lanzarBusquedaCasing() }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        // Campo: Peso del casing
        binding.etBuscarPeso.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { lanzarBusquedaCasing() }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        // Botón limpiar
        binding.btnLimpiarCasing.setOnClickListener {
            binding.etBuscarMedida.text?.clear()
            binding.etBuscarPeso.text?.clear()
        }
    }

    private fun lanzarBusquedaCasing() {
        val medida = binding.etBuscarMedida.text?.toString() ?: ""
        val peso   = binding.etBuscarPeso.text?.toString()   ?: ""
        vm.setBusquedaCasing(medida, peso)
    }

    // ── BÚSQUEDA DE AIB ───────────────────────────────────────────

    private fun configurarBusquedaAIB() {
        vm.resultadosBusquedaAIB.observe(viewLifecycleOwner) { racks ->
            adapterAIB.setDatos(racks)
            binding.tvSinResultadosAIB.visibility =
                if (racks.isEmpty()) View.VISIBLE else View.GONE
        }

        // Campo: Modelo del AIB
        binding.etBuscarModelo.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { lanzarBusquedaAIB() }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        // Campo: N° de Serie del AIB
        // Este campo busca en AMBOS campos (modelo y serie) si el de modelo está vacío
        binding.etBuscarNSerie.addTextChangedListener(object : TextWatcher {
            override fun afterTextChanged(s: Editable?) { lanzarBusquedaAIB() }
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
        })

        binding.btnLimpiarAIB.setOnClickListener {
            binding.etBuscarModelo.text?.clear()
            binding.etBuscarNSerie.text?.clear()
        }
    }

    private fun lanzarBusquedaAIB() {
        val modelo = binding.etBuscarModelo.text?.toString() ?: ""
        val nserie = binding.etBuscarNSerie.text?.toString() ?: ""
        vm.setBusquedaAIB(modelo, nserie)
    }

    // ── TABS (Casing / AIB) ───────────────────────────────────────

    private fun configurarTabs() {
        binding.tabLayout.addOnTabSelectedListener(object : com.google.android.material.tabs.TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: com.google.android.material.tabs.TabLayout.Tab?) {
                when (tab?.position) {
                    0 -> { // Tab Casing
                        binding.sectionCasing.visibility = View.VISIBLE
                        binding.sectionAIB.visibility    = View.GONE
                    }
                    1 -> { // Tab AIB
                        binding.sectionCasing.visibility = View.GONE
                        binding.sectionAIB.visibility    = View.VISIBLE
                    }
                }
            }
            override fun onTabUnselected(tab: com.google.android.material.tabs.TabLayout.Tab?) {}
            override fun onTabReselected(tab: com.google.android.material.tabs.TabLayout.Tab?) {}
        })
        // Mostrar casing por defecto
        binding.sectionCasing.visibility = View.VISIBLE
        binding.sectionAIB.visibility    = View.GONE
    }

    private fun configurarAdaptadores() {
        adapterCasing = ResultadosAdapter(tipo = "casing")
        adapterAIB    = ResultadosAdapter(tipo = "aib")
        binding.rvResultadosCasing.adapter = adapterCasing
        binding.rvResultadosAIB.adapter    = adapterAIB
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

// ================================================================
// RESULTADOSADAPTER — Adaptador para la lista de resultados
// ================================================================
// Muestra cada rack con sus datos y la UBICACIÓN en el plano.
// La ubicación se construye a partir del pasillo, fila y número.

class ResultadosAdapter(private val tipo: String) :
    androidx.recyclerview.widget.RecyclerView.Adapter<ResultadosAdapter.VH>() {

    private var datos: List<RackEntity> = emptyList()

    fun setDatos(nuevos: List<RackEntity>) {
        datos = nuevos
        notifyDataSetChanged()
    }

    inner class VH(val view: View) : androidx.recyclerview.widget.RecyclerView.ViewHolder(view) {
        // Referencias a las vistas de cada ítem de resultado
        val tvTitulo:    TextView = view.findViewById(R.id.tv_resultado_titulo)
        val tvDetalle:   TextView = view.findViewById(R.id.tv_resultado_detalle)
        val tvUbicacion: TextView = view.findViewById(R.id.tv_resultado_ubicacion)
        val tvEstado:    TextView = view.findViewById(R.id.tv_resultado_estado)
        val ivEstado:    View     = view.findViewById(R.id.iv_estado_dot)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_resultado_busqueda, parent, false)
        return VH(v)
    }

    override fun getItemCount() = datos.size

    override fun onBindViewHolder(holder: VH, position: Int) {
        val rack = datos[position]

        if (tipo == "casing") {
            // ── RESULTADO CASING ──────────────────────────────────
            holder.tvTitulo.text = rack.numeroRack

            // Detalle con medida y peso
            val medida = rack.medidaCasing ?: "Sin medida"
            val peso   = rack.pesoLbft?.let { "$it lb/ft" } ?: "Sin peso"
            holder.tvDetalle.text = "$medida · $peso\nCapacidad: ${rack.capacidadPct}%"

            // Ubicación descriptiva en el plano
            holder.tvUbicacion.text = construirUbicacionCasing(rack)

            // Color de estado
            holder.tvEstado.text = rack.estado.replaceFirstChar { it.uppercase() }
            holder.ivEstado.setBackgroundColor(colorEstado(rack.estado, holder.view.context))

        } else {
            // ── RESULTADO AIB ─────────────────────────────────────
            val modelo = rack.modeloAib   ?: "Sin modelo"
            val nserie = rack.numeroSerie ?: "Sin N° serie"
            val hp     = rack.potenciaHp?.let { "$it HP" } ?: ""

            holder.tvTitulo.text  = rack.numeroRack
            holder.tvDetalle.text = "Modelo: $modelo\nN° Serie: $nserie" +
                if (hp.isNotEmpty()) "\nPotencia: $hp" else ""

            // Ubicación descriptiva en el plano para AIB
            holder.tvUbicacion.text = construirUbicacionAIB(rack)

            holder.tvEstado.text = when (rack.estado) {
                "en_uso"           -> "En uso"
                "en_mantenimiento" -> "Mantenimiento"
                else               -> "Libre"
            }
            holder.ivEstado.setBackgroundColor(colorEstado(rack.estado, holder.view.context))
        }
    }

    // ── CONSTRUCCIÓN DE UBICACIÓN ─────────────────────────────────

    /**
     * Genera una descripción legible de la ubicación del rack de casing.
     * Ej: "Pasillo 1.1 · Fila A (parte superior) · Rack R05"
     */
    private fun construirUbicacionCasing(rack: RackEntity): String {
        val nombreFila = when (rack.fila) {
            "A" -> "Fila A — parte superior del patio"
            "B" -> "Fila B — parte inferior del patio"
            "C" -> "Fila C — bloque inferior"
            else -> "Fila ${rack.fila}"
        }
        val nombrePasillo = when (rack.pasillo) {
            "1.1" -> "Pasillo 1.1 (Patio superior derecho)"
            "1.2" -> "Pasillo 1.2 (Patio central derecho)"
            "1.3" -> "Pasillo 1.3 (Patio inferior derecho)"
            else  -> "Pasillo ${rack.pasillo}"
        }
        return "📍 $nombrePasillo\n    $nombreFila · ${rack.numeroRack}"
    }

    /**
     * Genera la ubicación del equipo AIB en el Pasillo 1.4.
     * Usa la posición Y original del layout para indicar la fila.
     * Ej: "Pasillo 1.4 · Fila superior (Y=460) · Rack R66"
     */
    private fun construirUbicacionAIB(rack: RackEntity): String {
        val descripcionFila = when (rack.fila) {
            "460" -> "Fila 1 — superior del pasillo 1.4"
            "540" -> "Fila 2"
            "580" -> "Fila 3"
            "680" -> "Fila 4"
            "720" -> "Fila 5"
            "820" -> "Fila 6 — inferior del pasillo 1.4"
            else  -> "Fila ${rack.fila}"
        }
        return "📍 Pasillo 1.4 (Equipos AIB)\n    $descripcionFila · ${rack.numeroRack}"
    }

    private fun colorEstado(estado: String, context: android.content.Context): Int {
        return when (estado) {
            "lleno", "en_uso"           -> android.graphics.Color.parseColor("#E04040")
            "parcial", "en_mantenimiento" -> android.graphics.Color.parseColor("#E09000")
            else                          -> android.graphics.Color.parseColor("#2DAA66")
        }
    }
}
