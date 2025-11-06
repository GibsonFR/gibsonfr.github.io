const matchUrl = new URL(window.location.href);
const matchIdParam = matchUrl.searchParams.get("id");
const matchIdIsNumeric = matchIdParam && /^\d+$/.test(matchIdParam);
const matchIdValue = matchIdIsNumeric ? Number(matchIdParam) : matchIdParam;

const FREE_DAILY_LIMIT = 3;

let currentMatchRow = null;
let currentPremiumSteamIds = new Set();

function getElement(selector) {
    return document.querySelector(selector);
}

function escapeHtml(text) {
    return (text || "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    }[character]));
}

function buildStatCard(label, value, suffix) {
    const finalSuffix = suffix || "";
    return `<div class="p-2 rounded bg-slate-800 border border-slate-700">
    <div class="text-slate-400">${label}</div>
    <div class="text-slate-100 font-semibold">${value}${finalSuffix}</div>
  </div>`;
}

function formatPercentage(value) {
    if (value == null || Number.isNaN(value)) {
        return "—";
    }
    const scaledValue = Math.round(value * 1000) / 10;
    return `${scaledValue}%`;
}

function formatNumber(value, digits) {
    if (value == null || Number.isNaN(value)) {
        return "—";
    }
    const power = Math.pow(10, digits ?? 3);
    return Math.round(value * power) / power;
}

const premiumCrownSvg = `<span title="Premium member" aria-label="Premium member">
  <svg class="inline-block ml-1 h-4 w-4 align-[-1px] text-amber-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 19h14a1 1 0 0 0 1-1v-7.5l-3.8 2.85a1 1 0 0 1-1.52-.47L12 5.6l-2.68 7.28a1 1 0 0 1-1.52.47L4 10.5V18a1 1 0 0 0 1 1Zm-3 2a1 1 0 1 0 0 2h20a1 1 0 1 0 0-2H2Z"/>
  </svg>
</span>`;

function createLinkedNameWithPremium(steamId, displayName, premiumSet) {
    const isPremium = premiumSet && premiumSet.has(String(steamId));
    const baseLabel = escapeHtml(displayName || steamId || "Player");
    const linkClass = isPremium ? "text-amber-300 hover:text-amber-200" : "text-indigo-400 hover:underline";
    const linkHtml = `<a class="${linkClass}" href="player.html?steam_id=${encodeURIComponent(steamId)}">${baseLabel}</a>`;
    return isPremium ? `${linkHtml}${premiumCrownSvg}` : linkHtml;
}

function createPlainNameWithPremium(steamId, displayName, premiumSet) {
    const isPremium = premiumSet && premiumSet.has(String(steamId));
    const baseLabel = escapeHtml(displayName || steamId || "Player");
    if (isPremium) {
        return `<span class="text-amber-300" title="Premium member">${baseLabel}</span>${premiumCrownSvg}`;
    }
    return baseLabel;
}

async function fetchPremiumSteamIdSet(steamIds) {
    const premiumSet = new Set();
    if (!steamIds || !steamIds.length) {
        return premiumSet;
    }
    try {
        const nowIsoString = new Date().toISOString();
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("steam_id")
            .in("steam_id", steamIds)
            .gt("premium_until", nowIsoString);

        if (error) {
            console.warn("[premium list] select error", error);
            return premiumSet;
        }

        (data || []).forEach(row => {
            if (row.steam_id) {
                premiumSet.add(String(row.steam_id));
            }
        });
        return premiumSet;
    } catch (error) {
        console.warn("[premium list] failed", error);
        return premiumSet;
    }
}

async function fetchMatchById(matchId) {
    const { data, error } = await supabaseClient
        .from("matches")
        .select("*")
        .eq("id", matchId)
        .maybeSingle();

    if (error) {
        console.error("[match] fetch error", error);
    }

    return data || null;
}

function renderPlayerStatsCards(containerSelector, playerStats, sampleSelector) {
    const cardsContainer = getElement(containerSelector);
    const sampleContainer = getElement(sampleSelector);

    const lowSampleTaggerText = playerStats.low_sample_tagger ? "· tagger sample low" : "";
    const lowSampleHiderText = playerStats.low_sample_hider ? "· hider sample low" : "";
    const sampleText = [lowSampleTaggerText, lowSampleHiderText].filter(Boolean).join(" ");
    sampleContainer.textContent = sampleText;

    cardsContainer.innerHTML = [
        buildStatCard("Quality (tagger)", playerStats.quality_tagger ?? "—"),
        buildStatCard("Quality (hider)", playerStats.quality_hider ?? "—"),
        buildStatCard("Time as tagger", formatPercentage(playerStats.time_as_tagger_share)),
        buildStatCard("Seconds — tagger", playerStats.seconds_as_tagger ?? "—", " s"),
        buildStatCard("Seconds — hider", playerStats.seconds_as_hider ?? "—", " s"),
        buildStatCard("Avg dist (hider)", playerStats.avg_distance_as_hider ?? "—", " m"),
        buildStatCard("Avg dist (tagger)", playerStats.avg_distance_as_tagger ?? "—", " m"),
        buildStatCard("Avg speed", playerStats.avg_speed_ms ?? "—", " m/s"),
        buildStatCard("Retag median", playerStats.retag_median_seconds ?? "—", " s"),
        buildStatCard("Retag initial", playerStats.retag_initial_seconds ?? "—", " s"),
        buildStatCard("Retag avg", playerStats.retag_avg_seconds ?? "—", " s"),
        buildStatCard("Accuracy", playerStats.accuracy != null ? formatNumber(playerStats.accuracy * 100, 1) : "—", playerStats.accuracy != null ? "%" : "")
    ].join("");
}

function renderMatchHeader(matchRow, premiumSet) {
    const playerOneNameHtml = createLinkedNameWithPremium(
        matchRow.p1_id,
        matchRow.p1_name || "P1",
        premiumSet
    );
    const playerTwoNameHtml = createLinkedNameWithPremium(
        matchRow.p2_id,
        matchRow.p2_name || "P2",
        premiumSet
    );

    const playerOneElo = matchRow.p1_elo_after ?? matchRow.p1_elo_before ?? "-";
    const playerTwoElo = matchRow.p2_elo_after ?? matchRow.p2_elo_before ?? "-";

    const winnerField = matchRow.winner;
    let winnerHtml = "—";
    if (winnerField === "1" || winnerField === 1) {
        winnerHtml = playerOneNameHtml;
    } else if (winnerField === "2" || winnerField === 2) {
        winnerHtml = playerTwoNameHtml;
    }

    let replayHtml;
    if (matchRow.replay_url) {
        const safeReplayUrl = encodeURI(matchRow.replay_url);
        replayHtml = `
      <div class="flex flex-wrap items-center gap-2">
        <a
          class="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm"
          href="${safeReplayUrl}"
          download
        >
          Download replay
        </a>
        <span id="watchReplaySlot" class="text-sm text-slate-400"></span>
      </div>`;
    } else {
        replayHtml = `<span class="text-slate-500 text-sm">Replay not uploaded</span>`;
    }

    const matchCardContainer = getElement("#matchCard");
    const playedAtText = matchRow.played_at
        ? new Date(matchRow.played_at).toLocaleString()
        : "";

    matchCardContainer.innerHTML = `
    <div class="space-y-3">
      <div class="text-slate-300 text-sm">${playedAtText}</div>
      <div class="text-xl font-bold">
        ${playerOneNameHtml} <span class="text-slate-400">(${playerOneElo})</span>
        <span class="text-slate-500">vs</span>
        ${playerTwoNameHtml} <span class="text-slate-400">(${playerTwoElo})</span>
      </div>
      <div class="text-slate-300">
        Winner:
        <span class="text-slate-100">${winnerHtml}</span>
        · Map ${matchRow.map_id ?? "-"}
      </div>
      <div class="pt-1">${replayHtml}</div>
    </div>`;
}

function updateWatchReplaySlot(user) {
    const slot = getElement("#watchReplaySlot");
    if (!slot) return;

    if (!currentMatchRow || !currentMatchRow.replay_url) {
        slot.innerHTML = "";
        return;
    }

    if (!user) {
        slot.innerHTML = `
      <div class="flex items-center gap-2">
        <button
          class="px-3 py-1.5 rounded border border-slate-700 bg-slate-900 text-slate-500 text-sm cursor-not-allowed"
          title="Sign in with Discord to watch replays"
        >
          Watch replay
        </button>
        <span class="text-xs text-slate-500">Sign in to unlock</span>
      </div>`;
        return;
    }

    const replayUrlParam = encodeURIComponent(currentMatchRow.replay_url);
    const viewerHref = `replay-viewer.html?rpl=${replayUrlParam}`;

    slot.innerHTML = `
    <a
      href="${viewerHref}"
      class="inline-flex items-center px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
    >
      Watch replay
    </a>`;
}

function renderMatchNotFound() {
    const matchCardContainer = getElement("#matchCard");
    matchCardContainer.innerHTML = '<div class="text-red-400">Match not found.</div>';
    const analysisBlockElement = getElement("#analysisBlock");
    analysisBlockElement.classList.add("hidden");
}

async function getCurrentUser() {
    const { data: { user } } = await supabaseClient.auth.getUser();
    return user || null;
}

async function isCurrentUserPremium(user) {
    try {
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("premium_until")
            .eq("id", user.id)
            .maybeSingle();
        if (error) {
            return false;
        }
        return !!(data && data.premium_until && new Date(data.premium_until) > new Date());
    } catch {
        return false;
    }
}

async function countAnalysesToday(user) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const startIsoString = now.toISOString();

    try {
        const { count, error } = await supabaseClient
            .from("analysis_requests")
            .select("id", { count: "exact", head: true })
            .eq("requested_by", user.id)
            .gte("created_at", startIsoString);
        if (!error && typeof count === "number") {
            return count;
        }
    } catch {
    }

    try {
        const { count, error } = await supabaseClient
            .from("analysis_requests")
            .select("id", { count: "exact", head: true })
            .eq("requested_by", user.id)
            .gte("inserted_at", startIsoString);
        if (!error && typeof count === "number") {
            return count;
        }
    } catch {
    }

    const storageKey = `analysis_used_${user.id}_${startIsoString.slice(0, 10)}`;
    const storedValue = Number(localStorage.getItem(storageKey) || "0");
    if (Number.isNaN(storedValue)) {
        return 0;
    }
    return storedValue;
}

