// ═══════════════════════════════════════════════════════════════
// KONKURSOX — OVERLAY.JS  v2.1
// ═══════════════════════════════════════════════════════════════

const STORAGE_KEY = 'konkursox_v2';
const OV_LETRAS   = ['A', 'B', 'C', 'D'];
const OV_COLORES  = ['#3498db', '#e67e22', '#2ecc71', '#9b59b6'];

let mensajeProcesado = false;

// Streams abiertos en el overlay (deviceId → MediaStream)
const ovStreams = {};

// ── Escala automática ────────────────────────────────────────────
function ajustarEscala() {
  const sx = window.innerWidth  / 1920;
  const sy = window.innerHeight / 1080;
  document.getElementById('overlay-root').style.transform = `scale(${Math.min(sx, sy)})`;
}
window.addEventListener('resize', ajustarEscala);

// ── Detección de modo online ──────────────────────────────────────
const _ovParams = new URLSearchParams(location.search);
const _ovRoom   = _ovParams.get('room') || '';
const _ovOnline = !!_ovRoom;

// ── Arranque ─────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  ajustarEscala();
  generarOpcionesOverlay();
  generarOpcionesSiNo();

  // Aplicar escala guardada
  const rawEsc = localStorage.getItem('konkursox_escala');
  if (rawEsc) { try { aplicarEscalaOverlay(JSON.parse(rawEsc)); } catch {} }

  // Aplicar personalización guardada si existe
  const rawPers = localStorage.getItem('konkursox_personalizacion');
  if (rawPers) { try { aplicarPersonalizacion(JSON.parse(rawPers)); } catch {} }

  if (_ovOnline) {
    initOverlayOnline();
    return;
  }

  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) { try { procesarEstado(JSON.parse(raw)); } catch {} }
});

window.addEventListener('storage', (e) => {
  if (e.key !== STORAGE_KEY) return;
  try { procesarEstado(JSON.parse(e.newValue)); } catch {}
});

// ── Generador de opciones tipo test ─────────────────────────────
function generarOpcionesOverlay() {
  const grid = document.getElementById('grid-opciones');
  if (!grid) return;
  grid.innerHTML = OV_LETRAS.map((l, i) => `
    <div class="opcion-ov" id="ov-opcion-${i}">
      <div class="ov-letra" style="border-color:${OV_COLORES[i]};color:${OV_COLORES[i]}">${l}</div>
      <div class="ov-texto" id="ov-texto-${i}"></div>
    </div>`).join('');
}

// ── Procesador principal ─────────────────────────────────────────
function procesarEstado(datos) {
  if (!datos) return;
  const cmd = datos.comando;

  // Timer: siempre
  actualizarTimer(datos.timer, datos.timerVisible);

  // Multimedia: siempre
  actualizarMultimedia(datos.multimedia, datos.cmd_video);

  // Personalización: cuando cambia
  if (cmd === 'personalizacion' && datos.personalizacion) {
    aplicarPersonalizacion(datos.personalizacion);
  }

  // Cámaras: cuando el comando lo indica
  if (cmd === 'camaras' && datos.camaras) {
    actualizarCamaras(datos.camaras);
  }

  // Preguntas TT/S-N
  const cmdsPregunta = ['mostrar_pregunta', 'limpiar', 'revelar_respuesta', 'activar_modo', 'resaltar'];
  if (cmd && cmdsPregunta.includes(cmd)) {
    actualizarTipoTest(datos.tipoTest, cmd);
    actualizarSiNo(datos.siNo, cmd, datos.modo);
  }

  // Escala de texto
  if (cmd === 'escala' && datos.escala) aplicarEscalaOverlay(datos.escala);

  // Comodines
  if (cmd === 'comodines' || cmd === '5050' || cmd === 'comodin_banner') {
    actualizarComodinesOverlay(datos, cmd);
  }

  // Escalera
  if (cmd === 'escalera' && datos.escalera) {
    actualizarEscalera(datos.escalera);
  }

  // Rosco (solo cuando el modo activo es rosco, evita renders fantasma)
  const cmdsRosco = ['rosco_mostrar','rosco_letra','rosco_estado','rosco_limpiar','activar_modo'];
  if (cmd && cmdsRosco.includes(cmd) && cmd !== 'rosco_limpiar' && datos.modo === 'rosco') {
    actualizarRosco(datos.rosco, cmd);
  }

  // Precio Justo (solo cuando el modo activo es precio-justo)
  const cmdsPJ = ['pj_mostrar', 'pj_valor', 'pj_pista', 'pj_resolver', 'activar_modo'];
  if (cmd && cmdsPJ.includes(cmd) && datos.modo === 'precio-justo') {
    actualizarPrecioJusto(datos.precioJusto, cmd);
  }

  // ── Enforcer final: garantiza que solo el panel del modo activo sea visible ──
  // Se ejecuta siempre al final para que ningún renderer individual deje
  // paneles sobrantes de modos anteriores.
  if (cmd === 'limpiar' || cmd === 'rosco_limpiar' || cmd === 'pj_limpiar') {
    actualizarModo(null);
  } else if (cmd) {
    actualizarModo(datos.modo);
  }
}

