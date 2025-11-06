(function () {
    let realStartCheckout =
        typeof window.startCheckout === "function"
            ? window.startCheckout
            : null;
    let loaded = !!realStartCheckout;
    let loadingPromise = null;

    function ensurePaypal() {
        if (loaded) return Promise.resolve();
        if (loadingPromise) return loadingPromise;

        loadingPromise = new Promise(resolve => {
            if (typeof window.startCheckout === "function") {
                realStartCheckout = window.startCheckout;
                loaded = true;
                return resolve();
            }

            const s = document.createElement("script");
            s.src = "paypal.js";
            s.onload = () => {
                loaded = true;
                if (typeof window.startCheckout === "function") {
                    realStartCheckout = window.startCheckout;
                }
                resolve();
            };
            document.head.appendChild(s);
        });

        return loadingPromise;
    }

    window.startCheckout = async function () {
        await ensurePaypal();
        if (typeof realStartCheckout === "function") {
            return realStartCheckout();
        } else {
            console.warn(
                "[payments] startCheckout called but underlying implementation not found."
            );
        }
    };
})();