function incrementLocalAnalysisCounter(user) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const storageKey = `analysis_used_${user.id}_${now.toISOString().slice(0, 10)}`;
    const storedValue = Number(localStorage.getItem(storageKey) || "0");
    const baseValue = Number.isNaN(storedValue) ? 0 : storedValue;
    localStorage.setItem(storageKey, String(baseValue + 1));
}

async function updateGateBanner() {
    const gateBannerElement = getElement("#gateBanner");
    const analyzeButtonElement = getElement("#analyzeBtn");

    const user = await getCurrentUser();
    updateWatchReplaySlot(user);

    if (!user) {
        gateBannerElement.classList.remove("hidden");
        gateBannerElement.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="text-amber-300">🔒</div>
        <div>
          <div class="font-semibold mb-1">Sign in required</div>
          <div class="text-slate-300 text-sm">Please sign in with Discord to analyze matches. Free members can analyze up to <b>${FREE_DAILY_LIMIT}/day</b>. Premium unlocks unlimited analyses + Perspective.</div>
          <div class="mt-2">
            <button id="signinBtn" class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Sign in with Discord</button>
          </div>
        </div>
      </div>`;
        if (analyzeButtonElement) {
            analyzeButtonElement.disabled = true;
        }
        const signInButton = document.getElementById("signinBtn");
        if (signInButton) {
            signInButton.onclick = () => {
                supabaseClient.auth.signInWithOAuth({
                    provider: "discord",
                    options: { redirectTo: window.location.href }
                });
            };
        }
        return { user: null, premium: false, used: 0 };
    }

    const premium = await isCurrentUserPremium(user);
    const usedAnalyses = await countAnalysesToday(user);

    if (premium) {
        gateBannerElement.classList.add("hidden");
        if (analyzeButtonElement) {
            analyzeButtonElement.disabled = false;
        }
    } else {
        gateBannerElement.classList.remove("hidden");
        if (usedAnalyses >= FREE_DAILY_LIMIT) {
            gateBannerElement.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="text-amber-300">⏳</div>
          <div>
            <div class="font-semibold mb-1">Daily limit reached</div>
            <div class="text-slate-300 text-sm">
              You've used your <b>${FREE_DAILY_LIMIT}</b> free analyses today.
              Go <a class="text-amber-300 underline hover:no-underline" href="account.html">Premium</a> to unlock unlimited analyses and <b>Perspective</b>.
            </div>
            <div class="mt-2">
              <a href="account.html" class="px-3 py-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-sm">Go Premium (€2)</a>
            </div>
          </div>
        </div>`;
            if (analyzeButtonElement) {
                analyzeButtonElement.disabled = true;
            }
        } else {
            gateBannerElement.innerHTML = `
        <div class="flex items-start gap-3">
          <div class="text-emerald-300">✅</div>
          <div>
            <div class="font-semibold mb-1">Free plan</div>
            <div class="text-slate-300 text-sm">
              You have <b>${FREE_DAILY_LIMIT - usedAnalyses}</b> analysis${FREE_DAILY_LIMIT - usedAnalyses === 1 ? "" : "es"} left today.
              Premium unlocks unlimited analyses + <b>Perspective</b>.
            </div>
          </div>
        </div>`;
            if (analyzeButtonElement) {
                analyzeButtonElement.disabled = false;
            }
        }
    }
    return { user, premium, used: usedAnalyses };
}

