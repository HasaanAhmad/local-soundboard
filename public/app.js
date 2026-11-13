(() => {
  const ROLE_KEY = "soundboard-role";
  const RECENT_KEY = "soundboard-recent";

  const streamerStatus = document.getElementById("streamer-status");
  const boardStatus = document.getElementById("board-status");
  const cacheText = document.getElementById("cache-text");
  const cacheFill = document.getElementById("cache-fill");
  const npName = document.getElementById("np-name");
  const nowPlaying = document.getElementById("now-playing");
  const streamerPresence = document.getElementById("streamer-presence");
  const boardPresence = document.getElementById("board-presence");
  const phoneUrl = document.getElementById("phone-url");
  const streamerSoundList = document.getElementById("streamer-sound-list");
  const padGrid = document.getElementById("pad-grid");
  const uploadForm = document.getElementById("upload-form");
  const audioInput = document.getElementById("audio-input");
  const fileLabel = document.getElementById("file-label");
  const uploadNote = document.getElementById("upload-note");
  const volumeSliders = [...document.querySelectorAll("[data-volume-slider]")];
  const volumeValues = [...document.querySelectorAll("[data-volume-value]")];
  const installCard = document.getElementById("install-card");
  const installHint = document.getElementById("install-hint");
  const installBtn = document.getElementById("install-btn");

  const params = new URLSearchParams(location.search);
  const queryRole = params.get("role");
  const isStandalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  let role =
    queryRole === "streamer" || queryRole === "board"
      ? queryRole
      : localStorage.getItem(ROLE_KEY) || (isStandalone ? "board" : null);
  let sounds = [];
  let socket = null;
  let audioCtx = null;
  let gainNode = null;
  let masterVolume = 0.85;
  let recentIds = loadRecent();
  let syncingVolumeUi = false;
  let deferredInstallPrompt = null;

  const cache = new Map();
  const playing = new Set();

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* insecure LAN origins may block SW; Add to Home Screen still works */
    });
  }

  function isIos() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  }

  function isAndroid() {
    return /android/i.test(navigator.userAgent);
  }

  function updateInstallCard() {
    if (!installCard || role !== "board" || isStandalone) {
      if (installCard) installCard.hidden = true;
      return;
    }

    installCard.hidden = false;
    if (deferredInstallPrompt) {
      installHint.textContent = "Install to your home screen for one-tap access.";
      installBtn.hidden = false;
      return;
    }

    installBtn.hidden = true;
    if (isIos()) {
      installHint.textContent =
        "Safari → Share → Add to Home Screen. Opens as an app next time.";
    } else if (isAndroid()) {
      installHint.textContent =
        "Chrome → ⋮ menu → Install app / Add to Home screen.";
    } else {
      installHint.textContent =
        "Use your browser’s Install / Add to Home Screen option.";
    }
  }

  function loadRecent() {
    try {
      const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
      return Array.isArray(raw) ? raw.filter((id) => typeof id === "string") : [];
    } catch {
      return [];
    }
  }

  function saveRecent() {
    localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds));
  }

  function bumpRecent(id) {
    if (!id) return;
    recentIds = [id, ...recentIds.filter((x) => x !== id)].slice(0, 100);
    saveRecent();
  }

  function orderedSounds() {
    const rank = new Map(recentIds.map((id, i) => [id, i]));
    return [...sounds].sort((a, b) => {
      const ar = rank.has(a.id) ? rank.get(a.id) : Number.POSITIVE_INFINITY;
      const br = rank.has(b.id) ? rank.get(b.id) : Number.POSITIVE_INFINITY;
      if (ar !== br) return ar - br;
      return 0;
    });
  }

  function showScreen(id) {
    for (const screen of document.querySelectorAll(".screen")) {
      screen.classList.toggle("active", screen.id === id);
    }
  }

  function setStatus(el, text, kind = "") {
    el.textContent = text;
    el.classList.remove("live", "warn");
    if (kind) el.classList.add(kind);
  }

  function unlockAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      gainNode = audioCtx.createGain();
      gainNode.gain.value = masterVolume;
      gainNode.connect(audioCtx.destination);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function applyVolume(value, { emit = false } = {}) {
    masterVolume = Math.min(1, Math.max(0, Number(value) || 0));
    if (gainNode) {
      gainNode.gain.setTargetAtTime(masterVolume, audioCtx.currentTime, 0.015);
    }
    updateVolumeUi(masterVolume);
    if (emit && socket) socket.emit("volume", { volume: masterVolume });
  }

  function updateVolumeUi(value) {
    const pct = Math.round(value * 100);
    syncingVolumeUi = true;
    for (const slider of volumeSliders) slider.value = String(pct);
    for (const label of volumeValues) label.textContent = `${pct}%`;
    syncingVolumeUi = false;
  }

  async function fetchSounds() {
    const res = await fetch("/api/sounds");
    sounds = await res.json();
    render();
    if (role === "streamer") preloadAll();
  }

  async function fetchInfo() {
    try {
      const res = await fetch("/api/info");
      const info = await res.json();
      const host = info.addresses?.[0] || location.hostname;
      phoneUrl.textContent = `http://${host}:${info.port}`;
      if (typeof info.volume === "number") applyVolume(info.volume);
    } catch {
      phoneUrl.textContent = location.origin;
    }
  }

  function connect() {
    if (typeof io !== "function") {
      const el = role === "streamer" ? streamerStatus : boardStatus;
      setStatus(el, "Script failed to load", "warn");
      return;
    }

    if (socket) socket.disconnect();
    socket = io({
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      timeout: 8000,
    });

    socket.on("connect", () => {
      socket.emit("role", role);
      const el = role === "streamer" ? streamerStatus : boardStatus;
      setStatus(el, "Connected", "live");
    });

    socket.on("connect_error", () => {
      const el = role === "streamer" ? streamerStatus : boardStatus;
      setStatus(el, "Can't reach PC — check Wi‑Fi/firewall", "warn");
    });

    socket.on("disconnect", () => {
      const el = role === "streamer" ? streamerStatus : boardStatus;
      setStatus(el, "Reconnecting…", "warn");
    });

    socket.on("sounds:updated", (next) => {
      sounds = next;
      render();
      if (role === "streamer") preloadAll();
    });

    socket.on("volume", (payload) => {
      if (payload && typeof payload.volume === "number") {
        applyVolume(payload.volume);
      }
    });

    socket.on("presence", (p) => {
      if (role === "streamer") {
        streamerPresence.textContent =
          p.boards > 0
            ? `${p.boards} soundboard${p.boards === 1 ? "" : "s"} connected`
            : "No board connected yet — open the phone URL";
      } else {
        boardPresence.textContent =
          p.streamers > 0
            ? `Streaming PC online · ${sounds.length} sound${sounds.length === 1 ? "" : "s"}`
            : "Looking for Streaming PC… keep this page open";
      }
    });

    socket.on("play", async (payload) => {
      if (role !== "streamer") return;
      unlockAudio();
      await playCached(payload);
    });

    socket.on("play:echo", (payload) => {
      bumpRecent(payload.id);
      render();
      flashPad(payload.id);
      if (role === "board") {
        boardPresence.textContent = `Fired · ${payload.name}`;
      }
    });

    socket.on("stop-all", () => {
      stopAll();
    });
  }

  async function preloadAll() {
    const total = sounds.length;
    let ready = 0;
    updateCacheMeter(ready, total);

    await Promise.all(
      sounds.map(async (sound) => {
        try {
          if (!cache.has(sound.id)) {
            const res = await fetch(`/sounds/${sound.file}`);
            const buf = await res.arrayBuffer();
            unlockAudio();
            const decoded = await audioCtx.decodeAudioData(buf.slice(0));
            cache.set(sound.id, decoded);
          }
          ready += 1;
          updateCacheMeter(ready, total);
        } catch (err) {
          console.warn("Failed to cache", sound.name, err);
          ready += 1;
          updateCacheMeter(ready, total);
        }
      })
    );
  }

  function updateCacheMeter(ready, total) {
    cacheText.textContent = `${Math.min(ready, total)} / ${total}`;
    cacheFill.style.width = total ? `${Math.round((ready / total) * 100)}%` : "0%";
  }

  async function playCached(payload) {
    unlockAudio();
    let buffer = cache.get(payload.id);

    if (!buffer) {
      try {
        const res = await fetch(payload.url);
        const arr = await res.arrayBuffer();
        buffer = await audioCtx.decodeAudioData(arr.slice(0));
        cache.set(payload.id, buffer);
      } catch (err) {
        console.error(err);
        return;
      }
    }

    if (typeof payload.volume === "number") {
      applyVolume(payload.volume);
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.connect(gainNode);
    source.start(0);
    playing.add(source);
    source.onended = () => playing.delete(source);

    npName.textContent = payload.name;
    nowPlaying.classList.remove("hit");
    void nowPlaying.offsetWidth;
    nowPlaying.classList.add("hit");
  }

  function stopAll() {
    for (const source of playing) {
      try {
        source.stop();
      } catch {
        /* already stopped */
      }
    }
    playing.clear();
    if (role === "streamer") {
      npName.textContent = "Stopped";
    }
  }

  function flashPad(id) {
    const pad = padGrid.querySelector(`[data-id="${CSS.escape(id)}"]`);
    if (!pad) return;
    pad.classList.remove("flash");
    void pad.offsetWidth;
    pad.classList.add("flash");
  }

  function render() {
    if (role === "streamer") renderStreamerList();
    if (role === "board") renderPads();
  }

  function renderStreamerList() {
    const list = orderedSounds();
    if (!list.length) {
      streamerSoundList.innerHTML = `<li><div class="meta"><strong>No sounds yet</strong></div></li>`;
      return;
    }

    streamerSoundList.innerHTML = list
      .map(
        (s) => `
        <li>
          <div class="meta">
            <span class="swatch" style="background:${s.color}"></span>
            <strong title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</strong>
          </div>
          <button type="button" data-delete="${escapeHtml(s.id)}">Remove</button>
        </li>`
      )
      .join("");
  }

  function renderPads() {
    const list = orderedSounds();
    if (!list.length) {
      padGrid.innerHTML = `<div class="empty-state">No sounds yet. Add some from the Streaming PC.</div>`;
      return;
    }

    padGrid.innerHTML = list
      .map(
        (s) => `
        <button class="pad" type="button" data-id="${escapeHtml(s.id)}" style="background:${s.color}">
          <span>${escapeHtml(s.name)}</span>
        </button>`
      )
      .join("");
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function enterRole(nextRole) {
    role = nextRole;
    localStorage.setItem(ROLE_KEY, role);
    showScreen(role === "streamer" ? "streamer-screen" : "board-screen");
    setStatus(role === "streamer" ? streamerStatus : boardStatus, "Connecting…", "warn");
    if (role === "streamer") fetchInfo();
    updateInstallCard();
    connect();
    fetchSounds();
  }

  function resetRole() {
    if (isStandalone) return;
    localStorage.removeItem(ROLE_KEY);
    role = null;
    if (socket) socket.disconnect();
    showScreen("role-screen");
    updateInstallCard();
  }

  document.querySelectorAll("[data-role]").forEach((btn) => {
    btn.addEventListener("click", () => {
      unlockAudio();
      enterRole(btn.dataset.role);
    });
  });

  document.getElementById("switch-role-streamer").addEventListener("click", resetRole);
  document.getElementById("switch-role-board").addEventListener("click", resetRole);

  document.getElementById("stop-all").addEventListener("click", () => {
    stopAll();
    socket?.emit("stop-all");
  });

  document.getElementById("board-stop").addEventListener("click", () => {
    socket?.emit("stop-all");
  });

  for (const slider of volumeSliders) {
    slider.addEventListener("input", () => {
      if (syncingVolumeUi) return;
      unlockAudio();
      applyVolume(Number(slider.value) / 100, { emit: true });
    });
  }

  padGrid.addEventListener("click", (e) => {
    const pad = e.target.closest(".pad");
    if (!pad) return;
    unlockAudio();
    pad.classList.add("flash");
    socket?.emit("play", { id: pad.dataset.id });
  });

  streamerSoundList.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-delete]");
    if (!btn) return;
    const id = btn.dataset.delete;
    if (!confirm("Remove this sound?")) return;
    await fetch(`/api/sounds/${encodeURIComponent(id)}`, { method: "DELETE" });
  });

  audioInput.addEventListener("change", () => {
    const file = audioInput.files?.[0];
    fileLabel.textContent = file ? file.name : "Drop audio or tap to browse";
  });

  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    uploadNote.textContent = "";
    uploadNote.className = "form-note";

    const file = audioInput.files?.[0];
    if (!file) {
      uploadNote.textContent = "Pick an audio file first.";
      uploadNote.classList.add("err");
      return;
    }

    const body = new FormData();
    body.append("audio", file);
    const name = document.getElementById("sound-name").value.trim();
    if (name) body.append("name", name);

    try {
      const res = await fetch("/api/sounds", { method: "POST", body });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Upload failed");
      }
      uploadForm.reset();
      fileLabel.textContent = "Drop audio or tap to browse";
      uploadNote.textContent = "Added & caching on streamer…";
      uploadNote.classList.add("ok");
    } catch (err) {
      uploadNote.textContent = err.message;
      uploadNote.classList.add("err");
    }
  });

  updateVolumeUi(masterVolume);
  registerServiceWorker();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    updateInstallCard();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    if (installCard) installCard.hidden = true;
  });

  installBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => {});
    deferredInstallPrompt = null;
    updateInstallCard();
  });

  if (isStandalone) {
    document.getElementById("switch-role-board")?.setAttribute("hidden", "");
    document.getElementById("switch-role-streamer")?.setAttribute("hidden", "");
  }

  if (role === "streamer" || role === "board") {
    enterRole(role);
  } else {
    showScreen("role-screen");
    updateInstallCard();
  }
})();
