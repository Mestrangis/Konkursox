// ═══════════════════════════════════════════════════════════════
// KONKURSOX — TAB-SALA.JS
// Modo multijugador online (Kahoot-style).
// Gestiona la pestaña "🌐 Sala" del panel de control.
// ═══════════════════════════════════════════════════════════════

const SALA_BANCO_KEY  = 'konkursox_sala_banco';
const SALA_LETRAS     = ['A', 'B', 'C', 'D'];
const SALA_COLORES    = ['#3498db', '#e67e22', '#2ecc71', '#9b59b6'];

// ── Estado ────────────────────────────────────────────────────

let _salaPreg = {
  text: '', options: ['', '', '', ''], correct: -1, timeLimit: 30, num: 0,
};
let _salaBanco        = [];
let _salaFase         = 'lobby';   // 'lobby' | 'pregunta' | 'revelada' | 'fin'
let _salaTimerInt     = null;
let _salaTimerVal     = 0;
let _salaPartic       = new Map();  // id → {id, name, voted, score}
let _roundResults     = [];        // [{id, name, option, correct, points}]
const _scores         = new Map(); // id → {name, total}

// ── Inicialización ────────────────────────────────────────────

function initTabSala() {
  try {
    const raw = localStorage.getItem(SALA_BANCO_KEY);
    if (raw) _salaBanco = JSON.parse(raw);
  } catch {}

  _renderOpcionInputs();
  _renderBanco();

  OnlineLayer.on('connected',          _onSalaConectado);
  OnlineLayer.on('disconnected',       _onSalaConectado);
  OnlineLayer.on('participants_list',  _onParticipantsList);
  OnlineLayer.on('participant_joined', _onParticipantJoined);
  OnlineLayer.on('participant_left',   _onParticipantLeft);
  OnlineLayer.on('vote_update',        _onVoteUpdate);

  salaRenderEstado();
}

// Expuesto para que core.js pueda llamarlo
function salaRenderEstado() { _renderSalaEstado(); }
function salaRenderParticipantes() { _renderParticipantes(); }

// ── Handlers OnlineLayer ──────────────────────────────────────

function _onSalaConectado() { _renderSalaEstado(); }

function _onParticipantsList(msg) {
  _salaPartic.clear();
  (msg.payload || []).filter(p => p.role === 'sala').forEach(p => {
    _salaPartic.set(p.id, { ...p, score: _scores.get(p.id)?.total ?? 0 });
  });
  _renderParticipantes();
}

function _onParticipantJoined(msg) {
  const p = msg.payload;
  if (!p || p.role !== 'sala') return;
  _salaPartic.set(p.id, { ...p, score: _scores.get(p.id)?.total ?? 0 });
  _renderParticipantes();
}

function _onParticipantLeft(msg) {
  const id = msg.payload?.id;
  if (id) { _salaPartic.delete(id); _renderParticipantes(); }
}

function _onVoteUpdate(msg) {
  _renderVotos(msg.payload?.counts ?? [], msg.payload?.total ?? 0);
  // Marcar los que ya han votado en la lista
  const total = msg.payload?.total ?? 0;
  const ctr = document.getElementById('sala-votos-contador');
  if (ctr) ctr.textContent = `${total} / ${_salaPartic.size}`;
}

// ── Render: estado de sala ────────────────────────────────────

function _renderSalaEstado() {
  const cerrado = document.getElementById('sala-estado-cerrado');
  const abierto = document.getElementById('sala-estado-abierto');
  if (!cerrado || !abierto) return;

  const activa = window.appMode !== 'local' && window.currentRoom;
  cerrado.style.display = activa ? 'none' : '';
  abierto.style.display = activa ? '' : 'none';

  if (!activa) return;

  const codigoEl = document.getElementById('sala-codigo-display');
  if (codigoEl) codigoEl.textContent = window.currentRoom;

  const statusEl = document.getElementById('sala-ws-status');
  if (statusEl) {
    statusEl.innerHTML = OnlineLayer.isConnected()
      ? '<span style="color:var(--verde)">● Conectado</span>'
      : '<span style="color:var(--naranja)">◌ Conectando…</span>';
  }

  const base = location.origin + location.pathname.replace('panel.html', '');
  const salaUrl = `${base}sala.html?room=${window.currentRoom}`;
  const linkInput = document.getElementById('sala-link-input');
  if (linkInput) linkInput.value = salaUrl;
}

