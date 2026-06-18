// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-TIPO-TEST.JS  v2.1
// ═══════════════════════════════════════════════════════════════

const TT_LETRAS  = ['A', 'B', 'C', 'D'];
const TT_COLORES = ['#3498db', '#e67e22', '#2ecc71', '#9b59b6'];

let ttTimer = {
  intervalo: null,
  corriendo: false,
  valor: 30,
  max: 30,
};

// timerVisible: controla si el timer circular se ve en el overlay
// Es independiente de la pregunta.
let ttTimerVisible = false;

let ttAudioCtx = null;
let ttBanco    = [];
let ttBancoActivo = -1;

// ═══════════════════════════════════════════════════════════════
// INICIALIZACIÓN
// ═══════════════════════════════════════════════════════════════

// Instancias de módulos compartidos para Tipo Test
let ttMedia = null;
let ttTimerObj = null;

function initTipoTest() {
  ttGenerarOpcionesEditor();
  ttCargarBanco();
  ttRenderBanco();
  renderBibliotecaGrid('tt');

  // Media panel compartido
  ttMedia = new MediaPanel('tt');
  ttMedia.init();

  // Timer compartido (sustituye ttTimer interno)
  ttTimerObj = new GameTimer('tt');
  ttTimerObj.init();
  // Alias para compatibilidad con funciones que usan ttTimerVisible, ttResetTimer, etc.
  ttTimerVisible = false;

  sfxInit('tt');

  // Listener música
  document.getElementById('tt-input-musica')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    ttSetPista(f.name, URL.createObjectURL(f));
  });
  document.getElementById('tt-progreso-musica')?.addEventListener('input', (e) => {
    const audio = document.getElementById('tt-audio');
    if (audio?.duration) audio.currentTime = (e.target.value / 100) * audio.duration;
  });
  document.getElementById('tt-audio')?.addEventListener('timeupdate', () => {
    const audio  = document.getElementById('tt-audio');
    const slider = document.getElementById('tt-progreso-musica');
    if (audio?.duration && slider) slider.value = (audio.currentTime / audio.duration) * 100;
  });
}

// ═══════════════════════════════════════════════════════════════
// EDITOR DE OPCIONES
// ═══════════════════════════════════════════════════════════════

function ttGenerarOpcionesEditor() {
  const c = document.getElementById('tt-opciones-editor');
  if (!c) return;
  c.innerHTML = '';

  TT_LETRAS.forEach((letra, i) => {
    const row = document.createElement('div');
    row.className = 'opcion-row';
    row.id = `tt-fila-${i}`;

    const circulo = document.createElement('div');
    circulo.className = 'opcion-letra';
    circulo.textContent = letra;
    circulo.style.borderColor = TT_COLORES[i];
    circulo.style.color = TT_COLORES[i];

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id   = `tt-opcion-${i}`;
    inp.placeholder = `Opción ${letra}...`;
    inp.addEventListener('input', () => { estado.tipoTest.opciones[i] = inp.value; });

    const acciones = document.createElement('div');
    acciones.className = 'opcion-acciones';

    const btnCorr = document.createElement('button');
    btnCorr.className = 'btn btn-verde btn-sm';
    btnCorr.title     = 'Marcar como correcta';
    btnCorr.innerHTML = '✔';
    btnCorr.addEventListener('click', () => ttMarcarCorrecta(i));

    const btnRes = document.createElement('button');
    btnRes.className = 'btn btn-dorado btn-sm';
    btnRes.title     = 'Resaltar (respuesta del concursante)';
    btnRes.innerHTML = '►';
    btnRes.addEventListener('click', () => ttResaltarOpcion(i));

    acciones.appendChild(btnCorr);
    acciones.appendChild(btnRes);
    row.appendChild(circulo);
    row.appendChild(inp);
    row.appendChild(acciones);
    c.appendChild(row);
  });
}

function ttMarcarCorrecta(i) {
  estado.tipoTest.correcta = i;
  TT_LETRAS.forEach((_, j) => document.getElementById(`tt-fila-${j}`).classList.remove('es-correcta'));
  document.getElementById(`tt-fila-${i}`).classList.add('es-correcta');
}

