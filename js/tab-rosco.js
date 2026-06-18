// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-ROSCO.JS  v2
// El Rosco: 26 letras A-Z (sin Ñ), cada una con su pregunta.
// Estados por letra: pendiente | activa | correcta | fallada | pasada
// ═══════════════════════════════════════════════════════════════

const ROSCO_LETRAS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

let roscoMedia  = null;
let roscoTimer  = null;
let roscoAudioCtx = null;

const ROSCO_BANCO_KEY = 'konkursox_banco_rosco';

// Estado completo del rosco
let roscoEstado = {
  letras: [],        // array de 26 objetos
  letraActiva: 0,    // índice de la letra actual
  visible: false,
  iniciado: false,
};

// ── Helpers ──────────────────────────────────────────────────────
function roscoLetraVacia(letra) {
  return { letra, pregunta: '', estado: 'pendiente' };
  // estados: 'pendiente' | 'activa' | 'correcta' | 'fallada' | 'pasada'
}

function roscoLetraActualIdx() {
  return roscoEstado.letraActiva;
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function initRosco() {
  roscoMedia = new MediaPanel('rosco');
  roscoMedia.init();
  roscoTimer = new GameTimer('rosco');
  roscoTimer.init();
  sfxInit('rosco');

  roscoCargarBanco();
  roscoInicializarLetras();
  roscoRenderEditorLetras();
  roscoRenderResumen();
  renderBibliotecaGrid('rosco');

  // Música
  document.getElementById('rosco-input-musica')?.addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return;
    document.getElementById('rosco-audio').src = URL.createObjectURL(f);
    const lbl = document.getElementById('rosco-nombre-pista');
    if (lbl) lbl.textContent = f.name.length > 38 ? f.name.slice(0,38)+'…' : f.name;
  });
  document.getElementById('rosco-progreso-musica')?.addEventListener('input', (e) => {
    const a = document.getElementById('rosco-audio');
    if (a?.duration) a.currentTime = (e.target.value / 100) * a.duration;
  });
  document.getElementById('rosco-audio')?.addEventListener('timeupdate', () => {
    const a = document.getElementById('rosco-audio');
    const s = document.getElementById('rosco-progreso-musica');
    if (a?.duration && s) s.value = (a.currentTime / a.duration) * 100;
  });
}

// ═══════════════════════════════════════════════════════════════
// BANCO DE PREGUNTAS DEL ROSCO
// ═══════════════════════════════════════════════════════════════
let roscoBanco = {}; // { nombreSet: { A: '...', B: '...', ... } }
let roscoBancoSetActivo = null;

function roscoCargarBanco() {
  try { roscoBanco = JSON.parse(localStorage.getItem(ROSCO_BANCO_KEY) || '{}'); }
  catch { roscoBanco = {}; }
  roscoRenderSets();
}

function roscoInicializarLetras() {
  roscoEstado.letras = ROSCO_LETRAS.map(l => roscoLetraVacia(l));
  roscoEstado.letraActiva = 0;
  roscoEstado.iniciado = false;
  roscoEstado.visible  = false;
}

