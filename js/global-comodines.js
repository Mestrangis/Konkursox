// ═══════════════════════════════════════════════════════════════
// KONKURSOX — GLOBAL-COMODINES.JS
// Sistema de comodines configurable.
// Cada comodín: { id, emoji, nombre, funcional, disponibleEn[], usado }
// funcional: null | '50/50' | 'publ' | 'llamada' (añadir más en el futuro)
// ═══════════════════════════════════════════════════════════════

const COM_KEY = 'konkursox_comodines';

const COM_DEFAULTS = [
  { id: 'c5050',    emoji: '5️⃣0️⃣', nombre: '50/50',           funcional: '50/50',   disponibleEn: ['tipo-test'], usado: false },
  { id: 'cpublic',  emoji: '👥',     nombre: 'Comodín Público', funcional: 'publico', disponibleEn: ['tipo-test','si-no','precio-justo'], usado: false },
  { id: 'cllamada', emoji: '📞',     nombre: 'Llamada',         funcional: 'llamada', disponibleEn: ['tipo-test','si-no','precio-justo'], usado: false },
];

let comLista = [];
let comDragIdx = null;

// ── Init ──────────────────────────────────────────────────────────
function comInit() {
  comCargar();
  comRenderEditor();
  comRenderTodosMiniPaneles();
}

function comCargar() {
  try {
    const g = JSON.parse(localStorage.getItem(COM_KEY) || 'null');
    if (g?.length) { comLista = g; return; }
  } catch {}
  comLista = COM_DEFAULTS.map(c => ({ ...c }));
}

function comGuardar() {
  localStorage.setItem(COM_KEY, JSON.stringify(comLista));
  comRenderTodosMiniPaneles();
}

// ═══════════════════════════════════════════════════════════════
// EDITOR (Personalización)
// ═══════════════════════════════════════════════════════════════
function comRenderEditor() {
  const lista = document.getElementById('com-editor-lista');
  if (!lista) return;

  lista.innerHTML = comLista.map((c, i) => `
    <div class="com-editor-row" draggable="true"
      ondragstart="comDragStart(event,${i})"
      ondragover="comDragOver(event,${i})"
      ondrop="comDrop(event,${i})"
      ondragend="comDragEnd()">

      <div class="sfx-drag-handle" style="cursor:grab">⠿</div>

      <!-- Emoji -->
      <input type="text" class="com-emoji-input"
        value="${c.emoji}" maxlength="4"
        oninput="comSet(${i},'emoji',this.value)"
        title="Emoji del comodín">

      <!-- Nombre -->
      <input type="text" class="com-nombre-input"
        value="${escHtmlCom(c.nombre)}" maxlength="30"
        oninput="comSet(${i},'nombre',this.value)"
        placeholder="Nombre del comodín">

      <!-- Funcionalidad (badge) -->
      <span class="com-func-badge ${c.funcional ? 'com-func-activa' : 'com-func-none'}"
        title="${c.funcional ? 'Funcionalidad: ' + c.funcional : 'Sin funcionalidad programada'}">
        ${c.funcional ? '⚡ ' + c.funcional : '— manual'}
      </span>

      <!-- Disponible en (checkboxes) -->
      <div class="com-disponible-wrap">
        ${['tipo-test','si-no','precio-justo','rosco'].map(modo => `
          <label class="com-modo-check" title="${modo}">
            <input type="checkbox" ${c.disponibleEn?.includes(modo) ? 'checked' : ''}
              onchange="comToggleModo(${i},'${modo}',this.checked)">
            <span>${{ 'tipo-test':'TT', 'si-no':'S/N', 'precio-justo':'PJ', 'rosco':'R' }[modo]}</span>
          </label>`).join('')}
      </div>

      <button class="btn btn-rojo btn-sm" onclick="comEliminar(${i})">✕</button>
    </div>`).join('');
}

