/**
 * @fileoverview Pipeline principal de detecção de gestos em tempo real.
 *
 * Orquestra o ciclo de vida da aplicação: carregamento do modelo TF.js,
 * inicialização do MediaPipe Hands, renderização de feedback visual e
 * disparo de animações 3D ao confirmar um gesto.
 *
 * Atalhos de teclado:
 *   M  — alternar espelhamento de câmera
 *   L  — alternar visibilidade de landmarks
 *   H  — pausar / retomar histórico
 *   R  — resetar monitoramento
 *   Shift+P — abrir/fechar painel de performance
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  // ─── Referência ao error handler (carregado antes deste script) ────────────
  var logger = window.DomainExpansionErrorHandler || {
    info:  function (m) { console.info(m); },
    warn:  function (m) { console.warn(m); },
    error: function (m, e) { console.error(m, e); },
  };

  // ─── Constantes de detecção ────────────────────────────────────────────────

  /** Confiança mínima padrão para aceitar uma predição. */
  var CONF_THRESHOLD = 0.9;

  /** Número de quadros consecutivos necessários para confirmar um gesto. */
  var REQUIRED_STREAK = 4;

  /** Margem mínima entre o 1.º e o 2.º classificados. */
  var MIN_MARGIN_TOP2 = 0.12;

  /** Margem mínima sobre a classe "other". */
  var MIN_MARGIN_OVER_OTHER = 0.08;

  /**
   * Limiares e streaks personalizados por classe.
   * Infinite Void exige menos frames — é o cenário mais estável.
   */
  var CLASS_CONF_THRESHOLD   = { infinite_void: 0.8 };
  var CLASS_REQUIRED_STREAK  = { infinite_void: 3 };

  // ─── Entrada principal (async IIFE) ───────────────────────────────────────

  async function main() {
    // ── Referências ao DOM ─────────────────────────────────────────────────
    var statusBadge          = document.getElementById("statusBadge");
    var statusText           = document.getElementById("statusText");
    var video                = document.getElementById("video");
    var canvas               = document.getElementById("overlay");
    var cameraFrame          = document.getElementById("cameraFrame");
    var mirrorToggle         = document.getElementById("mirrorToggle");
    var landmarksToggle      = document.getElementById("landmarksToggle");
    var historyToggle        = document.getElementById("historyToggle");
    var resetMonitor         = document.getElementById("resetMonitor");
    var handsVisibleEl       = document.getElementById("handsVisible");
    var cameraModeEl         = document.getElementById("cameraMode");
    var sessionClockEl       = document.getElementById("sessionClock");
    var activeSignalEl       = document.getElementById("activeSignal");
    var activeSignalSubEl    = document.getElementById("activeSignalSubtitle");
    var activeSignalBadgeEl  = document.getElementById("activeSignalBadge");
    var lastDetectedEl       = document.getElementById("lastDetected");
    var lastConfidenceEl     = document.getElementById("lastConfidence");
    var totalDetectionsEl    = document.getElementById("totalDetections");
    var sceneStateEl         = document.getElementById("sceneState");
    var confidenceListEl     = document.getElementById("confidenceList");
    var historyListEl        = document.getElementById("historyList");
    var signalGridEl         = document.getElementById("signalGrid");

    // Contexto 2D do canvas de landmarks.
    var ctx = canvas ? canvas.getContext("2d") : null;

    // ── Utilitários de UI ─────────────────────────────────────────────────

    function setStatus(text, tone) {
      if (statusText)  statusText.textContent = text;
      if (statusBadge) statusBadge.dataset.tone = tone || "neutral";
    }

    function fail(message, err) {
      setStatus(message, "error");
      logger.error(message, err);
    }

    // ── Verificações de dependências ──────────────────────────────────────

    var tf             = window.tf;
    var Hands          = window.Hands;
    var Camera         = window.Camera;
    var drawConnectors = window.drawConnectors;
    var drawLandmarks  = window.drawLandmarks;
    var HAND_CONNECTIONS = window.HAND_CONNECTIONS;

    if (!tf || !Hands || !Camera || !drawConnectors || !drawLandmarks || !HAND_CONNECTIONS) {
      fail("Bibliotecas de visão ausentes. Recarregue a página.");
      throw new Error("Required global libraries are not loaded.");
    }

    var backgroundApi = window.DomainExpansionBackground;
    if (!backgroundApi || typeof backgroundApi.initBackground !== "function") {
      fail("Módulo 3D não encontrado.");
      throw new Error("Missing background-scene.js");
    }

    var featureApi = window.DomainExpansionGestureFeatures;
    if (!featureApi || typeof featureApi.getTwoHandFeatures !== "function") {
      fail("Extração de gestos não encontrada.");
      throw new Error("Missing hand-features.js");
    }

    var signConfig = window.DomainExpansionSignConfig;
    if (!signConfig) {
      fail("Configuração dos sinais não encontrada.");
      throw new Error("Missing sign-config.js");
    }

    // ── Aliases ────────────────────────────────────────────────────────────

    var OTHER_LABEL       = signConfig.OTHER_LABEL;
    var CLASS_LABELS      = signConfig.CLASS_ORDER.slice();
    var ANIMATED_SIGNS    = new Set(signConfig.ANIMATED_SIGNS);
    var getTwoHandFeatures = featureApi.getTwoHandFeatures;

    // ── Estado da aplicação ────────────────────────────────────────────────

    var state = {
      activeLabel:           null,
      streak:                0,
      streakLabel:           null,
      historyEnabled:        true,
      showLandmarks:         true,
      mirrorCamera:          true,
      warnedClassMismatch:   false,
      sessionStartedAt:      Date.now(),
      lastDetection:         null,
      recentDetections:      [],
      detectionCounts: Object.fromEntries(CLASS_LABELS.map(function (l) { return [l, 0]; })),
    };

    var ui = {
      confidenceRows: {},
      signalCards:    {},
      sessionTimerId: null,
    };

    // ── Formatação ─────────────────────────────────────────────────────────

    function formatClock(ms) {
      var totalSeconds = Math.max(0, Math.floor(ms / 1000));
      var hours   = Math.floor(totalSeconds / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;
      var pad = function (v) { return String(v).padStart(2, "0"); };
      return hours > 0
        ? [hours, minutes, seconds].map(pad).join(":")
        : [minutes, seconds].map(pad).join(":");
    }

    function formatProbability(value) {
      return ((value || 0)).toFixed(3);
    }

    function formatPercent(value) {
      return Math.round((value || 0) * 100) + "%";
    }

    function getMeta(label) {
      return signConfig.getSignMeta(label);
    }

    // ── Renderização de UI ─────────────────────────────────────────────────

    function renderConfidenceRows() {
      if (!confidenceListEl) return;
      confidenceListEl.innerHTML = "";
      for (var i = 0; i < CLASS_LABELS.length; i++) {
        var label = CLASS_LABELS[i];
        var meta  = getMeta(label);
        var row   = document.createElement("article");
        row.className = "confidence-row";
        row.innerHTML =
          '<div class="confidence-top">' +
            "<strong>" + meta.label + "</strong>" +
            "<span>0%</span>" +
          "</div>" +
          '<div class="confidence-bar"><div class="confidence-fill"></div></div>';

        var valueEl = row.querySelector("span");
        var fillEl  = row.querySelector(".confidence-fill");
        fillEl.style.background = "linear-gradient(90deg, " + meta.accent + ", " + meta.accent + ")";
        confidenceListEl.appendChild(row);
        ui.confidenceRows[label] = { row: row, valueEl: valueEl, fillEl: fillEl };
      }
    }

    function renderSignalCards() {
      if (!signalGridEl) return;
      signalGridEl.innerHTML = "";
      for (var i = 0; i < CLASS_LABELS.length; i++) {
        var label = CLASS_LABELS[i];
        var meta  = getMeta(label);
        var card  = document.createElement("article");
        card.className = "signal-card";
        card.style.background = meta.lightAccent;
        card.innerHTML =
          "<strong>" + meta.label + "</strong>" +
          "<span>" + meta.description + "</span>" +
          '<b style="background:' + meta.accent + '; color:#fff;">0 ativações</b>';

        signalGridEl.appendChild(card);
        ui.signalCards[label] = { card: card, countEl: card.querySelector("b") };
      }
      updateSignalCards();
    }

    function renderHistory() {
      if (!historyListEl) return;
      historyListEl.innerHTML = "";
      if (!state.recentDetections.length) {
        var empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent =
          "Nenhuma ativação confirmada ainda. Segure um gesto reconhecido para preencher este bloco.";
        historyListEl.appendChild(empty);
        return;
      }
      for (var i = 0; i < state.recentDetections.length; i++) {
        var item  = state.recentDetections[i];
        var meta  = getMeta(item.label);
        var entry = document.createElement("article");
        entry.className = "history-item";
        entry.innerHTML =
          "<div><strong>" + meta.label + "</strong><span>" +
            new Date(item.timestamp).toLocaleTimeString("pt-BR") +
          "</span></div>" +
          "<strong>" + formatProbability(item.confidence) + "</strong>";
        historyListEl.appendChild(entry);
      }
    }

    function updateSignalCards() {
      for (var i = 0; i < CLASS_LABELS.length; i++) {
        var label   = CLASS_LABELS[i];
        var meta    = getMeta(label);
        var cardRef = ui.signalCards[label];
        if (!cardRef) continue;
        if (!meta.animated) {
          cardRef.countEl.textContent = "Sem animação";
          cardRef.countEl.style.background = "rgba(143, 166, 178, 0.14)";
          cardRef.countEl.style.color = "#E6FFFF";
          continue;
        }
        var count = state.detectionCounts[label] || 0;
        cardRef.countEl.textContent = count + (count === 1 ? " ativação" : " ativações");
        cardRef.countEl.style.background = meta.accent;
        cardRef.countEl.style.color = "#fff";
      }
    }

    function updateSessionMetrics() {
      var total = signConfig.ANIMATED_SIGNS.reduce(function (sum, label) {
        return sum + (state.detectionCounts[label] || 0);
      }, 0);
      if (totalDetectionsEl) totalDetectionsEl.textContent = String(total);

      if (state.lastDetection) {
        if (lastDetectedEl)   lastDetectedEl.textContent   = getMeta(state.lastDetection.label).label;
        if (lastConfidenceEl) lastConfidenceEl.textContent = formatProbability(state.lastDetection.confidence);
      } else {
        if (lastDetectedEl)   lastDetectedEl.textContent   = "Nenhum";
        if (lastConfidenceEl) lastConfidenceEl.textContent = "0.000";
      }

      if (sceneStateEl) {
        sceneStateEl.textContent = state.activeLabel
          ? "Ativo: " + getMeta(state.activeLabel).label
          : "Em espera";
      }

      updateSignalCards();
      renderHistory();
    }

    function updateFocusPanel(label, subtitle, badgeText, accent) {
      var meta = label ? getMeta(label) : null;
      if (activeSignalEl)      activeSignalEl.textContent = meta ? meta.label : "Aguardando gesto";
      if (activeSignalSubEl)   activeSignalSubEl.textContent =
        subtitle || (meta ? meta.description : "Posicione as duas mãos dentro do quadro para iniciar.");
      if (activeSignalBadgeEl) {
        activeSignalBadgeEl.textContent = badgeText || "Pronto";
        activeSignalBadgeEl.style.background = accent || (meta ? meta.accent : "#8FA6B2");
      }
    }

    function applyCameraMode() {
      if (cameraFrame)      cameraFrame.classList.toggle("is-mirrored", state.mirrorCamera);
      if (mirrorToggle) {
        mirrorToggle.textContent = state.mirrorCamera ? "Desespelhar câmera" : "Espelhar câmera";
        mirrorToggle.setAttribute("aria-pressed", String(state.mirrorCamera));
      }
      if (landmarksToggle) {
        landmarksToggle.textContent = state.showLandmarks ? "Ocultar pontos" : "Mostrar pontos";
        landmarksToggle.setAttribute("aria-pressed", String(state.showLandmarks));
      }
      if (historyToggle) {
        historyToggle.textContent = state.historyEnabled ? "Pausar histórico" : "Retomar histórico";
        historyToggle.setAttribute("aria-pressed", String(state.historyEnabled));
      }
      if (cameraModeEl) cameraModeEl.textContent = state.mirrorCamera ? "Espelhada" : "Normal";
    }

    function renderConfidenceValues(probabilitiesByLabel, activeCandidate) {
      for (var i = 0; i < CLASS_LABELS.length; i++) {
        var label  = CLASS_LABELS[i];
        var rowRef = ui.confidenceRows[label];
        if (!rowRef) continue;
        var value = probabilitiesByLabel[label] || 0;
        rowRef.valueEl.textContent = formatPercent(value);
        rowRef.fillEl.style.width  = formatPercent(value);
        rowRef.row.classList.toggle("is-active", label === activeCandidate);
      }
    }

    function argMax(arr) {
      var best = 0;
      for (var i = 1; i < arr.length; i++) {
        if (arr[i] > arr[best]) best = i;
      }
      return best;
    }

    // ── Lógica de detecção ─────────────────────────────────────────────────

    function registerDetection(label, confidence) {
      if (!state.historyEnabled || !ANIMATED_SIGNS.has(label)) return;
      state.detectionCounts[label] += 1;
      state.lastDetection = { label: label, confidence: confidence, timestamp: Date.now() };
      state.recentDetections.unshift(state.lastDetection);
      state.recentDetections = state.recentDetections.slice(0, 6);
      updateSessionMetrics();
    }

    function setDetectionState(label, confidence) {
      if (state.activeLabel === label) return;
      var previous = state.activeLabel;
      state.activeLabel = label;
      if (bg && typeof bg.setSign === "function") {
        bg.setSign(label && ANIMATED_SIGNS.has(label) ? label : null);
      }
      if (label && label !== previous) {
        registerDetection(label, confidence || 0);
      }
      updateSessionMetrics();
    }

    function resetMonitoringState() {
      if (bg && typeof bg.setSign === "function") bg.setSign(null);
      state.activeLabel   = null;
      state.streak        = 0;
      state.streakLabel   = null;
      state.lastDetection = null;
      state.recentDetections = [];
      state.detectionCounts  = Object.fromEntries(CLASS_LABELS.map(function (l) { return [l, 0]; }));
      if (handsVisibleEl) handsVisibleEl.textContent = "0";
      updateFocusPanel(null, null, "Pronto", "#8FA6B2");
      renderConfidenceValues(Object.fromEntries(CLASS_LABELS.map(function (l) { return [l, 0]; })), null);
      updateSessionMetrics();
      setStatus("Monitoramento limpo. Aguardando novo gesto.", "neutral");
    }

    // ── Inicialização da UI ────────────────────────────────────────────────

    renderConfidenceRows();
    renderSignalCards();
    renderHistory();
    applyCameraMode();
    updateFocusPanel(null, null, "Pronto", "#8FA6B2");
    updateSessionMetrics();

    ui.sessionTimerId = window.setInterval(function () {
      if (sessionClockEl) sessionClockEl.textContent = formatClock(Date.now() - state.sessionStartedAt);
    }, 1000);
    if (sessionClockEl) sessionClockEl.textContent = formatClock(0);

    // ── Eventos de controle (botões) ───────────────────────────────────────

    if (mirrorToggle) {
      mirrorToggle.addEventListener("click", function () {
        state.mirrorCamera = !state.mirrorCamera;
        applyCameraMode();
      });
    }

    if (landmarksToggle) {
      landmarksToggle.addEventListener("click", function () {
        state.showLandmarks = !state.showLandmarks;
        applyCameraMode();
      });
    }

    if (historyToggle) {
      historyToggle.addEventListener("click", function () {
        state.historyEnabled = !state.historyEnabled;
        applyCameraMode();
        setStatus(
          state.historyEnabled
            ? "Histórico de ativações retomado."
            : "Histórico pausado. O fundo continua detectando normalmente.",
          "neutral"
        );
      });
    }

    if (resetMonitor) {
      resetMonitor.addEventListener("click", resetMonitoringState);
    }

    // ── Atalhos de teclado ─────────────────────────────────────────────────

    document.addEventListener("keydown", function (e) {
      // Ignorar quando o foco estiver em input/select/textarea.
      if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;

      switch (e.key) {
        case "m": case "M":
          state.mirrorCamera = !state.mirrorCamera;
          applyCameraMode();
          break;
        case "l": case "L":
          state.showLandmarks = !state.showLandmarks;
          applyCameraMode();
          break;
        case "h": case "H":
          state.historyEnabled = !state.historyEnabled;
          applyCameraMode();
          break;
        case "r": case "R":
          resetMonitoringState();
          break;
      }
    });

    // ── Inicialização do fundo 3D ──────────────────────────────────────────

    var bg;
    try {
      bg = backgroundApi.initBackground();
    } catch (err) {
      fail("Falha ao iniciar o fundo 3D. Consulte o console.", err);
      return;
    }

    // ── Carregamento do modelo TF.js ───────────────────────────────────────

    setStatus("Carregando modelo TensorFlow...", "neutral");
    var model;
    try {
      model = await tf.loadLayersModel("./hand-sign-model.json");
      logger.info("Modelo TF.js carregado com sucesso.");
    } catch (err) {
      fail("Falha ao carregar o modelo salvo.", err);
      return;
    }

    // ── MediaPipe Hands ────────────────────────────────────────────────────

    setStatus("Modelo carregado. Solicitando acesso à câmera...", "neutral");

    var hands = new Hands({
      locateFile: function (file) {
        return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file;
      },
    });

    hands.setOptions({
      maxNumHands:            2,
      modelComplexity:        1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence:  0.7,
    });

    hands.onResults(function (results) {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      var landmarks = results.multiHandLandmarks || [];
      if (handsVisibleEl) handsVisibleEl.textContent = String(landmarks.length || 0);

      // Desenha landmarks quando visíveis.
      if (state.showLandmarks && landmarks.length) {
        for (var h = 0; h < landmarks.length; h++) {
          drawConnectors(ctx, landmarks[h], HAND_CONNECTIONS, { color: "#00E5FF", lineWidth: 2 });
          drawLandmarks(ctx, landmarks[h], { color: "#33F3FF", lineWidth: 1, radius: 3 });
        }
      }

      // Sem mãos detectadas.
      if (!landmarks.length) {
        state.streak      = 0;
        state.streakLabel = null;
        renderConfidenceValues(
          Object.fromEntries(CLASS_LABELS.map(function (l) { return [l, 0]; })),
          null
        );
        setDetectionState(null, 0);
        updateFocusPanel(null, "Nenhuma mão detectada. Reposicione as duas mãos dentro do quadro.", "Sem leitura", "#8FA6B2");
        setStatus("Sem mãos no enquadramento.", "warning");
        return;
      }

      // Inferência.
      var features;
      try {
        features = getTwoHandFeatures(results);
      } catch (err) {
        logger.warn("Falha ao extrair features do quadro.", err);
        return;
      }

      var probabilities = tf.tidy(function () {
        var tensor = tf.tensor2d([features]);
        return Array.from(model.predict(tensor).dataSync());
      });

      if (!probabilities || !probabilities.length) {
        state.streak      = 0;
        state.streakLabel = null;
        renderConfidenceValues(
          Object.fromEntries(CLASS_LABELS.map(function (l) { return [l, 0]; })),
          null
        );
        setDetectionState(null, 0);
        updateFocusPanel(null, "Não foi possível inferir o gesto atual.", "Erro", "#00B8D9");
        setStatus("Falha de inferência no quadro atual.", "error");
        return;
      }

      // Aviso único sobre divergência de classes.
      if (!state.warnedClassMismatch && probabilities.length !== CLASS_LABELS.length) {
        state.warnedClassMismatch = true;
        logger.warn(
          "Divergência: modelo retorna " + probabilities.length +
          " classes, CLASS_LABELS tem " + CLASS_LABELS.length + "."
        );
      }

      var predictedIndex = argMax(probabilities);
      var predictedLabel = CLASS_LABELS[predictedIndex] || ("class_" + predictedIndex);
      var score          = probabilities[predictedIndex] || 0;

      var secondScore = 0;
      for (var i = 0; i < probabilities.length; i++) {
        if (i !== predictedIndex && probabilities[i] > secondScore) {
          secondScore = probabilities[i];
        }
      }

      var probabilitiesByLabel = {};
      for (var j = 0; j < CLASS_LABELS.length; j++) {
        probabilitiesByLabel[CLASS_LABELS[j]] = probabilities[j] || 0;
      }
      renderConfidenceValues(probabilitiesByLabel, predictedLabel);

      var otherIndex    = CLASS_LABELS.indexOf(OTHER_LABEL);
      var otherScore    = otherIndex >= 0 ? (probabilities[otherIndex] || 0) : 0;
      var marginToTop2  = score - secondScore;
      var marginToOther = score - otherScore;

      var isOtherLike =
        predictedLabel === OTHER_LABEL ||
        predictedLabel.indexOf("class_") === 0 ||
        marginToTop2  < MIN_MARGIN_TOP2 ||
        (predictedIndex !== otherIndex && marginToOther < MIN_MARGIN_OVER_OTHER);

      if (isOtherLike) {
        state.streak      = 0;
        state.streakLabel = null;
        setDetectionState(null, 0);
        updateFocusPanel(
          OTHER_LABEL,
          "Leitura ambígua ou fora do conjunto principal. Nenhuma animação será ativada.",
          "Sem ativação",
          getMeta(OTHER_LABEL).accent
        );
        setStatus("Gesto fora do perfil principal ou ainda instável.", "warning");
        return;
      }

      var confThreshold   = CLASS_CONF_THRESHOLD[predictedLabel]  || CONF_THRESHOLD;
      var requiredStreak  = CLASS_REQUIRED_STREAK[predictedLabel] || REQUIRED_STREAK;

      if (score >= confThreshold) {
        if (state.streakLabel === predictedLabel) {
          state.streak += 1;
        } else {
          state.streakLabel = predictedLabel;
          state.streak      = 1;
        }

        var meta = getMeta(predictedLabel);

        if (state.streak >= requiredStreak) {
          setDetectionState(predictedLabel, score);
          updateFocusPanel(predictedLabel, meta.description, "Confirmado", meta.accent);
          setStatus(meta.label + " confirmado com " + formatProbability(score) + ".", "success");
        } else {
          setDetectionState(null, 0);
          updateFocusPanel(
            predictedLabel,
            "Leitura em consolidação. Persistência atual: " + state.streak + "/" + requiredStreak + ".",
            "Preparando",
            meta.accent
          );
          setStatus(
            meta.label + " em consolidação: " + state.streak + "/" + requiredStreak + " quadros.",
            "neutral"
          );
        }
      } else {
        state.streak      = 0;
        state.streakLabel = null;
        setDetectionState(null, 0);
        updateFocusPanel(
          OTHER_LABEL,
          "Confiança insuficiente para ativação. Ajuste o gesto ou a posição da câmera.",
          "Baixa confiança",
          getMeta(OTHER_LABEL).accent
        );
        setStatus("Confiança insuficiente para validar o gesto.", "warning");
      }
    });

    // ── Câmera ─────────────────────────────────────────────────────────────

    var stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" },
      });
    } catch (err) {
      var permMsg = err.name === "NotAllowedError"
        ? "Permissão de câmera negada. Clique no ícone da câmera na barra do navegador para conceder acesso."
        : "Não foi possível acessar a câmera: " + err.message;
      fail(permMsg, err);
      return;
    }

    video.srcObject = stream;
    video.addEventListener("loadeddata", function () {
      canvas.width  = video.videoWidth  || 640;
      canvas.height = video.videoHeight || 480;
    });

    var camera = new Camera(video, {
      onFrame: async function () {
        try {
          await hands.send({ image: video });
        } catch (err) {
          logger.warn("Erro ao processar quadro MediaPipe.", err);
        }
      },
      width:  640,
      height: 480,
    });

    try {
      await camera.start();
    } catch (err) {
      fail("Falha ao iniciar o stream da câmera.", err);
      return;
    }

    // Verifica ambiente após inicialização completa.
    if (window.DomainExpansionErrorHandler) {
      window.DomainExpansionErrorHandler.checkEnvironment();
    }

    setStatus("Sistema pronto para detectar gestos.", "success");
    logger.info("Portal-Econ inicializado com sucesso.");
  }

  // ─── Execução ─────────────────────────────────────────────────────────────

  main().catch(function (err) {
    logger.error("Falha geral na inicialização.", err);
    var badge = document.getElementById("statusBadge");
    var text  = document.getElementById("statusText");
    if (badge) badge.dataset.tone = "error";
    if (text)  text.textContent   = "Falha geral na inicialização. Consulte o console.";
  });
})();
