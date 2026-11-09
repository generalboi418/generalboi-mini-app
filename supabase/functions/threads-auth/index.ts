import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("THREADS_ALLOWED_ORIGIN") ?? "https://generalboi418.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-telegram-init-data",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};
const json = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers:corsHeaders});
const enc = new TextEncoder();
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const unb64 = (value: string) => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const hex = (bytes: Uint8Array) => [...bytes].map(b=>b.toString(16).padStart(2,"0")).join("");
async function hmac(key: Uint8Array, value: string) {
  const k=await crypto.subtle.importKey("raw",key,{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC",k,enc.encode(value)));
}
async function sha(value: string) { return hex(new Uint8Array(await crypto.subtle.digest("SHA-256",enc.encode(value)))); }
function equal(a: string,b: string) { if(a.length!==b.length)return false; let x=0; for(let i=0;i<a.length;i++)x|=a.charCodeAt(i)^b.charCodeAt(i); return x===0; }

async function telegramUser(req: Request): Promise<string> {
  const token=Deno.env.get("TELEGRAM_BOT_TOKEN");
  const raw=req.headers.get("X-Telegram-Init-Data");
  if(!token || !raw) throw new Error("Telegram authentication is not configured.");
  const params=new URLSearchParams(raw);
  const supplied=params.get("hash");
  if(!supplied) throw new Error("Invalid Telegram session.");
  params.delete("hash");
  const pairs=[...params.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${k}=${v}`);
  const secret=await hmac(enc.encode("WebAppData"),token);
  const calculated=hex(await hmac(secret,pairs.join("\n")));
  if(!equal(calculated,supplied)) throw new Error("Telegram session could not be verified.");
  const authDate=Number(params.get("auth_date"));
  if(!authDate || Date.now()/1000-authDate>86400 || authDate>Date.now()/1000+60) throw new Error("Telegram session expired. Close and reopen the Mini App.");
  const user=params.get("user");
  if(!user) throw new Error("Telegram user details are missing.");
  const parsed=JSON.parse(user);
  if(!parsed.id) throw new Error("Telegram user ID is missing.");
  return String(parsed.id);
}
const supabaseUrl=()=>Deno.env.get("SUPABASE_URL")!;
const serviceKey=()=>{
  const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(legacy) return legacy;
  const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(keys) { const parsed=JSON.parse(keys); if(parsed.default) return parsed.default; }
  throw new Error("Supabase server secret key is not available.");
};
async function db(path: string, method="GET", body?: unknown, prefer?: string) {
  const response=await fetch(`${supabaseUrl()}/rest/v1/${path}`,{
    method,headers:{"apikey":serviceKey(),"Authorization":`Bearer ${serviceKey()}`,"Content-Type":"application/json","Prefer":prefer??"return=representation"},
    body:body===undefined?undefined:JSON.stringify(body)
  });
  const text=await response.text();
  if(!response.ok) throw new Error(`Database request failed (${response.status}). ${text.slice(0,300)}`);
  return text?JSON.parse(text):null;
}
async function encryptToken(token: string) {
  const keyValue=Deno.env.get("THREADS_TOKEN_ENCRYPTION_KEY");
  if(!keyValue) throw new Error("Token encryption is not configured.");
  const key=await crypto.subtle.importKey("raw",unb64(keyValue),{name:"AES-GCM"},false,["encrypt"]);
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const cipher=await crypto.subtle.encrypt({name:"AES-GCM",iv},key,enc.encode(token));
  return {encrypted_access_token:b64(new Uint8Array(cipher)),token_iv:b64(iv)};
}
function redirectUri(){return Deno.env.get("THREADS_REDIRECT_URI") ?? `${supabaseUrl()}/functions/v1/threads-auth/callback`;}
function returnUrl(){return Deno.env.get("THREADS_RETURN_URL") ?? "https://generalboi418.github.io/generalboi-mini-app/threads.html";}
async function callback(req: Request) {
  const url=new URL(req.url);
  const code=url.searchParams.get("code");
  const state=url.searchParams.get("state");
  const error=url.searchParams.get("error");
  if(error || !code || !state) return Response.redirect(returnUrl()+"?threads_auth=cancelled",302);
  try {
    const hash=await sha(state);
    const states=await db(`telegram_threads_oauth_states?state_hash=eq.${encodeURIComponent(hash)}&consumed_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=state_hash,telegram_user_id`,"GET");
    if(!states?.length) throw new Error("This sign-in link expired. Start again in Telegram.");
    const consumed=await db(`telegram_threads_oauth_states?state_hash=eq.${encodeURIComponent(hash)}&consumed_at=is.null`,"PATCH",{consumed_at:new Date().toISOString()},"return=representation");
    if(!consumed?.length) throw new Error("This sign-in link has already been used.");
    const appId=Deno.env.get("THREADS_APP_ID");
    const secret=Deno.env.get("THREADS_APP_SECRET");
    if(!appId || !secret) throw new Error("Threads app credentials are not configured.");
    const exchange=new URL("https://graph.threads.net/oauth/access_token");
    Object.entries({client_id:appId,client_secret:secret,code,grant_type:"authorization_code",redirect_uri:redirectUri()}).forEach(([k,v])=>exchange.searchParams.set(k,v));
    const tokenResponse=await fetch(exchange,{method:"POST"});
    const short=await tokenResponse.json();
    if(!tokenResponse.ok || !short.access_token) throw new Error("Threads rejected the authorization code.");
    const longUrl=new URL("https://graph.threads.net/access_token");
    longUrl.searchParams.set("grant_type","th_exchange_token");
    longUrl.searchParams.set("client_secret",secret);
    longUrl.searchParams.set("access_token",short.access_token);
    const longResponse=await fetch(longUrl);
    const long=await longResponse.json();
    if(!longResponse.ok || !long.access_token) throw new Error("Could not secure a long-lived Threads session.");
    const profileUrl=new URL("https://graph.threads.net/v1.0/me");
    profileUrl.searchParams.set("fields","id,username");
    profileUrl.searchParams.set("access_token",long.access_token);
    const profileResponse=await fetch(profileUrl);
    const profile=await profileResponse.json();
    if(!profileResponse.ok || !profile.id) throw new Error("Could not read the connected Threads profile.");
    const owner=states[0].telegram_user_id;
    const encrypted=await encryptToken(long.access_token);
    const expires=new Date(Date.now()+Number(long.expires_in??5184000)*1000).toISOString();
    const rows=await db("telegram_threads_accounts?on_conflict=telegram_user_id,threads_user_id","POST",[{
      telegram_user_id:owner,threads_user_id:String(profile.id),username:profile.username??null,
      ...encrypted,token_expires_at:expires,updated_at:new Date().toISOString()
    }],"resolution=merge-duplicates,return=representation");
    const account=rows[0];
    await db("telegram_threads_account_preferences?on_conflict=telegram_user_id","POST",[{telegram_user_id:owner,active_account_id:account.id,updated_at:new Date().toISOString()}],"resolution=merge-duplicates,return=minimal");
    return Response.redirect(returnUrl()+"?threads_auth=success",302);
  } catch(e) {
    console.error("Threads OAuth callback failed:",e instanceof Error?e.message:"unknown error");
    return Response.redirect(returnUrl()+"?threads_auth=error",302);
  }
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  const url=new URL(req.url);
  if(url.pathname.endsWith("/callback")) return await callback(req);
  try {
    const owner=await telegramUser(req);
    if(url.pathname.endsWith("/authorize") && req.method==="POST"){
      const state=b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
      await db("telegram_threads_oauth_states","POST",[{state_hash:await sha(state),telegram_user_id:owner,expires_at:new Date(Date.now()+10*60*1000).toISOString()}],"return=minimal");
      const auth=new URL("https://threads.net/oauth/authorize");
      auth.searchParams.set("client_id",Deno.env.get("THREADS_APP_ID")??"");
      auth.searchParams.set("redirect_uri",redirectUri());
      auth.searchParams.set("scope",Deno.env.get("THREADS_SCOPES")??"threads_basic");
      auth.searchParams.set("response_type","code"); auth.searchParams.set("state",state);
      return json({authorization_url:auth.toString()});
    }
    if(url.pathname.endsWith("/accounts") && req.method==="GET"){
      const accounts=await db(`telegram_threads_accounts?telegram_user_id=eq.${encodeURIComponent(owner)}&select=id,username,threads_user_id,created_at&order=created_at.asc`);
      const prefs=await db(`telegram_threads_account_preferences?telegram_user_id=eq.${encodeURIComponent(owner)}&select=active_account_id`);
      return json({accounts,active_account_id:prefs?.[0]?.active_account_id??null});
    }
    if(url.pathname.endsWith("/active-account") && req.method==="POST"){
      const body=await req.json(); if(!body.account_id) return json({error:"Account ID is required."},400);
      const found=await db(`telegram_threads_accounts?id=eq.${encodeURIComponent(body.account_id)}&telegram_user_id=eq.${encodeURIComponent(owner)}&select=id`);
      if(!found?.length) return json({error:"That account does not belong to you."},403);
      await db("telegram_threads_account_preferences?on_conflict=telegram_user_id","POST",[{telegram_user_id:owner,active_account_id:body.account_id,updated_at:new Date().toISOString()}],"resolution=merge-duplicates,return=minimal");
      return json({ok:true});
    }
    return json({error:"Route not found."},404);
  } catch(e) {
    console.error("Threads function error:",e instanceof Error?e.message:"unknown error");
    return json({error:e instanceof Error?e.message:"Request failed."},400);
  }
});