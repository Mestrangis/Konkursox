// ═══════════════════════════════════════════════════════════════
// KONKURSOX — CORE.JS  v2
// Estado global + comunicación panel ↔ overlay via localStorage (local)
// y via PartyKit WebSocket (online).
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'konkursox_v2';

// ── Modo de operación ───────────────────────────────────────────
// 'local' | 'online-lan' | 'online-remote'
window.appMode    = 'local';
window.currentRoom = '';

// ── Participantes online ────────────────────────────────────────
const _participantes = new Map();  // id → { id, name, role, hasCam, voted }

// ── Estado global del programa ──────────────────────────────────
const estado = {
  modo: null,            // 'tipo-test' | 'si-no' | 'precio-justo' | 'rosco' | null

  escala: { global:100, pregunta:30, opciones:20, precio:110, rosco:200, 'rosco-preg':36 },

  comodines: [],
  comodinActivado: null,

  escalera: { peldanos: [], activo: 0, visible: false },

  personalizacion: {
    nombre: 'KONKURSOX',
    subtitulo: '¿Tú le sabes FR FR?',
    colores: { dorado: '#f0a500', verde: '#2ecc71', rojo: '#e74c3c', azul: '#3498db', fondo: '#0c0e13' }
  },

  rosco: null,

  precioJusto: {
    texto: '', imagenUrl: '', valorActual: '', valorReal: '',
    pista: null, resuelto: false, correcto: null, visible: false,
  },

  siNo: {
    pregunta:  '',
    opciones:  ['SÍ', 'NO'],
    correcta:  -1,
    resaltada: -1,
    visible:   false,
    revelar:   false,
  },

  tipoTest: {
    pregunta:  '',
    opciones:  ['', '', '', ''],
    correcta:  -1,
    resaltada: -1,
    visible:   false,
    revelar:   false,
  },

  timer: {
    valor:    30,
    max:      30,
    corriendo: false,
  },

  multimedia: {
    activo: false,
    tipo:   null,
    url:    '',
  },

  camaras: {
    presentador: { etiqueta: 'Presentador', deviceId: null },
    concursante: { etiqueta: 'Concursante', deviceId: null },
  },
};

// ── API Key Ably ────────────────────────────────────────────────
function getAblyApiKey() {
  return (window.CONFIG?.ablyApiKey || '').trim();
}

// ── Sincronizar estado → overlay ────────────────────────────────
// Siempre escribe localStorage (para Modo 1 y como fallback).
// En modos online también publica por WebSocket.
function sincronizarOverlay(extra = {}) {
  const payload = {
    ...estado,
    ...extra,
    _ts: Date.now(),
    _onlineMode: window.appMode !== 'local' ? window.appMode : undefined,
  };

  // Modo local: solo localStorage
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));

  // Modo online: publicar también por PartyKit
  if (window.appMode !== 'local' && typeof OnlineLayer !== 'undefined' && OnlineLayer.isConnected()) {
    OnlineLayer.publish({ type: 'state', payload });
  }
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
  let url = 'overlay.html';
  if (window.appMode !== 'local' && window.currentRoom) {
    const params = new URLSearchParams({
      room: window.currentRoom,
      mode: window.appMode,
    });
    url = `overlay.html?${params.toString()}`;
  }
  window.open(url, 'konkursox_overlay',
    'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
}

// ══════════════════════════════════════════════════════════════════
// SELECTOR DE MODO
// ══════════════════════════════════════════════════════════════════

