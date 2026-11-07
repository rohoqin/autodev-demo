(function () {
  "use strict";

  var STORAGE_KEY = "chenguang-theme";
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");

  function storedTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }

  function apply(theme) {
    if (theme === "dark") {
      root.setAttribute("data-theme", "dark");
    } else {
      root.removeAttribute("data-theme");
    }
    if (toggle) {
      toggle.setAttribute("aria-checked", theme === "dark" ? "true" : "false");
    }
  }

  var current = storedTheme();
  apply(current);

  if (toggle) {
    toggle.addEventListener("click", function () {
      current = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem(STORAGE_KEY, current);
      } catch (e) {}
      apply(current);
    });
  }
})();
