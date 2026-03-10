(function () {
  const OTHER_LABEL = "other";

  const SIGN_DEFINITIONS = {
    infinite_void: {
      key: "infinite_void",
      label: "Vazio Infinito",
      shortLabel: "Vazio",
      subtitle: "Resposta imersiva",
      description:
        "Ativa o cenario mais estavel do projeto e costuma exigir menos quadros consecutivos.",
      accent: "#00E5FF",
      lightAccent: "rgba(0, 229, 255, 0.12)",
      animated: true,
    },
    shrine: {
      key: "shrine",
      label: "Santuario",
      shortLabel: "Santuario",
      subtitle: "Energia cortante",
      description:
        "Dispara o dominio com particulas vermelhas e leitura orientada para cortes no ambiente.",
      accent: "#00B8D9",
      lightAccent: "rgba(0, 184, 217, 0.12)",
      animated: true,
    },
    red: {
      key: "red",
      label: "Vermelho",
      shortLabel: "Vermelho",
      subtitle: "Pressao concentrada",
      description:
        "Aplica o efeito de nucleo energetico com vibracao visual e resposta forte no fundo 3D.",
      accent: "#33F3FF",
      lightAccent: "rgba(51, 243, 255, 0.12)",
      animated: true,
    },
    mahoraga: {
      key: "mahoraga",
      label: "Mahoraga",
      shortLabel: "Mahoraga",
      subtitle: "Rotacao adaptativa",
      description:
        "Mostra o dominio com roda adaptativa e leitura de presenca mais ritualistica.",
      accent: "#00FFFF",
      lightAccent: "rgba(0, 255, 255, 0.12)",
      animated: true,
    },
    other: {
      key: "other",
      label: "Outro gesto",
      shortLabel: "Outro",
      subtitle: "Sem ativacao",
      description:
        "Classe de seguranca usada quando o gesto nao e reconhecido com confianca suficiente.",
      accent: "#8FA6B2",
      lightAccent: "rgba(143, 166, 178, 0.12)",
      animated: false,
    },
  };

  const CLASS_ORDER = [
    "infinite_void",
    "shrine",
    "red",
    "mahoraga",
    OTHER_LABEL,
  ];

  const ANIMATED_SIGNS = CLASS_ORDER.filter(
    (key) => SIGN_DEFINITIONS[key] && SIGN_DEFINITIONS[key].animated,
  );

  function getSignMeta(key) {
    return (
      SIGN_DEFINITIONS[key] || {
        key: key || OTHER_LABEL,
        label: key || "Desconhecido",
        shortLabel: key || "Desconhecido",
        subtitle: "Sem metadados",
        description: "Classe sem descricao cadastrada.",
        accent: "#8FA6B2",
        lightAccent: "rgba(143, 166, 178, 0.12)",
        animated: false,
      }
    );
  }

  function formatSignLabel(key) {
    return getSignMeta(key).label;
  }

  window.DomainExpansionSignConfig = {
    OTHER_LABEL,
    CLASS_ORDER,
    ANIMATED_SIGNS,
    SIGN_DEFINITIONS,
    getSignMeta,
    formatSignLabel,
  };
})();
