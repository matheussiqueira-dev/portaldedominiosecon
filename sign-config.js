/**
 * @fileoverview Configuração centralizada dos sinais de Expansão de Domínio.
 *
 * Define metadados de cada classe de gesto (rótulo, cor, descrição, animação)
 * e exporta utilitários para consulta. Todas as estruturas de dados são
 * congeladas (Object.freeze) para garantir imutabilidade em runtime.
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  // ─── Constantes ────────────────────────────────────────────────────────────

  /** Chave utilizada para a classe "outro gesto" (fallback de segurança). */
  var OTHER_LABEL = "other";

  /**
   * Paleta de cores do tema ENCOM.
   * Centralizar aqui evita magic strings espalhadas pelo código.
   */
  var PALETTE = Object.freeze({
    cyan:    "#00E5FF",
    blue:    "#00B8D9",
    bright:  "#33F3FF",
    white:   "#00FFFF",
    neutral: "#8FA6B2",
    cyanBg:    "rgba(0, 229, 255, 0.12)",
    blueBg:    "rgba(0, 184, 217, 0.12)",
    brightBg:  "rgba(51, 243, 255, 0.12)",
    whiteBg:   "rgba(0, 255, 255, 0.12)",
    neutralBg: "rgba(143, 166, 178, 0.12)",
  });

  // ─── Definições de sinais ───────────────────────────────────────────────────

  /**
   * @typedef {object} SignMeta
   * @property {string}  key          - Chave interna do sinal (snake_case).
   * @property {string}  label        - Nome de exibição em português.
   * @property {string}  shortLabel   - Nome abreviado para espaços reduzidos.
   * @property {string}  subtitle     - Descrição de efeito curta.
   * @property {string}  description  - Descrição completa do comportamento.
   * @property {string}  accent       - Cor primária HEX.
   * @property {string}  lightAccent  - Cor de fundo semitransparente rgba.
   * @property {boolean} animated     - Indica se dispara animação 3D.
   */

  /** @type {Readonly<Record<string, SignMeta>>} */
  var SIGN_DEFINITIONS = Object.freeze({
    infinite_void: Object.freeze({
      key:         "infinite_void",
      label:       "Vazio Infinito",
      shortLabel:  "Vazio",
      subtitle:    "Resposta imersiva",
      description: "Ativa o cenário mais estável do projeto e costuma exigir menos quadros consecutivos.",
      accent:      PALETTE.cyan,
      lightAccent: PALETTE.cyanBg,
      animated:    true,
    }),

    shrine: Object.freeze({
      key:         "shrine",
      label:       "Santuário",
      shortLabel:  "Santuário",
      subtitle:    "Energia cortante",
      description: "Dispara o domínio com partículas vermelhas e leitura orientada para cortes no ambiente.",
      accent:      PALETTE.blue,
      lightAccent: PALETTE.blueBg,
      animated:    true,
    }),

    red: Object.freeze({
      key:         "red",
      label:       "Vermelho",
      shortLabel:  "Vermelho",
      subtitle:    "Pressão concentrada",
      description: "Aplica o efeito de núcleo energético com vibração visual e resposta forte no fundo 3D.",
      accent:      PALETTE.bright,
      lightAccent: PALETTE.brightBg,
      animated:    true,
    }),

    mahoraga: Object.freeze({
      key:         "mahoraga",
      label:       "Mahoraga",
      shortLabel:  "Mahoraga",
      subtitle:    "Rotação adaptativa",
      description: "Mostra o domínio com roda adaptativa e leitura de presença mais ritualística.",
      accent:      PALETTE.white,
      lightAccent: PALETTE.whiteBg,
      animated:    true,
    }),

    other: Object.freeze({
      key:         "other",
      label:       "Outro gesto",
      shortLabel:  "Outro",
      subtitle:    "Sem ativação",
      description: "Classe de segurança usada quando o gesto não é reconhecido com confiança suficiente.",
      accent:      PALETTE.neutral,
      lightAccent: PALETTE.neutralBg,
      animated:    false,
    }),
  });

  /**
   * Ordem canônica das classes — deve refletir a saída do modelo treinado.
   * Não altere sem retreinar o modelo.
   *
   * @type {Readonly<string[]>}
   */
  var CLASS_ORDER = Object.freeze([
    "infinite_void",
    "shrine",
    "red",
    "mahoraga",
    OTHER_LABEL,
  ]);

  /**
   * Subconjunto de CLASS_ORDER que possui animação 3D associada.
   * @type {Readonly<string[]>}
   */
  var ANIMATED_SIGNS = Object.freeze(
    CLASS_ORDER.filter(function (key) {
      return SIGN_DEFINITIONS[key] && SIGN_DEFINITIONS[key].animated;
    })
  );

  // ─── Utilitários ───────────────────────────────────────────────────────────

  /**
   * Retorna os metadados de um sinal pelo seu identificador.
   * Cai no fallback neutro se a chave não for reconhecida.
   *
   * @param {string} key - Chave interna do sinal.
   * @returns {SignMeta} Objeto de metadados (nunca null/undefined).
   */
  function getSignMeta(key) {
    return (
      SIGN_DEFINITIONS[key] ||
      Object.freeze({
        key:         key || OTHER_LABEL,
        label:       key || "Desconhecido",
        shortLabel:  key || "Desconhecido",
        subtitle:    "Sem metadados",
        description: "Classe sem descrição cadastrada.",
        accent:      PALETTE.neutral,
        lightAccent: PALETTE.neutralBg,
        animated:    false,
      })
    );
  }

  /**
   * Retorna o rótulo de exibição de um sinal.
   *
   * @param {string} key - Chave interna do sinal.
   * @returns {string} Label em português.
   */
  function formatSignLabel(key) {
    return getSignMeta(key).label;
  }

  // ─── Exportação pública ────────────────────────────────────────────────────

  window.DomainExpansionSignConfig = Object.freeze({
    OTHER_LABEL:      OTHER_LABEL,
    CLASS_ORDER:      CLASS_ORDER,
    ANIMATED_SIGNS:   ANIMATED_SIGNS,
    SIGN_DEFINITIONS: SIGN_DEFINITIONS,
    PALETTE:          PALETTE,
    getSignMeta:      getSignMeta,
    formatSignLabel:  formatSignLabel,
  });
})();
