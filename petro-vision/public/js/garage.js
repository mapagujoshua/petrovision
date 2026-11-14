requireAuth();

const typeSelect = document.getElementById("v-type");
const fuelSelect = document.getElementById("v-fuel");
const efficiencyInput = document.getElementById("v-eff");
const vehicleList = document.getElementById("vehicle-list");
const banner = document.getElementById("banner");
const vehicleForm = document.getElementById("vehicle-form");

VEHICLE_TYPES.forEach(type => typeSelect.add(new Option(type, type)));
FUEL_TYPES.forEach(fuel => fuelSelect.add(new Option(fuel, fuel)));

function suggestEfficiency() {
  efficiencyInput.value = DEFAULT_EFFICIENCY[typeSelect.value] || "";
}

function renderVehicles(vehicles) {
  vehicleList.setAttribute("aria-busy", "false");
  document.getElementById("vehicle-count").textContent = vehicles.length.toLocaleString();
  const efficiency = vehicles.length
    ? vehicles.reduce((sum, vehicle) => sum + Number(vehicle.efficiency), 0) / vehicles.length
    : null;
  document.getElementById("summary-efficiency").textContent = efficiency ? `${efficiency.toFixed(1)} km/L` : "—";
  document.getElementById("fuel-type-count").textContent =
    new Set(vehicles.map(vehicle => vehicle.fuelType)).size.toLocaleString();

  if (!vehicles.length) {
    vehicleList.innerHTML = `
      <div class="empty-state card vehicle-empty">
        <h2>Your garage is empty</h2>
        <p>Add a vehicle to unlock personalized trip cost estimates.</p>
        <a class="btn btn-primary" href="#vehicle-form">Add a vehicle</a>
      </div>
    `;
    return;
  }

  vehicleList.innerHTML = vehicles.map(vehicle => `
    <article class="card vehicle-card">
      <div class="vehicle-card-header">
        <div>
          <h3>${escapeHtml(vehicle.name)}</h3>
          <p class="vehicle-card-type">${escapeHtml(vehicle.type)} · ${escapeHtml(vehicle.fuelType)}</p>
        </div>
        <details class="vehicle-actions">
          <summary class="icon-button" aria-label="Actions for ${escapeHtml(vehicle.name)}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></svg>
          </summary>
          <div class="vehicle-action-menu">
            <button type="button" class="vehicle-remove" data-id="${escapeHtml(vehicle.id)}">Remove vehicle</button>
          </div>
        </details>
      </div>
      <div class="vehicle-card-footer">
        <span class="vehicle-efficiency"><strong>${Number(vehicle.efficiency).toFixed(1)}</strong><span>km per liter</span></span>
        <span class="badge-neutral">${escapeHtml(vehicle.fuelType)}</span>
      </div>
    </article>
  `).join("");
}

async function loadVehicles() {
  try {
    renderVehicles(await getVehicles());
  } catch (error) {
    vehicleList.setAttribute("aria-busy", "false");
    vehicleList.innerHTML = `
      <div class="banner banner-danger" role="alert">
        ${escapeHtml(error.message)}
        <button class="btn btn-secondary btn-sm" type="button" data-retry-vehicles>Retry</button>
      </div>
    `;
  }
}

typeSelect.addEventListener("change", suggestEfficiency);
suggestEfficiency();

vehicleList.addEventListener("click", async event => {
  if (event.target.closest("[data-retry-vehicles]")) {
    loadVehicles();
    return;
  }
  const button = event.target.closest("[data-id]");
  if (!button) return;
  window.PetroVisionUI?.setBusy(button, true);
  try {
    await deleteVehicle(button.dataset.id);
    window.PetroVisionUI?.toast("Vehicle removed from your garage.", "success");
    await loadVehicles();
  } catch (error) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
    window.PetroVisionUI?.toast(error.message || "Could not remove this vehicle.", "error");
    window.PetroVisionUI?.setBusy(button, false);
  }
});

vehicleForm.addEventListener("submit", async event => {
  event.preventDefault();
  const submit = vehicleForm.querySelector('button[type="submit"]');
  window.PetroVisionUI?.setBusy(submit, true);
  try {
    await addVehicle({
      name: document.getElementById("v-name").value.trim(),
      type: typeSelect.value,
      fuelType: fuelSelect.value,
      efficiency: efficiencyInput.value
    });
    vehicleForm.reset();
    suggestEfficiency();
    window.PetroVisionUI?.toast("Vehicle added to your garage.", "success");
    await loadVehicles();
  } catch (error) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
    window.PetroVisionUI?.toast(error.message || "Could not add this vehicle.", "error");
  } finally {
    window.PetroVisionUI?.setBusy(submit, false);
  }
});

loadVehicles();
