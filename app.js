(function () {
  async function main() {
    const statusBadge = document.getElementById("statusBadge");
    const statusText = document.getElementById("statusText");
    const video = document.getElementById("video");
    const canvas = document.getElementById("overlay");
    const ctx = canvas.getContext("2d");
    const cameraFrame = document.getElementById("cameraFrame");
    const mirrorToggle = document.getElementById("mirrorToggle");
    const landmarksToggle = document.getElementById("landmarksToggle");
    const historyToggle = document.getElementById("historyToggle");
    const resetMonitor = document.getElementById("resetMonitor");
    const handsVisibleEl = document.getElementById("handsVisible");
    const cameraModeEl = document.getElementById("cameraMode");
    const sessionClockEl = document.getElementById("sessionClock");
    const activeSignalEl = document.getElementById("activeSignal");
    const activeSignalSubtitleEl = document.getElementById("activeSignalSubtitle");
    const activeSignalBadgeEl = document.getElementById("activeSignalBadge");
    const lastDetectedEl = document.getElementById("lastDetected");
    const lastConfidenceEl = document.getElementById("lastConfidence");
    const totalDetectionsEl = document.getElementById("totalDetections");
    const sceneStateEl = document.getElementById("sceneState");
    const confidenceListEl = document.getElementById("confidenceList");
    const historyListEl = document.getElementById("historyList");
    const signalGridEl = document.getElementById("signalGrid");

    function setStatus(text, tone) {
      statusText.textContent = text;
      statusBadge.dataset.tone = tone || "neutral";
    }

    function fail(message, error) {
      setStatus(message, "error");
      if (error) {
        console.error(error);
      }
    }

    const tf = window.tf;
    const Hands = window.Hands;
    const Camera = window.Camera;
    const drawConnectors = window.drawConnectors;
    const drawLandmarks = window.drawLandmarks;
    const HAND_CONNECTIONS = window.HAND_CONNECTIONS;

    if (!tf || !Hands || !Camera || !drawConnectors || !drawLandmarks || !HAND_CONNECTIONS) {
      fail("Bibliotecas de visao ausentes. Recarregue a pagina.");
      throw new Error("Required global libraries are not loaded.");
    }

    const backgroundApi = window.DomainExpansionBackground;
    if (!backgroundApi || typeof backgroundApi.initBackground !== "function") {
      fail("Modulo 3D nao encontrado.");
      throw new Error("Missing background-scene.js");
    }

    const featureApi = window.DomainExpansionGestureFeatures;
    if (!featureApi || typeof featureApi.getTwoHandFeatures !== "function") {
      fail("Extracao de gestos nao encontrada.");
      throw new Error("Missing hand-features.js");
    }

    const signConfig = window.DomainExpansionSignConfig;
    if (!signConfig) {
      fail("Configuracao dos sinais nao encontrada.");
      throw new Error("Missing sign-config.js");
    }

    const OTHER_LABEL = signConfig.OTHER_LABEL;
    const CLASS_LABELS = signConfig.CLASS_ORDER.slice();
    const ANIMATED_SIGNS = new Set(signConfig.ANIMATED_SIGNS);
    const getTwoHandFeatures = featureApi.getTwoHandFeatures;

    const CONF_THRESHOLD = 0.9;
    const REQUIRED_STREAK = 4;
    const MIN_MARGIN_TOP2 = 0.12;
    const MIN_MARGIN_OVER_OTHER = 0.08;
    const CLASS_CONF_THRESHOLD = {
      infinite_void: 0.8,
    };
    const CLASS_REQUIRED_STREAK = {
      infinite_void: 3,
    };

    const state = {
      activeLabel: null,
      streak: 0,
      streakLabel: null,
      historyEnabled: true,
      showLandmarks: true,
      mirrorCamera: true,
      warnedClassCountMismatch: false,
      sessionStartedAt: Date.now(),
      lastDetection: null,
      recentDetections: [],
      detectionCounts: Object.fromEntries(CLASS_LABELS.map((label) => [label, 0])),
    };

    const ui = {
      confidenceRows: {},
      signalCards: {},
      sessionTimerId: null,
    };

    function formatClock(ms) {
      const totalSeconds = Math.max(0, Math.floor(ms / 1000));
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (hours > 0) {
        return [hours, minutes, seconds]
          .map((value) => String(value).padStart(2, "0"))
          .join(":");
      }

      return [minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
    }

    function formatProbability(value) {
      return (value || 0).toFixed(3);
    }

    function formatPercent(value) {
      return Math.round((value || 0) * 100) + "%";
    }

    function getMeta(label) {
      return signConfig.getSignMeta(label);
    }

    function renderConfidenceRows() {
      confidenceListEl.innerHTML = "";
      for (const label of CLASS_LABELS) {
        const meta = getMeta(label);
        const row = document.createElement("article");
        row.className = "confidence-row";
        row.innerHTML =
          '<div class="confidence-top">' +
          "<strong>" +
          meta.label +
          "</strong>" +
          '<span>0%</span>' +
          "</div>" +
          '<div class="confidence-bar"><div class="confidence-fill"></div></div>';

        const valueEl = row.querySelector("span");
        const fillEl = row.querySelector(".confidence-fill");
        fillEl.style.background = "linear-gradient(90deg, " + meta.accent + ", " + meta.accent + ")";
        confidenceListEl.appendChild(row);
        ui.confidenceRows[label] = {
          row,
          valueEl,
          fillEl,
        };
      }
    }

    function renderSignalCards() {
      signalGridEl.innerHTML = "";
      for (const label of CLASS_LABELS) {
        const meta = getMeta(label);
        const card = document.createElement("article");
        card.className = "signal-card";
        card.style.background = meta.lightAccent;
        card.innerHTML =
          "<strong>" +
          meta.label +
          "</strong>" +
          "<span>" +
          meta.description +
          "</span>" +
          '<b style="background:' +
          meta.accent +
          '; color:#fff;">0 ativacoes</b>';

        signalGridEl.appendChild(card);
        ui.signalCards[label] = {
          card,
          countEl: card.querySelector("b"),
        };
      }
      updateSignalCards();
    }

    function renderHistory() {
      historyListEl.innerHTML = "";

      if (!state.recentDetections.length) {
        const empty = document.createElement("div");
        empty.className = "history-empty";
        empty.textContent =
          "Nenhuma ativacao confirmada ainda. Segure um gesto reconhecido para preencher este bloco.";
        historyListEl.appendChild(empty);
        return;
      }

      for (const item of state.recentDetections) {
        const meta = getMeta(item.label);
        const entry = document.createElement("article");
        entry.className = "history-item";
        entry.innerHTML =
          "<div>" +
          "<strong>" +
          meta.label +
          "</strong>" +
          "<span>" +
          new Date(item.timestamp).toLocaleTimeString("pt-BR") +
          "</span>" +
          "</div>" +
          "<strong>" +
          formatProbability(item.confidence) +
          "</strong>";
        historyListEl.appendChild(entry);
      }
    }

    function updateSignalCards() {
      for (const label of CLASS_LABELS) {
        const meta = getMeta(label);
        const cardRef = ui.signalCards[label];
        if (!cardRef) {
          continue;
        }

        if (!meta.animated) {
          cardRef.countEl.textContent = "Sem animacao";
          cardRef.countEl.style.background = "rgba(123, 139, 112, 0.22)";
          cardRef.countEl.style.color = "#435140";
          continue;
        }

        const count = state.detectionCounts[label] || 0;
        cardRef.countEl.textContent = count + (count === 1 ? " ativacao" : " ativacoes");
        cardRef.countEl.style.background = meta.accent;
        cardRef.countEl.style.color = "#fff";
      }
    }

    function updateSessionMetrics() {
      const total = signConfig.ANIMATED_SIGNS.reduce(
        (sum, label) => sum + (state.detectionCounts[label] || 0),
        0,
      );
      totalDetectionsEl.textContent = String(total);

      if (state.lastDetection) {
        lastDetectedEl.textContent = getMeta(state.lastDetection.label).label;
        lastConfidenceEl.textContent = formatProbability(state.lastDetection.confidence);
      } else {
        lastDetectedEl.textContent = "Nenhum";
        lastConfidenceEl.textContent = "0.000";
      }

      sceneStateEl.textContent = state.activeLabel
        ? "Ativo: " + getMeta(state.activeLabel).label
        : "Em espera";
      updateSignalCards();
      renderHistory();
    }

    function updateFocusPanel(label, subtitle, badgeText, accent) {
      const meta = label ? getMeta(label) : null;
      activeSignalEl.textContent = meta ? meta.label : "Aguardando gesto";
      activeSignalSubtitleEl.textContent =
        subtitle ||
        (meta ? meta.description : "Posicione as duas maos dentro do quadro para iniciar.");
      activeSignalBadgeEl.textContent = badgeText || "Pronto";
      activeSignalBadgeEl.style.background = accent || (meta ? meta.accent : "#7b8b70");
    }

    function applyCameraMode() {
      cameraFrame.classList.toggle("is-mirrored", state.mirrorCamera);
      mirrorToggle.textContent = state.mirrorCamera ? "Desespelhar camera" : "Espelhar camera";
      mirrorToggle.setAttribute("aria-pressed", String(state.mirrorCamera));
      landmarksToggle.textContent = state.showLandmarks ? "Ocultar pontos" : "Mostrar pontos";
      landmarksToggle.setAttribute("aria-pressed", String(state.showLandmarks));
      historyToggle.textContent = state.historyEnabled ? "Pausar historico" : "Retomar historico";
      historyToggle.setAttribute("aria-pressed", String(state.historyEnabled));
      cameraModeEl.textContent = state.mirrorCamera ? "Espelhada" : "Normal";
    }

    function registerDetection(label, confidence) {
      if (!state.historyEnabled || !ANIMATED_SIGNS.has(label)) {
        return;
      }

      state.detectionCounts[label] += 1;
      state.lastDetection = {
        label,
        confidence,
        timestamp: Date.now(),
      };

      state.recentDetections.unshift(state.lastDetection);
      state.recentDetections = state.recentDetections.slice(0, 6);
      updateSessionMetrics();
    }

    function setDetectionState(label, confidence) {
      if (state.activeLabel === label) {
        return;
      }

      const previousLabel = state.activeLabel;
      state.activeLabel = label;
      if (bg && typeof bg.setSign === "function") {
        bg.setSign(label && ANIMATED_SIGNS.has(label) ? label : null);
      }

      if (label && label !== previousLabel) {
        registerDetection(label, confidence || 0);
      }
      updateSessionMetrics();
    }

    function resetMonitoringState() {
      if (bg && typeof bg.setSign === "function") {
        bg.setSign(null);
      }
      state.activeLabel = null;
      state.streak = 0;
      state.streakLabel = null;
      state.lastDetection = null;
      state.recentDetections = [];
      state.detectionCounts = Object.fromEntries(CLASS_LABELS.map((label) => [label, 0]));
      handsVisibleEl.textContent = "0";
      updateFocusPanel(null, null, "Pronto", "#7b8b70");
      renderConfidenceValues(Object.fromEntries(CLASS_LABELS.map((label) => [label, 0])), null);
      updateSessionMetrics();
      setStatus("Monitoramento limpo. Aguardando novo gesto.", "neutral");
    }

    function renderConfidenceValues(probabilitiesByLabel, activeCandidate) {
      for (const label of CLASS_LABELS) {
        const rowRef = ui.confidenceRows[label];
        if (!rowRef) {
          continue;
        }

        const value = probabilitiesByLabel[label] || 0;
        rowRef.valueEl.textContent = formatPercent(value);
        rowRef.fillEl.style.width = formatPercent(value);
        rowRef.row.classList.toggle("is-active", label === activeCandidate);
      }
    }

    function argMax(arr) {
      let bestIndex = 0;
      for (let i = 1; i < arr.length; i += 1) {
        if (arr[i] > arr[bestIndex]) {
          bestIndex = i;
        }
      }
      return bestIndex;
    }

    renderConfidenceRows();
    renderSignalCards();
    renderHistory();
    applyCameraMode();
    updateFocusPanel(null, null, "Pronto", "#7b8b70");
    updateSessionMetrics();

    ui.sessionTimerId = window.setInterval(() => {
      sessionClockEl.textContent = formatClock(Date.now() - state.sessionStartedAt);
    }, 1000);
    sessionClockEl.textContent = formatClock(0);

    mirrorToggle.addEventListener("click", () => {
      state.mirrorCamera = !state.mirrorCamera;
      applyCameraMode();
    });

    landmarksToggle.addEventListener("click", () => {
      state.showLandmarks = !state.showLandmarks;
      applyCameraMode();
    });

    historyToggle.addEventListener("click", () => {
      state.historyEnabled = !state.historyEnabled;
      applyCameraMode();
      setStatus(
        state.historyEnabled
          ? "Historico de ativacoes retomado."
          : "Historico pausado. O fundo continua detectando normalmente.",
        "neutral",
      );
    });

    resetMonitor.addEventListener("click", resetMonitoringState);

    let bg;
    try {
      bg = backgroundApi.initBackground();
    } catch (error) {
      fail("Falha ao iniciar o fundo 3D. Consulte o console.", error);
      return;
    }

    setStatus("Carregando modelo TensorFlow...", "neutral");
    let model;
    try {
      model = await tf.loadLayersModel("./hand-sign-model.json");
    } catch (error) {
      fail("Falha ao carregar o modelo salvo.", error);
      return;
    }

    setStatus("Modelo carregado. Solicitando acesso a camera...", "neutral");

    const hands = new Hands({
      locateFile: function (file) {
        return "https://cdn.jsdelivr.net/npm/@mediapipe/hands/" + file;
      },
    });

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    });

    hands.onResults(function (results) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const landmarks = results.multiHandLandmarks || [];
      handsVisibleEl.textContent = String(landmarks.length || 0);

      if (state.showLandmarks && landmarks.length) {
        for (const handLandmarks of landmarks) {
          drawConnectors(ctx, handLandmarks, HAND_CONNECTIONS, {
            color: "#58a303",
            lineWidth: 2,
          });
          drawLandmarks(ctx, handLandmarks, {
            color: "#ff6900",
            lineWidth: 1,
            radius: 3,
          });
        }
      }

      if (!landmarks.length) {
        state.streak = 0;
        state.streakLabel = null;
        renderConfidenceValues(Object.fromEntries(CLASS_LABELS.map((label) => [label, 0])), null);
        setDetectionState(null, 0);
        updateFocusPanel(
          null,
          "Nenhuma mao detectada. Reposicione as duas maos dentro do quadro.",
          "Sem leitura",
          "#7b8b70",
        );
        setStatus("Sem maos no enquadramento.", "warning");
        return;
      }

      const features = getTwoHandFeatures(results);
      const probabilities = tf.tidy(function () {
        const tensor = tf.tensor2d([features]);
        return Array.from(model.predict(tensor).dataSync());
      });

      if (!probabilities.length) {
        state.streak = 0;
        state.streakLabel = null;
        renderConfidenceValues(Object.fromEntries(CLASS_LABELS.map((label) => [label, 0])), null);
        setDetectionState(null, 0);
        updateFocusPanel(null, "Nao foi possivel inferir o gesto atual.", "Erro", "#cf2e2e");
        setStatus("Falha de inferencia no quadro atual.", "error");
        return;
      }

      let predictedIndex = argMax(probabilities);
      let predictedLabel = CLASS_LABELS[predictedIndex] || "class_" + predictedIndex;
      let score = probabilities[predictedIndex] || 0;
      let secondScore = 0;

      if (probabilities.length > 1) {
        let secondIndex = -1;
        for (let i = 0; i < probabilities.length; i += 1) {
          if (i === predictedIndex) {
            continue;
          }
          if (secondIndex === -1 || probabilities[i] > probabilities[secondIndex]) {
            secondIndex = i;
          }
        }
        secondScore = secondIndex >= 0 ? probabilities[secondIndex] : 0;
      }

      if (!state.warnedClassCountMismatch && probabilities.length !== CLASS_LABELS.length) {
        state.warnedClassCountMismatch = true;
        console.warn(
          "Model output class count (" +
            probabilities.length +
            ") does not match CLASS_LABELS (" +
            CLASS_LABELS.length +
            ").",
        );
      }

      const probabilitiesByLabel = {};
      CLASS_LABELS.forEach(function (label, index) {
        probabilitiesByLabel[label] = probabilities[index] || 0;
      });
      renderConfidenceValues(probabilitiesByLabel, predictedLabel);

      const otherIndex = CLASS_LABELS.indexOf(OTHER_LABEL);
      const otherScore =
        otherIndex >= 0 && otherIndex < probabilities.length ? probabilities[otherIndex] : 0;
      const marginToSecond = score - secondScore;
      const marginToOther = score - otherScore;

      const isOtherLike =
        predictedLabel === OTHER_LABEL ||
        predictedLabel.indexOf("class_") === 0 ||
        marginToSecond < MIN_MARGIN_TOP2 ||
        (predictedIndex !== otherIndex && marginToOther < MIN_MARGIN_OVER_OTHER);

      if (isOtherLike) {
        state.streak = 0;
        state.streakLabel = null;
        setDetectionState(null, 0);
        updateFocusPanel(
          OTHER_LABEL,
          "Leitura ambigua ou fora do conjunto principal. Nenhuma animacao sera ativada.",
          "Sem ativacao",
          getMeta(OTHER_LABEL).accent,
        );
        setStatus("Gesto fora do perfil principal ou ainda instavel.", "warning");
        return;
      }

      const confidenceThreshold = CLASS_CONF_THRESHOLD[predictedLabel] || CONF_THRESHOLD;
      const requiredStreak = CLASS_REQUIRED_STREAK[predictedLabel] || REQUIRED_STREAK;

      if (score >= confidenceThreshold && predictedLabel) {
        if (state.streakLabel === predictedLabel) {
          state.streak += 1;
        } else {
          state.streakLabel = predictedLabel;
          state.streak = 1;
        }

        const reachedThreshold = state.streak >= requiredStreak;
        const meta = getMeta(predictedLabel);

        if (reachedThreshold) {
          setDetectionState(predictedLabel, score);
          updateFocusPanel(predictedLabel, meta.description, "Confirmado", meta.accent);
          setStatus(meta.label + " confirmado com " + formatProbability(score) + ".", "success");
        } else {
          setDetectionState(null, 0);
          updateFocusPanel(
            predictedLabel,
            "Leitura em consolidacao. Persistencia atual: " +
              state.streak +
              "/" +
              requiredStreak +
              ".",
            "Preparando",
            meta.accent,
          );
          setStatus(
            meta.label +
              " em consolidacao: " +
              state.streak +
              "/" +
              requiredStreak +
              " quadros.",
            "neutral",
          );
        }
      } else {
        state.streak = 0;
        state.streakLabel = null;
        setDetectionState(null, 0);
        updateFocusPanel(
          OTHER_LABEL,
          "Confianca insuficiente para ativacao. Ajuste o gesto ou a posicao da camera.",
          "Baixa confianca",
          getMeta(OTHER_LABEL).accent,
        );
        setStatus("Confianca insuficiente para validar o gesto.", "warning");
      }
    });

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch (error) {
      fail("Nao foi possivel acessar a camera.", error);
      return;
    }

    video.srcObject = stream;
    video.addEventListener("loadeddata", function () {
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
    });

    const camera = new Camera(video, {
      onFrame: async function () {
        await hands.send({ image: video });
      },
      width: 640,
      height: 480,
    });

    try {
      await camera.start();
    } catch (error) {
      fail("Falha ao iniciar o stream da camera.", error);
      return;
    }

    setStatus("Sistema pronto para detectar gestos.", "success");
  }

  main().catch(function (error) {
    console.error("App failed:", error);
    const statusBadge = document.getElementById("statusBadge");
    const statusText = document.getElementById("statusText");
    if (statusBadge) {
      statusBadge.dataset.tone = "error";
    }
    if (statusText) {
      statusText.textContent = "Falha geral na inicializacao. Consulte o console.";
    }
  });
})();
