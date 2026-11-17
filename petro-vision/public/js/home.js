// Replace these placeholders with the project's public contact details.
const CONTACT_CONFIG = {
  email: "hello@petrovision.example",
  location: "Metro Manila, Philippines"
};
const API_URL = (window.PETROVISION_API_URL || "").trim().replace(/\/$/, "");

const fuelLabels = {
  "Diesel": "Diesel",
  "Gasoline (RON 95)": "Unleaded",
  "Gasoline (RON 97)": "Premium"
};
const PHILIPPINES_CENTER = [12.8797, 121.7740];

let priceReports = [];
let homeMap;
let markerLayer;
let userLocation = null;
let selectedFuel = "";

function getThemeColor(token) {
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim();
}

function updateThemeButton() {
  const button = document.getElementById("theme-toggle");
  if (!button) return;
  const isDark = document.documentElement.dataset.theme === "dark";
  button.setAttribute("aria-pressed", String(isDark));
  button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
}

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem("petrovision-theme", theme);
  } catch (error) {
    console.warn("Could not save the selected theme.", error);
  }
  updateThemeButton();
  renderMapMarkers();
}

function updateNavScrollState() {
  const navbar = document.querySelector(".home-navbar");
  if (navbar) navbar.classList.toggle("is-scrolled", window.scrollY > 40);
}

function setActiveSection(section) {
  document.querySelectorAll("[data-section-link]").forEach(link => {
    link.classList.toggle("active", link.dataset.sectionLink === section);
  });
}

function initSectionNavigation() {
  const sections = ["about", "contact"]
    .map(id => document.getElementById(id))
    .filter(Boolean);
  if (!("IntersectionObserver" in window) || !sections.length) return;

  const inView = new Set();
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) inView.add(entry.target.id);
      else inView.delete(entry.target.id);
    });

    const activeSection = [...inView]
      .map(id => document.getElementById(id))
      .filter(Boolean)
      .sort((a, b) => {
        const viewportCenter = window.innerHeight / 2;
        const aCenter = a.getBoundingClientRect().top + a.getBoundingClientRect().height / 2;
        const bCenter = b.getBoundingClientRect().top + b.getBoundingClientRect().height / 2;
        return Math.abs(aCenter - viewportCenter) - Math.abs(bCenter - viewportCenter);
      })[0];
    setActiveSection(activeSection?.id || "home");
  }, { rootMargin: "-25% 0px -65% 0px", threshold: 0 });

  sections.forEach(section => observer.observe(section));
}

function closeMobileNavigation() {
  const navbar = document.querySelector(".home-navbar");
  const toggle = document.getElementById("nav-toggle");
  if (!navbar || !toggle) return;
  navbar.classList.remove("is-menu-open");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation menu");
}

function initPageControls() {
  const navbar = document.querySelector(".home-navbar");
  const menuToggle = document.getElementById("nav-toggle");
  const themeToggle = document.getElementById("theme-toggle");

  updateThemeButton();
  updateNavScrollState();
  window.addEventListener("scroll", updateNavScrollState, { passive: true });

  themeToggle?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  });

  menuToggle?.addEventListener("click", () => {
    const isOpen = navbar.classList.toggle("is-menu-open");
    menuToggle.setAttribute("aria-expanded", String(isOpen));
    menuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
  });

  document.querySelectorAll("#primary-nav a").forEach(link => {
    link.addEventListener("click", closeMobileNavigation);
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") closeMobileNavigation();
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) closeMobileNavigation();
  });
}

function updateNavigation() {
  const session = getSession();
  const loggedIn = Boolean(session?.accessToken && session?.user);
  const accountLink = document.getElementById("account-link");
  const footerAccountLink = document.getElementById("footer-account-link");
  document.querySelectorAll(".home-logo").forEach(link => {
    link.href = loggedIn ? "map.html" : "home.html";
  });
  const rewardsNav = document.getElementById("rewards-nav");
  const contributeLink = document.getElementById("contribute-link");
  const reportIssueLink = document.getElementById("report-issue-link");

  if (rewardsNav) rewardsNav.style.display = loggedIn ? "list-item" : "none";
  [accountLink, footerAccountLink].forEach(link => {
    if (!link) return;
    link.href = loggedIn ? "profile.html" : "login.html";
    link.textContent = loggedIn ? "My account" : "Login";
  });

  if (contributeLink && loggedIn) {
    contributeLink.href = "map.html";
    contributeLink.innerHTML = 'Contribute prices <span aria-hidden="true">+</span>';
  }
  if (reportIssueLink) reportIssueLink.href = loggedIn ? "map.html" : "login.html";
}

