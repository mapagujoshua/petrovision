/* ============================================================
   PetroVision — js/auth.js
   ------------------------------------------------------------
   Powers login.html: switching between the Log In and Sign Up
   forms, and authenticating against the PetroVision API.

   If someone is already logged in and lands back on this page
   (e.g. they hit the back button), send them straight to the
   dashboard instead of showing the login form again.
   ============================================================ */

const activeSession = getSession();
if (activeSession?.user) {
  window.location.href = activeSession.user.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
} else if (activeSession) {
  clearSession();
}

const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const loginForm = document.getElementById("login-form");
const signupForm = document.getElementById("signup-form");
const banner = document.getElementById("banner");
const authStatus = document.getElementById("auth-status");
const authHeading = document.getElementById("auth-heading");
const authSubheading = document.getElementById("auth-subheading");
const authTabs = document.getElementById("auth-tabs");

const fieldRules = {
  "login-email": { error: "login-email-error", message: "Enter a valid email address." },
  "login-password": { error: "login-password-error", message: "Enter your password." },
  "signup-fullname": { error: "signup-fullname-error", message: "Enter your full name." },
  "signup-email": { error: "signup-email-error", message: "Enter a valid email address." },
  "signup-password": {
    error: "signup-password-error",
    message: "Use 8–64 characters, no spaces, and include upper/lowercase letters, a number, and a special character."
  },
  "signup-confirm-password": { error: "signup-confirm-password-error", message: "Confirm your password." }
};

function fieldIsValid(input) {
  const value = input.value.trim();
  if (input.id === "signup-fullname") return value.length > 0 && value.length <= 100;
  if (input.type === "email") return value.length > 0 && input.validity.valid;
  if (input.id === "login-password") return input.value.length > 0;
  if (input.id === "signup-password") return validatePassword(input.value).valid;
  if (input.id === "signup-confirm-password") {
    return input.value.length > 0 && input.value === document.getElementById("signup-password").value;
  }
  return true;
}

function validateField(input) {
  const rule = fieldRules[input.id];
  if (!rule) return true;
  const valid = fieldIsValid(input);
  if (input.id === "signup-confirm-password") {
    updatePasswordConfirmation(true);
    return valid;
  }
  const error = document.getElementById(rule.error);
  const message = input.id === "signup-fullname" && input.value.trim().length > 100
    ? "Name must be 100 characters or fewer."
    : rule.message;
  input.setAttribute("aria-invalid", String(!valid));
  error.textContent = valid ? "" : message;
  return valid;
}

function validateForm(form) {
  const fields = [...form.querySelectorAll("input")].filter(input => fieldRules[input.id]);
  const results = fields.map(validateField);
  const firstInvalid = fields[results.indexOf(false)];
  if (firstInvalid) firstInvalid.focus();
  return results.every(Boolean);
}

function updatePasswordConfirmation(showRequired = false) {
  const password = document.getElementById("signup-password");
  const confirmation = document.getElementById("signup-confirm-password");
  const error = document.getElementById("signup-confirm-password-error");
  const match = document.getElementById("signup-password-match");
  const matches = confirmation.value.length > 0 && confirmation.value === password.value;

  match.hidden = !matches;
  if (matches) {
    confirmation.removeAttribute("aria-invalid");
    error.textContent = "";
  } else if (confirmation.value.length > 0) {
    confirmation.setAttribute("aria-invalid", "true");
    error.textContent = "Passwords do not match";
  } else if (showRequired) {
    confirmation.setAttribute("aria-invalid", "true");
    error.textContent = "Confirm your password.";
  } else {
    confirmation.removeAttribute("aria-invalid");
    error.textContent = "";
  }
}

function updatePasswordStrength() {
  const password = document.getElementById("signup-password").value;
  const { checks } = validatePassword(password);
  const meter = document.getElementById("password-strength");
  const hint = document.getElementById("signup-password-hint");
  const displayChecks = {
    length: checks.length && checks.noSpaces,
    upper: checks.upper,
    lower: checks.lower,
    number: checks.number,
    special: checks.special
  };
  Object.entries(displayChecks).forEach(([name, met]) => {
    const item = document.querySelector(`[data-password-check="${name}"]`);
    item.classList.toggle("is-met", met);
    item.setAttribute("aria-label", `${item.textContent.trim()}: ${met ? "met" : "not met"}`);
  });

  const score = Object.values(displayChecks).filter(Boolean).length;
  const labels = ["Not entered", "Weak", "Weak", "Fair", "Good", "Strong"];
  meter.dataset.strength = String(score);
  hint.textContent = `Password strength: ${password.length ? labels[score] : labels[0]}`;
  updatePasswordConfirmation();
  document.getElementById("signup-form").querySelector('button[type="submit"]').disabled =
    !validatePassword(password).valid
    || !document.getElementById("signup-confirm-password").value
    || password !== document.getElementById("signup-confirm-password").value;
}

function clearFieldErrors() {
  Object.keys(fieldRules).forEach(id => {
    const input = document.getElementById(id);
    input.removeAttribute("aria-invalid");
    document.getElementById(fieldRules[id].error).textContent = "";
  });
  document.getElementById("signup-password-match").hidden = true;
}