async function loadAnalysis(matchId) {
    const analysisStatusElement = getElement("#analysisStatus");
    const analysisResultElement = getElement("#analysisResult");

    const { data } = await supabaseClient
        .from("match_analyses")
        .select("*")
        .eq("match_id", matchId)
        .maybeSingle();

    if (!data) {
        analysisStatusElement.textContent = "No analysis yet.";
        analysisResultElement.classList.add("hidden");
        return;
    }

    analysisStatusElement.textContent = "";
    analysisResultElement.classList.remove("hidden");

    const summary = data.summary || {};
    const playerOneLabel = createPlainNameWithPremium(currentMatchRow && currentMatchRow.p1_id, summary.p1_name || "P1", currentPremiumSteamIds);
    const playerTwoLabel = createPlainNameWithPremium(currentMatchRow && currentMatchRow.p2_id, summary.p2_name || "P2", currentPremiumSteamIds);

    getElement("#p1title").innerHTML = `${playerOneLabel} — Quality`;
    getElement("#p2title").innerHTML = `${playerTwoLabel} — Quality`;

    const analyzedAtText = data.analyzed_at ? new Date(data.analyzed_at).toLocaleString() : "—";
    getElement("#analAt").textContent = analyzedAtText;
    getElement("#ver").textContent = data.version || "—";
    getElement("#p1q").textContent = data.p1_quality ?? "—";
    getElement("#p2q").textContent = data.p2_quality ?? "—";

    renderPlayerStatsCards("#p1cards", data.p1_stats || {}, "#p1sample");
    renderPlayerStatsCards("#p2cards", data.p2_stats || {}, "#p2sample");
}

