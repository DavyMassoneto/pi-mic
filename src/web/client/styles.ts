const STYLES = `
    #pi-mic-btn { display:inline-flex; align-items:center; justify-content:center; flex:none;
      box-sizing:border-box; padding:0; margin:0 6px 0 0; cursor:pointer; color:inherit;
      background:transparent; border:1px solid rgba(127,127,127,.35); transition:box-shadow .08s; }
    #pi-mic-btn:hover { background:rgba(127,127,127,.15); }
    #pi-mic-btn[data-state="rec"] { background:#d93025; border-color:#d93025; color:#fff; }
    #pi-mic-btn[data-state="busy"] { cursor:progress; }
    #pi-mic-btn svg { display:block; }
    .pi-mic-spin { animation: pi-mic-spin .8s linear infinite; }
    @keyframes pi-mic-spin { to { transform: rotate(360deg); } }
    #pi-mic-hint { position:fixed; z-index:2147483001; padding:4px 8px; border-radius:6px;
      background:rgba(30,30,30,.92); color:#fff; font:12px system-ui,sans-serif; pointer-events:none;
      display:none; white-space:nowrap; }
    textarea.pi-mic-locked { caret-color:transparent; }
  `;

export function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
}
