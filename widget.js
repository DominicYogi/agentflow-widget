(function () {

  // ── Config ────────────────────────────────────────────
  const BACKEND_URL = "http://localhost:3000";
  const API_KEY = document.currentScript?.getAttribute("data-api-key") || "af_live_medicare001";
  const THEME = document.currentScript?.getAttribute("data-theme") || "blue";

  const THEMES = {
    blue: { primary: "#0052cc", light: "#e8f0fe", accent: "#003d99" },
    green: { primary: "#27ae60", light: "#e8f5e9", accent: "#219150" },
    dark: { primary: "#1a1a2e", light: "#f0f0f0", accent: "#16213e" },
  };
  const theme = THEMES[THEME] || THEMES.blue;

  // ── State ─────────────────────────────────────────────
  let clientInfo = null;
  let isProcessing = false;

  // ── Inject Styles ─────────────────────────────────────
  const style = document.createElement("style");
  style.textContent = `
    #af-launcher {
      position: fixed; bottom: 30px; right: 30px;
      width: 56px; height: 56px;
      background: ${theme.primary};
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      cursor: pointer;
      box-shadow: 0 4px 20px ${theme.primary}66;
      z-index: 9999;
      transition: all 0.3s ease;
      font-size: 24px;
      border: none;
    }
    #af-launcher:hover { transform: scale(1.1); }

    #af-panel {
      position: fixed; bottom: 100px; right: 30px;
      width: 390px;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 10px 50px rgba(0,0,0,0.15);
      z-index: 9998;
      display: none;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid #e0e0e0;
      font-family: Arial, sans-serif;
      animation: af-slide-up 0.25s ease;
    }
    @keyframes af-slide-up {
      from { opacity: 0; transform: translateY(16px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #af-panel.open { display: flex; }

    #af-header {
      background: ${theme.primary};
      color: white;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    #af-header .af-title { font-size: 14px; font-weight: bold; }
    #af-header .af-sub { font-size: 11px; opacity: 0.7; margin-top: 2px; }
    #af-header .af-status {
      display: flex; align-items: center; gap: 6px;
      font-size: 11px; opacity: 0.9;
    }
    .af-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: #00FF88;
      animation: af-pulse 2s infinite;
    }
    @keyframes af-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    #af-close {
      cursor: pointer; font-size: 18px;
      opacity: 0.7; margin-left: 12px;
    }
    #af-close:hover { opacity: 1; }

    #af-usage {
      background: ${theme.light};
      padding: 8px 16px;
      font-size: 11px;
      color: ${theme.primary};
      display: flex;
      justify-content: space-between;
      border-bottom: 1px solid #e8e8e8;
    }
    .af-usage-bar {
      height: 3px;
      background: #ddd;
      border-radius: 2px;
      margin-top: 4px;
    }
    .af-usage-fill {
      height: 100%;
      background: ${theme.primary};
      border-radius: 2px;
      transition: width 0.5s ease;
    }

    #af-messages {
      flex: 1;
      padding: 14px;
      overflow-y: auto;
      max-height: 320px;
      min-height: 180px;
      background: #f8f9fa;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .af-msg {
      max-width: 88%;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 13px;
      line-height: 1.5;
    }
    .af-msg.user {
      background: ${theme.primary};
      color: white;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .af-msg.agent {
      background: white;
      color: #333;
      align-self: flex-start;
      border: 1px solid #e0e0e0;
      border-bottom-left-radius: 4px;
    }
    .af-msg.thinking {
      color: #999;
      font-style: italic;
      background: white;
      border: 1px dashed #ddd;
      align-self: flex-start;
    }
    .af-msg.action-approve {
      background: #e8f5e9;
      color: #2e7d32;
      align-self: flex-start;
      border: 1px solid #c8e6c9;
      font-size: 12px;
      border-radius: 8px;
    }
    .af-msg.action-reject {
      background: #fdecea;
      color: #c62828;
      align-self: flex-start;
      border: 1px solid #ffcdd2;
      font-size: 12px;
      border-radius: 8px;
    }
    .af-msg.action-escalate {
      background: #fff8e1;
      color: #f57f17;
      align-self: flex-start;
      border: 1px solid #ffe082;
      font-size: 12px;
      border-radius: 8px;
    }

    .af-chips {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: 8px 14px 10px;
      background: #f8f9fa;
    }
    .af-chip {
      background: white;
      border: 1px solid #ddd;
      border-radius: 16px;
      padding: 5px 12px;
      font-size: 11px;
      cursor: pointer;
      color: ${theme.primary};
      transition: all 0.2s;
    }
    .af-chip:hover {
      background: ${theme.primary};
      color: white;
      border-color: ${theme.primary};
    }

    #af-input-area {
      padding: 12px;
      border-top: 1px solid #e0e0e0;
      display: flex;
      gap: 8px;
      background: white;
    }
    #af-input {
      flex: 1;
      padding: 10px 14px;
      border: 1px solid #ddd;
      border-radius: 24px;
      font-size: 13px;
      outline: none;
      font-family: Arial, sans-serif;
    }
    #af-input:focus { border-color: ${theme.primary}; }
    #af-input:disabled { background: #f5f5f5; color: #aaa; }
    #af-send {
      background: ${theme.primary};
      color: white;
      border: none;
      border-radius: 50%;
      width: 38px; height: 38px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    #af-send:hover { background: ${theme.accent}; }
    #af-send:disabled { background: #ccc; cursor: not-allowed; }

    #af-mic {
      background: white;
      color: #555;
      border: 1px solid #ddd;
      border-radius: 50%;
      width: 38px; height: 38px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      flex-shrink: 0;
    }
    #af-mic:hover { border-color: ${theme.primary}; color: ${theme.primary}; }
    #af-mic:disabled { opacity: 0.4; cursor: not-allowed; }
    #af-mic.listening {
      background: #ff4444;
      color: white;
      border-color: #ff4444;
      animation: af-pulse 1s infinite;
    }

    #af-branding {
      text-align: center;
      font-size: 10px;
      color: #bbb;
      padding: 6px;
      background: white;
      border-top: 1px solid #f5f5f5;
    }
    #af-branding a {
      color: ${theme.primary};
      text-decoration: none;
      font-weight: bold;
    }
  `;
  document.head.appendChild(style);

  // ── Build Widget HTML ──────────────────────────────────
  const launcher = document.createElement("button");
  launcher.id = "af-launcher";
  launcher.type = "button";
  launcher.innerHTML = "🤖";
  document.body.appendChild(launcher);

  const panel = document.createElement("div");
  panel.id = "af-panel";
  panel.innerHTML = `
    <div id="af-header">
      <div>
        <div class="af-title">🤖 AgentFlow AI</div>
        <div class="af-sub" id="af-client-name">Connecting...</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <div class="af-status">
          <div class="af-dot"></div>
          <span id="af-status-text">Live</span>
        </div>
        <span id="af-close">✕</span>
      </div>
    </div>
    <div id="af-usage">
      <span id="af-usage-text">Loading usage...</span>
      <span id="af-tasks-left"></span>
    </div>
    <div id="af-messages">
      <div class="af-msg thinking">Connecting to your AI agent...</div>
    </div>
    <div class="af-chips" id="af-chips"></div>
    <div id="af-input-area">
      <input id="af-input" type="text" placeholder="Say or type an instruction..." disabled />
      <button id="af-mic" type="button" disabled title="Click to speak">🎤</button>
      <button id="af-send" type="button" disabled>➤</button>
    </div>
    <div id="af-branding">Powered by <a href="#">AgentFlow</a></div>
  `;
  document.body.appendChild(panel);

  // ── Toggle Panel ───────────────────────────────────────
  launcher.addEventListener("click", () => panel.classList.toggle("open"));
  document.getElementById("af-close").addEventListener("click", () => panel.classList.remove("open"));

  // ── Voice Recognition ──────────────────────────────────
  const micBtn = document.getElementById("af-mic");
  let recognition = null;

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onstart = () => {
      micBtn.classList.add("listening");
      micBtn.title = "Listening...";
      document.getElementById("af-input").placeholder = "Listening...";
    };

    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      document.getElementById("af-input").value = transcript;
      micBtn.classList.remove("listening");
      document.getElementById("af-input").placeholder = "Say or type an instruction...";
      handleSend();
    };

    recognition.onerror = () => {
      micBtn.classList.remove("listening");
      document.getElementById("af-input").placeholder = "Say or type an instruction...";
    };

    recognition.onend = () => {
      micBtn.classList.remove("listening");
      document.getElementById("af-input").placeholder = "Say or type an instruction...";
    };

    micBtn.addEventListener("click", () => {
      if (micBtn.classList.contains("listening")) {
        recognition.stop();
      } else {
        recognition.start();
      }
    });
  } else {
    micBtn.title = "Voice not supported in this browser";
    micBtn.style.opacity = "0.3";
  }

  // ── General Page Command Handler ───────────────────────
  function handleGeneralCommand(command) {
    const cmd = command.toLowerCase().trim();

    // Navigate commands
    const navPatterns = [
      { pattern: /open|go to|navigate to|visit/, type: "navigate" },
    ];

    // Click commands — "click X", "press X", "tap X"
    const clickMatch = cmd.match(/^(?:click|press|tap|select|hit)\s+(?:the\s+)?(.+)$/);
    if (clickMatch) {
      const target = clickMatch[1].trim();
      return tryClickElement(target);
    }

    // Navigation — "open X page", "go to X"
    const navMatch = cmd.match(/^(?:open|go to|navigate to|visit)\s+(?:the\s+)?(.+?)(?:\s+page)?$/);
    if (navMatch) {
      const target = navMatch[1].trim();
      return tryNavigate(target);
    }

    // Fill commands — "fill X with Y", "type Y in X"
    const fillMatch = cmd.match(/(?:fill|type|enter|input|put)\s+(.+?)\s+(?:in|into|with)\s+(.+)/);
    if (fillMatch) {
      return tryFill(fillMatch[2], fillMatch[1]);
    }

    // Scroll commands
    if (cmd.includes("scroll down")) { window.scrollBy(0, 300); addMsg("action-approve", "⬇️ Scrolled down"); return true; }
    if (cmd.includes("scroll up")) { window.scrollBy(0, -300); addMsg("action-approve", "⬆️ Scrolled up"); return true; }
    if (cmd.includes("scroll to top")) { window.scrollTo(0, 0); addMsg("action-approve", "⬆️ Scrolled to top"); return true; }
    if (cmd.includes("scroll to bottom")) { window.scrollTo(0, document.body.scrollHeight); addMsg("action-approve", "⬇️ Scrolled to bottom"); return true; }

    return false; // not handled
  }

  function tryClickElement(targetText) {
    const allClickable = [
      ...document.querySelectorAll("button, a, [role='button'], input[type='submit'], input[type='button']")
    ].filter(el => !el.closest("#af-panel"));

    // Find best match by text content
    const target = allClickable.find(el => {
      const text = (el.textContent || el.value || el.title || "").toLowerCase().trim();
      return text.includes(targetText.toLowerCase()) || targetText.toLowerCase().includes(text);
    });

    if (target) {
      target.style.outline = "2px solid #0052cc";
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        target.style.outline = "";
        target.click();
      }, 500);
      addMsg("action-approve", `🖱️ <strong>CLICKED</strong> — "${target.textContent.trim() || targetText}"`);
      return true;
    }

    addMsg("action-escalate", `⚠️ Could not find a button or link matching "<strong>${targetText}</strong>" on this page.`);
    return false;
  }

  function tryNavigate(targetText) {
    const allLinks = [...document.querySelectorAll("a[href]")]
      .filter(el => !el.closest("#af-panel"));

    const target = allLinks.find(el => {
      const text = (el.textContent || el.title || "").toLowerCase().trim();
      const href = (el.href || "").toLowerCase();
      return text.includes(targetText.toLowerCase()) ||
        href.includes(targetText.toLowerCase().replace(/\s+/g, ""));
    });

    if (target) {
      target.style.outline = "2px solid #0052cc";
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      addMsg("action-approve", `🔗 <strong>NAVIGATING</strong> — "${target.textContent.trim() || targetText}"`);
      setTimeout(() => { target.click(); }, 600);
      return true;
    }

    addMsg("action-escalate", `⚠️ Could not find a link to "<strong>${targetText}</strong>" on this page.`);
    return false;
  }

  function tryFill(fieldTarget, value) {
    const allInputs = [...document.querySelectorAll("input, textarea, select")]
      .filter(el => !el.closest("#af-panel") && el.id !== "af-input");

    const target = allInputs.find(el => {
      const label = (el.labels?.[0]?.textContent || el.placeholder || el.name || el.id || "").toLowerCase();
      return label.includes(fieldTarget.toLowerCase());
    });

    if (target) {
      target.focus();
      target.value = value;
      target.dispatchEvent(new Event("input", { bubbles: true }));
      target.dispatchEvent(new Event("change", { bubbles: true }));
      target.style.outline = "2px solid #27ae60";
      setTimeout(() => { target.style.outline = ""; }, 1000);
      addMsg("action-approve", `✏️ <strong>FILLED</strong> — "${fieldTarget}" with "${value}"`);
      return true;
    }

    addMsg("action-escalate", `⚠️ Could not find a field matching "<strong>${fieldTarget}</strong>"`);
    return false;
  }

  // ── Add Message ────────────────────────────────────────
  function addMsg(type, html) {
    const msgs = document.getElementById("af-messages");
    const div = document.createElement("div");
    div.className = `af-msg ${type}`;
    div.innerHTML = html;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
    return div;
  }

  function clearMessages() {
    document.getElementById("af-messages").innerHTML = "";
  }

  // ── Update Usage Bar ───────────────────────────────────
  function updateUsage(used, limit) {
    const pct = Math.min((used / limit) * 100, 100).toFixed(0);
    document.getElementById("af-usage-text").innerHTML =
      `Tasks used: <strong>${used.toLocaleString()} / ${limit.toLocaleString()}</strong>`;
    document.getElementById("af-tasks-left").textContent =
      `${(limit - used).toLocaleString()} remaining`;
  }

  // ── Smart Dynamic Chips ────────────────────────────────
  function renderChips(chips) {
    const container = document.getElementById("af-chips");
    container.innerHTML = chips.map(c =>
      `<span class="af-chip">${c}</span>`
    ).join("");
    container.querySelectorAll(".af-chip").forEach(chip => {
      chip.addEventListener("click", () => {
        document.getElementById("af-input").value = chip.textContent;
        handleSend();
      });
    });
  }

  function generateSmartChips(rows, industry) {
    const chips = [];
    if (rows.length === 0) return ["No pending items found"];

    // Group by plan
    const plans = {};
    rows.forEach(r => {
      plans[r.plan] = (plans[r.plan] || 0) + 1;
    });

    // Group by procedure type
    const routineKeywords = ["scan", "test", "examination", "panel", "check"];
    const surgicalKeywords = ["surgery", "appendectomy", "operation"];
    const routineRows = rows.filter(r =>
      routineKeywords.some(k => r.procedure.toLowerCase().includes(k))
    );
    const surgicalRows = rows.filter(r =>
      surgicalKeywords.some(k => r.procedure.toLowerCase().includes(k))
    );

    // Amount analysis
    const lowValue = rows.filter(r => r.amount < 50000);
    const highValue = rows.filter(r => r.amount > 200000);

    // Generate contextual chips based on what's actually on the page
    if (lowValue.length > 0) {
      chips.push(`Approve ${lowValue.length} request${lowValue.length > 1 ? "s" : ""} under ₦50,000`);
    }

    Object.entries(plans).forEach(([plan, count]) => {
      if (plan === "Gold") {
        chips.push(`Approve all ${count} Gold plan request${count > 1 ? "s" : ""}`);
      } else if (plan === "Bronze" && highValue.filter(r => r.plan === "Bronze").length > 0) {
        const bronzeHigh = highValue.filter(r => r.plan === "Bronze").length;
        chips.push(`Reject ${bronzeHigh} Bronze request${bronzeHigh > 1 ? "s" : ""} above ₦200,000`);
      }
    });

    if (routineRows.length > 0) {
      chips.push(`Approve ${routineRows.length} routine diagnostic${routineRows.length > 1 ? "s" : ""}`);
    }

    if (surgicalRows.length > 0) {
      chips.push(`Escalate ${surgicalRows.length} surgical procedure${surgicalRows.length > 1 ? "s" : ""}`);
    }

    if (highValue.length > 0 && chips.length < 4) {
      chips.push(`Escalate ${highValue.length} high-value request${highValue.length > 1 ? "s" : ""} above ₦200,000`);
    }

    // Always have at least one fallback
    if (chips.length === 0) {
      chips.push(`Approve all ${rows.length} pending requests`);
      chips.push("Escalate all to senior staff");
    }

    return chips.slice(0, 4); // max 4 chips
  }

  async function loadSmartChips(industry) {
    // Step 1 — instantly show local smart chips based on page data
    const rows = getPageContext();
    const localChips = generateSmartChips(rows, industry);
    renderChips(localChips);

    // Step 2 — try to upgrade with AI-generated chips in background
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000); // 8 second limit

      const res = await fetch(`${BACKEND_URL}/api/agent/suggest`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          industry,
          rows: rows.slice(0, 10)
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && data.suggestions?.length > 0) {
          renderChips(data.suggestions);
        }
      }
    } catch (err) {
      // Silently keep local chips — no error shown to user
    }
  }

  // ── Initialize — Call Backend Status ──────────────────
  async function init() {
    try {
      const res = await fetch(`${BACKEND_URL}/api/agent/status`, {
        headers: { "x-api-key": API_KEY }
      });
      const data = await res.json();

      if (!data.success) {
        clearMessages();
        addMsg("agent", `⚠️ ${data.error}`);
        return;
      }

      clientInfo = data.client;

      // Update header
      document.getElementById("af-client-name").textContent = clientInfo.name;
      updateUsage(clientInfo.tasksUsed, clientInfo.tasksLimit);

      // Load smart dynamic chips
      loadSmartChips(clientInfo.industry);

      // Enable input and mic
      document.getElementById("af-input").disabled = false;
      document.getElementById("af-send").disabled = false;
      document.getElementById("af-mic").disabled = false;

      // Welcome message
      clearMessages();
      addMsg("agent",
        `👋 Hello! I'm your AI agent for <strong>${clientInfo.name}</strong>.<br><br>
        I can see your dashboard and I'm ready to execute tasks for you.<br><br>
        <em>What would you like me to handle?</em>`
      );

    } catch (err) {
      clearMessages();
      addMsg("agent", "⚠️ Could not connect to AgentFlow backend. Make sure the server is running.");
      console.error("AgentFlow init error:", err);
    }
  }

  // ── Send Handler ───────────────────────────────────────
  document.getElementById("af-send").addEventListener("click", e => {
    e.preventDefault();
    handleSend();
  });
  document.getElementById("af-input").addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  });

  async function handleSend() {
    if (isProcessing) return;
    const input = document.getElementById("af-input");
    const command = input.value.trim();
    if (!command) return;
    input.value = "";
    addMsg("user", command);
    await routeCommand(command);
  }

  // ── Command Router — decides what to do ────────────────
  async function routeCommand(command) {
    const cmd = command.toLowerCase().trim();

    // ── Is it a page action command? ──────────────────────
    const isPageAction = (
      cmd.match(/\b(approve|reject|escalate|flag|process|click|open|go to|navigate|scroll|fill|type|enter)\b/)
    );

    if (isPageAction) {
      await processCommand(command);
    } else {
      // ── Conversational — chat with AI ──────────────────
      await chat(command);
    }
  }

  // ── Conversational AI Chat ──────────────────────────────
  async function chat(message) {
    isProcessing = true;
    document.getElementById("af-input").disabled = true;
    document.getElementById("af-send").disabled = true;

    const thinking = addMsg("thinking", "💭 Thinking...");

    try {
      // Get page context to give AI awareness
      const rows = getPageContext();
      const pageTitle = document.title;

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20000);

      const res = await fetch(`${BACKEND_URL}/api/agent/chat`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          message,
          context: {
            clientName: clientInfo?.name,
            industry: clientInfo?.industry,
            pageTitle,
            rowCount: rows.length,
            rowSummary: rows.slice(0, 5).map(r =>
              Object.entries(r)
                .filter(([k]) => !k.startsWith("_"))
                .slice(0, 4)
                .map(([k, v]) => `${k}: ${v}`)
                .join(", ")
            )
          }
        })
      });

      thinking.remove();

      if (res.ok) {
        const data = await res.json();
        if (data.reply) {
          addMsg("agent", data.reply);
          return;
        }
      }

      // Fallback — local smart responses
      throw new Error("Backend unavailable");

    } catch (err) {
      thinking.remove();
      // Local conversational fallback
      addMsg("agent", localChat(message));
    } finally {
      isProcessing = false;
      document.getElementById("af-input").disabled = false;
      document.getElementById("af-send").disabled = false;
    }
  }

  // ── Local Chat Fallback ─────────────────────────────────
  function localChat(message) {
    const msg = message.toLowerCase();
    const name = clientInfo?.name || "your system";
    const rows = getPageContext();
    const rowCount = rows.length;

    // Greetings
    if (msg.match(/^(hi|hello|hey|good morning|good afternoon|sup|yo)\b/)) {
      return `👋 Hello! I'm your AI agent for <strong>${name}</strong>.<br><br>
        I can see <strong>${rowCount} items</strong> on this page. I can:<br>
        • Execute tasks — <em>"Approve all Gold plan"</em><br>
        • Navigate — <em>"Open Reports"</em><br>
        • Answer questions about what's on the page<br><br>
        What would you like me to do?`;
    }

    // What can you do
    if (msg.includes("what can you do") || msg.includes("help") || msg.includes("how do")) {
      return `Here's what I can do on <strong>${name}</strong>:<br><br>
        🗂️ <strong>Process table items</strong><br>
        <em>"Approve all Gold plan requests"</em><br>
        <em>"Reject Bronze above ₦200,000"</em><br>
        <em>"Escalate all surgical procedures"</em><br><br>
        🖱️ <strong>Control the page</strong><br>
        <em>"Click Members"</em>, <em>"Open Reports"</em><br>
        <em>"Scroll down"</em><br><br>
        📊 <strong>Answer questions</strong><br>
        <em>"How many pending items?"</em><br>
        <em>"What's on this page?"</em>`;
    }

    // How many / count questions
    if (msg.includes("how many") || msg.includes("count")) {
      return `I can see <strong>${rowCount} items</strong> on this page right now.`;
    }

    // What's on the page
    if (msg.includes("what") && (msg.includes("page") || msg.includes("screen") || msg.includes("see"))) {
      if (rowCount > 0) {
        const sample = rows.slice(0, 3).map(r =>
          Object.entries(r).filter(([k]) => !k.startsWith("_")).slice(0, 3).map(([, v]) => v).join(" · ")
        ).join("<br>");
        return `I can see <strong>${rowCount} items</strong> on this page. Here are the first few:<br><br>${sample}<br><br>Tell me what you'd like me to do with them.`;
      }
      return `The page is <strong>${document.title}</strong>. I don't see any table data right now. Try navigating to a section with items.`;
    }

    // Thanks
    if (msg.match(/thank|thanks|great|awesome|nice|good job|well done/)) {
      return `Happy to help! 😊 Anything else you'd like me to handle?`;
    }

    // Default — intelligent fallback
    return `I understood: <em>"${message}"</em><br><br>
      I'm not sure if that's a task or a question. Try being specific:<br>
      • To act on the page: <em>"Approve all Gold plan"</em><br>
      • To navigate: <em>"Open Members"</em><br>
      • To ask: <em>"How many items are pending?"</em>`;
  }

  // ── Process Command — Page Actions ─────────────────────
  async function processCommand(command) {
    isProcessing = true;
    document.getElementById("af-input").disabled = true;
    document.getElementById("af-send").disabled = true;

    try {
      const thinking = addMsg("thinking", "🔍 Scanning page...");
      await sleep(400);

      const pendingRows = getPageContext();
      thinking.innerHTML = `🧠 Found ${pendingRows.length} item${pendingRows.length !== 1 ? "s" : ""} — processing...`;
      await sleep(500);
      thinking.remove();

      if (pendingRows.length === 0) {
        // No table rows — try as a general page command
        const handled = handleGeneralCommand(command);
        if (!handled) {
          await chat(command); // fall through to conversational AI
        }
        return;
      }

      // Determine action from command
      const cmd = command.toLowerCase();
      const action = cmd.includes("reject") ? "rejected"
        : cmd.includes("escalate") || cmd.includes("flag") ? "escalate"
        : "approved";

      // Filter rows
      const targets = filterRows(pendingRows, command);

      if (targets.length === 0) {
        // Nothing matched in table — try as general page command
        const handled = handleGeneralCommand(command);
        if (!handled) {
          addMsg("agent",
            `🔎 Found ${pendingRows.length} row${pendingRows.length !== 1 ? "s" : ""} on the page but none matched "<strong>${command}</strong>".<br><br>
            Try being more specific, e.g. <em>"reject all Gold plan"</em> or <em>"approve requests under ₦50,000"</em>`
          );
        }
        return;
      }

      addMsg("agent",
        `📋 <strong>${action.toUpperCase()}</strong> — ${targets.length} item${targets.length !== 1 ? "s" : ""} matched.<br>
        Executing now 👇`
      );

      await sleep(400);

      let processed = 0;
      for (const target of targets) {
        // Scroll to row
        if (target._rowElement) {
          target._rowElement.scrollIntoView({ behavior: "smooth", block: "nearest" });
          target._rowElement.style.outline = "2px solid #0052cc";
          await sleep(250);
          target._rowElement.style.outline = "";
        }

        executeRowAction(target, action);

        const icon = action === "approved" ? "✅" : action === "rejected" ? "❌" : "⚠️";
        const msgType = action === "approved" ? "action-approve"
          : action === "rejected" ? "action-reject" : "action-escalate";

        // Build a readable summary from whatever data the row has
        const rowSummary = target._rowId
          || Object.entries(target)
            .filter(([k]) => !k.startsWith("_"))
            .slice(0, 3)
            .map(([k, v]) => v)
            .join(" · ");

        addMsg(msgType, `${icon} <strong>${action.toUpperCase()}</strong> — ${rowSummary}`);

        processed++;
        await sleep(650);
      }

      await sleep(300);
      addMsg("agent", `🎉 <strong>Done!</strong> ${processed} item${processed !== 1 ? "s" : ""} processed.`);

    } catch (err) {
      addMsg("agent", `⚠️ Error: ${err.message}`);
      console.error(err);
    } finally {
      isProcessing = false;
      document.getElementById("af-input").disabled = false;
      document.getElementById("af-send").disabled = false;
    }
  }

  // ── Universal Page Reader — reads ANY table structure ──
  function getPageContext() {
    const allRows = [];

    // Scan every table on the page
    document.querySelectorAll("table").forEach(table => {
      if (table.closest("#af-panel")) return;

      // Get headers
      const headers = Array.from(table.querySelectorAll("th, thead td"))
        .map(th => th.textContent.trim().toLowerCase());

      // Get all rows
      table.querySelectorAll("tbody tr, tr").forEach(row => {
        if (row.querySelector("th")) return; // skip header rows
        if (row.closest("#af-panel")) return;

        const cells = Array.from(row.querySelectorAll("td"))
          .map(td => td.textContent.trim());

        if (cells.length === 0) return;

        // Build a dynamic object from headers + cells
        const rowData = {
          _rowElement: row,
          _rowId: row.id || null,
          _allText: cells.join(" ").toLowerCase(),
          _status: row.querySelector(".badge, [class*='status'], [class*='badge']")
            ?.textContent?.trim()?.toLowerCase() || "unknown"
        };

        // Map cells to header names if available
        headers.forEach((header, i) => {
          if (cells[i] !== undefined) rowData[header] = cells[i];
        });

        // Also store raw cells for fallback
        cells.forEach((cell, i) => { rowData[`col${i}`] = cell; });

        // Extract amount if any cell looks like money
        cells.forEach(cell => {
          const moneyMatch = cell.replace(/,/g, "").match(/[\d]+/);
          if (moneyMatch && cell.includes("₦") || cell.includes("$") || cell.match(/^\d{3,}/)) {
            rowData._amount = parseInt(cell.replace(/[^\d]/g, "")) || 0;
          }
        });

        allRows.push(rowData);
      });
    });

    return allRows;
  }

  // ── Smart Filter — uses AI brain, not hardcoded rules ──
  function filterRows(rows, command) {
    const cmd = command.toLowerCase();

    // Amount filters
    const underMatch = cmd.match(/under\s+[₦$#]?\s*([\d,]+)/);
    const aboveMatch = cmd.match(/(?:above|over)\s+[₦$#]?\s*([\d,]+)/);

    if (underMatch) {
      const limit = parseInt(underMatch[1].replace(/,/g, ""));
      return rows.filter(r => r._amount && r._amount < limit);
    }
    if (aboveMatch) {
      const limit = parseInt(aboveMatch[1].replace(/,/g, ""));
      return rows.filter(r => r._amount && r._amount > limit);
    }

    // Status filters — find rows where any cell matches
    if (cmd.includes("pending")) return rows.filter(r => r._allText.includes("pending"));
    if (cmd.includes("approved")) return rows.filter(r => r._allText.includes("approved"));
    if (cmd.includes("rejected")) return rows.filter(r => r._allText.includes("rejected"));

    // Extract keyword from command and match against ALL row text
    // Remove action words to get the subject
    const subject = cmd
      .replace(/approve|reject|escalate|flag|click|open|process|all|the|every|pending/g, "")
      .trim();

    if (subject.length > 1) {
      const matched = rows.filter(r => r._allText.includes(subject));
      if (matched.length > 0) return matched;
    }

    // Default — return all rows
    return rows;
  }

  // ── Execute Action on Universal Row ────────────────────
  function executeRowAction(rowData, action) {
    const row = rowData._rowElement;
    if (!row) return false;

    // Highlight
    row.style.transition = "background 0.3s ease";
    row.style.background = action === "approved" ? "#e8f5e9"
      : action === "rejected" ? "#fdecea" : "#fff8e1";

    // Try to find and click action button
    const buttons = Array.from(row.querySelectorAll("button, [role='button']"));

    if (action === "approved") {
      const btn = buttons.find(b =>
        b.textContent.toLowerCase().includes("approv") ||
        b.className.toLowerCase().includes("approv") ||
        b.className.toLowerCase().includes("success") ||
        b.className.toLowerCase().includes("green")
      );
      if (btn) { btn.type = "button"; btn.click(); return true; }
    }

    if (action === "rejected") {
      const btn = buttons.find(b =>
        b.textContent.toLowerCase().includes("reject") ||
        b.textContent.toLowerCase().includes("declin") ||
        b.className.toLowerCase().includes("reject") ||
        b.className.toLowerCase().includes("danger") ||
        b.className.toLowerCase().includes("red")
      );
      if (btn) { btn.type = "button"; btn.click(); return true; }
    }

    if (action === "escalate") {
      const btn = buttons.find(b =>
        b.textContent.toLowerCase().includes("escalat") ||
        b.textContent.toLowerCase().includes("flag") ||
        b.textContent.toLowerCase().includes("review")
      );
      if (btn) { btn.type = "button"; btn.click(); return true; }
    }

    // Also update any badge/status element in the row
    const badge = row.querySelector(".badge, [class*='status'], [class*='badge']");
    if (badge) {
      badge.className = badge.className.replace(/pending|approved|rejected|escalate/g, "") + " " + action;
      badge.textContent = action.charAt(0).toUpperCase() + action.slice(1);
    }

    return true;
  }

  // ── Execute Actions on Page ────────────────────────────
  async function executeOnPage(rows, action, command) {
    const cmd = command.toLowerCase();

    // Filter rows based on command
    let targets = rows;

    if (cmd.includes("under")) {
      const match = cmd.match(/[\d,]+/);
      const limit = match ? parseInt(match[0].replace(",", "")) : 999999;
      targets = rows.filter(r => r.amount < limit);
    } else if (cmd.includes("above") || cmd.includes("over")) {
      const match = cmd.match(/[\d,]+/);
      const limit = match ? parseInt(match[0].replace(",", "")) : 0;
      targets = rows.filter(r => r.amount > limit);
    } else if (cmd.includes("gold")) {
      targets = rows.filter(r => r.plan === "Gold");
    } else if (cmd.includes("bronze")) {
      targets = rows.filter(r => r.plan === "Bronze");
    } else if (cmd.includes("silver")) {
      targets = rows.filter(r => r.plan === "Silver");
    }

    if (targets.length === 0) {
      addMsg("agent", "🔎 No matching rows found on the dashboard for that instruction.");
      return;
    }

    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      const row = document.getElementById("row-" + target.id);

      if (row) {
        // Highlight row
        row.style.transition = "background 0.4s ease";
        row.style.background = action === "approved"
          ? "#e8f5e9" : action === "rejected"
          ? "#fdecea" : "#fff8e1";

        // Update badge
        if (typeof updateStatus === "function") {
          updateStatus(target.id, action);
        }
      }

      const icon = action === "approved" ? "✅" : action === "rejected" ? "❌" : "⚠️";
      addMsg(`action-${action}`,
        `${icon} <strong>${action.toUpperCase()}</strong> — ${target.id} · ${target.member} · ₦${target.amount.toLocaleString()}`
      );

      await sleep(600);
    }
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ── DOM Scanner — Reads Any Page ──────────────────────
function scanPage() {
  const elements = [];
  let idCounter = 0;

  function generateId(el) {
    if (!el.dataset.afId) {
      el.dataset.afId = "af_el_" + idCounter++;
    }
    return el.dataset.afId;
  }

  // Scan buttons
  document.querySelectorAll("button, [role='button'], input[type='button'], input[type='submit']").forEach(el => {
    if (el.id === "af-launcher" || el.closest("#af-panel")) return;
    elements.push({
      afId: generateId(el),
      type: "button",
      text: (el.textContent || el.value || "").trim().substring(0, 80),
      id: el.id || null,
      classes: el.className || null,
      disabled: el.disabled || false,
      visible: el.offsetParent !== null
    });
  });

  // Scan inputs
  document.querySelectorAll("input:not([type='button']):not([type='submit']), textarea, select").forEach(el => {
    if (el.id === "af-input" || el.closest("#af-panel")) return;
    elements.push({
      afId: generateId(el),
      type: el.tagName === "SELECT" ? "select" : el.tagName === "TEXTAREA" ? "textarea" : "input",
      inputType: el.type || "text",
      placeholder: el.placeholder || null,
      label: el.labels?.[0]?.textContent?.trim() || null,
      id: el.id || null,
      value: el.value || null,
      options: el.tagName === "SELECT"
        ? Array.from(el.options).map(o => o.text)
        : null,
      visible: el.offsetParent !== null
    });
  });

  // Scan links
  document.querySelectorAll("a[href]").forEach(el => {
    if (el.closest("#af-panel")) return;
    elements.push({
      afId: generateId(el),
      type: "link",
      text: el.textContent.trim().substring(0, 80),
      href: el.href || null,
      id: el.id || null,
      visible: el.offsetParent !== null
    });
  });

  // Scan tables
  document.querySelectorAll("table").forEach(table => {
    if (table.closest("#af-panel")) return;
    const headers = Array.from(table.querySelectorAll("th"))
      .map(th => th.textContent.trim());
    const rows = Array.from(table.querySelectorAll("tbody tr")).map(row => {
      const cells = Array.from(row.querySelectorAll("td"))
        .map(td => td.textContent.trim().substring(0, 50));
      return {
        afId: generateId(row),
        id: row.id || null,
        data: row.dataset || {},
        cells,
        status: row.querySelector(".badge")?.textContent?.trim() || null
      };
    });
    elements.push({
      afId: generateId(table),
      type: "table",
      id: table.id || null,
      headers,
      rowCount: rows.length,
      rows: rows.slice(0, 30)
    });
  });

  // Scan forms
  document.querySelectorAll("form").forEach(form => {
    if (form.closest("#af-panel")) return;
    elements.push({
      afId: generateId(form),
      type: "form",
      id: form.id || null,
      action: form.action || null
    });
  });

  // Page summary
  const summary = {
    title: document.title,
    url: window.location.href,
    pageText: document.body.innerText.substring(0, 500),
    elementCount: elements.length,
    elements
  };

  return summary;
}

// ── Action Executor — Performs AI Actions on Page ─────
async function executeActions(actions) {
  if (!actions || actions.length === 0) {
    addMsg("agent", "🔎 No actions to execute on this page.");
    return;
  }

  for (const action of actions) {
    await sleep(600);

    try {
      // Find element by afId first, then fallback to id
      let el = document.querySelector(`[data-af-id="${action.afId}"]`);
      if (!el && action.elementId) {
        el = document.getElementById(action.elementId);
      }
      if (!el && action.selector) {
        el = document.querySelector(action.selector);
      }

      if (!el) {
        addMsg("action-escalate", `⚠️ Could not find element for: <strong>${action.description}</strong>`);
        continue;
      }

      // Highlight element before acting
      const originalOutline = el.style.outline;
      const originalBackground = el.style.background;
      el.style.outline = "2px solid #0052cc";
      el.style.background = "#e8f0fe";
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      await sleep(500);

      // Perform the action
      switch (action.type) {
        case "click":
          el.click();
          addMsg("action-approve", `🖱️ <strong>CLICKED</strong> — ${action.description}`);
          break;

        case "fill":
          el.focus();
          el.value = action.value;
          el.dispatchEvent(new Event("input", { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          addMsg("action-approve", `✏️ <strong>FILLED</strong> — ${action.description}: "${action.value}"`);
          break;

        case "select":
          el.value = action.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          addMsg("action-approve", `📋 <strong>SELECTED</strong> — ${action.description}: "${action.value}"`);
          break;

        case "approve_row":
          // Special handler for table rows with approve buttons
          const approveBtn = el.querySelector(".btn-approve") ||
            el.querySelector("[class*='approve']") ||
            Array.from(el.querySelectorAll("button")).find(b =>
              b.textContent.toLowerCase().includes("approve")
            );
          if (approveBtn) {
            approveBtn.click();
            addMsg("action-approve", `✅ <strong>APPROVED</strong> — ${action.description}`);
          }
          break;

        case "reject_row":
          const rejectBtn = el.querySelector(".btn-reject") ||
            el.querySelector("[class*='reject']") ||
            Array.from(el.querySelectorAll("button")).find(b =>
              b.textContent.toLowerCase().includes("reject")
            );
          if (rejectBtn) {
            rejectBtn.click();
            addMsg("action-reject", `❌ <strong>REJECTED</strong> — ${action.description}`);
          }
          break;

        case "navigate":
          addMsg("action-approve", `🔗 <strong>NAVIGATING</strong> — ${action.description}`);
          await sleep(400);
          window.location.href = action.value;
          break;

        default:
          addMsg("action-escalate", `⚠️ Unknown action type: ${action.type}`);
      }

      // Remove highlight
      await sleep(300);
      el.style.outline = originalOutline;
      el.style.background = originalBackground;

    } catch (err) {
      addMsg("action-escalate", `⚠️ Error on: <strong>${action.description}</strong> — ${err.message}`);
      console.error("Action execution error:", err);
    }
  }
}

  // ── Boot ───────────────────────────────────────────────
  init();

})();