function escHtmlCom(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function comSet(i, campo, valor) {
  if (comLista[i]) comLista[i][campo] = valor;
  comGuardar();
}

function comToggleModo(i, modo, activo) {
  if (!comLista[i]) return;
  const arr = comLista[i].disponibleEn || [];
  if (activo && !arr.includes(modo)) arr.push(modo);
  if (!activo) comLista[i].disponibleEn = arr.filter(m => m !== modo);
  else comLista[i].disponibleEn = arr;
  comGuardar();
}

function comAñadir() {
  comLista.push({
    id: 'com_' + Date.now(),
    emoji: '🎯', nombre: 'Nuevo comodín',
    funcional: null,
    disponibleEn: ['tipo-test'],
    usado: false,
  });
  comGuardar();
  comRenderEditor();
}

function comEliminar(i) {
  comLista.splice(i, 1);
  comGuardar();
  comRenderEditor();
}

function comResetear() {
  if (!confirm('¿Restaurar comodines por defecto?')) return;
  comLista = COM_DEFAULTS.map(c => ({ ...c, usado: false }));
  comGuardar();
  comRenderEditor();
  toast('Comodines restaurados', 'info');
}

// Drag & drop en el editor
function comDragStart(e, i) { comDragIdx = i; e.currentTarget.style.opacity = '.4'; }
function comDragOver(e, i)  { e.preventDefault(); }
function comDrop(e, i) {
  e.preventDefault();
  if (comDragIdx === null || comDragIdx === i) return;
  const [moved] = comLista.splice(comDragIdx, 1);
  comLista.splice(i, 0, moved);
  comDragIdx = null;
  comGuardar();
  comRenderEditor();
}
function comDragEnd() {
  comDragIdx = null;
  document.querySelectorAll('.com-editor-row').forEach(r => r.style.opacity = '');
}

// ═══════════════════════════════════════════════════════════════
// MINI PANEL EN PESTAÑAS DE JUEGO
// ═══════════════════════════════════════════════════════════════
function comRenderTodosMiniPaneles() {
  const modos = ['tipo-test', 'si-no', 'precio-justo', 'rosco'];
  modos.forEach(modo => {
    document.querySelectorAll(`.com-mini-slot[data-modo="${modo}"]`).forEach(slot => {
      comRenderMini(slot, modo);
    });
  });
  // Sincronizar estado visual al overlay
  comSincronizar();
}

function comRenderMini(slot, modo) {
  const disponibles = comLista.filter(c => c.disponibleEn?.includes(modo));

  if (!disponibles.length) {
    slot.innerHTML = '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:8px">Sin comodines para este modo.</div>';
    return;
  }

  slot.innerHTML = `
    <div class="com-mini-grid">
      ${disponibles.map(c => `
        <div class="com-btn-wrap">
          <button class="btn com-mini-btn ${c.usado ? 'com-usado' : 'btn-gris'}"
            onclick="comActivar('${c.id}','${modo}')"
            title="${c.nombre}${c.usado ? ' (usado)' : ''}"
            ${c.usado ? 'disabled' : ''}>
            <span class="com-mini-emoji">${c.emoji}</span>
            <span class="com-mini-nombre">${c.nombre}</span>
          </button>
          ${c.usado ? '' : `<button class="btn btn-gris btn-sm com-reset-btn" onclick="comRestaurar('${c.id}')" title="Restaurar comodín">↺</button>`}
        </div>
      `).join('')}
    </div>
    <button class="btn btn-gris btn-sm" style="margin-top:6px;width:100%" onclick="comRestaurarTodos()">↺ Restaurar todos</button>`;
}

// ── Activar comodín ───────────────────────────────────────────────
function comActivar(id, modo) {
  const c = comLista.find(c => c.id === id);
  if (!c || c.usado) return;

  c.usado = true;
  comGuardar();
  comRenderEditor();

  // Ejecutar funcionalidad programada
  switch (c.funcional) {
    case '50/50':
      comEjecutar5050();
      break;
    case 'publico':
      comEjecutarPublico(c);
      break;
    case 'llamada':
      comEjecutarLlamada(c);
      break;
    default:
      // Manual: solo mostrar en overlay que se activó
      break;
  }

  // Enviar al overlay
  comSincronizar(id);
  toast(`Comodín "${c.nombre}" activado`, 'info');
  sfxSisPlay('tension');
}

function comRestaurar(id) {
  const c = comLista.find(c => c.id === id);
  if (c) { c.usado = false; comGuardar(); comRenderTodosMiniPaneles(); }
}

function comRestaurarTodos() {
  comLista.forEach(c => { c.usado = false; });
  comGuardar();
  comRenderTodosMiniPaneles();
  toast('Todos los comodines restaurados', 'info');
}

// ═══════════════════════════════════════════════════════════════
// FUNCIONALIDADES PROGRAMADAS
// ═══════════════════════════════════════════════════════════════

// 50/50 — elimina dos opciones incorrectas del Tipo Test
function comEjecutar5050() {
  const tt = estado.tipoTest;
  if (!tt?.visible) { toast('Muestra una pregunta de Tipo Test primero.', 'error'); return; }
  if (tt.correcta < 0) { toast('Marca la opción correcta antes de usar el 50/50.', 'error'); return; }

  // Opciones incorrectas con contenido
  const incorrectas = [0,1,2,3].filter(i =>
    i !== tt.correcta && tt.opciones?.[i]?.trim()
  );
  // Elegir 2 al azar para eliminar
  const shuffled = incorrectas.sort(() => Math.random() - .5);
  const aEliminar = shuffled.slice(0, 2);

  estado.tipoTest.eliminadas5050 = aEliminar;
  sincronizarOverlay({ comando: '5050' });
  toast('50/50 aplicado — dos opciones eliminadas', 'ok');
}

// Público — muestra un banner en el overlay
function comEjecutarPublico(c) {
  sincronizarOverlay({ comando: 'comodin_banner', comodinNombre: c.nombre, comodinEmoji: c.emoji });
}

// Llamada — muestra un banner en el overlay
function comEjecutarLlamada(c) {
  sincronizarOverlay({ comando: 'comodin_banner', comodinNombre: c.nombre, comodinEmoji: c.emoji });
}

// ── Sincronizar lista de comodines al overlay ─────────────────────
function comSincronizar(activadoId) {
  estado.comodines = comLista.map(c => ({
    id: c.id, emoji: c.emoji, nombre: c.nombre,
    usado: c.usado, funcional: c.funcional,
  }));
  if (activadoId) estado.comodinActivado = activadoId;
  sincronizarOverlay({ comando: 'comodines' });
}