// ═══════════════════════════════════════════════════════════════
// EDITOR DE LETRAS (panel)
// ═══════════════════════════════════════════════════════════════
function roscoRenderEditorLetras() {
  const c = document.getElementById('rosco-editor-letras');
  if (!c) return;
  c.innerHTML = ROSCO_LETRAS.map((letra, i) => `
    <div class="rosco-letra-row" id="rosco-row-${i}">
      <div class="rosco-letra-badge">${letra}</div>
      <input type="text"
        id="rosco-preg-${i}"
        class="rosco-preg-input"
        value="${escHtml(roscoEstado.letras[i]?.pregunta || '')}"
        placeholder="Pregunta para ${letra}..."
        oninput="roscoSetPregunta(${i}, this.value)">
      <div class="rosco-estado-btns">
        <button class="btn btn-sm rosco-btn-estado ${roscoEstado.letras[i]?.estado === 'correcta' ? 'btn-verde activo' : 'btn-gris'}"
          onclick="roscoSetEstado(${i},'correcta')" title="Correcta">✔</button>
        <button class="btn btn-sm rosco-btn-estado ${roscoEstado.letras[i]?.estado === 'fallada' ? 'btn-rojo activo' : 'btn-gris'}"
          onclick="roscoSetEstado(${i},'fallada')" title="Fallada">✗</button>
        <button class="btn btn-sm rosco-btn-estado ${roscoEstado.letras[i]?.estado === 'pasada' ? 'btn-naranja activo' : 'btn-gris'}"
          onclick="roscoSetEstado(${i},'pasada')" title="Pasada">→</button>
      </div>
    </div>
  `).join('');
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function roscoSetPregunta(i, valor) {
  if (roscoEstado.letras[i]) roscoEstado.letras[i].pregunta = valor;
}

function roscoSetEstado(i, estado) {
  const letra = roscoEstado.letras[i];
  if (!letra) return;
  // Toggle: si ya está en ese estado, volver a pendiente
  letra.estado = (letra.estado === estado) ? 'pendiente' : estado;
  roscoRenderEditorLetras();
  roscoRenderResumen();
  roscoSincronizar('rosco_estado');
}

// ── Resumen visual de progreso ───────────────────────────────────
function roscoRenderResumen() {
  const c = document.getElementById('rosco-resumen');
  if (!c) return;
  const correctas = roscoEstado.letras.filter(l => l.estado === 'correcta').length;
  const falladas  = roscoEstado.letras.filter(l => l.estado === 'fallada').length;
  const pasadas   = roscoEstado.letras.filter(l => l.estado === 'pasada').length;
  const pendientes = 26 - correctas - falladas - pasadas;

  c.innerHTML = `
    <div class="rosco-mini-letras">
      ${roscoEstado.letras.map((l, i) => `
        <div class="rosco-mini-letra rosco-mini-${l.estado} ${i === roscoEstado.letraActiva ? 'rosco-mini-activa' : ''}"
          title="${l.letra}: ${l.estado}"
          onclick="roscoIrALetra(${i})">${l.letra}</div>
      `).join('')}
    </div>
    <div class="rosco-stats">
      <span class="stat-verde">✔ ${correctas}</span>
      <span class="stat-rojo">✗ ${falladas}</span>
      <span class="stat-naranja">→ ${pasadas}</span>
      <span class="stat-dim">⬤ ${pendientes}</span>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// NAVEGACIÓN DE LETRAS
// ═══════════════════════════════════════════════════════════════
function roscoIrALetra(i) {
  roscoEstado.letraActiva = i;
  // Marcar como activa visualmente en el overlay
  roscoSincronizar('rosco_letra');
  roscoRenderResumen();
  // Scroll dentro del contenedor del editor (sin mover la página)
  const fila = document.getElementById(`rosco-row-${i}`);
  const contenedor = document.getElementById('rosco-editor-letras');
  if (fila && contenedor) {
    const contenedorTop    = contenedor.getBoundingClientRect().top;
    const filaTop          = fila.getBoundingClientRect().top;
    const filaAltura       = fila.offsetHeight;
    const contenedorAltura = contenedor.clientHeight;
    const scrollDeseado    = contenedor.scrollTop + (filaTop - contenedorTop)
                             - (contenedorAltura / 2) + (filaAltura / 2);
    contenedor.scrollTo({ top: scrollDeseado, behavior: 'smooth' });
  }
}

function roscoSiguiente() {
  const actual = roscoEstado.letraActiva;
  // Buscar la siguiente letra que no esté resuelta (correcta/fallada)
  for (let d = 1; d <= 26; d++) {
    const idx = (actual + d) % 26;
    const est = roscoEstado.letras[idx].estado;
    if (est === 'pendiente' || est === 'pasada' || est === 'activa') {
      roscoIrALetra(idx);
      return;
    }
  }
  toast('¡Todas las letras resueltas!', 'ok');
}

function roscoAnterior() {
  let idx = (roscoEstado.letraActiva - 1 + 26) % 26;
  roscoIrALetra(idx);
}

function roscoPasar() {
  const idx = roscoEstado.letraActiva;
  roscoEstado.letras[idx].estado = 'pasada';
  roscoRenderEditorLetras();
  roscoRenderResumen();
  roscoSiguiente();
  sfxSisPlay('tic');
}

// ═══════════════════════════════════════════════════════════════
// ACCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════
function roscoMostrar() {
  // Leer preguntas del DOM por si el usuario ha escrito sin salir del input
  ROSCO_LETRAS.forEach((_, i) => {
    const inp = document.getElementById(`rosco-preg-${i}`);
    if (inp) roscoEstado.letras[i].pregunta = inp.value;
  });

  roscoEstado.visible  = true;
  roscoEstado.iniciado = true;
  estado.rosco = roscoSerializar();
  estado.modo  = 'rosco';

  roscoTimer.reset(false);
  roscoSincronizar('rosco_mostrar');
  sfxSisPlay('pregunta');
  toast('Rosco enviado al overlay', 'ok');
}

function roscoCorrecta() {
  const idx = roscoEstado.letraActiva;
  roscoEstado.letras[idx].estado = 'correcta';
  roscoRenderEditorLetras();
  roscoRenderResumen();
  roscoSincronizar('rosco_estado');
  sfxSisPlay('correcto');
  setTimeout(() => roscoSiguiente(), 600);
}

function roscoFallada() {
  const idx = roscoEstado.letraActiva;
  roscoEstado.letras[idx].estado = 'fallada';
  roscoRenderEditorLetras();
  roscoRenderResumen();
  roscoSincronizar('rosco_estado');
  sfxSisPlay('incorrecto');
  setTimeout(() => roscoSiguiente(), 600);
}

function roscoReset() {
  if (!confirm('¿Resetear todas las letras a "pendiente"?')) return;
  roscoEstado.letras.forEach(l => { l.estado = 'pendiente'; });
  roscoEstado.letraActiva = 0;
  roscoEstado.iniciado    = false;
  roscoRenderEditorLetras();
  roscoRenderResumen();
  roscoSincronizar('rosco_mostrar');
  toast('Rosco reseteado', 'info');
}

function roscoLimpiar() {
  roscoInicializarLetras();
  roscoRenderEditorLetras();
  roscoRenderResumen();
  estado.rosco = null;
  estado.modo  = null;
  roscoTimer.reset(false);
  sincronizarOverlay({ comando: 'rosco_limpiar' });
  toast('Overlay limpiado', 'info');
}

// ── Serializar (solo lo necesario para el overlay) ───────────────
function roscoSerializar() {
  return {
    letras: roscoEstado.letras.map(l => ({
      letra:    l.letra,
      pregunta: l.pregunta,
      estado:   l.estado,
    })),
    letraActiva: roscoEstado.letraActiva,
    visible:     roscoEstado.visible,
  };
}

function roscoSincronizar(comando) {
  estado.rosco = roscoSerializar();
  estado.modo  = 'rosco';
  sincronizarOverlay({ comando });
}

// ═══════════════════════════════════════════════════════════════
// SETS DE PREGUNTAS (banco)
// ═══════════════════════════════════════════════════════════════
function roscoRenderSets() {
  const lista = document.getElementById('rosco-sets-lista');
  if (!lista) return;
  const sets = Object.keys(roscoBanco);
  if (!sets.length) {
    lista.innerHTML = '<div class="banco-vacio">No hay sets guardados.</div>';
    return;
  }
  lista.innerHTML = sets.map(nombre => `
    <div class="banco-item${roscoBancoSetActivo === nombre ? ' activo' : ''}">
      <div class="banco-item-num">📋</div>
      <div class="banco-item-texto">${nombre}</div>
      <button class="btn btn-dorado btn-sm" onclick="roscoCargarSet('${nombre}')">Cargar</button>
      <button class="banco-item-del" onclick="roscioBorrarSet('${nombre}', event)">✕</button>
    </div>
  `).join('');
}

function roscoGuardarSet() {
  const nombre = document.getElementById('rosco-nuevo-set')?.value.trim();
  if (!nombre) { toast('Escribe un nombre para el set.', 'error'); return; }
  // Leer preguntas actuales del DOM
  ROSCO_LETRAS.forEach((_, i) => {
    const inp = document.getElementById(`rosco-preg-${i}`);
    if (inp) roscoEstado.letras[i].pregunta = inp.value;
  });
  const preguntas = {};
  roscoEstado.letras.forEach(l => { preguntas[l.letra] = l.pregunta; });
  roscoBanco[nombre] = preguntas;
  localStorage.setItem(ROSCO_BANCO_KEY, JSON.stringify(roscoBanco));
  roscoBancoSetActivo = nombre;
  roscoRenderSets();
  document.getElementById('rosco-nuevo-set').value = '';
  toast(`Set "${nombre}" guardado`, 'ok');
}

function roscoCargarSet(nombre) {
  const preguntas = roscoBanco[nombre];
  if (!preguntas) return;
  roscoBancoSetActivo = nombre;
  ROSCO_LETRAS.forEach((letra, i) => {
    roscoEstado.letras[i].pregunta = preguntas[letra] || '';
  });
  roscoRenderEditorLetras();
  roscoRenderSets();
  toast(`Set "${nombre}" cargado`, 'ok');
}

function roscioBorrarSet(nombre, e) {
  e.stopPropagation();
  delete roscoBanco[nombre];
  localStorage.setItem(ROSCO_BANCO_KEY, JSON.stringify(roscoBanco));
  if (roscoBancoSetActivo === nombre) roscoBancoSetActivo = null;
  roscoRenderSets();
  toast(`Set "${nombre}" eliminado`, 'info');
}

function roscoExportarSet() {
  ROSCO_LETRAS.forEach((_, i) => {
    const inp = document.getElementById(`rosco-preg-${i}`);
    if (inp) roscoEstado.letras[i].pregunta = inp.value;
  });
  const preguntas = {};
  roscoEstado.letras.forEach(l => { preguntas[l.letra] = l.pregunta; });
  const blob = new Blob([JSON.stringify(preguntas, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `rosco_${roscoBancoSetActivo || 'set'}.json`;
  a.click();
  toast('Set exportado', 'ok');
}

function roscoImportarSet(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const datos = JSON.parse(ev.target.result);
      ROSCO_LETRAS.forEach((letra, i) => {
        if (datos[letra] !== undefined) {
          roscoEstado.letras[i].pregunta = datos[letra];
        }
      });
      roscoRenderEditorLetras();
      toast('Set importado', 'ok');
    } catch { toast('Archivo JSON inválido.', 'error'); }
  };
  r.readAsText(f); e.target.value = '';
}

// ═══════════════════════════════════════════════════════════════
// MÚSICA
// ═══════════════════════════════════════════════════════════════
function roscoPlayMusica()  { const a=document.getElementById('rosco-audio'); if(!a?.src||a.src===location.href){toast('Carga una pista.','error');return;} a.play(); }
function roscoPausaMusica() { document.getElementById('rosco-audio')?.pause(); }
function roscoStopMusica()  { const a=document.getElementById('rosco-audio'); if(a){a.pause();a.currentTime=0;} }
function roscoVolMusica(v)  { const a=document.getElementById('rosco-audio'); if(a)a.volume=v/100; const l=document.getElementById('rosco-vol-musica-lbl'); if(l)l.textContent=v+'%'; }

// ═══════════════════════════════════════════════════════════════
// ACTIVAR MODO
// ═══════════════════════════════════════════════════════════════
function roscoActivarModo() {
  estado.modo  = 'rosco';
  estado.rosco = roscoSerializar();
  sincronizarOverlay({ comando: 'activar_modo' });
  toast('Modo Rosco activado en el overlay', 'ok');
}
