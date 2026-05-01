const authModal = document.getElementById("authModal");
const authForm = document.getElementById("authForm");
const authBtn = document.getElementById("authBtn");
const toggleAuth = document.getElementById("toggleAuth");
const registerFields = document.getElementById("registerFields");
const authSubtitle = document.getElementById("authSubtitle");
const authMessage = document.getElementById("authMessage");
const grid = document.getElementById("checkboxGrid");
const toast = document.getElementById("toast");
const checkedCount = document.getElementById("checkedCount");
const emptyCount = document.getElementById("emptyCount");
const fillPercent = document.getElementById("fillPercent");
const userActions = document.getElementById("userActions");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const viewerBtn = document.getElementById("viewerBtn");

let isLoginMode = true;
let isAuthenticated = false;
const pageParams = new URLSearchParams(window.location.search);
const oidcContinueUrl = pageParams.get("oidc_continue");

const getSafeOidcContinueUrl = () => {
  if (!oidcContinueUrl) {
    return null;
  }

  try {
    const url = new URL(oidcContinueUrl, window.location.origin);
    if (url.origin !== window.location.origin) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
};

const showAuthModal = () => {
  authModal.classList.remove("hidden");
};

const hideAuthModal = () => {
  authModal.classList.add("hidden");
};

const setAuthenticatedUi = (authenticated) => {
  isAuthenticated = authenticated;
  userActions.classList.remove("hidden");
  loginBtn.classList.toggle("hidden", authenticated);
  logoutBtn.classList.toggle("hidden", !authenticated);
};

const showAuthMessage = (message, type = "error") => {
  authMessage.textContent = message;
  authMessage.className = `auth-message ${type}`;
};

const clearAuthMessage = () => {
  authMessage.textContent = "";
  authMessage.className = "auth-message hidden";
};

const setAuthMode = (nextMode) => {
  isLoginMode = nextMode === "login";
  clearAuthMessage();

  if (isLoginMode) {
    registerFields.classList.add("hidden");
    authBtn.textContent = "Sign In";
    authSubtitle.textContent =
      "Everyone can watch live. Sign in only when you want to change boxes.";
    toggleAuth.textContent = "Create an account";
    return;
  }

  registerFields.classList.remove("hidden");
  authBtn.textContent = "Create Account";
  authSubtitle.textContent = "Create an account to edit the live board.";
  toggleAuth.textContent = "Back to sign in";
};

const getValue = (id) => document.getElementById(id).value.trim();

const requestJson = async (url, payload) => {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(
      data.error || data.message || `Request failed (${res.status})`,
    );
  }

  return data;
};

const postJson = async (url) => {
  const res = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(
      data.error || data.message || `Request failed (${res.status})`,
    );
  }

  return data;
};

const checkAuthStatus = async () => {
  const continueUrl = getSafeOidcContinueUrl();

  try {
    const res = await fetch("/api/auth/me", { credentials: "same-origin" });
    if (res.ok) {
      if (continueUrl) {
        window.location.href = continueUrl;
        return;
      }

      hideAuthModal();
      setAuthenticatedUi(true);
      return;
    }
  } catch {
    // The board remains readable when auth cannot be checked.
  }

  setAuthenticatedUi(false);
  hideAuthModal();

  if (continueUrl) {
    showAuthModal();
    setAuthMode("login");
    showAuthMessage("Sign in to complete authorization.", "success");
  }
};

loginBtn.addEventListener("click", () => {
  window.location.href = "/api/auth/oidc/start";
});

viewerBtn.addEventListener("click", () => {
  hideAuthModal();
  if (getSafeOidcContinueUrl()) {
    window.history.replaceState({}, "", "/");
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await postJson("/api/auth/logout");
    window.location.reload();
  } catch (error) {
    showToast(error.message);
  }
});

