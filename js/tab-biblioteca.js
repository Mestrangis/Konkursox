// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-BIBLIOTECA.JS  v2
// Biblioteca de archivos: imágenes, vídeos, audios, YouTube.
// Metadatos persisten en localStorage; blobs duran la sesión.
// ═══════════════════════════════════════════════════════════════

const BIB_KEY = 'konkursox_biblioteca';

// Cada item: { id, nombre, tipo, url, thumb?, fechaAdded }
// tipo: 'imagen' | 'video' | 'audio' | 'youtube'

let bibItems = [];
let bibFiltro = 'todos'; // 'todos' | 'imagen' | 'video' | 'audio' | 'youtube'
let bibBusqueda = '';

// ── Init ──────────────────────────────────────────────────────────
function initBiblioteca() {
  bibCargar();
  bibRender(); // render inicial (algunos sin URL todavía)
  bibRestaurarDeDB().catch(() => {}); // restaurar blobs desde IndexedDB

  // Búsqueda en tiempo real
  document.getElementById('bib-busqueda')?.addEventListener('input', (e) => {
    bibBusqueda = e.target.value.toLowerCase();
    bibRender();
  });

  // Drag & drop sobre la zona de subida
  const zona = document.getElementById('bib-drop-zona');
  if (zona) {
    zona.addEventListener('dragover',  (e) => { e.preventDefault(); zona.classList.add('drag-over'); });
    zona.addEventListener('dragleave', ()  => zona.classList.remove('drag-over'));
    zona.addEventListener('drop',      (e) => {
      e.preventDefault();
      zona.classList.remove('drag-over');
      const files = Array.from(e.dataTransfer.files);
      bibAñadirArchivos(files);
    });
  }
}

// ── Persistencia ─────────────────────────────────────────────────
function bibCargar() {
  try { bibItems = JSON.parse(localStorage.getItem(BIB_KEY) || '[]'); }
  catch { bibItems = []; }
  // Los blobs de sesión anterior ya no son válidos; se restaurarán desde IndexedDB
  bibItems.forEach(item => {
    if (item.url?.startsWith('blob:')) {
      item.url = null;
      if (item.tipo === 'imagen') item.thumb = null;
    }
  });
}

// Restaurar URLs desde IndexedDB al arrancar
async function bibRestaurarDeDB() {
  for (const item of bibItems) {
    if (!item.url && item.tipo !== 'youtube') {
      try {
        const url = await dbObtenerArchivoUrl(item.id);
        if (url) {
          item.url = url;
          if (item.tipo === 'imagen') item.thumb = url;
        }
      } catch { /* sin datos en DB */ }
    }
  }
  bibGuardar();
  bibRender();
}

function bibGuardar() {
  const paraGuardar = bibItems.map(item => ({
    ...item,
    url:   item.url?.startsWith('blob:')   ? null : item.url,
    thumb: item.thumb?.startsWith('blob:') ? null : item.thumb,
  }));
  localStorage.setItem(BIB_KEY, JSON.stringify(paraGuardar));
  window.bibliotecaArchivos = bibItems.filter(i => i.url);
  ['tt','sn','pj','rosco'].forEach(p => renderBibliotecaGrid(p));
  // Actualizar lista rápida del reproductor global
  if (typeof gmRenderListaRapida === 'function') gmRenderListaRapida();
}

// ── Añadir archivos ───────────────────────────────────────────────
function bibAbrirSelector() {
  document.getElementById('bib-file-input')?.click();
}

function bibOnFileInput(e) {
  bibAñadirArchivos(Array.from(e.target.files));
  e.target.value = '';
}

async function bibAñadirArchivos(files) {
  const añadidos = [];

  for (const f of files) {
    const tipo = f.type.startsWith('image/') ? 'imagen'
               : f.type.startsWith('video/') ? 'video'
               : f.type.startsWith('audio/') ? 'audio'
               : null;
    if (!tipo) { toast(`Tipo no soportado: ${f.name}`, 'error'); continue; }

    const id   = 'bib_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
    const url  = URL.createObjectURL(f);
    // Color aleatorio para audios (para identificarlos en la lista)
    const COLORES = ['#e74c3c','#e67e22','#f0a500','#2ecc71','#3498db','#9b59b6','#1abc9c','#e91e63'];
    const item = {
      id,
      nombre:     f.name,
      tipo,
      url,
      thumb:      tipo === 'imagen' ? url : null,
      color:      tipo === 'audio' ? COLORES[Math.floor(Math.random() * COLORES.length)] : null,
      fechaAdded: new Date().toLocaleDateString('es-ES'),
    };

    // Guardar blob en IndexedDB para persistencia entre sesiones
    try {
      await dbGuardarArchivo(id, f, { nombre: f.name, tipo });
    } catch (err) {
      console.warn('No se pudo guardar en IndexedDB:', err);
    }

    bibItems.unshift(item);
    añadidos.push(item);
  }

  bibGuardar();
  bibRender();
  if (añadidos.length) toast(`${añadidos.length} archivo(s) añadido(s)`, 'ok');
}