// ═══════════════════════════════════════════════════════════════
// CÁMARAS
// ═══════════════════════════════════════════════════════════════

// Layouts que usan pantalla completa (z-index fondo) vs franja
const CAM_LAYOUTS_FULL   = ['full-1', 'full-2', 'full-3', 'full-4'];
const CAM_LAYOUTS_FRANJA = ['franja-2', 'franja-3'];
const CAM_LAYOUTS_SPLIT  = ['full-3', 'franja-3'];  // los que necesitan wrapper derecha

async function actualizarCamaras(camConfig) {
  const contenedor = document.getElementById('contenedor-camaras');
  if (!contenedor) return;

  const { layout, slots } = camConfig;
  const slotsActivos = (slots || []).filter(s => s.activo);

  if (!slotsActivos.length) {
    contenedor.className = '';
    contenedor.innerHTML = '';
    return;
  }

  // Clase de layout: 'cam-activo layout-full-2', 'cam-activo layout-franja-2', etc.
  contenedor.className = `cam-activo layout-${layout}`;

  // Renderizar HTML de slots
  if (CAM_LAYOUTS_SPLIT.includes(layout)) {
    renderLayoutSplit(contenedor, slotsActivos);
  } else {
    renderLayoutLineal(contenedor, slotsActivos);
  }

  await gestionarStreams(slots || []);
}

function renderLayoutLineal(contenedor, slots) {
  contenedor.innerHTML = slots.map(slot => crearSlotHTML(slot)).join('');
  slots.forEach(slot => conectarVideoSlot(slot));
}

function renderLayoutSplit(contenedor, slots) {
  const [s0, s1, s2] = slots;
  contenedor.innerHTML = `
    ${s0 ? crearSlotHTML(s0) : ''}
    <div class="cam-slots-derecha">
      ${s1 ? crearSlotHTML(s1) : ''}
      ${s2 ? crearSlotHTML(s2) : ''}
    </div>`;
  slots.forEach(s => s && conectarVideoSlot(s));
}

function crearSlotHTML(slot) {
  return `
    <div class="cam-slot-ov ${slot.visible ? '' : 'oculto'}" id="ov-cam-slot-${slot.id}">
      <video id="ov-cam-video-${slot.id}" autoplay muted playsinline style="display:none"></video>
      <div class="cam-sin-señal" id="ov-cam-placeholder-${slot.id}">
        <span>📷</span><span>${slot.etiqueta}</span>
      </div>
      <div class="cam-etiqueta-ov">${slot.etiqueta}</div>
    </div>`;
}

async function gestionarStreams(slots) {
  // Abrir streams para slots activos con deviceId que aún no tenemos abiertos
  for (const slot of slots) {
    if (!slot.activo || !slot.deviceId) continue;

    // Si ya tenemos el stream correcto, no hacer nada
    if (ovStreams[slot.id]?.active) {
      const vid = document.getElementById(`ov-cam-video-${slot.id}`);
      if (vid && vid.srcObject === ovStreams[slot.id]) continue;
    }

    try {
      // Cerrar stream anterior si existía
      if (ovStreams[slot.id]) {
        ovStreams[slot.id].getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: slot.deviceId } }
      });
      ovStreams[slot.id] = stream;
      conectarVideoSlot(slot);
    } catch (err) {
      console.warn(`Overlay: no se pudo abrir cámara slot ${slot.id}`, err);
    }
  }

  // Cerrar streams de slots que ya no están activos
  Object.keys(ovStreams).forEach(id => {
    const slot = slots.find(s => s.id === parseInt(id));
    if (!slot || !slot.activo || !slot.deviceId) {
      ovStreams[id]?.getTracks().forEach(t => t.stop());
      delete ovStreams[id];
    }
  });
}

function conectarVideoSlot(slot) {
  const stream = ovStreams[slot.id];
  if (!stream) return;
  const video       = document.getElementById(`ov-cam-video-${slot.id}`);
  const placeholder = document.getElementById(`ov-cam-placeholder-${slot.id}`);
  if (video) {
    video.srcObject = stream;
    video.style.display = 'block';
  }
  if (placeholder) placeholder.style.display = 'none';
}

function actualizarZonaSegura(alturaFranja) {
  document.documentElement.style.setProperty(
    '--zona-segura-bottom',
    alturaFranja ? `${alturaFranja + 12}px` : '40px'
  );
}