function showTab(which) {
  const isLogin = which === "login";
  tabLogin.setAttribute("aria-selected", String(isLogin));
  tabSignup.setAttribute("aria-selected", String(!isLogin));
  tabLogin.tabIndex = isLogin ? 0 : -1;
  tabSignup.tabIndex = isLogin ? -1 : 0;
  authTabs.dataset.activeTab = isLogin ? "login" : "signup";
  loginForm.hidden = !isLogin;
  signupForm.hidden = isLogin;
  authHeading.textContent = isLogin ? "Welcome back" : "Create your account";
  authSubheading.textContent = isLogin
    ? "Sign in to compare prices, track trips, and earn rewards."
    : "Join drivers sharing clearer fuel prices and rewards.";
  banner.hidden = true;
  banner.textContent = "";
  authStatus.textContent = "";
  clearFieldErrors();
  updatePasswordStrength();
}

tabLogin.addEventListener("click", () => showTab("login"));
tabSignup.addEventListener("click", () => showTab("signup"));
signupForm.addEventListener("keydown", event => {
  const passwordInput = document.getElementById("signup-password");
  if (event.key !== "Enter" || event.isComposing || validatePassword(passwordInput.value).valid) return;
  event.preventDefault();
  validateField(passwordInput);
  passwordInput.focus();
});
authTabs.addEventListener("keydown", event => {
  const tabs = [tabLogin, tabSignup];
  const currentIndex = tabs.indexOf(document.activeElement);
  let nextIndex = currentIndex;
  if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % tabs.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex + tabs.length - 1) % tabs.length;
  else if (event.key === "Home") nextIndex = 0;
  else if (event.key === "End") nextIndex = tabs.length - 1;
  else return;
  event.preventDefault();
  tabs[nextIndex].focus();
  tabs[nextIndex].click();
});

document.querySelectorAll(".auth-field input").forEach(input => {
  input.addEventListener("blur", () => validateField(input));
  input.addEventListener("input", () => {
    if (input.hasAttribute("aria-invalid")) validateField(input);
    if (input.id === "signup-password") {
      updatePasswordStrength();
      const confirmation = document.getElementById("signup-confirm-password");
      if (confirmation.value) updatePasswordConfirmation();
    }
    if (input.id === "signup-confirm-password") updatePasswordStrength();
  });
});

document.querySelectorAll("[data-password-toggle]").forEach(toggle => {
  toggle.addEventListener("click", () => {
    const input = document.getElementById(toggle.dataset.passwordToggle);
    const shouldShow = input.type === "password";
    input.type = shouldShow ? "text" : "password";
    toggle.setAttribute("aria-pressed", String(shouldShow));
    toggle.setAttribute("aria-label", shouldShow ? "Hide password" : "Show password");
  });
});

function setFormBusy(form, busy, loadingText) {
  const submit = form.querySelector('button[type="submit"]');
  form.querySelectorAll("input, button").forEach(control => { control.disabled = busy; });
  if (busy) {
    submit.innerHTML = `<span class="auth-spinner" aria-hidden="true"></span>${loadingText}`;
    submit.setAttribute("aria-busy", "true");
  } else {
    submit.textContent = submit.dataset.submitLabel;
    submit.removeAttribute("aria-busy");
    if (form === signupForm) updatePasswordStrength();
  }
}

function showAuthError(error) {
  const message = error?.message === "Invalid email or password"
    ? "Incorrect email or password."
    : error?.message || "We couldn't complete your request. Please try again.";
  banner.textContent = message;
  banner.hidden = false;
  banner.tabIndex = -1;
  banner.focus();
}

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (loginForm.querySelector('button[type="submit"]').disabled) return;
  if (!validateForm(loginForm)) return;
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  setFormBusy(loginForm, true, "Signing in...");
  banner.hidden = true;
  authStatus.textContent = "";
  try {
    const user = await signIn(email, password);
    authStatus.textContent = "Signed in successfully. Redirecting...";
    window.setTimeout(() => {
      window.location.href = user.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
    }, 250);
  } catch (error) {
    showAuthError(error);
    setFormBusy(loginForm, false);
  } finally {
    if (!authStatus.textContent) setFormBusy(loginForm, false);
  }
});

signupForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  if (signupForm.querySelector('button[type="submit"]').getAttribute("aria-busy") === "true") return;
  const passwordInput = document.getElementById("signup-password");
  if (!validatePassword(passwordInput.value).valid) {
    validateField(passwordInput);
    passwordInput.focus();
    return;
  }
  if (!validateForm(signupForm)) return;
  const fullName = document.getElementById("signup-fullname").value.trim();
  const email = document.getElementById("signup-email").value.trim();
  const password = document.getElementById("signup-password").value;
  setFormBusy(signupForm, true, "Creating account...");
  banner.hidden = true;
  authStatus.textContent = "";
  try {
    const user = await signUp(fullName, email, password);
    authStatus.textContent = "Account created successfully. Redirecting...";
    window.setTimeout(() => {
      window.location.href = user.role === "admin" ? "admin-dashboard.html" : "dashboard.html";
    }, 250);
  } catch (error) {
    showAuthError(error);
    setFormBusy(signupForm, false);
  } finally {
    if (!authStatus.textContent) setFormBusy(signupForm, false);
  }
});

updatePasswordStrength();