// ── Añadir YouTube ────────────────────────────────────────────────
function bibAñadirYoutube() {
  const input = document.getElementById('bib-yt-url');
  const nombre = document.getElementById('bib-yt-nombre');
  const url = input?.value.trim();
  if (!url) { toast('Escribe un enlace de YouTube.', 'error'); return; }

  const vidId = bibExtraerYtId(url);
  if (!vidId) { toast('Enlace de YouTube no válido.', 'error'); return; }

  const nombreFinal = nombre?.value.trim() || `YouTube: ${vidId}`;
  const item = {
    id:         'bib_yt_' + vidId,
    nombre:     nombreFinal,
    tipo:       'youtube',
    url:        `https://www.youtube.com/watch?v=${vidId}`,
    thumb:      `https://img.youtube.com/vi/${vidId}/mqdefault.jpg`,
    vidId,
    fechaAdded: new Date().toLocaleDateString('es-ES'),
  };

  // Evitar duplicados
  if (bibItems.find(i => i.id === item.id)) {
    toast('Este vídeo ya está en la biblioteca.', 'error'); return;
  }

  bibItems.unshift(item);
  bibGuardar();
  bibRender();
  if (input)  input.value  = '';
  if (nombre) nombre.value = '';
  toast('Vídeo de YouTube añadido', 'ok');
}