// ═══════════════════════════════════════════════════════════════
// MODO / TIPO TEST
// ═══════════════════════════════════════════════════════════════

function actualizarModo(modo) {
  document.getElementById('panel-tipo-test')?.classList.toggle('visible', modo === 'tipo-test');
  document.getElementById('panel-si-no')?.classList.toggle('visible', modo === 'si-no');
  document.getElementById('panel-precio-justo')?.classList.toggle('visible', modo === 'precio-justo');
  document.getElementById('panel-rosco')?.classList.toggle('visible', modo === 'rosco');
}

function actualizarTipoTest(tt, comando) {
  const panel = document.getElementById('panel-tipo-test');
  if (!panel || !tt) return;

  if (comando === 'limpiar') {
    panel.classList.remove('visible');
    ocultarMensaje();
    mensajeProcesado = false;
    // Restaurar todas las opciones (limpia efecto 50/50)
    OV_LETRAS.forEach((_, i) => {
      const el = document.getElementById(`ov-opcion-${i}`);
      if (el) {
        el.classList.remove('resaltada','correcta','incorrecta','oculta');
        el.style.opacity = '';
        el.style.transform = '';
        el.style.transition = '';
      }
    });
    return;
  }

  if (comando === 'mostrar_pregunta' && tt.pregunta) {
    panel.classList.add('visible');
    document.getElementById('texto-pregunta').textContent = tt.pregunta;
    mensajeProcesado = false;
    OV_LETRAS.forEach((_, i) => {
      const elT = document.getElementById(`ov-texto-${i}`);
      const elO = document.getElementById(`ov-opcion-${i}`);
      if (!elT || !elO) return;
      elT.textContent = tt.opciones?.[i] || '';
      // Restaurar visibilidad completa (elimina efecto 50/50 anterior)
      elO.classList.remove('resaltada', 'correcta', 'incorrecta', 'oculta');
      elO.style.opacity  = '';
      elO.style.transform = '';
      elO.style.transition = '';
      if (!tt.opciones?.[i]) elO.classList.add('oculta');
    });
    ocultarMensaje();
    return;
  }

  if (comando === 'resaltar') {
    OV_LETRAS.forEach((_, i) => {
      const el = document.getElementById(`ov-opcion-${i}`);
      if (!el || el.classList.contains('oculta')) return;
      el.classList.toggle('resaltada', i === tt.resaltada);
    });
    return;
  }

  if (comando === 'revelar_respuesta' && tt.correcta >= 0 && !mensajeProcesado) {
    mensajeProcesado = true;
    OV_LETRAS.forEach((_, i) => {
      const el = document.getElementById(`ov-opcion-${i}`);
      if (!el || el.classList.contains('oculta')) return;
      el.classList.remove('resaltada', 'correcta', 'incorrecta');
      el.classList.add(i === tt.correcta ? 'correcta' : 'incorrecta');
    });
    const ok = tt.resaltada === tt.correcta;
    mostrarMensaje(ok ? '✓ ¡CORRECTO!' : '✗ ¡INCORRECTO!', ok ? 'correcto' : 'incorrecto');
  }
}

// ═══════════════════════════════════════════════════════════════
// SÍ / NO
// ═══════════════════════════════════════════════════════════════

const SN_COLORES_OV = ['#2ecc71', '#e74c3c'];
let snMensajeProcesado = false;

function generarOpcionesSiNo() {
  const grid = document.getElementById('sn-grid-opciones');
  if (!grid) return;
  grid.innerHTML = [0, 1].map(i => `
    <div class="sn-opcion-ov" id="ov-sn-opcion-${i}">
      <div class="sn-ov-texto" id="ov-sn-texto-${i}">${i === 0 ? 'SÍ' : 'NO'}</div>
    </div>`).join('');
}

function actualizarSiNo(sn, comando, modo) {
  const panel = document.getElementById('panel-si-no');
  if (!panel || !sn) return;

  if (modo !== 'si-no') return;

  if (comando === 'limpiar') {
    panel.classList.remove('visible');
    snMensajeProcesado = false;
    return;
  }

  if (comando === 'mostrar_pregunta' && sn.pregunta) {
    panel.classList.add('visible');
    document.getElementById('sn-texto-pregunta').textContent = sn.pregunta;
    snMensajeProcesado = false;
    [0, 1].forEach(i => {
      document.getElementById(`ov-sn-texto-${i}`).textContent = sn.opciones?.[i] || ['SÍ','NO'][i];
      const el = document.getElementById(`ov-sn-opcion-${i}`);
      el.classList.remove('resaltada', 'correcta', 'incorrecta');
    });
    ocultarMensaje();
    return;
  }

  if (comando === 'resaltar') {
    [0, 1].forEach(i => {
      const el = document.getElementById(`ov-sn-opcion-${i}`);
      el.classList.toggle('resaltada', i === sn.resaltada);
    });
    return;
  }

  if (comando === 'revelar_respuesta' && sn.correcta >= 0 && !snMensajeProcesado) {
    snMensajeProcesado = true;
    [0, 1].forEach(i => {
      const el = document.getElementById(`ov-sn-opcion-${i}`);
      el.classList.remove('resaltada', 'correcta', 'incorrecta');
      el.classList.add(i === sn.correcta ? 'correcta' : 'incorrecta');
    });
    const ok = sn.resaltada === sn.correcta;
    mostrarMensaje(ok ? '✓ ¡CORRECTO!' : '✗ ¡INCORRECTO!', ok ? 'correcto' : 'incorrecto');
  }
}