function salaCopiarLink() {
  const base = location.origin + location.pathname.replace('panel.html', '');
  const url = `${base}sala.html?room=${window.currentRoom}`;
  navigator.clipboard?.writeText(url)
    .then(() => toast('¡Copiado!', 'ok'))
    .catch(() => toast('No se pudo copiar', 'error'));
}

// ── Render: participantes ─────────────────────────────────────

function _renderParticipantes() {
  const el  = document.getElementById('sala-p-list');
  const ctr = document.getElementById('sala-p-count');
  if (!el) return;

  const lista = [..._salaPartic.values()];
  if (ctr) ctr.textContent = lista.length;

  el.innerHTML = '';
  lista.forEach(p => {
    const div = document.createElement('div');
    div.className = 'sala-p-item';
    div.dataset.id = p.id;
    div.innerHTML = `
      <div class="sala-p-avatar">${(p.name || '?')[0].toUpperCase()}</div>
      <div class="sala-p-info">
        <span class="sala-p-nombre">${p.name || '?'}</span>
        <span class="sala-p-score">${p.score ?? 0} pts</span>
      </div>
      <div class="sala-p-badges">${p.voted ? '<span class="badge-votado" title="Votó">✓</span>' : ''}</div>
      <button class="btn btn-rojo btn-sm sala-kick-btn" onclick="salaKick('${p.id}')" title="Expulsar">✕</button>`;
    el.appendChild(div);
  });
}

function salaKick(id) {
  _salaPartic.delete(id);
  OnlineLayer.publish({ type: 'kicked', id });
  _renderParticipantes();
  toast('Participante expulsado', 'info');
}

// ── Editor de opciones ────────────────────────────────────────

function _renderOpcionInputs() {
  const el = document.getElementById('sala-q-opciones');
  if (!el) return;
  el.innerHTML = '';
  SALA_LETRAS.forEach((l, i) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px';
    row.innerHTML = `
      <label style="display:flex;align-items:center;gap:4px;flex-shrink:0;cursor:pointer">
        <input type="radio" name="sala-correcta" value="${i}"
               onchange="_salaPreg.correct=${i}" />
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:800;
                     color:${SALA_COLORES[i]};min-width:16px">${l}</span>
      </label>
      <input type="text" id="sala-opt-${i}" class="input-field"
             placeholder="Opción ${l}…"
             oninput="_salaPreg.options[${i}]=this.value"
             style="flex:1" />`;
    el.appendChild(row);
  });
}

function salaActualizarEstado() {
  _salaPreg.text      = document.getElementById('sala-q-text')?.value || '';
  _salaPreg.options   = SALA_LETRAS.map((_, i) => document.getElementById(`sala-opt-${i}`)?.value || '');
  _salaPreg.timeLimit = parseInt(document.getElementById('sala-q-tiempo')?.value || '30');
}

// ── Enviar pregunta ───────────────────────────────────────────

function salaEnviarPregunta() {
  if (!OnlineLayer.isConnected()) { toast('Sin conexión Ably', 'error'); return; }
  salaActualizarEstado();

  if (!_salaPreg.text.trim())                                     { toast('Escribe la pregunta', 'error'); return; }
  if (_salaPreg.options.filter(o => o.trim()).length < 2)         { toast('Añade al menos 2 opciones', 'error'); return; }
  if (_salaPreg.correct < 0)                                      { toast('Marca la respuesta correcta', 'error'); return; }

  _salaPreg.num++;
  _salaFase = 'pregunta';
  _salaPartic.forEach(p => { p.voted = false; });
  _roundResults = [];

  OnlineLayer.publish({
    type:        'show_question',
    question:    _salaPreg.text,
    options:     _salaPreg.options,
    timeLimit:   _salaPreg.timeLimit,
    questionNum: _salaPreg.num,
  });

  _salaFaseUI();
  _iniciarTimerPanel();
  _renderVotos([], 0);

  const ctr = document.getElementById('sala-votos-contador');
  if (ctr) ctr.textContent = `0 / ${_salaPartic.size}`;

  toast(`Pregunta ${_salaPreg.num} enviada`, 'ok');
}

