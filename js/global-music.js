// ═══════════════════════════════════════════════════════════════
// KONKURSOX — GLOBAL-MUSIC.JS  v2
// Reproductor global con:
//   - Fade in al reproducir
//   - Fade out al pausar/parar
//   - Crossfade al cambiar de canción
//   - Lista rápida de canciones desde la biblioteca
// ═══════════════════════════════════════════════════════════════

const GM_FADE_DURACION = 1.2;   // segundos de fade
const GM_CROSS_DURACION = 1.8;  // segundos de crossfade

let gmAudio      = null;
let gmVolumen    = 0.6;         // volumen objetivo (0-1)
let gmRepetir    = true;
let gmFadeTimer  = null;        // rAF del fade activo
let gmFadiendo   = false;

function gmInit() {
  gmAudio = document.getElementById('gm-audio');
  if (!gmAudio) return;

  gmAudio.volume = 0; // empieza en silencio, sube con fade
  gmAudio.loop   = gmRepetir;

  // Progreso
  gmAudio.addEventListener('timeupdate', () => {
    if (!gmAudio.duration) return;
    const pct = (gmAudio.currentTime / gmAudio.duration) * 100;
    const slider = document.getElementById('gm-progreso');
    if (slider && document.activeElement !== slider) slider.value = pct;
    const elAct = document.getElementById('gm-tiempo-actual');
    const elTot = document.getElementById('gm-tiempo-total');
    if (elAct) elAct.textContent = fmtGmTiempo(gmAudio.currentTime);
    if (elTot) elTot.textContent = fmtGmTiempo(gmAudio.duration);
  });

  gmAudio.addEventListener('ended', () => {
    if (!gmRepetir) gmActualizarBtnPlay(false);
  });

  // Seek
  document.getElementById('gm-progreso')?.addEventListener('input', (e) => {
    if (gmAudio.duration) gmAudio.currentTime = (e.target.value / 100) * gmAudio.duration;
  });

  // Volumen slider
  const volSlider = document.getElementById('gm-vol');
  if (volSlider) {
    volSlider.value = gmVolumen * 100;
    volSlider.addEventListener('input', (e) => {
      gmVolumen = e.target.value / 100;
      // Si hay audio sonando, aplicar volumen directamente (sin fade)
      if (gmAudio && !gmAudio.paused) gmAudio.volume = gmVolumen;
      document.getElementById('gm-vol-lbl').textContent = Math.round(gmVolumen * 100) + '%';
    });
  }

  // Renderizar lista rápida al cargar
  gmRenderListaRapida();
}

// ── Fade ───────────────────────────────────────────────────────────
function gmFade(audioEl, desde, hasta, duracion, onComplete) {
  if (gmFadeTimer) cancelAnimationFrame(gmFadeTimer);
  gmFadiendo = true;
  audioEl.volume = Math.max(0, Math.min(1, desde));

  const inicio    = performance.now();
  const diferencia = hasta - desde;

  function step(ahora) {
    const transcurrido = (ahora - inicio) / 1000;
    const progreso     = Math.min(transcurrido / duracion, 1);
    // Curva ease-in-out
    const ease = progreso < 0.5
      ? 2 * progreso * progreso
      : 1 - Math.pow(-2 * progreso + 2, 2) / 2;

    audioEl.volume = Math.max(0, Math.min(1, desde + diferencia * ease));

    if (progreso < 1) {
      gmFadeTimer = requestAnimationFrame(step);
    } else {
      gmFadeTimer = null;
      gmFadiendo  = false;
      if (onComplete) onComplete();
    }
  }
  gmFadeTimer = requestAnimationFrame(step);
}

// ── Acciones ───────────────────────────────────────────────────────
function gmCargarArchivo(e) {
  const f = e.target.files[0];
  if (!f) return;
  gmCargarBlob(URL.createObjectURL(f), f.name);
  e.target.value = '';
}

function gmCargarBlob(url, nombre, color) {
  const yaReproduciendo = gmAudio && !gmAudio.paused && gmAudio.volume > 0;

  if (yaReproduciendo) {
    // Crossfade: bajar el actual y subir el nuevo
    gmFade(gmAudio, gmAudio.volume, 0, GM_CROSS_DURACION / 2, () => {
      gmAudio.pause();
      gmAudio.currentTime = 0;
      gmAudio.src = url;
      document.getElementById('gm-nombre-pista').textContent =
        nombre.length > 35 ? nombre.slice(0, 35) + '…' : nombre;
      gmActualizarColor(color);
      gmAudio.volume = 0;
      gmAudio.play().then(() => {
        gmFade(gmAudio, 0, gmVolumen, GM_CROSS_DURACION / 2, null);
        gmActualizarBtnPlay(true);
      }).catch(() => {});
    });
  } else {
    gmAudio.src = url;
    document.getElementById('gm-nombre-pista').textContent =
      nombre.length > 35 ? nombre.slice(0, 35) + '…' : nombre;
    gmActualizarColor(color);
    gmAudio.volume = 0;
    gmAudio.play().then(() => {
      gmFade(gmAudio, 0, gmVolumen, GM_FADE_DURACION, null);
      gmActualizarBtnPlay(true);
    }).catch(() => {});
  }
}

