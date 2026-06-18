// ═══════════════════════════════════════════════════════════════
// KONKURSOX — CORE.JS  v2
// Estado global + comunicación panel ↔ overlay via localStorage
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'konkursox_v2';

// ── Estado global del programa ──────────────────────────────────
const estado = {
  // Modo activo en el overlay
  modo: null,            // 'tipo-test' | 'si-no' | 'precio-justo' | 'rosco' | null

  // Escala de texto overlay
  escala: { global:100, pregunta:30, opciones:20, precio:110, rosco:200, 'rosco-preg':36 },

  // Comodines
  comodines: [],
  comodinActivado: null,

  // Escalera de premios
  escalera: { peldanos: [], activo: 0, visible: false },

  // Personalización
  personalizacion: {
    nombre: 'KONKURSOX',
    subtitulo: '¿Tú le sabes FR FR?',
    colores: { dorado: '#f0a500', verde: '#2ecc71', rojo: '#e74c3c', azul: '#3498db', fondo: '#0c0e13' }
  },

  // Rosco
  rosco: null,

  // Precio Justo
  precioJusto: {
    texto: '', imagenUrl: '', valorActual: '', valorReal: '',
    pista: null, resuelto: false, correcto: null, visible: false,
  },

  // Sí / No
  siNo: {
    pregunta:  '',
    opciones:  ['SÍ', 'NO'],
    correcta:  -1,
    resaltada: -1,
    visible:   false,
    revelar:   false,
  },

  // Tipo Test
  tipoTest: {
    pregunta:  '',
    opciones:  ['', '', '', ''],
    correcta:  -1,        // índice de la correcta, -1 = ninguna
    resaltada: -1,        // índice que señala el concursante
    visible:   false,
    revelar:   false,
  },

  // Temporizador (compartido por todos los modos)
  timer: {
    valor:    30,
    max:      30,
    corriendo: false,
  },

  // Multimedia (compartido)
  multimedia: {
    activo: false,
    tipo:   null,   // 'imagen' | 'video' | 'youtube'
    url:    '',
  },

  // Cámaras
  camaras: {
    presentador: { etiqueta: 'Presentador', deviceId: null },
    concursante: { etiqueta: 'Concursante', deviceId: null },
  },
};

// ── Sincronizar estado → overlay ────────────────────────────────
function sincronizarOverlay(extra = {}) {
  const payload = { ...estado, ...extra, _ts: Date.now() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

// ── Toast notifications ─────────────────────────────────────────
function toast(msg, tipo = 'info') {
  const c = document.getElementById('toast-container');
  if (!c) return;
  const t = document.createElement('div');
  t.className = `toast ${tipo}`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}

// ── Abrir overlay en nueva ventana ──────────────────────────────
function abrirOverlay() {
  window.open('overlay.html', 'konkursox_overlay',
    'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
}