// ── Timer panel ───────────────────────────────────────────────

function _iniciarTimerPanel() {
  clearInterval(_salaTimerInt);
  _salaTimerVal = _salaPreg.timeLimit;
  _renderTimerNum();

  _salaTimerInt = setInterval(() => {
    _salaTimerVal--;
    OnlineLayer.publish({ type: 'timer_tick', value: _salaTimerVal, max: _salaPreg.timeLimit });
    _renderTimerNum();
    if (_salaTimerVal <= 0) { clearInterval(_salaTimerInt); salaRevelar(); }
  }, 1000);
}

function _renderTimerNum() {
  const el = document.getElementById('sala-q-num');
  if (el) el.textContent = `P${_salaPreg.num}  ⏱ ${_salaTimerVal}s`;
}

function salaForzarRevelar() { clearInterval(_salaTimerInt); salaRevelar(); }

// ── Revelar respuesta ─────────────────────────────────────────

function salaRevelar() {
  if (_salaFase !== 'pregunta') return;
  clearInterval(_salaTimerInt);
  _salaFase = 'revelada';

  const voteData    = OnlineLayer.getVoteData();
  const timeLimitMs = _salaPreg.timeLimit * 1000;

  _roundResults = [];
  voteData.forEach(v => {
    const correct = v.option === _salaPreg.correct;
    let points = 0;
    if (correct) {
      const ratio = Math.max(0, 1 - v.elapsed / timeLimitMs);
      points = 1000 + Math.round(500 * ratio);
    }
    _roundResults.push({ id: v.id, option: v.option, correct, points });

    const existing = _scores.get(v.id) || { name: '?', total: 0 };
    _scores.set(v.id, { name: existing.name, total: existing.total + points });
  });

  // Asignar nombres y actualizar participantes
  _roundResults.forEach(r => {
    const p = _salaPartic.get(r.id);
    if (p) {
      r.name = p.name;
      const sc = _scores.get(r.id);
      if (sc) sc.name = p.name;
      p.voted = true;
      p.score = _scores.get(r.id)?.total ?? 0;
    }
  });

  const scoresArr = [..._scores.entries()]
    .map(([id, s]) => ({
      id,
      name:        s.name,
      total:       s.total,
      roundPoints: _roundResults.find(r => r.id === id)?.points ?? 0,
      correct:     _roundResults.find(r => r.id === id)?.correct ?? false,
    }))
    .sort((a, b) => b.total - a.total);

  OnlineLayer.publish({
    type:         'reveal_answer',
    correctIndex: _salaPreg.correct,
    questionNum:  _salaPreg.num,
    scores:       scoresArr,
  });

  _salaFaseUI();
  _renderParticipantes();
  _renderResultados(scoresArr);
}

// ── Siguiente / Fin ───────────────────────────────────────────

function salaSiguiente() {
  _salaFase = 'lobby';
  _salaPartic.forEach(p => { p.voted = false; });
  OnlineLayer.publish({ type: 'next_question', questionNum: _salaPreg.num + 1 });

  // Limpiar editor
  if (document.getElementById('sala-q-text')) document.getElementById('sala-q-text').value = '';
  SALA_LETRAS.forEach((_, i) => {
    const inp = document.getElementById(`sala-opt-${i}`);
    if (inp) inp.value = '';
  });
  document.querySelectorAll('input[name="sala-correcta"]').forEach(r => { r.checked = false; });
  _salaPreg = { text: '', options: ['', '', '', ''], correct: -1, timeLimit: _salaPreg.timeLimit, num: _salaPreg.num };

  const numEl = document.getElementById('sala-q-num');
  if (numEl) numEl.textContent = `P${_salaPreg.num + 1} — lista`;

  _salaFaseUI();
  _renderVotos([], 0);
  _renderMarcador(); // Volver al marcador sin ronda
}

