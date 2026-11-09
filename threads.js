(() => {
  const FUNCTION_URL = "https://azzhfdhnzxybtkebvdaq.supabase.co/functions/v1/threads-auth";
  const tg = window.Telegram?.WebApp;
  const statusEl = document.getElementById("status");
  const accountsEl = document.getElementById("accounts");
  const connectBtn = document.getElementById("connect");
  let initData = "";

  function status(message, kind="") {
    statusEl.textContent = message;
    statusEl.className = "status " + kind;
  }
  async function api(path, method="GET", body) {
    if (!initData) throw new Error("Please open this page from your Telegram bot.");
    const response = await fetch(FUNCTION_URL + path, {
      method,
      headers: {"Content-Type":"application/json","X-Telegram-Init-Data":initData},
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Request failed. Please try again.");
    return data;
  }
  function renderAccounts(data) {
    accountsEl.replaceChildren();
    if (!data.accounts?.length) {
      const p=document.createElement("p"); p.className="status"; p.textContent="No Threads accounts connected yet.";
      accountsEl.append(p); return;
    }
    data.accounts.forEach(account => {
      const row=document.createElement("div"); row.className="account";
      const details=document.createElement("div");
      const name=document.createElement("div"); name.className="username"; name.textContent="@"+(account.username || "Threads user");
      const note=document.createElement("div"); note.className="muted"; note.textContent=account.id===data.active_account_id ? "Currently selected" : "Connected account";
      details.append(name,note);
      const button=document.createElement("button"); button.className="secondary"; button.textContent=account.id===data.active_account_id ? "Active" : "Switch";
      button.disabled=account.id===data.active_account_id;
      button.addEventListener("click",async()=>{
        try { button.disabled=true; await api("/active-account","POST",{account_id:account.id}); status("Active account changed.","success"); await loadAccounts(); }
        catch(e){status(e.message,"error");button.disabled=false;}
      });
      row.append(details,button); accountsEl.append(row);
    });
  }
  async function loadAccounts() {
    const data=await api("/accounts"); renderAccounts(data);
  }
  connectBtn.addEventListener("click",async()=>{
    try {
      connectBtn.disabled=true; status("Opening Threads sign-in…");
      const data=await api("/authorize","POST");
      if (!data.authorization_url) throw new Error("The server did not return a Threads sign-in link.");
      window.location.assign(data.authorization_url);
    } catch(e) { status(e.message,"error"); connectBtn.disabled=false; }
  });
  async function start() {
    if (!tg || !tg.initData) { status("Open this page inside Telegram using your bot's Mini App button.","error"); connectBtn.disabled=true; return; }
    tg.ready(); tg.expand(); initData=tg.initData;
    const params=new URLSearchParams(location.search);
    if(params.get("threads_auth")==="success") status("Threads account connected. Loading your accounts…","success");
    else if(params.get("threads_auth")==="cancelled") status("Threads sign-in was cancelled.");
    else if(params.get("threads_auth")==="error") status("Threads could not connect. Please try again.","error");
    try { await loadAccounts(); if(!params.has("threads_auth")) status("Ready. Connect a Threads account to begin."); }
    catch(e){status(e.message,"error");}
    if(params.has("threads_auth")) history.replaceState({}, "", location.pathname);
  }
  start();
})();