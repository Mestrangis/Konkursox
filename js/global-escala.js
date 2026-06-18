// ═══════════════════════════════════════════════════════════════
// KONKURSOX — GLOBAL-ESCALA.JS
// Control de tamaños de texto del overlay desde el panel.
// ═══════════════════════════════════════════════════════════════

const OV_ESCALA_KEY = 'konkursox_escala';

const OV_ESCALA_DEFAULTS = {
  escalera:     16,
  pregunta:     30,
  opciones:     20,
  'opciones-sn': 48,
  precio:       110,
  rosco:        200,
  'rosco-preg': 36,
};

let ovEscalaConfig = { ...OV_ESCALA_DEFAULTS };

function ovEscalaInit() {
  try {
    const g = JSON.parse(localStorage.getItem(OV_ESCALA_KEY) || 'null');
    if (g) ovEscalaConfig = { ...OV_ESCALA_DEFAULTS, ...g };
  } catch {}
  // Rellenar sliders con valores guardados
  Object.keys(OV_ESCALA_DEFAULTS).filter(k => k !== 'global').forEach(k => {
    ovSetSlider(`ov-sz-${k.replace('/','-')}`, ovEscalaConfig[k], `ov-sz-${k.replace('/','-')}-lbl`, 'px');
  });
  ovEscalaEnviar();
}

function ovSetSlider(sliderId, value, lblId, suffix) {
  const s = document.getElementById(sliderId);
  const l = document.getElementById(lblId);
  if (s) s.value = value;
  if (l) l.textContent = value + suffix;
}

function ovSzUpdate(key, val) {
  ovEscalaConfig[key] = parseInt(val);
  const lbl = document.getElementById(`ov-sz-${key}-lbl`);
  if (lbl) lbl.textContent = val + 'px';
  ovEscalaGuardarEnviar();
}

function ovEscalaGuardarEnviar() {
  localStorage.setItem(OV_ESCALA_KEY, JSON.stringify(ovEscalaConfig));
  ovEscalaEnviar();
}

function ovEscalaEnviar() {
  estado.escala = { ...ovEscalaConfig };
  sincronizarOverlay({ comando: 'escala' });
}