async function queueAnalysisRequest(matchId, replayUrl, gateState) {
    const analyzeButtonElement = getElement("#analyzeBtn");
    const analysisStatusElement = getElement("#analysisStatus");

    if (analyzeButtonElement) {
        analyzeButtonElement.disabled = true;
    }
    analysisStatusElement.textContent = "Queuing analysis…";

    let requestRow = {
        match_id: matchId,
        replay_url: replayUrl || null,
        requested_by: gateState.user.id
    };

    let { error } = await supabaseClient
        .from("analysis_requests")
        .insert(requestRow);

    if (error) {
        const errorMessage = String(error.message || "").toLowerCase();
        if (errorMessage.includes("requested_by") || errorMessage.includes("column")) {
            const { error: fallbackError } = await supabaseClient
                .from("analysis_requests")
                .insert({ match_id: matchId, replay_url: replayUrl || null });
            if (fallbackError) {
                analysisStatusElement.textContent = `Error: ${fallbackError.message}`;
                if (analyzeButtonElement) {
                    analyzeButtonElement.disabled = false;
                }
                return;
            }
        } else {
            analysisStatusElement.textContent = `Error: ${error.message}`;
            if (analyzeButtonElement) {
                analyzeButtonElement.disabled = false;
            }
            return;
        }
    }

    if (!gateState.premium) {
        incrementLocalAnalysisCounter(gateState.user);
    }
    analysisStatusElement.textContent = "Queued. Waiting for worker…";
}