function initModoSelector() {
  // Actualizar indicador de modo en la topbar
  _actualizarIndicadorModo();

  // Conectar OnlineLayer handlers
  if (typeof OnlineLayer !== 'undefined') {
    OnlineLayer.on('connected', () => {
      _actualizarIndicadorModo();
      renderSalaInfo();
    });
    OnlineLayer.on('disconnected', () => {
      _actualizarIndicadorModo();
    });
    OnlineLayer.on('participants_list', (msg) => {
      _participantes.clear();
      (msg.payload || []).forEach(p => _participantes.set(p.id, p));
      renderSalaParticipantes();
    });
    OnlineLayer.on('participant_joined', (msg) => {
      if (msg.payload) { _participantes.set(msg.payload.id, msg.payload); renderSalaParticipantes(); }
    });
    OnlineLayer.on('participant_left', (msg) => {
      if (msg.payload?.id) { _participantes.delete(msg.payload.id); renderSalaParticipantes(); }
    });
    OnlineLayer.on('vote_update', (msg) => {
      // Propagar al módulo de tipo test o sí/no si está activo
      if (typeof ttRecibirVotos === 'function') ttRecibirVotos(msg.payload);
      if (typeof snRecibirVotos === 'function') snRecibirVotos(msg.payload);
    });
    OnlineLayer.on('hello_ack', (msg) => {
      // El panel obtiene su ID pero no lo necesita para nada especial
    });
  }
}

// ── Abrir modal de selección de modo ───────────────────────────
function seleccionarModo() {
  const modal = document.getElementById('modo-modal');
  if (modal) modal.style.display = 'flex';
}

function cerrarModoModal() {
  const modal = document.getElementById('modo-modal');
  if (modal) modal.style.display = 'none';
}

function elegirModo(modo) {
  cerrarModoModal();
  if (modo === 'local') {
    _setModoLocal();
  } else {
    const apiKey = getAblyApiKey();
    if (!apiKey) {
      toast('Configura ablyApiKey en config.js antes de usar el modo online.', 'error');
      return;
    }
    _abrirModalSala(modo);
  }
}

function _setModoLocal() {
  if (window.appMode !== 'local') {
    if (typeof OnlineLayer !== 'undefined') OnlineLayer.disconnect();
    window.appMode    = 'local';
    window.currentRoom = '';
    _actualizarIndicadorModo();
    _cerrarModalSala();
    renderSalaInfo();
    toast('Modo local activado', 'ok');
  }
}

// ── Modal de sala ───────────────────────────────────────────────
function _abrirModalSala(modo) {
  const modal = document.getElementById('sala-modal');
  if (modal) {
    modal.dataset.modo = modo;
    modal.style.display = 'flex';
    // Pre-generar código
    const inp = document.getElementById('sala-codigo-input');
    if (inp && !inp.value) inp.value = generarCodigoSala();
  }
}

function _cerrarModalSala() {
  const modal = document.getElementById('sala-modal');
  if (modal) modal.style.display = 'none';
}

function generarCodigoSala() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function crearSala() {
  const modal = document.getElementById('sala-modal');
  const modo  = modal?.dataset.modo || 'online-lan';
  const inp   = document.getElementById('sala-codigo-input');
  const codigo = (inp?.value || '').trim().toUpperCase();
  if (!codigo || codigo.length < 2) { toast('Introduce un código de sala', 'error'); return; }

  const apiKey = getAblyApiKey();
  if (!apiKey) { toast('API Key de Ably no configurada', 'error'); return; }

  window.appMode     = modo;
  window.currentRoom = codigo;

  if (typeof OnlineLayer !== 'undefined') {
    OnlineLayer.connect(codigo, 'panel', apiKey, 'Panel', false);
  }

  _cerrarModalSala();
  _actualizarIndicadorModo();
  renderSalaInfo();

  // Ir a la pestaña de sala
  const tabSala = document.getElementById('tab-sala-btn');
  if (tabSala) tabSala.click();

  toast(`Sala ${codigo} creada (${modo === 'online-lan' ? 'WiFi' : 'Internet'})`, 'ok');
}

function cerrarSala() {
  if (typeof OnlineLayer !== 'undefined') OnlineLayer.disconnect();
  window.appMode     = 'local';
  window.currentRoom = '';
  _participantes.clear();
  _actualizarIndicadorModo();
  renderSalaInfo();
  renderSalaParticipantes();
  toast('Sala cerrada', 'info');
}

