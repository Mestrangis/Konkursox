// ═══════════════════════════════════════════════════════════════
// KONKURSOX — SHARED-MEDIA.JS
// Panel de multimedia reutilizable para cualquier pestaña de juego.
// Cada pestaña crea una instancia con un prefijo de ID único.
//
// USO:
//   const media = new MediaPanel('tt');   // prefijo 'tt' → IDs tt-*
//   media.init();
//   media.lanzar(tipo);   // tipo: 'imagen' | 'video' | 'youtube'
//   media.cerrar();
// ═══════════════════════════════════════════════════════════════

class MediaPanel {
  constructor(prefijo) {
    this.p = prefijo;          // prefijo de IDs en el HTML
    this._videoProgressRAF = null;
    this._videoDuration    = 0;
    this._videoSeeking     = false;
  }

  // ── Inicializar listeners ──────────────────────────────────────
  init() {
    // Archivo multimedia local (explorador)
    const fileInput = document.getElementById(`${this.p}-file-multimedia`);
    if (fileInput) {
      fileInput.addEventListener('change', (e) => this._onFileSelected(e));
    }

    // Slider de progreso del vídeo
    const sliderVid = document.getElementById(`${this.p}-progreso-video`);
    if (sliderVid) {
      sliderVid.addEventListener('mousedown', () => { this._videoSeeking = true; });
      sliderVid.addEventListener('touchstart', () => { this._videoSeeking = true; }, { passive: true });
      sliderVid.addEventListener('input',     () => this._onVideoSliderInput());
      sliderVid.addEventListener('change',    () => { this._videoSeeking = false; });
    }
  }

  // ── Abrir explorador de archivos ──────────────────────────────
  seleccionarArchivo() {
    document.getElementById(`${this.p}-file-multimedia`)?.click();
  }

  _onFileSelected(e) {
    const f = e.target.files[0];
    if (!f) return;
    const url  = URL.createObjectURL(f);
    const tipo = f.type.startsWith('image/') ? 'imagen' : 'video';
    document.getElementById(`${this.p}-input-multimedia`).value = url;
    document.getElementById(`${this.p}-tipo-media-auto`).value  = tipo;
    // Mostrar/ocultar controles vídeo
    this._toggleVideoControls(tipo === 'video');
    toast(`Archivo cargado: ${f.name}`, 'info');
    e.target.value = '';
  }

  // ── Lanzar al overlay ─────────────────────────────────────────
  lanzar(tipoForzado) {
    const url = document.getElementById(`${this.p}-input-multimedia`)?.value.trim();
    if (!url) { toast('Escribe una URL o selecciona un archivo.', 'error'); return; }

    const tipoAuto = document.getElementById(`${this.p}-tipo-media-auto`)?.value;
    const tipo = tipoForzado || tipoAuto || 'imagen';

    // Si es YouTube, ocultar controles de vídeo
    this._toggleVideoControls(tipo === 'video');

    estado.multimedia = { activo: true, tipo, url };
    sincronizarOverlay({ comando: 'multimedia' });

    // Si es vídeo local: empezar a trackear progreso desde el overlay
    if (tipo === 'video') {
      this._iniciarTrackingVideo();
    }

    toast('Multimedia enviada al overlay', 'ok');
  }

  cerrar() {
    this._detenerTrackingVideo();
    this._resetVideoUI();
    estado.multimedia = { activo: false, tipo: null, url: '' };
    sincronizarOverlay({ comando: 'cerrar_multimedia' });
  }

  // ── Controles de vídeo ────────────────────────────────────────
  videoPlay()  { sincronizarOverlay({ cmd_video: 'play' }); }
  videoPause() { sincronizarOverlay({ cmd_video: 'pause' }); }
  videoReset() {
    this._resetVideoUI();
    sincronizarOverlay({ cmd_video: 'reset' });
  }

  // Seek: el usuario arrastra el slider → envía tiempo al overlay
  _onVideoSliderInput() {
    const slider = document.getElementById(`${this.p}-progreso-video`);
    const pct    = parseFloat(slider.value) / 100;
    // Actualizar label
    this._updateVideoTimeLabel(pct);
    // Enviar seek al overlay via estado.multimedia.seek_pct
    if (estado.multimedia?.activo) {
      estado.multimedia.seek_pct = pct;
      sincronizarOverlay({ cmd_video: 'seek' });
      // Limpiar el pct después para no interferir con el siguiente sync
      setTimeout(() => { if (estado.multimedia) delete estado.multimedia.seek_pct; }, 100);
    }
  }

