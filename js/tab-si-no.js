// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-SI-NO.JS  v2
// Pestaña de preguntas de dos opciones (Sí/No, Verdadero/Falso…)
// ═══════════════════════════════════════════════════════════════

const SN_COLORES = ['#2ecc71', '#e74c3c'];

let snAudioCtx = null;
let snBanco    = [];
let snBancoActivo = -1;

// Instancias compartidas
let snMedia  = null;
let snTimer  = null;

// Estado de la pregunta actual
const snEstado = {
  pregunta:  '',
  opciones:  ['SÍ', 'NO'],
  correcta:  -1,
  resaltada: -1,
  visible:   false,
  revelar:   false,
};

// ═══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════

function initSiNo() {
  snCargarBanco();
  snRenderBanco();
  renderBibliotecaGrid('sn');

  snMedia = new MediaPanel('sn');
  snMedia.init();

  snTimer = new GameTimer('sn');
  snTimer.init();

  sfxInit('sn');

  // Música
  document.getElementById('sn-input-musica')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const audio = document.getElementById('sn-audio');
    audio.src = URL.createObjectURL(f);
    const lbl = document.getElementById('sn-nombre-pista');
    if (lbl) lbl.textContent = f.name.length > 40 ? f.name.slice(0,40)+'…' : f.name;
  });
  document.getElementById('sn-progreso-musica')?.addEventListener('input', (e) => {
    const audio = document.getElementById('sn-audio');
    if (audio?.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
  });
  document.getElementById('sn-audio')?.addEventListener('timeupdate', () => {
    const audio  = document.getElementById('sn-audio');
    const slider = document.getElementById('sn-progreso-musica');
    if (audio?.duration && slider) slider.value = (audio.currentTime / audio.duration) * 100;
  });

  // Sync inicial de opciones desde los inputs
  [0, 1].forEach(i => {
    document.getElementById(`sn-opcion-${i}`)?.addEventListener('input', (e) => {
      snEstado.opciones[i] = e.target.value;
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// ACCIONES PREGUNTA
// ═══════════════════════════════════════════════════════════════

function snMostrarPregunta() {
  const pregunta = document.getElementById('sn-input-pregunta').value.trim();
  if (!pregunta) { toast('Escribe una pregunta primero.', 'error'); return; }

  snEstado.pregunta  = pregunta;
  snEstado.opciones  = [0, 1].map(i => document.getElementById(`sn-opcion-${i}`).value.trim() || ['SÍ','NO'][i]);
  snEstado.visible   = true;
  snEstado.revelar   = false;
  snEstado.resaltada = -1;
  estado.siNo = { ...snEstado };
  estado.modo = 'si-no';

  snTimer.reset(false);
  sincronizarOverlay({ comando: 'mostrar_pregunta' });
  sfxSisPlay('pregunta');
  toast('Pregunta enviada al overlay', 'ok');
}

function snRevelar() {
  if (snEstado.correcta < 0) { toast('Marca la opción correcta primero.', 'error'); return; }
  snEstado.revelar = true;
  estado.siNo = { ...snEstado };
  snTimer.pararSilencioso();
  sincronizarOverlay({ comando: 'revelar_respuesta' });
  sfxSisPlay(snEstado.resaltada === snEstado.correcta ? 'correcto' : 'incorrecto');
}

function snLimpiar() {
  document.getElementById('sn-input-pregunta').value = '';
  [0, 1].forEach(i => {
    document.getElementById(`sn-fila-${i}`)?.classList.remove('es-correcta', 'resaltada');
  });
  Object.assign(snEstado, { pregunta:'', correcta:-1, resaltada:-1, visible:false, revelar:false });
  snBancoActivo = -1;
  snRenderBanco();
  estado.siNo = { ...snEstado };
  estado.modo = null;
  snTimer.reset(false);
  sincronizarOverlay({ comando: 'limpiar' });
  toast('Overlay limpiado', 'info');
}

function snMarcarCorrecta(i) {
  snEstado.correcta = i;
  [0, 1].forEach(j => document.getElementById(`sn-fila-${j}`)?.classList.remove('es-correcta'));
  document.getElementById(`sn-fila-${i}`)?.classList.add('es-correcta');
}

function snResaltar(i) {
  if (snEstado.resaltada === i) {
    snEstado.resaltada = -1;
    document.getElementById(`sn-fila-${i}`)?.classList.remove('resaltada');
  } else {
    [0, 1].forEach(j => document.getElementById(`sn-fila-${j}`)?.classList.remove('resaltada'));
    snEstado.resaltada = i;
    document.getElementById(`sn-fila-${i}`)?.classList.add('resaltada');
  }
  estado.siNo = { ...snEstado };
  sincronizarOverlay({ comando: 'resaltar' });
}

// ═══════════════════════════════════════════════════════════════
// BANCO DE PREGUNTAS
// ═══════════════════════════════════════════════════════════════

const SN_BANCO_KEY = 'konkursox_banco_sino';

function snCargarBanco() {
  try { snBanco = JSON.parse(localStorage.getItem(SN_BANCO_KEY) || '[]'); }
  catch { snBanco = []; }
}

function snGuardar() {
  const pregunta = document.getElementById('sn-input-pregunta').value.trim();
  if (!pregunta) { toast('Escribe una pregunta para guardar.', 'error'); return; }
  const opciones = [0,1].map(i => document.getElementById(`sn-opcion-${i}`).value.trim() || ['SÍ','NO'][i]);
  const item = { pregunta, opciones, correcta: snEstado.correcta };

  if (snBancoActivo >= 0) {
    snBanco[snBancoActivo] = item;
    toast('Pregunta actualizada', 'ok');
  } else {
    snBanco.push(item);
    snBancoActivo = snBanco.length - 1;
    toast('Pregunta guardada', 'ok');
  }
  localStorage.setItem(SN_BANCO_KEY, JSON.stringify(snBanco));
  snRenderBanco();
}

function snCargarDesdeBanco(i) {
  const item = snBanco[i];
  if (!item) return;
  snBancoActivo = i;
  document.getElementById('sn-input-pregunta').value = item.pregunta;
  [0,1].forEach((_, j) => {
    const inp = document.getElementById(`sn-opcion-${j}`);
    if (inp) inp.value = item.opciones[j] || ['SÍ','NO'][j];
    snEstado.opciones[j] = item.opciones[j] || ['SÍ','NO'][j];
    document.getElementById(`sn-fila-${j}`)?.classList.remove('es-correcta', 'resaltada');
  });
  snEstado.pregunta  = item.pregunta;
  snEstado.correcta  = item.correcta ?? -1;
  snEstado.resaltada = -1;
  if (item.correcta >= 0) document.getElementById(`sn-fila-${item.correcta}`)?.classList.add('es-correcta');
  snRenderBanco();
  toast('Pregunta cargada', 'info');
}

function snBorrarDeBanco(i, e) {
  e.stopPropagation();
  snBanco.splice(i, 1);
  if (snBancoActivo === i) snBancoActivo = -1;
  else if (snBancoActivo > i) snBancoActivo--;
  localStorage.setItem(SN_BANCO_KEY, JSON.stringify(snBanco));
  snRenderBanco();
  toast('Pregunta eliminada', 'info');
}

function snRenderBanco() {
  const lista = document.getElementById('sn-banco-lista');
  if (!lista) return;
  if (!snBanco.length) {
    lista.innerHTML = '<div class="banco-vacio">No hay preguntas guardadas todavía.</div>';
    return;
  }
  lista.innerHTML = snBanco.map((item, i) => `
    <div class="banco-item${snBancoActivo === i ? ' activo' : ''}" onclick="snCargarDesdeBanco(${i})">
      <div class="banco-item-num">${i + 1}</div>
      <div class="banco-item-texto">${item.pregunta}</div>
      <button class="banco-item-del" onclick="snBorrarDeBanco(${i}, event)" title="Eliminar">✕</button>
    </div>`).join('');
}

function snExportarBanco() {
  if (!snBanco.length) { toast('El banco está vacío.', 'error'); return; }
  const blob = new Blob([JSON.stringify(snBanco, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'banco_sino.json';
  a.click();
  toast('Banco exportado', 'ok');
}

function snImportarBanco(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const datos = JSON.parse(ev.target.result);
      if (!Array.isArray(datos)) throw new Error();
      snBanco = [...snBanco, ...datos];
      localStorage.setItem(SN_BANCO_KEY, JSON.stringify(snBanco));
      snRenderBanco();
      toast(`${datos.length} preguntas importadas`, 'ok');
    } catch { toast('Archivo JSON inválido.', 'error'); }
  };
  reader.readAsText(f);
  e.target.value = '';
}

// ═══════════════════════════════════════════════════════════════
// MÚSICA
// ═══════════════════════════════════════════════════════════════

function snPlayMusica() {
  const a = document.getElementById('sn-audio');
  if (!a?.src || a.src === window.location.href) { toast('Carga una pista primero.', 'error'); return; }
  a.play();
}
function snPausaMusica() { document.getElementById('sn-audio')?.pause(); }
function snStopMusica()  { const a = document.getElementById('sn-audio'); if (a) { a.pause(); a.currentTime = 0; } }
function snVolMusica(v)  {
  const a = document.getElementById('sn-audio');
  if (a) a.volume = v / 100;
  const lbl = document.getElementById('sn-vol-musica-lbl');
  if (lbl) lbl.textContent = v + '%';
}

// ═══════════════════════════════════════════════════════════════
// SFX — reutiliza la misma lógica que Tipo Test
// ═══════════════════════════════════════════════════════════════

function snGetAudioCtx() {
  if (!snAudioCtx) snAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return snAudioCtx;
}

function snSfx(tipo) {
  const ctx = snGetAudioCtx();
  const vol = (document.getElementById('sn-vol-sfx')?.value ?? 70) / 100;
  const now = ctx.currentTime;
  const nota = (freq, start, dur, gainVal = vol, type = 'sine') => {
    const o = ctx.createOscillator(); const gn = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    gn.gain.setValueAtTime(gainVal, now + start);
    gn.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    o.connect(gn); gn.connect(ctx.destination);
    o.start(now + start); o.stop(now + start + dur);
  };
  switch (tipo) {
    case 'pregunta':   nota(440,0,.15); nota(660,.15,.15); nota(880,.3,.3); break;
    case 'correcto':   nota(523,0,.35); nota(659,.12,.35); nota(784,.25,.45); break;
    case 'incorrecto': nota(300,0,.5,vol*.5,'sawtooth'); nota(200,.15,.4,vol*.4,'sawtooth'); break;
    case 'tic':        nota(1000,0,.08,vol*.3,'square'); break;
    case 'tension':    nota(200,0,1.8,vol*.4,'triangle'); nota(210,.3,1.5,vol*.3,'triangle'); break;
    case 'victoria':   [523,587,659,698,784].forEach((f,j) => nota(f,j*.1,.5,vol*.6)); break;
  }
}

function snVolSfx(v) {
  const lbl = document.getElementById('sn-vol-sfx-lbl');
  if (lbl) lbl.textContent = v + '%';
}

// ═══════════════════════════════════════════════════════════════
// ACTIVAR MODO EN OVERLAY
// ═══════════════════════════════════════════════════════════════

function snActivarModo() {
  estado.modo = 'si-no';
  estado.siNo = { ...snEstado };
  sincronizarOverlay({ comando: 'activar_modo' });
  toast('Modo Sí/No activado en el overlay', 'ok');
}
