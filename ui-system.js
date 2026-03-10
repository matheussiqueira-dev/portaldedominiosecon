(function () {
  function createFooter() {
    const footer = document.createElement("footer");
    footer.className = "system-footer fade-in";
    footer.innerHTML =
      'Desenvolvido por Matheus Siqueira<br /><a href="https://www.matheussiqueira.dev/" target="_blank" rel="noreferrer noopener">https://www.matheussiqueira.dev/</a>';
    return footer;
  }

  function createWhatsAppButton() {
    const link = document.createElement("a");
    link.className = "whatsapp-fab";
    link.href = "https://wa.me/5581999203683";
    link.target = "_blank";
    link.rel = "noreferrer noopener";
    link.setAttribute("aria-label", "Falar no WhatsApp");
    link.innerHTML =
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M19.11 4.93A9.77 9.77 0 0 0 12.16 2 9.87 9.87 0 0 0 3.63 16.9L2 22l5.26-1.58A9.85 9.85 0 0 0 12.16 22a9.86 9.86 0 0 0 6.95-16.99Zm-6.95 15.4a8.18 8.18 0 0 1-4.16-1.14l-.3-.18-3.12.94.96-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.37 8.09 8.09 0 0 1 8.08-8.08 8.04 8.04 0 0 1 5.73 2.38 8.07 8.07 0 0 1-5.73 13.8Zm4.43-6.03c-.24-.12-1.4-.7-1.62-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.01-.37-1.92-1.17-.71-.63-1.19-1.4-1.33-1.63-.14-.24-.02-.36.1-.48.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.77-.19-.46-.39-.4-.54-.41l-.46-.01c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.69 2.58 4.1 3.62.57.24 1.02.38 1.37.48.58.18 1.1.16 1.51.1.46-.07 1.4-.58 1.6-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"/></svg>';
    return link;
  }

  function mountSystemUI() {
    if (!document.querySelector(".system-footer")) {
      document.body.appendChild(createFooter());
    }

    if (!document.querySelector(".whatsapp-fab")) {
      document.body.appendChild(createWhatsAppButton());
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountSystemUI, { once: true });
  } else {
    mountSystemUI();
  }
})();
