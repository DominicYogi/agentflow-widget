(function () {

  // ── Config ────────────────────────────────────────────
  const BACKEND_URL = "https://agentflow-backend-krdb.onrender.com";
  const API_KEY = document.currentScript?.getAttribute("data-api-key") || "af_live_medicare001";
  const THEME = document.currentScript?.getAttribute("data-theme") || "blue";

  const THEMES = {
    blue:  { primary: "#0052cc", light: "#e8f0fe", accent: "#003d99" },
    green: { primary: "#27ae60", light: "#e8f5e9", accent: "#219150" },
    dark:  { primary: "#1a1a2e", light: "#f0f0f0", accent: "#16213e" },
  };
  const theme = THEMES[THEME] || THEMES.blue;

  // ── State ─────────────────────────────────────────────
  let clientInfo          = null;
  let isProcessing        = false;
  let pendingPlan         = null;
  let conversationHistory = [];
  const SESSION_KEY       = "af_conv_" + (API_KEY || "default");

  // ── Device fingerprint ────────────────────────────────
  const deviceInfo = (function () {
    const ua = navigator.userAgent;
    let os = "Unknown OS";
    if (/Windows NT 10/.test(ua))      os = "Windows 10/11";
    else if (/Windows NT 6/.test(ua))  os = "Windows 7/8";
    else if (/Mac OS X/.test(ua))      os = "macOS";
    else if (/Linux/.test(ua))         os = "Linux";
    else if (/Android/.test(ua))       os = "Android";
    else if (/iPhone|iPad/.test(ua))   os = "iOS";

    let browser = "Unknown Browser";
    if (/Edg\//.test(ua))             browser = "Microsoft Edge";
    else if (/Chrome\//.test(ua))     browser = "Chrome";
    else if (/Firefox\//.test(ua))    browser = "Firefox";
    else if (/Safari\//.test(ua))     browser = "Safari";

    return {
      os:        os,
      browser:   browser,
      screenRes: screen.width + "x" + screen.height,
      timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone,
      language:  navigator.language || "en",
      userAgent: ua.slice(0, 120)
    };
  }());

  // ── Operator name detection ───────────────────────────
  function detectOperator() {
    var selectors = [
      ".user-name", "#user-name", ".username", "#username",
      ".user-card .user-name", ".sidebar-footer .user-name",
      "[data-username]", "[data-user]",
      ".nav-user", ".header-user", ".profile-name",
      ".operator-name", ".staff-name", ".agent-name",
      ".avatar-name", ".display-name", ".full-name",
      ".topbar .name", "header .name"
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var el = document.querySelector(selectors[i]);
        if (el) {
          var text = (el.getAttribute("data-username") || el.getAttribute("data-user") || el.textContent || "").trim();
          if (text && text.length > 1 && text.length < 60) return text;
        }
      } catch (e) {}
    }

    // Fallback: look for First Last pattern in user-card/profile/topbar
    var namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+$/;
    var candidates = document.querySelectorAll(".user-card *, .profile *, .topbar *");
    for (var j = 0; j < candidates.length; j++) {
      var t = (candidates[j].textContent || "").trim();
      if (namePattern.test(t)) return t;
    }

    return null;
  }

  // ── Styles ────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = [
    "* { box-sizing: border-box; }",
    "#af-launcher {",
    "  position: fixed; bottom: 30px; right: 30px;",
    "  width: 58px; height: 58px;",
    "  background: " + theme.primary + ";",
    "  border-radius: 50%;",
    "  display: flex; align-items: center; justify-content: center;",
    "  cursor: pointer;",
    "  box-shadow: 0 4px 24px " + theme.primary + "55;",
    "  z-index: 9999; transition: transform 0.2s, box-shadow 0.2s;",
    "  font-size: 26px; border: none;",
    "}",
    "#af-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 28px " + theme.primary + "77; }",
    "#af-panel {",
    "  position: fixed; bottom: 106px; right: 30px; top: 16px;",
    "  width: 400px; background: #fff; border-radius: 18px;",
    "  box-shadow: 0 12px 56px rgba(0,0,0,0.16); z-index: 9998;",
    "  display: none; flex-direction: column; overflow: hidden;",
    "  border: 1px solid #e0e0e0;",
    "  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;",
    "  animation: af-up 0.22s ease; max-height: calc(100vh - 130px);",
    "}",
    "@keyframes af-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }",
    "#af-panel.open { display: flex; }",
    "#af-header { background: " + theme.primary + "; color: white; padding: 14px 16px;",
    "  display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }",
    ".af-hinfo .af-title { font-size: 14px; font-weight: 700; }",
    ".af-hinfo .af-sub   { font-size: 11px; opacity: 0.72; margin-top: 2px; }",
    ".af-hright { display: flex; align-items: center; gap: 10px; }",
    ".af-dot { width: 7px; height: 7px; border-radius: 50%; background: #00FF88; animation: af-pulse 2s infinite; }",
    "@keyframes af-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }",
    "#af-close { cursor:pointer; font-size:18px; opacity:0.75; }",
    "#af-close:hover { opacity:1; }",
    "#af-usage { background: " + theme.light + "; padding: 7px 16px; font-size: 11px; color: " + theme.primary + ";",
    "  display: flex; justify-content: space-between; align-items: center;",
    "  border-bottom: 1px solid #e4e4e4; flex-shrink: 0; }",
    ".af-bar { width: 100px; height: 4px; background: #ddd; border-radius: 2px; }",
    ".af-bar-fill { height:100%; background: " + theme.primary + "; border-radius:2px; transition: width 0.5s; }",
    "#af-messages { flex: 1; padding: 14px 14px 6px; overflow-y: auto; background: #f7f8fa;",
    "  display: flex; flex-direction: column; gap: 10px; min-height: 200px; }",
    ".af-msg { max-width: 86%; padding: 10px 14px; border-radius: 14px; font-size: 13px;",
    "  line-height: 1.55; word-break: break-word; }",
    ".af-msg.user { background: " + theme.primary + "; color: white;",
    "  align-self: flex-end; border-bottom-right-radius: 4px; }",
    ".af-msg.agent { background: white; color: #222; align-self: flex-start;",
    "  border: 1px solid #e2e2e2; border-bottom-left-radius: 4px; }",
    ".af-msg.thinking { background: white; color: #aaa; font-style: italic;",
    "  border: 1px dashed #ddd; align-self: flex-start; }",
    ".af-msg.success { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9;",
    "  align-self: flex-start; border-bottom-left-radius: 4px; font-size: 12.5px; }",
    ".af-msg.error { background: #fdecea; color: #c62828; border: 1px solid #ffcdd2;",
    "  align-self: flex-start; border-bottom-left-radius: 4px; font-size: 12.5px; }",
    ".af-msg.warning { background: #fff8e1; color: #e65100; border: 1px solid #ffe082;",
    "  align-self: flex-start; border-bottom-left-radius: 4px; font-size: 12.5px; }",
    ".af-confirm-card { background: white; border: 1.5px solid " + theme.primary + "44;",
    "  border-radius: 12px; padding: 14px 16px; align-self: flex-start; max-width: 90%;",
    "  box-shadow: 0 2px 12px rgba(0,0,0,0.07); }",
    ".af-confirm-label { font-size: 11px; font-weight: 700; letter-spacing: 0.5px;",
    "  color: " + theme.primary + "; text-transform: uppercase; margin-bottom: 6px; }",
    ".af-confirm-text { font-size: 13px; color: #333; line-height: 1.5; margin-bottom: 12px; }",
    ".af-confirm-btns { display: flex; gap: 8px; }",
    ".af-confirm-btns button { flex: 1; padding: 9px 0; border: none; border-radius: 8px;",
    "  font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.18s; }",
    ".af-btn-yes { background: " + theme.primary + "; color: white; }",
    ".af-btn-no  { background: #f0f0f0; color: #555; }",
    ".af-confirm-btns button:hover { opacity: 0.85; }",
    ".af-confirm-btns button:disabled { opacity: 0.5; cursor: not-allowed; }",
    "#af-chips { padding: 6px 14px 10px; background: #f7f8fa;",
    "  display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0; }",
    ".af-chip { background: white; border: 1px solid #ddd; border-radius: 16px;",
    "  padding: 5px 12px; font-size: 11px; cursor: pointer; color: " + theme.primary + "; transition: all 0.18s; }",
    ".af-chip:hover { background: " + theme.primary + "; color: white; border-color: " + theme.primary + "; }",
    "#af-input-area { padding: 10px 12px; border-top: 1px solid #e6e6e6;",
    "  display: flex; gap: 7px; background: white; flex-shrink: 0; }",
    "#af-input { flex: 1; padding: 10px 14px; border: 1.5px solid #ddd; border-radius: 24px;",
    "  font-size: 13px; outline: none; font-family: inherit; transition: border-color 0.18s; }",
    "#af-input:focus { border-color: " + theme.primary + "; }",
    "#af-input:disabled { background: #f5f5f5; color: #aaa; }",
    "#af-send, #af-mic { width: 38px; height: 38px; border-radius: 50%; border: none;",
    "  cursor: pointer; font-size: 16px; display: flex; align-items: center;",
    "  justify-content: center; transition: all 0.18s; flex-shrink: 0; }",
    "#af-send { background: " + theme.primary + "; color: white; }",
    "#af-send:hover { background: " + theme.accent + "; }",
    "#af-send:disabled { background: #ccc; cursor: not-allowed; }",
    "#af-mic { background: white; color: #666; border: 1.5px solid #ddd; }",
    "#af-mic:hover { border-color: " + theme.primary + "; color: " + theme.primary + "; }",
    "#af-mic:disabled { opacity: 0.4; cursor: not-allowed; }",
    "#af-mic.listening { background: #e53935; color: white; border-color: #e53935; animation: af-pulse 0.8s infinite; }",
    "#af-branding { text-align: center; font-size: 10px; color: #ccc;",
    "  padding: 5px; background: white; border-top: 1px solid #f0f0f0; flex-shrink: 0; }",
    "#af-branding a { color: " + theme.primary + "; text-decoration: none; font-weight: 700; }"
  ].join("\n");
  document.head.appendChild(style);

  // ── Build HTML ────────────────────────────────────────
  const launcher = document.createElement("button");
  launcher.id = "af-launcher";
  launcher.type = "button";
  launcher.innerHTML = "🤖";
  document.body.appendChild(launcher);

  const panel = document.createElement("div");
  panel.id = "af-panel";
  panel.innerHTML =
    '<div id="af-header">' +
      '<div class="af-hinfo">' +
        '<div class="af-title">🤖 AgentFlow AI</div>' +
        '<div class="af-sub" id="af-client-name">Connecting...</div>' +
      '</div>' +
      '<div class="af-hright">' +
        '<div style="display:flex;align-items:center;gap:5px;font-size:11px;">' +
          '<div class="af-dot"></div><span>Live</span>' +
        '</div>' +
        '<span id="af-close">✕</span>' +
      '</div>' +
    '</div>' +
    '<div id="af-usage">' +
      '<span id="af-usage-text">Loading...</span>' +
      '<div class="af-bar"><div class="af-bar-fill" id="af-bar-fill" style="width:0%"></div></div>' +
    '</div>' +
    '<div id="af-messages">' +
      '<div class="af-msg thinking">Connecting to your AI agent...</div>' +
    '</div>' +
    '<div id="af-chips"></div>' +
    '<div id="af-input-area">' +
      '<input id="af-input" type="text" placeholder="Ask me anything or give me a task..." disabled />' +
      '<button id="af-mic" type="button" title="Click to speak" disabled>🎤</button>' +
      '<button id="af-send" type="button" disabled>➤</button>' +
    '</div>' +
    '<div id="af-branding">Powered by <a href="#">AgentFlow</a></div>';
  document.body.appendChild(panel);

  // ── Panel toggle ──────────────────────────────────────
  launcher.addEventListener("click", function () { panel.classList.toggle("open"); });
  document.getElementById("af-close").addEventListener("click", function () { panel.classList.remove("open"); });

  // ── Session storage helpers ───────────────────────────
  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        history: conversationHistory.slice(-40),
        clientInfo: clientInfo
      }));
    } catch (e) {}
  }

  function loadSession() {
    try {
      var raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    conversationHistory = [];
  }

  // ── Message helpers ───────────────────────────────────
  function addMsg(type, html, persist) {
    if (persist === undefined) persist = true;
    var msgs = document.getElementById("af-messages");
    var el = document.createElement("div");
    el.className = "af-msg " + type;
    el.innerHTML = html;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
    if (persist && type !== "thinking") {
      conversationHistory.push({ type: type, html: html, time: Date.now() });
      saveSession();
    }
    return el;
  }

  function clearMessages() {
    document.getElementById("af-messages").innerHTML = "";
  }

  function restoreMessages() {
    if (conversationHistory.length === 0) return false;
    clearMessages();
    var msgs = document.getElementById("af-messages");
    conversationHistory.slice(-20).forEach(function (m) {
      var el = document.createElement("div");
      el.className = "af-msg " + m.type;
      el.innerHTML = m.html;
      msgs.appendChild(el);
    });
    msgs.scrollTop = msgs.scrollHeight;
    return true;
  }

  function updateUsage(used, limit) {
    var pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    document.getElementById("af-usage-text").textContent = used + " / " + limit + " tasks used";
    document.getElementById("af-bar-fill").style.width = pct + "%";
  }

  // ── Voice recognition ─────────────────────────────────
  var micBtn = document.getElementById("af-mic");
  var recognition = null;

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onstart  = function () { micBtn.classList.add("listening"); document.getElementById("af-input").placeholder = "Listening..."; };
    recognition.onend    = function () { micBtn.classList.remove("listening"); document.getElementById("af-input").placeholder = "Ask me anything or give me a task..."; };
    recognition.onerror  = function () { micBtn.classList.remove("listening"); document.getElementById("af-input").placeholder = "Ask me anything or give me a task..."; };
    recognition.onresult = function (e) { document.getElementById("af-input").value = e.results[0][0].transcript; handleSend(); };
    micBtn.addEventListener("click", function () {
      if (micBtn.classList.contains("listening")) { recognition.stop(); } else { recognition.start(); }
    });
  } else {
    micBtn.style.opacity = "0.3";
    micBtn.title = "Voice not supported";
  }

  // ── Page scanner ──────────────────────────────────────
  function scanPage() {
    var idCounter = 0;
    function afId(el) {
      if (!el.dataset.afId) el.dataset.afId = "af_" + idCounter++;
      return el.dataset.afId;
    }

    var buttons = [], inputs = [], links = [], tables = [];

    document.querySelectorAll("button,[role='button'],input[type='button'],input[type='submit']").forEach(function (el) {
      if (el.id === "af-launcher" || el.closest("#af-panel")) return;
      var stepEl = el.closest("[data-wizard-step]");
      var stepInfo = stepEl ? " [wizard-step-" + stepEl.dataset.wizardStep + "]" : "";
      buttons.push({
        afId: afId(el), type: "button",
        text: ((el.textContent || el.value || "").trim().slice(0, 60)) + stepInfo,
        id: el.id || null, disabled: el.disabled
      });
    });

    document.querySelectorAll("input:not([type='button']):not([type='submit']),textarea,select").forEach(function (el) {
      if (el.id === "af-input" || el.closest("#af-panel")) return;
      var stepEl = el.closest("[data-wizard-step]");
      var step = stepEl ? parseInt(stepEl.dataset.wizardStep) : null;
      var isVisible = !stepEl || stepEl.classList.contains("active") || getComputedStyle(stepEl).display !== "none";
      var labelEl = el.labels && el.labels[0] ? el.labels[0] : null;
      var formGroup = el.closest(".form-group");
      var formLabel = formGroup ? formGroup.querySelector(".form-label") : null;
      inputs.push({
        afId: afId(el), type: el.tagName.toLowerCase(),
        placeholder: el.placeholder || null,
        label: (labelEl ? labelEl.textContent.trim() : null) || (formLabel ? formLabel.textContent.trim() : null),
        id: el.id || null, value: el.value || null,
        wizardStep: step, visible: isVisible
      });
    });

    document.querySelectorAll("a[href]").forEach(function (el) {
      if (el.closest("#af-panel")) return;
      links.push({ afId: afId(el), type: "link", text: el.textContent.trim().slice(0, 60), href: el.href || null });
    });

    document.querySelectorAll("table").forEach(function (table) {
      if (table.closest("#af-panel")) return;
      var headers = Array.from(table.querySelectorAll("th")).map(function (th) { return th.textContent.trim(); });
      var rows = Array.from(table.querySelectorAll("tbody tr")).map(function (row) {
        var badge = row.querySelector(".badge,.status");
        return {
          afId: afId(row), id: row.id || null,
          cells: Array.from(row.querySelectorAll("td")).map(function (td) { return td.textContent.trim().slice(0, 60); }),
          status: badge ? badge.textContent.trim() : null
        };
      });
      tables.push({ afId: afId(table), type: "table", id: table.id || null, headers: headers, rows: rows.slice(0, 30) });
    });

    return {
      pageTitle: document.title,
      url: window.location.href,
      pageText: document.body.innerText.slice(0, 600),
      buttons: buttons, inputs: inputs, links: links, tables: tables
    };
  }

  // ── Action executor ───────────────────────────────────
  async function executeActions(actions) {
    var successCount = 0;
    var results = [];

    for (var i = 0; i < actions.length; i++) {
      var action = actions[i];
      await sleep(400);
      try {
        var el = action.afId ? document.querySelector('[data-af-id="' + action.afId + '"]') : null;
        if (!el && action.elementId) el = document.getElementById(action.elementId);
        if (!el && action.selector)  el = document.querySelector(action.selector);

        if (!el && action.type !== "navigate" && action.type !== "scroll" && action.type !== "click_by_text") {
          results.push({ ok: false, msg: "Could not find element for: <em>" + action.description + "</em>" });
          continue;
        }

        if (el) {
          var origOutline = el.style.outline;
          var origBg = el.style.background;
          el.style.outline = "2px solid " + theme.primary;
          el.style.background = theme.light;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(350);
          el.style.outline = origOutline;
          el.style.background = origBg;
        }

        if (action.type === "click") {
          el.click();
          results.push({ ok: true, msg: "🖱️ Clicked <strong>" + action.description + "</strong>" });
          await sleep(600);

        } else if (action.type === "click_by_text") {
          var searchText = (action.value || action.description || "").toLowerCase().trim();
          var allBtns = Array.from(document.querySelectorAll("button,[role='button']")).filter(function (b) { return !b.closest("#af-panel"); });
          var match = null;
          for (var b = 0; b < allBtns.length; b++) {
            if (allBtns[b].textContent.trim().toLowerCase().indexOf(searchText) !== -1) { match = allBtns[b]; break; }
          }
          if (match) {
            match.scrollIntoView({ behavior: "smooth", block: "center" });
            await sleep(300);
            match.click();
            results.push({ ok: true, msg: "🖱️ Clicked \"<strong>" + match.textContent.trim().slice(0, 40) + "</strong>\"" });
            await sleep(700);
          } else {
            results.push({ ok: false, msg: "⚠️ Could not find button with text: \"" + action.value + "\"" });
          }

        } else if (action.type === "fill") {
          el.focus();
          el.value = action.value;
          el.dispatchEvent(new Event("input",  { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          results.push({ ok: true, msg: "✏️ Filled <strong>" + action.description + "</strong> → \"" + action.value + "\"" });

        } else if (action.type === "fill_by_label") {
          var labelText = (action.value || "").toLowerCase();
          var allLabels = Array.from(document.querySelectorAll(".form-label, label"));
          var targetLabel = null;
          for (var l = 0; l < allLabels.length; l++) {
            if (allLabels[l].textContent.trim().toLowerCase().indexOf(labelText) !== -1) { targetLabel = allLabels[l]; break; }
          }
          var targetInput = targetLabel ? (targetLabel.nextElementSibling || document.getElementById(targetLabel.getAttribute("for"))) : null;
          if (targetInput && (targetInput.tagName === "INPUT" || targetInput.tagName === "TEXTAREA" || targetInput.tagName === "SELECT")) {
            targetInput.focus();
            targetInput.value = action.description;
            targetInput.dispatchEvent(new Event("input",  { bubbles: true }));
            targetInput.dispatchEvent(new Event("change", { bubbles: true }));
            results.push({ ok: true, msg: "✏️ Filled \"" + labelText + "\" → \"" + action.description + "\"" });
          } else {
            results.push({ ok: false, msg: "⚠️ Could not find field labelled: \"" + labelText + "\"" });
          }

        } else if (action.type === "select") {
          el.value = action.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          results.push({ ok: true, msg: "📋 Selected <strong>" + action.description + "</strong> → \"" + action.value + "\"" });

        } else if (action.type === "approve_row") {
          var appBtn = el.querySelector(".btn-approve,[class*='approve']") ||
            Array.from(el.querySelectorAll("button")).find(function (b) { return /approve/i.test(b.textContent); });
          if (appBtn) { appBtn.click(); results.push({ ok: true, msg: "✅ Approved — <strong>" + action.description + "</strong>" }); }
          else results.push({ ok: false, msg: "⚠️ No approve button found in row: <strong>" + action.description + "</strong>" });

        } else if (action.type === "reject_row") {
          var rejBtn = el.querySelector(".btn-reject,[class*='reject']") ||
            Array.from(el.querySelectorAll("button")).find(function (b) { return /reject/i.test(b.textContent); });
          if (rejBtn) { rejBtn.click(); results.push({ ok: true, msg: "❌ Rejected — <strong>" + action.description + "</strong>" }); }
          else results.push({ ok: false, msg: "⚠️ No reject button found in row: <strong>" + action.description + "</strong>" });

        } else if (action.type === "escalate_row") {
          var escBtn = el.querySelector(".btn-escalate,[class*='escalate']") ||
            Array.from(el.querySelectorAll("button")).find(function (b) { return /escalate|flag|hold/i.test(b.textContent); });
          if (escBtn) { escBtn.click(); results.push({ ok: true, msg: "⚠️ Escalated — <strong>" + action.description + "</strong>" }); }
          else {
            el.style.background = "#fff8e1";
            el.style.outline = "2px solid #f57f17";
            results.push({ ok: true, msg: "⚠️ Flagged for escalation — <strong>" + action.description + "</strong>" });
          }

        } else if (action.type === "navigate") {
          results.push({ ok: true, msg: "🔗 Navigating to <strong>" + action.description + "</strong>" });
          await sleep(300);
          window.location.href = action.value;

        } else if (action.type === "scroll") {
          if (action.value === "top")    window.scrollTo({ top: 0, behavior: "smooth" });
          if (action.value === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          if (action.value === "down")   window.scrollBy({ top: 300, behavior: "smooth" });
          if (action.value === "up")     window.scrollBy({ top: -300, behavior: "smooth" });
          results.push({ ok: true, msg: "↕️ Scrolled <strong>" + action.value + "</strong>" });

        } else {
          results.push({ ok: false, msg: "Unknown action type: " + action.type });
        }

        if (results[results.length - 1] && results[results.length - 1].ok) successCount++;

      } catch (err) {
        results.push({ ok: false, msg: "Error: " + err.message });
      }
    }

    // Show results
    var okMsgs  = results.filter(function (r) { return r.ok; });
    var errMsgs = results.filter(function (r) { return !r.ok; });
    if (okMsgs.length > 0)  addMsg("success", okMsgs.map(function (r) { return r.msg; }).join("<br>"));
    if (errMsgs.length > 0) addMsg("error",   errMsgs.map(function (r) { return r.msg; }).join("<br>"));

    // ── Rich audit trail ──────────────────────────────────
    var operator = detectOperator();
    fetch(BACKEND_URL + "/api/agent/confirm", {
      method: "POST",
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({
        command:   pendingPlan ? pendingPlan.originalCommand : "",
        action:    pendingPlan ? pendingPlan.taskType : "task",
        pageTitle: document.title,
        pageUrl:   window.location.href,
        rowCount:  actions.length,
        results:   results.map(function (r) { return r.msg; }),
        actionDetails: actions.map(function (a) {
          var match = results.find(function (r) { return r.msg && r.msg.indexOf(a.description) !== -1; });
          return {
            type:        a.type,
            description: a.description,
            value:       a.value || null,
            elementId:   a.elementId || null,
            success:     match ? match.ok : null
          };
        }),
        operator: {
          detectedName: operator,
          source:       operator ? "page-scrape" : "unknown"
        },
        device:    deviceInfo,
        sessionId: SESSION_KEY
      })
    }).catch(function () {});
  }

  // ── Show confirmation card ────────────────────────────
  function showConfirmCard(reply, plan) {
    pendingPlan = plan;

    var card = document.createElement("div");
    card.className = "af-confirm-card";
    card.innerHTML =
      '<div class="af-confirm-label">⚡ Planned Action</div>' +
      '<div class="af-confirm-text">' + reply + '</div>' +
      '<div class="af-confirm-btns">' +
        '<button class="af-btn-yes" type="button">✅ Yes, do it</button>' +
        '<button class="af-btn-no"  type="button">✕ Cancel</button>' +
      '</div>';

    var msgs = document.getElementById("af-messages");
    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;
    setInputLocked(true);

    card.querySelector(".af-btn-yes").addEventListener("click", async function () {
      card.querySelector(".af-btn-yes").disabled = true;
      card.querySelector(".af-btn-no").disabled  = true;
      card.querySelector(".af-confirm-label").textContent = "⏳ Executing...";
      await executeActions(plan.actions || []);
      card.remove();
      pendingPlan = null;
      setInputLocked(false);
    });

    card.querySelector(".af-btn-no").addEventListener("click", function () {
      card.remove();
      pendingPlan = null;
      addMsg("agent", "Alright, cancelled. What else can I help you with?");
      setInputLocked(false);
    });
  }

  // ── Lock/unlock input ─────────────────────────────────
  function setInputLocked(locked) {
    isProcessing = locked;
    document.getElementById("af-input").disabled = locked;
    document.getElementById("af-send").disabled  = locked;
    document.getElementById("af-mic").disabled   = locked;
  }

  // ── Send message to backend ───────────────────────────
  async function sendMessage(message) {
    setInputLocked(true);
    addMsg("user", message);
    var thinking = addMsg("thinking", "🧠 Thinking...", false);

    try {
      var pageContext = scanPage();
      var historyForAI = conversationHistory.slice(-20).map(function (m) {
        return { role: m.type === "user" ? "user" : "assistant", content: m.html.replace(/<[^>]+>/g, "") };
      });

      var res = await fetch(BACKEND_URL + "/api/agent/message", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ message: message, pageContext: pageContext, history: historyForAI })
      });

      thinking.remove();
      if (!res.ok) throw new Error("Backend error " + res.status);

      var data = await res.json();
      if (!data.success) throw new Error(data.error || "Unknown error");

      var response = data.response;

      if (response.type === "chat") {
        addMsg("agent", response.reply);
        setInputLocked(false);
      } else if (response.type === "task") {
        if (response.plan && response.plan.actions && response.plan.actions.length > 0) {
          response.plan.originalCommand = message;
          showConfirmCard(response.reply, response.plan);
        } else {
          addMsg("agent", response.reply);
          setInputLocked(false);
        }
      } else {
        addMsg("agent", response.reply || "Done.");
        setInputLocked(false);
      }

    } catch (err) {
      thinking.remove();
      addMsg("error", "⚠️ Something went wrong. Check that the server is running.");
      console.error("AgentFlow error:", err);
      setInputLocked(false);
    }
  }

  // ── Send handler ──────────────────────────────────────
  function handleSend() {
    if (isProcessing) return;
    var input = document.getElementById("af-input");
    var text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(text);
  }

  document.getElementById("af-send").addEventListener("click", function (e) { e.preventDefault(); handleSend(); });
  document.getElementById("af-input").addEventListener("keydown", function (e) { if (e.key === "Enter") { e.preventDefault(); handleSend(); } });

  // ── Smart chips ───────────────────────────────────────
  async function loadChips() {
    var chipEl = document.getElementById("af-chips");
    var defaultChips = ["Approve all pending", "Reject flagged items", "Escalate high-value", "Show summary"];
    renderChips(defaultChips);

    try {
      var pageContext = scanPage();
      var rows = (pageContext.tables && pageContext.tables[0] ? pageContext.tables[0].rows.slice(0, 8) : []);
      var res = await fetch(BACKEND_URL + "/api/agent/suggest", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ industry: clientInfo ? clientInfo.industry : "", rows: rows })
      });
      if (res.ok) {
        var d = await res.json();
        if (d.success && d.suggestions && d.suggestions.length) renderChips(d.suggestions);
      }
    } catch (e) {}

    function renderChips(labels) {
      chipEl.innerHTML = "";
      labels.slice(0, 5).forEach(function (label) {
        var chip = document.createElement("button");
        chip.className = "af-chip";
        chip.type = "button";
        chip.textContent = label;
        chip.addEventListener("click", function () {
          if (!isProcessing) { document.getElementById("af-input").value = label; handleSend(); }
        });
        chipEl.appendChild(chip);
      });
    }
  }

  // ── Utility ───────────────────────────────────────────
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // ── Init ──────────────────────────────────────────────
  async function init() {
    try {
      var res = await fetch(BACKEND_URL + "/api/agent/status", {
        headers: { "x-api-key": API_KEY, "ngrok-skip-browser-warning": "true" }
      });
      var data = await res.json();

      if (!data.success) {
        clearMessages();
        addMsg("error", "⚠️ " + (data.error || "Could not connect."), false);
        return;
      }

      clientInfo = data.client;
      document.getElementById("af-client-name").textContent = clientInfo.name;
      updateUsage(clientInfo.tasksUsed, clientInfo.tasksLimit);

      var session = loadSession();
      if (session && session.history && session.history.length > 0) {
        conversationHistory = session.history;
        restoreMessages();
        var pageNote = document.createElement("div");
        pageNote.style.cssText = "text-align:center;font-size:11px;color:#bbb;padding:4px 0;";
        pageNote.textContent = "— now on: " + document.title + " —";
        document.getElementById("af-messages").appendChild(pageNote);
        document.getElementById("af-messages").scrollTop = 999999;
      } else {
        clearMessages();
        addMsg("agent",
          "👋 Hello! I'm your AI agent for <strong>" + clientInfo.name + "</strong>.<br><br>" +
          "I can see your page and understand natural language. Just tell me what you want done — " +
          "I'll always show you exactly what I'm about to do before acting.<br><br>" +
          "<em>What would you like me to handle?</em>"
        );
      }

      setInputLocked(false);
      loadChips();

    } catch (err) {
      clearMessages();
      addMsg("error", "⚠️ Could not connect to AgentFlow backend.", false);
      console.error("AgentFlow init:", err);
    }
  }

  init();

}());