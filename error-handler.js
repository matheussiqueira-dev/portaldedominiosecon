/**
 * @fileoverview Módulo centralizado de tratamento de erros e logging.
 *
 * Fornece uma superfície única para capturar, registrar e exibir erros
 * ao usuário de forma consistente em toda a aplicação, evitando crashes
 * silenciosos e facilitando a depuração em produção.
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  // ─── Configuração ──────────────────────────────────────────────────────────

  /** Nível mínimo de log a ser exibido no console. */
  var LOG_LEVEL = Object.freeze({
    DEBUG: 0,
    INFO:  1,
    WARN:  2,
    ERROR: 3,
  });

  var currentLevel = LOG_LEVEL.INFO;

  /** Histórico de erros da sessão (para diagnóstico). */
  var errorLog = [];
  var MAX_LOG_SIZE = 50;

  // ─── Utilitários internos ─────────────────────────────────────────────────

  /**
   * Formata um timestamp ISO legível.
   * @returns {string}
   */
  function timestamp() {
    return new Date().toISOString();
  }

  /**
   * Persiste uma entrada no histórico em memória.
   * @param {string} level
   * @param {string} message
   * @param {*} [detail]
   */
  function pushToLog(level, message, detail) {
    var entry = { ts: timestamp(), level: level, message: message };
    if (detail !== undefined) {
      entry.detail = detail instanceof Error
        ? { name: detail.name, message: detail.message, stack: detail.stack }
        : detail;
    }
    errorLog.unshift(entry);
    if (errorLog.length > MAX_LOG_SIZE) {
      errorLog.length = MAX_LOG_SIZE;
    }
  }

  // ─── API de logging ────────────────────────────────────────────────────────

  /**
   * Registra uma mensagem de depuração (visível apenas em modo debug).
   * @param {string} message
   * @param {*} [detail]
   */
  function debug(message, detail) {
    if (currentLevel > LOG_LEVEL.DEBUG) return;
    pushToLog("DEBUG", message, detail);
    console.debug("[Portal-Econ] [DEBUG]", message, detail !== undefined ? detail : "");
  }

  /**
   * Registra uma informação geral.
   * @param {string} message
   * @param {*} [detail]
   */
  function info(message, detail) {
    if (currentLevel > LOG_LEVEL.INFO) return;
    pushToLog("INFO", message, detail);
    console.info("[Portal-Econ] [INFO]", message, detail !== undefined ? detail : "");
  }

  /**
   * Registra um aviso não-crítico.
   * @param {string} message
   * @param {*} [detail]
   */
  function warn(message, detail) {
    if (currentLevel > LOG_LEVEL.WARN) return;
    pushToLog("WARN", message, detail);
    console.warn("[Portal-Econ] [WARN]", message, detail !== undefined ? detail : "");
  }

  /**
   * Registra um erro crítico e exibe notificação visual ao usuário.
   *
   * @param {string} userMessage - Mensagem amigável exibida na interface.
   * @param {Error|*} [error]    - Objeto de erro original para o console.
   * @param {object}  [options]
   * @param {boolean} [options.fatal=false] - Se true, torna a notificação persistente.
   */
  function error(userMessage, error, options) {
    var opts = options || {};
    pushToLog("ERROR", userMessage, error);
    console.error("[Portal-Econ] [ERROR]", userMessage, error || "");

    showErrorNotification(userMessage, opts.fatal === true);
  }

  // ─── Notificação visual ────────────────────────────────────────────────────

  /**
   * Exibe um toast de erro na interface.
   * Remove automaticamente após 6 s (ou persiste se `persistent = true`).
   *
   * @param {string}  message
   * @param {boolean} persistent
   */
  function showErrorNotification(message, persistent) {
    // Garante que o DOM está pronto.
    if (!document.body) return;

    // Reutiliza container existente para empilhar notificações.
    var container = document.getElementById("encom-error-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "encom-error-container";
      container.setAttribute("role", "alert");
      container.setAttribute("aria-live", "assertive");
      container.style.cssText = [
        "position:fixed",
        "top:16px",
        "right:16px",
        "z-index:9999",
        "display:flex",
        "flex-direction:column",
        "gap:8px",
        "max-width:360px",
        "pointer-events:none",
      ].join(";");
      document.body.appendChild(container);
    }

    var toast = document.createElement("div");
    toast.style.cssText = [
      "padding:12px 16px",
      "border:1px solid rgba(255,80,80,0.42)",
      "border-radius:10px",
      "background:rgba(12,2,2,0.92)",
      "color:#ff8a8a",
      "font-family:Rajdhani,sans-serif",
      "font-size:0.92rem",
      "font-weight:600",
      "letter-spacing:0.04em",
      "box-shadow:0 0 18px rgba(255,60,60,0.22)",
      "pointer-events:auto",
      "cursor:pointer",
    ].join(";");
    toast.textContent = message;
    toast.title = "Clique para fechar";

    toast.addEventListener("click", function () {
      removeToast(toast, container);
    });

    container.appendChild(toast);

    if (!persistent) {
      setTimeout(function () {
        removeToast(toast, container);
      }, 6000);
    }
  }

  /**
   * Remove um toast do DOM com animação de saída.
   * @param {HTMLElement} toast
   * @param {HTMLElement} container
   */
  function removeToast(toast, container) {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 260ms ease";
    setTimeout(function () {
      if (toast.parentNode === container) {
        container.removeChild(toast);
      }
    }, 280);
  }

  // ─── Captura global de erros não tratados ──────────────────────────────────

  /**
   * Instala handlers globais para capturar erros não tratados,
   * impedindo crashes silenciosos.
   */
  function installGlobalHandlers() {
    window.addEventListener("error", function (event) {
      var msg = event.message || "Erro desconhecido";
      var src = event.filename ? " (" + event.filename.split("/").pop() + ":" + event.lineno + ")" : "";
      pushToLog("ERROR", msg + src, event.error);
      console.error("[Portal-Econ] [GLOBAL ERROR]", msg + src, event.error);
    });

    window.addEventListener("unhandledrejection", function (event) {
      var reason = event.reason;
      var msg = reason instanceof Error ? reason.message : String(reason || "Promise rejeitada sem motivo.");
      pushToLog("ERROR", msg, reason);
      console.error("[Portal-Econ] [UNHANDLED REJECTION]", msg, reason);
    });
  }

  // ─── Verificação de ambiente ───────────────────────────────────────────────

  /**
   * Verifica requisitos mínimos do ambiente de execução.
   * Emite warnings para recursos ausentes que podem degradar a experiência.
   */
  function checkEnvironment() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      warn("getUserMedia não suportado. Câmera indisponível neste navegador.");
    }

    if (typeof WebGLRenderingContext === "undefined") {
      warn("WebGL não detectado. Animações 3D podem não funcionar.");
    }

    if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") {
      warn("Aplicação servida sem HTTPS. Acesso à câmera pode ser bloqueado pelo navegador.");
    }

    if (typeof window.tf === "undefined") {
      warn("TensorFlow.js não carregado. Verificar conectividade com CDN.");
    }
  }

  // ─── Inicialização ─────────────────────────────────────────────────────────

  installGlobalHandlers();

  // ─── Exportação pública ────────────────────────────────────────────────────

  window.DomainExpansionErrorHandler = Object.freeze({
    debug:            debug,
    info:             info,
    warn:             warn,
    error:            error,
    checkEnvironment: checkEnvironment,
    getLog:           function () { return errorLog.slice(); },
    setLevel:         function (level) {
      if (typeof level === "number") currentLevel = level;
    },
    LOG_LEVEL:        LOG_LEVEL,
  });
})();