  // ── Tracking de progreso del vídeo (via overlay.js → localStorage) ──
  // El overlay escribe el progreso del vídeo en un key separado
  // y aquí lo leemos para actualizar el slider.
  _iniciarTrackingVideo() {
    this._detenerTrackingVideo();
    this._toggleVideoControls(true);

    const tick = () => {
      if (!this._videoSeeking) {
        const raw = localStorage.getItem('konkursox_videoprogress');
        if (raw) {
          try {
            const { pct, duration } = JSON.parse(raw);
            this._videoDuration = duration || 0;
            const slider = document.getElementById(`${this.p}-progreso-video`);
            if (slider) slider.value = (pct * 100).toFixed(1);
            this._updateVideoTimeLabel(pct);
          } catch {}
        }
      }
      this._videoProgressRAF = requestAnimationFrame(tick);
    };
    this._videoProgressRAF = requestAnimationFrame(tick);
  }

  _detenerTrackingVideo() {
    if (this._videoProgressRAF) {
      cancelAnimationFrame(this._videoProgressRAF);
      this._videoProgressRAF = null;
    }
  }

  _resetVideoUI() {
    const slider = document.getElementById(`${this.p}-progreso-video`);
    if (slider) slider.value = 0;
    this._updateVideoTimeLabel(0);
  }

  _updateVideoTimeLabel(pct) {
    const lbl = document.getElementById(`${this.p}-video-tiempo`);
    if (!lbl) return;
    if (!this._videoDuration) { lbl.textContent = '0:00 / --:--'; return; }
    const current = pct * this._videoDuration;
    lbl.textContent = `${fmtTiempo(current)} / ${fmtTiempo(this._videoDuration)}`;
  }

  _toggleVideoControls(mostrar) {
    const controles = document.getElementById(`${this.p}-video-controles`);
    if (controles) controles.style.display = mostrar ? '' : 'none';
  }
}

// ── Biblioteca compartida (se llena desde tab-biblioteca.js) ──
window.bibliotecaArchivos = window.bibliotecaArchivos || [];

function renderBibliotecaGrid(prefijo) {
  const grid = document.getElementById(`${prefijo}-biblioteca-grid`);
  if (!grid) return;

  // Intentar cargar desde localStorage si aún no hay items en memoria
  if (!window.bibliotecaArchivos.length) {
    try {
      const saved = JSON.parse(localStorage.getItem('konkursox_biblioteca') || '[]');
      window.bibliotecaArchivos = saved.filter(i => i.url && !i.url.startsWith('blob:'));
    } catch {}
  }

  const items = window.bibliotecaArchivos.filter(i =>
    i.url && (i.tipo === 'imagen' || i.tipo === 'video' || i.tipo === 'youtube')
  );

  if (!items.length) {
    grid.innerHTML = `
      <div class="biblioteca-vacia">
        <span>📁</span>
        <span>La biblioteca está vacía.<br>Añade archivos en la pestaña <strong>Biblioteca</strong>.</span>
      </div>`;
    return;
  }

  grid.innerHTML = items.map((item, i) => {
    const thumb = item.thumb
      ? `<img src="${item.thumb}" alt="${item.nombre}" style="width:100%;height:80%;object-fit:cover">`
      : `<div class="thumb-icon">${item.tipo === 'video' ? '🎬' : item.tipo === 'youtube' ? '▶' : '🖼️'}</div>`;
    return `
      <div class="biblioteca-thumb" onclick="seleccionarDeLibreria('${prefijo}', ${i})" title="${item.nombre}">
        ${thumb}
        <div class="thumb-label">${item.nombre.length > 12 ? item.nombre.slice(0,12)+'…' : item.nombre}</div>
      </div>`;
  }).join('');
}

function seleccionarDeLibreria(prefijo, i) {
  const items = window.bibliotecaArchivos.filter(it =>
    it.url && (it.tipo === 'imagen' || it.tipo === 'video' || it.tipo === 'youtube')
  );
  const item = items[i];
  if (!item) return;
  document.getElementById(`${prefijo}-input-multimedia`).value = item.url;
  document.getElementById(`${prefijo}-tipo-media-auto`).value  = item.tipo;
  // Mostrar controles de vídeo si aplica
  const controles = document.getElementById(`${prefijo}-video-controles`);
  if (controles) controles.style.display = item.tipo === 'video' ? '' : 'none';
  toast(`Seleccionado: ${item.nombre}`, 'info');
}

// ── Utilidad: formatear segundos como M:SS ─────────────────────
function fmtTiempo(seg) {
  if (!seg || isNaN(seg)) return '0:00';
  const m = Math.floor(seg / 60);
  const s = Math.floor(seg % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}
