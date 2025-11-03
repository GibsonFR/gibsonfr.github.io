const SUPABASE_URL = "https://yykwhpeczfapkileuxtb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5a3docGVjemZhcGtpbGV1eHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjM4NzUsImV4cCI6MjA3NzU5OTg3NX0.Sz2G1DG0CVYC9WSuYSODnH9k0_ybVluZAtRGBwb55wo";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const urlObject = new URL(window.location.href);
let steamId = urlObject.searchParams.get("steam_id");
const searchQuery = urlObject.searchParams.get("q");

const premiumCrownSvg = `<span title="Premium member" aria-label="Premium member">
  <svg class="inline-block ml-1 h-4 w-4 align-[-1px] text-amber-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 19h14a1 1 0 0 0 1-1v-7.5l-3.8 2.85a1 1 0 0 1-1.52-.47L12 5.6l-2.68 7.28a1 1 0 0 1-1.52.47L4 10.5V18a1 1 0 0 0 1 1Zm-3 2a1 1 0 1 0 0 2h20a1 1 0 1 0 0-2H2Z"/>
  </svg>
</span>`;

function escapeHtml(text) {
  return (text || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}

function formatDateTime(isoString) {
  try {
    const parsedDate = new Date(isoString);
    const pad = value => String(value).padStart(2, "0");
    return `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())} ${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;
  } catch {
    return isoString || "";
  }
}

function formatDurationSeconds(seconds) {
  if (seconds == null || isNaN(seconds)) {
    return "—";
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatRoundedQuality(value) {
  if (value == null || isNaN(value)) {
    return "—";
  }
  return Math.round(value * 10) / 10;
}

async function resolveSteamIdFromSearchQuery() {
  if (steamId) {
    return steamId;
  }
  if (!searchQuery) {
    return null;
  }
  const { data } = await supabaseClient.rpc("search_players", { q: searchQuery, p_limit: 1 });
  if (!data || !data.length) {
    return null;
  }
  return data[0].steam_id;
}

function createStatChipHtml(label, value) {
  return `<div class="px-2 py-1 rounded-xl bg-slate-800/70 border border-slate-700 text-sm">
    <span class="text-slate-400">${label}</span>
    <span class="ml-1 text-slate-100 font-medium">${value}</span>
  </div>`;
}

async function isSteamIdPremium(steamId) {
  try {
    const nowIsoString = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("steam_id")
      .eq("steam_id", steamId)
      .gt("premium_until", nowIsoString)
      .maybeSingle();
    if (error) {
      console.warn("[premium header] select error", error);
      return false;
    }
    return !!data;
  } catch (error) {
    console.warn("[premium header] failed", error);
    return false;
  }
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

function createHeaderCardHtml(playerRow, isPremiumPlayer) {
  const baseName = escapeHtml(playerRow.username || playerRow.steam_id);
  const nameHtml = isPremiumPlayer
    ? `<span class="text-amber-300" title="Premium member">${baseName}</span>${premiumCrownSvg}`
    : baseName;

  const avatarLetter = (baseName.trim().charAt(0).toUpperCase() || "?");
  const perspectiveHref = `perspective.html?steam_id=${encodeURIComponent(playerRow.steam_id)}`;

  return `
  <div class="p-4 rounded-2xl border border-slate-800 bg-slate-900/40">
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-full bg-indigo-600/20 border border-indigo-500/30 grid place-items-center text-xl font-bold text-indigo-300">${avatarLetter}</div>
        <div>
          <div class="text-2xl font-extrabold leading-tight">${nameHtml}</div>
          <div class="mt-2 flex flex-wrap gap-2">
            ${createStatChipHtml("Rank", escapeHtml(playerRow.rank || "—"))}
            ${createStatChipHtml("Elo", playerRow.elo ?? "—")}
            ${createStatChipHtml("RP", playerRow.rp ?? "—")}
            ${createStatChipHtml("Games", playerRow.games ?? 0)}
            ${createStatChipHtml("Win%", playerRow.win_rate ?? 0)}
          </div>
        </div>
      </div>

      <div class="flex items-center gap-3">
        <a class="px-3 py-2 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30"
           href="${perspectiveHref}">Perspective</a>
        <button id="copyBtn" class="px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 hover:bg-slate-700"
                title="Copy Steam ID">Copy ID</button>
      </div>
    </div>
  </div>`;
}

function computeExponentialMovingAverage(values, alpha) {
  const output = [];
  let previousValue = null;
  for (const value of values) {
    if (value == null) {
      output.push(previousValue);
      continue;
    }
    previousValue = previousValue == null ? value : alpha * value + (1 - alpha) * previousValue;
    output.push(previousValue);
  }
  return output;
}

function renderEloChart(labels, values, onPointClick) {
  const canvasContext = document.getElementById("eloChart").getContext("2d");
  const trendValues = computeExponentialMovingAverage(values, 0.2);
  const chartInstance = new Chart(canvasContext, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Elo", data: values, tension: 0.25, pointRadius: 2, borderWidth: 2, borderColor: "#60a5fa" },
        { label: "Trend", data: trendValues, tension: 0.25, pointRadius: 0, borderWidth: 2, borderColor: "#f59e0b" }
      ]
    },
    options: {
      plugins: {
        legend: { labels: { color: "#cbd5e1" } },
        tooltip: { callbacks: { title: () => "" } }
      },
      scales: {
        x: { display: false, grid: { display: false } },
        y: { ticks: { color: "#94a3b8" }, grid: { color: "rgba(148,163,184,0.15)" } }
      },
      hover: { mode: "nearest", intersect: false }
    }
  });

  const canvasElement = document.getElementById("eloChart");
  canvasElement.onclick = event => {
    const points = chartInstance.getElementsAtEventForMode(event, "nearest", { intersect: false }, true);
    if (!points || !points.length) {
      return;
    }
    const index = points[0].index;
    if (typeof onPointClick === "function") {
      onPointClick(index);
    }
  };
}

async function loadPlayerPage() {
  steamId = await resolveSteamIdFromSearchQuery();
  if (!steamId) {
    document.getElementById("header").innerHTML = '<div class="text-red-400">Player not found.</div>';
    return;
  }

  const { data: playerRow } = await supabaseClient.from("players").select("*").eq("steam_id", steamId).single();
  if (!playerRow) {
    document.getElementById("header").innerHTML = '<div class="text-red-400">Player not found.</div>';
    return;
  }

  const isPremiumPlayer = await isSteamIdPremium(steamId);
  document.getElementById("header").innerHTML = createHeaderCardHtml(playerRow, isPremiumPlayer);

  const copyButton = document.getElementById("copyBtn");
  if (copyButton) {
    copyButton.onclick = async () => {
      await navigator.clipboard.writeText(steamId);
    };
  }

  const { data: matchesTimeline } = await supabaseClient
    .from("matches")
    .select("id, played_at, p1_id, p2_id, p1_elo_before, p1_elo_after, p2_elo_before, p2_elo_after")
    .or(`p1_id.eq.${steamId},p2_id.eq.${steamId}`)
    .order("played_at", { ascending: true })
    .limit(2000);

  let timelineLabels = [];
  let timelineValues = [];
  let timelineMatchIds = [];

  if (matchesTimeline && matchesTimeline.length) {
    let index = 0;
    for (const matchRow of matchesTimeline) {
      const isPlayerP1 = matchRow.p1_id === steamId;
      const eloAfterMatch = isPlayerP1 ? (matchRow.p1_elo_after ?? matchRow.p1_elo_before) : (matchRow.p2_elo_after ?? matchRow.p2_elo_before);
      timelineLabels.push(++index);
      timelineValues.push(eloAfterMatch ?? null);
      timelineMatchIds.push(matchRow.id);
    }
    renderEloChart(timelineLabels, timelineValues, pointIndex => {
      const matchId = timelineMatchIds[pointIndex];
      if (matchId) {
        window.location.href = `match.html?id=${matchId}`;
      }
    });
  } else {
    const { data: ratingsRows } = await supabaseClient
      .from("ratings")
      .select("at, elo_before, elo_after")
      .eq("player_id", steamId)
      .order("at", { ascending: true });

    if (!ratingsRows || !ratingsRows.length) {
      document.getElementById("eloHint").textContent = "No data available.";
    } else {
      const labels = ratingsRows.map((_, index) => index + 1);
      const values = ratingsRows.map(row => row.elo_after ?? row.elo_before ?? null);
      renderEloChart(labels, values, null);
      document.getElementById("eloHint").textContent = "No match IDs found for these points.";
    }
  }

  const { data: recentMatches } = await supabaseClient
    .from("matches")
    .select("id, played_at, p1_id, p2_id, p1_name, p2_name, winner, map_id, p1_elo_after, p2_elo_after, p1_elo_before, p2_elo_before")
    .or(`p1_id.eq.${steamId},p2_id.eq.${steamId}`)
    .order("played_at", { ascending: false })
    .limit(50);

  const matchesContainer = document.getElementById("matches");
  matchesContainer.innerHTML = "";
  if (!recentMatches || !recentMatches.length) {
    return;
  }

  const steamIdSet = new Set([steamId]);
  recentMatches.forEach(matchRow => {
    steamIdSet.add(matchRow.p1_id);
    steamIdSet.add(matchRow.p2_id);
  });

  const premiumSteamIdSet = await fetchPremiumSteamIdSet(Array.from(steamIdSet));

  const matchIds = recentMatches.map(matchRow => matchRow.id);
  const analysisByMatchId = {};
  if (matchIds.length) {
    const { data: analysesRows } = await supabaseClient
      .from("match_analyses")
      .select("match_id, p1_quality, p2_quality, summary")
      .in("match_id", matchIds);
    if (analysesRows) {
      for (const analysisRow of analysesRows) {
        analysisByMatchId[analysisRow.match_id] = analysisRow;
      }
    }
  }

  const youBadgeHtml = `<span class="ml-2 px-1.5 py-0.5 text-[10px] rounded bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 align-middle">you</span>`;

  function createPlayerNameHtml(playerSteamId, displayName) {
    const isPremium = premiumSteamIdSet.has(String(playerSteamId));
    const baseName = escapeHtml(displayName);
    const innerHtml = isPremium ? `<span class="text-amber-300" title="Premium member">${baseName}</span>${premiumCrownSvg}` : baseName;
    return innerHtml + (String(playerSteamId) === String(steamId) ? youBadgeHtml : "");
  }

  for (const matchRow of recentMatches) {
    const analysisRow = analysisByMatchId[matchRow.id] || {};
    const durationSeconds = analysisRow.summary && typeof analysisRow.summary.duration_s === "number" ? analysisRow.summary.duration_s : null;

    const p1Elo = matchRow.p1_elo_after ?? matchRow.p1_elo_before ?? "-";
    const p2Elo = matchRow.p2_elo_after ?? matchRow.p2_elo_before ?? "-";

    const p1Quality = formatRoundedQuality(analysisRow.p1_quality);
    const p2Quality = formatRoundedQuality(analysisRow.p2_quality);

    const winnerSide = matchRow.winner === 1 || matchRow.winner === "1" ? "p1" : matchRow.winner === 2 || matchRow.winner === "2" ? "p2" : null;
    const winBadgeP1 = winnerSide === "p1" ? `<span class="ml-2 text-emerald-400 text-xs">Win</span>` : "";
    const winBadgeP2 = winnerSide === "p2" ? `<span class="ml-2 text-emerald-400 text-xs">Win</span>` : "";

    const p1DisplayName = matchRow.p1_name || matchRow.p1_id || "P1";
    const p2DisplayName = matchRow.p2_name || matchRow.p2_id || "P2";

    matchesContainer.innerHTML += `
      <a href="match.html?id=${matchRow.id}" class="block rounded border border-slate-800 hover:border-indigo-500 bg-slate-900/40">
        <div class="px-3 py-2 border-b border-slate-800 text-slate-300 text-sm flex items-center justify-between">
          <div>${formatDateTime(matchRow.played_at)} · <span class="text-slate-400">Map ${matchRow.map_id ?? "-"}</span></div>
          <div class="text-slate-400">Duration <span class="text-slate-100">${formatDurationSeconds(durationSeconds)}</span></div>
        </div>
        <div class="p-3 space-y-2">
          <div class="min-w-0 truncate">
            <span class="font-semibold">${createPlayerNameHtml(matchRow.p1_id, p1DisplayName)}</span>
            <span class="text-slate-400">(${p1Elo})</span>
            <span class="ml-2 text-slate-400">· Quality <span class="text-slate-100">${p1Quality}</span></span>
            ${winBadgeP1}
          </div>
          <div class="min-w-0 truncate">
            <span class="font-semibold">${createPlayerNameHtml(matchRow.p2_id, p2DisplayName)}</span>
            <span class="text-slate-400">(${p2Elo})</span>
            <span class="ml-2 text-slate-400">· Quality <span class="text-slate-100">${p2Quality}</span></span>
            ${winBadgeP2}
          </div>
        </div>
      </a>`;
  }
}

document.addEventListener("DOMContentLoaded", loadPlayerPage);
