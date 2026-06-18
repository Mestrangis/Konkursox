// ═══════════════════════════════════════════════════════════════
// KONKURSOX — SHARED-TIMER.JS
// Temporizador reutilizable para cualquier pestaña de juego.
//
// USO:
//   const timer = new GameTimer('tt', () => sincronizarOverlay);
//   timer.init();
// ═══════════════════════════════════════════════════════════════

class GameTimer {
  constructor(prefijo, getSyncFn) {
    this.p         = prefijo;
    this.getSyncFn = getSyncFn;  // función que devuelve la fn de sincronización
    this.intervalo = null;
    this.corriendo = false;
    this.valor     = 30;
    this.max       = 30;
    this.visible   = false;      // visibilidad en overlay
  }

  // ── Init ──────────────────────────────────────────────────────
  init() {
    document.getElementById(`${this.p}-input-tiempo`)
      ?.addEventListener('change', (e) => {
        const v = Math.max(5, Math.min(300, parseInt(e.target.value) || 30));
        e.target.value = v;
        this.max   = v;
        this.valor = v;
        this._render(false);
      });

    this._render(false);
  }

  // ── Acciones ──────────────────────────────────────────────────
  iniciar() {
    if (this.corriendo) return;
    if (this.valor <= 0) this._resetValues();
    this.corriendo = true;
    this._setBtn('naranja');

    this.intervalo = setInterval(() => {
      this.valor--;
      this._render();
      if (this.valor <= 0) {
        clearInterval(this.intervalo);
        this.corriendo = false;
        this._setBtn('verde');
        // sfx tic — cada pestaña tiene su propia fn, intentamos la genérica
        if (typeof sfxSisPlay === 'function') sfxSisPlay('tic');
      }
    }, 1000);
  }

  pausar() {
    clearInterval(this.intervalo);
    this.corriendo = false;
    this._setBtn('verde');
    this._render();
  }

  detener() {
    clearInterval(this.intervalo);
    this.corriendo = false;
    this.valor = 0;
    this._setBtn('verde');
    this._render();
  }

  // Reset: no sincroniza por defecto (cuando lo llama mostrarPregunta
  // que ya sincroniza por su cuenta)
  reset(sincronizar = true) {
    clearInterval(this.intervalo);
    this.corriendo = false;
    this._resetValues();
    this._setBtn('verde');
    this._render(sincronizar);
  }

  // Parar silencioso: detiene sin enviar sync (lo hará el caller)
  pararSilencioso() {
    clearInterval(this.intervalo);
    this.corriendo = false;
    this._setBtn('verde');
    // Solo actualizar display local
    const display = document.getElementById(`${this.p}-display-tiempo`);
    const barra   = document.getElementById(`${this.p}-barra-tiempo`);
    if (display) display.textContent = this.valor;
    if (barra)   barra.style.width = ((this.valor / this.max) * 100) + '%';
    // Actualizar estado global
    estado.timer.corriendo = false;
    estado.timer.valor     = this.valor;
    estado.timer.max       = this.max;
  }

  toggleVisible() {
    this.visible = !this.visible;
    const btn = document.getElementById(`${this.p}-btn-timer-overlay`);
    if (btn) {
      btn.textContent = this.visible ? '⏱ Ocultar Timer' : '⏱ Mostrar Timer';
      btn.className   = `btn btn-sm ${this.visible ? 'btn-dorado' : 'btn-gris'}`;
    }
    sincronizarOverlay({ timerVisible: this.visible });
    toast(this.visible ? 'Timer visible en overlay' : 'Timer oculto en overlay', 'info');
  }

  // ── Privado ───────────────────────────────────────────────────
  _resetValues() {
    const input = document.getElementById(`${this.p}-input-tiempo`);
    this.max   = parseInt(input?.value) || 30;
    this.valor = this.max;
  }

  _render(sincronizar = true) {
    const display = document.getElementById(`${this.p}-display-tiempo`);
    const barra   = document.getElementById(`${this.p}-barra-tiempo`);
    if (!display || !barra) return;

    display.textContent = this.valor;
    barra.style.width   = ((this.valor / this.max) * 100) + '%';

    const urgente = this.valor <= 10 && this.valor > 0;
    display.classList.toggle('urgente', urgente);
    barra.classList.toggle('urgente', urgente);

    if (sincronizar) {
      estado.timer.valor     = this.valor;
      estado.timer.max       = this.max;
      estado.timer.corriendo = this.corriendo;
      sincronizarOverlay({ timerVisible: this.visible });
    }
  }

  _setBtn(color) {
    const btn = document.getElementById(`${this.p}-btn-iniciar`);
    if (!btn) return;
    btn.classList.remove('btn-verde', 'btn-naranja');
    btn.classList.add(`btn-${color}`);
  }
}
