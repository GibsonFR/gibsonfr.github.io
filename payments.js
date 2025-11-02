// payments.js — legacy wrapper to keep compat with old pages that import this file
// It simply ensures paypal.js is loaded and exposes startCheckout().
(function(){
  function ensurePaypal(){
    if (window.paypalLoaded) return Promise.resolve();
    return new Promise((resolve)=>{
      const s = document.createElement('script');
      s.src = 'paypal.js';
      s.onload = ()=>{ window.paypalLoaded = true; resolve(); };
      document.head.appendChild(s);
    });
  }
  window.startCheckout = async function(){ await ensurePaypal(); if (window.startCheckout) window.startCheckout(); };
})();