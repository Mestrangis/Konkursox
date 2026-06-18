// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-PRECIO-JUSTO.JS  v2
// ═══════════════════════════════════════════════════════════════

let pjMedia  = null;
let pjTimer  = null;
let pjAudioCtx = null;

let pjBanco = [];
let pjBancoActivo = -1;

const PJ_BANCO_KEY = 'konkursox_banco_preciojusto';

// Estado activo
const pjEstado = {
  texto:       '',
  imagenUrl:   '',
  valorActual: '',
  valorReal:   '',
  pista:       null,    // 'mas' | 'menos' | null
  resuelto:    false,
  correcto:    null,    // true | false | null
  visible:     false,
};

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function initPrecioJusto() {
  pjMedia = new MediaPanel('pj');
  pjMedia.init();

  pjTimer = new GameTimer('pj');
  pjTimer.init();

  sfxInit('pj');

  pjCargarBanco();
  pjRenderBanco();
  renderBibliotecaGrid('pj');

  // Imagen rápida desde explorador
  document.getElementById('pj-file-imagen')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const url = URL.createObjectURL(f);
    document.getElementById('pj-input-imagen').value = url;
    pjEstado.imagenUrl = url;
    e.target.value = '';
    toast(`Imagen cargada: ${f.name}`, 'info');
  });

  // Música
  document.getElementById('pj-input-musica')?.addEventListener('change', (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const audio = document.getElementById('pj-audio');
    audio.src = URL.createObjectURL(f);
    const lbl = document.getElementById('pj-nombre-pista');
    if (lbl) lbl.textContent = f.name.length > 38 ? f.name.slice(0,38)+'…' : f.name;
  });
  document.getElementById('pj-progreso-musica')?.addEventListener('input', (e) => {
    const a = document.getElementById('pj-audio');
    if (a?.duration) a.currentTime = (e.target.value / 100) * a.duration;
  });
  document.getElementById('pj-audio')?.addEventListener('timeupdate', () => {
    const a = document.getElementById('pj-audio');
    const s = document.getElementById('pj-progreso-musica');
    if (a?.duration && s) s.value = (a.currentTime / a.duration) * 100;
  });

  // Sync valor al escribir
  document.getElementById('pj-input-valor')?.addEventListener('input', (e) => {
    pjEstado.valorActual = e.target.value;
  });
  document.getElementById('pj-input-valor-real')?.addEventListener('input', (e) => {
    pjEstado.valorReal = e.target.value;
  });
  document.getElementById('pj-input-texto')?.addEventListener('input', (e) => {
    pjEstado.texto = e.target.value;
  });
  document.getElementById('pj-input-imagen')?.addEventListener('input', (e) => {
    pjEstado.imagenUrl = e.target.value;
  });
}

// ═══════════════════════════════════════════════════════════════
// ACCIONES PRINCIPALES
// ═══════════════════════════════════════════════════════════════

function pjMostrar() {
  const valor = document.getElementById('pj-input-valor').value.trim();
  if (!valor) { toast('Introduce el valor propuesto.', 'error'); return; }

  pjEstado.texto       = document.getElementById('pj-input-texto').value.trim();
  pjEstado.imagenUrl   = document.getElementById('pj-input-imagen').value.trim();
  pjEstado.valorActual = valor;
  pjEstado.pista       = null;
  pjEstado.resuelto    = false;
  pjEstado.correcto    = null;
  pjEstado.visible     = true;
  estado.precioJusto   = { ...pjEstado };
  estado.modo          = 'precio-justo';

  pjTimer.reset(false);
  sincronizarOverlay({ comando: 'pj_mostrar' });
  sfxSisPlay('pregunta');
  toast('Precio Justo enviado al overlay', 'ok');
}

function pjActualizarValor() {
  const valor = document.getElementById('pj-input-valor').value.trim();
  if (!valor || !pjEstado.visible) return;
  pjEstado.valorActual = valor;
  pjEstado.pista       = null;
  estado.precioJusto   = { ...pjEstado };
  sincronizarOverlay({ comando: 'pj_valor' });
}

function pjPista(direccion) {
  // direccion: 'mas' | 'menos'
  pjEstado.pista    = direccion;
  pjEstado.resuelto = false;
  pjEstado.correcto = null;
  estado.precioJusto = { ...pjEstado };
  sincronizarOverlay({ comando: 'pj_pista' });
  sfxSisPlay('tension');
}

function pjResolver(correcto) {
  const valorReal = document.getElementById('pj-input-valor-real').value.trim();
  pjEstado.resuelto  = true;
  pjEstado.correcto  = correcto;
  pjEstado.valorReal = valorReal;
  pjEstado.pista     = null;
  estado.precioJusto = { ...pjEstado };
  pjTimer.pararSilencioso();
  sincronizarOverlay({ comando: 'pj_resolver' });
  sfxSisPlay(correcto ? 'correcto' : 'incorrecto');
}

function pjLimpiar() {
  document.getElementById('pj-input-texto').value      = '';
  document.getElementById('pj-input-imagen').value     = '';
  document.getElementById('pj-input-valor').value      = '';
  document.getElementById('pj-input-valor-real').value = '';
  Object.assign(pjEstado, {
    texto:'', imagenUrl:'', valorActual:'', valorReal:'',
    pista:null, resuelto:false, correcto:null, visible:false
  });
  pjBancoActivo = -1;
  pjRenderBanco();
  estado.precioJusto = { ...pjEstado };
  estado.modo = null;
  pjTimer.reset(false);
  sincronizarOverlay({ comando: 'pj_limpiar' });
  toast('Overlay limpiado', 'info');
}

