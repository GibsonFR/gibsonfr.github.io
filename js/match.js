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

function buildStatCard(label, value, suffix, tooltip) {
    const finalSuffix = suffix || "";
    const titleAttr = tooltip ? ` title="${escapeHtml(tooltip)}"` : "";
    return `<div class="p-2 rounded bg-slate-800 border border-slate-700"${titleAttr}>
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

    const secondsAsTagger = playerStats.seconds_as_tagger ?? 0;
    const secondsAsHider = playerStats.seconds_as_hider ?? 0;
    const totalSeconds = secondsAsTagger + secondsAsHider;
    const tagShare = totalSeconds > 0 ? secondsAsTagger / totalSeconds : null;

    const cards = [];

    // --- Core role quality ---
    cards.push(
        buildStatCard(
            "Quality (tagger)",
            formatNumber(playerStats.tagger_quality, 1),
            "",
            "Overall performance score when you are the tagger (0–100)."
        ),
        buildStatCard(
            "Quality (hider)",
            formatNumber(playerStats.hider_quality, 1),
            "",
            "Overall performance score when you are the hider (0–100)."
        )
    );

    // --- Role time / duration ---
    cards.push(
        buildStatCard(
            "Time as tagger",
            tagShare != null ? formatPercentage(tagShare) : "—",
            "",
            "Share of total round time where you were the tagger."
        ),
        buildStatCard(
            "Seconds — tagger",
            formatNumber(secondsAsTagger, 2),
            " s",
            "Absolute time spent as tagger during the match."
        ),
        buildStatCard(
            "Seconds — hider",
            formatNumber(secondsAsHider, 2),
            " s",
            "Absolute time spent as hider during the match."
        )
    );

    // --- Distance / spacing / movement ---
    cards.push(
        buildStatCard(
            "Avg dist (hider)",
            formatNumber(playerStats.avg_distance_as_hider, 2),
            " m",
            "Average distance to the opponent while you are the hider. Higher usually means better spacing."
        ),
        buildStatCard(
            "Avg dist (tagger)",
            formatNumber(playerStats.avg_distance_as_tagger, 2),
            " m",
            "Average distance to the opponent while you are the tagger. Lower usually means better pressure."
        ),
        buildStatCard(
            "Movement (overall)",
            playerStats.movement_ratio != null ? formatPercentage(playerStats.movement_ratio) : "—",
            "",
            "Share of time you are moving faster than the camping threshold."
        ),
        buildStatCard(
            "Path diversity",
            playerStats.path_diversity_score != null ? formatNumber(playerStats.path_diversity_score, 1) : "—",
            playerStats.path_diversity_score != null ? "/100" : "",
            "How many different map cells you visit compared to the approximate map size (0–100). Higher means more varied routes."
        )
    );

    // --- Retag behaviour ---
    cards.push(
        buildStatCard(
            "Retag median",
            formatNumber(playerStats.retag_median_seconds, 2),
            " s",
            "Median duration of a tagger streak before you lose the tag."
        ),
        buildStatCard(
            "Retag initial",
            formatNumber(playerStats.retag_initial_seconds, 2),
            " s",
            "Duration of your very first tagger streak of the match."
        ),
        buildStatCard(
            "Retag avg",
            formatNumber(playerStats.retag_avg_seconds, 2),
            " s",
            "Average duration of your tagger streaks."
        )
    );

    // --- Items & conversion ---
    cards.push(
        buildStatCard(
            "Item accuracy",
            playerStats.item_accuracy != null ? formatPercentage(playerStats.item_accuracy) : "—",
            "",
            "Among item uses that were in a reasonable range, how many directly led to a tag shortly after."
        ),
        buildStatCard(
            "Opp. conversion",
            playerStats.conversion_rate != null ? formatPercentage(playerStats.conversion_rate) : "—",
            "",
            "How often you convert close-range opportunities (<5m) into actual tags."
        ),
        buildStatCard(
            "Item uses (eligible/all)",
            `${playerStats.item_eligible_uses ?? 0} / ${playerStats.item_all_uses ?? 0}`,
            "",
            "Number of item uses counted as relevant (within range) versus total item uses."
        )
    );

    // --- Chase / evasion / pressure ---
    cards.push(
        buildStatCard(
            "Chase score",
            playerStats.chase_score != null ? formatNumber(playerStats.chase_score, 1) : "—",
            "/100",
            "Average rate at which you close distance when you are chasing within the chase radius."
        ),
        buildStatCard(
            "Evasion score",
            playerStats.evasion_score != null ? formatNumber(playerStats.evasion_score, 1) : "—",
            "/100",
            "Average rate at which you open distance when you are being chased within the chase radius."
        ),
        buildStatCard(
            "Danger time (hider)",
            playerStats.hider_pressure_danger_share != null ? formatPercentage(playerStats.hider_pressure_danger_share) : "—",
            "",
            "Share of your hider time spent very close to the tagger (pressure radius)."
        ),
        buildStatCard(
            "Safe time (hider)",
            playerStats.hider_pressure_safe_share != null ? formatPercentage(playerStats.hider_pressure_safe_share) : "—",
            "",
            "Share of your hider time spent far enough from the tagger (safe distance)."
        )
    );

    // --- Per-role movement ---
    cards.push(
        buildStatCard(
            "Movement as tagger",
            playerStats.movement_ratio_tagger != null ? formatPercentage(playerStats.movement_ratio_tagger) : "—",
            "",
            "Share of your tagger time where you are moving (not camping)."
        ),
        buildStatCard(
            "Movement as hider",
            playerStats.movement_ratio_hider != null ? formatPercentage(playerStats.movement_ratio_hider) : "—",
            "",
            "Share of your hider time where you are moving (not camping)."
        )
    );

    // --- Style / geometry ---
    cards.push(
        buildStatCard(
            "Exploration pattern",
            playerStats.exploration_pattern || "—",
            "",
            "Description of your pathing: looper = you loop in a small area, imprevisible = you cover a lot without repeating, regular = in between."
        ),
        buildStatCard(
            "Vertical style",
            playerStats.vertical_style || "—",
            "",
            "Whether you tend to play above your opponent (air), below (ground) or mixed in height."
        ),
        buildStatCard(
            "Predictive tagging",
            playerStats.tagger_predictivity_score != null ? formatNumber(playerStats.tagger_predictivity_score, 1) : "—",
            "/100",
            "How much your tagger movement tends to anticipate where the hider will be next (higher is more predictive)."
        ),
        buildStatCard(
            "Hider tangent score",
            playerStats.hider_tangent_score != null ? formatNumber(playerStats.hider_tangent_score, 1) : "—",
            "/100",
            "How often you move tangentially (sideways) relative to the chaser when you are the hider."
        )
    );

    // --- Raw movement totals ---
    cards.push(
        buildStatCard(
            "Total moving time",
            formatNumber(playerStats.time_moving_total, 2),
            " s",
            "Total time you spent moving above the camping speed."
        ),
        buildStatCard(
            "Total idle time",
            formatNumber(playerStats.time_idle_total, 2),
            " s",
            "Total time you spent moving slower than the camping speed (or standing still)."
        )
    );

    cardsContainer.innerHTML = cards.join("");
}

function safeAverage(values) {
    const nums = values.filter(v => typeof v === "number" && !Number.isNaN(v));
    if (!nums.length) return null;
    const sum = nums.reduce((a, b) => a + b, 0);
    return sum / nums.length;
}

function computeProfileScores(stats) {
    if (!stats) stats = {};

    const secondsAsTagger = stats.seconds_as_tagger ?? 0;
    const secondsAsHider = stats.seconds_as_hider ?? 0;
    const totalSeconds = secondsAsTagger + secondsAsHider;

    const aggression = safeAverage([
        stats.tagger_quality,
        stats.chase_score,
        stats.item_accuracy != null ? stats.item_accuracy * 100 : null,
        stats.conversion_rate != null ? stats.conversion_rate * 100 : null
    ]);

    const evasion = safeAverage([
        stats.hider_quality,
        stats.evasion_score,
        stats.hider_pressure_danger_share != null
            ? (1 - stats.hider_pressure_danger_share) * 100
            : null
    ]);

    const control = safeAverage([
        totalSeconds > 0 ? (1 - secondsAsTagger / totalSeconds) * 100 : null,
        stats.conversion_rate != null ? stats.conversion_rate * 100 : null
    ]);

    const mobility = safeAverage([
        stats.movement_ratio != null ? stats.movement_ratio * 100 : null,
        stats.movement_ratio_hider != null ? stats.movement_ratio_hider * 100 : null,
        stats.path_diversity_score
    ]);

    function clamp0_100(v) {
        if (v == null || Number.isNaN(v)) return null;
        return Math.max(0, Math.min(100, Math.round(v)));
    }

    return {
        aggression: clamp0_100(aggression),
        evasion: clamp0_100(evasion),
        control: clamp0_100(control),
        mobility: clamp0_100(mobility)
    };
}

function renderProfileDiagram(containerSelector, profile) {
    const container = getElement(containerSelector);
    if (!container) return;

    if (!profile) {
        container.innerHTML = '<div class="text-xs text-slate-500">Profile unavailable.</div>';
        return;
    }

    const entries = [
        ["Aggression", profile.aggression],
        ["Evasion", profile.evasion],
        ["Control", profile.control],
        ["Mobility", profile.mobility]
    ].filter(([_, v]) => v != null);

    if (!entries.length) {
        container.innerHTML = '<div class="text-xs text-slate-500">Profile unavailable.</div>';
        return;
    }

    const descriptions = {
        Aggression: "Tagger-side quality, chase speed, item accuracy and close-range conversion.",
        Evasion: "Hider-side quality, escape speed and how rarely you stay in danger range.",
        Control: "How often you keep the opponent tagged and convert close-range situations.",
        Mobility: "How much you move and how diverse your pathing is across the map."
    };

    const rows = entries.map(([label, value]) => {
        const width = Math.max(4, Math.min(100, value));
        const titleAttr = descriptions[label]
            ? ` title="${escapeHtml(descriptions[label])}"`
            : "";
        return `
      <div class="flex items-center gap-2"${titleAttr}>
        <div class="w-20 text-[11px] text-slate-400">${label}</div>
        <div class="flex-1 h-2 rounded bg-slate-800 overflow-hidden">
          <div class="h-2 rounded bg-indigo-500" style="width:${width}%"></div>
        </div>
        <div class="w-9 text-right text-[11px] text-slate-300">${value}</div>
      </div>`;
    });

    container.innerHTML = rows.join("");
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
    const playerOneLabel = createPlainNameWithPremium(
        currentMatchRow && currentMatchRow.p1_id,
        summary.p1_name || "P1",
        currentPremiumSteamIds
    );
    const playerTwoLabel = createPlainNameWithPremium(
        currentMatchRow && currentMatchRow.p2_id,
        summary.p2_name || "P2",
        currentPremiumSteamIds
    );

    getElement("#p1title").innerHTML = `${playerOneLabel} — Quality`;
    getElement("#p2title").innerHTML = `${playerTwoLabel} — Quality`;

    const analyzedAtText = data.analyzed_at
        ? new Date(data.analyzed_at).toLocaleString()
        : "—";
    getElement("#analAt").textContent = analyzedAtText;
    getElement("#ver").textContent = data.version || "—";
    getElement("#p1q").textContent = data.p1_quality ?? "—";
    getElement("#p2q").textContent = data.p2_quality ?? "—";

    // --- match-level summary from new backend fields ---
    const matchSummaryEl = getElement("#matchSummary");
    if (matchSummaryEl) {
        const durationStr = summary.duration_s != null
            ? `${formatNumber(summary.duration_s, 2)} s`
            : "—";

        const matchType = summary.match_type || "unknown";
        const deathType = summary.death_type || "unknown";

        const tagShareDiffStr = summary.tag_share_diff != null
            ? formatPercentage(summary.tag_share_diff)
            : "—";

        const tagSwitchRateStr = summary.tag_switch_rate != null
            ? formatNumber(summary.tag_switch_rate, 3)
            : "—";

        const p1ShortName = summary.p1_name || (currentMatchRow && currentMatchRow.p1_name) || "P1";
        const p2ShortName = summary.p2_name || (currentMatchRow && currentMatchRow.p2_name) || "P2";

        let dominanceText = "—";
        if (summary.dominant_player === 1) {
            dominanceText = `${p1ShortName} spent less time tagged overall (more dominant).`;
        } else if (summary.dominant_player === 2) {
            dominanceText = `${p2ShortName} spent less time tagged overall (more dominant).`;
        }

        matchSummaryEl.innerHTML = `
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <div title="Total replay duration according to the analysis.">
            <span class="text-slate-400">Duration:</span> <span class="text-slate-200">${durationStr}</span>
          </div>
          <div title="Type of match">
            <span class="text-slate-400">Match type:</span> <span class="text-slate-200">${escapeHtml(matchType)}</span>
          </div>
          <div title="How the loser died: time, tag, or damage.">
            <span class="text-slate-400">Death type:</span> <span class="text-slate-200">${escapeHtml(deathType)}</span>
          </div>
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs mt-1">
          <div title="Absolute difference between both players' tag time, normalized by total match time.">
            <span class="text-slate-400">Tag share diff:</span> <span class="text-slate-200">${tagShareDiffStr}</span>
          </div>
          <div title="Average number of tag switches per second.">
            <span class="text-slate-400">Tag switch rate:</span> <span class="text-slate-200">${tagSwitchRateStr}/s</span>
          </div>
          <div title="Player who spent less total time tagged.">
            <span class="text-slate-400">Dominance:</span> <span class="text-slate-200">${escapeHtml(dominanceText)}</span>
          </div>
        </div>`;
    }

    const p1Stats = data.p1_stats || {};
    const p2Stats = data.p2_stats || {};

    renderPlayerStatsCards("#p1cards", p1Stats, "#p1sample");
    renderPlayerStatsCards("#p2cards", p2Stats, "#p2sample");

    // Profile diagrams
    const p1Profile = computeProfileScores(p1Stats);
    const p2Profile = computeProfileScores(p2Stats);
    renderProfileDiagram("#p1profile", p1Profile);
    renderProfileDiagram("#p2profile", p2Profile);
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
