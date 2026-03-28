(function () {

  // ── Config ────────────────────────────────────────────
  const BACKEND_URL = "https://agentflow-backend-hqqc.onrender.com";
  const API_KEY  = document.currentScript?.getAttribute("data-api-key") || "af_live_medicare001";
  const THEME    = document.currentScript?.getAttribute("data-theme")   || "blue";

  const THEMES = {
    blue:  { primary: "#0052cc", light: "#e8f0fe", accent: "#003d99" },
    green: { primary: "#27ae60", light: "#e8f5e9", accent: "#219150" },
    dark:  { primary: "#1a1a2e", light: "#f0f0f0", accent: "#16213e" },
    red: { primary: "#9B1B1B", light: "#fdf0f0", accent: "#7a1515" }
  };
  const theme = THEMES[THEME] || THEMES.blue;
  // ── Modern Icon Set ──────────────────────────────────
  const ICONS = {
    file: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>`,
    image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.2em;height:1.2em;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1em;height:1em;"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1em;height:1.1em;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1em;height:1.1em;"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>`,
    mic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:1.1em;height:1.1em;"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="23"></line><line x1="8" y1="23" x2="16" y2="23"></line></svg>`
  };

  // ── State ─────────────────────────────────────────────
  let clientInfo          = null;
  let isProcessing        = false;
  let pendingPlan         = null;
  let conversationHistory = [];
  let attachments         = [];   // [{ name, type, size, dataUrl, text }]
  const SESSION_KEY       = "af_conv_" + (API_KEY || "default");

  // ── Session stats — tracked per widget session ────────────────────────
  // Populated from the `usage` field returned by the backend /message endpoint.
  // Shown in the widget header and as a subtle footer line.
  let sessionStats = {
    messages:     0,
    inputTokens:  0,
    outputTokens: 0
  };

  function fmtTok(n) {
    if (!n || n === 0) return "0";
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
    if (n >= 1_000)     return (n / 1_000).toFixed(1) + "k";
    return String(n);
  }

  function updateSessionBar() {
    const bar = document.getElementById("af-session-bar");
    if (!bar) return;

    // Show bar only once at least 1 message has been sent
    if (sessionStats.messages === 0) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");

    // Claude Sonnet pricing: $3/M in · $15/M out
    const cost = (sessionStats.inputTokens  / 1_000_000) * 3.00
               + (sessionStats.outputTokens / 1_000_000) * 15.00;

    const msgs   = document.getElementById("af-sb-msgs");
    const inEl   = document.getElementById("af-sb-in");
    const outEl  = document.getElementById("af-sb-out");
    const costEl = document.getElementById("af-sb-cost");

    if (msgs)   msgs.textContent   = sessionStats.messages;
    if (inEl)   inEl.textContent   = fmtTok(sessionStats.inputTokens);
    if (outEl)  outEl.textContent  = fmtTok(sessionStats.outputTokens);
    if (costEl) costEl.textContent = cost.toFixed(6);
  }

  // ── Network / connection state ────────────────────────
  // 'ok' | 'slow' | 'offline'
  let networkStatus   = "ok";
  let offlineQueue    = [];   // messages buffered while offline
  let _lastOnlineAt   = Date.now();

  // ── Device fingerprint ────────────────────────────────
  const deviceInfo = (function () {
    const ua = navigator.userAgent;
    let os = "Unknown OS";
    if (/Windows NT 10/.test(ua))     os = "Windows 10/11";
    else if (/Windows NT 6/.test(ua)) os = "Windows 7/8";
    else if (/Mac OS X/.test(ua))     os = "macOS";
    else if (/Linux/.test(ua))        os = "Linux";
    else if (/Android/.test(ua))      os = "Android";
    else if (/iPhone|iPad/.test(ua))  os = "iOS";
    let browser = "Unknown Browser";
    if (/Edg\//.test(ua))            browser = "Microsoft Edge";
    else if (/Chrome\//.test(ua))    browser = "Chrome";
    else if (/Firefox\//.test(ua))   browser = "Firefox";
    else if (/Safari\//.test(ua))    browser = "Safari";

    const fingerprint = [
    ua,
    navigator.language,
    screen.width + "x" + screen.height,
    Intl.DateTimeFormat().resolvedOptions().timeZone
  ].join("|");
  
  // Simple hash function for the ID
  const deviceId = btoa(fingerprint).slice(0, 32);

     return {
      deviceId,
      os, browser,
      screenRes: screen.width + "x" + screen.height,
      timezone:  Intl.DateTimeFormat().resolvedOptions().timeZone,
      language:  navigator.language || "en",
      userAgent: ua.slice(0, 120)
    };
  }());

  // ── Operator detection ────────────────────────────────
  function detectOperator() {
    var selectors = [
      ".user-name","#user-name",".username","#username",
      ".user-card .user-name",".sidebar-footer .user-name",
      "[data-username]","[data-user]",
      ".nav-user",".header-user",".profile-name",
      ".operator-name",".staff-name",".agent-name",
      ".avatar-name",".display-name",".full-name",
      ".topbar .name","header .name"
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
    var namePattern = /^[A-Z][a-z]+ [A-Z][a-z]+$/;
    var candidates  = document.querySelectorAll(".user-card *, .profile *, .topbar *");
    for (var j = 0; j < candidates.length; j++) {
      var t = (candidates[j].textContent || "").trim();
      if (namePattern.test(t)) return t;
    }
    return null;
  }

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
      z-index: 9999; transition: transform 0.2s, box-shadow 0.2s;
      font-size: 26px; border: none;
    }
    #af-launcher:hover { transform: scale(1.08); box-shadow: 0 6px 28px ${theme.primary}77; }

    #af-panel {
      position: fixed; bottom: 106px; right: 30px; top: 16px;
      width: 420px; background: #fff; border-radius: 18px;
      box-shadow: 0 12px 56px rgba(0,0,0,0.16); z-index: 9998;
      display: none; flex-direction: column; overflow: hidden;
      border: 1px solid #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
      animation: af-up 0.22s ease; max-height: calc(100vh - 130px);
    }
    @keyframes af-up { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
    #af-panel.open { display: flex; }

    #af-header {
      background: ${theme.primary}; color: white; padding: 14px 16px;
      display: flex; justify-content: space-between; align-items: center; flex-shrink: 0;
    }
    .af-hinfo .af-title { font-size: 14px; font-weight: 700; }
    .af-hinfo .af-sub   { font-size: 11px; opacity: 0.72; margin-top: 2px; }
    .af-hright { display: flex; align-items: center; gap: 10px; }
    /* ── Network status banner ── */
    #af-net-banner {
      display: none; align-items: center; gap: 8px;
      padding: 7px 14px; font-size: 12px; font-weight: 600;
      flex-shrink: 0; border-bottom: 1px solid transparent;
      transition: background 0.3s, color 0.3s;
    }
    #af-net-banner.visible { display: flex; }
    #af-net-banner.offline { background: #fdecea; color: #b71c1c; border-color: #ffcdd2; }
    #af-net-banner.slow    { background: #fff8e1; color: #e65100; border-color: #ffe082; }
    #af-net-banner .af-nb-icon { font-size: 14px; flex-shrink: 0; }
    #af-net-banner .af-nb-msg  { flex: 1; }
    #af-net-banner .af-nb-retry {
      font-size: 11px; text-decoration: underline; cursor: pointer;
      background: none; border: none; color: inherit; padding: 0;
    }

    /* ── Dot colours by network status ── */
    .af-dot          { width: 7px; height: 7px; border-radius: 50%; background: #00FF88; animation: af-pulse 2s infinite; }
    .af-dot.slow     { background: #FFB300; }
    .af-dot.offline  { background: #f44336; animation: none; }
    @keyframes af-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
    #af-close { cursor:pointer; font-size:18px; opacity:0.75; }
    #af-close:hover { opacity:1; }

    #af-messages {
  flex: 1; 
  padding: 14px 14px 20px; 
  overflow-y: scroll; /* Force the scrollbar area to exist */
  background: #f7f8fa;
  display: flex; 
  flex-direction: column; 
  gap: 10px; 
  min-height: 200px;
  /* Added to ensure the scrollbar is always visible and interactive */
  scrollbar-width: auto; 
  scrollbar-color: ${theme.primary} #f0f0f0;
}
  /* Custom Scrollbar Styling */
#af-messages::-webkit-scrollbar {
  width: 14px; /* Slightly wider to accommodate arrows comfortably */
  display: block;
}

#af-messages::-webkit-scrollbar-track {
  background: #f0f0f0;
  border-left: 1px solid #e0e0e0;
}

#af-messages::-webkit-scrollbar-thumb {
  background-color: ${theme.primary}aa;
  border-radius: 10px;
  border: 3px solid #f0f0f0;
}

#af-messages::-webkit-scrollbar-thumb:hover {
  background-color: ${theme.primary};
}

/* ── The Scrollbar Arrows (Buttons) ── */
#af-messages::-webkit-scrollbar-button:single-button {
  background-color: #f0f0f0;
  display: block;
  border-style: solid;
  height: 14px;
  width: 14px;
}

/* Up Arrow */
#af-messages::-webkit-scrollbar-button:single-button:vertical:decrement {
  border-width: 0 4px 6px 4px;
  border-color: transparent transparent #666 transparent;
}

/* Down Arrow */
#af-messages::-webkit-scrollbar-button:single-button:vertical:increment {
  border-width: 6px 4px 0 4px;
  border-color: #666 transparent transparent transparent;
}

