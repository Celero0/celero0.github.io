// ============================================================
//  Swipe horizontal (derecha) para volver atrás en móvil.
//  - Sin dependencias.
//  - Solo dispositivos táctiles.
//  - No interfiere con el scroll horizontal (bloques de código).
//  - No interfiere con el gesto nativo de borde del navegador.
// ============================================================
(function () {
  "use strict";

  if (!("ontouchstart" in window)) return;

  var MIN_DISTANCE = 90; // px horizontales mínimos
  var MAX_VERTICAL = 60; // px de desviación vertical máxima
  var EDGE = 40;         // px de borde izquierdo que dejamos al gesto nativo

  var startX = 0;
  var startY = 0;
  var tracking = false;
  var allowed = false;

  function horizontallyScrollable(el) {
    while (el && el !== document.body && el !== document.documentElement) {
      var style = window.getComputedStyle(el);
      if (/(auto|scroll)/.test(style.overflowX) && el.scrollWidth > el.clientWidth) {
        return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function onStart(e) {
    if (e.touches.length !== 1) {
      tracking = false;
      return;
    }

    var t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    tracking = true;
    allowed = true;

    // Deja pasar el gesto nativo de borde.
    if (startX < EDGE) {
      allowed = false;
      return;
    }

    // No romper el scroll horizontal de tablas/bloques de código.
    if (horizontallyScrollable(e.target)) {
      allowed = false;
    }
  }

  function onMove(e) {
    if (!tracking || !allowed || e.touches.length !== 1) return;

    var t = e.touches[0];
    var dx = t.clientX - startX;
    var dy = t.clientY - startY;

    // Si domina el eje vertical, no es un swipe de navegación.
    if (Math.abs(dy) > Math.abs(dx)) {
      allowed = false;
      return;
    }

    if (dx > MIN_DISTANCE && Math.abs(dy) < MAX_VERTICAL) {
      tracking = false;
      allowed = false;
      if (window.history.length > 1) {
        window.history.back();
      }
    }
  }

  function onEnd() {
    tracking = false;
    allowed = false;
  }

  document.addEventListener("touchstart", onStart, { passive: true });
  document.addEventListener("touchmove", onMove, { passive: true });
  document.addEventListener("touchend", onEnd, { passive: true });
  document.addEventListener("touchcancel", onEnd, { passive: true });
})();
