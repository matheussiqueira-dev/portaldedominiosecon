/**
 * @fileoverview Persistência de sessão de treinamento via localStorage.
 *
 * Permite salvar e restaurar o dataset coletado (features + labels) entre
 * recarregamentos de página, evitando perda de amostras durante o fluxo
 * de treinamento.
 *
 * Formato armazenado:
 *   { version: number, savedAt: string, X: number[][], y: number[], classCounts: object }
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  /** Chave usada no localStorage. */
  var STORAGE_KEY = "portal_econ_training_session";

  /** Versão do schema de persistência. Incrementar ao mudar a estrutura. */
  var SCHEMA_VERSION = 1;

  /** Tamanho máximo aproximado do payload serializado (bytes). */
  var MAX_PAYLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

  // ─── Utilitários ───────────────────────────────────────────────────────────

  /**
   * Verifica se localStorage está disponível e funcional.
   * @returns {boolean}
   */
  function isStorageAvailable() {
    try {
      var test = "__storage_test__";
      localStorage.setItem(test, "1");
      localStorage.removeItem(test);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Sanitiza um nome de classe para evitar XSS / injeção em chaves.
   * Mantém apenas letras, números, _, - e espaço.
   * @param {string} key
   * @returns {string}
   */
  function sanitizeKey(key) {
    return String(key).replace(/[^a-zA-Z0-9_\-\s]/g, "").trim().slice(0, 64);
  }

  // ─── Salvar sessão ─────────────────────────────────────────────────────────

  /**
   * Serializa e salva o dataset atual no localStorage.
   *
   * @param {number[][]} X          - Array de vetores de features (126 valores cada).
   * @param {number[]}   y          - Array de labels (índices de classe).
   * @param {object}     classCounts - Mapa { label: count } com contagem por classe.
   * @returns {{ ok: boolean, error?: string }}
   */
  function saveSession(X, y, classCounts) {
    if (!isStorageAvailable()) {
      return { ok: false, error: "localStorage indisponível neste contexto." };
    }

    if (!Array.isArray(X) || !Array.isArray(y) || X.length !== y.length) {
      return { ok: false, error: "Dados de treinamento inválidos." };
    }

    // Sanitiza as chaves do mapa de contagens.
    var sanitizedCounts = {};
    for (var label in classCounts) {
      if (Object.prototype.hasOwnProperty.call(classCounts, label)) {
        sanitizedCounts[sanitizeKey(label)] = Number(classCounts[label]) || 0;
      }
    }

    var payload = {
      version:     SCHEMA_VERSION,
      savedAt:     new Date().toISOString(),
      sampleCount: X.length,
      X:           X,
      y:           y,
      classCounts: sanitizedCounts,
    };

    var serialized;
    try {
      serialized = JSON.stringify(payload);
    } catch (e) {
      return { ok: false, error: "Falha ao serializar sessão: " + e.message };
    }

    if (serialized.length > MAX_PAYLOAD_BYTES) {
      return {
        ok:    false,
        error: "Dataset muito grande para salvar (" +
          Math.round(serialized.length / 1024) + " KB > " +
          Math.round(MAX_PAYLOAD_BYTES / 1024) + " KB).",
      };
    }

    try {
      localStorage.setItem(STORAGE_KEY, serialized);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Falha ao gravar no localStorage: " + e.message };
    }
  }

  // ─── Restaurar sessão ──────────────────────────────────────────────────────

  /**
   * Lê e desserializa uma sessão salva.
   *
   * @returns {{
   *   ok: boolean,
   *   data?: { X: number[][], y: number[], classCounts: object, savedAt: string, sampleCount: number },
   *   error?: string
   * }}
   */
  function loadSession() {
    if (!isStorageAvailable()) {
      return { ok: false, error: "localStorage indisponível." };
    }

    var raw;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (e) {
      return { ok: false, error: "Falha ao ler localStorage: " + e.message };
    }

    if (!raw) {
      return { ok: false, error: "Nenhuma sessão salva encontrada." };
    }

    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: "Sessão corrompida (JSON inválido)." };
    }

    // Validações de integridade básicas.
    if (!payload || payload.version !== SCHEMA_VERSION) {
      return { ok: false, error: "Versão de sessão incompatível. Colete novos dados." };
    }

    if (!Array.isArray(payload.X) || !Array.isArray(payload.y)) {
      return { ok: false, error: "Estrutura de sessão inválida." };
    }

    if (payload.X.length !== payload.y.length) {
      return { ok: false, error: "Inconsistência entre features e labels salvos." };
    }

    return {
      ok:   true,
      data: {
        X:           payload.X,
        y:           payload.y,
        classCounts: payload.classCounts || {},
        savedAt:     payload.savedAt || "",
        sampleCount: payload.sampleCount || payload.X.length,
      },
    };
  }

  // ─── Limpar sessão ─────────────────────────────────────────────────────────

  /**
   * Remove a sessão salva do localStorage.
   * @returns {{ ok: boolean, error?: string }}
   */
  function clearSession() {
    if (!isStorageAvailable()) {
      return { ok: false, error: "localStorage indisponível." };
    }
    try {
      localStorage.removeItem(STORAGE_KEY);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Falha ao limpar sessão: " + e.message };
    }
  }

  // ─── Metadados ─────────────────────────────────────────────────────────────

  /**
   * Retorna metadados da sessão salva sem desserializar o dataset completo.
   *
   * @returns {{ ok: boolean, meta?: { savedAt: string, sampleCount: number }, error?: string }}
   */
  function getSessionMeta() {
    var result = loadSession();
    if (!result.ok) return result;
    return {
      ok:   true,
      meta: {
        savedAt:     result.data.savedAt,
        sampleCount: result.data.sampleCount,
      },
    };
  }

  // ─── Exportação pública ────────────────────────────────────────────────────

  window.DomainExpansionSessionPersistence = Object.freeze({
    saveSession:     saveSession,
    loadSession:     loadSession,
    clearSession:    clearSession,
    getSessionMeta:  getSessionMeta,
    isAvailable:     isStorageAvailable,
  });
})();