function salaFinPartida() {
  clearInterval(_salaTimerInt);
  _salaFase = 'fin';

  const scoresArr = [..._scores.entries()]
    .map(([id, s]) => ({ id, name: s.name, total: s.total, roundPoints: 0, correct: false }))
    .sort((a, b) => b.total - a.total);

  OnlineLayer.publish({ type: 'game_over', scores: scoresArr });
  _salaFaseUI();
  _renderMarcador();
  toast('¡Partida finalizada!', 'ok');
}

function salaNuevaPartida() {
  _salaFase = 'lobby';
  _salaPreg = { text: '', options: ['', '', '', ''], correct: -1, timeLimit: 30, num: 0 };
  _roundResults = [];
  _scores.clear();
  _salaPartic.forEach(p => { p.voted = false; p.score = 0; });

  OnlineLayer.publish({ type: 'new_game' });

  if (document.getElementById('sala-q-text')) document.getElementById('sala-q-text').value = '';
  SALA_LETRAS.forEach((_, i) => {
    const inp = document.getElementById(`sala-opt-${i}`);
    if (inp) inp.value = '';
  });
  document.querySelectorAll('input[name="sala-correcta"]').forEach(r => { r.checked = false; });
  document.getElementById('sala-q-tiempo').value = 30;
  document.getElementById('sala-q-tiempo-lbl').textContent = '30s';

  _salaFaseUI();
  _renderParticipantes();
  _renderVotos([], 0);
  _renderMarcador();
  toast('Nueva partida iniciada', 'ok');
}

// ── UI según fase ─────────────────────────────────────────────

function _salaFaseUI() {
  ['lobby', 'pregunta', 'revelada', 'fin'].forEach(f => {
    const el = document.getElementById(`sala-btn-fase-${f}`);
    if (el) el.style.display = f === _salaFase ? '' : 'none';
  });
  const editing = _salaFase === 'lobby';
  const qText = document.getElementById('sala-q-text');
  if (qText) qText.disabled = !editing;
  SALA_LETRAS.forEach((_, i) => {
    const inp = document.getElementById(`sala-opt-${i}`);
    if (inp) inp.disabled = !editing;
    const r = document.querySelector(`input[name="sala-correcta"][value="${i}"]`);
    if (r) r.disabled = !editing;
  });
  const tiempo = document.getElementById('sala-q-tiempo');
  if (tiempo) tiempo.disabled = !editing;
}

// ── Render: barras de votos ───────────────────────────────────

function _renderVotos(counts, total) {
  const el = document.getElementById('sala-votos-barras');
  if (!el) return;
  const numOpts = _salaPreg.options.filter(o => o.trim()).length || 4;
  el.innerHTML = '';
  for (let i = 0; i < numOpts; i++) {
    const count = counts[i] ?? 0;
    const pct   = total > 0 ? Math.round(count / total * 100) : 0;
    const row   = document.createElement('div');
    row.className = 'voto-barra-row';
    row.innerHTML = `
      <div class="voto-barra-letra" style="color:${SALA_COLORES[i]}">${SALA_LETRAS[i]}</div>
      <div class="voto-barra-wrap">
        <div class="voto-barra" style="width:${pct}%;background:${SALA_COLORES[i]}"></div>
      </div>
      <div class="voto-count">${count} <span style="color:var(--text-muted);font-size:10px">${pct}%</span></div>`;
    el.appendChild(row);
  }
}

// ── Render: resultados de ronda + marcador acumulado ──────────

function _renderResultados(scoresArr) {
  const el = document.getElementById('sala-marcador-list');
  if (!el) return;

  const medals = ['🥇', '🥈', '🥉'];
  const rondaHtml = _roundResults.length > 0 ? `
    <div class="sala-seccion-label">Esta ronda</div>
    ${[..._roundResults].sort((a, b) => b.points - a.points).map(r => `
      <div class="sala-resultado-fila">
        <span style="font-size:15px">${r.correct ? '✅' : '❌'}</span>
        <span style="flex:1;font-size:12px">${r.name || '?'}</span>
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:14px;font-weight:800;
                     color:${r.correct ? 'var(--verde)' : 'var(--rojo)'}">
          ${r.correct ? '+' + r.points : '–'}
        </span>
      </div>`).join('')}
    <div class="sala-seccion-label" style="margin-top:10px">Marcador acumulado</div>` : '';

  const marcadorHtml = (scoresArr || [..._scores.entries()].map(([id, s]) => ({ id, ...s })).sort((a, b) => b.total - a.total))
    .map((s, i) => `
      <div class="sala-resultado-fila">
        <span style="font-size:13px;width:20px;text-align:center">${medals[i] || (i + 1)}</span>
        <span style="flex:1;font-size:12px;font-weight:600">${s.name}</span>
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:15px;font-weight:800;color:var(--dorado)">${s.total}</span>
      </div>`).join('');

  el.innerHTML = rondaHtml + marcadorHtml;
}