function gmActualizarColor(color) {
  const dot = document.getElementById('gm-color-dot');
  if (dot) dot.style.background = color || '#444a5a';
}

function gmPlay() {
  if (!gmAudio?.src || gmAudio.src === location.href) {
    toast('Carga una pista primero.', 'error'); return;
  }
  if (!gmAudio.paused) return;
  gmAudio.volume = 0;
  gmAudio.play().then(() => {
    gmFade(gmAudio, 0, gmVolumen, GM_FADE_DURACION, null);
    gmActualizarBtnPlay(true);
  }).catch(() => {});
}

function gmPausa() {
  if (!gmAudio || gmAudio.paused) return;
  gmFade(gmAudio, gmAudio.volume, 0, GM_FADE_DURACION, () => {
    gmAudio.pause();
    gmActualizarBtnPlay(false);
  });
}

function gmStop() {
  if (!gmAudio) return;
  gmFade(gmAudio, gmAudio.volume, 0, GM_FADE_DURACION, () => {
    gmAudio.pause();
    gmAudio.currentTime = 0;
    gmActualizarBtnPlay(false);
    const slider = document.getElementById('gm-progreso');
    if (slider) slider.value = 0;
    const elAct = document.getElementById('gm-tiempo-actual');
    if (elAct) elAct.textContent = '0:00';
  });
}

function gmTogglePlay() {
  if (!gmAudio) return;
  gmAudio.paused ? gmPlay() : gmPausa();
}

function gmToggleRepetir() {
  gmRepetir = !gmRepetir;
  if (gmAudio) gmAudio.loop = gmRepetir;
  const btn = document.getElementById('gm-btn-repetir');
  if (btn) {
    btn.className = `btn btn-sm ${gmRepetir ? 'btn-dorado' : 'btn-gris'}`;
    btn.title     = gmRepetir ? 'Repetir: ON' : 'Repetir: OFF';
  }
}

function gmActualizarBtnPlay(reproduciendo) {
  const btn = document.getElementById('gm-btn-play');
  if (btn) btn.textContent = reproduciendo ? '⏸' : '▶';
}

function fmtGmTiempo(seg) {
  if (!seg || isNaN(seg)) return '0:00';
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ── Lista rápida de canciones ──────────────────────────────────────
// Se llama desde initBiblioteca y al añadir/eliminar audios
function gmRenderListaRapida() {
  const lista = document.getElementById('gm-lista-rapida');
  if (!lista) return;

  // Obtener audios de la biblioteca (desde localStorage)
  let items = [];
  try {
    items = JSON.parse(localStorage.getItem('konkursox_biblioteca') || '[]')
      .filter(i => i.tipo === 'audio');
  } catch {}

  if (!items.length) {
    lista.innerHTML = '<div class="gm-lista-vacia">Sin pistas. Sube audios en la Biblioteca.</div>';
    return;
  }

  lista.innerHTML = items.map(item => `
    <div class="gm-pista-item" onclick="gmSeleccionarPista('${item.id}')"
      title="${item.nombre}">
      <div class="gm-pista-color" style="background:${item.color || '#444a5a'}"></div>
      <div class="gm-pista-nombre">${item.nombre.length > 28 ? item.nombre.slice(0,28)+'…' : item.nombre}</div>
    </div>`).join('');
}

async function gmSeleccionarPista(id) {
  // 1. Buscar en el array en memoria (tiene URLs de blob activas de la sesión)
  let item = (window.bibliotecaArchivos || []).find(i => i.id === id);
  let url = item?.url;

  // 2. Si no está en memoria o la URL no sirve, leer metadatos desde localStorage
  if (!url) {
    if (!item) {
      try {
        const saved = JSON.parse(localStorage.getItem('konkursox_biblioteca') || '[]');
        item = saved.find(i => i.id === id);
      } catch {}
    }
    if (!item) return;
    // Restaurar URL desde IndexedDB
    try { url = await dbObtenerArchivoUrl(id); } catch {}
  }

  if (!url) {
    toast('Archivo no disponible. Abre la pestaña Biblioteca para restaurarlo.', 'error');
    return;
  }

  gmCargarBlob(url, item.nombre, item.color);
}

// ── Toggle lista rápida ────────────────────────────────────────────
function gmToggleLista() {
  const panel = document.getElementById('gm-lista-rapida-panel');
  if (!panel) return;
  const visible = panel.style.display !== 'none';
  panel.style.display = visible ? 'none' : 'block';
  if (!visible) gmRenderListaRapida();
}
