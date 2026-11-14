requireAuth();

const fuelSelect = document.getElementById("a-fuel");
const stationSelect = document.getElementById("a-station");
const alertList = document.getElementById("alert-list");
const alertForm = document.getElementById("alert-form");
const banner = document.getElementById("banner");
let stations = [];

FUEL_TYPES.forEach(fuel => fuelSelect.add(new Option(fuel, fuel)));

function renderAlerts(alerts) {
  alertList.setAttribute("aria-busy", "false");
  if (!alerts.length) {
    alertList.innerHTML = `
      <div class="empty-state card">
        <h2>No alerts yet</h2>
        <p>Create a threshold to keep an eye on a station’s reported fuel price.</p>
        <a class="btn btn-primary" href="#alert-form">Create an alert</a>
      </div>
    `;
    return;
  }

  const groups = [
    { key: "below", title: "Price drops below" },
    { key: "above", title: "Price rises above" }
  ];
  alertList.innerHTML = groups.map(group => {
    const items = alerts.filter(alert => (alert.condition || "below") === group.key);
    if (!items.length) return "";
    return `
      <section class="alert-group" aria-label="${group.title}">
        <h3>${group.title}</h3>
        ${items.map(alert => {
          const match = checkAlert(alert, stations);
          const station = match?.name || stations.find(item => item.id === alert.stationId)?.name || "Selected station";
          return `
            <article class="card alert-card">
              <div class="alert-card-heading">
                <div>
                  <h3 class="alert-card-title">${escapeHtml(station)}</h3>
                  <p class="alert-card-description">${escapeHtml(alert.fuelType)} · ${group.key === "below" ? "Below" : "Above"} ₱${Number(alert.maxPrice).toFixed(2)}/L</p>
                </div>
                <span class="status-badge ${match ? "is-good" : ""}">${match ? "Price matched" : "Monitoring"}</span>
              </div>
              ${match
                ? `<p class="alert-triggered">Reported at ₱${Number(match.price).toFixed(2)}/L in ${escapeHtml(match.city || "this area")}.</p>`
                : ""}
              <div class="alert-card-actions">
                <button class="btn btn-danger btn-sm" type="button" data-delete-alert="${escapeHtml(alert.id)}">Delete alert</button>
              </div>
            </article>
          `;
        }).join("")}
      </section>
    `;
  }).join("");
}

async function loadAlerts() {
  alertList.setAttribute("aria-busy", "true");
  try {
    const [loadedStations, alerts] = await Promise.all([getStations(), getAlerts()]);
    stations = loadedStations;
    const uniqueStations = [...new Map(
      stations.filter(station => station.fuelType && station.price > 0).map(station => [station.id, station])
    ).values()];
    stationSelect.replaceChildren(new Option("Choose a station", ""));
    uniqueStations.forEach(station => stationSelect.add(new Option(
      `${station.name} — ${station.city}`,
      station.id
    )));
    if (!uniqueStations.length) {
      stationSelect.disabled = true;
      alertForm.querySelector('button[type="submit"]').disabled = true;
      banner.innerHTML = `<div class="banner banner-info">Report a station price before creating an alert.</div>`;
    } else {
      stationSelect.disabled = false;
      alertForm.querySelector('button[type="submit"]').disabled = false;
      banner.replaceChildren();
    }
    renderAlerts(alerts);
  } catch (error) {
    alertList.setAttribute("aria-busy", "false");
    alertList.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)} <button class="btn btn-secondary btn-sm" type="button" data-retry-alerts>Retry</button></div>`;
  }
}

alertList.addEventListener("click", async event => {
  if (event.target.closest("[data-retry-alerts]")) {
    loadAlerts();
    return;
  }
  const button = event.target.closest("[data-delete-alert]");
  if (!button) return;
  window.PetroVisionUI?.setBusy(button, true);
  try {
    await deleteAlert(button.dataset.deleteAlert);
    window.PetroVisionUI?.toast("Alert deleted.", "success");
    await loadAlerts();
  } catch (error) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
    window.PetroVisionUI?.toast(error.message || "Could not delete this alert.", "error");
    window.PetroVisionUI?.setBusy(button, false);
  }
});

alertForm.addEventListener("submit", async event => {
  event.preventDefault();
  const condition = document.querySelector('input[name="a-condition"]:checked').value;
  const submit = alertForm.querySelector('button[type="submit"]');
  window.PetroVisionUI?.setBusy(submit, true);
  try {
    await addAlert({
      stationId: stationSelect.value,
      fuelType: fuelSelect.value,
      condition,
      threshold: document.getElementById("a-threshold").value
    });
    alertForm.reset();
    window.PetroVisionUI?.toast("Price alert saved.", "success");
    await loadAlerts();
  } catch (error) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
    window.PetroVisionUI?.toast(error.message || "Could not save this alert.", "error");
  } finally {
    window.PetroVisionUI?.setBusy(submit, false);
  }
});

loadAlerts();
