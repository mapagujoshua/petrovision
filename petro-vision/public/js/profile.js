requireAuth();

const profileMessage = document.getElementById("profile-message");
const profileReports = document.getElementById("profile-reports");
const preferencesStatus = document.getElementById("preferences-status");
const DEFAULT_FUEL_KEY = "petrovision-default-fuel";

function showProfileMessage(message, type = "") {
  profileMessage.textContent = message;
  profileMessage.className = `profile-message${type ? ` is-${type}` : ""}`;
  profileMessage.hidden = false;
}

function reportStatusClass(status) {
  if (status === "approved") return "badge-success";
  if (status === "rejected") return "badge-danger";
  return "badge-warning";
}

function formatReportDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
}

function renderReports(reports) {
  profileReports.replaceChildren();
  if (!reports.length) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 5;
    cell.className = "profile-report-empty";
    cell.dataset.label = "Reports";
    cell.textContent = "You haven't submitted any reports yet.";
    row.append(cell);
    profileReports.append(row);
    return;
  }

  reports.forEach(report => {
    const row = document.createElement("tr");
    const stationCell = document.createElement("td");
    stationCell.dataset.label = "Station";
    stationCell.textContent = report.stationName || "Station";
    const typeCell = document.createElement("td");
    typeCell.dataset.label = "Report";
    typeCell.textContent = report.type === "Fuel price" && Number.isFinite(Number(report.price))
      ? `${report.type} · ₱${Number(report.price).toFixed(2)}`
      : report.type || "Report";
    const fuelCell = document.createElement("td");
    fuelCell.dataset.label = "Fuel";
    fuelCell.textContent = report.fuelType || "—";
    const statusCell = document.createElement("td");
    statusCell.dataset.label = "Status";
    const statusBadge = document.createElement("span");
    statusBadge.className = `badge ${reportStatusClass(report.status)}`;
    statusBadge.textContent = report.status || "pending";
    statusCell.append(statusBadge);
    const dateCell = document.createElement("td");
    dateCell.dataset.label = "Date";
    dateCell.textContent = formatReportDate(report.reportedAt);
    row.append(stationCell, typeCell, fuelCell, statusCell, dateCell);
    profileReports.append(row);
  });
}

function populateFuelPreference() {
  const select = document.getElementById("default-fuel");
  FUEL_TYPES.forEach(fuel => {
    const option = document.createElement("option");
    option.value = fuel;
    option.textContent = fuel;
    select.append(option);
  });

  try {
    const savedFuel = localStorage.getItem(DEFAULT_FUEL_KEY);
    select.value = FUEL_TYPES.includes(savedFuel) ? savedFuel : FUEL_TYPES[0];
  } catch (error) {
    select.value = FUEL_TYPES[0];
    preferencesStatus.textContent = "Could not read your saved fuel preference.";
    console.error("Could not read the saved default fuel preference.", error);
  }
}

document.getElementById("theme-preference").addEventListener("change", event => {
  const theme = window.PetroVisionTheme;
  if (!theme) {
    preferencesStatus.textContent = "Theme controls are unavailable. Reload the page and try again.";
    return;
  }
  theme.setPreference(event.target.value);
  preferencesStatus.textContent = "Theme preference saved.";
});

document.getElementById("default-fuel").addEventListener("change", event => {
  try {
    localStorage.setItem(DEFAULT_FUEL_KEY, event.target.value);
    preferencesStatus.textContent = "Default fuel preference saved.";
  } catch (error) {
    preferencesStatus.textContent = "Could not save your default fuel preference.";
    console.error("Could not save the default fuel preference.", error);
  }
});

