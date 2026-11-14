const MAP_FUELS = [
  { value: "Diesel", label: "Diesel" },
  { value: "Gasoline (RON 95)", label: "Unleaded" },
  { value: "Gasoline (RON 97)", label: "Premium" }
];
const MAP_CENTER = [12.8797, 121.7740];
const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const session = getSession();
const isAuthenticated = Boolean(session?.accessToken && session?.user);

const mapElement = document.getElementById("map");
const mapFrame = document.getElementById("map-frame");
const stationList = document.getElementById("station-list");
const stationStatus = document.getElementById("station-status");
const sidebar = document.getElementById("map-sidebar");
const reportFlow = document.getElementById("report-flow");
const reportForm = document.getElementById("report-form");
const reportHint = document.getElementById("report-hint");
const reportStatus = document.getElementById("report-status");
const reportButton = document.getElementById("report-btn");
const filterButtons = [...document.querySelectorAll(".filter-pill")];
const stationSearch = document.getElementById("station-search");
const stationSort = document.getElementById("station-sort");
const fuelSelect = document.getElementById("st-fuel");

const map = L.map("map", {
  zoomControl: false,
  zoomSnap: 1,
  scrollWheelZoom: true,
  fadeAnimation: !REDUCED_MOTION,
  zoomAnimation: !REDUCED_MOTION
}).setView(MAP_CENTER, 6);

L.control.zoom({ position: "topright" }).addTo(map);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  maxZoom: 18,
  keepBuffer: 4,
  updateWhenIdle: false
}).addTo(map);

const stationLayer = L.layerGroup().addTo(map);
let allRecords = [];
let visibleRecords = [];
let stationMarkers = new Map();
let userLocation = null;
let awaitingMapClick = false;
let pendingMarker = null;
let hasInitialView = false;
let activeFuel = "";

MAP_FUELS.forEach(fuel => {
  fuelSelect.add(new Option(fuel.value, fuel.value));
});

function fuelLabel(fuelType) {
  return MAP_FUELS.find(fuel => fuel.value === fuelType)?.label || fuelType || "Fuel";
}

function formatPrice(price) {
  return `₱${Number(price).toFixed(2)}`;
}

