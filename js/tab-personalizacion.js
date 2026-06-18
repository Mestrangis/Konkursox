// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-PERSONALIZACION.JS
// Personalización en vivo del overlay: nombre, subtítulo,
// colores principales. Sistema de perfiles guardables.
// ═══════════════════════════════════════════════════════════════

const PERS_KEY     = 'konkursox_personalizacion';
const PERFILES_KEY = 'konkursox_perfiles';

// Configuración activa
let persActual = {
  nombre:    'KONKURSOX',
  subtitulo: '¿Tú le sabes FR FR?',
  colores: {
    dorado:  '#f0a500',
    verde:   '#2ecc71',
    rojo:    '#e74c3c',
    azul:    '#3498db',
    fondo:   '#0c0e13',
  }
};

// Perfiles guardados: [{ nombre, config }]
let persPerfiles = [];

// ── Inicialización ───────────────────────────────────────────────
function initPersonalizacion() {
  persCargar();
  persCargarPerfiles();
  persRellenarUI();
  persRenderPerfiles();

  // Listeners en tiempo real
  document.getElementById('pers-nombre')?.addEventListener('input', persPreviewEnVivo);
  document.getElementById('pers-subtitulo')?.addEventListener('input', persPreviewEnVivo);

  Object.keys(persActual.colores).forEach(key => {
    document.getElementById(`pers-color-${key}`)?.addEventListener('input', persPreviewEnVivo);
    document.getElementById(`pers-color-hex-${key}`)?.addEventListener('input', (e) => {
      const val = e.target.value;
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        const picker = document.getElementById(`pers-color-${key}`);
        if (picker) picker.value = val;
        persPreviewEnVivo();
      }
    });
  });
}

// ── Carga / guardado ─────────────────────────────────────────────
function persCargar() {
  try {
    const g = JSON.parse(localStorage.getItem(PERS_KEY) || 'null');
    if (g) persActual = { ...persActual, ...g, colores: { ...persActual.colores, ...g.colores } };
  } catch {}
}

function persCargarPerfiles() {
  try {
    persPerfiles = JSON.parse(localStorage.getItem(PERFILES_KEY) || '[]');
  } catch { persPerfiles = []; }
}

function persGuardarActual() {
  localStorage.setItem(PERS_KEY, JSON.stringify(persActual));
}

// ── Rellenar UI con valores actuales ─────────────────────────────
function persRellenarUI() {
  const setVal = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
  setVal('pers-nombre',    persActual.nombre);
  setVal('pers-subtitulo', persActual.subtitulo);

  Object.entries(persActual.colores).forEach(([key, val]) => {
    setVal(`pers-color-${key}`,     val);
    setVal(`pers-color-hex-${key}`, val);
  });
}

// ── Aplicar al overlay en vivo ───────────────────────────────────
function persPreviewEnVivo() {
  // Leer valores del UI
  persActual.nombre    = document.getElementById('pers-nombre')?.value    || persActual.nombre;
  persActual.subtitulo = document.getElementById('pers-subtitulo')?.value || persActual.subtitulo;

  Object.keys(persActual.colores).forEach(key => {
    const picker = document.getElementById(`pers-color-${key}`);
    const hex    = document.getElementById(`pers-color-hex-${key}`);
    if (picker) {
      persActual.colores[key] = picker.value;
      if (hex) hex.value = picker.value;
    }
  });

  persEnviarAlOverlay();
  // Preview en el panel
  const pn = document.getElementById('pers-prev-nombre');
  const ps = document.getElementById('pers-prev-sub');
  if (pn) { pn.textContent = persActual.nombre; pn.style.color = persActual.colores.dorado; }
  if (ps) ps.textContent = persActual.subtitulo;
}

function persAplicar() {
  persPreviewEnVivo();
  persGuardarActual();
  toast('Personalización aplicada y guardada', 'ok');
}

function persEnviarAlOverlay() {
  estado.personalizacion = { ...persActual };
  sincronizarOverlay({ comando: 'personalizacion' });
}

// ── Perfiles ─────────────────────────────────────────────────────
function persGuardarPerfil() {
  const nombre = document.getElementById('pers-nuevo-perfil')?.value.trim();
  if (!nombre) { toast('Escribe un nombre para el perfil.', 'error'); return; }

  // Actualizar si ya existe
  const existente = persPerfiles.findIndex(p => p.nombre === nombre);
  const perfil = { nombre, config: JSON.parse(JSON.stringify(persActual)) };

  if (existente >= 0) {
    persPerfiles[existente] = perfil;
    toast(`Perfil "${nombre}" actualizado`, 'ok');
  } else {
    persPerfiles.push(perfil);
    toast(`Perfil "${nombre}" guardado`, 'ok');
  }

  localStorage.setItem(PERFILES_KEY, JSON.stringify(persPerfiles));
  document.getElementById('pers-nuevo-perfil').value = '';
  persRenderPerfiles();
}

function persCargarPerfil(i) {
  const perfil = persPerfiles[i];
  if (!perfil) return;
  persActual = JSON.parse(JSON.stringify(perfil.config));
  persRellenarUI();
  persEnviarAlOverlay();
  persGuardarActual();
  toast(`Perfil "${perfil.nombre}" cargado`, 'ok');
}

function persBorrarPerfil(i, e) {
  e.stopPropagation();
  persPerfiles.splice(i, 1);
  localStorage.setItem(PERFILES_KEY, JSON.stringify(persPerfiles));
  persRenderPerfiles();
  toast('Perfil eliminado', 'info');
}

function persRenderPerfiles() {
  const lista = document.getElementById('pers-perfiles-lista');
  if (!lista) return;

  if (!persPerfiles.length) {
    lista.innerHTML = '<div class="banco-vacio">No hay perfiles guardados todavía.</div>';
    return;
  }

  lista.innerHTML = persPerfiles.map((p, i) => `
    <div class="perfil-item" onclick="persCargarPerfil(${i})">
      <div class="perfil-preview">
        <span class="perfil-dot" style="background:${p.config.colores.dorado}"></span>
        <span class="perfil-dot" style="background:${p.config.colores.verde}"></span>
        <span class="perfil-dot" style="background:${p.config.colores.rojo}"></span>
        <span class="perfil-dot" style="background:${p.config.colores.azul}"></span>
      </div>
      <div class="perfil-info">
        <div class="perfil-nombre">${p.nombre}</div>
        <div class="perfil-sub">${p.config.nombre} · ${p.config.subtitulo}</div>
      </div>
      <button class="banco-item-del" onclick="persBorrarPerfil(${i}, event)" title="Eliminar">✕</button>
    </div>
  `).join('');
}

// ── Reset a valores por defecto ──────────────────────────────────
function persReset() {
  if (!confirm('¿Resetear a los valores por defecto?')) return;
  persActual = {
    nombre: 'KONKURSOX', subtitulo: '¿Tú le sabes FR FR?',
    colores: { dorado:'#f0a500', verde:'#2ecc71', rojo:'#e74c3c', azul:'#3498db', fondo:'#0c0e13' }
  };
  persRellenarUI();
  persEnviarAlOverlay();
  persGuardarActual();
  toast('Personalización restaurada', 'info');
}
