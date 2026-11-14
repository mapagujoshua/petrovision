(() => {
  const THEME_KEY = "petrovision-theme";
  const PRIMARY_LINKS = [
    { href: "map.html", label: "Map" },
    { href: "trip-estimator.html", label: "Trip Cost" },
    { href: "history.html", label: "History" },
    { href: "rewards.html", label: "Rewards" }
  ];
  const MORE_LINKS = [
    { href: "garage.html", label: "Garage" },
    { href: "alerts.html", label: "Alerts" },
    { href: "availability.html", label: "Availability" },
    { href: "home.html#about", label: "About" },
    { href: "home.html#contact", label: "Contact" }
  ];
  const ACCOUNT_LINKS = [
    { href: "profile.html", label: "Profile" },
    { href: "garage.html", label: "Garage" },
    { href: "alerts.html", label: "Alerts" },
    { href: "availability.html", label: "Availability" }
  ];

  function escapeMarkup(value) {
    return String(value).replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function preferredTheme() {
    try {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
    } catch (error) {
      console.warn("Could not read the saved PetroVision theme.", error);
    }
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    const toggle = document.getElementById("pv-theme-toggle");
    if (toggle) {
      const isDark = theme === "dark";
      toggle.setAttribute("aria-pressed", String(isDark));
      toggle.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      console.warn("Could not save the selected PetroVision theme.", error);
    }
  }

  document.documentElement.dataset.theme = preferredTheme();

  function activeHref(href) {
    const target = new URL(href, window.location.href);
    return target.pathname.toLowerCase() === window.location.pathname.toLowerCase()
      && (!target.hash || target.hash === window.location.hash);
  }

  function isMoreActive() {
    return MORE_LINKS.some(item => activeHref(item.href));
  }

  function renderLink(item, className = "pv-nav-link", role = "") {
    const active = activeHref(item.href);
    const current = active ? ' aria-current="page"' : "";
    const menuRole = role ? ` role="${role}"` : "";
    const activeClass = active ? " is-active" : "";
    return `<a class="${className}${activeClass}" href="${item.href}"${current}${menuRole}>${item.label}</a>`;
  }

  function menuItems(items) {
    return items.map(item => renderLink(item, "pv-menu-item", "menuitem")).join("");
  }

  function renderNavigation(username) {
    const currentMore = isMoreActive();
    const initial = username.charAt(0).toUpperCase() || "U";
    const primaryLinks = PRIMARY_LINKS.map(item => renderLink(item)).join("");
    const moreLinks = menuItems(MORE_LINKS);
    const accountLinks = menuItems(ACCOUNT_LINKS);
    const mobilePrimaryLinks = PRIMARY_LINKS.map(item => renderLink(item, "pv-drawer-link")).join("");
    const mobileMoreLinks = MORE_LINKS
      .filter(item => item.href.startsWith("home.html#"))
      .map(item => renderLink(item, "pv-drawer-link"))
      .join("");
    const mobileAccountLinks = ACCOUNT_LINKS.map(item => renderLink(item, "pv-drawer-link")).join("");

    return `
      <header class="pv-nav-shell">
        <div class="pv-nav-inner">
          <a class="pv-nav-logo" href="map.html" aria-label="PetroVision Map">
            Petro<span>Vision</span>
          </a>
          <nav class="pv-nav-primary" aria-label="Main navigation">
            ${primaryLinks}
            <div class="pv-nav-dropdown">
              <button class="pv-nav-link pv-nav-dropdown-toggle${currentMore ? " is-active" : ""}" id="pv-more-toggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="pv-more-menu">
                More
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
              </button>
              <div class="pv-nav-menu" id="pv-more-menu" role="menu" aria-label="More pages" hidden>
                ${moreLinks}
              </div>
            </div>
          </nav>
          <div class="pv-nav-actions">
            <button class="pv-icon-button pv-theme-toggle" id="pv-theme-toggle" type="button" aria-label="Switch to dark mode" aria-pressed="false">
              <svg class="pv-icon pv-icon-sun" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></svg>
              <svg class="pv-icon pv-icon-moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.2 15.5A8.5 8.5 0 0 1 8.5 3.8 8.5 8.5 0 1 0 20.2 15.5Z"/></svg>
            </button>
            <a class="pv-icon-button pv-alert-link" href="alerts.html" aria-label="Alerts">
              <svg class="pv-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></svg>
              <span class="pv-alert-dot" data-alert-dot hidden aria-hidden="true"></span>
            </a>
            <div class="pv-nav-dropdown pv-profile-dropdown">
              <button class="pv-profile-toggle" id="pv-profile-toggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-controls="pv-profile-menu">
                <span class="pv-avatar" aria-hidden="true">${initial}</span>
                <span class="pv-profile-name">${escapeMarkup(username)}</span>
                <svg class="pv-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5"/></svg>
              </button>
              <div class="pv-nav-menu pv-profile-menu" id="pv-profile-menu" role="menu" aria-label="Profile menu" hidden>
                ${accountLinks}
                <button class="pv-menu-item" type="button" role="menuitem" data-logout>Log out</button>
              </div>
            </div>
          </div>
          <button class="pv-mobile-toggle" id="pv-mobile-toggle" type="button" aria-label="Open navigation menu" aria-controls="pv-mobile-drawer" aria-expanded="false">
            <svg class="pv-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          </button>
        </div>
        <div class="pv-nav-drawer" id="pv-mobile-drawer" role="region" aria-label="Mobile navigation" hidden>
          <div class="pv-nav-drawer-inner">
            <section class="pv-drawer-group" aria-labelledby="pv-drawer-main-title">
              <h2 id="pv-drawer-main-title">Main</h2>
              ${mobilePrimaryLinks}
            </section>
            <section class="pv-drawer-group" aria-labelledby="pv-drawer-account-title">
              <h2 id="pv-drawer-account-title">Account</h2>
              ${mobileAccountLinks}
              ${mobileMoreLinks}
              <button class="pv-drawer-link pv-drawer-logout" type="button" data-logout>Log out</button>
            </section>
          </div>
        </div>
      </header>
    `;
  }

  function initializeNavigation() {
    const mount = document.getElementById("app-nav");
    if (!mount) return;

    const session = typeof getSession === "function" ? getSession() : null;
    const username = session?.user?.displayName?.trim()
      || session?.user?.email?.split("@")[0]
      || "Account";
    mount.innerHTML = renderNavigation(username);

    const moreToggle = document.getElementById("pv-more-toggle");
    const moreMenu = document.getElementById("pv-more-menu");
    const profileToggle = document.getElementById("pv-profile-toggle");
    const profileMenu = document.getElementById("pv-profile-menu");
    const mobileToggle = document.getElementById("pv-mobile-toggle");
    const drawer = document.getElementById("pv-mobile-drawer");
    const menuPairs = [[moreToggle, moreMenu], [profileToggle, profileMenu]];

    function closeMenu(trigger, menu, restoreFocus = false) {
      if (menu.hidden) return;
      menu.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
      if (restoreFocus) trigger.focus();
    }

    function closeMenus(except) {
      menuPairs.forEach(([trigger, menu]) => {
        if (menu !== except) closeMenu(trigger, menu);
      });
    }

    function openMenu(trigger, menu) {
      closeMenus(menu);
      menu.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
    }

    function toggleMenu(trigger, menu) {
      if (menu.hidden) openMenu(trigger, menu);
      else closeMenu(trigger, menu);
    }

    function focusMenuItem(menu, index) {
      const items = [...menu.querySelectorAll('[role="menuitem"]')];
      if (items.length) items[(index + items.length) % items.length].focus();
    }

    menuPairs.forEach(([trigger, menu]) => {
      trigger.addEventListener("click", () => toggleMenu(trigger, menu));
      trigger.addEventListener("keydown", event => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        openMenu(trigger, menu);
        focusMenuItem(menu, event.key === "ArrowUp" ? -1 : 0);
      });
      menu.addEventListener("keydown", event => {
        const items = [...menu.querySelectorAll('[role="menuitem"]')];
        const currentIndex = items.indexOf(document.activeElement);
        if (event.key === "Escape") {
          event.preventDefault();
          closeMenu(trigger, menu, true);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          focusMenuItem(menu, currentIndex + 1);
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          focusMenuItem(menu, currentIndex - 1);
        } else if (event.key === "Home") {
          event.preventDefault();
          focusMenuItem(menu, 0);
        } else if (event.key === "End") {
          event.preventDefault();
          focusMenuItem(menu, items.length - 1);
        }
      });
      menu.addEventListener("click", event => {
        if (event.target.closest('[role="menuitem"]')) closeMenu(trigger, menu);
      });
    });

    function closeDrawer(restoreFocus = false) {
      if (drawer.hidden) return;
      drawer.hidden = true;
      mobileToggle.setAttribute("aria-expanded", "false");
      mobileToggle.setAttribute("aria-label", "Open navigation menu");
      if (restoreFocus) mobileToggle.focus();
    }

    mobileToggle.addEventListener("click", () => {
      const shouldOpen = drawer.hidden;
      closeMenus();
      drawer.hidden = !shouldOpen;
      mobileToggle.setAttribute("aria-expanded", String(shouldOpen));
      mobileToggle.setAttribute("aria-label", shouldOpen ? "Close navigation menu" : "Open navigation menu");
    });
    drawer.addEventListener("click", event => {
      if (event.target.closest("a")) closeDrawer();
    });

    document.addEventListener("pointerdown", event => {
      menuPairs.forEach(([trigger, menu]) => {
        if (!trigger.contains(event.target) && !menu.contains(event.target)) closeMenu(trigger, menu);
      });
      if (!drawer.hidden && !drawer.contains(event.target) && !mobileToggle.contains(event.target)) closeDrawer();
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      const openPair = menuPairs.find(([, menu]) => !menu.hidden);
      if (openPair) closeMenu(openPair[0], openPair[1], true);
      else closeDrawer(true);
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth > 900) closeDrawer();
    });
    window.addEventListener("scroll", () => {
      mount.querySelector(".pv-nav-shell")?.classList.toggle("is-scrolled", window.scrollY > 0);
    }, { passive: true });

    document.getElementById("pv-theme-toggle").addEventListener("click", () => {
      setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
    });

    mount.querySelectorAll("[data-logout]").forEach(button => {
      button.addEventListener("click", async () => {
        closeMenus();
        closeDrawer();
        if (typeof signOut !== "function") {
          console.error("The PetroVision sign-out helper is unavailable.");
          return;
        }
        try {
          await signOut();
        } catch (error) {
          console.error("The API logout request failed.", error);
        } finally {
          window.location.href = "login.html";
        }
      });
    });

    const alertDots = mount.querySelectorAll("[data-alert-dot]");
    function setAlertsExist(exists) {
      alertDots.forEach(dot => { dot.hidden = !exists; });
    }

    const alertList = document.getElementById("alert-list");
    if (alertList && "MutationObserver" in window) {
      const observer = new MutationObserver(() => {
        setAlertsExist(Boolean(alertList.querySelector(".card")));
      });
      observer.observe(alertList, { childList: true, subtree: true });
    }
    if (typeof getAlerts === "function") {
      getAlerts().then(alerts => {
        if (!Array.isArray(alerts)) {
          console.error("The alerts endpoint returned an unexpected response.");
          return;
        }
        setAlertsExist(alerts.length > 0);
      }).catch(error => {
        console.warn("Could not load alert status for the navigation.", error);
      });
    }

    setTheme(document.documentElement.dataset.theme);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeNavigation, { once: true });
  } else {
    initializeNavigation();
  }
})();