function pjSeleccionarImagen() {
  document.getElementById('pj-file-imagen')?.click();
}

// ═══════════════════════════════════════════════════════════════
// BANCO DE ITEMS
// ═══════════════════════════════════════════════════════════════
function pjCargarBanco() {
  try { pjBanco = JSON.parse(localStorage.getItem(PJ_BANCO_KEY) || '[]'); }
  catch { pjBanco = []; }
}

function pjGuardar() {
  const texto = document.getElementById('pj-input-texto').value.trim();
  const valor = document.getElementById('pj-input-valor').value.trim();
  if (!texto && !valor) { toast('Añade al menos texto o valor para guardar.', 'error'); return; }
  const item = {
    texto,
    imagenUrl: document.getElementById('pj-input-imagen').value.trim(),
    valorReal: document.getElementById('pj-input-valor-real').value.trim(),
  };
  if (pjBancoActivo >= 0) {
    pjBanco[pjBancoActivo] = item;
    toast('Item actualizado', 'ok');
  } else {
    pjBanco.push(item);
    pjBancoActivo = pjBanco.length - 1;
    toast('Item guardado', 'ok');
  }
  localStorage.setItem(PJ_BANCO_KEY, JSON.stringify(pjBanco));
  pjRenderBanco();
}

function pjCargarDesdeBanco(i) {
  const item = pjBanco[i];
  if (!item) return;
  pjBancoActivo = i;
  document.getElementById('pj-input-texto').value      = item.texto || '';
  document.getElementById('pj-input-imagen').value     = item.imagenUrl || '';
  document.getElementById('pj-input-valor-real').value = item.valorReal || '';
  document.getElementById('pj-input-valor').value      = '';
  pjEstado.texto     = item.texto || '';
  pjEstado.imagenUrl = item.imagenUrl || '';
  pjEstado.valorReal = item.valorReal || '';
  pjRenderBanco();
  toast('Item cargado', 'info');
}

function pjBorrarDeBanco(i, e) {
  e.stopPropagation();
  pjBanco.splice(i, 1);
  if (pjBancoActivo === i) pjBancoActivo = -1;
  else if (pjBancoActivo > i) pjBancoActivo--;
  localStorage.setItem(PJ_BANCO_KEY, JSON.stringify(pjBanco));
  pjRenderBanco();
  toast('Item eliminado', 'info');
}

function pjRenderBanco() {
  const lista = document.getElementById('pj-banco-lista');
  if (!lista) return;
  if (!pjBanco.length) {
    lista.innerHTML = '<div class="banco-vacio">No hay items guardados todavía.</div>';
    return;
  }
  lista.innerHTML = pjBanco.map((item, i) => `
    <div class="banco-item${pjBancoActivo === i ? ' activo' : ''}" onclick="pjCargarDesdeBanco(${i})">
      <div class="banco-item-num">${i+1}</div>
      <div class="banco-item-texto">
        ${item.texto || '(sin texto)'}
        ${item.valorReal ? `<span style="color:var(--dorado);margin-left:6px">→ ${item.valorReal}</span>` : ''}
      </div>
      <button class="banco-item-del" onclick="pjBorrarDeBanco(${i},event)" title="Eliminar">✕</button>
    </div>`).join('');
}

function pjExportarBanco() {
  if (!pjBanco.length) { toast('El banco está vacío.', 'error'); return; }
  const blob = new Blob([JSON.stringify(pjBanco, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = 'banco_preciojusto.json'; a.click();
  toast('Banco exportado', 'ok');
}

function pjImportarBanco(e) {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const d = JSON.parse(ev.target.result);
      if (!Array.isArray(d)) throw new Error();
      pjBanco = [...pjBanco, ...d];
      localStorage.setItem(PJ_BANCO_KEY, JSON.stringify(pjBanco));
      pjRenderBanco();
      toast(`${d.length} items importados`, 'ok');
    } catch { toast('Archivo JSON inválido.', 'error'); }
  };
  r.readAsText(f); e.target.value = '';
}

// ═══════════════════════════════════════════════════════════════
// MÚSICA
// ═══════════════════════════════════════════════════════════════
function pjPlayMusica()  { const a=document.getElementById('pj-audio'); if(!a?.src||a.src===location.href){toast('Carga una pista primero.','error');return;} a.play(); }
function pjPausaMusica() { document.getElementById('pj-audio')?.pause(); }
function pjStopMusica()  { const a=document.getElementById('pj-audio'); if(a){a.pause();a.currentTime=0;} }
function pjVolMusica(v)  { const a=document.getElementById('pj-audio'); if(a)a.volume=v/100; const l=document.getElementById('pj-vol-musica-lbl'); if(l)l.textContent=v+'%'; }

// ═══════════════════════════════════════════════════════════════
// ACTIVAR MODO
// ═══════════════════════════════════════════════════════════════
function pjActivarModo() {
  estado.modo = 'precio-justo';
  estado.precioJusto = { ...pjEstado };
  sincronizarOverlay({ comando: 'activar_modo' });
  toast('Modo Precio Justo activado en el overlay', 'ok');
}