function ttResaltarOpcion(i) {
  if (estado.tipoTest.resaltada === i) {
    estado.tipoTest.resaltada = -1;
    document.getElementById(`tt-fila-${i}`).classList.remove('resaltada');
  } else {
    TT_LETRAS.forEach((_, j) => document.getElementById(`tt-fila-${j}`).classList.remove('resaltada'));
    estado.tipoTest.resaltada = i;
    document.getElementById(`tt-fila-${i}`).classList.add('resaltada');
  }
  sincronizarOverlay({ comando: 'resaltar' });
}

// ═══════════════════════════════════════════════════════════════
// ACCIONES PREGUNTA
// ═══════════════════════════════════════════════════════════════

function ttMostrarPregunta() {
  const pregunta = document.getElementById('tt-input-pregunta').value.trim();
  if (!pregunta) { toast('Escribe una pregunta primero.', 'error'); return; }

  TT_LETRAS.forEach((_, i) => {
    estado.tipoTest.opciones[i] = document.getElementById(`tt-opcion-${i}`).value.trim();
  });
  estado.tipoTest.pregunta  = pregunta;
  estado.tipoTest.visible   = true;
  estado.tipoTest.revelar   = false;
  estado.tipoTest.resaltada = -1;
  estado.modo = 'tipo-test';

  // Resetear timer automáticamente sin arrancarlo
  ttResetTimer(false); // false = no sincronizar aún (lo hace el sincronizarOverlay de abajo)

  sincronizarOverlay({ comando: 'mostrar_pregunta' });
  sfxSisPlay('pregunta');
  toast('Pregunta enviada al overlay', 'ok');
}

function ttRevelarRespuesta() {
  if (estado.tipoTest.correcta < 0) { toast('Marca la opción correcta primero.', 'error'); return; }

  const acerto = estado.tipoTest.resaltada === estado.tipoTest.correcta;
  estado.tipoTest.revelar = true;

  // Parar el timer automáticamente al revelar
  ttPararTimerSilencioso();

  sincronizarOverlay({ comando: 'revelar_respuesta' });
  sfxSisPlay(acerto ? 'correcto' : 'incorrecto');
}

function ttLimpiarPregunta() {
  document.getElementById('tt-input-pregunta').value = '';
  TT_LETRAS.forEach((_, i) => {
    document.getElementById(`tt-opcion-${i}`).value = '';
    document.getElementById(`tt-fila-${i}`).classList.remove('es-correcta', 'resaltada');
  });

  estado.tipoTest = {
    pregunta: '', opciones: ['','','',''],
    correcta: -1, resaltada: -1,
    visible: false, revelar: false,
  };
  estado.modo   = null;
  ttBancoActivo = -1;
  ttRenderBanco();

  // Resetear timer sin arrancar
  ttResetTimer(false);

  sincronizarOverlay({ comando: 'limpiar' });
  toast('Overlay limpiado', 'info');
}

// ═══════════════════════════════════════════════════════════════
// BANCO DE PREGUNTAS
// ═══════════════════════════════════════════════════════════════

const TT_BANCO_KEY = 'konkursox_banco_tipotest';

function ttCargarBanco() {
  try { ttBanco = JSON.parse(localStorage.getItem(TT_BANCO_KEY) || '[]'); }
  catch { ttBanco = []; }
}

function ttGuardarEnBanco() {
  const pregunta = document.getElementById('tt-input-pregunta').value.trim();
  if (!pregunta) { toast('Escribe una pregunta para guardar.', 'error'); return; }
  const opciones = TT_LETRAS.map((_, i) => document.getElementById(`tt-opcion-${i}`).value.trim());
  const item = { pregunta, opciones, correcta: estado.tipoTest.correcta };

  if (ttBancoActivo >= 0) {
    ttBanco[ttBancoActivo] = item;
    toast('Pregunta actualizada', 'ok');
  } else {
    ttBanco.push(item);
    ttBancoActivo = ttBanco.length - 1;
    toast('Pregunta guardada', 'ok');
  }
  localStorage.setItem(TT_BANCO_KEY, JSON.stringify(ttBanco));
  ttRenderBanco();
}

