function escapeHtml(text) {
    return (text || "").replace(/[&<>"']/g, ch => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[ch]));
}

function getDiscordIdFromUser(user) {
    const identities = user && user.identities ? user.identities : [];
    const discordIdentity = identities.find(
        identity => identity && identity.provider === "discord"
    );

    const identityData = discordIdentity && discordIdentity.identity_data
        ? discordIdentity.identity_data
        : {};

    const fromIdentity = identityData.user_id || identityData.sub || identityData.id;

    const userMetadata = user && user.user_metadata ? user.user_metadata : {};
    const fromMetadata = userMetadata.provider_id || userMetadata.sub || null;

    const finalValue = (fromIdentity || fromMetadata || "").toString().trim();
    return finalValue || null;
}

async function resolveSteamIdForUser(user) {
    try {
        const discordId = getDiscordIdFromUser(user);
        if (!discordId) return null;

        const response = await fetch("links_state.json", { cache: "no-store" });
        if (!response.ok) return null;

        const linksMap = await response.json();
        const mappedSteamId = linksMap[String(discordId)];
        return mappedSteamId ? String(mappedSteamId) : null;
    } catch (error) {
        console.warn("[auth] failed to resolve steam id from links_state.json", error);
        return null;
    }
}

async function goToMyProfile() {
    try {
        const {
            data: { user },
        } = await supabaseClient.auth.getUser();

        if (!user) {
            await supabaseClient.auth.signInWithOAuth({
                provider: "discord",
                options: { redirectTo: window.location.href },
            });
            return;
        }

        const steamId = await resolveSteamIdForUser(user);
        if (steamId) {
            window.location.href = `player.html?steam_id=${encodeURIComponent(steamId)}`;
            return;
        }

        window.location.href = "account.html";
    } catch (error) {
        console.error("[auth] goToMyProfile error", error);
        alert("Unable to open your profile right now.");
    }
}

window.goToMyProfile = goToMyProfile;

function wireMyProfileButtons() {
    const handler = (event) => {
        event.preventDefault();
        goToMyProfile();
    };

    const candidates = document.querySelectorAll("a, button");
    candidates.forEach((el) => {
        if (el.dataset.myProfileWired === "1") return;
        if (!el.textContent) return;

        const label = el.textContent.trim().toLowerCase();
        if (label === "my profile") {
            el.dataset.myProfileWired = "1";
            el.addEventListener("click", handler);
        }
    });
}

async function renderAuthBar() {
    const authbar = document.getElementById("authbar");
    if (!authbar) return;

    let user = null;
    try {
        const { data } = await supabaseClient.auth.getUser();
        user = data.user || null;
    } catch {
        user = null;
    }

    const joinDiscordUrl = "https://discord.gg/MfX7hHVAZM"; 

    if (!user) {
        authbar.innerHTML = `
      <div class="flex justify-end gap-2 items-center text-sm">
        <button id="authSignInBtn"
                class="px-3 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white">
          Sign in with Discord
        </button>
        <a href="${joinDiscordUrl}"
           class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700">
          Join Discord
        </a>
      </div>
    `;

        const signInBtn = document.getElementById("authSignInBtn");
        if (signInBtn) {
            signInBtn.onclick = () => {
                supabaseClient.auth.signInWithOAuth({
                    provider: "discord",
                    options: { redirectTo: window.location.href },
                });
            };
        }
    } else {
        const meta = user.user_metadata || {};
        const displayName =
            meta.full_name ||
            meta.name ||
            meta.preferred_username ||
            meta.user_name ||
            user.email ||
            "Signed in";

        authbar.innerHTML = `
      <div class="flex justify-end gap-2 items-center text-sm">
        <span class="text-slate-300 mr-2">${escapeHtml(displayName)}</span>
        <button id="authMyProfileBtn"
                class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700">
          My profile
        </button>
        <a href="account.html"
           class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700">
          Account
        </a>
        <button id="authSignOutBtn"
                class="px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700">
          Sign out
        </button>
      </div>
    `;

        const myProfileBtn = document.getElementById("authMyProfileBtn");
        if (myProfileBtn) {
            myProfileBtn.onclick = (e) => {
                e.preventDefault();
                goToMyProfile();
            };
        }

        const signOutBtn = document.getElementById("authSignOutBtn");
        if (signOutBtn) {
            signOutBtn.onclick = async () => {
                await supabaseClient.auth.signOut();
                window.location.href = "index.html";
            };
        }
    }
    wireMyProfileButtons();
}

document.addEventListener("DOMContentLoaded", () => {
    renderAuthBar();

    supabaseClient.auth.onAuthStateChange(() => {
        renderAuthBar();
    });
});