toggleAuth.addEventListener("click", () => {
  setAuthMode(isLoginMode ? "signup" : "login");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearAuthMessage();

  const email = getValue("emailInput");
  const password = document.getElementById("passwordInput").value;

  if (!email || !password) {
    showAuthMessage("Email and password are required.");
    return;
  }

  authBtn.disabled = true;
  authBtn.textContent = isLoginMode ? "Signing in..." : "Creating...";

  try {
    if (isLoginMode) {
      await requestJson("/api/auth/login", { email, password });
      const continueUrl = getSafeOidcContinueUrl();
      if (continueUrl) {
        window.location.href = continueUrl;
        return;
      }

      window.location.reload();
      return;
    }

    const firstName = getValue("firstNameInput");
    const lastName = getValue("lastNameInput");

    if (!firstName) {
      showAuthMessage("First name is required.");
      return;
    }

    await requestJson("/api/auth/register", {
      firstName,
      lastName,
      email,
      password,
    });

    showAuthMessage("Account created. Opening the board...", "success");
    const continueUrl = getSafeOidcContinueUrl();
    if (continueUrl) {
      window.location.href = continueUrl;
      return;
    }

    window.location.reload();
  } catch (error) {
    showAuthMessage(error.message);
  } finally {
    authBtn.disabled = false;
    authBtn.textContent = isLoginMode ? "Sign In" : "Create Account";
  }
});

const protocol = window.location.protocol === "https:" ? "wss" : "ws";
const ws = new WebSocket(`${protocol}://${window.location.host}`);

const TOTAL_BOXES = 1000;
const checkboxes = [];

const updateCheckedCount = () => {
  const total = checkboxes.reduce((count, checkbox) => {
    return checkbox.checked ? count + 1 : count;
  }, 0);
  const empty = TOTAL_BOXES - total;
  const percent = Math.round((total / TOTAL_BOXES) * 100);

  checkedCount.textContent = total.toLocaleString();
  emptyCount.textContent = empty.toLocaleString();
  fillPercent.textContent = `${percent}%`;
};

const showToast = (message) => {
  toast.textContent = message;
  toast.classList.remove("hidden");

  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.classList.add("hidden");
  }, 3000);
};

const fragment = document.createDocumentFragment();
for (let i = 0; i < TOTAL_BOXES; i++) {
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.dataset.index = i;
  checkbox.setAttribute("aria-label", `Checkbox ${i + 1}`);
  checkboxes.push(checkbox);
  fragment.appendChild(checkbox);
}
grid.appendChild(fragment);
updateCheckedCount();

grid.addEventListener("change", (event) => {
  if (event.target.type !== "checkbox") {
    return;
  }

  const index = Number.parseInt(event.target.dataset.index, 10);
  const state = event.target.checked;
  updateCheckedCount();

  if (!isAuthenticated) {
    event.target.checked = !state;
    updateCheckedCount();
    window.location.href = "/api/auth/oidc/start";
    return;
  }

  if (ws.readyState !== WebSocket.OPEN) {
    event.target.checked = !state;
    updateCheckedCount();
    showToast("Connection is not ready yet.");
    return;
  }

  ws.send(JSON.stringify({ type: "TOGGLE", index, state }));
});

function isBitSet(bytes, index) {
  const byteIndex = Math.floor(index / 8);
  const bitOffset = 7 - (index % 8);
  if (byteIndex >= bytes.length) return false;
  return (bytes[byteIndex] & (1 << bitOffset)) !== 0;
}

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "INIT") {
    const binaryString = atob(msg.data);
    const bytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i += 1) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    for (let i = 0; i < TOTAL_BOXES; i += 1) {
      checkboxes[i].checked = isBitSet(bytes, i);
    }

    updateCheckedCount();
    return;
  }

  if (msg.type === "UPDATE" && msg.index < TOTAL_BOXES) {
    checkboxes[msg.index].checked = msg.state;
    updateCheckedCount();
    return;
  }

  if (msg.type === "RESET") {
    checkboxes.forEach((checkbox) => {
      checkbox.checked = false;
    });
    updateCheckedCount();
    showToast("Board was reset.");
    return;
  }

  if (msg.type === "ERROR") {
    if (msg.index !== undefined) {
      checkboxes[msg.index].checked = !msg.state;
      updateCheckedCount();
    }

    showToast(msg.message);
  }
});

ws.addEventListener("close", () => {
  showToast("Live connection closed. Refresh to reconnect.");
});

checkAuthStatus();
