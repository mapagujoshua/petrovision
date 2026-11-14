requireAuth();

let vehicles = [];
let stationsCache = [];
let allEntries = [];
let activeType = "";
let formOptionsLoaded = false;
const vehicleSelect = document.getElementById("r-vehicle");
const litersInput = document.getElementById("r-liters");
const priceInput = document.getElementById("r-price");
const stationSelect = document.getElementById("r-station");
const costPreview = document.getElementById("r-cost-preview");
const form = document.getElementById("refuel-form");
const historyBody = document.getElementById("history-body");
const historySearch = document.getElementById("history-search");
const banner = document.getElementById("banner");

function showNoVehicles() {
  document.getElementById("no-vehicle-notice").hidden = false;
  form.querySelector('button[type="submit"]').disabled = true;
}

function suggestPrice() {
  const vehicle = vehicles.find(item => item.id === vehicleSelect.value);
  if (!vehicle) return;
  const average = averagePrice(vehicle.fuelType, stationsCache);
  if (average) priceInput.value = average.toFixed(2);
  updatePreview();
}

function updatePreview() {
  const liters = Number(litersInput.value);
  const price = Number(priceInput.value);
  costPreview.textContent = liters > 0 && price > 0
    ? `Estimated total: ₱${(liters * price).toFixed(2)}`
    : "";
}

function vehicleName(id) {
  const vehicle = vehicles.find(item => item.id === id);
  return vehicle ? vehicle.name : "—";
}

function getEntryDetails(entry) {
  if (entry.type === "Trip") return `${entry.from} → ${entry.to}`;
  if (entry.stationId) {
    return stationsCache.find(station => station.id === entry.stationId)?.name || entry.notes || "Refuel";
  }
  return entry.notes || "Refuel";
}

function renderHistory() {
  const query = historySearch.value.trim().toLocaleLowerCase();
  const entries = allEntries.filter(entry => {
    const matchesType = !activeType || entry.type === activeType;
    const matchesSearch = !query
      || `${getEntryDetails(entry)} ${vehicleName(entry.vehicleId)}`.toLocaleLowerCase().includes(query);
    return matchesType && matchesSearch;
  });

  historyBody.setAttribute("aria-busy", "false");
  if (!entries.length) {
    historyBody.innerHTML = `
      <tr><td class="availability-empty" colspan="6">
        <strong>${allEntries.length ? "No entries match those filters" : "No history yet"}</strong>
        ${allEntries.length ? "Try another search or activity type." : "Save a trip or log your next refuel to see it here."}
      </td></tr>
    `;
    return;
  }

  let currentMonth = "";
  const rows = [];
  entries.forEach(entry => {
    const date = new Date(entry.date);
    const monthKey = Number.isNaN(date.getTime()) ? "Unknown date" : date.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    if (monthKey !== currentMonth) {
      currentMonth = monthKey;
      rows.push(`<tr class="history-month-row"><td colspan="6">${escapeHtml(monthKey)}</td></tr>`);
    }
    const relative = window.PetroVisionUI?.formatRelativeTime(entry.date) || "—";
    const fullDate = Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
    const typeBadge = entry.type === "Trip" ? "badge-neutral" : "badge-success";
    rows.push(`
      <tr>
        <td data-label="Date" class="history-date" ${fullDate ? `title="${escapeHtml(fullDate)}"` : ""}>${escapeHtml(relative)}</td>
        <td data-label="Type"><span class="badge ${typeBadge}">${escapeHtml(entry.type)}</span></td>
        <td data-label="Details">${escapeHtml(getEntryDetails(entry))}</td>
        <td data-label="Vehicle">${escapeHtml(vehicleName(entry.vehicleId))}</td>
        <td data-label="Liters" class="numeric-cell">${Number(entry.liters).toFixed(1)} L</td>
        <td data-label="Cost" class="history-amount">₱${Number(entry.cost).toFixed(2)}</td>
      </tr>
    `);
  });
  historyBody.innerHTML = rows.join("");
}

async function loadHistory() {
  try {
    [vehicles, stationsCache, allEntries] = await Promise.all([getVehicles(), getStations(), getHistory()]);
    if (!formOptionsLoaded) {
      if (!vehicles.length) showNoVehicles();
      vehicles.forEach(vehicle => vehicleSelect.add(new Option(vehicle.name, vehicle.id)));
      const uniqueStations = [...new Map(stationsCache.map(station => [station.id, station])).values()];
      uniqueStations.forEach(station => stationSelect.add(new Option(
        `${station.name} — ${station.city}`,
        station.id
      )));
      formOptionsLoaded = true;
      if (vehicles.length) suggestPrice();
    }

    const tripCount = allEntries.filter(entry => entry.type === "Trip").length;
    const refuelCount = allEntries.filter(entry => entry.type === "Refuel").length;
    const total = allEntries.reduce((sum, entry) => sum + Number(entry.cost || 0), 0);
    document.getElementById("summary-total").textContent = allEntries.length.toLocaleString();
    document.getElementById("summary-trips").textContent = tripCount.toLocaleString();
    document.getElementById("summary-refuels").textContent = refuelCount.toLocaleString();
    document.getElementById("total-spent").textContent = `₱${total.toFixed(2)}`;
    renderHistory();
  } catch (error) {
    historyBody.setAttribute("aria-busy", "false");
    historyBody.innerHTML = `<tr><td class="availability-empty" colspan="6"><strong>History could not be loaded</strong><button class="btn btn-secondary btn-sm" type="button" data-retry-history>Retry</button></td></tr>`;
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
  }
}

vehicleSelect.addEventListener("change", suggestPrice);
litersInput.addEventListener("input", updatePreview);
priceInput.addEventListener("input", updatePreview);
historySearch.addEventListener("input", renderHistory);

document.querySelectorAll("[data-history-type]").forEach(button => {
  button.addEventListener("click", () => {
    activeType = button.dataset.historyType;
    document.querySelectorAll("[data-history-type]").forEach(item => {
      const active = item === button;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-pressed", String(active));
    });
    renderHistory();
  });
});

historyBody.addEventListener("click", event => {
  if (event.target.closest("[data-retry-history]")) loadHistory();
});

form.addEventListener("submit", async event => {
  event.preventDefault();
  const liters = Number(litersInput.value);
  const price = Number(priceInput.value);
  const submit = form.querySelector('button[type="submit"]');
  window.PetroVisionUI?.setBusy(submit, true);
  try {
    await addHistoryEntry({ type: "Refuel", liters, cost: Math.round(liters * price) }, vehicleSelect.value, stationSelect.value);
    form.reset();
    costPreview.textContent = "";
    await loadHistory();
    window.PetroVisionUI?.toast("Refuel added to your history.", "success");
  } catch (error) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
    window.PetroVisionUI?.toast(error.message || "Could not log this refuel.", "error");
  } finally {
    window.PetroVisionUI?.setBusy(submit, false);
  }
});

loadHistory();
