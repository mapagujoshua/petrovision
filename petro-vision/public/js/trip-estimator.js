requireAuth();

const fromSelect = document.getElementById("from-city");
const toSelect = document.getElementById("to-city");
const vehicleSelect = document.getElementById("vehicle-select");
const vehicleInfo = document.getElementById("vehicle-info");
const fuelTypeInfo = document.getElementById("fuel-type-info");
const form = document.getElementById("estimate-form");
const banner = document.getElementById("banner");
const estimateResults = document.getElementById("estimate-results");
const estimatePlaceholder = document.getElementById("estimate-placeholder");
const cheapestComparison = document.getElementById("cheapest-comparison");
const estimateButton = form.querySelector('button[type="submit"]');

Object.keys(CITIES).forEach(city => {
  fromSelect.add(new Option(city, city));
  toSelect.add(new Option(city, city));
});
toSelect.selectedIndex = 1;

let vehicles = [];
let publicStations = [];
let lastEstimate = null;

function updateVehicleInfo() {
  const vehicle = vehicles.find(item => item.id === vehicleSelect.value);
  if (!vehicle) {
    fuelTypeInfo.textContent = "Choose a vehicle";
    vehicleInfo.textContent = "";
    return;
  }
  fuelTypeInfo.textContent = vehicle.fuelType;
  vehicleInfo.textContent = `${vehicle.type} · about ${vehicle.efficiency} km/L`;
}

function updateComparison(from, vehicle, result) {
  const origin = CITIES[from];
  const candidates = publicStations
    .filter(station => station.fuelType === vehicle.fuelType && Number(station.price) > 0)
    .map(station => ({
      ...station,
      distanceKm: haversineKm(origin, { lat: Number(station.lat), lng: Number(station.lng) })
    }))
    .filter(station => Number.isFinite(station.distanceKm) && station.distanceKm <= 50)
    .sort((a, b) => Number(a.price) - Number(b.price));
  const cheapest = candidates[0];
  if (!cheapest) {
    cheapestComparison.textContent = `No approved ${vehicle.fuelType} price was found within 50 km of ${from}.`;
    return;
  }

  const nearbyCost = result.fuelLitres * Number(cheapest.price);
  const difference = result.estimatedFuelCost - nearbyCost;
  const comparison = difference >= 0
    ? `About ₱${difference.toFixed(0)} less than the estimate`
    : `About ₱${Math.abs(difference).toFixed(0)} more than the estimate`;
  cheapestComparison.textContent =
    `${cheapest.name} has the lowest reported price nearby at ₱${Number(cheapest.price).toFixed(2)}/L (${cheapest.distanceKm.toFixed(1)} km away). ${comparison}.`;
}

async function initializeEstimator() {
  try {
    const [loadedVehicles, stationsResult] = await Promise.all([
      getVehicles(),
      getPublicStations().catch(error => {
        console.warn("Could not load station prices for the route comparison.", error);
        return [];
      })
    ]);
    vehicles = loadedVehicles;
    publicStations = stationsResult;
    vehicleSelect.replaceChildren();
    if (!vehicles.length) {
      const emptyOption = new Option("No vehicles yet", "");
      emptyOption.disabled = true;
      emptyOption.selected = true;
      vehicleSelect.add(emptyOption);
      vehicleSelect.disabled = true;
      document.getElementById("no-vehicle-notice").hidden = false;
      estimateButton.disabled = true;
      return;
    }
    const placeholder = new Option("Choose a vehicle", "");
    placeholder.disabled = true;
    placeholder.selected = true;
    vehicleSelect.add(placeholder);
    vehicles.forEach(vehicle => vehicleSelect.add(new Option(
      `${vehicle.name} (${vehicle.fuelType})`,
      vehicle.id
    )));
    vehicleSelect.disabled = false;
    estimateButton.disabled = false;
    updateVehicleInfo();
  } catch (error) {
    vehicleSelect.replaceChildren(new Option("Vehicles unavailable", ""));
    vehicleSelect.disabled = true;
    estimateButton.disabled = true;
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
  }
}

vehicleSelect.addEventListener("change", updateVehicleInfo);

form.addEventListener("submit", async event => {
  event.preventDefault();
  const from = fromSelect.value;
  const to = toSelect.value;
  const vehicle = vehicles.find(item => item.id === vehicleSelect.value);
  if (!vehicle) return;

  if (from === to) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">Choose two different cities for your trip.</div>`;
    return;
  }
  banner.replaceChildren();
  const submit = form.querySelector('button[type="submit"]');
  window.PetroVisionUI?.setBusy(submit, true);
  try {
    const result = await estimateTrip(from, to, vehicle.id);
    document.getElementById("res-distance").textContent = `${result.distanceKm.toFixed(0)} km`;
    document.getElementById("res-liters").textContent = `${result.fuelLitres.toFixed(1)} L`;
    document.getElementById("res-price").textContent = `₱${result.pricePerLitre.toFixed(2)}/L`;
    document.getElementById("res-cost").textContent = `₱${result.estimatedFuelCost.toFixed(0)}`;
    estimatePlaceholder.hidden = true;
    estimateResults.hidden = false;
    updateComparison(from, vehicle, result);
    lastEstimate = { from, to, vehicle };
  } catch (error) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
    window.PetroVisionUI?.toast(error.message || "Could not estimate this trip.", "error");
  } finally {
    window.PetroVisionUI?.setBusy(submit, false);
  }
});

document.getElementById("save-history-btn").addEventListener("click", async event => {
  if (!lastEstimate) return;
  const button = event.currentTarget;
  window.PetroVisionUI?.setBusy(button, true);
  try {
    await addHistoryEntry({ type: "Trip", from: lastEstimate.from, to: lastEstimate.to }, lastEstimate.vehicle.id);
    window.PetroVisionUI?.toast("Trip saved to your history.", "success");
  } catch (error) {
    banner.innerHTML = `<div class="banner banner-danger" role="alert">${escapeHtml(error.message)}</div>`;
    window.PetroVisionUI?.toast(error.message || "Could not save this trip.", "error");
  } finally {
    window.PetroVisionUI?.setBusy(button, false);
  }
});

initializeEstimator();
