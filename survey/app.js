// Survey: after watching a scenario, participants sign in with their Google
// account and write what they want the robot to do first (the first-order
// effect), plus why. Falls back to a local demo mode when Firebase is not
// configured (see config.js).
import { firebaseConfig } from "./config.js";
import { SCENARIOS } from "../js/scenarios.js";

const els = {
  auth: document.getElementById("auth"),
  user: document.getElementById("user"),
  signin: document.getElementById("signin"),
  signout: document.getElementById("signout"),
  form: document.getElementById("form"),
  scenarioSel: document.getElementById("scenario"),
  action: document.getElementById("action"),
  why: document.getElementById("why"),
  submit: document.getElementById("submit"),
  status: document.getElementById("status"),
  mine: document.getElementById("mine"),
  modeBadge: document.getElementById("modeBadge"),
};

for (const s of SCENARIOS) {
  const o = document.createElement("option");
  o.value = s.id;
  o.textContent = `${s.n} · ${s.title} — ${s.conflict}`;
  els.scenarioSel.appendChild(o);
}
const preset = new URLSearchParams(location.search).get("s");
if (preset) els.scenarioSel.value = preset;

let backend;

// ---- Firebase backend -------------------------------------------------------
async function firebaseBackend() {
  const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js");
  const { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } =
    await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js");
  const { getFirestore, collection, addDoc, query, where, orderBy, getDocs, serverTimestamp } =
    await import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js");
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);
  return {
    mode: "firebase",
    onUser(cb) { onAuthStateChanged(auth, cb); },
    async signIn() { await signInWithPopup(auth, new GoogleAuthProvider()); },
    async signOut() { await signOut(auth); },
    async submit(resp) {
      await addDoc(collection(db, "responses"), { ...resp, created: serverTimestamp() });
    },
    async mine(uid) {
      const qs = await getDocs(query(collection(db, "responses"), where("uid", "==", uid), orderBy("created", "desc")));
      return qs.docs.map((d) => d.data());
    },
  };
}

// ---- local demo backend -----------------------------------------------------
function demoBackend() {
  const KEY = "ir-survey-responses";
  const USER_KEY = "ir-survey-user";
  let cb = () => {};
  const read = () => JSON.parse(localStorage.getItem(KEY) || "[]");
  return {
    mode: "demo",
    onUser(f) { cb = f; cb(JSON.parse(localStorage.getItem(USER_KEY) || "null")); },
    async signIn() {
      const user = { uid: "demo-user", displayName: "Demo participant", email: "demo@example.com" };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      cb(user);
    },
    async signOut() { localStorage.removeItem(USER_KEY); cb(null); },
    async submit(resp) {
      const all = read();
      all.unshift({ ...resp, created: new Date().toISOString() });
      localStorage.setItem(KEY, JSON.stringify(all));
    },
    async mine(uid) { return read().filter((r) => r.uid === uid); },
  };
}

let currentUser = null;
function renderUser(user) {
  currentUser = user;
  els.signin.classList.toggle("hidden", !!user);
  els.signout.classList.toggle("hidden", !user);
  els.form.classList.toggle("hidden", !user);
  els.user.textContent = user ? `${user.displayName ?? user.email}` : "";
  if (user) refreshMine();
  else els.mine.innerHTML = "";
}

async function refreshMine() {
  try {
    const rows = await backend.mine(currentUser.uid);
    els.mine.innerHTML = rows.length ? "<h3>Your responses</h3>" : "";
    for (const r of rows) {
      const s = SCENARIOS.find((x) => x.id === r.scenario);
      const div = document.createElement("div");
      div.className = "resp";
      div.innerHTML = `<span class="tag">${s ? `${s.n} · ${s.title}` : r.scenario}</span>
        <p>${escapeHtml(r.action)}</p>${r.why ? `<p class="why">${escapeHtml(r.why)}</p>` : ""}`;
      els.mine.appendChild(div);
    }
  } catch (e) {
    console.error(e);
  }
}
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

async function main() {
  backend = firebaseConfig ? await firebaseBackend() : demoBackend();
  els.modeBadge.textContent = backend.mode === "firebase" ? "● live" : "● demo mode — responses stay in this browser";
  backend.onUser(renderUser);
  els.signin.addEventListener("click", () => backend.signIn().catch((e) => (els.status.textContent = e.message)));
  els.signout.addEventListener("click", () => backend.signOut());
  els.form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const action = els.action.value.trim();
    if (!action) return;
    els.submit.disabled = true;
    els.status.textContent = "Saving…";
    try {
      await backend.submit({
        uid: currentUser.uid,
        email: currentUser.email ?? null,
        name: currentUser.displayName ?? null,
        scenario: els.scenarioSel.value,
        action,
        why: els.why.value.trim() || null,
        userAgent: navigator.userAgent,
      });
      els.status.textContent = "Saved. Thank you!";
      els.action.value = ""; els.why.value = "";
      refreshMine();
    } catch (err) {
      els.status.textContent = `Could not save: ${err.message}`;
    } finally {
      els.submit.disabled = false;
    }
  });
}
main();

// test hooks
window.__survey = { get backend() { return backend; }, get user() { return currentUser; } };
