const supabaseClient = window.supabaseClient;
const SUPABASE_URL = window.SUPABASE_URL;

async function renderAuthBar() {
    const authbarElement = document.getElementById("authbar");
    const statusElement = document.getElementById("accStatus");

    const {
        data: { user }
    } = await supabaseClient.auth.getUser();

    if (!user) {
        authbarElement.innerHTML = `<div class="flex items-center justify-end">
      <button id="signin" class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm">
        Sign in with Discord
      </button>
    </div>`;

        const signinButton = document.getElementById("signin");
        if (signinButton) {
            signinButton.onclick = () => {
                supabaseClient.auth.signInWithOAuth({
                    provider: "discord",
                    options: { redirectTo: location.href }
                });
            };
        }

        if (statusElement) {
            statusElement.textContent = "Please sign in to view your account.";
        }
        return null;
    }

    authbarElement.innerHTML = `<div class="flex items-center justify-end gap-2">
    <button id="signout" class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm hover:bg-slate-700">Sign out</button>
  </div>`;

    const signoutButton = document.getElementById("signout");
    if (signoutButton) {
        signoutButton.onclick = async () => {
            await supabaseClient.auth.signOut();
            location.reload();
        };
    }
    return user;
}

function getDiscordIdFromUser(user) {
    const identities = user && user.identities ? user.identities : [];
    const discordIdentity = identities.find(
        identity => identity && identity.provider === "discord"
    );
    const identityData =
        discordIdentity && discordIdentity.identity_data
            ? discordIdentity.identity_data
            : {};
    const fromIdentity =
        identityData.user_id || identityData.sub || identityData.id;
    const userMetadata = user && user.user_metadata ? user.user_metadata : {};
    const fromMetadata = userMetadata.provider_id || userMetadata.sub || null;
    const finalValue = (fromIdentity || fromMetadata || "").toString().trim();
    return finalValue || null;
}

async function loadLinkedPlayer(user) {
    const linkedElement = document.getElementById("linked-player");

    try {
        const discordId = getDiscordIdFromUser(user);
        if (!discordId) {
            if (linkedElement) {
                linkedElement.textContent = "No Discord ID found.";
            }
            return { discordId: null, steamId: null };
        }

        const response = await fetch("links_state.json", { cache: "no-store" });
        if (!response.ok) {
            if (linkedElement) {
                linkedElement.textContent = "Could not load link state.";
            }
            return { discordId, steamId: null };
        }

        const mapping = await response.json();
        const steamId = mapping[discordId] ? String(mapping[discordId]) : null;

        if (!steamId) {
            if (linkedElement) {
                linkedElement.textContent =
                    "No linked Steam ID found for your Discord account.";
            }
        } else if (linkedElement) {
            linkedElement.innerHTML = `Linked to SteamID <b>${steamId}</b> · <a class="text-indigo-300 hover:underline" href="player.html?steam_id=${encodeURIComponent(
                steamId
            )}">Open your player page</a>`;
        }

        return { discordId, steamId };
    } catch (error) {
        console.error(error);
        if (linkedElement) {
            linkedElement.textContent =
                "Error while resolving linked profile.";
        }
        return { discordId: null, steamId: null };
    }
}

async function saveProfileIdentifiers(user, identifiers) {
    try {
        await supabaseClient
            .from("profiles")
            .upsert(
                {
                    id: user.id,
                    discord_id: identifiers.discordId || null,
                    steam_id: identifiers.steamId || null
                },
                { onConflict: "id" }
            );
    } catch (error) {
        console.warn("profiles upsert (ids) failed:", error);
    }
}

async function loadProfile() {
    const user = await renderAuthBar();
    if (!user) return;

    const metadata = user.user_metadata || {};
    let profileRow = null;

    let { data, error } = await supabaseClient
        .from("profiles")
        .select("premium_until,discord_id,steam_id")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.error("profiles select error", error);
    }
    profileRow = data || null;

    if (!profileRow) {
        const { error: upsertError } = await supabaseClient
            .from("profiles")
            .upsert({ id: user.id });
        if (upsertError) {
            console.warn("profiles upsert error", upsertError);
        }

        const secondSelect = await supabaseClient
            .from("profiles")
            .select("premium_until,discord_id,steam_id")
            .eq("id", user.id)
            .maybeSingle();
        profileRow = secondSelect.data || null;
    }

    const nameGuess =
        metadata.full_name ||
        metadata.name ||
        metadata.preferred_username ||
        metadata.user_name ||
        "—";
    const emailAddress = user.email || metadata.email || "—";

    const premiumUntilDate =
        profileRow && profileRow.premium_until
            ? new Date(profileRow.premium_until)
            : null;
    const hasActivePremium =
        premiumUntilDate && premiumUntilDate > new Date();
    const premiumText = hasActivePremium
        ? `Active (until ${premiumUntilDate.toISOString().slice(0, 10)})`
        : "Not active";

    const statusElement = document.getElementById("accStatus");
    if (statusElement) {
        statusElement.innerHTML = `Logged in as <b>${nameGuess}</b>`;
    }

    const nameElement = document.getElementById("prof-name");
    const emailElement = document.getElementById("prof-email");
    const idElement = document.getElementById("prof-id");
    const premiumElement = document.getElementById("prof-premium");
    const premStateElement = document.getElementById("prem-state");

    if (nameElement) nameElement.textContent = nameGuess;
    if (emailElement) emailElement.textContent = emailAddress;
    if (idElement) idElement.textContent = user.id;
    if (premiumElement) premiumElement.textContent = premiumText;
    if (premStateElement) premStateElement.textContent = premiumText;

    const identifiers = await loadLinkedPlayer(user);
    await saveProfileIdentifiers(user, identifiers);
}