// ── TIMER ─────────────────────────────────────────────────────
function actualizarTimer(timer, timerVisible) {
  const el    = document.getElementById('temporizador-circular');
  const numEl = document.getElementById('num-timer');
  const ring  = document.getElementById('ring-timer');
  if (!el || !numEl || !ring || !timer) return;

  el.classList.toggle('visible', !!timerVisible);
  numEl.textContent = timer.valor;
  ring.style.strokeDashoffset = 283 * (1 - (timer.max > 0 ? timer.valor / timer.max : 0));
  const urgente = timer.valor <= 10 && timer.valor > 0;
  numEl.classList.toggle('urgente', urgente);
  ring.classList.toggle('urgente',  urgente);
}

// ── Reporte de progreso de vídeo → localStorage (lo lee shared-media.js) ──
let _vidProgressRAF = null;
function iniciarReportProgreso(video) {
  if (_vidProgressRAF) cancelAnimationFrame(_vidProgressRAF);
  function tick() {
    if (video && video.duration) {
      localStorage.setItem('konkursox_videoprogress', JSON.stringify({
        pct:      video.currentTime / video.duration,
        duration: video.duration,
      }));
    }
    _vidProgressRAF = requestAnimationFrame(tick);
  }
  _vidProgressRAF = requestAnimationFrame(tick);
}