function _renderMarcador() {
  const el = document.getElementById('sala-marcador-list');
  if (!el) return;
  const sorted = [..._scores.entries()]
    .map(([id, s]) => ({ id, ...s }))
    .sort((a, b) => b.total - a.total);
  if (sorted.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;text-align:center;padding:12px">Sin puntuaciones aún</div>';
    return;
  }
  _renderResultados(sorted);
}

// ── Banco de preguntas ────────────────────────────────────────

function salaGuardarBanco() {
  salaActualizarEstado();
  if (!_salaPreg.text.trim()) { toast('No hay pregunta para guardar', 'error'); return; }
  _salaBanco.push(JSON.parse(JSON.stringify(_salaPreg)));
  localStorage.setItem(SALA_BANCO_KEY, JSON.stringify(_salaBanco));
  _renderBanco();
  toast('Guardada en banco', 'ok');
}

function salaBancoCargar(idx) {
  if (_salaFase !== 'lobby') { toast('Solo puedes cargar durante el lobby', 'error'); return; }
  const q = _salaBanco[idx];
  if (!q) return;
  _salaPreg = { ...q };
  if (document.getElementById('sala-q-text')) document.getElementById('sala-q-text').value = q.text || '';
  SALA_LETRAS.forEach((_, i) => {
    const inp = document.getElementById(`sala-opt-${i}`);
    if (inp) inp.value = q.options[i] || '';
  });
  const tEl = document.getElementById('sala-q-tiempo');
  if (tEl) {
    tEl.value = q.timeLimit || 30;
    document.getElementById('sala-q-tiempo-lbl').textContent = tEl.value + 's';
  }
  document.querySelectorAll('input[name="sala-correcta"]').forEach(r => {
    r.checked = parseInt(r.value) === q.correct;
  });
  toast('Pregunta cargada', 'ok');
}

function salaBancoEliminar(idx, e) {
  e.stopPropagation();
  _salaBanco.splice(idx, 1);
  localStorage.setItem(SALA_BANCO_KEY, JSON.stringify(_salaBanco));
  _renderBanco();
}

function salaBancoLimpiar() {
  if (!confirm('¿Vaciar todo el banco de preguntas?')) return;
  _salaBanco = [];
  localStorage.removeItem(SALA_BANCO_KEY);
  _renderBanco();
  toast('Banco vaciado', 'info');
}

function _renderBanco() {
  const el = document.getElementById('sala-banco-list');
  if (!el) return;
  if (_salaBanco.length === 0) {
    el.innerHTML = '<div style="color:var(--text-muted);font-size:12px;padding:6px 0">Sin preguntas guardadas</div>';
    return;
  }
  el.innerHTML = _salaBanco.map((q, i) => `
    <div class="banco-item" onclick="salaBancoCargar(${i})" title="Cargar esta pregunta">
      <span class="banco-item-text">${q.text || 'Sin texto'}</span>
      <button class="btn btn-rojo btn-sm" onclick="salaBancoEliminar(${i},event)"
              style="padding:1px 5px;font-size:10px;flex-shrink:0">✕</button>
    </div>`).join('');
}

function salaExportarBanco() {
  const blob = new Blob([JSON.stringify(_salaBanco, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `konkursox-banco-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function salaImportarBanco(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data)) { toast('JSON no válido', 'error'); return; }
      _salaBanco = [..._salaBanco, ...data];
      localStorage.setItem(SALA_BANCO_KEY, JSON.stringify(_salaBanco));
      _renderBanco();
      toast(`${data.length} preguntas importadas`, 'ok');
    } catch { toast('Error al leer el archivo', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}