#af-messages::-webkit-scrollbar-button:vertical:single-button:hover {
  background-color: #e0e0e0;
}
    .af-msg {
      max-width: 86%; padding: 10px 14px; border-radius: 14px; font-size: 13px;
      line-height: 1.55; word-break: break-word;
    }
    .af-msg.user    { background: ${theme.primary}; color: white; align-self: flex-end; border-bottom-right-radius: 4px; }
    .af-msg.agent   { background: white; color: #222; align-self: flex-start; border: 1px solid #e2e2e2; border-bottom-left-radius: 4px; }
    .af-msg.thinking{ background: white; color: #aaa; font-style: italic; border: 1px dashed #ddd; align-self: flex-start; }
    .af-msg.success { background: #e8f5e9; color: #2e7d32; border: 1px solid #c8e6c9; align-self: flex-start; border-bottom-left-radius: 4px; font-size: 12.5px; }
    .af-msg.error   { background: #fdecea; color: #c62828; border: 1px solid #ffcdd2; align-self: flex-start; border-bottom-left-radius: 4px; font-size: 12.5px; }
    .af-msg.warning { background: #fff8e1; color: #e65100; border: 1px solid #ffe082; align-self: flex-start; border-bottom-left-radius: 4px; font-size: 12.5px; }

    /* ── Attachment preview inside messages ── */
    .af-msg-attachments { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .af-att-thumb {
      position: relative; border-radius: 8px; overflow: hidden;
      width: 80px; height: 80px; background: #f0f0f0;
      display: flex; align-items: center; justify-content: center;
      border: 1px solid rgba(255,255,255,0.3);
    }
    .af-att-thumb img { width: 100%; height: 100%; object-fit: cover; }
    .af-att-file {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      gap: 3px; padding: 8px; text-align: center; width: 100%; height: 100%;
    }
    .af-att-file .af-att-icon { font-size: 22px; }
    .af-att-file .af-att-name {
      font-size: 9px; word-break: break-all; overflow: hidden;
      display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
      color: #555; line-height: 1.3;
    }


    /* ── Download file bubble ── */
    .af-download-card {
      background: white; border: 1.5px solid ${theme.primary}44;
      border-radius: 12px; padding: 12px 14px;
      align-self: flex-start; max-width: 88%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      display: flex; flex-direction: column; gap: 8px;
    }
    .af-dl-label { font-size: 10px; font-weight: 700; letter-spacing: 0.5px; color: ${theme.primary}; text-transform: uppercase; }
    .af-dl-file  { display: flex; align-items: center; gap: 10px; }
    .af-dl-icon  { font-size: 22px; }
    .af-dl-info  { flex: 1; min-width: 0; }
    .af-dl-name  { font-size: 13px; font-weight: 600; color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .af-dl-size  { font-size: 11px; color: #888; margin-top: 1px; }
    .af-dl-btn   {
      padding: 7px 14px; background: ${theme.primary}; color: white;
      border: none; border-radius: 8px; font-size: 12px; font-weight: 600;
      cursor: pointer; white-space: nowrap; transition: opacity 0.18s;
    }
    .af-dl-btn:hover { opacity: 0.85; }

    /* ── Files panel ── */
    #af-files-panel {
      display: none; flex-direction: column;
      position: absolute; inset: 0; background: #f7f8fa;
      z-index: 20; border-radius: 0 0 16px 16px;
      overflow: hidden;
    }
    #af-files-panel.open { display: flex; }
    .af-fp-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px; background: ${theme.primary}; color: white;
      font-size: 13px; font-weight: 700; flex-shrink: 0;
    }
    .af-fp-close { cursor: pointer; font-size: 16px; opacity: 0.75; }
    .af-fp-close:hover { opacity: 1; }
    .af-fp-notice {
      background: #fff8e1; border-bottom: 1px solid #ffe082;
      padding: 7px 14px; font-size: 11px; color: #7a5c00;
      display: flex; align-items: center; gap: 6px; flex-shrink: 0;
    }
    .af-fp-list { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 8px; }
    .af-fp-empty { text-align: center; padding: 40px 16px; color: #aaa; font-size: 13px; }
    .af-fp-item {
      background: white; border: 1px solid #e4e4e4; border-radius: 10px;
      padding: 10px 12px; display: flex; align-items: center; gap: 10px;
    }
    .af-fp-item-icon { font-size: 20px; flex-shrink: 0; }
    .af-fp-item-info { flex: 1; min-width: 0; }
    .af-fp-item-name { font-size: 12px; font-weight: 600; color: #222; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .af-fp-item-meta { font-size: 10px; color: #888; margin-top: 2px; }
    .af-fp-item-badge {
      font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
      padding: 2px 6px; border-radius: 4px; flex-shrink: 0;
    }
    .af-fp-item-badge.sent { background: ${theme.light}; color: ${theme.primary}; }
    .af-fp-item-badge.received { background: #e8f5e9; color: #2e7d32; }
    .af-fp-item-dl {
      padding: 5px 10px; background: ${theme.primary}; color: white;
      border: none; border-radius: 6px; font-size: 11px; font-weight: 600;
      cursor: pointer; flex-shrink: 0; transition: opacity 0.18s;
    }
    .af-fp-item-dl:hover { opacity: 0.85; }
    .af-fp-footer {
      padding: 8px 14px; border-top: 1px solid #e4e4e4;
      display: flex; justify-content: flex-end; flex-shrink: 0;
    }
    .af-fp-clear {
      font-size: 11px; color: #aaa; background: none; border: none;
      cursor: pointer; padding: 4px 8px;
    }
    .af-fp-clear:hover { color: #e53935; }

    /* ── Files badge on header btn ── */
    #af-files-btn {
      background: none; border: none; cursor: pointer; font-size: 14px;
      color: rgba(255,255,255,0.8); padding: 4px; position: relative;
    }
    #af-files-btn:hover { color: white; }
    .af-files-badge {
      position: absolute; top: -2px; right: -2px;
      background: #ff5722; color: white; border-radius: 50%;
      width: 14px; height: 14px; font-size: 8px; font-weight: 700;
      display: flex; align-items: center; justify-content: center;
      line-height: 1;
    }

    /* ── Confirm card ── */
    .af-confirm-card {
      background: white; border: 1.5px solid ${theme.primary}33;
      border-radius: 12px; align-self: flex-start; max-width: 92%;
      box-shadow: 0 3px 14px rgba(0,0,0,0.08); overflow: hidden;
      flex-shrink: 0; min-width: 240px;
    }
    .af-confirm-header {
      background: ${theme.primary}; color: white;
      padding: 8px 13px; display: flex; align-items: center; justify-content: space-between;
    }
    .af-confirm-header-label { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
    .af-confirm-header-count { font-size: 11px; opacity: 0.8; }
    .af-confirm-goal {
      font-size: 13px; font-weight: 600; color: #111;
      padding: 9px 13px; border-bottom: 1px solid #f0f0f0;
    }
    .af-confirm-rows { padding: 4px 0; max-height: 160px; overflow-y: auto; }
    .af-confirm-row {
      display: flex; align-items: center; gap: 9px;
      padding: 6px 13px; font-size: 12px; color: #333;
      border-bottom: 1px solid #f5f5f5;
    }
    .af-confirm-row:last-child { border-bottom: none; }
    .af-confirm-row-icon { font-size: 13px; flex-shrink: 0; width: 20px; text-align: center; }
    .af-confirm-row-text { flex: 1; line-height: 1.35; }
    .af-confirm-btns { display: flex; gap: 8px; padding: 10px 13px; border-top: 1px solid #f0f0f0; }
    .af-confirm-btns button { flex: 1; padding: 8px 0; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.18s; }
    .af-btn-yes { background: ${theme.primary}; color: white; }
    .af-btn-no  { background: #f0f0f0; color: #555; }

    /* ── File select card ── */
    .af-file-select-card {
      background: white; border: 1.5px solid ${theme.primary}33;
      border-radius: 12px; align-self: flex-start; max-width: 92%;
      box-shadow: 0 3px 14px rgba(0,0,0,0.08); overflow: hidden;
      flex-shrink: 0; min-width: 240px;
    }
    .af-fsc-header {
      background: ${theme.primary}; color: white;
      padding: 8px 13px; font-size: 11px; font-weight: 700;
      letter-spacing: 0.5px; text-transform: uppercase;
    }
    .af-fsc-prompt {
      font-size: 13px; color: #333; padding: 10px 13px 6px;
      border-bottom: 1px solid #f0f0f0; line-height: 1.45;
    }
    .af-fsc-list {
      padding: 8px 10px; display: flex; flex-direction: column; gap: 6px;
    }
    .af-fsc-option {
      display: flex; align-items: center; gap: 9px;
      padding: 8px 11px; border-radius: 8px; cursor: pointer;
      border: 1.5px solid #e4e4e4; background: #fafafa;
      font-size: 12.5px; color: #222; font-weight: 500;
      transition: border-color 0.15s, background 0.15s;
      text-align: left; width: 100%;
    }
    .af-fsc-option:hover {
      border-color: ${theme.primary}; background: ${theme.light};
      color: ${theme.primary};
    }
    .af-fsc-option-icon { font-size: 16px; flex-shrink: 0; }
    .af-fsc-cancel {
      display: block; width: 100%; padding: 8px 13px;
      border: none; border-top: 1px solid #f0f0f0;
      background: none; font-size: 12px; color: #aaa;
      cursor: pointer; text-align: center;
    }
    .af-fsc-cancel:hover { color: #e53935; }
    .af-confirm-btns button:hover { opacity: 0.85; }
    .af-confirm-btns button:disabled { opacity: 0.5; cursor: not-allowed; }

    /* ── Attachment staging area (above input) ── */
    #af-attachment-tray {
      display: none; padding: 8px 12px 4px;
      background: white; border-top: 1px solid #f0f0f0;
      flex-wrap: wrap; gap: 8px; flex-shrink: 0;
    }
    #af-attachment-tray.has-items { display: flex; }
    .af-staged {
      position: relative; width: 60px; height: 60px;
      border-radius: 8px; overflow: hidden; border: 1.5px solid #e0e0e0;
      background: #f7f8fa;
    }
    .af-staged img { width: 100%; height: 100%; object-fit: cover; }
    .af-staged-file {
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      height: 100%; gap: 2px; padding: 6px;
    }
    .af-staged-file .af-si { font-size: 18px; }
    .af-staged-file .af-sn { font-size: 8px; color: #666; text-align: center; word-break: break-all; overflow: hidden; max-height: 24px; }
    .af-staged-remove {
      position: absolute; top: 2px; right: 2px;
      width: 16px; height: 16px; border-radius: 50%;
      background: rgba(0,0,0,0.55); color: white;
      border: none; cursor: pointer; font-size: 9px;
      display: flex; align-items: center; justify-content: center;
      line-height: 1;
    }

    /* ── Voice preview bar ── */
    #af-voice-preview {
      display: none; align-items: center; gap: 8px;
      padding: 8px 12px; background: #f0f7ff;
      border-top: 1px solid #d0e4ff; flex-shrink: 0;
    }
    #af-voice-preview.visible { display: flex; }
    #af-voice-preview .vp-icon { font-size: 16px; flex-shrink: 0; }
    #af-voice-preview .vp-label { font-size: 11px; color: #0052cc; font-weight: 600; flex-shrink: 0; }
    #af-voice-preview input {
      flex: 1; border: 1.5px solid #b3d4ff; border-radius: 8px;
      padding: 6px 10px; font-size: 12px; outline: none;
      font-family: inherit; background: white; color: #333;
    }
    #af-voice-preview input:focus { border-color: ${theme.primary}; }
    #af-vp-send {
      padding: 6px 12px; background: ${theme.primary}; color: white;
      border: none; border-radius: 8px; font-size: 12px; font-weight: 600;
      cursor: pointer; flex-shrink: 0;
    }
    #af-vp-send:hover { background: ${theme.accent}; }
    #af-vp-discard {
      padding: 6px 10px; background: none; color: #999;
      border: 1px solid #ddd; border-radius: 8px; font-size: 12px;
      cursor: pointer; flex-shrink: 0;
    }
    #af-vp-discard:hover { color: #e53935; border-color: #e53935; }

    /* ── Recording indicator ── */
    #af-recording-bar {
      display: none; align-items: center; justify-content: center; gap: 8px;
      padding: 6px 12px; background: #fff0f0;
      border-top: 1px solid #ffcdd2; font-size: 12px; color: #c62828;
      flex-shrink: 0;
    }
    #af-recording-bar.visible { display: flex; }
    .af-rec-dot {
      width: 8px; height: 8px; border-radius: 50%; background: #e53935;
      animation: af-pulse 0.8s infinite;
    }
    #af-rec-timer { font-family: monospace; font-size: 12px; font-weight: 700; }

    /* ── Input area ── */
    #af-input-area {
      padding: 10px 12px; border-top: 1px solid #e6e6e6;
      display: flex; gap: 7px; background: white; flex-shrink: 0; align-items: center;
    }
    #af-attach-btn {
      width: 36px; height: 36px; border-radius: 50%; border: 1.5px solid #ddd;
      background: white; cursor: pointer; font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      transition: all 0.18s; flex-shrink: 0; color: #666;
      user-select: none;
    }
    #af-attach-btn:hover { border-color: ${theme.primary}; color: ${theme.primary}; }
    #af-attach-btn.has-files { border-color: ${theme.primary}; background: ${theme.light}; color: ${theme.primary}; }
    #af-file-input { display: none; }
    #af-input {
      flex: 1; padding: 10px 14px; border: 1.5px solid #ddd; border-radius: 24px;
      font-size: 13px; outline: none; font-family: inherit; transition: border-color 0.18s;
    }
    #af-input:focus { border-color: ${theme.primary}; }
    #af-input:disabled { background: #f5f5f5; color: #aaa; }
    #af-send, #af-mic {
      width: 38px; height: 38px; border-radius: 50%; border: none;
      cursor: pointer; font-size: 16px; display: flex; align-items: center;
      justify-content: center; transition: all 0.18s; flex-shrink: 0;
    }
    #af-send { background: ${theme.primary}; color: white; }
    #af-send:hover { background: ${theme.accent}; }
    #af-send:disabled { background: #ccc; cursor: not-allowed; }
    #af-mic { background: white; color: #666; border: 1.5px solid #ddd; }
    #af-mic:hover { border-color: ${theme.primary}; color: ${theme.primary}; }
    #af-mic:disabled { opacity: 0.4; cursor: not-allowed; }
    #af-mic.listening { background: #e53935; color: white; border-color: #e53935; animation: af-pulse 0.8s infinite; }

    /* ── File steps card ── */
    .af-file-steps {
      align-self: flex-start; max-width: 94%;
      background: white; border: 1px solid #e2e2e2;
      border-radius: 12px; overflow: hidden;
      font-size: 12.5px; border-bottom-left-radius: 4px;
    }
    .af-fsteps-header {
      background: #f0f4ff; padding: 7px 12px;
      font-size: 11px; font-weight: 700; color: ${theme.primary};
      border-bottom: 1px solid #e2e2e2;
    }
    .af-fsteps-list { padding: 6px 4px; display: flex; flex-direction: column; gap: 2px; }
    .af-fstep {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 5px 10px; border-radius: 6px;
    }
    .af-fstep:hover { background: #f7f8fa; }
    .af-fstep-icon { font-size: 13px; flex-shrink: 0; margin-top: 1px; }
    .af-fstep-body { flex: 1; min-width: 0; }
    .af-fstep-label { font-weight: 600; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .af-fstep-preview { font-size: 11px; color: #888; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }


    #af-branding {
      text-align: center; font-size: 10px; color: #ccc;
      padding: 5px; background: white; border-top: 1px solid #f0f0f0; flex-shrink: 0;
    }
    #af-branding a { color: ${theme.primary}; text-decoration: none; font-weight: 700; }
    /* Modern Icon Styling */
.af-fp-item-icon { font-size: 22px; color: #555; }
.af-fp-delete {
  background: none; border: none; color: #ff5252;
  cursor: pointer; padding: 5px; opacity: 0.6;
  transition: opacity 0.2s; font-size: 16px;
}
.af-fp-delete:hover { opacity: 1; }

/* Files Panel Loader */
.af-fp-loading { text-align: center; padding: 20px; color: #888; font-size: 13px; }

    /* ── Session stats bar ── */
    #af-session-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 4px 14px; background: ${theme.primary}22;
      border-bottom: 1px solid ${theme.primary}22;
      font-size: 10px; color: ${theme.primary}; flex-shrink: 0;
      font-family: monospace; letter-spacing: 0.2px;
      transition: opacity 0.3s;
    }
    #af-session-bar.hidden { display: none; }
    #af-session-bar .af-sb-item { display: flex; align-items: center; gap: 4px; }
    #af-session-bar .af-sb-sep { opacity: 0.3; margin: 0 6px; }
    #af-session-bar .af-sb-cost { color: #27ae60; font-weight: 700; }
  `;
  document.head.appendChild(style);

  // ── Build HTML ────────────────────────────────────────
  const launcher = document.createElement("button");
  launcher.id   = "af-launcher";
  launcher.type = "button";
  launcher.innerHTML = "<img src='https://dominicyogi.github.io/agentflow-widget/liontech.png' style='width:34px;height:34px;object-fit:contain;border-radius:50%;' alt='Logo' />";
  document.body.appendChild(launcher);

  const panel = document.createElement("div");
  panel.id = "af-panel";
  panel.innerHTML = `
    <div id="af-header">
      <div class="af-hinfo">
        <div class="af-title"><img src='https://dominicyogi.github.io/agentflow-widget/liontech.png' style='width:18px;height:18px;object-fit:contain;vertical-align:middle;margin-right:5px;' alt='Logo' />LionTech Support</div>
        <div class="af-sub" id="af-client-name">Connecting...</div>
      </div>
      <div class="af-hright">
        <div style="display:flex;align-items:center;gap:5px;font-size:11px;">
          <div class="af-dot" id="af-status-dot"></div><span id="af-status-label">Live</span>
        </div>
        <button id="af-files-btn" title="Files">📁<span class="af-files-badge" id="af-files-badge" style="display:none"></span></button>
        <span id="af-close">✕</span>
      </div>
    </div>
    <!-- Network warning banner -->
    <div id="af-net-banner">
      <span class="af-nb-icon" id="af-nb-icon">⚠️</span>
      <span class="af-nb-msg"  id="af-nb-msg">Connection issue</span>
      <button class="af-nb-retry" id="af-nb-retry">Retry</button>
    </div>
    <!-- Session stats bar -->
    <div id="af-session-bar" class="hidden">
      <div class="af-sb-item">💬 <span id="af-sb-msgs">0</span> msg</div>
      <div class="af-sb-sep">·</div>
      <div class="af-sb-item">⬆ <span id="af-sb-in">0</span></div>
      <div class="af-sb-sep">·</div>
      <div class="af-sb-item">⬇ <span id="af-sb-out">0</span></div>
      <div class="af-sb-sep">·</div>
      <div class="af-sb-item af-sb-cost">~$<span id="af-sb-cost">0.000000</span></div>
    </div>
    <!-- Files panel overlay -->
    <div id="af-files-panel">
      <div class="af-fp-header">
        <span>📁 Files</span>
        <span class="af-fp-close" id="af-fp-close">✕</span>
      </div>
      <div class=\"af-fp-notice\" style=\"background:#e8f5e9;border-color:#c8e6c9;color:#2e7d32;\">☁️ Files are stored in Cloudflare R2 — available for re-download anytime</div>
      <div class="af-fp-list" id="af-fp-list">
        <div class="af-fp-empty">No files yet. Send or receive a file to see it here.</div>
      </div>
      <div class="af-fp-footer">
        <button class="af-fp-clear" id="af-fp-clear">🗑 Clear all files</button>
      </div>
    </div>

    <div id="af-messages">
      <div class="af-msg thinking">Connecting to your AI agent...</div>
    </div>
    <!-- Staged attachments tray -->
    <div id="af-attachment-tray"></div>

    <!-- Voice note preview bar (shown after recording stops) -->
    <div id="af-voice-preview">
      <span class="vp-icon">🎤</span>
      <span class="vp-label">Voice:</span>
      <input id="af-vp-text" type="text" placeholder="Edit your message..." />
      <button id="af-vp-send">Send</button>
      <button id="af-vp-discard">✕</button>
    </div>

    <!-- Recording indicator -->
    <div id="af-recording-bar">
      <div class="af-rec-dot"></div>
      <span>Recording</span>
      <span id="af-rec-timer">0:00</span>
      <span style="font-size:11px;color:#999;margin-left:4px;">Click mic to stop</span>
    </div>

    <div id="af-input-area">
      <label id="af-attach-btn" for="af-file-input" title="Attach image">${ICONS.image}</label>
      <input id="af-file-input" type="file" multiple accept="image/*" />
      <input id="af-input" type="text" placeholder="Ask me anything..." disabled />
      <button id="af-mic" type="button" disabled>${ICONS.mic}</button>
      <button id="af-send" type="button" disabled>${ICONS.send}</button>
    </div>
    <div id="af-branding">Powered by <a href="#">LionTech</a></div>
  `;
  document.body.appendChild(panel);

  // ── Panel toggle ──────────────────────────────────────
  launcher.addEventListener("click", () => panel.classList.toggle("open"));
  document.getElementById("af-close").addEventListener("click", () => panel.classList.remove("open"));

  // ── Session helpers ───────────────────────────────────
  function saveSession() {
    try {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        history: conversationHistory.slice(-40), clientInfo
      }));
    } catch (e) {}
  }
  function loadSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
  }
  function clearSession() {
    try { sessionStorage.removeItem(SESSION_KEY); } catch {}
    conversationHistory = [];
    // Reset session stats too
    sessionStats = { messages: 0, inputTokens: 0, outputTokens: 0 };
    updateSessionBar();
  }

  // ── Message helpers ───────────────────────────────────
  function addMsg(type, html, persist = true) {
    const msgs = document.getElementById("af-messages");
    const el   = document.createElement("div");
    el.className = "af-msg " + type;
    el.innerHTML = html;
    msgs.appendChild(el);
    requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
    if (persist && type !== "thinking") {
      conversationHistory.push({ type, html, time: Date.now() });
      saveSession();
    }
    return el;
  }

  function clearMessages() { document.getElementById("af-messages").innerHTML = ""; }

  function restoreMessages() {
    if (!conversationHistory.length) return false;
    clearMessages();
    const msgs = document.getElementById("af-messages");
    conversationHistory.slice(-20).forEach(m => {
      const el = document.createElement("div");
      el.className = "af-msg " + m.type;
      el.innerHTML = m.html;
      msgs.appendChild(el);
    });
    msgs.scrollTop = msgs.scrollHeight;
    return true;
  }

  // ════════════════════════════════════════════════════════
  // ── FILE ATTACHMENT SYSTEM ────────────────────────────
  // ════════════════════════════════════════════════════════

  const fileInput  = document.getElementById("af-file-input");
  const attachBtn  = document.getElementById("af-attach-btn");
  const tray       = document.getElementById("af-attachment-tray");

  const FILE_ICONS = {
    pdf: "📄", doc: "📝", docx: "📝", txt: "📋",
    csv: "📊", xlsx: "📊", xls: "📊", default: "📁"
  };

  function getFileIcon(name) {
    const ext = name.split(".").pop().toLowerCase();
    return FILE_ICONS[ext] || FILE_ICONS.default;
  }

  // Render the staging tray
  function renderTray() {
    tray.innerHTML = "";
    if (attachments.length === 0) {
      tray.classList.remove("has-items");
      attachBtn.classList.remove("has-files");
      return;
    }
    tray.classList.add("has-items");
    attachBtn.classList.add("has-files");

    attachments.forEach((att, idx) => {
      const div = document.createElement("div");
      div.className = "af-staged";

      if (att.type.startsWith("image/")) {
        div.innerHTML = `<img src="${att.dataUrl}" alt="${att.name}" />`;
      } else {
        div.innerHTML = `
          <div class="af-staged-file">
            <span class="af-si">${getFileIcon(att.name)}</span>
            <span class="af-sn">${att.name}</span>
          </div>`;
      }

      const rmBtn = document.createElement("button");
      rmBtn.className   = "af-staged-remove";
      rmBtn.textContent = "×";
      rmBtn.title       = "Remove";
      rmBtn.addEventListener("click", () => {
        attachments.splice(idx, 1);
        renderTray();
      });
      div.appendChild(rmBtn);
      tray.appendChild(div);
    });
  }

  fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files);
  for (const file of files) {
    // Check if the file is an image
    if (!file.type.startsWith("image/")) {
      addMsg("warning", `⚠️ "${file.name}" is not an image and was skipped.`);
      continue;
    }
    
    if (file.size > 10 * 1024 * 1024) {
      addMsg("warning", `⚠️ "${file.name}" is over 10 MB and was skipped.`);
      continue;
    }
    const att = await readFile(file);
    attachments.push(att);
  }
  renderTray();
  fileInput.value = "";
});

  // Read file into base64 + extract text where possible
  function readFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        let text = null;

        // For plain text / CSV, extract readable content to send to AI
        if (file.type === "text/plain" || file.type === "text/csv" || file.name.endsWith(".csv")) {
          text = atob(dataUrl.split(",")[1]);
          if (text.length > 4000) text = text.slice(0, 4000) + "\n...[truncated]";
        }

        resolve({
          name:    file.name,
          type:    file.type || "application/octet-stream",
          size:    file.size,
          dataUrl, // base64 data URL
          text     // plain text content (null for binary files)
        });
      };
      reader.readAsDataURL(file);
    });
  }

  // ════════════════════════════════════════════════════════
  // ── FILE STORAGE (localStorage) ──────────────────────
  // ════════════════════════════════════════════════════════

  const FILES_KEY = "af_files_" + API_KEY;

  function loadStoredFiles() {
    try { return JSON.parse(localStorage.getItem(FILES_KEY) || "[]"); }
    catch { return []; }
  }

  function saveStoredFiles(files) {
    try { localStorage.setItem(FILES_KEY, JSON.stringify(files.slice(0, 50))); }
    catch (e) { console.warn("localStorage full — files not saved", e); }
  }

  function storeFile(name, url, mimeType, direction, size) {
  const files = loadStoredFiles();
  const already = files.findIndex(function(f) { return f.name === name && f.direction === direction; });
  const entry = { name: name, url: url, mimeType: mimeType, direction: direction,
                  time: Date.now(), size: size || 0 };
  if (already >= 0) files[already] = entry;
  else files.unshift(entry);
  saveStoredFiles(files);
  updateFilesBadge();
}

  function updateFilesBadge() {
    const files  = loadStoredFiles();
    const badge  = document.getElementById("af-files-badge");
    if (!badge) return;
    if (files.length > 0) {
      badge.style.display = "flex";
      badge.textContent   = files.length > 9 ? "9+" : String(files.length);
    } else {
      badge.style.display = "none";
    }
  }

  function formatBytes(bytes) {
    if (bytes < 1024)       return bytes + " B";
    if (bytes < 1024*1024)  return (bytes/1024).toFixed(1) + " KB";
    return (bytes/(1024*1024)).toFixed(1) + " MB";
  }

  function fpTimeAgo(ts) {
    const diff = Date.now() - ts;
    const m = Math.floor(diff / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (m < 1)  return "just now";
    if (m < 60) return m + "m ago";
    if (h < 24) return h + "h ago";
    return d + "d ago";
  }

  // ── New: Fetch and Render Files from Server ──────────
async function renderFilesPanel() {
  const list = document.getElementById("af-fp-list");
  list.innerHTML = '<div class="af-fp-loading">Loading your workspace...</div>';

  try {
    // We pass the deviceId in the headers so the server can filter the files
    const res = await fetchWithRetry(`${BACKEND_URL}/api/agent/workspace?deviceId=${deviceInfo.deviceId}`, {
      headers: { 
        "x-api-key": API_KEY,
        "ngrok-skip-browser-warning": "true" 
      }
    }, { timeout: adaptiveTimeout(12000), retries: 2 });
    const data = await res.json();
    
    if (!data.success || !data.files || data.files.length === 0) {
      list.innerHTML = '<div class="af-fp-empty">No files in your workspace yet.</div>';
      return;
    }

    const icons = {
      pdf: "📄", doc: "📝", docx: "📝", txt: "📑", 
      csv: "📊", xlsx: "📊", png: "🖼️", jpg: "🖼️"
    };

    list.innerHTML = data.files.map((f) => {
      return `
        <div class="af-fp-item">
          <div class="af-fp-item-icon">${ICONS.file}</div>
          <div class="af-fp-item-info">
            <div class="af-fp-item-name">${escHtml(f.name)}</div>
            <div class="af-fp-item-meta">${formatBytes(f.size)}</div>
          </div>
          <button class="af-fp-item-dl" onclick="afDownloadFile('${f.name}')">${ICONS.download}</button>
          <button class="af-fp-delete" onclick="afDeleteFile('${f.name}')">${ICONS.trash}</button>
        </div>`;
    }).join("");

  } catch (err) {
    list.innerHTML = '<div class="af-fp-empty">⚠️ Could not load files — check your connection and try again.</div>';
  }
}

// ── New: Delete Specific File ────────────────────────
window.afDeleteFile = async function(filename) {
  if (!confirm(`Are you sure you want to delete "${filename}"?`)) return;

  try {
    const res = await fetchWithRetry(`${BACKEND_URL}/api/agent/workspace/${encodeURIComponent(filename)}`, {
      method: "DELETE",
      headers: { "x-api-key": API_KEY }
    }, { timeout: adaptiveTimeout(10000), retries: 1 });
    
    if (res.ok) {
      renderFilesPanel();
      updateFilesBadge();
    } else {
      alert("Failed to delete file. Please check your connection and try again.");
    }
  } catch (err) {
    alert(err.name === "AbortError"
      ? "Delete timed out. Please check your connection."
      : "Failed to delete file.");
    console.error("Delete error:", err);
  }
};

// ── Update Download Helper ───────────────────────────
window.afDownloadFile = function(filename) {
  const downloadUrl = `${BACKEND_URL}/api/agent/workspace/${encodeURIComponent(filename)}?key=${encodeURIComponent(API_KEY)}`;
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = filename;
  a.target = "_blank";
  a.click();
};

  // ── Wire up files panel toggle ─────────────────────────
  document.getElementById("af-files-btn").addEventListener("click", function() {
    renderFilesPanel();
    document.getElementById("af-files-panel").classList.add("open");
  });
  document.getElementById("af-fp-close").addEventListener("click", function() {
    document.getElementById("af-files-panel").classList.remove("open");
  });
  document.getElementById("af-fp-clear").addEventListener("click", function() {
    if (confirm("Clear all stored files? This cannot be undone.")) {
      localStorage.removeItem(FILES_KEY);
      updateFilesBadge();
      renderFilesPanel();
    }
  });

  // Init badge on load
  updateFilesBadge();

  // Build the attachment context string to inject into the AI message
  function buildAttachmentContext(atts) {
    if (!atts || atts.length === 0) return "";
    let ctx = "\n\n[ATTACHED FILES]\n";
    atts.forEach((att, i) => {
      ctx += `File ${i+1}: "${att.name}" (${att.type}, ${(att.size/1024).toFixed(1)} KB)\n`;
      if (att.text) ctx += `Content:\n${att.text}\n`;
      else if (att.type.startsWith("image/")) ctx += `[Image file — analyze visually if possible]\n`;
      else ctx += `[Binary file — name and type provided for context]\n`;
    });
    return ctx;
  }

  // Render attachment thumbnails inside a chat bubble
  function renderAttachmentThumbs(atts) {
    if (!atts || atts.length === 0) return "";
    const thumbs = atts.map(att => {
      if (att.type.startsWith("image/")) {
        return `<div class="af-att-thumb"><img src="${att.dataUrl}" alt="${att.name}" /></div>`;
      }
      return `
        <div class="af-att-thumb">
          <div class="af-att-file">
            <span class="af-att-icon">${getFileIcon(att.name)}</span>
            <span class="af-att-name">${att.name}</span>
          </div>
        </div>`;
    }).join("");
    return `<div class="af-msg-attachments">${thumbs}</div>`;
  }

  // ════════════════════════════════════════════════════════
  // ── VOICE NOTE WITH PREVIEW ───────────────────────────
  // ════════════════════════════════════════════════════════

  const micBtn       = document.getElementById("af-mic");
  const voicePreview = document.getElementById("af-voice-preview");
  const vpText       = document.getElementById("af-vp-text");
  const vpSend       = document.getElementById("af-vp-send");
  const vpDiscard    = document.getElementById("af-vp-discard");
  const recordingBar = document.getElementById("af-recording-bar");
  const recTimer     = document.getElementById("af-rec-timer");

  let recognition    = null;
  let isRecording    = false;
  let recInterval    = null;
  let recSeconds     = 0;
  let voiceTranscript = "";

  // Show voice preview bar with transcript for editing
  function showVoicePreview(text) {
    vpText.value = text;
    voicePreview.classList.add("visible");
    vpText.focus();
    vpText.select();
  }

  function hideVoicePreview() {
    voicePreview.classList.remove("visible");
    vpText.value = "";
    voiceTranscript = "";
  }

  function startRecordingUI() {
    isRecording = true;
    recSeconds  = 0;
    micBtn.classList.add("listening");
    recordingBar.classList.add("visible");
    hideVoicePreview();
    recTimer.textContent = "0:00";
    recInterval = setInterval(() => {
      recSeconds++;
      const m = Math.floor(recSeconds / 60);
      const s = recSeconds % 60;
      recTimer.textContent = m + ":" + (s < 10 ? "0" : "") + s;
    }, 1000);
  }

  function stopRecordingUI() {
    isRecording = false;
    micBtn.classList.remove("listening");
    recordingBar.classList.remove("visible");
    clearInterval(recInterval);
  }

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous      = false;
    recognition.interimResults  = false;
    recognition.lang            = "en-US";

    recognition.onstart = () => startRecordingUI();

    recognition.onend = () => {
      stopRecordingUI();
      if (voiceTranscript.trim()) {
        // Show preview so user can edit before sending
        showVoicePreview(voiceTranscript.trim());
      }
    };

    recognition.onerror = () => {
      stopRecordingUI();
      addMsg("warning", "⚠️ Couldn't capture voice. Try again or type your message.", false);
    };

    recognition.onresult = (e) => {
      voiceTranscript = e.results[0][0].transcript;
    };

    micBtn.addEventListener("click", () => {
      if (isProcessing) return;
      if (isRecording) {
        recognition.stop();
      } else {
        voiceTranscript = "";
        hideVoicePreview();
        recognition.start();
      }
    });

  } else {
    micBtn.style.opacity = "0.3";
    micBtn.title = "Voice not supported in this browser";
  }

  // Voice preview send/discard
  vpSend.addEventListener("click", () => {
    const text = vpText.value.trim();
    if (!text) return;
    hideVoicePreview();
    sendMessage(text);
  });

  vpText.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); vpSend.click(); }
    if (e.key === "Escape") { hideVoicePreview(); }
  });

  vpDiscard.addEventListener("click", () => {
    hideVoicePreview();
    addMsg("agent", "Voice note discarded. Type or record again when you're ready.", false);
  });

  // ── Page scanner ──────────────────────────────────────
  function scanPage() {
    let idCounter = 0;
    function afId(el) {
      if (!el.dataset.afId) el.dataset.afId = "af_" + idCounter++;
      return el.dataset.afId;
    }
    const buttons = [], inputs = [], links = [], tables = [];

    document.querySelectorAll("button,[role='button'],input[type='button'],input[type='submit']").forEach(el => {
      if (el.id === "af-launcher" || el.closest("#af-panel")) return;
      const stepEl   = el.closest("[data-wizard-step]");
      const stepInfo = stepEl ? " [wizard-step-" + stepEl.dataset.wizardStep + "]" : "";
      buttons.push({
        afId: afId(el), type: "button",
        text: ((el.textContent || el.value || "").trim().slice(0, 60)) + stepInfo,
        id: el.id || null, disabled: el.disabled
      });
    });

    document.querySelectorAll("input:not([type='button']):not([type='submit']),textarea,select").forEach(el => {
      if (el.id === "af-input" || el.id === "af-vp-text" || el.id === "af-file-input" || el.closest("#af-panel")) return;
      const stepEl = el.closest("[data-wizard-step]");
      const step   = stepEl ? parseInt(stepEl.dataset.wizardStep) : null;
      const labelEl    = el.labels && el.labels[0] ? el.labels[0] : null;
      const formGroup  = el.closest(".form-group");
      const formLabel  = formGroup ? formGroup.querySelector(".form-label") : null;
      inputs.push({
        afId: afId(el), type: el.tagName.toLowerCase(),
        placeholder: el.placeholder || null,
        label: (labelEl ? labelEl.textContent.trim() : null) || (formLabel ? formLabel.textContent.trim() : null),
        id: el.id || null, value: el.value || null,
        wizardStep: step
      });
    });

    document.querySelectorAll("a[href]").forEach(el => {
      if (el.closest("#af-panel")) return;
      links.push({ afId: afId(el), type: "link", text: el.textContent.trim().slice(0, 60), href: el.href || null });
    });

    document.querySelectorAll("table").forEach(table => {
      if (table.closest("#af-panel")) return;
      const headers = Array.from(table.querySelectorAll("th")).map(th => th.textContent.trim());
      const rows = Array.from(table.querySelectorAll("tbody tr")).map(row => {
        const badge = row.querySelector(".badge,.status");
        return {
          afId: afId(row), id: row.id || null,
          cells: Array.from(row.querySelectorAll("td")).map(td => td.textContent.trim().slice(0, 60)),
          status: badge ? badge.textContent.trim() : null
        };
      });
      tables.push({ afId: afId(table), type: "table", id: table.id || null, headers, rows: rows.slice(0, 30) });
    });

    const headings = [];
    document.querySelectorAll("h1,h2,h3,h4,[class*='title'],[class*='heading'],[class*='section-name']").forEach(el => {
      if (el.closest("#af-panel")) return;
      const text = el.textContent.trim().slice(0, 80);
      if (text && text.length > 2) headings.push(text);
    });

    return { pageTitle: document.title, url: window.location.href, pageText: document.body.innerText.slice(0, 600), buttons, inputs, links, tables, headings };
  }

  // ── Action executor ───────────────────────────────────
  async function executeActions(actions) {
    // results[i] and auditDetails[i] are always in sync with actions[i]
    // so the audit log is never assembled by fragile string-matching.
    const results      = [];   // { ok, msg }          — for UI display
    const auditDetails = [];   // { type, description, value, elementId, success, startedAt, completedAt }

    // ── Helper: fire the confirm audit call ─────────────────────────────────
    // Accepts a pre-built details array so navigate can fire before page unloads.
    function fireAudit(detailsSnapshot) {
      const operator = detectOperator();
      fetchWithRetry(BACKEND_URL + "/api/agent/confirm", {
        method:  "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
        body: JSON.stringify({
          command:       pendingPlan ? pendingPlan.originalCommand : "",
          action:        pendingPlan ? pendingPlan.taskType        : "task",
          pageTitle:     document.title,
          pageUrl:       window.location.href,
          rowCount:      detailsSnapshot.length,
          results:       results.map(r => r.msg),
          actionDetails: detailsSnapshot,
          operator:      { detectedName: operator, source: operator ? "page-scrape" : "unknown" },
          device:        deviceInfo,
          sessionId:     SESSION_KEY
        })
      }, { timeout: 10000, retries: 2 }).catch(() => {});
    }

    for (let i = 0; i < actions.length; i++) {
      const action    = actions[i];
      const startedAt = new Date().toISOString();
      await sleep(400);

      let ok  = false;
      let msg = "";

      try {
        let el = action.afId ? document.querySelector('[data-af-id="' + action.afId + '"]') : null;
        if (!el && action.elementId) el = document.getElementById(action.elementId);
        if (!el && action.selector)  el = document.querySelector(action.selector);

        if (!el && !["navigate","scroll","click_by_text"].includes(action.type)) {
          ok  = false;
          msg = "Could not find element for: <em>" + action.description + "</em>";
          results.push({ ok, msg });
          auditDetails.push({ type: action.type, description: action.description, value: action.value||null, elementId: action.elementId||null, success: false, startedAt, completedAt: new Date().toISOString() });
          continue;
        }

        if (el) {
          const origOutline = el.style.outline, origBg = el.style.background;
          el.style.outline   = "2px solid " + theme.primary;
          el.style.background = theme.light;
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          await sleep(350);
          el.style.outline    = origOutline;
          el.style.background = origBg;
        }

        if (action.type === "click") {
          el.click();
          ok  = true;
          msg = "🖱️ Clicked <strong>" + action.description + "</strong>";
          await sleep(600);

        } else if (action.type === "click_by_text") {
          const searchText = (action.value || action.description || "").toLowerCase().trim();
          const allBtns    = Array.from(document.querySelectorAll("button,[role='button']")).filter(b => !b.closest("#af-panel"));
          const match      = allBtns.find(b => b.textContent.trim().toLowerCase().includes(searchText));
          if (match) {
            match.scrollIntoView({ behavior: "smooth", block: "center" });
            await sleep(300);
            match.click();
            ok  = true;
            msg = `🖱️ Clicked "<strong>${match.textContent.trim().slice(0,40)}</strong>"`;
            await sleep(700);
          } else {
            ok  = false;
            msg = `⚠️ Could not find button with text: "${action.value}"`;
          }

        } else if (action.type === "fill") {
          el.focus();
          el.value = action.value;
          el.dispatchEvent(new Event("input",  { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          ok  = true;
          msg = `✏️ Filled <strong>${action.description}</strong> → "${action.value}"`;

        } else if (action.type === "select") {
          el.value = action.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          ok  = true;
          msg = `📋 Selected <strong>${action.description}</strong> → "${action.value}"`;

        } else if (action.type === "approve_row") {
          const btn = el.querySelector(".btn-approve,[class*='approve']") ||
            Array.from(el.querySelectorAll("button")).find(b => /approve/i.test(b.textContent));
          if (btn) { btn.click(); ok = true;  msg = `✅ Approved — <strong>${action.description}</strong>`; }
          else      {             ok = false; msg = `⚠️ No approve button in row: <strong>${action.description}</strong>`; }

        } else if (action.type === "reject_row") {
          const btn = el.querySelector(".btn-reject,[class*='reject']") ||
            Array.from(el.querySelectorAll("button")).find(b => /reject/i.test(b.textContent));
          if (btn) { btn.click(); ok = true;  msg = `❌ Rejected — <strong>${action.description}</strong>`; }
          else      {             ok = false; msg = `⚠️ No reject button in row: <strong>${action.description}</strong>`; }

        } else if (action.type === "escalate_row") {
          const btn = el.querySelector(".btn-escalate,[class*='escalate']") ||
            Array.from(el.querySelectorAll("button")).find(b => /escalate|flag|hold/i.test(b.textContent));
          if (btn) {
            btn.click();
            ok  = true;
            msg = `⚠️ Escalated — <strong>${action.description}</strong>`;
          } else {
            el.style.background = "#fff8e1";
            el.style.outline    = "2px solid #f57f17";
            ok  = true;
            msg = `⚠️ Flagged for escalation — <strong>${action.description}</strong>`;
          }

        } else if (action.type === "navigate") {
          const remaining = actions.slice(i + 1);
          if (remaining.length > 0) {
            savePendingContinuation({
              originalCommand: pendingPlan?.originalCommand || "",
              taskType:        pendingPlan?.taskType        || "task",
              stepsCompleted:  actions.slice(0, i).map(a => a.description).filter(Boolean),
              stepsRemaining:  remaining.map(a => ({
                description: a.description,
                type:        a.type,
                value:       a.value     || null,
                elementId:   a.elementId || null
              })),
              fromPage: document.title,
              fromUrl:  window.location.href
            });
          }

          ok  = true;
          msg = `🔗 Navigating to <strong>${action.description}</strong>…`;

          // Record and show this action before the page unloads
          results.push({ ok, msg });
          auditDetails.push({ type: action.type, description: action.description, value: action.value||null, elementId: action.elementId||null, success: true, startedAt, completedAt: new Date().toISOString() });
          addMsg("success", msg);

          // ── Fire audit NOW — page is about to unload ─────────────────────
          // Use sendBeacon as a best-effort guarantee that the log reaches the
          // server even if the page tears down mid-fetch.
          const auditPayload = JSON.stringify({
            command:       pendingPlan ? pendingPlan.originalCommand : "",
            action:        pendingPlan ? pendingPlan.taskType        : "task",
            pageTitle:     document.title,
            pageUrl:       window.location.href,
            rowCount:      auditDetails.length,
            results:       results.map(r => r.msg),
            actionDetails: auditDetails,
            operator:      { detectedName: detectOperator(), source: detectOperator() ? "page-scrape" : "unknown" },
            device:        deviceInfo,
            sessionId:     SESSION_KEY
          });

          const beaconSent = navigator.sendBeacon
            ? navigator.sendBeacon(
                BACKEND_URL + "/api/agent/confirm",
                new Blob([auditPayload], { type: "application/json" })
              )
            : false;

          // sendBeacon doesn't set custom headers — if it failed or isn't available,
          // fall back to a regular fetch (may or may not complete before unload)
          if (!beaconSent) {
            fetchWithRetry(BACKEND_URL + "/api/agent/confirm", {
              method:  "POST",
              headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
              body:    auditPayload
            }, { timeout: 5000, retries: 0 }).catch(() => {});
          }

          await sleep(300);
          window.location.href = action.value;
          return; // stop — page is unloading

        } else if (action.type === "scroll") {
          if (action.value === "top")    window.scrollTo({ top: 0, behavior: "smooth" });
          if (action.value === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          if (action.value === "down")   window.scrollBy({ top: 300, behavior: "smooth" });
          if (action.value === "up")     window.scrollBy({ top: -300, behavior: "smooth" });
          ok  = true;
          msg = `↕️ Scrolled <strong>${action.value}</strong>`;

        } else {
          ok  = false;
          msg = "Unknown action type: " + action.type;
        }

      } catch (err) {
        ok  = false;
        msg = "Error: " + err.message;
      }

      results.push({ ok, msg });
      auditDetails.push({
        type:        action.type,
        description: action.description,
        value:       action.value     || null,
        elementId:   action.elementId || null,
        success:     ok,
        startedAt,
        completedAt: new Date().toISOString()
      });
    }

    // ── Display results ────────────────────────────────────────────────────
    const okMsgs  = results.filter(r => r.ok);
    const errMsgs = results.filter(r => !r.ok);
    if (okMsgs.length)  addMsg("success", okMsgs.map(r => r.msg).join("<br>"));
    if (errMsgs.length) addMsg("error",   errMsgs.map(r => r.msg).join("<br>"));

    // ── Audit trail (fire-and-forget) ──────────────────────────────────────
    fireAudit(auditDetails);
  }

  // ── Confirm card ──────────────────────────────────────
  // ── File result display ─────────────────────────────
  // Shows step-by-step tool progress, final answer, and download buttons
  function showFileResult(steps, finalReply, downloadables) {
    const msgs = document.getElementById("af-messages");

    if (steps.length > 0) {
      const card = document.createElement("div");
      card.className = "af-file-steps";

      const stepsHtml = steps.map(s => {
        const ok      = !s.result?.startsWith("Error:");
        const icon    = ok ? "✅" : "❌";
        const preview = s.result ? s.result.split("\n")[0].slice(0, 80) : "";
        return "<div class=\"af-fstep\">" +
          "<span class=\"af-fstep-icon\">" + icon + "</span>" +
          "<div class=\"af-fstep-body\">" +
            "<div class=\"af-fstep-label\">" + s.label + "</div>" +
            (preview ? "<div class=\"af-fstep-preview\">" + escHtml(preview) + "</div>" : "") +
          "</div></div>";
      }).join("");

      card.innerHTML = "<div class=\"af-fsteps-header\">⚙️ " + steps.length + " step" + (steps.length > 1 ? "s" : "") + " completed</div>" +
        "<div class=\"af-fsteps-list\">" + stepsHtml + "</div>";
      msgs.appendChild(card);
    }

    // Final answer bubble
    if (finalReply?.trim()) {
      addMsg("agent", finalReply);
    }

    // Download buttons for any files produced
    if (downloadables && downloadables.length > 0) {
  downloadables.forEach(dl => {
    // Store lightweight metadata — no file bytes in the browser
    storeFile(dl.filename, dl.url || "", dl.mimeType || "application/octet-stream", "received", dl.size || 0);

    const ext   = dl.filename.split(".").pop().toLowerCase();
    const icons = { pdf:"📄", doc:"📝", docx:"📝", txt:"📋", csv:"📊", xlsx:"📊", xls:"📊", default:"📁" };
    const icon  = icons[ext] || icons.default;
    const card  = document.createElement("div");
    card.className = "af-download-card";
    card.innerHTML =
      "<div class=\"af-dl-label\">📥 File ready</div>" +
      "<div class=\"af-dl-file\">" +
        "<span class=\"af-dl-icon\" style=\"color:${theme.primary}\">" + ICONS.file + "</span>" +
        "<div class=\"af-dl-info\">" +
          "<div class=\"af-dl-name\">" + escHtml(dl.filename) + "</div>" +
          "<div class=\"af-dl-size\">" + formatBytes(dl.size || 0) + "</div>" +
        "</div>" +
        "<button class=\"af-dl-btn\">" + ICONS.download + " Download</button>" +
      "</div>";
    card.querySelector(".af-dl-btn").addEventListener("click", () => {
      const downloadUrl = BACKEND_URL + dl.url + "?key=" + encodeURIComponent(API_KEY);
      const a = document.createElement("a");
      a.href = downloadUrl; a.download = dl.filename; a.target = "_blank"; a.click();
    });
    msgs.appendChild(card);
  });
  updateFilesBadge();
}

    msgs.scrollTop = msgs.scrollHeight;
  }

  function escHtml(str) {
    return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
  }

  function showConfirmCard(reply, plan) {
    pendingPlan = plan;
    const actions = plan.actions || [];

    // Split reply: first line = goal, remaining lines = display rows
    var lines    = (reply || "").split("\n").map(function(l){ return l.trim(); }).filter(Boolean);
    var goal     = lines[0] || "Ready to execute.";
    var rowLines = lines.slice(1);

    // Fallback: derive rows from unique action descriptions if AI gave none
    if (rowLines.length === 0) {
      var seen = {};
      rowLines = actions.map(function(a){ return a.description; })
        .filter(function(d){ if (!d || seen[d]) return false; seen[d]=1; return true; })
        .slice(0, 10);
    }

    // Split leading emoji from rest of text for icon/text columns
    function splitEmoji(str) {
      if (!str) return { icon: "▸", text: "" };
      var cp = str.codePointAt(0);
      if (cp > 127) {
        var ch = String.fromCodePoint(cp);
        return { icon: ch, text: str.slice(ch.length).trim() };
      }
      return { icon: "▸", text: str };
    }

    var rowsHtml = rowLines.map(function(r) {
      var parts = splitEmoji(r);
      return "<div class=\"af-confirm-row\">" +
        "<span class=\"af-confirm-row-icon\">" + parts.icon + "</span>" +
        "<span class=\"af-confirm-row-text\">" + escHtml(parts.text) + "</span>" +
        "</div>";
    }).join("");

    var card = document.createElement("div");
    card.className = "af-confirm-card";
    card.innerHTML =
      "<div class=\"af-confirm-header\">" +
        "<span class=\"af-confirm-header-label\">⚡ Planned Action</span>" +
        "<span class=\"af-confirm-header-count\">" + actions.length + " step" + (actions.length !== 1 ? "s" : "") + "</span>" +
      "</div>" +
      "<div class=\"af-confirm-goal\">" + escHtml(goal) + "</div>" +
      (rowsHtml ? "<div class=\"af-confirm-rows\">" + rowsHtml + "</div>" : "") +
      "<div class=\"af-confirm-btns\">" +
        "<button class=\"af-btn-yes\" type=\"button\">✅ Yes, do it</button>" +
        "<button class=\"af-btn-no\"  type=\"button\">✕ Cancel</button>" +
      "</div>";

    var msgs = document.getElementById("af-messages");
    msgs.appendChild(card);
    // Use setTimeout so the card is fully painted before we scroll it into view
    setTimeout(function() {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 60);
    setInputLocked(true);

    card.querySelector(".af-btn-yes").addEventListener("click", async function() {
      card.querySelector(".af-btn-yes").disabled = true;
      card.querySelector(".af-btn-no").disabled  = true;
      card.querySelector(".af-confirm-header").innerHTML =
        "<span class=\"af-confirm-header-label\">⏳ Executing...</span>" +
        "<span class=\"af-confirm-header-count\">please wait</span>";
      await executeActions(plan.actions || []);
      card.remove(); pendingPlan = null; setInputLocked(false);
    });
    card.querySelector(".af-btn-no").addEventListener("click", function() {
      card.remove(); pendingPlan = null;
      addMsg("agent", "Alright, cancelled. What else can I help you with?");
      setInputLocked(false);
    });
  }

  function setInputLocked(locked) {
    isProcessing = locked;
    document.getElementById("af-input").disabled = locked;
    document.getElementById("af-send").disabled  = locked;
    document.getElementById("af-mic").disabled   = locked;
  }

  // ── File select card ─────────────────────────────────
  // Renders a list of library files for the user to pick from.
  // On click, sends the filename back as a user message so the AI reads it.
  function showFileSelectCard(prompt, files) {
    const msgs = document.getElementById("af-messages");
    const card = document.createElement("div");
    card.className = "af-file-select-card";

    const FILE_ICONS = { csv:"📊", xlsx:"📊", xls:"📊", pdf:"📄", txt:"📋", md:"📋", docx:"📝", pptx:"📑", json:"🗂️" };
    function fIcon(name) {
      const ext = (name.split(".").pop() || "").toLowerCase();
      return FILE_ICONS[ext] || "📁";
    }

    const optionsHtml = files.map(f =>
      `<button class="af-fsc-option" data-filename="${escHtml(f)}">` +
        `<span class="af-fsc-option-icon">${fIcon(f)}</span>` +
        `<span>${escHtml(f)}</span>` +
      `</button>`
    ).join("");

    card.innerHTML =
      `<div class="af-fsc-header">📚 Choose a reference file</div>` +
      `<div class="af-fsc-prompt">${escHtml(prompt || "Which file should I use to answer your question?")}</div>` +
      `<div class="af-fsc-list">${optionsHtml}</div>` +
      `<button class="af-fsc-cancel">Cancel</button>`;

    msgs.appendChild(card);
    setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "nearest" }), 60);
    setInputLocked(true);

    card.querySelectorAll(".af-fsc-option").forEach(btn => {
      btn.addEventListener("click", () => {
        const chosen = btn.getAttribute("data-filename");
        card.remove();
        setInputLocked(false);
        sendMessage(chosen);
      });
    });

    card.querySelector(".af-fsc-cancel").addEventListener("click", () => {
      card.remove();
      addMsg("agent", "No problem. Let me know if you need anything else.");
      setInputLocked(false);
    });
  }

  // ── Send message ──────────────────────────────────────
  async function sendMessage(message) {

  // ── Offline guard — queue instead of failing ─────────
  if (networkStatus === "offline") {
    offlineQueue.push(message);
    addMsg("warning", "📮 You're offline — your message has been queued and will send automatically when you reconnect.", false);
    return;
  }

  setInputLocked(true);

  // 1. Snapshot and clear current attachments
  const currentAttachments = [...attachments];
  attachments = [];
  renderTray();

  // 2. Categorize attachments
  const imageAttachments = currentAttachments.filter(a => a.type.startsWith("image/"));
  const docAttachments = currentAttachments.filter(a => !a.type.startsWith("image/"));

  // 3. Build UI for the user's message bubble
  const thumbsHtml = renderAttachmentThumbs(currentAttachments);
  addMsg("user", message + thumbsHtml);

  const thinking = addMsg("thinking", "🧠 Thinking...", false);

  try {
    // 4. Upload Documents to the server workspace first
    // This allows the AI to "see" them via list_files and read_file tools
    if (docAttachments.length > 0) {
      const formData = new FormData();
      for (const doc of docAttachments) {
        // Convert the base64 dataUrl back to a Blob for a standard multipart upload
        const response = await fetch(doc.dataUrl);
        const blob = await response.blob();
        formData.append("files", blob, doc.name);
      }

      await fetchWithRetry(BACKEND_URL + "/api/agent/upload", {
        method: "POST",
        headers: { 
          "x-api-key": API_KEY,
          "ngrok-skip-browser-warning": "true" 
        },
        body: formData
      }, { timeout: adaptiveTimeout(30000), retries: 1 });
    }

    // Adaptive history — send fewer turns on slow connections to reduce payload
    const historyLimit = adaptiveHistoryLimit();
    const historyForAI = conversationHistory.slice(-historyLimit).map(m => ({
      role: m.type === "user" ? "user" : "assistant",
      content: m.html.replace(/<[^>]+>/g, "").slice(0, 2000)
    }));

    // 5. Capture current page context for the AI
    const pageContext = scanPage();

    // 6. Send the message payload with retry + adaptive timeout
    //    AI responses are slow by nature; give 60 s on good, 120 s on slow link.
    const res = await fetchWithRetry(BACKEND_URL + "/api/agent/message", {
      method: "POST",
      headers: { 
        "x-api-key": API_KEY, 
        "Content-Type": "application/json", 
        "ngrok-skip-browser-warning": "true",
        "x-connection-quality": networkStatus   // hint for server-side adaptation
      },
      body: JSON.stringify({
        message: message,
        pageContext,
        history: historyForAI,
        // Only images go in the body for the Vision path; docs are already in the workspace
        attachments: imageAttachments.length > 0 ? imageAttachments.map(a => ({
          name: a.name,
          type: a.type,
          dataUrl: a.dataUrl
        })) : undefined
      })
    }, { timeout: adaptiveTimeout(60000), retries: 1, backoff: 2000 });

    thinking.remove();
    if (!res.ok) throw new Error("Backend error " + res.status);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Unknown error");

    // ── Track session token usage ─────────────────────────────────────────
    // The backend returns data.usage when token tracking is enabled.
    if (data.usage) {
      sessionStats.messages++;
      sessionStats.inputTokens  += data.usage.inputTokens  || 0;
      sessionStats.outputTokens += data.usage.outputTokens || 0;
      updateSessionBar();
    } else {
      // Still increment message count even if usage isn't available yet
      sessionStats.messages++;
      updateSessionBar();
    }
    // ── Robust JSON extractor: mirrors backend extractJSON logic ─────────
    // Finds and returns the first complete JSON object inside any string,
    // even if the model added a preamble, trailing text, or markdown fences.
    function extractFirstJSON(str) {
      const raw   = (str || "").replace(/```json|```/g, "").trim();
      const start = raw.indexOf("{");
      if (start === -1) throw new Error("No JSON");
      let depth = 0, inStr = false, esc = false, end = -1;
      for (let i = start; i < raw.length; i++) {
        const c = raw[i];
        if (esc)        { esc = false; continue; }
        if (c === "\\") { esc = true;  continue; }
        if (c === '"')  { inStr = !inStr; continue; }
        if (inStr)      continue;
        if (c === "{")  depth++;
        else if (c === "}") { depth--; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) throw new Error("Unbalanced");
      return JSON.parse(raw.slice(start, end + 1).replace(/,(\s*[}\]])/g, "$1"));
    }

    // ── tryReparse: handles all the ways the response can go wrong ───────
    // 1. Response is already a correctly-typed object → pass through
    // 2. Response is a string (double-serialised) → extract JSON from it
    // 3. Response is {type:"chat", reply: "<json string>"} → extract from reply
    // 4. Response has no type / unexpected type → try to extract from reply
    function tryReparse(r) {
      // Already a known non-chat typed response — return as-is
      if (r && typeof r === "object" && r.type && r.type !== "chat") return r;

      // r is a raw string (backend accidentally stringified the object)
      if (typeof r === "string") {
        try {
          const parsed = extractFirstJSON(r);
          if (parsed && parsed.type) return parsed;
        } catch {}
        return { type: "chat", reply: r };
      }

      // r.reply may contain a raw JSON string (extractJSON failed on backend)
      const replyStr = (r && r.reply) ? String(r.reply) : "";
      if (replyStr.includes("{")) {
        try {
          const inner = extractFirstJSON(replyStr);
          if (inner && inner.type && inner.type !== "chat") return inner;
        } catch {}
      }

      return r || { type: "chat", reply: "Done." };
    }

    const response = tryReparse(data.response);

    if (response.type === "chat") {
      // Guard: never render raw JSON as a chat bubble
      const replyText = response.reply || "";
      if (replyText.trimStart().startsWith("{")) {
        try {
          const rescued = extractFirstJSON(replyText);
          if (rescued && rescued.type && rescued.type !== "chat") {
            if (rescued.type === "task" && rescued.plan?.actions?.length > 0) {
              rescued.plan.originalCommand = message;
              showConfirmCard(rescued.reply, rescued.plan);
            } else if (rescued.type === "file_select") {
              showFileSelectCard(rescued.reply, rescued.files || []);
            } else {
              addMsg("agent", rescued.reply || "Done.");
            }
            if (rescued.type !== "file_select") setInputLocked(false);
            return;
          }
        } catch {}
      }
      addMsg("agent", replyText || "Done.");
    } else if (response.type === "file_select") {
      showFileSelectCard(response.reply, response.files || []);
    } else if (response.type === "task") {
      if (response.plan?.actions?.length > 0) {
        response.plan.originalCommand = message;
        showConfirmCard(response.reply, response.plan);
      } else {
        addMsg("agent", response.reply || "Done.");
      }
    } else if (response.type === "file_result") {
      let fileReply = response.reply || "Done.";
      try {
        const p = extractFirstJSON(fileReply);
        if (p?.reply) fileReply = p.reply;
      } catch {}
      showFileResult(response.steps || [], fileReply, response.downloadables || []);
    } else {
      addMsg("agent", response.reply || "Done.");
    }

    // file_select manages its own lock — only unlock for other response types
    if (response.type !== "file_select") setInputLocked(false);

  } catch (err) {
    if (thinking) thinking.remove();
    // Distinguish timeout / offline errors from general backend errors
    if (err.name === "AbortError") {
      addMsg("error", "⏱️ The request timed out. Your connection may be slow — please try again.");
    } else if (!navigator.onLine) {
      offlineQueue.push(message);
      addMsg("warning", "📮 You went offline mid-request. Message queued — it'll send when you reconnect.");
      updateNetworkStatus();
    } else {
      addMsg("error", "⚠️ Something went wrong. Check that the server is running.");
    }
    console.error("AgentFlow error:", err);
    setInputLocked(false);
  }
}

  // ── Send handlers ─────────────────────────────────────
  function handleSend() {
    if (isProcessing) return;
    const input = document.getElementById("af-input");
    const text  = input.value.trim();
    
    // --- Send structured page scan to the knowledge base ---
    if (text === "/learn") {
      input.value = "";
      addMsg("agent", "📚 Scanning page for the knowledge base...");

      const pageData = scanPage(); // already fully parsed by the live DOM

      fetchWithRetry(BACKEND_URL + "/api/agent/learn-page", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          pageData,
          url:      window.location.href,
          pageText: document.body.innerText.slice(0, 1000)
        })
      }, { timeout: adaptiveTimeout(15000), retries: 1 })
      .then(res => res.json())
      .then(data => {
        if (data.success) addMsg("success", `✅ Page "<strong>${pageData.pageTitle}</strong>" saved to knowledge base! The AI now knows its structure.`);
        else addMsg("error", "Failed to save page: " + (data.error || "unknown error"));
      })
      .catch(() => addMsg("error", "⚠️ Could not connect to server."));
      return;
    }
    // ---------------------------------------------------------

    if (!text && attachments.length === 0) return;
    const msg = text || (attachments.length > 0 ? "I've attached " + attachments.length + " file(s). Please review." : "");
    input.value = "";
    sendMessage(msg);
  }

  document.getElementById("af-send").addEventListener("click",   e => { e.preventDefault(); handleSend(); });
  document.getElementById("af-input").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); handleSend(); } });

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  // ════════════════════════════════════════════════════════
  // ── NETWORK RESILIENCE LAYER ──────────────────────────
  // fetchWithTimeout  — aborts the request after `ms` milliseconds.
  // fetchWithRetry    — retries on network failure with exponential backoff.
  // Adaptive timeouts — shorter for status checks, longer for AI replies.
  // ════════════════════════════════════════════════════════

  /**
   * Wraps fetch() with an AbortController-based timeout.
   * @param {string}  url
   * @param {object}  options  – standard fetch options
   * @param {number}  ms       – timeout in milliseconds (default 20 s)
   */
  function fetchWithTimeout(url, options, ms = 20000) {
    const ctrl  = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { ...options, signal: ctrl.signal })
      .finally(() => clearTimeout(timer));
  }

  /**
   * fetchWithTimeout + automatic retry on network errors.
   * @param {string}  url
   * @param {object}  options
   * @param {object}  cfg      – { timeout, retries, backoff }
   */
  async function fetchWithRetry(url, options, { timeout = 20000, retries = 2, backoff = 1500 } = {}) {
    let lastErr;
    for (let attempt = 0; attempt <= retries; attempt++) {
      if (attempt > 0) {
        await sleep(backoff * attempt);
      }
      try {
        const res = await fetchWithTimeout(url, options, timeout);
        return res;
      } catch (err) {
        lastErr = err;
        // If the request was explicitly aborted (timeout) don't retry —
        // the next attempt would also time out and just waste user time.
        if (err.name === "AbortError") break;
      }
    }
    throw lastErr;
  }

  // ── Network quality detection ─────────────────────────
  /**
   * Returns 'offline' | 'slow' | 'ok' based on browser APIs.
   * Uses navigator.connection (Network Information API) where available.
   */
  function detectNetworkQuality() {
    if (!navigator.onLine) return "offline";
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (conn) {
      if (conn.saveData)                          return "slow";
      if (conn.effectiveType === "2g")             return "slow";
      if (conn.effectiveType === "slow-2g")        return "slow";
      if (conn.downlink !== undefined && conn.downlink < 0.5) return "slow";
    }
    return "ok";
  }

  /**
   * Returns a trimmed timeout in ms tuned to the current connection quality.
   * 'ok'      → use the passed-in default
   * 'slow'    → 2× default (more patience)
   * 'offline' → 8 s (fail fast so error message shows quickly)
   */
  function adaptiveTimeout(defaultMs = 20000) {
    if (networkStatus === "offline") return 8000;
    if (networkStatus === "slow")    return defaultMs * 2;
    return defaultMs;
  }

  /**
   * Returns the number of conversation turns to include in the AI payload.
   * Reduces context on slow links to shrink the request body.
   */
  function adaptiveHistoryLimit() {
    if (networkStatus === "slow") return 12;
    return 40;
  }

  // ── Update the visual status dot & label ─────────────
  function updateStatusDot(status) {
    const dot   = document.getElementById("af-status-dot");
    const label = document.getElementById("af-status-label");
    if (!dot || !label) return;
    dot.className   = "af-dot" + (status !== "ok" ? " " + status : "");
    label.textContent = status === "offline" ? "Offline"
                      : status === "slow"    ? "Slow"
                      : "Live";
  }

  // ── Show / hide the network warning banner ────────────
  function showNetworkBanner(level, message) {
    const banner = document.getElementById("af-net-banner");
    const icon   = document.getElementById("af-nb-icon");
    const msg    = document.getElementById("af-nb-msg");
    if (!banner) return;
    banner.className = "visible " + level;
    icon.textContent = level === "offline" ? "🔴" : "🟡";
    msg.textContent  = message;
    banner.style.display = "flex";
  }

  function hideNetworkBanner() {
    const banner = document.getElementById("af-net-banner");
    if (banner) { banner.className = ""; banner.style.display = "none"; }
  }

  // ── Central network-status update ────────────────────
  function updateNetworkStatus() {
    const quality = detectNetworkQuality();
    const changed = quality !== networkStatus;
    networkStatus = quality;
    updateStatusDot(quality);

    if (quality === "offline") {
      showNetworkBanner("offline", "You are offline — messages will be queued and sent when you reconnect.");
    } else if (quality === "slow") {
      showNetworkBanner("slow", "Slow connection detected — responses may take a bit longer than usual.");
    } else {
      hideNetworkBanner();
    }

    return changed;
  }

  // ── Drain offline queue when connection returns ───────
  async function drainOfflineQueue() {
    if (offlineQueue.length === 0 || networkStatus !== "ok") return;
    const queued    = offlineQueue.splice(0);  // take all, clear the array
    const count     = queued.length;
    addMsg("agent", `📶 Back online — sending ${count} queued message${count > 1 ? "s" : ""}…`, false);
    for (const msg of queued) {
      await sleep(400);
      await sendMessage(msg);
    }
  }

  // ── Wire up browser online / offline events ───────────
  window.addEventListener("online",  () => {
    updateNetworkStatus();
    addMsg("agent", "✅ Connection restored.", false);
    drainOfflineQueue();
  });
  window.addEventListener("offline", () => {
    updateNetworkStatus();
    addMsg("warning", "🔴 You've gone offline. Your next message will be queued.", false);
  });

  // Also react to connection-quality changes (Chrome/Android)
  const _conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
  if (_conn) {
    _conn.addEventListener("change", () => updateNetworkStatus());
  }

  // Run once on load
  updateNetworkStatus();

  // ── Retry button in the banner ────────────────────────
  document.getElementById("af-nb-retry").addEventListener("click", () => {
    updateNetworkStatus();
    if (networkStatus !== "offline") {
      drainOfflineQueue();
    }
  });

  // ── Init ──────────────────────────────────────────────
  async function init() {
    try {
      // ── One-time stale cache bust ──────────────────────
      // If any previously-crawled pages were stored with 0 buttons + 0 inputs
      // (i.e., the old fetch+DOMParser approach produced empty data), wipe those
      // entries from both the learn cache and crawl record so the iframe crawler
      // picks them up again immediately on this load.
      (function bustEmptyLearnCache() {
        try {
          const lc      = getLearnCache();
          const changed = Object.keys(lc).filter(url => /^0:0:/.test(lc[url]?.fp || ""));
          if (!changed.length) return;
          changed.forEach(url => delete lc[url]);
          setLearnCache(lc);
          const raw = localStorage.getItem(CRAWL_CACHE_KEY);
          if (raw) {
            const cr = JSON.parse(raw);
            changed.forEach(url => delete cr[url]);
            localStorage.setItem(CRAWL_CACHE_KEY, JSON.stringify(cr));
          }
        } catch {}
      }());
      const res  = await fetchWithRetry(BACKEND_URL + "/api/agent/status", {
        headers: { "x-api-key": API_KEY, "ngrok-skip-browser-warning": "true" }
      }, { timeout: adaptiveTimeout(10000), retries: 3, backoff: 2000 });
      const data = await res.json();
      if (!data.success) {
        clearMessages();
        addMsg("error", "⚠️ " + (data.error || "Could not connect."), false);
        return;
      }
      clientInfo = data.client;
      document.getElementById("af-client-name").textContent = clientInfo.name;

      const session = loadSession();
      if (session?.history?.length > 0) {
        conversationHistory = session.history;
        restoreMessages();
        const note = document.createElement("div");
        note.style.cssText = "text-align:center;font-size:11px;color:#bbb;padding:4px 0;";
        note.textContent = "— now on: " + document.title + " —";
        document.getElementById("af-messages").appendChild(note);
        document.getElementById("af-messages").scrollTop = 999999;
      } else {
        clearMessages();
        addMsg("agent",
          `👋 Hello! I'm your AI agent for <strong>${clientInfo.name}</strong>.<br><br>` +
          `I can see your page and understand natural language. You can also <strong>attach files or images</strong> using the 📎 button, or <strong>record a voice note</strong> with the 🎤 button — you'll see a preview to edit before it sends.<br><br>` +
          `<em>What would you like me to handle?</em>`
        );
      }

      setInputLocked(false);

      // ── Resume a cross-page task if one was in flight ──
      const continuation = loadPendingContinuation();
      if (continuation) {
        clearPendingContinuation();
        // Give the new page's JS a full moment to finish rendering before we scan it
        await sleep(1400);
        addMsg("agent",
          `⚡ Resuming task on <strong>${escHtml(document.title)}</strong>…`
        );
        await sleep(300);
        pendingPlan = { originalCommand: continuation.originalCommand, taskType: continuation.taskType };
        await resumeContinuation(continuation);
        pendingPlan = null;
      }

      // Silently learn this page in the background
      autoLearnPage();

      // Crawl all other linked same-origin pages via hidden iframes —
      // skip on slow or offline connections to avoid hammering a bad link.
      if (networkStatus === "ok") {
        crawlAndLearnSite();
      }

    } catch (err) {
      clearMessages();
      if (err.name === "AbortError" || !navigator.onLine) {
        addMsg("error", "🔴 Could not connect to AgentFlow — please check your internet connection and try again.", false);
        updateNetworkStatus();
      } else {
        addMsg("error", "⚠️ Could not connect to AgentFlow backend.", false);
      }
      console.error("AgentFlow init:", err);
    }
  }

  // ── Cross-page task resume ────────────────────────────
  // Called on the NEW page after a navigate action.
  // Re-asks the AI with the original intent + fresh page scan so it can
  // produce a new action plan with valid element IDs for this page.
  async function resumeContinuation(cont) {
    const completedPart = cont.stepsCompleted?.length
      ? `Steps already completed: ${cont.stepsCompleted.join('; ')}. `
      : '';

    const remainingPart = cont.stepsRemaining?.length
      ? cont.stepsRemaining.map(s => s.description).filter(Boolean).join(', ')
      : cont.originalCommand;

    // This message is sent to the AI but not shown to the user as a bubble
    const resumeMsg =
      `[CONTINUATION] Original task: "${cont.originalCommand}". ` +
      `${completedPart}` +
      `Now on a new page — please continue with: ${remainingPart}.`;

    setInputLocked(true);
    const thinking = addMsg("thinking", "🧠 Replanning for this page…", false);

    try {
      const pageContext    = scanPage();
      const historyForAI  = conversationHistory.slice(-16).map(m => ({
        role:    m.type === "user" ? "user" : "assistant",
        content: m.html.replace(/<[^>]+>/g, "").slice(0, 400)
      }));

      const res = await fetchWithRetry(BACKEND_URL + "/api/agent/message", {
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true"
        },
        body: JSON.stringify({
          message:        resumeMsg,
          pageContext,
          history:        historyForAI,
          isContinuation: true
        })
      }, { timeout: adaptiveTimeout(60000), retries: 1, backoff: 2000 });

      thinking.remove();
      if (!res.ok) throw new Error("Backend error " + res.status);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || "Unknown error");

      const response = data.response;

      if (response.type === "task" && response.plan?.actions?.length > 0) {
        // Auto-execute — the user already confirmed this task on the previous page.
        // Show a brief one-line summary so they can see what's happening, then run it.
        response.plan.originalCommand = cont.originalCommand;
        const summary = response.reply?.split("\n")[0] || "Executing next steps…";
        addMsg("agent", "▶ " + escHtml(summary));
        await sleep(350);
        await executeActions(response.plan.actions);
      } else if (response.type === "chat") {
        addMsg("agent", response.reply);
      } else {
        addMsg("agent", response.reply || "Done.");
      }

    } catch (err) {
      if (thinking.parentNode) thinking.remove();
      if (err.name === "AbortError") {
        addMsg("error", "⏱️ The continuation request timed out. Please try again.");
      } else {
        addMsg("error", "⚠️ Could not resume the task on this page. Please try again.");
      }
      console.error("Continuation resume error:", err);
    } finally {
      setInputLocked(false);
    }
  }

  // ── Cross-page task continuation ─────────────────────
  const PENDING_KEY = "af_pending_" + API_KEY;
  const PENDING_TTL = 2 * 60 * 1000; // 2 minutes — enough for any page load

  function savePendingContinuation(data) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...data, savedAt: Date.now() })); }
    catch {}
  }

  function loadPendingContinuation() {
    try {
      const raw = localStorage.getItem(PENDING_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (Date.now() - data.savedAt > PENDING_TTL) {
        localStorage.removeItem(PENDING_KEY);
        return null;
      }
      return data;
    } catch { return null; }
  }

  function clearPendingContinuation() {
    try { localStorage.removeItem(PENDING_KEY); } catch {}
  }

  // ── Auto-learn on page load ───────────────────────────
  // Silently sends scanPage() data to the knowledge base.
  // Uses localStorage to skip pages that haven't changed —
  // keyed by URL + a lightweight fingerprint (button + input count).
  const LEARN_CACHE_KEY = "af_learned_" + API_KEY;
  const LEARN_TTL_MS    = 7 * 24 * 60 * 60 * 1000; // re-learn after 7 days

  function getLearnCache() {
    try { return JSON.parse(localStorage.getItem(LEARN_CACHE_KEY) || "{}"); }
    catch { return {}; }
  }

  function setLearnCache(cache) {
    try { localStorage.setItem(LEARN_CACHE_KEY, JSON.stringify(cache)); }
    catch {}
  }

  async function autoLearnPage() {
    // Don't burn bandwidth learning pages on a bad connection
    if (networkStatus !== "ok") return;
    try {
      const pageData    = scanPage();
      const url         = window.location.href;
      const fingerprint = pageData.buttons.length + ":" + pageData.inputs.length + ":" + pageData.links.length;

      const cache  = getLearnCache();
      const cached = cache[url];
      const now    = Date.now();

      // Skip if same fingerprint seen within TTL
      if (cached && cached.fp === fingerprint && (now - cached.ts) < LEARN_TTL_MS) return;

      await fetchWithTimeout(BACKEND_URL + "/api/agent/learn-page", {
        method:  "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        body:    JSON.stringify({
          pageData,
          url,
          pageText: document.body.innerText.slice(0, 1000)
        })
      }, 15000);

      // Update cache entry for this URL
      cache[url] = { fp: fingerprint, ts: now };
      // Prune cache to 50 URLs max to avoid bloating localStorage
      const keys = Object.keys(cache);
      if (keys.length > 50) {
        const oldest = keys.sort((a, b) => cache[a].ts - cache[b].ts).slice(0, keys.length - 50);
        oldest.forEach(k => delete cache[k]);
      }
      setLearnCache(cache);

    } catch (e) {
      // Completely silent — auto-learn should never affect the user experience
    }
  }

  // ── Background site crawler (iframe-based) ────────────
  //
  // WHY IFRAMES, NOT fetch+DOMParser:
  //   fetch() + DOMParser only parses raw static HTML — JavaScript never runs,
  //   so dynamically-rendered buttons and inputs are invisible.
  //   A hidden same-origin iframe loads the page in a real browser context:
  //   scripts execute, frameworks render, and contentDocument reflects the live DOM
  //   — exactly what scanPage() sees when a user visits manually.
  //
  // Runs once per week (CRAWL_TTL_MS). On every load it checks whether any
  // previously-crawled page came back empty (0 btn + 0 fields) and re-queues those,
  // so a stale bad-data entry never stays forever.
  const CRAWL_CACHE_KEY = "af_crawled_" + API_KEY;
  const CRAWL_TTL_MS    = 7 * 24 * 60 * 60 * 1000; // full re-crawl after 7 days
  const CRAWL_MAX_PAGES = 30;                        // hard cap per run
  const CRAWL_DELAY_MS  = 1200;                      // ms between iframes (let each page settle)
  const IFRAME_LOAD_MS  = 3000;                      // ms to wait after onload for JS to render

  // Collects all unique same-origin page URLs linked from the current live page.
  function collectInternalLinks() {
    const origin = window.location.origin;
    const seen   = new Set([window.location.href]);
    const urls   = [];
    document.querySelectorAll("a[href]").forEach(a => {
      try {
        const resolved = new URL(a.getAttribute("href"), window.location.href).href;
        if (
          resolved.startsWith(origin) &&
          !resolved.includes("#") &&
          !/\.(pdf|zip|png|jpg|jpeg|gif|svg|csv|xlsx|docx|mp4|mp3)(\?|$)/i.test(resolved) &&
          !seen.has(resolved)
        ) {
          seen.add(resolved);
          urls.push(resolved);
        }
      } catch {}
    });
    return urls.slice(0, CRAWL_MAX_PAGES);
  }

  // Loads a same-origin URL in a tiny hidden iframe, waits for JS to render,
  // then scans and returns the live contentDocument data.
  // Returns null on timeout or cross-origin error.
  function crawlPageWithIframe(url) {
    return new Promise(resolve => {
      let done = false;
      const finish = result => {
        if (done) return;
        done = true;
        try { iframe.remove(); } catch {}
        resolve(result);
      };

      const iframe = document.createElement("iframe");
      iframe.setAttribute("aria-hidden", "true");
      iframe.style.cssText = [
        "position:fixed", "top:-9999px", "left:-9999px",
        "width:1px", "height:1px", "opacity:0",
        "pointer-events:none", "border:none", "z-index:-1"
      ].join(";");

      // Hard timeout — give up after 12 s total
      const hardTimer = setTimeout(() => finish(null), 12000);

      iframe.onload = () => {
        // Wait IFRAME_LOAD_MS after onload so in-page JS (React, Vue, etc.) can render
        setTimeout(() => {
          clearTimeout(hardTimer);
          try {
            const doc = iframe.contentDocument || iframe.contentWindow.document;
            if (!doc || !doc.body) return finish(null);

            // Re-use the same extraction logic as scanPage(), but on the iframe doc
            let ctr = 0;
            const nid = () => "afc-" + (++ctr);

            const buttons = Array.from(
              doc.querySelectorAll("button, input[type=button], input[type=submit], [role=button], a.btn, a.button")
            ).slice(0, 40).map(el => ({
              afId: nid(), id: el.id || "",
              text: (el.innerText || el.value || el.textContent || "").trim().slice(0, 80),
              disabled: el.disabled || el.getAttribute("aria-disabled") === "true"
            })).filter(b => b.text);

            const inputs = Array.from(
              doc.querySelectorAll("input:not([type=hidden]):not([type=submit]):not([type=button]), select, textarea")
            ).slice(0, 40).map(el => {
              let label = "";
              if (el.id) {
                const lbl = doc.querySelector(`label[for="${el.id}"]`);
                if (lbl) label = lbl.textContent.trim();
              }
              if (!label) label = el.getAttribute("aria-label") || el.placeholder || el.name || "";
              return { afId: nid(), id: el.id || "", type: el.type || el.tagName.toLowerCase(), label: label.slice(0, 80), value: "" };
            });

            const links = Array.from(doc.querySelectorAll("a[href]"))
              .slice(0, 60)
              .map(el => ({ afId: nid(), text: (el.textContent || "").trim().slice(0, 60), href: el.getAttribute("href") || "" }))
              .filter(l => l.text && l.text.length > 1);

            const headings = Array.from(doc.querySelectorAll("h1,h2,h3"))
              .slice(0, 15).map(el => el.textContent.trim());

            finish({
              pageData: { pageTitle: doc.title || new URL(url).pathname, url, buttons, inputs, links, headings, tables: [] },
              pageText: (doc.body.innerText || doc.body.textContent || "").slice(0, 1000)
            });
          } catch {
            finish(null); // cross-origin or other error
          }
        }, IFRAME_LOAD_MS);
      };

      iframe.onerror = () => { clearTimeout(hardTimer); finish(null); };

      document.body.appendChild(iframe);
      iframe.src = url;
    });
  }

  async function crawlAndLearnSite() {
    // Never crawl on slow or offline connections — iframes + sequential fetches
    // would either fail silently or waste the user's bandwidth cap.
    if (networkStatus !== "ok") return;
    try {
      const now        = Date.now();
      const learnCache = getLearnCache();

      // Collect links first — bail early if nothing to do
      const links = collectInternalLinks();
      if (!links.length) return;

      // Decide which URLs need crawling:
      //   (a) never crawled, OR
      //   (b) TTL expired, OR
      //   (c) previously crawled but stored with 0 buttons AND 0 inputs (bad empty data)
      const crawlRaw    = localStorage.getItem(CRAWL_CACHE_KEY);
      const crawlRecord = crawlRaw ? JSON.parse(crawlRaw) : {};

      const toCrawl = links.filter(url => {
        const cc = crawlRecord[url];
        if (!cc) return true;                                    // never crawled
        if ((now - cc.ts) >= CRAWL_TTL_MS) return true;         // TTL expired
        const lc = learnCache[url];
        if (lc && lc.fp === "0:0:0") return true;               // stored empty — retry
        if (lc && /^0:0:/.test(lc.fp)) return true;             // 0 btn + 0 inputs — retry
        return false;
      });

      if (!toCrawl.length) return;

      for (const url of toCrawl) {
        try {
          const result = await crawlPageWithIframe(url);
          if (!result) continue;

          const { pageData, pageText } = result;
          const fingerprint = pageData.buttons.length + ":" + pageData.inputs.length + ":" + pageData.links.length;

          await fetchWithTimeout(BACKEND_URL + "/api/agent/learn-page", {
            method:  "POST",
            headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
            body:    JSON.stringify({ pageData, url, pageText })
          }, 15000);

          // Update learn cache so autoLearnPage skips this URL on the user's next real visit
          learnCache[url] = { fp: fingerprint, ts: now };
          setLearnCache(learnCache);

          // Record this crawl attempt
          crawlRecord[url] = { ts: now };
          localStorage.setItem(CRAWL_CACHE_KEY, JSON.stringify(crawlRecord));

        } catch {}

        // Stagger iframes — avoids UI jank and backend hammering
        await new Promise(r => setTimeout(r, CRAWL_DELAY_MS));
      }

    } catch {
      // Completely silent — never disrupts the user
    }
  }

  init();
}());