function subscribeToRealtimeAnalysis(matchId) {
    supabaseClient
        .channel("match_analyses_live")
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "match_analyses", filter: `match_id=eq.${matchId}` }, () => loadAnalysis(matchId))
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "match_analyses", filter: `match_id=eq.${matchId}` }, () => loadAnalysis(matchId))
        .subscribe();
}

function updateWatchReplayButton(gateState, matchRow) {
    const btn = document.getElementById("watchReplayBtn");
    if (!btn) return;

    if (!matchRow.replay_url) {
        btn.disabled = true;
        btn.textContent = "Replay not uploaded";
        btn.title = "Replay file not uploaded";
        btn.onclick = null;
        return;
    }

    if (!gateState.user) {
        btn.disabled = false;
        btn.textContent = "Sign in to watch replay";
        btn.title = "Sign in with Discord to watch this replay";
        btn.onclick = () => {
            supabaseClient.auth.signInWithOAuth({
                provider: "discord",
                options: { redirectTo: window.location.href }
            });
        };
        return;
    }

    btn.disabled = false;
    btn.textContent = "Watch replay (3D)";
    btn.title = "";
    btn.onclick = () => {
        window.location.href = `replay.html?id=${encodeURIComponent(matchIdValue)}`;
    };
}

async function initializeMatchPage() {
    if (!matchIdParam) {
        renderMatchNotFound();
        return;
    }

    const matchRow = await fetchMatchById(matchIdValue);
    if (!matchRow) {
        renderMatchNotFound();
        return;
    }

    currentMatchRow = matchRow;

    currentPremiumSteamIds = await fetchPremiumSteamIdSet([matchRow.p1_id, matchRow.p2_id]);
    renderMatchHeader(matchRow, currentPremiumSteamIds);

    const analysisBlockElement = getElement("#analysisBlock");
    analysisBlockElement.classList.remove("hidden");

    let gateState = await updateGateBanner();
    updateWatchReplayButton(gateState, matchRow);

    const analyzeButtonElement = getElement("#analyzeBtn");
    if (analyzeButtonElement) {
        analyzeButtonElement.onclick = async () => {
            gateState = await updateGateBanner();
            if (!gateState.user) {
                return;
            }
            if (!gateState.premium && gateState.used >= FREE_DAILY_LIMIT) {
                return;
            }
            await queueAnalysisRequest(matchIdValue, matchRow.replay_url, gateState);
        };
    }

    await loadAnalysis(matchIdValue);
    subscribeToRealtimeAnalysis(matchIdValue);

    supabaseClient.auth.onAuthStateChange(async () => {
        gateState = await updateGateBanner();
        updateWatchReplayButton(gateState, matchRow);
    });
}

document.addEventListener("DOMContentLoaded", initializeMatchPage);
