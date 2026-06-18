// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-CAMARAS.JS  v2
// Gestión de cámaras: detección, asignación, etiquetas,
// visibilidad individual y layout del overlay.
// ═══════════════════════════════════════════════════════════════

// ── Configuración por defecto ────────────────────────────────────
// Hasta 4 slots de cámara. Cada slot puede estar activo o no.
const CAM_SLOTS_MAX = 4;

// Estado de cámaras (se sincroniza al overlay via core.js)
// Se inicializa en initCamaras()
let camState = {
  layout: 'full-2',   // '1-centro' | '2-lados' | '3-split' | '4-esquinas'
  slots: []            // array de objetos slot (ver initCamaras)
};

// Streams activos por slot (no se serializa al overlay)
const camStreams = {};

// Dispositivos de cámara disponibles
let camDispositivos = [];

// ═══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════

function initCamaras() {
  // Crear slots por defecto
  camState.slots = Array.from({ length: CAM_SLOTS_MAX }, (_, i) => ({
    id:       i,
    activo:   i < 2,           // los dos primeros activos por defecto
    deviceId: null,
    etiqueta: i === 0 ? 'Presentador' : i === 1 ? 'Concursante' : `Cámara ${i + 1}`,
    visible:  true,
  }));

  renderLayoutPicker();
  renderSlotsPanel();
  detectarCamaras();
  aplicarLayoutUI(camState.layout);
}

// ═══════════════════════════════════════════════════════════════
// DETECCIÓN DE CÁMARAS
// ═══════════════════════════════════════════════════════════════

