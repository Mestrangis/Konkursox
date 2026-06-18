// ═══════════════════════════════════════════════════════════════
// KONKURSOX — GLOBAL-SFX-SISTEMA.JS
// Sonidos del sistema configurables: correcto, incorrecto,
// tiempo agotado, pregunta, victoria.
// Cada evento puede usar el sonido generativo (por defecto)
// o un MP3 subido por el usuario.
// ═══════════════════════════════════════════════════════════════

const SFX_SIS_KEY = 'konkursox_sfx_sistema';

// Definición de eventos del sistema
const SFX_SIS_EVENTOS = [
  { id: 'correcto',   label: '✔ Respuesta correcta',  emoji: '✔' },
  { id: 'incorrecto', label: '✗ Respuesta incorrecta', emoji: '✗' },
  { id: 'pregunta',   label: '🎵 Nueva pregunta',       emoji: '🎵' },
  { id: 'tiempo',     label: '⏱ Tiempo agotado',        emoji: '⏱' },
  { id: 'victoria',   label: '🏆 Victoria',              emoji: '🏆' },
  { id: 'tension',    label: '😰 Tensión',               emoji: '😰' },
];

// Config guardada: { id: { tipo: 'gen'|'file', fileName: str } }
let sfxSisConfig = {};
// Buffers cargados en memoria: { id: AudioBuffer }
const sfxSisBuffers = {};
let sfxSisAudioCtx  = null;

async function sfxSisInit() {
  try {
    sfxSisConfig = JSON.parse(localStorage.getItem(SFX_SIS_KEY) || '{}');
  } catch { sfxSisConfig = {}; }

  // Restaurar AudioBuffers desde IndexedDB
  const ctx = sfxSisGetCtx();
  for (const [eventoId, cfg] of Object.entries(sfxSisConfig)) {
    if (cfg.tipo !== 'file') continue;
    try {
      const rec = await dbObtenerSfxSistema(eventoId);
      if (rec?.blob) {
        const arrayBuf = await rec.blob.arrayBuffer();
        sfxSisBuffers[eventoId] = await ctx.decodeAudioData(arrayBuf);
      }
    } catch { /* archivo no encontrado en DB */ }
  }
  sfxSisRenderEditor();
}

function sfxSisGetCtx() {
  if (!sfxSisAudioCtx)
    sfxSisAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sfxSisAudioCtx;
}

// ── Reproducir evento del sistema ────────────────────────────────
// Esta función reemplaza a ttSfx/snSfx en todos los módulos.
function sfxSisPlay(evento) {
  const cfg = sfxSisConfig[evento];
  const vol = sfxGetVolumen(); // desde shared-sfx.js

  if (cfg?.tipo === 'file' && sfxSisBuffers[evento]) {
    const ctx    = sfxSisGetCtx();
    const source = ctx.createBufferSource();
    source.buffer = sfxSisBuffers[evento];
    const gain = ctx.createGain();
    gain.gain.value = vol;
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    return;
  }
  // Fallback generativo
  sfxGen(evento);
}

// ── Editor visual ─────────────────────────────────────────────────
function sfxSisRenderEditor() {
  const lista = document.getElementById('sfx-sis-lista');
  if (!lista) return;

  lista.innerHTML = SFX_SIS_EVENTOS.map(ev => {
    const cfg    = sfxSisConfig[ev.id] || { tipo: 'gen' };
    const esFile = cfg.tipo === 'file';
    const loaded = esFile && !!sfxSisBuffers[ev.id];
    const pendiente = esFile && !loaded;

    return `
      <div class="sfx-sis-row">
        <div class="sfx-sis-label">${ev.label}</div>
        <div class="sfx-sis-acciones">
          <button class="btn btn-gris btn-sm" onclick="sfxSisPlay('${ev.id}')" title="Probar">▶</button>
          <span class="sfx-sis-tipo ${esFile ? (loaded ? 'tipo-file' : 'tipo-pendiente') : 'tipo-gen'}">
            ${esFile
              ? (loaded
                  ? `🎵 ${(cfg.fileName || 'Archivo').slice(0,14)}`
                  : `⚠ Recargar`)
              : '⚡ Generativo'}
          </span>
          <label class="btn ${pendiente ? 'btn-naranja' : 'btn-gris'} btn-sm"
            title="${pendiente ? 'Recargar el archivo para este evento' : 'Subir MP3'}"
            style="cursor:pointer">
            ${pendiente ? '↺ Recargar' : '📁'}
            <input type="file" accept="audio/*" style="display:none"
              onchange="sfxSisSubirArchivo('${ev.id}', event)">
          </label>
          ${esFile ? `<button class="btn btn-rojo btn-sm" onclick="sfxSisResetear('${ev.id}')" title="Volver a generativo">✕</button>` : ''}
        </div>
      </div>`;
  }).join('');
}

async function sfxSisSubirArchivo(eventoId, e) {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const arrayBuf = await f.arrayBuffer();
    const ctx      = sfxSisGetCtx();
    const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
    sfxSisBuffers[eventoId] = audioBuf;
    sfxSisConfig[eventoId]  = { tipo: 'file', fileName: f.name };
    localStorage.setItem(SFX_SIS_KEY, JSON.stringify(sfxSisConfig));
    // Guardar blob en IndexedDB para persistencia
    await dbGuardarSfxSistema(eventoId, f, f.name);
    sfxSisRenderEditor();
    toast(`Sonido "${f.name}" asignado — se recordará entre sesiones`, 'ok');
  } catch { toast('Error al decodificar audio.', 'error'); }
  e.target.value = '';
}

function sfxSisResetear(eventoId) {
  delete sfxSisConfig[eventoId];
  delete sfxSisBuffers[eventoId];
  localStorage.setItem(SFX_SIS_KEY, JSON.stringify(sfxSisConfig));
  dbEliminarSfxSistema(eventoId).catch(() => {});
  sfxSisRenderEditor();
  toast(`Sonido de "${eventoId}" restablecido a generativo`, 'info');
}
