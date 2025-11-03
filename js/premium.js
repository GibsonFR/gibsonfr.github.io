const premiumService = (function() {
  const premiumSteamIds = new Set();

  const premiumCrownSvg = `
<span title="Premium member" aria-label="Premium member">
  <svg
    class="inline-block ml-1 h-4 w-4 align-[-1px] text-amber-300"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M5 19h14a1 1 0 0 0 1-1v-7.5l-3.8 2.85a1 1 0 0 1-1.52-.47L12 5.6l-2.68 7.28a1 1 0 0 1-1.52.47L4 10.5V18a1 1 0 0 0 1 1Zm-3 2a1 1 0 1 0 0 2h20a1 1 0 1 0 0-2H2Z"/>
  </svg>
</span>
`;

  function getDiscordIdFromUser(user) {
    const identities = user && user.identities ? user.identities : [];
    const discordIdentity = identities.find(function(identity) {
      return identity && identity.provider === "discord";
    });
    const fromIdentities =
      discordIdentity && discordIdentity.identity_data && (discordIdentity.identity_data.user_id || discordIdentity.identity_data.sub || discordIdentity.identity_data.id);
    const fromMetadata =
      user && user.user_metadata && (user.user_metadata.provider_id || user.user_metadata.sub);
    const value = fromIdentities || fromMetadata || "";
    return String(value).trim() || null;
  }

  function getPremiumPlayerNameHtml(row) {
    const username = escapeHtml(row.username || row.steam_id);
    const steamId = String(row.steam_id);
    const isPremium = premiumSteamIds.has(steamId);
    if (isPremium) {
      return `
      <a
        title="Premium member"
        class="text-amber-300 hover:text-amber-200"
        href="player.html?steam_id=${encodeURIComponent(steamId)}"
      >
        ${username}
      </a>
      ${premiumCrownSvg}
    `;
    }
    return `
    <a
      class="text-indigo-400 hover:underline"
      href="player.html?steam_id=${encodeURIComponent(steamId)}"
    >
      ${username}
    </a>
  `;
  }

  async function fetchPremiumFromProfiles() {
    try {
      let linksState = null;
      try {
        const response = await fetch("links_state.json", { cache: "no-store" });
        if (response.ok) {
          linksState = await response.json();
        }
      } catch (error) {
      }
      const nowIso = new Date().toISOString();
      const pageSize = 1000;
      let offset = 0;
      for (;;) {
        const query = supabaseClient
          .from("profiles")
          .select("steam_id, discord_id, premium_until")
          .gt("premium_until", nowIso)
          .range(offset, offset + pageSize - 1);
        const result = await query;
        const data = result.data;
        const error = result.error;
        if (error) {
          console.warn("premium profiles error", error);
          break;
        }
        if (!data || data.length === 0) {
          break;
        }
        for (const profile of data) {
          let steamId = profile.steam_id ? String(profile.steam_id) : null;
          if (!steamId && linksState && profile.discord_id) {
            const linkedSteamId = linksState[String(profile.discord_id)];
            if (linkedSteamId) {
              steamId = String(linkedSteamId);
            }
          }
          if (steamId) {
            premiumSteamIds.add(steamId);
          }
        }
        if (data.length < pageSize) {
          break;
        }
        offset += pageSize;
      }
    } catch (error) {
      console.warn("premium fetchPremiumFromProfiles failed", error);
    }
  }

  async function markSignedInUserAsPremium() {
    try {
      const result = await supabaseClient.auth.getUser();
      const user = result && result.data ? result.data.user : null;
      if (!user) {
        return;
      }
      const profileResult = await supabaseClient
        .from("profiles")
        .select("premium_until")
        .eq("id", user.id)
        .maybeSingle();
      const profile = profileResult.data;
      const premiumUntil = profile && profile.premium_until ? new Date(profile.premium_until) : null;
      const isPremiumActive = premiumUntil && premiumUntil > new Date();
      if (!isPremiumActive) {
        return;
      }
      const response = await fetch("links_state.json", { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const linksState = await response.json();
      const discordId = getDiscordIdFromUser(user);
      const steamId = discordId && linksState ? linksState[discordId] : null;
      if (steamId) {
        premiumSteamIds.add(String(steamId));
      }
    } catch (error) {
    }
  }

  async function initializePremiumMarkers() {
    await Promise.all([markSignedInUserAsPremium(), fetchPremiumFromProfiles()]);
  }

  return {
    initializePremiumMarkers,
    getPremiumPlayerNameHtml
  };
})();

window.premiumService = premiumService;