function ttCargarDesdeBanco(i) {
  const item = ttBanco[i];
  if (!item) return;
  ttBancoActivo = i;
  document.getElementById('tt-input-pregunta').value = item.pregunta;
  TT_LETRAS.forEach((_, j) => {
    document.getElementById(`tt-opcion-${j}`).value = item.opciones[j] || '';
    estado.tipoTest.opciones[j] = item.opciones[j] || '';
    document.getElementById(`tt-fila-${j}`).classList.remove('es-correcta', 'resaltada');
  });
  estado.tipoTest.pregunta  = item.pregunta;
  estado.tipoTest.correcta  = item.correcta ?? -1;
  estado.tipoTest.resaltada = -1;
  if (item.correcta >= 0) document.getElementById(`tt-fila-${item.correcta}`)?.classList.add('es-correcta');
  ttRenderBanco();
  toast('Pregunta cargada', 'info');
}

function ttBorrarDeBanco(i, e) {
  e.stopPropagation();
  ttBanco.splice(i, 1);
  if (ttBancoActivo === i)      ttBancoActivo = -1;
  else if (ttBancoActivo > i)   ttBancoActivo--;
  localStorage.setItem(TT_BANCO_KEY, JSON.stringify(ttBanco));
  ttRenderBanco();
  toast('Pregunta eliminada', 'info');
}

function ttRenderBanco() {
  const lista = document.getElementById('tt-banco-lista');
  if (!lista) return;
  if (!ttBanco.length) {
    lista.innerHTML = '<div class="banco-vacio">No hay preguntas guardadas todavía.</div>';
    return;
  }
  lista.innerHTML = ttBanco.map((item, i) => `
    <div class="banco-item${ttBancoActivo === i ? ' activo' : ''}" onclick="ttCargarDesdeBanco(${i})">
      <div class="banco-item-num">${i + 1}</div>
      <div class="banco-item-texto">${item.pregunta}</div>
      <button class="banco-item-del" onclick="ttBorrarDeBanco(${i}, event)" title="Eliminar">✕</button>
    </div>
  `).join('');
}

function ttExportarBanco() {
  if (!ttBanco.length) { toast('El banco está vacío.', 'error'); return; }
  const blob = new Blob([JSON.stringify(ttBanco, null, 2)], { type: 'application/json' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'banco_tipotest.json';
  a.click();
  toast('Banco exportado', 'ok');
}

function ttImportarBanco(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const datos = JSON.parse(ev.target.result);
      if (!Array.isArray(datos)) throw new Error();
      ttBanco = [...ttBanco, ...datos];
      localStorage.setItem(TT_BANCO_KEY, JSON.stringify(ttBanco));
      ttRenderBanco();
      toast(`${datos.length} preguntas importadas`, 'ok');
    } catch { toast('Archivo JSON inválido.', 'error'); }
  };
  reader.readAsText(f);
  e.target.value = '';
}

// ═══════════════════════════════════════════════════════════════
// TEMPORIZADOR
// Tiene su propio botón de visibilidad en el overlay,
// completamente independiente de mostrar/ocultar la pregunta.
// ═══════════════════════════════════════════════════════════════

function ttActualizarDisplayTimer(sincronizar = true) {
  const display = document.getElementById('tt-display-tiempo');
  const barra   = document.getElementById('tt-barra-tiempo');
  if (!display || !barra) return;

  display.textContent = ttTimer.valor;
  barra.style.width   = ((ttTimer.valor / ttTimer.max) * 100) + '%';

  const urgente = ttTimer.valor <= 10 && ttTimer.valor > 0;
  display.classList.toggle('urgente', urgente);
  barra.classList.toggle('urgente', urgente);

  if (sincronizar) {
    estado.timer.valor     = ttTimer.valor;
    estado.timer.max       = ttTimer.max;
    estado.timer.corriendo = ttTimer.corriendo;
    // Los ticks del timer NO llevan 'comando', así el overlay
    // no toca la sección de preguntas ni el mensaje.
    sincronizarOverlay({ timerVisible: ttTimerVisible });
  }
}

