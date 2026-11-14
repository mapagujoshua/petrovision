requireAuth();

const fuelFilter = document.getElementById("filter-fuel");
const statusFilter = document.getElementById("filter-status");
const searchInput = document.getElementById("station-search");
const availabilityBody = document.getElementById("availability-body");
const banner = document.getElementById("banner");
const STATUS_CLASS = {
  "In Stock": "is-good",
  "Low Stock": "is-warn",
  "Out of Stock": "is-bad"
};
let allStations = [];

FUEL_TYPES.forEach(fuel => fuelFilter.add(new Option(fuel, fuel)));

function renderSummary(stations) {
  const grouped = new Map();
  stations.forEach(station => {
    if (!grouped.has(station.id)) grouped.set(station.id, []);
    grouped.get(station.id).push(station.availability);
  });
  document.getElementById("summary-total").textContent = grouped.size.toLocaleString();
  document.getElementById("summary-stock").textContent =
    [...grouped.values()].filter(statuses => statuses.includes("In Stock")).length.toLocaleString();
  document.getElementById("summary-out").textContent =
    [...grouped.values()].filter(statuses => statuses.includes("Out of Stock")).length.toLocaleString();
}

function setPressed(selector, attribute, value) {
  document.querySelectorAll(selector).forEach(button => {
    const active = button.dataset[attribute] === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function renderRows() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const stations = allStations
    .filter(station => !fuelFilter.value || station.fuelType === fuelFilter.value)
    .filter(station => !statusFilter.value || station.availability === statusFilter.value)
    .filter(station => !query || `${station.name} ${station.city}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  availabilityBody.setAttribute("aria-busy", "false");
  if (!stations.length) {
    availabilityBody.innerHTML = `
      <tr><td class="availability-empty" colspan="6">
        <strong>No availability reports match</strong>
        Try another fuel type, status, or station name.
      </td></tr>
    `;
    return;
  }

  availabilityBody.innerHTML = stations.map(station => {
    const statusClass = STATUS_CLASS[station.availability] || "";
    const relative = window.PetroVisionUI?.formatRelativeTime(station.date) || "";
    const fullDate = station.date ? new Date(station.date).toLocaleString() : "";
    return `
      <tr>
        <td data-label="Station">
          <span class="station-table-name">
            <strong>${escapeHtml(station.name)}</strong>
            <span>${escapeHtml(station.city || "Location unavailable")}</span>
          </span>
        </td>
        <td data-label="Fuel">${escapeHtml(station.fuelType || "—")}</td>
        <td data-label="Price" class="numeric-cell">${station.price > 0 ? `₱${Number(station.price).toFixed(2)}` : "—"}</td>
        <td data-label="Availability"><span class="status-badge ${statusClass}">${escapeHtml(station.availability || "Unknown")}</span></td>
        <td data-label="Updated" class="relative-time" ${fullDate ? `title="${escapeHtml(fullDate)}"` : ""}>${relative || "—"}</td>
        <td data-label="Update" class="row-action-cell">
          <details class="row-action-menu">
            <summary class="btn btn-secondary btn-sm">Update</summary>
            <div class="row-action-list" role="group" aria-label="Choose reported availability">
              <button class="row-action-choice" type="button" data-id="${escapeHtml(station.id)}" data-fuel="${escapeHtml(station.fuelType)}" data-status="In Stock">In stock</button>
              <button class="row-action-choice" type="button" data-id="${escapeHtml(station.id)}" data-fuel="${escapeHtml(station.fuelType)}" data-status="Low Stock">Low</button>
              <button class="row-action-choice" type="button" data-id="${escapeHtml(station.id)}" data-fuel="${escapeHtml(station.fuelType)}" data-status="Out of Stock">Out of stock</button>
            </div>
          </details>
        </td>
      </tr>
    `;
  }).join("");
}

async function renderTable() {
  try {
    allStations = await getStations();
    renderSummary(allStations);
    renderRows();
    banner.replaceChildren();
  } catch (error) {
    availabilityBody.setAttribute("aria-busy", "false");
    availabilityBody.innerHTML = `
      <tr><td class="availability-empty" colspan="6">
        <strong>Availability could not be loaded</strong>
        <button class="btn btn-secondary btn-sm" type="button" data-retry-availability>Retry</button>
      </td></tr>
    `;
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
  }
}

document.querySelectorAll("[data-fuel-filter]").forEach(button => {
  button.addEventListener("click", () => {
    fuelFilter.value = button.dataset.fuelFilter;
    setPressed("[data-fuel-filter]", "fuelFilter", fuelFilter.value);
    renderRows();
  });
});

document.querySelectorAll("[data-status-filter]").forEach(button => {
  button.addEventListener("click", () => {
    statusFilter.value = button.dataset.statusFilter;
    setPressed("[data-status-filter]", "statusFilter", statusFilter.value);
    renderRows();
  });
});

searchInput.addEventListener("input", renderRows);

availabilityBody.addEventListener("click", async event => {
  if (event.target.closest("[data-retry-availability]")) {
    renderTable();
    return;
  }
  const button = event.target.closest("[data-status]");
  if (!button) return;
  const { id, fuel, status } = button.dataset;
  const menu = button.closest("details");
  button.disabled = true;
  try {
    await updateAvailability(id, status, fuel);
    menu.open = false;
    window.PetroVisionUI?.toast("Availability submitted for review.", "success");
    await renderTable();
  } catch (error) {
    window.PetroVisionUI?.toast(error.message || "Could not submit availability.", "error");
    button.disabled = false;
  }
});

renderTable();