// ── MULTIMEDIA ────────────────────────────────────────────────
function actualizarMultimedia(media, cmdVideo) {
  const panel    = document.getElementById('panel-multimedia');
  const contenido = document.getElementById('contenido-multimedia');
  if (!panel || !contenido || !media) return;

  // Procesar seek si viene con el estado multimedia
  if (media.seek_pct !== undefined) {
    const v = contenido.querySelector('video');
    if (v?.duration) v.currentTime = v.duration * media.seek_pct;
    return;
  }

  if (!media.activo) {
    panel.classList.remove('visible');
    contenido.innerHTML = '';
    return;
  }
  panel.classList.add('visible');

  if (media.tipo === 'imagen') {
    const img = contenido.querySelector('img');
    if (!img || img.src !== media.url) contenido.innerHTML = `<img src="${media.url}" alt="">`;
  } else if (media.tipo === 'video') {
    let v = contenido.querySelector('video');
    if (!v || v.dataset.src !== media.url) {
      contenido.innerHTML = `<video id="ov-video" src="${media.url}" loop data-src="${media.url}"></video>`;
      v = contenido.querySelector('video');
    }
    if (cmdVideo === 'play')  { v?.play(); iniciarReportProgreso(v); }
    if (cmdVideo === 'pause') v?.pause();
    if (cmdVideo === 'reset') { if (v) { v.currentTime = 0; v.pause(); } }
    if (cmdVideo === 'seek' && media.seek_pct !== undefined && v) {
      v.currentTime = v.duration * media.seek_pct;
    }
  } else if (media.tipo === 'youtube') {
    const m = media.url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) {
      const iframe = contenido.querySelector('iframe');
      if (!iframe || iframe.dataset.vid !== m[1]) {
        contenido.innerHTML = `<iframe src="https://www.youtube.com/embed/${m[1]}?autoplay=1" allow="autoplay" allowfullscreen data-vid="${m[1]}"></iframe>`;
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// ESCALA DE TEXTO
// ═══════════════════════════════════════════════════════════════
function aplicarEscalaOverlay(esc) {
  const root = document.documentElement;
  // Cada variable controla un elemento concreto — directo y fiable
  if (esc.pregunta)           root.style.setProperty('--ov-sz-pregunta',    esc.pregunta + 'px');
  if (esc.opciones)           root.style.setProperty('--ov-sz-opciones',    esc.opciones + 'px');
  if (esc['opciones-sn'])     root.style.setProperty('--ov-sz-opciones-sn', esc['opciones-sn'] + 'px');
  if (esc.precio)             root.style.setProperty('--ov-sz-precio',      esc.precio + 'px');
  if (esc.rosco)              root.style.setProperty('--ov-sz-rosco',       esc.rosco + 'px');
  if (esc['rosco-preg'])      root.style.setProperty('--ov-sz-rosco-preg',  esc['rosco-preg'] + 'px');
  if (esc.escalera !== undefined) root.style.setProperty('--ov-sz-escalera', esc.escalera + 'px');
}

// ═══════════════════════════════════════════════════════════════
// COMODINES
// ═══════════════════════════════════════════════════════════════
let comodinBannerTimeout = null;

function actualizarComodinesOverlay(datos, cmd) {
  // Actualizar barras de comodines en los paneles de pregunta
  if (datos.comodines?.length) {
    renderComodinesBar('tt-comodines-bar', datos.comodines, 'tipo-test');
    renderComodinesBar('sn-comodines-bar', datos.comodines, 'si-no');
  }

  if (cmd === '5050' && datos.tipoTest?.eliminadas5050) {
    const aEliminar = datos.tipoTest.eliminadas5050;
    aEliminar.forEach(i => {
      const el = document.getElementById(`ov-opcion-${i}`);
      if (el) {
        el.style.transition = 'opacity .5s, transform .5s';
        el.style.opacity = '0';
        el.style.transform = 'scale(.8)';
        setTimeout(() => { el.classList.add('oculta'); }, 500);
      }
    });
    mostrarBannerComodin('5️⃣0️⃣', '50/50');
    return;
  }
  if (cmd === 'comodin_banner' && datos.comodinNombre) {
    mostrarBannerComodin(datos.comodinEmoji || '🃏', datos.comodinNombre);
  }
}

function renderComodinesBar(barId, comodines, modo) {
  const bar = document.getElementById(barId);
  if (!bar) return;
  const disponibles = comodines.filter(c => c.disponibleEn?.includes(modo) || !c.disponibleEn);
  if (!disponibles.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  bar.innerHTML = disponibles.map(c => `
    <div class="com-ov-item ${c.usado ? 'com-ov-usado' : ''}" title="${c.nombre}${c.usado ? ' (usado)' : ''}">
      <span class="com-ov-emoji">${c.emoji}</span>
      <span class="com-ov-nombre">${c.nombre}</span>
    </div>`).join('');
}

function mostrarBannerComodin(emoji, nombre) {
  let banner = document.getElementById('comodin-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'comodin-banner';
    document.getElementById('overlay-root').appendChild(banner);
  }
  banner.innerHTML = `<span class="cb-emoji">${emoji}</span><span class="cb-nombre">${nombre}</span>`;
  banner.className = 'visible';
  clearTimeout(comodinBannerTimeout);
  comodinBannerTimeout = setTimeout(() => { banner.className = ''; }, 3500);
}

// ═══════════════════════════════════════════════════════════════
// ESCALERA DE PREMIOS
// ═══════════════════════════════════════════════════════════════

function actualizarEscalera(esc) {
  const panel = document.getElementById('panel-escalera');
  const lista = document.getElementById('escalera-lista');
  if (!panel || !lista || !esc?.peldanos) return;

  panel.classList.toggle('visible', !!esc.visible);
  if (!esc.visible) return;

  lista.innerHTML = esc.peldanos.map((p, i) => {
    const esActivo   = i === esc.activo;
    const esSuperado = i < esc.activo;
    return `
      <div class="esc-item-ov ${esActivo ? 'activo' : esSuperado ? 'superado' : ''}">
        <div class="esc-num">${i + 1}</div>
        <div class="esc-valor">${p}</div>
      </div>`;
  }).join('');
}

// Al abrir overlay, cargar escalera guardada
(function() {
  const raw = localStorage.getItem('konkursox_escalera');
  if (raw) { try { actualizarEscalera(JSON.parse(raw)); } catch {} }
})();

// ═══════════════════════════════════════════════════════════════
// EL ROSCO
// ═══════════════════════════════════════════════════════════════

const ROSCO_ICONOS = { correcta: '✔', fallada: '✗', pasada: '→', activa: '●', pendiente: '' };

function actualizarRosco(rosco, cmd) {
  if (!rosco) return;
  const panel = document.getElementById('panel-rosco');
  if (!panel) return;

  panel.classList.add('visible');

  // Renderizar lista de letras
  const lista = document.getElementById('rosco-lista-overlay');
  if (lista) {
    lista.innerHTML = rosco.letras.map((l, i) => {
      const esActiva = i === rosco.letraActiva;
      const estado   = esActiva ? 'activa' : l.estado;
      const icono    = ROSCO_ICONOS[estado] || '';
      const textoPrg = l.pregunta ? `<em>Con la ${l.letra}...</em> ${l.pregunta}` : '';
      return `
        <div class="rosco-item-ov ${estado}">
          <div class="rosco-ov-badge">${l.letra}</div>
          <div class="rosco-ov-letra-text">${textoPrg}</div>
          <div class="rosco-ov-icono">${icono}</div>
        </div>`;
    }).join('');

    // Scroll suave dentro del contenedor (sin mover la página)
    const items = lista.querySelectorAll('.rosco-item-ov');
    const activa = items[rosco.letraActiva];
    if (activa) {
      const contenedorTop    = lista.getBoundingClientRect().top;
      const itemTop          = activa.getBoundingClientRect().top;
      const itemAltura       = activa.offsetHeight;
      const contenedorAltura = lista.clientHeight;
      const scrollDeseado    = lista.scrollTop + (itemTop - contenedorTop)
                               - (contenedorAltura / 2) + (itemAltura / 2);
      lista.scrollTo({ top: scrollDeseado, behavior: 'smooth' });
    }
  }

  // Letra grande + pregunta actual
  const letraActual = rosco.letras[rosco.letraActiva];
  const elLetra = document.getElementById('rosco-letra-grande');
  const elPreg  = document.getElementById('rosco-pregunta-texto');

  if (elLetra) {
    // Reiniciar animación
    const nueva = letraActual?.letra || '';
    if (elLetra.textContent !== nueva) {
      elLetra.style.animation = 'none';
      void elLetra.offsetWidth;
      elLetra.style.animation = '';
    }
    elLetra.textContent = nueva;
  }

  if (elPreg) {
    const nueva = letraActual?.pregunta
      ? `Con la ${letraActual.letra}... ${letraActual.pregunta}`
      : '';
    if (elPreg.textContent !== nueva) {
      elPreg.style.animation = 'none';
      void elPreg.offsetWidth;
      elPreg.style.animation = '';
    }
    elPreg.textContent = nueva;
  }
}

// ═══════════════════════════════════════════════════════════════
// PRECIO JUSTO
// ═══════════════════════════════════════════════════════════════

function actualizarPrecioJusto(pj, cmd) {
  if (!pj) return;

  const panel = document.getElementById('panel-precio-justo');
  if (!panel) return;

  if (cmd === 'pj_limpiar') {
    panel.classList.remove('visible');
    return;
  }

  panel.classList.add('visible');

  // Texto del objeto
  const elTexto = document.getElementById('pj-texto-objeto');
  if (elTexto) elTexto.textContent = pj.texto || '';

  // Imagen
  const img = document.getElementById('pj-imagen');
  if (img) {
    if (pj.imagenUrl) {
      img.src = pj.imagenUrl;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }
  }

  // Valor propuesto
  const elValor = document.getElementById('pj-valor-numero');
  if (elValor) {
    const valorNuevo = pj.valorActual || '';
    if (elValor.textContent !== valorNuevo) {
      elValor.textContent = valorNuevo;
      elValor.classList.remove('correcto', 'incorrecto', 'animando');
      void elValor.offsetWidth; // reflow para reiniciar animación
      elValor.classList.add('animando');
    }
    // Estado correcto/incorrecto
    if (pj.resuelto) {
      elValor.classList.remove('animando');
      elValor.classList.toggle('correcto',   !!pj.correcto);
      elValor.classList.toggle('incorrecto', !pj.correcto);
    } else {
      elValor.classList.remove('correcto', 'incorrecto');
    }
  }

  // Valor real
  const realWrap = document.getElementById('pj-valor-real-wrap');
  const realNum  = document.getElementById('pj-valor-real-numero');
  if (realWrap && realNum) {
    const mostrarReal = pj.resuelto && pj.valorReal;
    realWrap.style.display = mostrarReal ? 'flex' : 'none';
    if (mostrarReal) realNum.textContent = pj.valorReal;
  }

  // Pista (flecha)
  const pistaWrap = document.getElementById('pj-pista-wrap');
  const pistaFlecha = document.getElementById('pj-pista-flecha');
  const pistaTexto  = document.getElementById('pj-pista-texto');
  if (pistaWrap && pistaFlecha && pistaTexto) {
    const mostrarPista = !pj.resuelto && pj.pista;
    pistaWrap.style.display = mostrarPista ? 'flex' : 'none';
    if (pj.pista === 'mas') {
      pistaWrap.className = 'pista-mas';
      pistaFlecha.textContent = '↑';
      pistaTexto.textContent  = 'MÁS ALTO';
    } else if (pj.pista === 'menos') {
      pistaWrap.className = 'pista-menos';
      pistaFlecha.textContent = '↓';
      pistaTexto.textContent  = 'MÁS BAJO';
    }
  }
}

// ── PERSONALIZACIÓN ──────────────────────────────────────────
function aplicarPersonalizacion(p) {
  // Texto
  const elNombre = document.querySelector('#titulo-programa .nombre');
  const elSub    = document.querySelector('#titulo-programa .subtitulo');
  if (elNombre) elNombre.textContent = p.nombre || 'KONKURSOX';
  if (elSub)    elSub.textContent    = p.subtitulo || '';

  // Colores vía CSS variables en el root
  const root = document.documentElement;
  if (p.colores) {
    if (p.colores.dorado)  root.style.setProperty('--dorado',  p.colores.dorado);
    if (p.colores.verde)   root.style.setProperty('--verde',   p.colores.verde);
    if (p.colores.rojo)    root.style.setProperty('--rojo',    p.colores.rojo);
    if (p.colores.azul)    root.style.setProperty('--azul',    p.colores.azul);
    if (p.colores.fondo) {
      root.style.setProperty('--fondo-color', p.colores.fondo);
      document.getElementById('fondo').style.background = p.colores.fondo;
    }
  }
}

// ── MENSAJE ───────────────────────────────────────────────────
let mensajeTimeout = null;
function mostrarMensaje(texto, tipo) {
  const el = document.getElementById('mensaje-estado');
  if (!el) return;
  el.textContent = texto;
  el.className   = `visible ${tipo}`;
  clearTimeout(mensajeTimeout);
  mensajeTimeout = setTimeout(() => ocultarMensaje(), 3500);
}
function ocultarMensaje() {
  const el = document.getElementById('mensaje-estado');
  if (el) el.className = '';
}

// ═══════════════════════════════════════════════════════════════
// OVERLAY — MODO ONLINE
// ═══════════════════════════════════════════════════════════════

const OV_VOTE_COLORES = ['#3498db', '#e67e22', '#2ecc71', '#9b59b6'];
let _ovTimerMax = 30;
let _ovCurrentOpts = [];

function initOverlayOnline() {
  const apiKey = (window.CONFIG?.ablyApiKey || '').trim();
  if (!apiKey) {
    console.error('[Overlay] Sin API key Ably');
    return;
  }

  mostrarLobbyOverlay();

  OnlineLayer.on('participants_list', (msg) => {
    const lista = msg.payload || [];
    const el = document.getElementById('ov-lobby-lista');
    if (!el) return;
    el.innerHTML = '';
    lista.filter(p => p.role === 'sala').forEach(p => {
      el.appendChild(_ovLobbyItem(p));
    });
  });

  OnlineLayer.on('participant_joined', (msg) => {
    const p = msg.payload;
    if (!p || p.role !== 'sala') return;
    const el = document.getElementById('ov-lobby-lista');
    if (!el || el.querySelector(`[data-id="${p.id}"]`)) return;
    el.appendChild(_ovLobbyItem(p));
  });

  OnlineLayer.on('participant_left', (msg) => {
    const id = msg.payload?.id;
    if (id) document.querySelector(`#ov-lobby-lista [data-id="${id}"]`)?.remove();
  });

  OnlineLayer.on('show_question', (msg) => {
    const d = msg.payload;
    _ovTimerMax    = d.timeLimit ?? 30;
    _ovCurrentOpts = d.options   || [];
    ocultarLobby();
    mostrarPreguntaOnline(d.question, d.options);
    actualizarTimerOnline(_ovTimerMax, _ovTimerMax);
    ocultarVotosOverlay();
  });

  OnlineLayer.on('timer_tick', (msg) => {
    actualizarTimerOnline(msg.payload?.value ?? 0, msg.payload?.max ?? _ovTimerMax);
  });

  OnlineLayer.on('vote_update', (msg) => {
    mostrarVotosOverlay(msg.payload?.counts ?? [], msg.payload?.total ?? 0);
  });

  OnlineLayer.on('reveal_answer', (msg) => {
    const d = msg.payload;
    revelarRespuestaOnline(d.correctIndex ?? -1, d.scores || []);
  });

  OnlineLayer.on('next_question', () => {
    ocultarVotosOverlay();
    ocultarPreguntaOnline();
    mostrarLobbyOverlay();
    document.getElementById('ov-lobby-subtitulo').textContent = 'Siguiente pregunta…';
  });

  OnlineLayer.on('game_over', (msg) => {
    ocultarVotosOverlay();
    ocultarPreguntaOnline();
    mostrarFinPartida(msg.payload?.scores || []);
  });

  OnlineLayer.connect(_ovRoom, 'overlay', apiKey, 'Overlay', false);
}

// ── Lobby overlay ─────────────────────────────────────────────

function _ovLobbyItem(p) {
  const div = document.createElement('div');
  div.className  = 'ov-lobby-p';
  div.dataset.id = p.id;
  div.innerHTML  = `
    <div class="ov-lobby-p-avatar">${(p.name || '?')[0].toUpperCase()}</div>
    <div class="ov-lobby-p-nombre">${p.name || '?'}</div>`;
  return div;
}

function mostrarLobbyOverlay() {
  const el = document.getElementById('ov-lobby');
  if (!el) return;
  const codigoEl = document.getElementById('ov-lobby-codigo');
  if (codigoEl) codigoEl.textContent = _ovRoom;
  const subEl = document.getElementById('ov-lobby-subtitulo');
  if (subEl) subEl.textContent = 'Esperando participantes…';
  el.style.display = 'flex';
}

function ocultarLobby() {
  const el = document.getElementById('ov-lobby');
  if (el) el.style.display = 'none';
}

// ── Pregunta online ───────────────────────────────────────────

function mostrarPreguntaOnline(pregunta, opciones) {
  // Reutilizar el panel de tipo test existente
  const panel = document.getElementById('panel-tipo-test');
  if (panel) panel.style.display = 'flex';

  const pregEl = document.getElementById('texto-pregunta');
  if (pregEl) pregEl.textContent = pregunta || '';

  const grid = document.getElementById('grid-opciones');
  if (!grid) return;
  grid.innerHTML = '';
  (opciones || []).forEach((op, i) => {
    if (!op) return;
    const div = document.createElement('div');
    div.className = 'opcion';
    div.dataset.idx = i;
    div.style.setProperty('--ov-cor', OV_VOTE_COLORES[i] || '#888');
    div.innerHTML = `<span class="opcion-letra">${OV_LETRAS[i]}</span><span class="opcion-texto">${op}</span>`;
    grid.appendChild(div);
  });
}

function ocultarPreguntaOnline() {
  const panel = document.getElementById('panel-tipo-test');
  if (panel) panel.style.display = 'none';
  document.getElementById('grid-opciones').innerHTML = '';
  document.getElementById('texto-pregunta').textContent = '';
}

// ── Timer online ──────────────────────────────────────────────

function actualizarTimerOnline(val, max) {
  _ovTimerMax = max;
  const numEl  = document.getElementById('num-timer');
  const ring   = document.getElementById('ring-timer');
  const timerEl = document.getElementById('temporizador-circular');

  if (timerEl) timerEl.style.display = val > 0 ? '' : 'none';
  if (numEl)  numEl.textContent = val;

  if (ring) {
    const circ = 2 * Math.PI * 45;
    const frac = max > 0 ? val / max : 0;
    ring.style.strokeDasharray  = `${circ}`;
    ring.style.strokeDashoffset = `${circ * (1 - frac)}`;
  }
}

// ── Barras de votos ───────────────────────────────────────────

function mostrarVotosOverlay(counts, total) {
  const el = document.getElementById('ov-vote-bars');
  if (!el) return;
  el.style.display = 'flex';
  el.innerHTML = '';
  _ovCurrentOpts.forEach((op, i) => {
    if (!op) return;
    const count = counts[i] ?? 0;
    const pct   = total > 0 ? Math.round(count / total * 100) : 0;
    const row   = document.createElement('div');
    row.className = 'ov-vote-bar-item';
    row.innerHTML = `
      <div class="ov-vote-letter" style="color:${OV_VOTE_COLORES[i]}">${OV_LETRAS[i]}</div>
      <div class="ov-vote-track">
        <div class="ov-vote-fill" style="width:${pct}%;background:${OV_VOTE_COLORES[i]}"></div>
      </div>
      <div class="ov-vote-pct">${pct}%</div>`;
    el.appendChild(row);
  });
}

function ocultarVotosOverlay() {
  const el = document.getElementById('ov-vote-bars');
  if (el) el.style.display = 'none';
}

// ── Revelar respuesta ─────────────────────────────────────────

function revelarRespuestaOnline(correctIdx, scores) {
  // Destacar opción correcta en el grid
  document.querySelectorAll('#grid-opciones .opcion').forEach((el) => {
    const idx = parseInt(el.dataset.idx ?? '-1');
    if (idx === correctIdx)   el.classList.add('ov-opcion-correcta');
    else                      el.classList.add('ov-opcion-incorrecta');
  });

  // Ocultar timer
  const timerEl = document.getElementById('temporizador-circular');
  if (timerEl) timerEl.style.display = 'none';

  // Mostrar top 3 en mensaje-estado
  if (scores.length > 0) {
    const top3 = scores.slice(0, 3);
    const medals = ['🥇', '🥈', '🥉'];
    const html = top3.map((s, i) => `${medals[i]} ${s.name} — ${s.total} pts`).join('   ');
    mostrarMensaje(html, 'info');
  }
}

// ── Fin de partida ────────────────────────────────────────────

function mostrarFinPartida(scores) {
  ocultarPreguntaOnline();
  ocultarLobby();

  const medals = ['🥇', '🥈', '🥉'];
  const top3   = scores.slice(0, 3);
  const html   = top3.map((s, i) => `${medals[i]} ${s.name}: ${s.total} pts`).join('\n');
  mostrarMensaje('🏁 ¡FIN! ' + html.replace(/\n/g, '   '), 'ok');
}
