(function () {

  // ── Config ────────────────────────────────────────────
  const BACKEND_URL = "https://agentflow-backend-krdb.onrender.com";
  const API_KEY  = document.currentScript?.getAttribute("data-api-key") || "af_live_medicare001";
  const THEME    = document.currentScript?.getAttribute("data-theme")   || "blue";

  const THEMES = {
    blue:  { primary: "#0052cc", light: "#e8f0fe", accent: "#003d99" },
    green: { primary: "#27ae60", light: "#e8f5e9", accent: "#219150" },
    dark:  { primary: "#1a1a2e", light: "#f0f0f0", accent: "#16213e" },
    red: { primary: "#9B1B1B", light: "#fdf0f0", accent: "#7a1515" }
  };
  const theme = THEMES[THEME] || THEMES.blue;

  // ── State ─────────────────────────────────────────────
  let clientInfo          = null;
  let isProcessing        = false;
  let pendingPlan         = null;
  let conversationHistory = [];
  let attachments         = [];   // [{ name, type, size, dataUrl, text }]
  const SESSION_KEY       = "af_conv_" + (API_KEY || "default");

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
    return {
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
    .af-dot { width: 7px; height: 7px; border-radius: 50%; background: #00FF88; animation: af-pulse 2s infinite; }
    @keyframes af-pulse { 0%,100%{opacity:1}50%{opacity:0.35} }
    #af-close { cursor:pointer; font-size:18px; opacity:0.75; }
    #af-close:hover { opacity:1; }

    #af-usage {
      background: ${theme.light}; padding: 7px 16px; font-size: 11px; color: ${theme.primary};
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid #e4e4e4; flex-shrink: 0;
    }
    .af-bar { width: 100px; height: 4px; background: #ddd; border-radius: 2px; }
    .af-bar-fill { height:100%; background: ${theme.primary}; border-radius:2px; transition: width 0.5s; }

    #af-messages {
      flex: 1; padding: 14px 14px 6px; overflow-y: auto; background: #f7f8fa;
      display: flex; flex-direction: column; gap: 10px; min-height: 200px;
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
      background: white; border: 1.5px solid ${theme.primary}44;
      border-radius: 12px; padding: 14px 16px; align-self: flex-start; max-width: 90%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.07);
    }
    .af-confirm-label { font-size: 11px; font-weight: 700; letter-spacing: 0.5px; color: ${theme.primary}; text-transform: uppercase; margin-bottom: 6px; }
    .af-confirm-text  { font-size: 13px; color: #333; line-height: 1.5; margin-bottom: 12px; }
    .af-confirm-btns  { display: flex; gap: 8px; }
    .af-confirm-btns button { flex: 1; padding: 9px 0; border: none; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: opacity 0.18s; }
    .af-btn-yes { background: ${theme.primary}; color: white; }
    .af-btn-no  { background: #f0f0f0; color: #555; }
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
          <div class="af-dot"></div><span>Live</span>
        </div>
        <button id="af-files-btn" title="Files">📁<span class="af-files-badge" id="af-files-badge" style="display:none"></span></button>
        <span id="af-close">✕</span>
      </div>
    </div>
    <!-- Files panel overlay -->
    <div id="af-files-panel">
      <div class="af-fp-header">
        <span>📁 Files</span>
        <span class="af-fp-close" id="af-fp-close">✕</span>
      </div>
      <div class="af-fp-notice">⚠️ Files are stored temporarily in your browser only</div>
      <div class="af-fp-list" id="af-fp-list">
        <div class="af-fp-empty">No files yet. Send or receive a file to see it here.</div>
      </div>
      <div class="af-fp-footer">
        <button class="af-fp-clear" id="af-fp-clear">🗑 Clear all files</button>
      </div>
    </div>

    <div id="af-usage">
      <span id="af-usage-text">Loading...</span>
      <div class="af-bar"><div class="af-bar-fill" id="af-bar-fill" style="width:0%"></div></div>
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
      <label id="af-attach-btn" for="af-file-input" title="Attach file or image">📎</label>
      <input id="af-file-input" type="file" multiple accept="image/*,.pdf,.doc,.docx,.txt,.csv,.xlsx,.xls" />
      <input id="af-input" type="text" placeholder="Ask me anything or give me a task..." disabled />
      <button id="af-mic" type="button" title="Click to record voice" disabled>🎤</button>
      <button id="af-send" type="button" disabled>➤</button>
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
  }

  // ── Message helpers ───────────────────────────────────
  function addMsg(type, html, persist = true) {
    const msgs = document.getElementById("af-messages");
    const el   = document.createElement("div");
    el.className = "af-msg " + type;
    el.innerHTML = html;
    msgs.appendChild(el);
    msgs.scrollTop = msgs.scrollHeight;
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

  function updateUsage(used, limit) {
    const pct = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
    document.getElementById("af-usage-text").textContent = used + " / " + limit + " tasks used";
    document.getElementById("af-bar-fill").style.width   = pct + "%";
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

  function storeFile(name, dataUrl, mimeType, direction) {
    const files = loadStoredFiles();
    const already = files.findIndex(function(f) { return f.name === name && f.direction === direction; });
    const entry = {
      name: name, dataUrl: dataUrl, mimeType: mimeType, direction: direction,
      time: Date.now(),
      size: Math.round((dataUrl.length * 3) / 4)
    };
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

  function renderFilesPanel() {
    const list  = document.getElementById("af-fp-list");
    const files = loadStoredFiles();
    if (files.length === 0) {
      list.innerHTML = "<div class=\"af-fp-empty\">No files yet. Send or receive a file to see it here.</div>";
      return;
    }
    const extIcons = { pdf:"📄", doc:"📝", docx:"📝", txt:"📋", csv:"📊", xlsx:"📊", xls:"📊",
                       png:"🖼️", jpg:"🖼️", jpeg:"🖼️", gif:"🖼️", webp:"🖼️" };
    list.innerHTML = files.map(function(f, i) {
      const ext   = f.name.split(".").pop().toLowerCase();
      const icon  = extIcons[ext] || "📁";
      const badge = f.direction === "sent" ? "sent" : "received";
      const label = f.direction === "sent" ? "Sent" : "Received";
      const ago   = fpTimeAgo(f.time);
      return "<div class=\"af-fp-item\">" +
        "<div class=\"af-fp-item-icon\">" + icon + "</div>" +
        "<div class=\"af-fp-item-info\">" +
          "<div class=\"af-fp-item-name\">" + escHtml(f.name) + "</div>" +
          "<div class=\"af-fp-item-meta\">" + formatBytes(f.size) + " \xB7 " + ago + "</div>" +
        "</div>" +
        "<span class=\"af-fp-item-badge " + badge + "\">" + label + "</span>" +
        "<button class=\"af-fp-item-dl\" onclick=\"afDownloadFile(" + i + ")\">&#8595;</button>" +
      "</div>";
    }).join("");
  }

  window.afDownloadFile = function(idx) {
    const files = loadStoredFiles();
    const f = files[idx];
    if (!f) return;
    const a = document.createElement("a");
    a.href = f.dataUrl; a.download = f.name; a.click();
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
    const results = [];
    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      await sleep(400);
      try {
        let el = action.afId ? document.querySelector('[data-af-id="' + action.afId + '"]') : null;
        if (!el && action.elementId) el = document.getElementById(action.elementId);
        if (!el && action.selector)  el = document.querySelector(action.selector);

        if (!el && !["navigate","scroll","click_by_text"].includes(action.type)) {
          results.push({ ok: false, msg: "Could not find element for: <em>" + action.description + "</em>" });
          continue;
        }

        if (el) {
          const origOutline = el.style.outline, origBg = el.style.background;
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
          const searchText = (action.value || action.description || "").toLowerCase().trim();
          const allBtns = Array.from(document.querySelectorAll("button,[role='button']")).filter(b => !b.closest("#af-panel"));
          const match   = allBtns.find(b => b.textContent.trim().toLowerCase().includes(searchText));
          if (match) {
            match.scrollIntoView({ behavior: "smooth", block: "center" });
            await sleep(300); match.click();
            results.push({ ok: true, msg: `🖱️ Clicked "<strong>${match.textContent.trim().slice(0,40)}</strong>"` });
            await sleep(700);
          } else {
            results.push({ ok: false, msg: `⚠️ Could not find button with text: "${action.value}"` });
          }

        } else if (action.type === "fill") {
          el.focus(); el.value = action.value;
          el.dispatchEvent(new Event("input",  { bubbles: true }));
          el.dispatchEvent(new Event("change", { bubbles: true }));
          results.push({ ok: true, msg: `✏️ Filled <strong>${action.description}</strong> → "${action.value}"` });

        } else if (action.type === "select") {
          el.value = action.value;
          el.dispatchEvent(new Event("change", { bubbles: true }));
          results.push({ ok: true, msg: `📋 Selected <strong>${action.description}</strong> → "${action.value}"` });

        } else if (action.type === "approve_row") {
          const btn = el.querySelector(".btn-approve,[class*='approve']") ||
            Array.from(el.querySelectorAll("button")).find(b => /approve/i.test(b.textContent));
          if (btn) { btn.click(); results.push({ ok: true, msg: `✅ Approved — <strong>${action.description}</strong>` }); }
          else results.push({ ok: false, msg: `⚠️ No approve button in row: <strong>${action.description}</strong>` });

        } else if (action.type === "reject_row") {
          const btn = el.querySelector(".btn-reject,[class*='reject']") ||
            Array.from(el.querySelectorAll("button")).find(b => /reject/i.test(b.textContent));
          if (btn) { btn.click(); results.push({ ok: true, msg: `❌ Rejected — <strong>${action.description}</strong>` }); }
          else results.push({ ok: false, msg: `⚠️ No reject button in row: <strong>${action.description}</strong>` });

        } else if (action.type === "escalate_row") {
          const btn = el.querySelector(".btn-escalate,[class*='escalate']") ||
            Array.from(el.querySelectorAll("button")).find(b => /escalate|flag|hold/i.test(b.textContent));
          if (btn) { btn.click(); results.push({ ok: true, msg: `⚠️ Escalated — <strong>${action.description}</strong>` }); }
          else {
            el.style.background = "#fff8e1"; el.style.outline = "2px solid #f57f17";
            results.push({ ok: true, msg: `⚠️ Flagged for escalation — <strong>${action.description}</strong>` });
          }

        } else if (action.type === "navigate") {
          // Save any actions that come AFTER this navigate so the next page can pick them up
          const remaining = actions.slice(i + 1);
          if (remaining.length > 0) {
            savePendingContinuation({
              actions:         remaining,
              originalCommand: pendingPlan?.originalCommand || "",
              taskType:        pendingPlan?.taskType        || "task",
              fromPage:        document.title,
              fromUrl:         window.location.href
            });
          }
          results.push({ ok: true, msg: `🔗 Navigating to <strong>${action.description}</strong>…` });
          await sleep(300);
          window.location.href = action.value;
          return; // stop — page is unloading

        } else if (action.type === "scroll") {
          if (action.value === "top")    window.scrollTo({ top: 0, behavior: "smooth" });
          if (action.value === "bottom") window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
          if (action.value === "down")   window.scrollBy({ top: 300, behavior: "smooth" });
          if (action.value === "up")     window.scrollBy({ top: -300, behavior: "smooth" });
          results.push({ ok: true, msg: `↕️ Scrolled <strong>${action.value}</strong>` });

        } else {
          results.push({ ok: false, msg: "Unknown action type: " + action.type });
        }

      } catch (err) {
        results.push({ ok: false, msg: "Error: " + err.message });
      }
    }

    const okMsgs  = results.filter(r => r.ok);
    const errMsgs = results.filter(r => !r.ok);
    if (okMsgs.length)  addMsg("success", okMsgs.map(r => r.msg).join("<br>"));
    if (errMsgs.length) addMsg("error",   errMsgs.map(r => r.msg).join("<br>"));

    // Audit trail
    const operator = detectOperator();
    fetch(BACKEND_URL + "/api/agent/confirm", {
      method: "POST",
      headers: { "x-api-key": API_KEY, "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" },
      body: JSON.stringify({
        command:   pendingPlan ? pendingPlan.originalCommand : "",
        action:    pendingPlan ? pendingPlan.taskType : "task",
        pageTitle: document.title,
        pageUrl:   window.location.href,
        rowCount:  actions.length,
        results:   results.map(r => r.msg),
        actionDetails: actions.map(a => {
          const match = results.find(r => r.msg && r.msg.includes(a.description));
          return { type: a.type, description: a.description, value: a.value||null, elementId: a.elementId||null, success: match ? match.ok : null };
        }),
        operator: { detectedName: operator, source: operator ? "page-scrape" : "unknown" },
        device:    deviceInfo,
        sessionId: SESSION_KEY
      })
    }).catch(() => {});
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
        // Save to localStorage files panel
        storeFile(dl.filename, dl.dataUrl, dl.mimeType || "application/octet-stream", "received");

        // Render download card in chat
        const ext    = dl.filename.split(".").pop().toLowerCase();
        const icons  = { pdf:"📄", doc:"📝", docx:"📝", txt:"📋", csv:"📊", xlsx:"📊", xls:"📊", default:"📁" };
        const icon   = icons[ext] || icons.default;
        const approxBytes = Math.round((dl.dataUrl.length * 3) / 4);
        const card = document.createElement("div");
        card.className = "af-download-card";
        card.innerHTML =
          "<div class=\"af-dl-label\">📥 File ready</div>" +
          "<div class=\"af-dl-file\">" +
            "<span class=\"af-dl-icon\">" + icon + "</span>" +
            "<div class=\"af-dl-info\">" +
              "<div class=\"af-dl-name\">" + escHtml(dl.filename) + "</div>" +
              "<div class=\"af-dl-size\">" + formatBytes(approxBytes) + "</div>" +
            "</div>" +
            "<button class=\"af-dl-btn\">↓ Download</button>" +
          "</div>";
        card.querySelector(".af-dl-btn").addEventListener("click", () => {
          const a = document.createElement("a");
          a.href = dl.dataUrl; a.download = dl.filename; a.click();
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
    const card  = document.createElement("div");
    card.className = "af-confirm-card";
    card.innerHTML = `
      <div class="af-confirm-label">⚡ Planned Action</div>
      <div class="af-confirm-text">${reply}</div>
      <div class="af-confirm-btns">
        <button class="af-btn-yes" type="button">✅ Yes, do it</button>
        <button class="af-btn-no"  type="button">✕ Cancel</button>
      </div>`;
    const msgs = document.getElementById("af-messages");
    msgs.appendChild(card);
    msgs.scrollTop = msgs.scrollHeight;
    setInputLocked(true);

    card.querySelector(".af-btn-yes").addEventListener("click", async () => {
      card.querySelector(".af-btn-yes").disabled = true;
      card.querySelector(".af-btn-no").disabled  = true;
      card.querySelector(".af-confirm-label").textContent = "⏳ Executing...";
      await executeActions(plan.actions || []);
      card.remove(); pendingPlan = null; setInputLocked(false);
    });
    card.querySelector(".af-btn-no").addEventListener("click", () => {
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

  // ── Send message ──────────────────────────────────────
  async function sendMessage(message) {
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

      await fetch(BACKEND_URL + "/api/agent/upload", {
        method: "POST",
        headers: { 
          "x-api-key": API_KEY,
          "ngrok-skip-browser-warning": "true" 
        },
        body: formData
      });
    }

    // 5. Prepare data for the Agent Agentic Loop
    const pageContext = scanPage();
    const historyForAI = conversationHistory.slice(-20).map(m => ({
      role: m.type === "user" ? "user" : "assistant",
      content: m.html.replace(/<[^>]+>/g, "").slice(0, 400)
    }));

    // 6. Send the message payload
    const res = await fetch(BACKEND_URL + "/api/agent/message", {
      method: "POST",
      headers: { 
        "x-api-key": API_KEY, 
        "Content-Type": "application/json", 
        "ngrok-skip-browser-warning": "true" 
      },
      body: JSON.stringify({
        message: message,
        pageContext,
        history: historyForAI,
        // Doc filenames — already uploaded to workspace, AI needs to know they're there
        uploadedFiles: docAttachments.map(a => a.name),
        // Images go in body for the Vision path
        attachments: imageAttachments.length > 0 ? imageAttachments.map(a => ({
          name: a.name,
          type: a.type,
          dataUrl: a.dataUrl
        })) : undefined
      })
    });

    thinking.remove();
    if (!res.ok) throw new Error("Backend error " + res.status);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || "Unknown error");

    const response = data.response;

    // 7. Handle different response types (Chat, Page Tasks, or File Operations)
    if (response.type === "chat") {
      addMsg("agent", response.reply);
    } else if (response.type === "task") {
      if (response.plan?.actions?.length > 0) {
        response.plan.originalCommand = message;
        showConfirmCard(response.reply, response.plan);
      } else {
        addMsg("agent", response.reply);
      }
    } else if (response.type === "file_result") {
      let fileReply = response.reply || "Done.";
      try {
        const p = JSON.parse(fileReply);
        if (p?.reply) fileReply = p.reply;
      } catch {}
      // Display the tool steps and any files the AI created for download
      showFileResult(response.steps || [], fileReply, response.downloadables || []);
    } else {
      addMsg("agent", response.reply || "Done.");
    }

    setInputLocked(false);

  } catch (err) {
    if (thinking) thinking.remove();
    addMsg("error", "⚠️ Something went wrong. Check that the server is running.");
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

      fetch(BACKEND_URL + "/api/agent/learn-page", {
        method: "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          pageData,
          url:      window.location.href,
          pageText: document.body.innerText.slice(0, 1000)
        })
      })
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

  // ── Init ──────────────────────────────────────────────
  async function init() {
    try {
      const res  = await fetch(BACKEND_URL + "/api/agent/status", {
        headers: { "x-api-key": API_KEY, "ngrok-skip-browser-warning": "true" }
      });
      const data = await res.json();
      if (!data.success) {
        clearMessages();
        addMsg("error", "⚠️ " + (data.error || "Could not connect."), false);
        return;
      }
      clientInfo = data.client;
      document.getElementById("af-client-name").textContent = clientInfo.name;
      updateUsage(clientInfo.tasksUsed, clientInfo.tasksLimit);

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
        // Give the new page's JS a moment to finish rendering
        await sleep(800);
        addMsg("agent",
          `⚡ Continuing your task from <strong>${escHtml(continuation.fromPage)}</strong>…`
        );
        await sleep(400);
        pendingPlan = { originalCommand: continuation.originalCommand, taskType: continuation.taskType };
        await executeActions(continuation.actions);
        pendingPlan = null;
      }

      // Silently learn this page in the background
      autoLearnPage();

    } catch (err) {
      clearMessages();
      addMsg("error", "⚠️ Could not connect to AgentFlow backend.", false);
      console.error("AgentFlow init:", err);
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
    try {
      const pageData   = scanPage();
      const url        = window.location.href;
      const fingerprint = pageData.buttons.length + ":" + pageData.inputs.length + ":" + pageData.links.length;

      const cache      = getLearnCache();
      const cached     = cache[url];
      const now        = Date.now();

      // Skip if same fingerprint seen within TTL
      if (cached && cached.fp === fingerprint && (now - cached.ts) < LEARN_TTL_MS) return;

      await fetch(BACKEND_URL + "/api/agent/learn-page", {
        method:  "POST",
        headers: { "x-api-key": API_KEY, "Content-Type": "application/json" },
        body:    JSON.stringify({
          pageData,
          url,
          pageText: document.body.innerText.slice(0, 1000)
        })
      });

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

  init();
}());