async function getPayPalPublicConfig() {
    const {
        data: { session }
    } = await supabaseClient.auth.getSession();

    const functionsBase = SUPABASE_URL.replace(
        ".supabase.co",
        ".functions.supabase.co"
    );

    const response = await fetch(
        `${functionsBase}/paypal-public-config`,
        {
            method: "GET",
            headers: {
                Authorization: `Bearer ${session && session.access_token ? session.access_token : ""
                    }`
            }
        }
    );
    if (!response.ok) {
        return null;
    }
    return response.json();
}

function showPayPalErrorNotes(text) {
    const noteElementIds = ["one-note", "donate-note"];
    noteElementIds.forEach(elementId => {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = text;
        }
    });
}

function loadPayPalSdk(config, onReady) {
    const clientId = config && config.clientId ? config.clientId : null;
    const currency =
        config && config.currency ? config.currency : "EUR";
    if (!clientId) {
        showPayPalErrorNotes(
            "PayPal is not configured (missing client id)."
        );
        return;
    }
    const parameters = new URLSearchParams({
        "client-id": clientId,
        currency,
        intent: "capture"
    }).toString();
    const scriptElement = document.createElement("script");
    scriptElement.src = `https://www.paypal.com/sdk/js?${parameters}`;
    scriptElement.onload = onReady;
    document.head.appendChild(scriptElement);
}

async function callCapture(orderId) {
    const {
        data: { session }
    } = await supabaseClient.auth.getSession();

    const functionsBase = SUPABASE_URL.replace(
        ".supabase.co",
        ".functions.supabase.co"
    );

    const response = await fetch(
        `${functionsBase}/capture-paypal-order`,
        {
            method: "POST",
            headers: {
                Authorization: `Bearer ${session && session.access_token ? session.access_token : ""
                    }`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                orderId,
                expectedAmount: "2.00",
                expectedCurrency: "EUR"
            })
        }
    );

    let jsonResponse = {};
    try {
        jsonResponse = await response.json();
    } catch (_err) {
        jsonResponse = {};
    }

    if (!response.ok) {
        throw new Error(
            jsonResponse.error || response.statusText || "Capture failed"
        );
    }
    return jsonResponse;
}

function mountOneTimePurchaseButton() {
    if (!window.paypal) return;

    const oneTimeContainer = document.getElementById("paypal-onetime");
    if (!oneTimeContainer) return;

    paypal
        .Buttons({
            style: { label: "pay" },
            createOrder: (_data, actions) =>
                actions.order.create({
                    intent: "CAPTURE",
                    purchase_units: [
                        {
                            amount: {
                                currency_code: "EUR",
                                value: "2.00"
                            }
                        }
                    ]
                }),
            onApprove: async (data, actions) => {
                const order = await actions.order.capture();
                try {
                    await callCapture(order.id);
                    const messageElement = document.getElementById("prem-msg");
                    if (messageElement) {
                        messageElement.textContent =
                            "30-day pass activated. Enjoy!";
                    }
                    setTimeout(() => {
                        location.reload();
                    }, 800);
                } catch (error) {
                    const messageElement = document.getElementById("prem-msg");
                    if (messageElement) {
                        messageElement.textContent = `Activation error: ${error.message || String(error)
                            }`;
                    }
                }
            }
        })
        .render("#paypal-onetime");
}

function mountDonationButtons() {
    if (!window.paypal) return;

    const donateContainer = document.getElementById("paypal-donate");
    if (!donateContainer) return;

    const amountInput = document.getElementById("donation-amount");
    const quickFiveButton = document.getElementById("donation-quick-5");
    const quickTenButton = document.getElementById("donation-quick-10");

    function renderButtons() {
        donateContainer.innerHTML = "";
        paypal
            .Buttons({
                style: { label: "donate" },
                createOrder: (_data, actions) => {
                    let amount = parseFloat(
                        amountInput && amountInput.value
                            ? amountInput.value
                            : "3"
                    );
                    if (Number.isNaN(amount) || amount < 2) {
                        amount = 2;
                    }
                    const formattedAmount = amount.toFixed(2);
                    return actions.order.create({
                        intent: "CAPTURE",
                        purchase_units: [
                            {
                                amount: {
                                    currency_code: "EUR",
                                    value: formattedAmount
                                }
                            }
                        ]
                    });
                },
                onApprove: async (_data, actions) => {
                    await actions.order.capture();
                    const messageElement = document.getElementById("prem-msg");
                    if (messageElement) {
                        messageElement.textContent =
                            "Thanks a lot for your support! (Donations do not grant extra features.)";
                    }
                }
            })
            .render("#paypal-donate");
    }

    if (amountInput) {
        amountInput.addEventListener("change", renderButtons);
        amountInput.addEventListener("keyup", renderButtons);
    }
    if (quickFiveButton) {
        quickFiveButton.addEventListener("click", () => {
            if (amountInput) amountInput.value = "5.00";
            renderButtons();
        });
    }
    if (quickTenButton) {
        quickTenButton.addEventListener("click", () => {
            if (amountInput) amountInput.value = "10.00";
            renderButtons();
        });
    }

    renderButtons();
}

async function initializeAccountPage() {
    await loadProfile();

    const config = await getPayPalPublicConfig();
    if (!config) {
        showPayPalErrorNotes(
            "Unable to fetch PayPal public config."
        );
        return;
    }

    loadPayPalSdk(config, () => {
        mountOneTimePurchaseButton();
        mountDonationButtons();
    });
}

document.addEventListener("DOMContentLoaded", initializeAccountPage);