// ── Render: info de sala en la pestaña ─────────────────────────
function renderSalaInfo() {
  const el = document.getElementById('sala-info-panel');
  if (!el) return;

  if (window.appMode === 'local' || !window.currentRoom) {
    el.innerHTML = `
      <div style="text-align:center;padding:20px;color:var(--dim)">
        <div style="font-size:32px;margin-bottom:8px">📡</div>
        <p>Sin sala activa. Selecciona un <strong>Modo Online</strong> para crear una sala.</p>
      </div>`;
    return;
  }

  const base = location.origin + location.pathname.replace('panel.html', '');
  const salaUrl    = `${base}sala.html?room=${window.currentRoom}`;
  const overlayUrl = `${base}overlay.html?room=${window.currentRoom}&mode=${window.appMode}`;
  const modoLabel = window.appMode === 'online-lan' ? '🌐 WiFi local' : '🌍 Internet';
  const wsStatus = (typeof OnlineLayer !== 'undefined' && OnlineLayer.isConnected())
    ? '<span style="color:var(--verde)">● Conectado</span>'
    : '<span style="color:var(--naranja)">◌ Conectando…</span>';

  el.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:12px">
      <span style="font-family:'Barlow Condensed',sans-serif;font-size:48px;font-weight:900;letter-spacing:8px;color:var(--dorado)">${window.currentRoom}</span>
      <div>
        <div style="font-size:12px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px">${modoLabel}</div>
        <div style="font-size:12px">${wsStatus}</div>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px">Link participantes</div>
      <div style="display:flex;gap:6px">
        <input readonly value="${salaUrl}" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--text);outline:none" />
        <button class="btn btn-gris" onclick="copiarLink('${salaUrl}')" style="white-space:nowrap;padding:6px 12px;font-size:12px">Copiar</button>
      </div>
    </div>

    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px">
      <div style="font-size:11px;color:var(--dim);text-transform:uppercase;letter-spacing:.5px">URL Overlay (OBS / navegador)</div>
      <div style="display:flex;gap:6px">
        <input readonly value="${overlayUrl}" style="flex:1;background:var(--bg3);border:1px solid var(--border);border-radius:6px;padding:7px 10px;font-size:12px;color:var(--text);outline:none" />
        <button class="btn btn-gris" onclick="copiarLink('${overlayUrl}')" style="white-space:nowrap;padding:6px 12px;font-size:12px">Copiar</button>
      </div>
    </div>

    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-dorado" onclick="abrirOverlay()">🖥 Abrir Overlay</button>
      <button class="btn btn-rojo"   onclick="cerrarSala()">✕ Cerrar sala</button>
    </div>`;
}

// ── Render: lista de participantes ──────────────────────────────
function renderSalaParticipantes() {
  const el = document.getElementById('sala-participantes-list');
  if (!el) return;
  const salas = [..._participantes.values()].filter(p => p.role === 'sala');
  const ctr   = document.getElementById('sala-participantes-count');
  if (ctr) ctr.textContent = salas.length;
  el.innerHTML = '';
  salas.forEach(p => {
    const div = document.createElement('div');
    div.className = 'sala-participante';
    div.innerHTML = `
      <div class="sala-participante-avatar">${(p.name || '?')[0].toUpperCase()}</div>
      <span class="sala-participante-nombre">${p.name || '?'}</span>
      ${p.hasCam ? '<span title="Cámara">📷</span>' : ''}
      ${p.voted  ? '<span title="Ya votó">✅</span>'  : ''}`;
    el.appendChild(div);
  });
}

// ── Copiar link al portapapeles ─────────────────────────────────
function copiarLink(url) {
  navigator.clipboard?.writeText(url)
    .then(() => toast('¡Copiado!', 'ok'))
    .catch(() => toast('No se pudo copiar', 'error'));
}

// ── Indicador de modo en topbar ─────────────────────────────────
function _actualizarIndicadorModo() {
  const el = document.getElementById('indicador-modo');
  if (!el) return;
  if (window.appMode === 'local' || !window.currentRoom) {
    el.textContent = '💻 Local';
    el.className   = 'indicador-modo local';
  } else if (window.appMode === 'online-lan') {
    el.textContent = `🌐 ${window.currentRoom}`;
    el.className   = 'indicador-modo online';
  } else {
    el.textContent = `🌍 ${window.currentRoom}`;
    el.className   = 'indicador-modo online';
  }
}
