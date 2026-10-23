const API_BASE = "";
const DASHBOARD_URL = "dashboard.html";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];


const sections = { login: $("#login-section"), register: $("#register-section") };
const tabs = { login: $("#tab-login"), register: $("#tab-register") };

function show(which) {
  for (const k in sections) {
    sections[k].hidden = k !== which;
    tabs[k].setAttribute("aria-selected", String(k === which));
  }
  document.title = (which === "login" ? "Sign in" : "Register") + " | CampusFlow";
  history.replaceState(null, "", "#" + which);
  $(".field input", sections[which]).focus({ preventScroll: true });
}
tabs.login.onclick = () => show("login");
tabs.register.onclick = () => show("register");
$$("[data-go]").forEach(b => b.onclick = () => show(b.dataset.go));
if (location.hash === "#register") show("register");

/* -SHOW AND HIE PW- */
$$(".toggle").forEach(btn => btn.onclick = () => {
  const input = document.getElementById(btn.dataset.target);
  const hidden = input.type === "password";
  input.type = hidden ? "text" : "password";
  btn.textContent = hidden ? "Hide" : "Show";
  btn.setAttribute("aria-label", hidden ? "Hide password" : "Show password");
});

/* -PW STRENGTH- */
const bars = $$(".meter i");
const colors = ["#f87171", "#fb923c", "#facc15", "#4ade80"];
const labels = ["Too weak", "Could be stronger", "Good", "Strong"];
$("#reg-password").addEventListener("input", e => {
  const v = e.target.value;
  let score = 0;
  if (v.length >= 8) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v)) score++;
  if (/[^A-Za-z0-9]/.test(v) || v.length >= 12) score++;
  bars.forEach((b, i) => b.style.background = i < score ? colors[score - 1] : "");
  $("#meter-text").textContent = v ? labels[Math.max(score - 1, 0)] : "Use 8+ characters with letters and numbers.";
});

/* -VALIDATION- */
function mark(input, ok) {
  input.closest(".field").classList.toggle("invalid", !ok);
  return ok;
}
$$("input").forEach(i => i.addEventListener("input", () => i.closest(".field")?.classList.remove("invalid")));

async function send(path, payload, statusEl, btn, successMsg) {
  statusEl.className = "status";
  statusEl.textContent = "";
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = "Please wait…";
  try {
    if (API_BASE) {
      const res = await fetch(API_BASE + path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error("The authentication service returned an invalid response.");
      }
      if (!res.ok) {
        throw new Error(typeof data.message === "string" ? data.message : "Something went wrong. Please try again.");
      }
    } else {
      throw new Error("Authentication isn't connected yet. Please try again when the service is available.");
    }
    statusEl.classList.add("good");
    statusEl.textContent = successMsg;
    setTimeout(() => location.href = DASHBOARD_URL, 700);
  } catch (err) {
    statusEl.classList.add("bad");
    statusEl.textContent = err.message || "Couldn't reach the server. Check your connection.";
    btn.disabled = false;
    btn.textContent = label;
  }
}

/* -SIGN IN- */
$("#login-form").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target;
  const ok = [
    mark(f.studentId, f.studentId.value.trim().length > 2),
    mark(f.password, f.password.value.length > 0)
  ].every(Boolean);
  if (!ok) return;

  const status = $(".status", f);
  const submitButton = $(".btn", f);
  if (f.studentId.value.trim() === "Admin" && f.password.value === "123") {
    status.className = "status good";
    status.textContent = "Demo login successful. Opening the dashboard…";
    submitButton.disabled = true;
    setTimeout(() => location.href = DASHBOARD_URL, 700);
    return;
  }

  if (!API_BASE) {
    status.className = "status bad";
    status.textContent = "Login is still in development. For the demo, use Admin / 123.";
    return;
  }

  send("/auth/login", { studentId: f.studentId.value.trim(), password: f.password.value, remember: f.remember.checked },
    status, submitButton, "Signed in. Taking you to your dashboard…");
});

/* -REGISTER- */
$("#register-form").addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target;
  const ok = [
    mark(f.fullName, f.fullName.value.trim().length > 1),
    mark(f.studentId, f.studentId.value.trim().length > 2),
    mark(f.password, f.password.value.length >= 8),
    mark(f.confirm, f.confirm.value === f.password.value && f.confirm.value !== "")
  ].every(Boolean);
  if (!ok) return;
  send("/auth/register", {
    fullName: f.fullName.value.trim(),
    studentId: f.studentId.value.trim(),
    password: f.password.value
  }, $(".status", f), $(".btn", f), "Account created. Taking you to your dashboard…");
});

$("#forgot").addEventListener("click", e => {
  e.preventDefault();
  const s = $(".status", $("#login-form"));
  s.className = "status";
  s.textContent = "Password reset isn't available yet. Please contact the club admin.";
});