async function detectarCamaras() {
  try {
    // Pedir permisos si no los tenemos aún
    await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => {});
    const devices = await navigator.mediaDevices.enumerateDevices();
    camDispositivos = devices.filter(d => d.kind === 'videoinput');
    renderSelects();
    toast(`${camDispositivos.length} cámara(s) detectada(s)`, 'ok');
  } catch (err) {
    toast('No se pudo acceder a las cámaras.', 'error');
    console.error(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// RENDER DEL PANEL
// ═══════════════════════════════════════════════════════════════

function renderSlotsPanel() {
  const contenedor = document.getElementById('cam-slots-container');
  if (!contenedor) return;

  contenedor.innerHTML = camState.slots.map((slot, i) => `
    <div class="cam-slot-card ${slot.activo ? '' : 'inactivo'}" id="cam-slot-card-${i}">

      <!-- Cabecera del slot -->
      <div class="cam-slot-header">
        <div class="cam-slot-num">CAM ${i + 1}</div>
        <label class="cam-toggle-wrap" title="${slot.activo ? 'Desactivar slot' : 'Activar slot'}">
          <input type="checkbox" class="cam-toggle-check" ${slot.activo ? 'checked' : ''}
            onchange="camToggleSlot(${i}, this.checked)">
          <span class="cam-toggle-track">
            <span class="cam-toggle-thumb"></span>
          </span>
        </label>
      </div>

      <!-- Contenido del slot (solo si activo) -->
      <div class="cam-slot-body">

        <!-- Preview -->
        <div class="cam-preview-box" id="cam-preview-${i}">
          <video id="cam-video-${i}" autoplay muted playsinline></video>
          <div class="cam-preview-placeholder" id="cam-placeholder-${i}">
            <span>📷</span>
            <span>Sin señal</span>
          </div>
        </div>

        <!-- Selector de dispositivo -->
        <label>Dispositivo</label>
        <select id="cam-select-${i}" onchange="camAsignarDispositivo(${i}, this.value)">
          <option value="">— Sin cámara —</option>
        </select>

        <!-- Etiqueta -->
        <label>Etiqueta en overlay</label>
        <div class="cam-etiqueta-row">
          <input type="text" id="cam-etiqueta-${i}" value="${slot.etiqueta}"
            placeholder="Nombre..."
            oninput="camSetEtiqueta(${i}, this.value)">
        </div>

        <!-- Controles overlay -->
        <div class="fila-btn" style="margin-top:4px">
          <button class="btn btn-sm ${slot.visible ? 'btn-dorado' : 'btn-gris'}"
            id="cam-btn-visible-${i}"
            onclick="camToggleVisible(${i})">
            ${slot.visible ? '👁 Visible' : '🚫 Oculta'}
          </button>
        </div>
      </div>

    </div>
  `).join('');

  // Re-asignar streams si ya los teníamos
  camState.slots.forEach((slot, i) => {
    if (camStreams[i]) {
      const video = document.getElementById(`cam-video-${i}`);
      if (video) {
        video.srcObject = camStreams[i];
        document.getElementById(`cam-placeholder-${i}`)?.style.setProperty('display', 'none');
      }
    }
  });
}

function renderSelects() {
  camState.slots.forEach((slot, i) => {
    const sel = document.getElementById(`cam-select-${i}`);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = '<option value="">— Sin cámara —</option>' +
      camDispositivos.map(d =>
        `<option value="${d.deviceId}" ${slot.deviceId === d.deviceId ? 'selected' : ''}>
          ${d.label || `Cámara ${camDispositivos.indexOf(d) + 1}`}
        </option>`
      ).join('');
    if (prev) sel.value = prev;
  });
}

// ═══════════════════════════════════════════════════════════════
// ACCIONES DE SLOTS
// ═══════════════════════════════════════════════════════════════

function camToggleSlot(i, activo) {
  camState.slots[i].activo = activo;

  // Si desactivamos, liberar stream
  if (!activo && camStreams[i]) {
    camStreams[i].getTracks().forEach(t => t.stop());
    delete camStreams[i];
    camState.slots[i].deviceId = null;
  }

  const card = document.getElementById(`cam-slot-card-${i}`);
  if (card) card.classList.toggle('inactivo', !activo);

  sincronizarCamaras();
}

async function camAsignarDispositivo(i, deviceId) {
  // Parar stream anterior
  if (camStreams[i]) {
    camStreams[i].getTracks().forEach(t => t.stop());
    delete camStreams[i];
  }

  camState.slots[i].deviceId = deviceId || null;

  const video       = document.getElementById(`cam-video-${i}`);
  const placeholder = document.getElementById(`cam-placeholder-${i}`);

  if (!deviceId) {
    if (video) { video.srcObject = null; video.style.display = 'none'; }
    if (placeholder) placeholder.style.display = '';
    sincronizarCamaras();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }
    });
    camStreams[i] = stream;
    if (video) {
      video.srcObject = stream;
      video.style.display = 'block';
    }
    if (placeholder) placeholder.style.display = 'none';
    sincronizarCamaras();
  } catch (err) {
    toast(`Error al abrir cámara ${i + 1}`, 'error');
    console.error(err);
  }
}

function camSetEtiqueta(i, valor) {
  camState.slots[i].etiqueta = valor;
  sincronizarCamaras();
}

function camToggleVisible(i) {
  camState.slots[i].visible = !camState.slots[i].visible;
  const btn = document.getElementById(`cam-btn-visible-${i}`);
  if (btn) {
    const v = camState.slots[i].visible;
    btn.textContent = v ? '👁 Visible' : '🚫 Oculta';
    btn.className   = `btn btn-sm ${v ? 'btn-dorado' : 'btn-gris'}`;
  }
  sincronizarCamaras();
}

// ═══════════════════════════════════════════════════════════════
// LAYOUTS
// ═══════════════════════════════════════════════════════════════

