/**
 * @fileoverview Componentes globais de UI injetados em todas as páginas.
 *
 * Responsável por montar:
 *  - Rodapé com crédito e link do portfólio.
 *  - Botão flutuante de WhatsApp.
 *  - Tooltip de atalhos de teclado (tecla ?) .
 *
 * Garante idempotência: cada componente é inserido apenas uma vez,
 * verificando a existência no DOM antes de inserir.
 *
 * @author Matheus Siqueira <https://www.matheussiqueira.dev/>
 */

(function () {
  "use strict";

  // ─── Rodapé ───────────────────────────────────────────────────────────────

  /**
   * Cria o elemento <footer> com crédito ao autor.
   * @returns {HTMLElement}
   */
  function createFooter() {
    var footer = document.createElement("footer");
    footer.className = "system-footer fade-in";
    footer.setAttribute("role", "contentinfo");
    footer.innerHTML =
      'Desenvolvido por <strong>Matheus Siqueira</strong>' +
      '&nbsp;&mdash;&nbsp;' +
      '<a href="https://www.matheussiqueira.dev/" target="_blank" rel="noreferrer noopener"' +
      ' aria-label="Portfólio de Matheus Siqueira (abre em nova aba)">' +
      'matheussiqueira.dev' +
      '</a>';
    return footer;
  }

  // ─── Botão WhatsApp ───────────────────────────────────────────────────────

  /**
   * Cria o botão flutuante de contato via WhatsApp.
   * @returns {HTMLAnchorElement}
   */
  function createWhatsAppButton() {
    var link = document.createElement("a");
    link.className  = "whatsapp-fab";
    link.href       = "https://wa.me/5581999203683";
    link.target     = "_blank";
    link.rel        = "noreferrer noopener";
    link.setAttribute("aria-label", "Entrar em contato pelo WhatsApp (abre em nova aba)");
    link.setAttribute("title",      "Falar no WhatsApp");
    link.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" width="24" height="24">' +
        '<path fill="currentColor" d="M19.11 4.93A9.77 9.77 0 0 0 12.16 2 9.87 9.87 0 0 0 ' +
        '3.63 16.9L2 22l5.26-1.58A9.85 9.85 0 0 0 12.16 22a9.86 9.86 0 0 0 6.95-16.99Zm' +
        '-6.95 15.4a8.18 8.18 0 0 1-4.16-1.14l-.3-.18-3.12.94.96-3.04-.2-.31a8.2 8.2 0 0 ' +
        '1-1.26-4.37 8.09 8.09 0 0 1 8.08-8.08 8.04 8.04 0 0 1 5.73 2.38 8.07 8.07 0 0 ' +
        '1-5.73 13.8Zm4.43-6.03c-.24-.12-1.4-.7-1.62-.78-.22-.08-.38-.12-.54.12-.16.24-.62' +
        '.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.17-.71-.63-1.19-1.4-1.33-' +
        '1.63-.14-.24-.02-.36.1-.48.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-' +
        '.02-.42-.06-.12-.54-1.3-.74-1.77-.19-.46-.39-.4-.54-.41l-.46-.01c-.16 0-.42.06-.64' +
        '.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.24 1.02.38 ' +
        '1.37.48.58.18 1.1.16 1.51.1.46-.07 1.4-.58 1.6-1.14.2-.56.2-1.04.14-1.14-.06-.1-' +
        '.22-.16-.46-.28Z"/>' +
      '</svg>';
    return link;
  }

  // ─── Tooltip de atalhos de teclado ────────────────────────────────────────

  /**
   * Detecta em qual página estamos para montar a lista correta de atalhos.
   * @returns {'monitor'|'trainer'|'other'}
   */
  function detectPage() {
    if (document.getElementById("mirrorToggle"))  return "monitor";
    if (document.getElementById("collectClass"))  return "trainer";
    return "other";
  }

  /**
   * Define os atalhos disponíveis por contexto de página.
   * @param {'monitor'|'trainer'|'other'} page
   * @returns {Array<{key: string, desc: string}>}
   */
  function getShortcuts(page) {
    var common = [
      { key: "Shift+P", desc: "Abrir / fechar monitor de performance (FPS, memória, tensores)" },
    ];

    var monitorShortcuts = [
      { key: "M",       desc: "Alternar espelhamento de câmera"  },
      { key: "L",       desc: "Mostrar / ocultar landmarks"      },
      { key: "H",       desc: "Pausar / retomar histórico"       },
      { key: "R",       desc: "Resetar monitoramento"            },
    ];

    var trainerShortcuts = [
      { key: "C",       desc: "Iniciar coleta de amostras"       },
      { key: "S",       desc: "Parar coleta"                     },
      { key: "P",       desc: "Ativar / pausar previsão ao vivo" },
    ];

    if (page === "monitor") return monitorShortcuts.concat(common);
    if (page === "trainer") return trainerShortcuts.concat(common);
    return common;
  }

  /**
   * Cria e injeta o modal de atalhos de teclado.
   */
  function createShortcutsModal() {
    var page      = detectPage();
    var shortcuts = getShortcuts(page);

    if (!shortcuts.length) return;

    // Botão flutuante "?"
    var btn = document.createElement("button");
    btn.className         = "shortcuts-fab";
    btn.setAttribute("aria-label",    "Ver atalhos de teclado");
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("title",         "Atalhos de teclado");
    btn.textContent = "?";
    btn.style.cssText = [
      "position:fixed",
      "bottom:72px",
      "right:72px",
      "z-index:8500",
      "width:34px",
      "height:34px",
      "border-radius:50%",
      "border:1px solid rgba(0,229,255,0.32)",
      "background:rgba(1,3,6,0.88)",
      "color:#00e5ff",
      "font-family:Orbitron,sans-serif",
      "font-size:0.92rem",
      "font-weight:700",
      "cursor:pointer",
      "display:flex",
      "align-items:center",
      "justify-content:center",
    ].join(";");

    // Modal
    var modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", "Atalhos de teclado");
    modal.style.cssText = [
      "display:none",
      "position:fixed",
      "inset:0",
      "z-index:8600",
      "align-items:center",
      "justify-content:center",
      "background:rgba(0,0,0,0.72)",
    ].join(";");

    var panel = document.createElement("div");
    panel.style.cssText = [
      "padding:24px 28px",
      "border:1px solid rgba(0,229,255,0.28)",
      "border-radius:14px",
      "background:rgba(2,5,10,0.96)",
      "color:#e6ffff",
      "font-family:Rajdhani,sans-serif",
      "max-width:420px",
      "width:90vw",
    ].join(";");

    var title = document.createElement("h2");
    title.style.cssText = [
      "font-family:Orbitron,sans-serif",
      "font-size:1rem",
      "letter-spacing:0.12em",
      "text-transform:uppercase",
      "color:#00e5ff",
      "margin:0 0 16px",
    ].join(";");
    title.textContent = "Atalhos de Teclado";

    var list = document.createElement("dl");
    list.style.cssText = "margin:0; display:grid; gap:10px;";

    for (var i = 0; i < shortcuts.length; i++) {
      var pair = document.createElement("div");
      pair.style.cssText = "display:flex; align-items:baseline; gap:12px;";

      var dt = document.createElement("dt");
      dt.style.cssText = [
        "min-width:96px",
        "padding:2px 8px",
        "border:1px solid rgba(0,229,255,0.28)",
        "border-radius:6px",
        "background:rgba(0,229,255,0.08)",
        "color:#00e5ff",
        "font-family:Orbitron,monospace,sans-serif",
        "font-size:0.78rem",
        "font-weight:700",
        "letter-spacing:0.06em",
        "text-align:center",
        "white-space:nowrap",
      ].join(";");
      dt.textContent = shortcuts[i].key;

      var dd = document.createElement("dd");
      dd.style.cssText = "margin:0; font-size:0.9rem; font-weight:600; color:rgba(230,255,255,0.8);";
      dd.textContent = shortcuts[i].desc;

      pair.appendChild(dt);
      pair.appendChild(dd);
      list.appendChild(pair);
    }

    var closeBtn = document.createElement("button");
    closeBtn.textContent = "Fechar";
    closeBtn.setAttribute("aria-label", "Fechar modal de atalhos");
    closeBtn.style.cssText = [
      "margin-top:20px",
      "padding:8px 20px",
      "border:1px solid rgba(0,229,255,0.32)",
      "border-radius:8px",
      "background:transparent",
      "color:#00e5ff",
      "font-family:Rajdhani,sans-serif",
      "font-size:0.9rem",
      "font-weight:700",
      "letter-spacing:0.06em",
      "cursor:pointer",
    ].join(";");

    function openModal() {
      modal.style.display = "flex";
      closeBtn.focus();
    }

    function closeModal() {
      modal.style.display = "none";
      btn.focus();
    }

    btn.addEventListener("click", openModal);
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "?" && modal.style.display === "none") {
        openModal();
      } else if (e.key === "Escape" && modal.style.display !== "none") {
        closeModal();
      }
    });

    panel.appendChild(title);
    panel.appendChild(list);
    panel.appendChild(closeBtn);
    modal.appendChild(panel);

    document.body.appendChild(btn);
    document.body.appendChild(modal);
  }

  // ─── Montagem ─────────────────────────────────────────────────────────────

  function mountSystemUI() {
    if (!document.querySelector(".system-footer")) {
      document.body.appendChild(createFooter());
    }

    if (!document.querySelector(".whatsapp-fab")) {
      document.body.appendChild(createWhatsAppButton());
    }

    if (!document.querySelector(".shortcuts-fab")) {
      createShortcutsModal();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSystemUI, { once: true });
  } else {
    mountSystemUI();
  }
})();