// Delegación al objeto compartido GameTimer
function ttToggleTimerOverlay() { ttTimerObj.toggleVisible(); }
function ttIniciarTimer()       { ttTimerObj.iniciar(); }
function ttPausarTimer()        { ttTimerObj.pausar(); }
function ttDetenerTimer()       { ttTimerObj.detener(); }
function ttPararTimerSilencioso() { ttTimerObj.pararSilencioso(); }
function ttResetTimer(sincronizar = true) { ttTimerObj.reset(sincronizar); }

// ═══════════════════════════════════════════════════════════════
// MULTIMEDIA — delegado a MediaPanel (shared-media.js)
// ttMedia se instancia en initTipoTest()
// ═══════════════════════════════════════════════════════════════
// Las funciones ttMedia.lanzar(), ttMedia.cerrar(), etc.
// están disponibles directamente desde el HTML via onclick.

// ═══════════════════════════════════════════════════════════════
// REPRODUCTOR DE MÚSICA
// ═══════════════════════════════════════════════════════════════

function ttSetPista(nombre, url) {
  const audio = document.getElementById('tt-audio');
  if (!audio) return;
  audio.src = url;
  const lbl = document.getElementById('tt-nombre-pista');
  if (lbl) lbl.textContent = nombre.length > 40 ? nombre.slice(0,40)+'…' : nombre;
}

function ttPlayMusica() {
  const audio = document.getElementById('tt-audio');
  if (!audio?.src || audio.src === window.location.href) { toast('Carga una pista primero.', 'error'); return; }
  audio.play();
}
function ttPausaMusica() { document.getElementById('tt-audio')?.pause(); }
function ttStopMusica()  {
  const audio = document.getElementById('tt-audio');
  if (!audio) return;
  audio.pause();
  audio.currentTime = 0;
}
function ttVolumenMusica(v) {
  const audio = document.getElementById('tt-audio');
  if (audio) audio.volume = v / 100;
  const lbl = document.getElementById('tt-vol-musica-lbl');
  if (lbl) lbl.textContent = v + '%';
}

// ═══════════════════════════════════════════════════════════════
// EFECTOS DE SONIDO (Web Audio API)
// ═══════════════════════════════════════════════════════════════

function ttGetAudioCtx() {
  if (!ttAudioCtx) ttAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return ttAudioCtx;
}

function ttSfx(tipo) {
  const ctx = ttGetAudioCtx();
  const vol = (document.getElementById('tt-vol-sfx')?.value ?? 70) / 100;

  const g = ctx.createGain();
  g.connect(ctx.destination);
  const now = ctx.currentTime;

  const nota = (freq, start, dur, gainVal = vol, type = 'sine') => {
    const o = ctx.createOscillator();
    const gn = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    gn.gain.setValueAtTime(gainVal, now + start);
    gn.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
    o.connect(gn); gn.connect(ctx.destination);
    o.start(now + start); o.stop(now + start + dur);
  };

  switch (tipo) {
    case 'pregunta':
      nota(440, 0, .15); nota(660, .15, .15); nota(880, .3, .3); break;
    case 'correcto':
      nota(523, 0, .35); nota(659, .12, .35); nota(784, .25, .45); break;
    case 'incorrecto':
      nota(300, 0, .5, vol * .5, 'sawtooth');
      nota(200, .15, .4, vol * .4, 'sawtooth'); break;
    case 'tic':
      nota(1000, 0, .08, vol * .3, 'square'); break;
    case 'tension':
      nota(200, 0, 1.8, vol * .4, 'triangle'); nota(210, .3, 1.5, vol * .3, 'triangle'); break;
    case 'victoria':
      [523, 587, 659, 698, 784].forEach((f, j) => nota(f, j * .1, .5, vol * .6)); break;
  }
}

function ttVolSfx(v) {
  const lbl = document.getElementById('tt-vol-sfx-lbl');
  if (lbl) lbl.textContent = v + '%';
}

// ═══════════════════════════════════════════════════════════════
// ACTIVAR MODO EN OVERLAY
// ═══════════════════════════════════════════════════════════════

function ttActivarModoEnOverlay() {
  estado.modo = 'tipo-test';
  sincronizarOverlay({ comando: 'activar_modo' });
  toast('Modo Tipo Test activado en el overlay', 'ok');
}