function bibExtraerYtId(url) {
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// ── Eliminar ──────────────────────────────────────────────────────
function bibEliminar(id, e) {
  e.stopPropagation();
  bibItems = bibItems.filter(i => i.id !== id);
  bibGuardar();
  bibRender();
  dbEliminarArchivo(id).catch(() => {});
  toast('Elemento eliminado', 'info');
}

// ── Renombrar ─────────────────────────────────────────────────────
function bibRenombrar(id, e) {
  e.stopPropagation();
  const item = bibItems.find(i => i.id === id);
  if (!item) return;
  const nuevo = prompt('Nuevo nombre:', item.nombre);
  if (nuevo === null || !nuevo.trim()) return;
  item.nombre = nuevo.trim();
  bibGuardar();
  bibRender();
}

// ── Usar en overlay ───────────────────────────────────────────────
function bibUsarEnOverlay(id) {
  const item = bibItems.find(i => i.id === id);
  if (!item || !item.url) { toast('Archivo no disponible esta sesión. Vuelve a subirlo.', 'error'); return; }

  const tipo = item.tipo === 'youtube' ? 'youtube' : item.tipo === 'audio' ? null : item.tipo;
  if (!tipo) { toast('Este archivo es audio. Úsalo desde el reproductor de música de cada modo.', 'info'); return; }

  estado.multimedia = { activo: true, tipo, url: item.url };
  sincronizarOverlay({ comando: 'multimedia' });
  toast(`"${item.nombre}" enviado al overlay`, 'ok');
}

// ── Filtros ───────────────────────────────────────────────────────
function bibSetFiltro(filtro) {
  bibFiltro = filtro;
  document.querySelectorAll('.bib-filtro-btn').forEach(b => {
    b.classList.toggle('activo', b.dataset.filtro === filtro);
  });
  bibRender();
}

// ── Render principal ──────────────────────────────────────────────
function bibRender() {
  const grid = document.getElementById('bib-grid');
  if (!grid) return;

  const items = bibItems.filter(item => {
    const pasaFiltro = bibFiltro === 'todos' || item.tipo === bibFiltro;
    const pasaBusq   = !bibBusqueda || item.nombre.toLowerCase().includes(bibBusqueda);
    return pasaFiltro && pasaBusq;
  });

  // Actualizar contador
  const contador = document.getElementById('bib-contador');
  if (contador) contador.textContent = `${items.length} elemento${items.length !== 1 ? 's' : ''}`;

  if (!items.length) {
    grid.innerHTML = `
      <div class="bib-vacio">
        <div class="bib-vacio-icon">${bibFiltro === 'todos' ? '📁' : bibTipoIcono(bibFiltro)}</div>
        <div>${bibBusqueda ? 'No hay resultados para tu búsqueda.' : 'La biblioteca está vacía. Sube archivos o añade enlaces.'}</div>
      </div>`;
    return;
  }

  grid.innerHTML = items.map(item => bibRenderItem(item)).join('');
}

function bibTipoIcono(tipo) {
  return { imagen: '🖼️', video: '🎬', audio: '🎵', youtube: '▶' }[tipo] || '📄';
}

function bibRenderItem(item) {
  const disponible = !!item.url;
  const thumb = item.thumb
    ? `<img src="${item.thumb}" alt="${item.nombre}" loading="lazy" onerror="this.style.display='none'">`
    : item.tipo === 'audio' && item.color
      ? `<div class="bib-thumb-audio" style="background:${item.color}"><span>🎵</span><span class="bib-audio-nombre">${item.nombre.replace(/\.[^.]+$/,'').slice(0,20)}</span></div>`
      : `<div class="bib-thumb-icon">${bibTipoIcono(item.tipo)}</div>`;

  return `
    <div class="bib-item ${disponible ? '' : 'bib-item-cargando'}" title="${item.nombre}">
      <div class="bib-thumb" onclick="bibUsarEnOverlay('${item.id}')">
        ${thumb}
        <div class="bib-tipo-badge">${bibTipoIcono(item.tipo)}</div>
        ${!disponible ? '<div class="bib-cargando-overlay">⏳</div>' : ''}
        <div class="bib-hover-overlay">
          <span>${item.tipo === 'audio' ? '🎵 Usar en música' : '📤 Enviar al overlay'}</span>
        </div>
      </div>
      <div class="bib-info">
        <div class="bib-nombre">${item.nombre}</div>
        <div class="bib-meta">${item.fechaAdded || ''}</div>
      </div>
      <div class="bib-acciones">
        ${item.tipo === 'audio' ? `<label class="btn btn-gris btn-sm" title="Cambiar color" style="cursor:pointer;padding:3px 6px">
          <input type="color" value="${item.color || '#444a5a'}" style="display:none;width:0;height:0"
            oninput="bibCambiarColor('${item.id}', this.value)">🎨</label>` : ''}
        <button class="btn btn-gris btn-sm" onclick="bibRenombrar('${item.id}', event)" title="Renombrar">✏️</button>
        <button class="btn btn-rojo btn-sm" onclick="bibEliminar('${item.id}', event)"  title="Eliminar">✕</button>
      </div>
    </div>`;
}


// ── Cambiar color de audio ────────────────────────────────────────
function bibCambiarColor(id, color) {
  const item = bibItems.find(i => i.id === id);
  if (!item) return;
  item.color = color;
  bibGuardar();
  bibRender();
}

// ── Exportar / Importar lista ─────────────────────────────────────
function bibExportar() {
  const datos = bibItems.map(i => ({
    nombre: i.nombre, tipo: i.tipo,
    url:    i.url?.startsWith('blob:') ? null : i.url,
    vidId:  i.vidId || null,
    fechaAdded: i.fechaAdded,
  }));
  const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'biblioteca_konkursox.json';
  a.click();
  toast('Biblioteca exportada', 'ok');
}

function bibImportar(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const datos = JSON.parse(ev.target.result);
      if (!Array.isArray(datos)) throw new Error();
      let añadidos = 0;
      datos.forEach(d => {
        if (!d.nombre || !d.tipo) return;
        const id = 'bib_imp_' + Date.now() + '_' + Math.random().toString(36).slice(2,5);
        // Reconstruir thumb de YouTube
        const thumb = d.vidId ? `https://img.youtube.com/vi/${d.vidId}/mqdefault.jpg`
                    : d.tipo === 'imagen' && d.url ? d.url : null;
        bibItems.push({ ...d, id, thumb, url: d.url || null });
        añadidos++;
      });
      bibGuardar();
      bibRender();
      toast(`${añadidos} elemento(s) importados`, 'ok');
    } catch { toast('Archivo JSON inválido.', 'error'); }
  };
  r.readAsText(f); e.target.value = '';
}
