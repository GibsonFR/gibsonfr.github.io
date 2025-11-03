/* paypal.js — PayPal button → calls Supabase Edge Function to grant Premium */
(() => {
  const supa = window.supa || (window.SUPA_URL && window.SUPA_ANON ? supabase.createClient(SUPA_URL, SUPA_ANON) : null);
  if (supa) window.supa = supa;

  const CLIENT_ID = window.PAYPAL_CLIENT_ID || 'YOUR_LIVE_PAYPAL_CLIENT_ID';
  const PRICE = window.PAYPAL_PRICE_EUR || '2.00';
  const CURRENCY = 'EUR';

  window.startCheckout = () => {
    const el = document.getElementById('premium'); if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  function loadSdk() {
    return new Promise((resolve, reject) => {
      if (window.paypal) return resolve();
      const s = document.createElement('script');
      s.src = `https://www.paypal.com/sdk/js?client-id=${encodeURIComponent(CLIENT_ID)}&currency=${CURRENCY}`;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('Failed to load PayPal SDK'));
      document.head.appendChild(s);
    });
  }

  function renderDonate(){
    const link = window.PAYPAL_DONATE_LINK || '';
    const host = document.getElementById('donate');
    if(!host || !link) return;
    host.innerHTML = `<a href="${link}" target="_blank" rel="noopener" class="inline-block px-3 py-2 rounded bg-slate-800 border border-slate-700 hover:bg-slate-700 text-sm">Donate via PayPal</a>`;
  }

  async function initButtons() {
    const container = document.getElementById('paypal-button-container');
    if (!container) return;
    await loadSdk();
    const btns = paypal.Buttons({
      style: { layout: 'vertical', shape: 'rect' },
      createOrder: function(data, actions) {
        return actions.order.create({
          purchase_units: [{
            amount: { value: PRICE, currency_code: CURRENCY }
          }]
        });
      },
      onApprove: async function(data, actions) {
        try {
          const { data:{ session } } = await supa.auth.getSession();
          if(!session){ alert('Connecte-toi avec Discord avant de payer.'); return actions.restart(); }
          const FUNCS = SUPA_URL.replace('.supabase.co', '.functions.supabase.co');
          const r = await fetch(`${FUNCS}/capture-paypal-order`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ orderId: data.orderID, expectedAmount: PRICE, expectedCurrency: CURRENCY })
          });
          if(!r.ok){
            const t = await r.text();
            alert('Erreur de validation: ' + t);
            return;
          }
          alert('Merci ! Premium activé.');
          if(window.auth?.refresh) window.auth.refresh();
        } catch (e) {
          alert('Erreur: ' + (e?.message || e));
        }
      },
      onError: function(err) {
        console.error(err);
        alert('Erreur PayPal.');
      }
    });
    btns.render('#paypal-button-container');
    renderDonate();
  }
  document.addEventListener('DOMContentLoaded', initButtons);
})();