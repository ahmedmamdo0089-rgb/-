(function (root) {
  'use strict';

  let ctx = null;
  let muted = false;

  try {
    muted = localStorage.getItem('beh_muted') === '1';
  } catch (_e) { }

  function ensureContext() {
    if (muted) return null;
    const AudioCtx = root.AudioContext || root.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!ctx) {
      ctx = new AudioCtx();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(function () { });
    }
    return ctx;
  }

  function playTone(freq, duration, type, volume, delaySec) {
    const audio = ensureContext();
    if (!audio) return;
    const start = audio.currentTime + (delaySec || 0);
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, start);

    const vol = Math.min(0.25, volume || 0.1);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(vol, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  const SoundFX = {
    isMuted: function () {
      return muted;
    },
    toggleMute: function () {
      muted = !muted;
      try {
        localStorage.setItem('beh_muted', muted ? '1' : '0');
      } catch (_e) { }
      if (!muted) SoundFX.click();
      return muted;
    },
    click: function () {
      playTone(540, 0.06, 'triangle', 0.08, 0);
    },
    dice: function () {
      for (let i = 0; i < 6; i++) {
        playTone(220 + Math.random() * 260, 0.045, 'square', 0.05, i * 0.065);
      }
      playTone(360, 0.11, 'triangle', 0.1, 0.42);
    },
    step: function () {
      playTone(430, 0.05, 'triangle', 0.06, 0);
    },
    buy: function () {
      playTone(523.25, 0.12, 'triangle', 0.11, 0);
      playTone(659.25, 0.12, 'triangle', 0.11, 0.09);
      playTone(783.99, 0.22, 'triangle', 0.13, 0.18);
    },
    rent: function () {
      playTone(440, 0.14, 'sawtooth', 0.07, 0);
      playTone(330, 0.22, 'sawtooth', 0.07, 0.12);
    },
    card: function () {
      playTone(587.33, 0.09, 'sine', 0.1, 0);
      playTone(783.99, 0.16, 'sine', 0.11, 0.08);
    },
    jail: function () {
      playTone(640, 0.18, 'sawtooth', 0.08, 0);
      playTone(460, 0.18, 'sawtooth', 0.08, 0.18);
      playTone(640, 0.22, 'sawtooth', 0.08, 0.36);
    },
    trade: function () {
      playTone(493.88, 0.1, 'triangle', 0.09, 0);
      playTone(659.25, 0.18, 'triangle', 0.11, 0.1);
    },
    turn: function () {
      playTone(523.25, 0.1, 'sine', 0.09, 0);
      playTone(659.25, 0.16, 'sine', 0.1, 0.09);
    },
    win: function () {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach(function (n, idx) {
        playTone(n, 0.24, 'triangle', 0.13, idx * 0.12);
      });
    }
  };

  root.BankElHazAudio = SoundFX;
})(typeof self !== 'undefined' ? self : this);