function initContactDetails() {
  const emailLink = document.getElementById("contact-email");
  const location = document.getElementById("contact-location");
  if (emailLink) {
    emailLink.href = `mailto:${CONTACT_CONFIG.email}`;
    emailLink.textContent = CONTACT_CONFIG.email;
  }
  if (location) location.textContent = CONTACT_CONFIG.location;
}

function getContactFieldError(field) {
  if (field.validity.valueMissing) return "This field is required.";
  if (field.validity.typeMismatch) return "Enter a valid email address.";
  if (field.validity.tooShort) return `Enter at least ${field.minLength} characters.`;
  if (field.validity.tooLong) return `Use no more than ${field.maxLength} characters.`;
  return "";
}

function setContactFieldError(field, errorElement) {
  const valid = field.checkValidity();
  errorElement.textContent = valid ? "" : getContactFieldError(field);
  field.setAttribute("aria-invalid", String(!valid));
  return valid;
}

function validateContactForm(fields) {
  return fields.map(({ field, error }) => setContactFieldError(field, error)).every(Boolean);
}

async function submitContactForm(message) {
  // TODO: POST to `${API_URL}/contact` after the contact endpoint is implemented.
  if (window.PETROVISION_CONTACT_API_ENABLED === true && API_URL) {
    const response = await fetch(`${API_URL}/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message)
    });
    if (!response.ok) throw new Error("The contact service could not send your message.");
    return { type: "sent" };
  }

  const subject = `PetroVision contact: ${message.subject}`;
  const body = [
    `Name: ${message.name}`,
    `Email: ${message.email}`,
    `Subject: ${message.subject}`,
    "",
    message.message
  ].join("\n");
  const href = `mailto:${CONTACT_CONFIG.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  return { type: "mailto", href };
}

function initContactForm() {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const submitButton = document.getElementById("contact-submit");
  const retryButton = document.getElementById("contact-retry");
  const status = document.getElementById("contact-status");
  const confirmation = document.getElementById("contact-confirmation");
  const confirmationTitle = document.getElementById("confirmation-title");
  const confirmationMessage = document.getElementById("confirmation-message");
  const mailtoLink = document.getElementById("mailto-draft-link");
  const sendAnotherLink = document.getElementById("send-another-link");
  const messageField = document.getElementById("contact-message");
  const messageCount = document.getElementById("message-count");
  const honeypot = document.getElementById("contact-website");
  const fields = [
    { field: document.getElementById("contact-name"), error: document.getElementById("contact-name-error") },
    { field: document.getElementById("contact-email-input"), error: document.getElementById("contact-email-error") },
    { field: document.getElementById("contact-subject"), error: document.getElementById("contact-subject-error") },
    { field: messageField, error: document.getElementById("contact-message-error") }
  ];

  fields.forEach(({ field, error }) => {
    field.addEventListener("input", () => {
      if (field.getAttribute("aria-invalid") === "true") setContactFieldError(field, error);
    });
    field.addEventListener("change", () => {
      if (field.getAttribute("aria-invalid") === "true") setContactFieldError(field, error);
    });
    field.addEventListener("blur", () => {
      if (field.value) setContactFieldError(field, error);
    });
  });

  messageField.addEventListener("input", () => {
    messageCount.textContent = `${messageField.value.length}/500`;
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    status.classList.remove("is-error");
    status.textContent = "";
    retryButton.hidden = true;

    const isValid = validateContactForm(fields);
    if (!isValid) {
      form.reportValidity();
      fields.find(({ field }) => !field.validity.valid)?.field.focus();
      return;
    }

    if (honeypot.value.trim()) {
      status.classList.add("is-error");
      status.textContent = "Unable to prepare the message. Please try again.";
      retryButton.hidden = false;
      return;
    }

    const message = Object.fromEntries(new FormData(form).entries());
    delete message.website;
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    status.textContent = "Sending...";

    try {
      const result = await submitContactForm(message);
      form.hidden = true;
      confirmation.hidden = false;
      if (result.type === "sent") {
        confirmationTitle.textContent = "Thanks for reaching out.";
        confirmationMessage.textContent = "Your message has been sent.";
        mailtoLink.hidden = true;
      } else {
        confirmationTitle.textContent = "Your message is ready.";
        confirmationMessage.textContent = "Open the email draft below to send your message.";
        mailtoLink.href = result.href;
        mailtoLink.hidden = false;
      }
      confirmationTitle.focus();
    } catch (error) {
      console.error("Could not submit the contact message.", error);
      status.classList.add("is-error");
      status.textContent = "We couldn't send your message. Please try again.";
      retryButton.hidden = false;
    } finally {
      if (!form.hidden) {
        submitButton.disabled = false;
        submitButton.textContent = "Send message";
      }
    }
  });

  retryButton.addEventListener("click", () => form.requestSubmit());
  sendAnotherLink.addEventListener("click", event => {
    event.preventDefault();
    form.reset();
    fields.forEach(({ field, error }) => {
      field.setAttribute("aria-invalid", "false");
      error.textContent = "";
    });
    messageCount.textContent = "0/500";
    status.classList.remove("is-error");
    status.textContent = "";
    retryButton.hidden = true;
    confirmation.hidden = true;
    form.hidden = false;
    submitButton.disabled = false;
    submitButton.textContent = "Send message";
    fields[0].field.focus();
  });
}

function validPriceReports(stations) {
  const uniqueStations = Array.from(new Map(stations.map(station => [station.id, station])).values());
  return uniqueStations.flatMap(station => (station.priceReports || []).map(report => {
    const rawLat = station.lat ?? station.latitude;
    const rawLng = station.lng ?? station.longitude;
    const lat = rawLat === null || rawLat === undefined || rawLat === "" ? null : Number(rawLat);
    const lng = rawLng === null || rawLng === undefined || rawLng === "" ? null : Number(rawLng);
    return {
      ...report,
      stationId: station.id,
      name: station.name,
      city: station.city || station.address,
      lat: Number.isFinite(lat) && lat >= -90 && lat <= 90 ? lat : null,
      lng: Number.isFinite(lng) && lng >= -180 && lng <= 180 ? lng : null,
      reportedAt: report.reportedAt || report.date || ""
    };
  })).filter(report => Number.isFinite(Number(report.price)) && Number(report.price) > 0);
}

function reportTimestamp(report) {
  const timestamp = Date.parse(report.reportedAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function formatPrice(price) {
  return `₱${Number(price).toFixed(2)}`;
}

function formatRelativeTime(timestamp) {
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} days ago`;
  return new Date(timestamp).toLocaleDateString();
}

function getLatestTimestamp() {
  return priceReports.reduce((latest, report) => {
    const timestamp = reportTimestamp(report);
    return timestamp && (!latest || timestamp > latest) ? timestamp : latest;
  }, null);
}

function updateStat(id, value) {
  const element = document.getElementById(id);
  const isEmpty = !value;
  element.textContent = value || "No data yet";
  element.classList.toggle("is-empty", isEmpty);
}

function renderStats() {
  const diesel = priceReports
    .filter(report => report.fuelType === "Diesel")
    .reduce((lowest, report) => !lowest || Number(report.price) < Number(lowest.price) ? report : lowest, null);
  const gasoline = priceReports
    .filter(report => report.fuelType === "Gasoline (RON 95)" || report.fuelType === "Gasoline (RON 97)")
    .reduce((lowest, report) => !lowest || Number(report.price) < Number(lowest.price) ? report : lowest, null);
  const stations = new Set(priceReports.map(report => report.stationId));
  const latest = getLatestTimestamp();

  updateStat("stat-diesel", diesel ? `${formatPrice(diesel.price)}/L` : "");
  updateStat("stat-gasoline", gasoline ? `${formatPrice(gasoline.price)}/L` : "");
  updateStat("stat-stations", stations.size ? String(stations.size) : "");
  updateStat("stat-updated", latest ? formatRelativeTime(latest) : "");
}

function getDistanceKm(report) {
  if (!userLocation || report.lat === null || report.lng === null) return null;
  const radians = degrees => degrees * Math.PI / 180;
  const latitudeDelta = radians(report.lat - userLocation.lat);
  const longitudeDelta = radians(report.lng - userLocation.lng);
  const arc = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(userLocation.lat)) * Math.cos(radians(report.lat))
    * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(arc), Math.sqrt(1 - arc));
}

function formatDistance(report) {
  const distance = getDistanceKm(report);
  if (distance === null) return "—";
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
}

function renderLoadingRows() {
  document.getElementById("price-table-body").innerHTML = Array.from({ length: 5 }, () => `
    <tr class="skeleton-row" aria-hidden="true">
      <td><span class="skeleton skeleton-station"></span></td>
      <td><span class="skeleton skeleton-fuel"></span></td>
      <td><span class="skeleton skeleton-price"></span></td>
      <td><span class="skeleton skeleton-short"></span></td>
      <td><span class="skeleton skeleton-short"></span></td>
    </tr>
  `).join("");
  document.getElementById("price-load-status").textContent = "Loading fuel prices";
}

function renderTable() {
  const query = document.getElementById("station-search").value.trim().toLocaleLowerCase();
  const lowestByFuel = new Map();
  priceReports.forEach(report => {
    const currentLowest = lowestByFuel.get(report.fuelType);
    if (!currentLowest || Number(report.price) < currentLowest) {
      lowestByFuel.set(report.fuelType, Number(report.price));
    }
  });

  const visible = priceReports
    .filter(report => !selectedFuel || report.fuelType === selectedFuel)
    .filter(report => !query || `${report.name} ${report.city || ""} ${report.fuelType}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => Number(a.price) - Number(b.price));
  const tableBody = document.getElementById("price-table-body");
  const loadStatus = document.getElementById("price-load-status");

  if (!visible.length) {
    const isFiltered = Boolean(priceReports.length);
    const loggedIn = Boolean(getSession()?.user);
    tableBody.innerHTML = `
      <tr class="table-message-row">
        <td colspan="5">
          <div class="table-message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V6.5A2.5 2.5 0 0 1 6.5 4H15v16H4Z"/><path d="M15 8h3l2 2v10h-5M8 8h3m-3 4h3m-3 4h3m8-3v.01"/></svg>
            <strong>${isFiltered ? "No matching prices" : "No approved prices yet"}</strong>
            <span>${isFiltered
              ? "Try another fuel type or search."
              : "Approved community reports will appear here when available."}</span>
            ${!isFiltered
              ? `<a href="${loggedIn ? "map.html" : "login.html"}">${loggedIn ? "Contribute prices" : "Sign in to contribute"} <span aria-hidden="true">→</span></a>`
              : ""}
          </div>
        </td>
      </tr>
    `;
    loadStatus.textContent = isFiltered ? "No matching prices" : "No approved prices yet";
    return;
  }

  tableBody.innerHTML = visible.map(report => {
    const isLowest = Number(report.price) === lowestByFuel.get(report.fuelType);
    const timestamp = reportTimestamp(report);
    const initial = escapeHtml(String(report.name || "P").trim().charAt(0).toLocaleUpperCase());
    return `
      <tr>
        <td class="station-cell">
          <span class="station-initial" aria-hidden="true">${initial}</span>
          <span class="station-details">
            <strong>${escapeHtml(report.name || "Fuel station")}</strong>
            <span>${escapeHtml(report.city || "Location not listed")}</span>
          </span>
        </td>
        <td><span class="fuel-pill">${escapeHtml(fuelLabels[report.fuelType] || report.fuelType || "Fuel")}</span></td>
        <td class="numeric-cell price-cell">
          <strong>${formatPrice(report.price)}</strong>
          ${isLowest ? '<span class="lowest-badge">Lowest</span>' : ""}
        </td>
        <td class="numeric-cell distance-cell">${formatDistance(report)}</td>
        <td class="updated-cell">${timestamp ? escapeHtml(formatRelativeTime(timestamp)) : "—"}</td>
      </tr>
    `;
  }).join("");
  loadStatus.textContent = `${visible.length} fuel ${visible.length === 1 ? "price" : "prices"} shown`;
}

function initMap() {
  const element = document.getElementById("home-map");
  if (!element || typeof L === "undefined") return;

  homeMap = L.map(element, { scrollWheelZoom: false }).setView(PHILIPPINES_CENTER, 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 18,
    updateWhenIdle: true,
    updateWhenZooming: false,
    keepBuffer: 4,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(homeMap);
  markerLayer = L.layerGroup().addTo(homeMap);
}

function renderMapMarkers() {
  if (!homeMap || !markerLayer) return;
  markerLayer.clearLayers();
  const groupedStations = new Map();

  priceReports.filter(report => report.lat !== null && report.lng !== null).forEach(report => {
    const key = report.stationId || `${report.lat},${report.lng},${report.name}`;
    if (!groupedStations.has(key)) groupedStations.set(key, { ...report, reports: [] });
    groupedStations.get(key).reports.push(report);
  });

  groupedStations.forEach(station => {
    const reportDetails = station.reports.map(report =>
      `${escapeHtml(fuelLabels[report.fuelType] || report.fuelType)} · ${formatPrice(report.price)}/L`
    ).join("<br>");
    L.circleMarker([station.lat, station.lng], {
      radius: 7,
      color: getThemeColor("--surface"),
      weight: 2,
      fillColor: getThemeColor("--navy"),
      fillOpacity: 0.95
    }).bindPopup(`
      <strong>${escapeHtml(station.name || "Fuel station")}</strong><br>
      ${escapeHtml(station.city || "Location not listed")}<br>
      ${reportDetails}
    `).addTo(markerLayer);
  });
}

function showLoadError() {
  document.getElementById("price-table-body").innerHTML = `
    <tr class="table-message-row">
      <td colspan="5">
        <div class="table-message error-message">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2.8 19h18.4L12 3Z"/><path d="M12 9v4m0 3v.01"/></svg>
          <strong>Unable to load prices.</strong>
          <span>Check your connection and try again.</span>
          <button type="button" class="retry-button" id="retry-prices">Retry</button>
        </div>
      </td>
    </tr>
  `;
  document.getElementById("price-load-status").textContent = "Unable to load fuel prices";
  document.getElementById("retry-prices").addEventListener("click", loadPrices);
}

async function loadPrices() {
  const refreshButton = document.getElementById("refresh-prices");
  refreshButton.disabled = true;
  renderLoadingRows();

  try {
    const stations = await getPublicStations();
    priceReports = validPriceReports(stations);
    renderStats();
    renderTable();
    renderMapMarkers();
  } catch (error) {
    console.error("Could not load public fuel prices.", error);
    if (!priceReports.length) renderStats();
    showLoadError();
  } finally {
    refreshButton.disabled = false;
  }
}

function locateUser() {
  const status = document.getElementById("location-status");
  const button = document.getElementById("locate-me");
  if (!navigator.geolocation) {
    status.textContent = "Location is not available in this browser.";
    return;
  }

  button.disabled = true;
  status.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(position => {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    if (homeMap) homeMap.setView([userLocation.lat, userLocation.lng], 11);
    renderTable();
    status.textContent = "Distances are shown from your location.";
    button.disabled = false;
  }, error => {
    console.warn("Could not get the user's location.", error);
    status.textContent = "Location unavailable. Allow location access to see distances.";
    button.disabled = false;
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
}

document.addEventListener("DOMContentLoaded", () => {
  initPageControls();
  updateNavigation();
  initSectionNavigation();
  initContactDetails();
  initContactForm();
  document.querySelectorAll(".fuel-tab").forEach(button => {
    button.addEventListener("click", () => {
      selectedFuel = button.dataset.fuel || "";
      document.querySelectorAll(".fuel-tab").forEach(tab => {
        const active = tab === button;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-pressed", String(active));
      });
      renderTable();
    });
  });
  document.getElementById("station-search").addEventListener("input", renderTable);
  document.getElementById("refresh-prices").addEventListener("click", loadPrices);
  document.getElementById("locate-me").addEventListener("click", locateUser);
  initMap();
  loadPrices();
  window.setInterval(() => {
    const latest = getLatestTimestamp();
    if (latest) updateStat("stat-updated", formatRelativeTime(latest));
  }, 60000);
});