function getUpdatedLabel(value) {
  if (!value) return "";
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "Updated just now";
  if (minutes < 60) return `Updated ${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Updated ${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

function getStationRecords(records) {
  const groups = new Map();
  records.forEach(record => {
    const key = String(record.id);
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        name: record.name || "Fuel station",
        city: record.city || record.address || "",
        lat: Number(record.lat),
        lng: Number(record.lng),
        records: []
      });
    }
    groups.get(key).records.push(record);
  });
  return [...groups.values()].filter(station => Number.isFinite(station.lat) && Number.isFinite(station.lng));
}

function getLowestPrices(records) {
  const lowest = new Map();
  records.forEach(record => {
    const price = Number(record.price);
    if (record.fuelType && Number.isFinite(price) && price > 0) {
      lowest.set(record.fuelType, Math.min(lowest.get(record.fuelType) ?? Infinity, price));
    }
  });
  return lowest;
}

function isLowestPrice(record, lowestPrices) {
  return Math.abs(Number(record.price) - (lowestPrices.get(record.fuelType) ?? Infinity)) < 0.001;
}

function renderSkeletons() {
  stationList.setAttribute("aria-busy", "true");
  stationList.innerHTML = Array.from({ length: 4 }, () =>
    '<div class="station-skeleton" aria-hidden="true"></div>'
  ).join("");
  stationStatus.textContent = "Loading fuel prices…";
}

function renderError(error) {
  stationList.setAttribute("aria-busy", "false");
  stationStatus.textContent = "Prices could not be loaded.";
  stationList.innerHTML = `
    <div class="error-state" role="alert">
      <strong>We couldn’t load prices</strong>
      <p>${escapeHtml(error?.message || "Please try again.")}</p>
      <button class="button button-secondary button-compact" id="retry-stations" type="button">Retry</button>
    </div>
  `;
  document.getElementById("retry-stations").addEventListener("click", loadStations);
}

function renderEmptyState() {
  const noData = allRecords.length === 0;
  const title = noData ? "No prices in this area yet" : "No stations match your filters";
  const description = noData
    ? "Be the first to share a recent fuel price."
    : "Try another fuel type or search for a different area.";
  stationStatus.textContent = noData ? "No fuel prices available yet." : "No matching fuel prices.";
  stationList.innerHTML = `
    <div class="empty-state">
      <strong>${title}</strong>
      <p>${description}</p>
      <button class="button button-secondary button-compact" type="button" data-empty-report>Report a Fuel Price</button>
    </div>
  `;
  stationList.querySelector("[data-empty-report]").addEventListener("click", openReportFlow);
}

function renderStationCard(record, lowestPrices) {
  const updatedLabel = getUpdatedLabel(record.date);
  const isLowest = isLowestPrice(record, lowestPrices);
  const initial = String(record.name || "F").trim().charAt(0) || "F";
  return `
    <div class="station-list-item" role="listitem">
      <button class="station-card" type="button"
        data-station-id="${escapeHtml(String(record.id))}"
        data-fuel-type="${escapeHtml(record.fuelType || "")}"
        aria-label="View ${escapeHtml(record.name || "fuel station")}, ${escapeHtml(fuelLabel(record.fuelType))}, ${formatPrice(record.price)}">
        <span class="station-card-heading">
          <span class="station-initial" aria-hidden="true">${escapeHtml(initial)}</span>
          <span class="station-name-block">
            <span class="station-name">${escapeHtml(record.name || "Fuel station")}</span>
            <span class="station-city">${escapeHtml(record.city || record.address || "Location unavailable")}</span>
          </span>
        </span>
        <span class="station-card-price-row">
          <span class="fuel-tag">${escapeHtml(fuelLabel(record.fuelType))}</span>
          <span class="station-card-right">
            ${isLowest ? '<span class="lowest-tag">Lowest</span>' : ""}
            <span class="station-price">${formatPrice(record.price)}</span>
          </span>
        </span>
        ${updatedLabel ? `<span class="station-updated">${escapeHtml(updatedLabel)}</span>` : ""}
      </button>
    </div>
  `;
}

function haversineDistanceKm(latA, lngA, latB, lngB) {
  const radians = degrees => degrees * Math.PI / 180;
  const dLat = radians(latB - latA);
  const dLng = radians(lngB - lngA);
  const value = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(latA)) * Math.cos(radians(latB)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function getSearchText(record) {
  return `${record.name || ""} ${record.city || ""} ${record.address || ""}`.toLocaleLowerCase();
}

function getVisibleRecords() {
  const query = stationSearch.value.trim().toLocaleLowerCase();
  const reference = userLocation || map.getCenter();
  const records = allRecords
    .filter(record => !activeFuel || record.fuelType === activeFuel)
    .filter(record => !query || getSearchText(record).includes(query));

  if (stationSort.value === "newest") {
    return records.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  }
  if (stationSort.value === "nearest") {
    return records.sort((a, b) => {
      const distanceA = haversineDistanceKm(reference.lat, reference.lng, Number(a.lat), Number(a.lng));
      const distanceB = haversineDistanceKm(reference.lat, reference.lng, Number(b.lat), Number(b.lng));
      return distanceA - distanceB;
    });
  }
  return records.sort((a, b) => Number(a.price) - Number(b.price));
}

function renderList() {
  visibleRecords = getVisibleRecords();
  stationList.setAttribute("aria-busy", "false");
  if (!visibleRecords.length) {
    renderEmptyState();
    renderMarkers([]);
    return;
  }

  const lowestPrices = getLowestPrices(allRecords);
  stationStatus.textContent = `${visibleRecords.length} fuel price${visibleRecords.length === 1 ? "" : "s"}`;
  stationList.innerHTML = visibleRecords.map(record => renderStationCard(record, lowestPrices)).join("");
  renderMarkers(visibleRecords);
  bindStationCards();
}

function createStationPopup(station) {
  const allStationRecords = getStationRecords(allRecords)
    .find(item => item.id === station.id)?.records || station.records;
  const priceRows = [...allStationRecords]
    .filter(record => Number(record.price) > 0)
    .sort((a, b) => MAP_FUELS.findIndex(fuel => fuel.value === a.fuelType) - MAP_FUELS.findIndex(fuel => fuel.value === b.fuelType))
    .map(record => `
      <div class="station-popup-price">
        <span>${escapeHtml(fuelLabel(record.fuelType))}</span>
        <strong>${formatPrice(record.price)}/L</strong>
      </div>
    `).join("");
  const latest = allStationRecords
    .map(record => record.date)
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a))[0];
  const updatedLabel = getUpdatedLabel(latest);
  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${station.lat},${station.lng}`)}`;

  return `
    <div class="station-popup">
      <strong class="station-popup-title">${escapeHtml(station.name)}</strong>
      <span class="station-popup-city">${escapeHtml(station.city)}</span>
      <div class="station-popup-prices">${priceRows || '<span class="station-popup-city">No recent prices</span>'}</div>
      ${updatedLabel ? `<span class="station-popup-updated">${escapeHtml(updatedLabel)}</span>` : ""}
      <div class="station-popup-actions">
        <button type="button" data-popup-report="${escapeHtml(station.id)}">Report price</button>
        <a href="${directions}" target="_blank" rel="noopener noreferrer">Get directions</a>
      </div>
    </div>
  `;
}

function makePriceMarker(station, record, lowestPrices) {
  const lowest = isLowestPrice(record, lowestPrices);
  const icon = L.divIcon({
    className: "price-marker-host",
    html: `<span class="price-marker${lowest ? " is-lowest" : ""}">${formatPrice(record.price)}</span>`,
    iconSize: [82, 30],
    iconAnchor: [41, 15],
    popupAnchor: [0, -16]
  });
  return L.marker([station.lat, station.lng], { icon, title: `${station.name}, ${formatPrice(record.price)}` })
    .bindPopup(createStationPopup(station), { maxWidth: 320 });
}

function makeClusterMarker(stations) {
  const bounds = L.latLngBounds(stations.map(station => [station.lat, station.lng]));
  const marker = L.marker(bounds.getCenter(), {
    icon: L.divIcon({
      className: "cluster-marker-host",
      html: `<span class="cluster-marker" aria-label="${stations.length} stations">${stations.length}</span>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20]
    }),
    title: `${stations.length} fuel stations`
  });
  marker.on("click", () => {
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: !REDUCED_MOTION });
  });
  return marker;
}

