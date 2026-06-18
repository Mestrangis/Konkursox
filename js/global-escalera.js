// ═══════════════════════════════════════════════════════════════
// KONKURSOX — GLOBAL-ESCALERA.JS
// Escalera de premios: lista configurable, peldaño activo,
// mostrar/ocultar en el overlay desde cualquier pestaña.
// ═══════════════════════════════════════════════════════════════

const ESC_KEY = 'konkursox_escalera';

const ESC_DEFAULTS = [
  '100 €', '200 €', '300 €', '500 €', '1.000 €',
  '2.000 €', '4.000 €', '8.000 €', '16.000 €', '32.000 €',
  '64.000 €', '125.000 €', '250.000 €', '500.000 €', '1.000.000 €',
];

let escState = {
  peldanos:   [],
  activo:     0,      // índice del peldaño actual (0 = primero/más bajo)
  visible:    false,
};

// ── Init ──────────────────────────────────────────────────────────
function escInit() {
  escCargar();
  escRenderEditor();
  escRenderMiniControl();
}

function escCargar() {
  try {
    const g = JSON.parse(localStorage.getItem(ESC_KEY) || 'null');
    if (g?.peldanos?.length) {
      escState.peldanos = g.peldanos;
      escState.activo   = g.activo ?? 0;
      return;
    }
  } catch {}
  escState.peldanos = [...ESC_DEFAULTS];
  escState.activo   = 0;
}

function escGuardar() {
  localStorage.setItem(ESC_KEY, JSON.stringify({
    peldanos: escState.peldanos,
    activo:   escState.activo,
  }));
}

// ── Editor (en pestaña Personalización) ──────────────────────────
function escRenderEditor() {
  const lista = document.getElementById('esc-editor-lista');
  if (!lista) return;

  // Mostrar en orden descendente (arriba = mayor premio)
  const invertidos = [...escState.peldanos].reverse();
  lista.innerHTML = invertidos.map((p, iInv) => {
    const i = escState.peldanos.length - 1 - iInv; // índice real
    return `
      <div class="esc-editor-row" id="esc-row-${i}">
        <div class="esc-editor-num">${i + 1}</div>
        <input type="text" class="esc-editor-input" value="${escHtml(p)}"
          oninput="escSetPeldano(${i}, this.value)">
        <button class="btn btn-rojo btn-sm" onclick="escEliminarPeldano(${i})">✕</button>
      </div>`;
  }).join('');
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function escSetPeldano(i, valor) {
  escState.peldanos[i] = valor;
  escGuardar();
  escSincronizar();
}

function escAñadirPeldano() {
  escState.peldanos.push('Nuevo premio');
  escGuardar();
  escRenderEditor();
  escSincronizar();
}

function escEliminarPeldano(i) {
  escState.peldanos.splice(i, 1);
  if (escState.activo >= escState.peldanos.length)
    escState.activo = Math.max(0, escState.peldanos.length - 1);
  escGuardar();
  escRenderEditor();
  escRenderMiniControl();
  escSincronizar();
}

function escResetearDefaults() {
  if (!confirm('¿Restablecer escalera por defecto?')) return;
  escState.peldanos = [...ESC_DEFAULTS];
  escState.activo   = 0;
  escGuardar();
  escRenderEditor();
  escRenderMiniControl();
  escSincronizar();
  toast('Escalera restablecida', 'info');
}

// ── Mini control (aparece en cada pestaña de juego) ───────────────
// Se inyecta dinámicamente en los contenedores .esc-mini-slot
function escRenderMiniControl() {
  document.querySelectorAll('.esc-mini-slot').forEach(slot => {
    slot.innerHTML = escMiniHTML();
  });
}

function escMiniHTML() {
  const total  = escState.peldanos.length;
  const activo = escState.activo;
  const premio = escState.peldanos[activo] || '—';

  return `
    <div class="esc-mini">
      <div class="esc-mini-titulo">🏆 Escalera</div>
      <div class="esc-mini-premio">${premio}</div>
      <div class="esc-mini-info">${activo + 1} / ${total}</div>
      <div class="esc-mini-btns">
        <button class="btn btn-gris btn-sm" onclick="escRetroceder()" title="Retroceder">▼</button>
        <button class="btn btn-gris btn-sm" onclick="escAvanzar()"    title="Avanzar">▲</button>
        <button class="btn ${escState.visible ? 'btn-dorado' : 'btn-gris'} btn-sm"
          id="esc-btn-visible"
          onclick="escToggleVisible()">${escState.visible ? '👁 Ocultar' : '👁 Mostrar'}</button>
      </div>
    </div>`;
}

function escAvanzar() {
  if (escState.activo < escState.peldanos.length - 1) {
    escState.activo++;
    escGuardar();
    escRenderMiniControl();
    escSincronizar();
  }
}

function escRetroceder() {
  if (escState.activo > 0) {
    escState.activo--;
    escGuardar();
    escRenderMiniControl();
    escSincronizar();
  }
}

function escToggleVisible() {
  escState.visible = !escState.visible;
  escRenderMiniControl();
  escSincronizar();
  toast(escState.visible ? 'Escalera visible en overlay' : 'Escalera oculta', 'info');
}

// ── Sincronizar con overlay ───────────────────────────────────────
function escSincronizar() {
  estado.escalera = {
    peldanos: escState.peldanos,
    activo:   escState.activo,
    visible:  escState.visible,
  };
  sincronizarOverlay({ comando: 'escalera' });
}
