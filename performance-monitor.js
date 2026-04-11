/**
 * @fileoverview Monitor de performance em tempo real.
 *
 * Rastreia FPS (frames por segundo), uso de memória JS e contagem de
 * tensores TensorFlow.js ativos. Renderiza um painel HUD opcional na
 * interface e expõe métricas para leitura programática.
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  // ─── Estado interno ────────────────────────────────────────────────────────

  var _running    = false;
  var _rafId      = null;
  var _lastTime   = 0;
  var _frameCount = 0;
  var _fps        = 0;
  var _hudEl      = null;
  var _visible    = false;

  /** Histórico circular de FPS para calcular média suavizada (últimos 60 quadros). */
  var _fpsHistory = new Array(60).fill(0);
  var _fpsHistIdx = 0;

  // ─── Medição de FPS ───────────────────────────────────────────────────────

  /**
   * Loop interno de medição disparado via requestAnimationFrame.
   * @param {number} now - Timestamp fornecido pelo rAF (ms).
   */
  function tick(now) {
    if (!_running) return;

    _frameCount += 1;
    var elapsed = now - _lastTime;

    // Atualiza FPS a cada segundo.
    if (elapsed >= 1000) {
      _fps = Math.round((_frameCount * 1000) / elapsed);
      _fpsHistory[_fpsHistIdx % _fpsHistory.length] = _fps;
      _fpsHistIdx += 1;
      _frameCount = 0;
      _lastTime   = now;

      if (_visible && _hudEl) {
        renderHud();
      }
    }

    _rafId = requestAnimationFrame(tick);
  }

  // ─── Leitura de memória ───────────────────────────────────────────────────

  /**
   * Retorna o uso atual de heap JS em MB (somente Chrome/Edge).
   * @returns {{ used: number, total: number }|null}
   */
  function getMemoryMB() {
    var mem = performance && performance.memory;
    if (!mem) return null;
    return {
      used:  Math.round(mem.usedJSHeapSize  / 1048576),
      total: Math.round(mem.totalJSHeapSize / 1048576),
    };
  }

  /**
   * Retorna o número de tensores TensorFlow.js ativos (se disponível).
   * @returns {number|null}
   */
  function getTensorCount() {
    var tf = window.tf;
    if (!tf || typeof tf.memory !== "function") return null;
    return tf.memory().numTensors;
  }

  /**
   * Calcula o FPS médio dos últimos ciclos registrados.
   * @returns {number}
   */
  function getAverageFps() {
    var sum = 0;
    var count = 0;
    for (var i = 0; i < _fpsHistory.length; i += 1) {
      if (_fpsHistory[i] > 0) {
        sum   += _fpsHistory[i];
        count += 1;
      }
    }
    return count > 0 ? Math.round(sum / count) : 0;
  }

  // ─── HUD (painel visual) ──────────────────────────────────────────────────

  /**
   * Cria e injeta o elemento do painel HUD no DOM.
   */
  function createHud() {
    if (_hudEl) return;

    _hudEl = document.createElement("div");
    _hudEl.id = "encom-perf-hud";
    _hudEl.setAttribute("aria-hidden", "true");
    _hudEl.style.cssText = [
      "position:fixed",
      "bottom:56px",
      "left:12px",
      "z-index:9000",
      "padding:8px 12px",
      "border:1px solid rgba(0,229,255,0.22)",
      "border-radius:8px",
      "background:rgba(1,3,6,0.88)",
      "color:#00e5ff",
      "font-family:Rajdhani,monospace,sans-serif",
      "font-size:0.78rem",
      "font-weight:700",
      "letter-spacing:0.06em",
      "line-height:1.6",
      "pointer-events:none",
      "display:none",
    ].join(";");

    document.body.appendChild(_hudEl);
  }

  /**
   * Atualiza o conteúdo textual do HUD com as métricas atuais.
   */
  function renderHud() {
    if (!_hudEl) return;

    var mem     = getMemoryMB();
    var tensors = getTensorCount();
    var avg     = getAverageFps();

    var lines = [
      "FPS: " + _fps + "  (avg " + avg + ")",
    ];

    if (mem) {
      lines.push("Heap: " + mem.used + " / " + mem.total + " MB");
    }

    if (tensors !== null) {
      lines.push("Tensors: " + tensors);
    }

    _hudEl.innerHTML = lines.join("<br>");
  }

  // ─── API pública ──────────────────────────────────────────────────────────

  /**
   * Inicia a medição de performance.
   */
  function start() {
    if (_running) return;
    _running    = true;
    _lastTime   = performance.now();
    _frameCount = 0;
    createHud();
    _rafId = requestAnimationFrame(tick);
  }

  /**
   * Interrompe a medição e cancela o rAF.
   */
  function stop() {
    _running = false;
    if (_rafId !== null) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
  }

  /**
   * Exibe ou oculta o painel HUD.
   * @param {boolean} [show] - Se omitido, alterna o estado atual.
   */
  function toggleHud(show) {
    _visible = typeof show === "boolean" ? show : !_visible;
    if (_hudEl) {
      _hudEl.style.display = _visible ? "block" : "none";
    }
  }

  /**
   * Retorna um snapshot das métricas atuais.
   *
   * @returns {{
   *   fps: number,
   *   avgFps: number,
   *   memory: {used: number, total: number}|null,
   *   tensors: number|null
   * }}
   */
  function getMetrics() {
    return {
      fps:     _fps,
      avgFps:  getAverageFps(),
      memory:  getMemoryMB(),
      tensors: getTensorCount(),
    };
  }

  // ─── Atalho de teclado para HUD (P) ──────────────────────────────────────

  document.addEventListener("keydown", function (e) {
    // Shift + P abre/fecha o monitor de performance.
    if (e.shiftKey && e.key === "P") {
      toggleHud();
    }
  });

  // Inicia automaticamente ao carregar.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }

  // ─── Exportação pública ────────────────────────────────────────────────────

  window.DomainExpansionPerfMonitor = Object.freeze({
    start:      start,
    stop:       stop,
    toggleHud:  toggleHud,
    getMetrics: getMetrics,
  });
})();
