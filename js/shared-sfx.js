// ═══════════════════════════════════════════════════════════════
// KONKURSOX — SHARED-SFX.JS
// Panel de efectos de sonido personalizable y reutilizable.
// Soporta sonidos generativos (Web Audio) y archivos MP3 subidos.
// Los botones son reordenables por drag & drop.
// ═══════════════════════════════════════════════════════════════

const SFX_STORAGE_KEY = 'konkursox_sfx_custom';

// Sonidos generativos por defecto
const SFX_DEFAULTS = [
  { id: 'pregunta',   label: '🎵 Pregunta',  tipo: 'gen', color: 'btn-gris' },
  { id: 'correcto',   label: '✔ Correcto',   tipo: 'gen', color: 'btn-verde' },
  { id: 'incorrecto', label: '✗ Incorrecto', tipo: 'gen', color: 'btn-rojo' },
  { id: 'tension',    label: '😰 Tensión',   tipo: 'gen', color: 'btn-naranja' },
  { id: 'victoria',   label: '🏆 Victoria',  tipo: 'gen', color: 'btn-dorado' },
  { id: 'tic',        label: '⏱ Tic-Tac',   tipo: 'gen', color: 'btn-gris' },
];

// Estado de sonidos (generativos + personalizados)
let sfxLista = [];
let sfxAudioCtx = null;
// Cache de AudioBuffers para archivos subidos: { uid: AudioBuffer }
const sfxBuffers = {};

// Elemento en drag
let sfxDragIdx = null;

// ── Inicialización ───────────────────────────────────────────────
async function sfxInit(prefijo) {
  sfxCargar();
  sfxRender(prefijo);
  // Restaurar buffers de archivos desde IndexedDB
  await sfxRestaurarBuffers();
  sfxRender(prefijo); // re-render con estados actualizados
}

async function sfxRestaurarBuffers() {
  const ctx = sfxGetCtx();
  for (const item of sfxLista) {
    if (item.tipo !== 'file') continue;
    try {
      const rec = await dbObtenerSfxCustom(item.id);
      if (rec?.blob) {
        const arrayBuf = await rec.blob.arrayBuffer();
        sfxBuffers[item.id] = await ctx.decodeAudioData(arrayBuf);
      }
    } catch { /* sin datos */ }
  }
}

function sfxCargar() {
  try {
    const guardados = JSON.parse(localStorage.getItem(SFX_STORAGE_KEY) || 'null');
    if (guardados && Array.isArray(guardados)) {
      sfxLista = guardados;
      return;
    }
  } catch {}
  sfxLista = SFX_DEFAULTS.map(s => ({ ...s }));
}

function sfxGuardar() {
  // Guardar solo metadatos (no ArrayBuffers — se pierden entre sesiones)
  const paraGuardar = sfxLista.map(s => ({
    id:    s.id,
    label: s.label,
    tipo:  s.tipo,
    color: s.color,
    // Los archivos subidos no se pueden serializar: se guarda el nombre
    // para mostrarlo, pero habrá que volver a subirlos al recargar
    fileName: s.fileName || null,
  }));
  localStorage.setItem(SFX_STORAGE_KEY, JSON.stringify(paraGuardar));
}

// ── Render ───────────────────────────────────────────────────────
function sfxRender(prefijo) {
  const contenedor = document.getElementById(`${prefijo}-sfx-lista`);
  if (!contenedor) return;

  contenedor.innerHTML = sfxLista.map((s, i) => `
    <div class="sfx-item" id="sfx-item-${prefijo}-${i}"
      draggable="true"
      ondragstart="sfxOnDragStart(event, ${i})"
      ondragover="sfxOnDragOver(event, ${i})"
      ondrop="sfxOnDrop(event, ${i}, '${prefijo}')"
      ondragend="sfxOnDragEnd()">

      <div class="sfx-drag-handle" title="Arrastra para reordenar">⠿</div>

      <button class="btn ${s.color} btn-sm sfx-play-btn"
        onclick="sfxPlay('${s.id}', ${i})"
        title="${s.fileName ? 'Archivo: ' + s.fileName : 'Sonido generativo'}">
        ${s.label}
      </button>

      <div class="sfx-item-acciones">
        <button class="btn btn-gris btn-sm sfx-edit-btn"
          onclick="sfxEditarNombre(${i}, '${prefijo}')"
          title="Editar nombre">✏️</button>
        <label class="btn btn-gris btn-sm sfx-upload-btn" title="Subir MP3">
          📁
          <input type="file" accept="audio/*" style="display:none"
            onchange="sfxSubirArchivo(event, ${i}, '${prefijo}')">
        </label>
        <button class="btn btn-rojo btn-sm"
          onclick="sfxEliminar(${i}, '${prefijo}')"
          title="Eliminar">✕</button>
      </div>
    </div>
  `).join('') + `
    <button class="btn btn-gris btn-sm btn-full sfx-add-btn"
      onclick="sfxAñadir('${prefijo}')">
      + Añadir sonido
    </button>`;
}