const CAM_LAYOUTS = [
  // Full: cámaras como fondo de pantalla completa
  { id: 'full-1',    grupo: 'full',   label: '1 — Completa',     icon: '⬛', desc: 'Una sola cámara a pantalla completa' },
  { id: 'full-2',    grupo: 'full',   label: '2 — Mitades',      icon: '▐▌', desc: 'Mitad izquierda / mitad derecha, pantalla completa' },
  { id: 'full-3',    grupo: 'full',   label: '3 — Split',        icon: '▐⊟', desc: 'Izquierda grande + derecha partida arriba/abajo, pantalla completa' },
  { id: 'full-4',    grupo: 'full',   label: '4 — Cuadrantes',   icon: '⊞',  desc: 'Cuatro cuadrantes iguales a pantalla completa' },
  // Franja: cámaras en banda inferior
  { id: 'franja-2',  grupo: 'franja', label: '2 — Franja',       icon: '▬▬', desc: 'Franja inferior: dos cámaras lado a lado' },
  { id: 'franja-3',  grupo: 'franja', label: '3 — Franja split', icon: '▬⊟', desc: 'Franja inferior: izquierda grande + derecha partida' },
];

const CAM_SLOTS_POR_LAYOUT = {
  'full-1': 1, 'full-2': 2, 'full-3': 3, 'full-4': 4,
  'franja-2': 2, 'franja-3': 3,
};

function renderLayoutPicker() {
  const contenedor = document.getElementById('cam-layout-picker');
  if (!contenedor) return;

  // Agrupar por grupo
  const grupos = [
    { key: 'full',   label: 'Pantalla completa' },
    { key: 'franja', label: 'Franja inferior' },
  ];

  contenedor.innerHTML = grupos.map(g => {
    const items = CAM_LAYOUTS.filter(l => l.grupo === g.key);
    return `
      <div class="layout-grupo-label">${g.label}</div>
      <div class="layout-grupo-btns">
        ${items.map(l => `
          <button class="layout-btn ${camState.layout === l.id ? 'activo' : ''}"
            id="layout-btn-${l.id}"
            onclick="camSeleccionarLayout('${l.id}')"
            title="${l.desc}">
            <span class="layout-icon">${l.icon}</span>
            <span class="layout-label">${l.label}</span>
          </button>
        `).join('')}
      </div>`;
  }).join('');
}

function camSeleccionarLayout(id) {
  camState.layout = id;
  aplicarLayoutUI(id);
  sincronizarCamaras();
  toast(`Layout: ${CAM_LAYOUTS.find(l => l.id === id)?.label}`, 'info');
}

function aplicarLayoutUI(id) {
  document.querySelectorAll('.layout-btn').forEach(btn => btn.classList.remove('activo'));
  document.getElementById(`layout-btn-${id}`)?.classList.add('activo');

  const n = CAM_SLOTS_POR_LAYOUT[id] || 2;
  camState.slots.forEach((_, i) => {
    const card = document.getElementById(`cam-slot-card-${i}`);
    if (!card) return;
    card.classList.toggle('slot-relevante', i < n);
    card.classList.toggle('slot-extra', i >= n);
  });

  const desc = document.getElementById('cam-layout-desc');
  if (desc) desc.textContent = CAM_LAYOUTS.find(l => l.id === id)?.desc || '';
}

// ═══════════════════════════════════════════════════════════════
// SINCRONIZACIÓN CON OVERLAY
// Serializa solo lo necesario (no streams, no elementos DOM)
// ═══════════════════════════════════════════════════════════════

function sincronizarCamaras() {
  // Las cámaras no pueden enviarse por localStorage (MediaStream no es serializable).
  // Lo que se envía es la configuración: etiquetas, visibilidad, layout.
  // El overlay gestiona sus propias cámaras (el stream lo abre él mismo
  // cuando recibe el deviceId).
  estado.camaras = {
    layout: camState.layout,
    slots: camState.slots.map(s => ({
      id:       s.id,
      activo:   s.activo,
      deviceId: s.deviceId,
      etiqueta: s.etiqueta,
      visible:  s.visible,
    }))
  };
  sincronizarOverlay({ comando: 'camaras' });
}

// Botón "Enviar al Overlay" explícito (por si quieren forzar)
function camEnviarAlOverlay() {
  sincronizarCamaras();
  toast('Configuración de cámaras enviada al overlay', 'ok');
}
