// ═══════════════════════════════════════════════════════════════
// KONKURSOX — ONLINE.JS  (Ably Channels)
//
// Requiere: <script src="https://cdn.ably.com/lib/ably.min-2.js">
//           cargado antes que este archivo.
//
// API pública:
//   OnlineLayer.connect(room, role, apiKey, name?, hasCam?)
//   OnlineLayer.publish({ type, ...resto })
//   OnlineLayer.on('tipo', handler)   // '*' = todos
//   OnlineLayer.off('tipo', handler?) // sin handler → borra todos
//   OnlineLayer.disconnect()
//   OnlineLayer.isConnected() → boolean
//   OnlineLayer.getRoom()     → string
//   OnlineLayer.getMyId()     → string
//
// Roles: 'panel' | 'overlay' | 'admin' | 'sala'
//
// Agregación de votos:
//   El rol 'panel' / 'admin' intercepta mensajes 'vote',
//   los agrega localmente y publica 'vote_update'.
//   Esto reemplaza la lógica que antes estaba en el servidor PartyKit.
// ═══════════════════════════════════════════════════════════════

const OnlineLayer = (() => {
  'use strict';

  let _rt      = null;   // Ably.Realtime instance
  let _ch      = null;   // Ably Channel
  let _room    = '';
  let _role    = 'sala';
  let _name    = 'Usuario';
  let _hasCam  = false;
  let _myId    = '';

  // Agregación de votos (solo panel / admin)
  let _votingActive = false;
  let _numOptions   = 4;
  let _votes        = {};      // { optionIndex: count }
  let _votedIds     = new Set();

  const _handlers = {};        // { eventName: [fn, ...] }

  // ── Helpers ──────────────────────────────────────────────────────

  function _genId() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
  }

  function _dispatch(type, msg) {
    const fns = [...(_handlers[type] || []), ...(_handlers['*'] || [])];
    fns.forEach(fn => { try { fn(msg); } catch(e) { console.warn('[OnlineLayer]', e); } });
  }

  function _memberToParticipant(m) {
    return {
      id:     m.clientId,
      name:   m.data?.name   ?? '?',
      role:   m.data?.role   ?? 'sala',
      hasCam: m.data?.hasCam ?? false,
      voted:  false,
    };
  }

  // Agregación local de votos (panel/admin)
  function _handleVote(fromId, data) {
    if (!_votingActive || _votedIds.has(fromId)) return;
    const opt = data?.option;
    if (typeof opt !== 'number' || opt < 0 || opt >= _numOptions) return;

    _votedIds.add(fromId);
    _votes[opt] = (_votes[opt] ?? 0) + 1;

    const counts = Array.from({ length: _numOptions }, (_, i) => _votes[i] ?? 0);
    const total  = counts.reduce((a, b) => a + b, 0);

    // Publicar resultado al canal (overlay + sala lo verán)
    _ch.publish('vote_update', { counts, total });
    // Dispatch también al propio panel
    _dispatch('vote_update', { type: 'vote_update', payload: { counts, total } });
  }

  // ── Conexión ─────────────────────────────────────────────────────

  function connect(room, role, apiKey, name, hasCam) {
    if (!room || !apiKey) { console.warn('[OnlineLayer] Faltan room o apiKey'); return; }
    if (typeof Ably === 'undefined') { console.error('[OnlineLayer] Ably SDK no cargado'); return; }

    _room   = room.toUpperCase();
    _role   = role   || 'sala';
    _name   = name   || role || 'Usuario';
    _hasCam = !!hasCam;
    _myId   = _genId();

    _rt = new Ably.Realtime({
      key:      apiKey,
      clientId: _myId,
    });

    _ch = _rt.channels.get(`sala-${_room.toLowerCase()}`);

    // ── Conexión establecida ──────────────────────────────────────
    _rt.connection.on('connected', () => {
      // Entrar a Presence con metadatos de rol
      _ch.presence.enter({ role: _role, name: _name, hasCam: _hasCam });

      // Pedir lista actual de presencia
      _ch.presence.get((err, members) => {
        if (!err && members) {
          _dispatch('participants_list', {
            type:    'participants_list',
            payload: members.map(_memberToParticipant),
          });
        }
      });

      // Informar ID propio (equivalente a hello_ack)
      _dispatch('hello_ack', { type: 'hello_ack', payload: { id: _myId } });
      _dispatch('connected',  { room: _room });
    });

    _rt.connection.on('disconnected', () => _dispatch('disconnected', { room: _room }));
    _rt.connection.on('closed',       () => _dispatch('disconnected', { room: _room }));
    _rt.connection.on('failed',       () => _dispatch('disconnected', { room: _room }));

    // ── Mensajes del canal ────────────────────────────────────────
    _ch.subscribe((msg) => {
      const type = msg.name;
      const data = msg.data || {};
      const from = msg.clientId || '';

      // Filtrar mensajes WebRTC dirigidos a otro cliente
      if (['webrtc_offer', 'webrtc_answer', 'webrtc_ice'].includes(type)) {
        const to = data?.payload?.to ?? data?.to;
        if (to && to !== _myId && to !== 'all') return;
      }

      // El panel/admin agrega votos internamente
      if (type === 'vote' && (_role === 'panel' || _role === 'admin')) {
        _handleVote(from, data?.payload ?? data);
        return;
      }

      _dispatch(type, { type, payload: data?.payload ?? data, _from: from });
    });

    // ── Presence: entradas y salidas ─────────────────────────────
    _ch.presence.subscribe('enter', (m) => {
      if (m.clientId === _myId) return;
      _dispatch('participant_joined', {
        type:    'participant_joined',
        payload: _memberToParticipant(m),
      });
    });

    _ch.presence.subscribe('leave', (m) => {
      _dispatch('participant_left', {
        type:    'participant_left',
        payload: { id: m.clientId },
      });
    });

    _ch.presence.subscribe('update', (m) => {
      _dispatch('participant_updated', {
        type:    'participant_updated',
        payload: _memberToParticipant(m),
      });
    });
  }

  // ── API pública ──────────────────────────────────────────────────

  /**
   * Publicar un mensaje al canal Ably.
   * @param {object} payload  Objeto con al menos la propiedad `type`.
   * @returns {boolean}
   */
  function publish(payload) {
    if (!_ch) return false;
    const { type, ...data } = payload;

    // Actualizar estado de votación local para el rol host
    if (type === 'start_voting') {
      _votingActive = true;
      _numOptions   = data?.payload?.numOptions ?? data?.numOptions ?? 4;
      _votes        = {};
      _votedIds     = new Set();
    } else if (type === 'stop_voting') {
      _votingActive = false;
    }

    _ch.publish(type, data);
    return true;
  }

  /** Suscribirse a un tipo de mensaje. '*' recibe todos. */
  function on(type, handler) {
    if (!_handlers[type]) _handlers[type] = [];
    if (!_handlers[type].includes(handler)) _handlers[type].push(handler);
  }

  /** Eliminar handler. Sin handler elimina todos los del tipo. */
  function off(type, handler) {
    if (!handler) { delete _handlers[type]; return; }
    if (_handlers[type]) _handlers[type] = _handlers[type].filter(h => h !== handler);
  }

  /** Cerrar conexión. */
  function disconnect() {
    if (_ch) {
      try { _ch.presence.leave(); } catch {}
      _ch.unsubscribe();
      _ch = null;
    }
    if (_rt) { _rt.close(); _rt = null; }
    _votingActive = false;
    _votes        = {};
    _votedIds     = new Set();
  }

  /** @returns {boolean} */
  function isConnected() {
    return _rt?.connection?.state === 'connected';
  }

  /** @returns {string} Código de sala en mayúsculas */
  function getRoom() { return _room; }

  /** @returns {string} ID único de este cliente en la sesión */
  function getMyId() { return _myId; }

  return { connect, publish, on, off, disconnect, isConnected, getRoom, getMyId };
})();