// ── Reproducción ────────────────────────────────────────────────
function sfxGetCtx() {
  if (!sfxAudioCtx) sfxAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sfxAudioCtx;
}

function sfxPlay(id, idx) {
  // Buscar el item (por id o por índice directo)
  const item = idx !== undefined ? sfxLista[idx] : sfxLista.find(s => s.id === id);
  if (!item) return;

  // Si tiene buffer cargado, reproducirlo
  if (item.tipo === 'file' && sfxBuffers[item.id]) {
    const ctx    = sfxGetCtx();
    const source = ctx.createBufferSource();
    source.buffer = sfxBuffers[item.id];
    const gain = ctx.createGain();
    gain.gain.value = sfxGetVolumen();
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
    return;
  }

  // Fallback: sonido generativo
  sfxGen(item.id);
}

function sfxGetVolumen() {
  // Buscar cualquier slider de volumen SFX activo
  const sliders = document.querySelectorAll('[id$="-vol-sfx"]');
  for (const s of sliders) {
    if (s.closest('.tab-panel.activa')) return parseInt(s.value) / 100;
  }
  return 0.7;
}

// ── Sonidos generativos ──────────────────────────────────────────
function sfxGen(tipo) {
  const ctx = sfxGetCtx();
  const vol = sfxGetVolumen();
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
    default:           nota(440,0,.3); // sonido genérico para archivos sin buffer
  }
}

// ── Gestión de items ────────────────────────────────────────────
function sfxAñadir(prefijo) {
  const uid = 'custom_' + Date.now();
  sfxLista.push({ id: uid, label: '🔊 Nuevo sonido', tipo: 'gen', color: 'btn-gris' });
  sfxGuardar();
  sfxRender(prefijo);
}

function sfxEliminar(i, prefijo) {
  const item = sfxLista[i];
  if (item) {
    delete sfxBuffers[item.id];
    dbEliminarSfxCustom(item.id).catch(() => {});
  }
  sfxLista.splice(i, 1);
  sfxGuardar();
  sfxRender(prefijo);
}

function sfxEditarNombre(i, prefijo) {
  const item = sfxLista[i];
  if (!item) return;
  const nuevoNombre = prompt('Nombre del sonido:', item.label);
  if (nuevoNombre === null) return;
  item.label = nuevoNombre.trim() || item.label;
  sfxGuardar();
  sfxRender(prefijo);
}

async function sfxSubirArchivo(e, i, prefijo) {
  const f = e.target.files[0];
  if (!f) return;
  const item = sfxLista[i];
  if (!item) return;

  try {
    const arrayBuf = await f.arrayBuffer();
    const ctx      = sfxGetCtx();
    const audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
    sfxBuffers[item.id] = audioBuf;
    item.tipo     = 'file';
    item.fileName = f.name;
    const baseName = f.name.replace(/\.[^.]+$/, '');
    item.label = '🔊 ' + (baseName.length > 16 ? baseName.slice(0,16)+'…' : baseName);
    // Persistir en IndexedDB
    await dbGuardarSfxCustom(item.id, f, f.name);
    sfxGuardar();
    sfxRender(prefijo);
    toast(`Sonido cargado: ${f.name}`, 'ok');
  } catch (err) {
    toast('Error al decodificar el audio.', 'error');
    console.error(err);
  }
  e.target.value = '';
}

// ── Drag & Drop ──────────────────────────────────────────────────
function sfxOnDragStart(e, i) {
  sfxDragIdx = i;
  e.currentTarget.classList.add('sfx-dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function sfxOnDragOver(e, i) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  // Highlight visual
  document.querySelectorAll('.sfx-item').forEach(el => el.classList.remove('sfx-drag-over'));
  if (sfxDragIdx !== null && sfxDragIdx !== i) {
    e.currentTarget.classList.add('sfx-drag-over');
  }
}

function sfxOnDrop(e, i, prefijo) {
  e.preventDefault();
  if (sfxDragIdx === null || sfxDragIdx === i) return;
  // Mover elemento
  const [moved] = sfxLista.splice(sfxDragIdx, 1);
  sfxLista.splice(i, 0, moved);
  sfxDragIdx = null;
  sfxGuardar();
  sfxRender(prefijo);
}

function sfxOnDragEnd() {
  sfxDragIdx = null;
  document.querySelectorAll('.sfx-item').forEach(el => {
    el.classList.remove('sfx-dragging', 'sfx-drag-over');
  });
}
