/* auth.js — Discord login via Supabase + premium badge + Steam mapping from links_state.json */
(() => {
  if (!window.SUPA_URL || !window.SUPA_ANON) return;
  const supa = window.supa || supabase.createClient(SUPA_URL, SUPA_ANON);
  window.supa = supa;

  const state = { user: null, profile: null, links: {}, steamId: null };

  async function fetchLinks(){
    try { state.links = await (await fetch('links_state.json', { cache: 'no-store' })).json(); }
    catch { state.links = {}; }
  }

  function getDiscordId(user){
    const idents = (user?.identities||[]).filter(i => i.provider === 'discord');
    const idata  = idents[0]?.identity_data || {};
    return idata.user_id || idata.provider_id || idata.sub || user?.user_metadata?.provider_id || null;
  }

  async function loadProfile(){
    if(!state.user){ state.profile=null; state.steamId=null; return; }
    let { data: prof } = await supa.from('profiles').select('*').eq('id', state.user.id).maybeSingle();
    if(!prof){
      const discordId = getDiscordId(state.user);
      const steamId = discordId ? state.links[discordId] || null : null;
      await supa.from('profiles').upsert({ id: state.user.id, discord_id: discordId, steam_id: steamId });
      ({ data: prof } = await supa.from('profiles').select('*').eq('id', state.user.id).maybeSingle());
    }
    state.profile = prof || null;
    state.steamId = prof?.steam_id || null;
    window.currentUser    = state.user;
    window.currentProfile = state.profile;
    window.currentSteamId = state.steamId;
  }

  function isPremium(){
    const p = state.profile;
    if(!p) return false;
    if(p.is_premium) return true;
    if(p.premium_until && new Date(p.premium_until) > new Date()) return true;
    return false;
  }

  function renderBar(){
    const bar = document.getElementById('authbar');
    if(!bar) return;

    if(!state.user){
      bar.innerHTML = `<div style="display:flex; justify-content:flex-end;">
        <button id="loginBtn" style="padding:.5rem .75rem; border-radius:.375rem; background:#4f46e5; color:white;">Sign in with Discord</button>
      </div>`;
      document.getElementById('loginBtn').onclick = () =>
        supa.auth.signInWithOAuth({ provider: 'discord', options: { redirectTo: location.href } });
      return;
    }

    const name = state.user.user_metadata?.name || 'Discord user';
    const prem = isPremium() ? `<span style="margin-left:.5rem; padding:.15rem .4rem; border-radius:.3rem; background:rgba(245, 158, 11, .15); color:#f59e0b; border:1px solid rgba(245, 158, 11, .35); font-size:.75rem;">Premium</span>` : '';
    const you  = state.steamId
      ? `<a style="margin-left:.5rem; color:#93c5fd; text-decoration:underline;" href="player.html?steam_id=${encodeURIComponent(state.steamId)}">Your page</a>`
      : `<span style="margin-left:.5rem; color:#94a3b8; font-size:.85rem;">Steam not linked</span>`;

    bar.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:flex-end; gap:.5rem;">
        <span style="font-size:.9rem; color:#cbd5e1;">Hello, <b>${name}</b>${prem}</span>
        ${you}
        <button id="goPremiumBtn" style="padding:.5rem .75rem; border-radius:.375rem; background:#b45309; color:white; display:${isPremium()?'none':'inline-block'};">Go Premium (€2)</button>
        <button id="logoutBtn" style="padding:.5rem .75rem; border-radius:.375rem; background:#0f172a; color:#cbd5e1; border:1px solid #334155;">Sign out</button>
      </div>`;
    document.getElementById('logoutBtn').onclick = () => supa.auth.signOut().then(()=>location.reload());
    const gp = document.getElementById('goPremiumBtn'); if(gp) gp.onclick = () => window.startCheckout?.();
  }

  async function refresh(){
    await fetchLinks();
    const { data: { user } } = await supa.auth.getUser();
    state.user = user || null;
    await loadProfile();
    renderBar();
  }

  supa.auth.onAuthStateChange(() => refresh());
  window.auth = { isPremium, get steamId(){ return state.steamId; }, refresh };
  refresh();
})();