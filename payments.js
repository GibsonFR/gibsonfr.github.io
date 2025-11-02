/* payments.js — Stripe Checkout via Supabase Edge Function */
(() => {
  if(!window.supa){ console.error('payments.js: supa missing'); return; }
  const supa = window.supa;
  const FUNCS = SUPA_URL.replace('.supabase.co', '.functions.supabase.co');

  window.startCheckout = async () => {
    const { data: { session } } = await supa.auth.getSession();
    if(!session){ alert('Please sign in with Discord first.'); return; }
    const r = await fetch(`${FUNCS}/create-checkout-session`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` }
    });
    if(!r.ok){ return alert('Checkout error: ' + await r.text()); }
    const { url } = await r.json();
    location.href = url;
  };
})();