function getMarkerClusters(stations) {
  if (map.getZoom() >= 10 || stations.length < 2) return stations.map(station => [station]);
  const zoom = map.getZoom();
  const cellSize = 72;
  const buckets = new Map();
  stations.forEach(station => {
    const point = map.project([station.lat, station.lng], zoom);
    const key = `${Math.floor(point.x / cellSize)}:${Math.floor(point.y / cellSize)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(station);
  });
  return [...buckets.values()];
}

function renderMarkers(records) {
  stationLayer.clearLayers();
  stationMarkers = new Map();
  if (!records.length) return;

  const lowestPrices = getLowestPrices(allRecords);
  const stations = getStationRecords(records).map(station => {
    const pricedRecords = station.records.filter(record => Number(record.price) > 0);
    const markerRecord = pricedRecords.reduce((lowest, record) =>
      !lowest || Number(record.price) < Number(lowest.price) ? record : lowest, null);
    return { ...station, markerRecord };
  }).filter(station => station.markerRecord);

  getMarkerClusters(stations).forEach(cluster => {
    if (cluster.length > 1) {
      stationLayer.addLayer(makeClusterMarker(cluster));
      return;
    }
    const station = cluster[0];
    const marker = makePriceMarker(station, station.markerRecord, lowestPrices);
    stationMarkers.set(station.id, marker);
    marker.on("mouseover", () => setStationHighlight(station.id, true));
    marker.on("mouseout", () => setStationHighlight(station.id, false));
    marker.on("popupopen", event => {
      const button = event.popup.getElement()?.querySelector("[data-popup-report]");
      button?.addEventListener("click", () => openReportForStation(station));
    });
    stationLayer.addLayer(marker);
  });
}

function setStationHighlight(stationId, highlighted) {
  const stationMarker = stationMarkers.get(String(stationId));
  const priceMarker = stationMarker?._icon?.querySelector(".price-marker");
  priceMarker?.classList.toggle("is-highlighted", highlighted);
  const card = [...stationList.querySelectorAll(".station-card")]
    .find(item => item.dataset.stationId === String(stationId));
  card?.classList.toggle("is-highlighted", highlighted);
}

function moveToStation(record) {
  const targetZoom = Math.max(map.getZoom(), 13);
  const currentCenter = map.getCenter();
  const isAlreadyFocused = map.getZoom() === targetZoom
    && haversineDistanceKm(currentCenter.lat, currentCenter.lng, record.lat, record.lng) < 0.02;
  if (isAlreadyFocused) {
    stationMarkers.get(String(record.id))?.openPopup();
    return;
  }
  map.once("moveend", () => stationMarkers.get(String(record.id))?.openPopup());
  if (REDUCED_MOTION) {
    map.setView([record.lat, record.lng], targetZoom);
  } else {
    map.flyTo([record.lat, record.lng], targetZoom, { duration: .35 });
  }
}

function bindStationCards() {
  stationList.querySelectorAll(".station-card").forEach(card => {
    const record = visibleRecords.find(item =>
      String(item.id) === card.dataset.stationId && (item.fuelType || "") === card.dataset.fuelType
    );
    if (!record) return;
    card.addEventListener("click", () => moveToStation(record));
    card.addEventListener("mouseenter", () => setStationHighlight(record.id, true));
    card.addEventListener("mouseleave", () => setStationHighlight(record.id, false));
    card.addEventListener("focus", () => setStationHighlight(record.id, true));
    card.addEventListener("blur", () => setStationHighlight(record.id, false));
  });
}

function fitToStations(records) {
  const stations = getStationRecords(records);
  if (!stations.length) return;
  const bounds = L.latLngBounds(stations.map(station => [station.lat, station.lng]));
  map.fitBounds(bounds, { padding: [52, 52], maxZoom: 12, animate: !REDUCED_MOTION });
}

function nearestCity(lat, lng) {
  let nearest = "";
  let bestDistance = Infinity;
  Object.entries(CITIES).forEach(([name, location]) => {
    const distance = haversineDistanceKm(lat, lng, location.lat, location.lng);
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = name;
    }
  });
  return nearest;
}

function setReportCoordinates(lat, lng, station) {
  document.getElementById("st-lat").value = String(lat);
  document.getElementById("st-lng").value = String(lng);
  document.getElementById("st-city").value = station?.city || nearestCity(lat, lng);
  if (station?.name) document.getElementById("st-name").value = station.name;
  reportHint.textContent = `Pin placed near ${document.getElementById("st-city").value}. Add the fuel details below.`;
  reportForm.hidden = false;
  reportForm.scrollIntoView({ behavior: REDUCED_MOTION ? "auto" : "smooth", block: "nearest" });
}

function openReportFlow() {
  if (!isAuthenticated) {
    window.location.href = "login.html";
    return;
  }
  reportFlow.hidden = false;
  reportForm.hidden = true;
  reportStatus.textContent = "";
  reportHint.textContent = "Choose a spot on the map for the station.";
  awaitingMapClick = true;
  mapElement.classList.add("is-reporting");
  if (window.innerWidth <= 900) {
    sidebar.classList.remove("sheet-peek", "sheet-full");
    sidebar.classList.add("sheet-half");
  }
}

function openReportForStation(station) {
  if (!isAuthenticated) {
    window.location.href = "login.html";
    return;
  }
  openReportFlow();
  awaitingMapClick = false;
  mapElement.classList.remove("is-reporting");
  setReportCoordinates(station.lat, station.lng, station);
}

function closeReportFlow() {
  awaitingMapClick = false;
  mapElement.classList.remove("is-reporting");
  reportFlow.hidden = true;
  reportForm.hidden = true;
  reportForm.reset();
  reportStatus.textContent = "";
  if (pendingMarker) {
    map.removeLayer(pendingMarker);
    pendingMarker = null;
  }
}

async function loadStations() {
  renderSkeletons();
  try {
    const records = await getPublicStations();
    allRecords = records.filter(record =>
      Number(record.price) > 0
      && Number.isFinite(Number(record.lat))
      && Number.isFinite(Number(record.lng))
    );
    renderList();
    if (!hasInitialView && allRecords.length) {
      fitToStations(allRecords);
      hasInitialView = true;
    }
  } catch (error) {
    renderError(error);
  }
}

function initializeMapSizing() {
  const resizeMap = entry => {
    const rect = entry?.contentRect || mapFrame.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (width <= 0 || height <= 0) return;
    mapElement.style.width = `${width}px`;
    mapElement.style.height = `${height}px`;
    requestAnimationFrame(() => map.invalidateSize({ pan: false }));
  };
  if ("ResizeObserver" in window) {
    const observer = new ResizeObserver(entries => resizeMap(entries[0]));
    observer.observe(mapFrame);
  } else {
    window.addEventListener("resize", () => resizeMap());
    resizeMap();
  }
}

filterButtons.forEach(button => {
  button.addEventListener("click", () => {
    activeFuel = button.dataset.fuel || "";
    filterButtons.forEach(item => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderList();
  });
});

stationSearch.addEventListener("input", renderList);
stationSort.addEventListener("change", renderList);
map.on("zoomend", () => renderMarkers(visibleRecords));
map.on("click", event => {
  if (!awaitingMapClick) return;
  if (pendingMarker) map.removeLayer(pendingMarker);
  pendingMarker = L.marker(event.latlng).addTo(map);
  awaitingMapClick = false;
  mapElement.classList.remove("is-reporting");
  setReportCoordinates(event.latlng.lat, event.latlng.lng);
});

reportButton.addEventListener("click", () => {
  if (reportFlow.hidden) openReportFlow();
  else closeReportFlow();
});
document.getElementById("cancel-report").addEventListener("click", closeReportFlow);
document.getElementById("cancel-form").addEventListener("click", closeReportFlow);
reportForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submitButton = reportForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  reportStatus.textContent = "";
  try {
    await addStation({
      name: document.getElementById("st-name").value.trim(),
      city: document.getElementById("st-city").value,
      lat: Number(document.getElementById("st-lat").value),
      lng: Number(document.getElementById("st-lng").value),
      fuelType: fuelSelect.value,
      price: document.getElementById("st-price").value
    });
    reportStatus.textContent = "Your station and price report were submitted for review.";
    reportForm.reset();
    reportForm.hidden = true;
    if (pendingMarker) {
      map.removeLayer(pendingMarker);
      pendingMarker = null;
    }
    await loadStations();
  } catch (error) {
    reportStatus.textContent = error.message || "The report could not be submitted. Please try again.";
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById("locate-button").addEventListener("click", () => {
  const status = document.getElementById("location-status");
  if (!navigator.geolocation) {
    status.textContent = "Location is not available in this browser.";
    return;
  }
  status.textContent = "Finding your location…";
  navigator.geolocation.getCurrentPosition(position => {
    userLocation = {
      lat: position.coords.latitude,
      lng: position.coords.longitude
    };
    if (REDUCED_MOTION) map.setView([userLocation.lat, userLocation.lng], 13);
    else map.flyTo([userLocation.lat, userLocation.lng], 13, { duration: .45 });
    status.textContent = "Showing your location.";
    if (stationSort.value === "nearest") renderList();
  }, () => {
    status.textContent = "Could not access your location. Check your browser settings.";
  }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 });
});

document.getElementById("sheet-toggle").addEventListener("click", event => {
  const states = ["sheet-peek", "sheet-half", "sheet-full"];
  const current = states.findIndex(state => sidebar.classList.contains(state));
  const next = states[(current + 1) % states.length];
  sidebar.classList.remove(...states);
  sidebar.classList.add(next);
  event.currentTarget.setAttribute("aria-expanded", String(next === "sheet-full"));
  event.currentTarget.setAttribute("aria-label", next === "sheet-full" ? "Collapse prices panel" : "Expand prices panel");
  requestAnimationFrame(() => map.invalidateSize({ pan: false }));
});

initializeMapSizing();
loadStations();