document.getElementById("account-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await updateCurrentUser({
      displayName: form.elements.displayName.value.trim(),
      email: form.elements.email.value.trim()
    });
    const user = await getCurrentUser();
    document.getElementById("profile-avatar").textContent = user.displayName.trim().charAt(0).toUpperCase() || "U";
    document.getElementById("profile-name").textContent = user.displayName;
    document.getElementById("profile-email").textContent = user.email;
    document.querySelector(".pv-profile-toggle .pv-profile-name")?.replaceChildren(document.createTextNode(user.displayName.trim() || user.email.split("@")[0]));
    document.querySelector(".pv-profile-toggle .pv-avatar")?.replaceChildren(document.createTextNode(user.displayName.trim().charAt(0).toUpperCase() || "U"));
    form.elements.displayName.value = user.displayName;
    form.elements.email.value = user.email;
    showProfileMessage("Your account details have been saved.", "success");
  } catch (error) {
    showProfileMessage(error.message || "Could not save your account details.", "error");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("password-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (form.elements.newPassword.value !== form.elements.confirmPassword.value) {
    showProfileMessage("The new passwords do not match.", "error");
    form.elements.confirmPassword.focus();
    return;
  }
  button.disabled = true;
  try {
    await changeCurrentPassword(form.elements.currentPassword.value, form.elements.newPassword.value);
    clearSession();
    window.location.href = "login.html";
  } catch (error) {
    showProfileMessage(error.message || "Could not update your password.", "error");
  } finally {
    button.disabled = false;
  }
});

document.getElementById("delete-account-form").addEventListener("submit", async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  if (form.elements.confirmation.value !== "DELETE") {
    showProfileMessage('Type "DELETE" exactly to confirm account deletion.', "error");
    form.elements.confirmation.focus();
    return;
  }
  if (!window.confirm("Delete your PetroVision account? This cannot be undone.")) return;

  button.disabled = true;
  try {
    await deleteCurrentAccount(form.elements.currentPassword.value);
    clearSession();
    window.location.href = "login.html";
  } catch (error) {
    showProfileMessage(error.message || "Could not delete your account.", "error");
  } finally {
    button.disabled = false;
  }
});

async function loadProfile() {
  populateFuelPreference();
  const themePreference = window.PetroVisionTheme?.getPreference() || "system";
  document.getElementById("theme-preference").value = themePreference;

  try {
    const user = await getCurrentUser();
    document.getElementById("profile-avatar").textContent = user.displayName.trim().charAt(0).toUpperCase() || "U";
    document.getElementById("profile-name").textContent = user.displayName;
    document.getElementById("profile-email").textContent = user.email;
    document.getElementById("profile-joined").textContent = user.createdAt
      ? `Member since ${formatReportDate(user.createdAt)}`
      : "";
    document.getElementById("account-name").value = user.displayName;
    document.getElementById("account-email").value = user.email;
  } catch (error) {
    showProfileMessage(error.message || "Could not load your account details.", "error");
    return;
  }

  const [accountResult, reportsResult] = await Promise.allSettled([getRewardAccount(), getMyReports()]);
  if (accountResult.status === "fulfilled") {
    document.getElementById("profile-points").textContent = Number(accountResult.value.points || 0).toLocaleString();
    document.getElementById("profile-submissions").textContent = Number(accountResult.value.contributions || 0).toLocaleString();
  } else {
    document.getElementById("profile-points").textContent = "Unavailable";
    document.getElementById("profile-submissions").textContent = "Unavailable";
    console.error("Could not load profile reward stats.", accountResult.reason);
  }

  if (reportsResult.status === "fulfilled" && Array.isArray(reportsResult.value)) {
    const reports = reportsResult.value;
    document.getElementById("profile-approved").textContent = reports.filter(report => report.status === "approved").length.toLocaleString();
    renderReports(reports);
  } else {
    document.getElementById("profile-approved").textContent = "Unavailable";
    renderReports([]);
    showProfileMessage(
      reportsResult.status === "rejected"
        ? reportsResult.reason.message || "Could not load your reports."
        : "The reports service returned an unexpected response.",
      "error"
    );
    if (reportsResult.status === "rejected") console.error("Could not load profile reports.", reportsResult.reason);
  }
}

loadProfile();
