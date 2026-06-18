// ═══════════════════════════════════════════════════════════════
// KONKURSOX — ONLINE.JS  (Ably Channels)
//
// Requiere: <script src="https://cdn.ably.com/lib/ably.min-2.js">
//           cargado antes que este archivo.
//
// API:
//   OnlineLayer.connect(room, role, apiKey, name?, hasCam?)
//   OnlineLayer.publish({ type, ...data })
//   OnlineLayer.on('tipo', handler)   // '*' = todos
//   OnlineLayer.off('tipo', handler?)
//   OnlineLayer.disconnect()
//   OnlineLayer.isConnected()  → boolean
//   OnlineLayer.getRoom()      → string
//   OnlineLayer.getMyId()      → string
//   OnlineLayer.getVoteData()  → [{id, option, elapsed}]
// ═══════════════════════════════════════════════════════════════

const OnlineLayer = (() => {
  'use strict';

  let _rt     = null;
  let _ch     = null;
  let _room   = '';
  let _role   = 'sala';
  let _name   = 'Usuario';
  let _hasCam = false;
  let _myId   = '';

  // ── Votos (agrega el panel) ───────────────────────────────────
  let _votingActive      = false;
  let _numOptions        = 4;
  let _votes             = {};      // { optIdx: count }
  let _votedIds          = new Set();
  let _voteData          = [];      // [{ id, option, elapsed }]
  let _questionStartTime = 0;

  const _handlers = {};

  // ── Helpers ──────────────────────────────────────────────────

  function _genId() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).toUpperCase();
  }

  function _dispatch(type, msg) {
    [...(_handlers[type] || []), ...(_handlers['*'] || [])]
      .forEach(fn => { try { fn(msg); } catch(e) { console.warn('[OnlineLayer]', e); } });
  }

  function _memberToParticipant(m) {
    return {
      id:     m.clientId,
      name:   m.data?.name   ?? '?',
      role:   m.data?.role   ?? 'sala',
      hasCam: m.data?.hasCam ?? false,
      voted:  _votedIds.has(m.clientId),
    };
  }

  // Agregación con soporte de revoto (el panel/admin intercepta votes)
  function _handleVote(fromId, data) {
    if (!_votingActive) return;
    const opt = data?.option;
    if (typeof opt !== 'number' || opt < 0 || opt >= _numOptions) return;

    // Permitir cambio de voto: retirar el anterior
    if (_votedIds.has(fromId)) {
      const prev = _voteData.find(v => v.id === fromId);
      if (prev !== undefined) {
        if (_votes[prev.option] > 0) _votes[prev.option]--;
        _voteData = _voteData.filter(v => v.id !== fromId);
      }
      _votedIds.delete(fromId);
    }

    _votedIds.add(fromId);
    _votes[opt] = (_votes[opt] ?? 0) + 1;
    const elapsed = _questionStartTime ? Date.now() - _questionStartTime : 0;
    _voteData.push({ id: fromId, option: opt, elapsed });

    const counts = Array.from({ length: _numOptions }, (_, i) => _votes[i] ?? 0);
    const total  = counts.reduce((a, b) => a + b, 0);
    _ch.publish('vote_update', { counts, total });
    _dispatch('vote_update', { type: 'vote_update', payload: { counts, total } });
  }

  // Cuando el panel ve una entrada, re-publica la lista completa al canal
  // para que todos los clientes ya conectados se actualicen.
  function _broadcastParticipantsList() {
    _ch.presence.get((err, members) => {
      if (!err && members) {
        _ch.publish('participants_list', {
          participants: members.map(_memberToParticipant),
        });
      }
    });
  }

  // ── Conexión ─────────────────────────────────────────────────

  function connect(room, role, apiKey, name, hasCam) {
    if (!room || !apiKey) { console.warn('[OnlineLayer] Faltan room o apiKey'); return; }
    if (typeof Ably === 'undefined') { console.error('[OnlineLayer] SDK Ably no cargado'); return; }

    _room   = room.toUpperCase();
    _role   = role   || 'sala';
    _name   = name   || role || 'Usuario';
    _hasCam = !!hasCam;
    _myId   = _genId();

    _rt = new Ably.Realtime({ key: apiKey, clientId: _myId });
    _ch = _rt.channels.get(`sala-${_room.toLowerCase()}`);

    _rt.connection.on('connected', () => {
      _ch.presence.enter({ role: _role, name: _name, hasCam: _hasCam });

      // Lista actual al conectar (para este cliente)
      _ch.presence.get((err, members) => {
        if (!err && members) {
          _dispatch('participants_list', {
            type:    'participants_list',
            payload: members.map(_memberToParticipant),
          });
        }
      });

      _dispatch('hello_ack', { type: 'hello_ack', payload: { id: _myId } });
      _dispatch('connected',  { room: _room });
    });

    _rt.connection.on('disconnected', () => _dispatch('disconnected', { room: _room }));
    _rt.connection.on('closed',       () => _dispatch('disconnected', { room: _room }));
    _rt.connection.on('failed',       () => _dispatch('disconnected', { room: _room }));

    // ── Mensajes del canal ──────────────────────────────────────
    _ch.subscribe((msg) => {
      const type = msg.name;
      const data = msg.data || {};
      const from = msg.clientId || '';

      // Normalizar participants_list (publicado por el panel como { participants: [...] })
      if (type === 'participants_list') {
        _dispatch('participants_list', {
          type:    'participants_list',
          payload: data.participants || [],
        });
        return;
      }

      // Filtrar WebRTC a destinatarios directos
      if (['webrtc_offer', 'webrtc_answer', 'webrtc_ice'].includes(type)) {
        const to = data?.payload?.to ?? data?.to;
        if (to && to !== _myId && to !== 'all') return;
      }

      // Panel agrega votos
      if (type === 'vote' && (_role === 'panel' || _role === 'admin')) {
        _handleVote(from, data?.payload ?? data);
        return;
      }

      _dispatch(type, { type, payload: data?.payload ?? data, _from: from });
    });

    // ── Presence ────────────────────────────────────────────────
    _ch.presence.subscribe('enter', (m) => {
      if (m.clientId === _myId) return;
      _dispatch('participant_joined', {
        type:    'participant_joined',
        payload: _memberToParticipant(m),
      });
      // El panel re-difunde la lista completa para que los clientes ya conectados se actualicen
      if (_role === 'panel' || _role === 'admin') _broadcastParticipantsList();
    });

    _ch.presence.subscribe('leave', (m) => {
      _dispatch('participant_left', {
        type:    'participant_left',
        payload: { id: m.clientId },
      });
      if (_role === 'panel' || _role === 'admin') _broadcastParticipantsList();
    });

    _ch.presence.subscribe('update', (m) => {
      _dispatch('participant_updated', {
        type:    'participant_updated',
        payload: _memberToParticipant(m),
      });
    });
  }

  // ── Publicar ─────────────────────────────────────────────────

  function publish(payload) {
    if (!_ch) return false;
    const { type, ...data } = payload;

    if (type === 'show_question') {
      _votingActive      = true;
      _numOptions        = data?.options?.length ?? 4;
      _votes             = {};
      _votedIds          = new Set();
      _voteData          = [];
      _questionStartTime = Date.now();
    } else if (type === 'reveal_answer' || type === 'next_question' || type === 'game_over') {
      _votingActive = false;
    }

    _ch.publish(type, data);
    return true;
  }

  // ── API pública ──────────────────────────────────────────────

  function on(type, handler) {
    if (!_handlers[type]) _handlers[type] = [];
    if (!_handlers[type].includes(handler)) _handlers[type].push(handler);
  }

  function off(type, handler) {
    if (!handler) { delete _handlers[type]; return; }
    if (_handlers[type]) _handlers[type] = _handlers[type].filter(h => h !== handler);
  }

  function disconnect() {
    if (_ch) { try { _ch.presence.leave(); } catch {} _ch.unsubscribe(); _ch = null; }
    if (_rt) { _rt.close(); _rt = null; }
    _votingActive = false; _votes = {}; _votedIds = new Set(); _voteData = [];
  }

  function isConnected() { return _rt?.connection?.state === 'connected'; }
  function getRoom()     { return _room; }
  function getMyId()     { return _myId; }
  function getVoteData() { return [..._voteData]; }

  return { connect, publish, on, off, disconnect, isConnected, getRoom, getMyId, getVoteData };
})();
