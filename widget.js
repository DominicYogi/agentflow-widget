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
  let conversationHistory = [];        // persists across pages via sessionStorage
  const SESSION_KEY       = "af_conv_" + (API_KEY || "default");

  // ── Styles ────────────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }

    #af-launcher {
      position: fixed; bottom: 30px; right: 30px;
      width: 58px; height: 58px;
      background: ${theme.primary};
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 24px ${theme.primary}55;
      z-index: 9999;
      transition: transform 0.2s, box-shadow 0.2s;
      font-size: 26px; border: none;
    }
    #af-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 28px ${theme.primary}77; }

    #af-panel {
      position: fixed; bottom: 106px; right: 30px;
      width: 400px;
      background: #fff;
      border-radius: 18px;
      box-shadow: 0 12px 56px rgba(0,0,0,0.16);
      z-index: 9998;
      display: none; flex-direction: column;
      overflow: hidden;
      border: 1px solid #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      animation: af-up 0.22s ease;
      max-height: 620px;
    }
    @keyframes af-up {
      from { opacity:0; transform:translateY(14px); }
      to   { opacity:1; transform:translateY(0); }
    }
    #af-panel.open { display: flex; }

    /* Header */
    #af-header {
      background: ${theme.primary};
      color: white; padding: 14px 16px;
      display: flex; justify-content: space-between; align-items: center;
      flex-shrink: 0;
    }
    .af-hinfo .af-title { font-size: 14px; font-weight: 700; }
    .af-hinfo .af-sub   { font-size: 11px; opacity: 0.72; margin-top: 2px; }
    .af-hright { display: flex; align-items: center; gap: 10px; }
    .af-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: #00FF88; animation: af-pulse 2s infinite;
    }
    @keyframes af-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
    #af-close { cursor:pointer; font-size:18px; opacity:0.75; }
    #af-close:hover { opacity:1; }

    /* Usage bar */
    #af-usage {
      background: ${theme.light};
      padding: 7px 16px; font-size: 11px;
      color: ${theme.primary};
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #e4e4e4; flex-shrink: 0;
    }
    .af-bar { width: 100px; height: 4px; background: #ddd; border-radius: 2px; }
    .af-bar-fill { height:100%; background: ${theme.primary}; border-radius:2px; transition: width 0.5s; }

    /* Messages */
    #af-messages {
      flex: 1; padding: 14px 14px 6px;
      overflow-y: auto;
      background: #f7f8fa;
      display: flex; flex-direction: column; gap: 10px;
      min-height: 200px;
    }
    .af-msg {
      max-width: 86%; padding: 10px 14px;
      border-radius: 14px; font-size: 13px; line-height: 1.55;
      word-break: break-word;
    }
    .af-msg.user {
      background: ${theme.primary}; color: white;
      align-self: flex-end; border-bottom-right-radius: 4px;
    }
    .af-msg.agent {
      background: white; color: #222;
      align-self: flex-start; border: 1px solid #e2e2e2;
      border-bottom-left-radius: 4px;
    }
    .af-msg.thinking {
      background: white; color: #aaa; font-style: italic;
      border: 1px dashed #ddd; align-self: flex-start;
    }
    .af-msg.success {
      background: #e8f5e9; color: #2e7d32;
      border: 1px solid #c8e6c9; align-self: flex-start;
      border-bottom-left-radius: 4px; font-size: 12.5px;
    }
    .af-msg.error {
      background: #fdecea; color: #c62828;
      border: 1px solid #ffcdd2; align-self: flex-start;
      border-bottom-left-radius: 4px; font-size: 12.5px;
    }
    .af-msg.warning {
      background: #fff8e1; color: #e65100;
      border: 1px solid #ffe082; align-self: flex-start;
      border-bottom-left-radius: 4px; font-size: 12.5px;
    }

    /* Confirm card — shown inside messages */
    .af-confirm-card {
      background: white; border: 1.5px solid ${theme.primary}44;
      border-radius: 12px; padding: 14px 16px;
      align-self: flex-start; max-width: 90%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    }
    .af-confirm-label {
      font-size: 11px; font-weight: 700; letter-spacing: 0.5px;
      color: ${theme.primary}; text-transform: uppercase; margin-bottom: 6px;
    }
    .af-confirm-text {
      font-size: 13px; color: #333; line-height: 1.5; margin-bottom: 12px;
    }
    .af-confirm-btns { display: flex; gap: 8px; }
    .af-confirm-btns button {
      flex: 1; padding: 9px 0; border: none; border-radius: 8px;
      font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.18s;
    }
    .af-btn-yes { background: ${theme.primary}; color: white; }
    .af-btn-no  { background: #f0f0f0; color: #555; }
    .af-confirm-btns button:hover { opacity: 0.85; }
    .af-confirm-btns button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* Chips */
    #af-chips {
      padding: 6px 14px 10px; background: #f7f8fa;
      display: flex; flex-wrap: wrap; gap: 6px; flex-shrink: 0;
    }
    .af-chip {
      background: white; border: 1px solid #ddd;
      border-radius: 16px; padding: 5px 12px;
      font-size: 11px; cursor: pointer; color: ${theme.primary};
      transition: all 0.18s;
    }
    .af-chip:hover { background: ${theme.primary}; color: white; border-color: ${theme.primary}; }

    /* Input */
    #af-input-area {
      padding: 10px 12px; border-top: 1px solid #e6e6e6;
      display: flex; gap: 7px; background: white; flex-shrink: 0;
    }
    #af-input {
      flex: 1; padding: 10px 14px;
      border: 1.5px solid #ddd; border-radius: 24px;
      font-size: 13px; outline: none;
      font-family: inherit; transition: border-color 0.18s;
    }
    #af-input:focus { border-color: ${theme.primary}; }
    #af-input:disabled { background: #f5f5f5; color: #aaa; }
    #af-send, #af-mic {
      width: 38px; height: 38px; border-radius: 50%;
      border: none; cursor: pointer; font-size: 16px;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.18s; flex-shrink: 0;
    }
    #af-send { background: ${theme.primary}; color: white; }
    #af-send:hover { background: ${theme.accent}; }
    #af-send:disabled { background: #ccc; cursor: not-allowed; }
    #af-mic { background: white; color: #666; border: 1.5px solid #ddd; }
    #af-mic:hover { border-color: ${theme.primary}; color: ${theme.primary}; }
    #af-mic:disabled { opacity: 0.4; cursor: not-allowed; }
    #af-mic.listening { background: #e53935; color: white; border-color: #e53935; animation: af-pulse 0.8s infinite; }

    /* Branding */
    #af-branding {
      text-align: center; font-size: 10px; color: #ccc;
      padding: 5px; background: white; border-top: 1px solid #f0f0f0; flex-shrink: 0;
    }
    #af-branding a { color: ${theme.primary}; text-decoration: none; font-weight: 700; }
  `;
  document.head.appendChild(style);

  // ── Build HTML ────────────────────────────────────────
  const launcher = document.createElement("button");
  launcher.id = "af-launcher";
  launcher.type = "button";
  launcher.innerHTML = "🤖";
  document.body.appendChild(launcher);

  const panel = document.createElement("div");
  panel.id = "af-panel";
  panel.innerHTML = `
    <div id="af-header">
      <div class="af-hinfo">
        <div class="af-title">🤖 AgentFlow AI</div>
        <div class="af-sub" id="af-client-name">Connecting...</div>
      </div>
      <div class="af-hright">
        <div style="display:flex;align-items:center;gap:5px;font-size:11px;">
          <div class="af-dot"></div><span>Live</span>
        </div>
        <span id="af-close">✕</span>
      </div>
    </div>
    <div id="af-usage">
      <span id="af-usage-text">Loading...</span>
      <div class="af-bar"><div class="af-bar-fill" id="af-bar-fill" style="width:0%"></div></div>
    </div>
    <div id="af-messages">
      <div class="af-msg thinking">Connecting to your AI agent...</div>
    </div>
    <div id="af-chips"></div>
    <div id="af-input-area">
      <input id="af-input" type="text" placeholder="Ask me anything or give me a task..." disabled />
      <button id="af-mic" type="button" title="Click to speak" disabled>🎤</button>
      <button id="af-send" type="button" disabled>➤</button>
    </div>
    <div id="af-branding">Powered by <a href="#">AgentFlow</a></div>
  `;
  document.body.appendChild(panel);

  // ── Panel toggle ──────────────────────────────────────
  launcher.addEventListener("click", () => panel.classList.toggle("open"));
  document.getElementById("af-close").addEventListener("click", () => panel.classList.remove("open"));

  // ── Session storage helpers ──────────────────────────
  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        history: conversationHistory.slice(-40), // keep last 40 exchanges
        clientInfo
      }));
    } catch (e) {}
  }

  function loadSession() {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) { return null; }
  }

  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {}
    conversationHistory = [];
  }

  // ── Message helpers ───────────────────────────────────
  // persist=true saves to session (false for ephemeral msgs like "thinking")
  function addMsg(type, html, persist = true) {
    const msgs = document.getElementById("af-messages");
    const el = document.createElement("div");
    el.className = "af-msg " + type;
    el.innerHTML = html;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;

    // Save to history (skip thinking/confirm bubbles)
    if (persist && type !== "thinking") {
      conversationHistory.push({ type, html, time: Date.now() });
      saveSession();
    }

    return el;
  }

  function clearMessages() {
    document.getElementById("af-messages").innerHTML = "";
  }

  // Restore messages from session into the panel
  function restoreMessages() {
    if (conversationHistory.length === 0) return false;
    clearMessages();
    // Show last 20 messages so panel doesn't get overwhelming
    conversationHistory.slice(-20).forEach(m => {
      const msgs = document.getElementById("af-messages");
      const el = document.createElement("div");
      el.className = "af-msg " + m.type;
      el.innerHTML = m.html;
      msgs.appendChild(el);
    });
    const msgs = document.getElementById("af-messages");
    msgs.scrollTop = msgs.scrollHeight;
    return true;
  }
  function updateUsage(used, limit) {
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    document.getElementById("af-usage-text").textContent = `${used} / ${limit} tasks used`;
    document.getElementById("af-bar-fill").style.width = pct + "%";
  }

  // ── Voice recognition ─────────────────────────────────
  const micBtn = document.getElementById("af-mic");
  let recognition = null;

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart  = () => { micBtn.classList.add("listening"); document.getElementById("af-input").placeholder = "Listening..."; };
    recognition.onend    = () => { micBtn.classList.remove("listening"); document.getElementById("af-input").placeholder = "Ask me anything or give me a task..."; };
    recognition.onerror  = () => { micBtn.classList.remove("listening"); document.getElementById("af-input").placeholder = "Ask me anything or give me a task..."; };
    recognition.onresult = (e) => { document.getElementById("af-input").value = e.results[0][0].transcript; handleSend(); };

    micBtn.addEventListener("click", () => micBtn.classList.contains("listening") ? recognition.stop() : recognition.start());
  } else {
    micBtn.style.opacity = "0.3";
    micBtn.title = "Voice not supported";
  }

  // ── Page scanner — sends full DOM context to AI ───────
  function scanPage() {
    let idCounter = 0;
    function afId(el) {
      if (!el.dataset.afId) el.dataset.afId = "af_" + idCounter++;
      return el.dataset.afId;
    }

    const buttons = [], inputs = [], links = [], tables = [];

    document.querySelectorAll("button,[role='button'],input[type='button'],input[type='submit']").forEach(el => {
      if (el.id === "af-launcher" || el.closest("#af-panel")) return;
      buttons.push({ afId: afId(el), type: "button", text: (el.textContent || el.value || "").trim().slice(0, 60), id: el.id || null, disabled: el.disabled });
    });

    document.querySelectorAll("input:not([type='button']):not([type='submit']),textarea,select").forEach(el => {
      if (el.id === "af-input" || el.closest("#af-panel")) return;
      inputs.push({ afId: afId(el), type: el.tagName.toLowerCase(), placeholder: el.placeholder || null, label: el.labels?.[0]?.textContent?.trim() || null, id: el.id || null, value: el.value || null });
    });

    document.querySelectorAll("a[href]").forEach(el => {
      if (el.closest("#af-panel")) return;
      links.push({ afId: afId(el), type: "link", text: el.textContent.trim().slice(0, 60), href: el.href || null });
    });

    document.querySelectorAll("table").forEach(table => {
      if (table.closest("#af-panel")) return;
      const headers = Array.from(table.querySelectorAll("th")).map(th => th.textContent.trim());
      const rows = Array.from(table.querySelectorAll("tbody tr")).map(row => ({
        afId: afId(row),
        id: row.id || null,
        cells: Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim().slice(0, 60)),
        status: row.querySelector(".badge,.status")?.textContent?.trim() || null
      }));
      tables.push({ afId: afId(table), type: "table", id: table.id || null, headers, rows: rows.slice(0, 30) });
    });

    return {
      pageTitle: document.title,
      url: window.location.href,
      pageText: document.body.innerText.slice(0, 600),
      buttons, inputs, links, tables
    };
  }

  // ── Action executor ───────────────────────────────────
  async function executeActions(actions) {
    let successCount = 0;
    const results = [];

    for (const action of actions) {
      await sleep(400);
      try {
        // Find element
        let el = action.afId ? document.querySelector(`[data-af-id="${action.afId}"]`) : null;
        if (!el && action.elementId) el = document.getElementById(action.elementId);
        if (!el && action.selector)  el = document.querySelector(action.selector);

        if (!el && action.type !== "navigate" && action.type !== "scroll") {
          results.push({ ok: false, msg: `Could not find element for: <em>${action.description}</em>` });
          continue;
        }

        // Highlight
        if (el) {
          const origOutline = el.style.outline;
          const origBg = el.style.background;
          el.style.outline = `2px solid ${theme.primary}`;
          el.style.background = theme.light;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(350);
          el.style.outline = origOutline;
          el.style.background = origBg;
        }

        switch (action.type) {
          case "click":
            el.click();
            results.push({ ok: true, msg: `🖱️ Clicked <strong>${action.description}</strong>` });
            break;

          case "fill":
            el.focus();
            el.value = action.value;
            el.dispatchEvent(new Event("input",  { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            results.push({ ok: true, msg: `✏️ Filled <strong>${action.description}</strong> → "${action.value}"` });
            break;

          case "select":
            el.value = action.value;
            el.dispatchEvent(new Event("change", { bubbles: true }));
            results.push({ ok: true, msg: `📋 Selected <strong>${action.description}</strong> → "${action.value}"` });
            break;

          case "approve_row":
            const appBtn = el.querySelector(".btn-approve,[class*='approve']")
              || Array.from(el.querySelectorAll("button")).find(b => /approve/i.test(b.textContent));
            if (appBtn) { appBtn.click(); results.push({ ok: true, msg: `✅ Approved — <strong>${action.description}</strong>` }); }
            else results.push({ ok: false, msg: `⚠️ No approve button found in row: <strong>${action.description}</strong>` });
            break;

          case "reject_row":
            const rejBtn = el.querySelector(".btn-reject,[class*='reject']")
              || Array.from(el.querySelectorAll("button")).find(b => /reject/i.test(b.textContent));
            if (rejBtn) { rejBtn.click(); results.push({ ok: true, msg: `❌ Rejected — <strong>${action.description}</strong>` }); }
            else results.push({ ok: false, msg: `⚠️ No reject button found in row: <strong>${action.description}</strong>` });
            break;

          case "escalate_row":
            const escBtn = el.querySelector(".btn-escalate,[class*='escalate']")
              || Array.from(el.querySelectorAll("button")).find(b => /escalate|flag|hold/i.test(b.textContent));
            if (escBtn) { escBtn.click(); results.push({ ok: true, msg: `⚠️ Escalated — <strong>${action.description}</strong>` }); }
            else {
              // Fallback: highlight row yellow and mark it
              el.style.background = "#fff8e1";
              el.style.outline = "2px solid #f57f17";
              results.push({ ok: true, msg: `⚠️ Flagged for escalation — <strong>${action.description}</strong>` });
            }
            break;

          case "navigate":
            results.push({ ok: true, msg: `🔗 Navigating to <strong>${action.description}</strong>` });
            await sleep(300);
            window.location.href = action.value;
            break;

          case "scroll":
            if (action.value === "top")    window.scrollTo({ top: 0, behavior: "smooth" });
            if (action.value === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
            if (action.value === "down")   window.scrollBy({ top: 300, behavior: "smooth" });
            if (action.value === "up")     window.scrollBy({ top: -300, behavior: "smooth" });
            results.push({ ok: true, msg: `↕️ Scrolled <strong>${action.value}</strong>` });
            break;

          default:
            results.push({ ok: false, msg: `Unknown action type: ${action.type}` });
        }
        if (results[results.length-1]?.ok) successCount++;

      } catch (err) {
        results.push({ ok: false, msg: `Error: ${err.message}` });
      }
    }

    // Show results
    const okMsgs  = results.filter(r => r.ok);
    const errMsgs = results.filter(r => !r.ok);

    if (okMsgs.length > 0) {
      addMsg("success", okMsgs.map(r => r.msg).join("<br>"));
    }
    if (errMsgs.length > 0) {
      addMsg("error", errMsgs.map(r => r.msg).join("<br>"));
    }

    // Log to backend
    fetch(`${BACKEND_URL}/api/agent/confirm`, {
      method: "POST",
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({
        command: pendingPlan?.originalCommand || "",
        action: pendingPlan?.taskType || "task",
        pageTitle: document.title,
        rowCount: actions.length,
        results: results.map(r => r.msg)
      })
    }).catch(() => {});
  }

  // ── Show confirmation card ────────────────────────────
  function showConfirmCard(reply, plan) {
    pendingPlan = plan;

    const card = document.createElement("div");
    card.className = "af-confirm-card";
    card.innerHTML = `
      <div class="af-confirm-label">⚡ Planned Action</div>
      <div class="af-confirm-text">${reply}</div>
      <div class="af-confirm-btns">
        <button class="af-btn-yes" type="button">✅ Yes, do it</button>
        <button class="af-btn-no"  type="button">✕ Cancel</button>
      </div>
    `;

    const msgs = document.getElementById("af-messages");
    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;

    // Lock input while waiting
    setInputLocked(true);

    card.querySelector(".af-btn-yes").addEventListener("click", async () => {
      card.querySelector(".af-btn-yes").disabled = true;
      card.querySelector(".af-btn-no").disabled  = true;
      card.querySelector(".af-confirm-label").textContent = "⏳ Executing...";

      await executeActions(plan.actions || []);

      card.remove();
      pendingPlan = null;
      setInputLocked(false);
    });

    card.querySelector(".af-btn-no").addEventListener("click", () => {
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

    const thinking = addMsg("thinking", "🧠 Thinking...", false); // ephemeral

    try {
      const pageContext = scanPage();

      // Build history for Groq — last 10 exchanges only (keep tokens low)
      const historyForAI = conversationHistory.slice(-20).map(m => ({
        role: m.type === "user" ? "user" : "assistant",
        content: m.html.replace(/<[^>]+>/g, "") // strip HTML tags
      }));

      const res = await fetch(`${BACKEND_URL}/api/agent/message`, {
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({ message, pageContext, history: historyForAI })
      });

      thinking.remove();

      if (!res.ok) throw new Error("Backend error " + res.status);

      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Unknown error");

      const response = data.response;

      if (response.type === "chat") {
        // Pure conversation
        addMsg("agent", response.reply);
        setInputLocked(false);

      } else if (response.type === "task") {
        // AI wants to do something — show confirmation first
        if (response.plan?.actions?.length > 0) {
          response.plan.originalCommand = message;
          showConfirmCard(response.reply, response.plan);
          // Input stays locked until user confirms or cancels
        } else {
          // AI planned a task but found nothing to act on
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
    const input = document.getElementById("af-input");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendMessage(text);
  }

  document.getElementById("af-send").addEventListener("click", e => { e.preventDefault(); handleSend(); });
  document.getElementById("af-input").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } });

  // ── Smart chips ───────────────────────────────────────
  async function loadChips() {
    const chipEl = document.getElementById("af-chips");

    const defaultChips = ["Approve all pending", "Reject flagged items", "Escalate high-value", "Show summary"];
    renderChips(defaultChips);

    try {
      const pageContext = scanPage();
      const rows = pageContext.tables?.[0]?.rows?.slice(0, 8) || [];
      const res = await fetch(`${BACKEND_URL}/api/agent/suggest`, {
        method: "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({ industry: clientInfo?.industry, rows })
      });
      if (res.ok) {
        const d = await res.json();
        if (d.success && d.suggestions?.length) renderChips(d.suggestions);
      }
    } catch (e) {}

    function renderChips(labels) {
      chipEl.innerHTML = "";
      labels.slice(0, 5).forEach(label => {
        const chip = document.createElement("button");
        chip.className = "af-chip";
        chip.type = "button";
        chip.textContent = label;
        chip.addEventListener("click", () => {
          if (!isProcessing) {
            document.getElementById("af-input").value = label;
            handleSend();
          }
        });
        chipEl.appendChild(chip);
      });
    }
  }

  // ── Utility ───────────────────────────────────────────
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ── Init ──────────────────────────────────────────────
  async function init() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/agent/status`, {
        headers: { "x-api-key": API_KEY, "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();

      if (!data.success) {
        clearMessages();
        addMsg("error", `⚠️ ${data.error || "Could not connect."}`, false);
        return;
      }

      clientInfo = data.client;
      document.getElementById("af-client-name").textContent = clientInfo.name;
      updateUsage(clientInfo.tasksUsed, clientInfo.tasksLimit);

      // ── Restore previous session if available ────────────
      const session = loadSession();
      if (session?.history?.length > 0) {
        conversationHistory = session.history;
        restoreMessages();

        // Add a subtle page-change notice
        const pageNote = document.createElement("div");
        pageNote.style.cssText = "text-align:center;font-size:11px;color:#bbb;padding:4px 0;";
        pageNote.textContent = `— now on: ${document.title} —`;
        document.getElementById("af-messages").appendChild(pageNote);
        document.getElementById("af-messages").scrollTop = 999999;

      } else {
        // Fresh session — show welcome
        clearMessages();
        addMsg("agent",
          `👋 Hello! I'm your AI agent for <strong>${clientInfo.name}</strong>.<br><br>` +
          `I can see your page and understand natural language. Just tell me what you want done — ` +
          `I'll always show you exactly what I'm about to do before acting.<br><br>` +
          `<em>What would you like me to handle?</em>`
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

})();