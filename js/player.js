const urlObject = new URL(window.location.href);
let steamId = urlObject.searchParams.get("steam_id");
const searchQuery = urlObject.searchParams.get("q");
const premiumCrownSvg = ` `;

function escapeHtml(text) {
  return String(text ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[character]));
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

function formatMatchTime(isoString) {
  try {
    const parsedDate = new Date(isoString);
    const pad = value => String(value).padStart(2, "0");
    return `${pad(parsedDate.getHours())}:${pad(parsedDate.getMinutes())}`;
  } catch {
    return "--:--";
  }
}

function formatMatchDayLabel(isoString) {
  try {
    const parsedDate = new Date(isoString);
    return new Intl.DateTimeFormat(undefined, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(parsedDate);
  } catch {
    return isoString || "Unknown date";
  }
}

function getMatchDayKey(isoString) {
  try {
    const parsedDate = new Date(isoString);
    const pad = value => String(value).padStart(2, "0");
    return `${parsedDate.getFullYear()}-${pad(parsedDate.getMonth() + 1)}-${pad(parsedDate.getDate())}`;
  } catch {
    return String(isoString || "unknown");
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
  return (Math.round(Number(value) * 10) / 10).toFixed(1).replace(/\.0$/, "");
}

function normalizeWinRateValue(value) {
  if (value == null || isNaN(value)) return 0;
  const numericValue = Number(value);
  if (numericValue <= 1) {
    return Number((numericValue * 100).toFixed(1));
  }
  if (numericValue <= 100) {
    return Number(numericValue.toFixed(1));
  }
  return Number((numericValue / 100).toFixed(1));
}

let cachedSnapshotPlayers = null;
async function loadSnapshotPlayers() {
  if (cachedSnapshotPlayers) return cachedSnapshotPlayers;
  try {
    const response = await fetch("leaderboard_snapshot.json", { cache: "no-store" });
    if (!response.ok) {
      return [];
    }
    const snapshot = await response.json();
    const players = Array.isArray(snapshot.players) ? snapshot.players : [];
    cachedSnapshotPlayers = players;
    return players;
  } catch (error) {
    console.error("[player] failed to load leaderboard_snapshot.json", error);
    return [];
  }
}

async function resolveSteamIdFromSearchQuery() {
  if (steamId) {
    return steamId;
  }
  if (!searchQuery) {
    return null;
  }
  const players = await loadSnapshotPlayers();
  if (!players.length) {
    return null;
  }
  const trimmedQuery = searchQuery.trim();
  const lowerQuery = trimmedQuery.toLowerCase();
  let match = players.find(player => String(player.steam_id) === trimmedQuery);
  if (match) return match.steam_id;
  match = players.find(player => String(player.username || "").toLowerCase() === lowerQuery);
  if (match) return match.steam_id;
  match = players.find(player => String(player.username || "").toLowerCase().includes(lowerQuery));
  if (match) return match.steam_id;
  return null;
}

async function isSteamIdPremium(targetSteamId) {
  try {
    const nowIsoString = new Date().toISOString();
    const { data, error } = await supabaseClient
      .from("profiles")
      .select("steam_id")
      .eq("steam_id", targetSteamId)
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
      if (row.steam_id) premiumSet.add(String(row.steam_id));
    });
    return premiumSet;
  } catch (error) {
    console.warn("[premium list] failed", error);
    return premiumSet;
  }
}

function createStatChipHtml(label, value) {
  return `
    <div class="stat-chip">
      <span class="stat-chip-label">${label}</span>
      <span class="stat-chip-value">${value}</span>
    </div>
  `;
}

function createHeaderCardHtml(playerRow, isPremiumPlayer) {
  const baseName = escapeHtml(playerRow.username || playerRow.steam_id);
  const nameHtml = isPremiumPlayer ? `${baseName}${premiumCrownSvg}` : baseName;
  const avatarLetter = baseName.trim().charAt(0).toUpperCase() || "?";
  const perspectiveHref = `perspective.html?steam_id=${encodeURIComponent(playerRow.steam_id)}`;

  return `
    <div class="player-header-card">
      <div class="player-header-avatar">${avatarLetter}</div>
      <div class="player-header-main">
        <div class="player-header-top">
          <h1 class="player-header-name">${nameHtml}</h1>
          <div class="player-header-actions">
            <a class="btn secondary" href="${perspectiveHref}">Perspective</a>
            <button id="copyBtn" class="btn secondary" type="button">Copy ID</button>
          </div>
        </div>
        <div class="player-header-stats">
          ${createStatChipHtml("Rank", escapeHtml(playerRow.rank || "—"))}
          ${createStatChipHtml("Elo", playerRow.elo ?? "—")}
          ${createStatChipHtml("RP", playerRow.rp ?? "—")}
          ${createStatChipHtml("Games", playerRow.games ?? 0)}
          ${createStatChipHtml("Win%", playerRow.win_rate ?? 0)}
        </div>
      </div>
    </div>
  `;
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
  const canvas = document.getElementById("eloChart");
  if (!canvas) return;
  const canvasContext = canvas.getContext("2d");
  const trendValues = computeExponentialMovingAverage(values, 0.2);

  const chartInstance = new Chart(canvasContext, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Elo",
          data: values,
          tension: 0.25,
          pointRadius: 2,
          borderWidth: 2,
          borderColor: "#60a5fa",
        },
        {
          label: "Trend",
          data: trendValues,
          tension: 0.25,
          pointRadius: 0,
          borderWidth: 2,
          borderColor: "#f59e0b",
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          labels: { color: "#cbd5e1" },
        },
        tooltip: {
          callbacks: {
            title: () => "",
          },
        },
      },
      scales: {
        x: {
          display: false,
          grid: { display: false },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148,163,184,0.15)" },
        },
      },
      hover: {
        mode: "nearest",
        intersect: false,
      },
    },
  });

  canvas.onclick = event => {
    const points = chartInstance.getElementsAtEventForMode(event, "nearest", { intersect: false }, true);
    if (!points || !points.length) return;
    const index = points[0].index;
    if (typeof onPointClick === "function") {
      onPointClick(index);
    }
  };
}

function injectRecentMatchesStyles() {
  if (document.getElementById("playerRecentMatchesStyles")) return;

  const styleElement = document.createElement("style");
  styleElement.id = "playerRecentMatchesStyles";
  styleElement.textContent = `
    .matches-timeline { display: flex; flex-direction: column; gap: 22px; }
    .match-day-group { display: flex; flex-direction: column; gap: 12px; }
    .match-day-label-row { display: flex; align-items: center; gap: 12px; }
    .match-day-label {
      color: #e5e7eb;
      font-weight: 800;
      font-size: 0.98rem;
      letter-spacing: 0.02em;
      text-transform: capitalize;
      white-space: nowrap;
    }
    .match-day-separator {
      flex: 1;
      height: 1px;
      background: linear-gradient(90deg, rgba(148,163,184,0.35), rgba(148,163,184,0.04));
    }
    .match-day-list { display: flex; flex-direction: column; gap: 12px; }
    .recent-match-card {
      display: block;
      text-decoration: none;
      color: inherit;
      border-radius: 16px;
      padding: 16px 18px;
      border: 1px solid rgba(148,163,184,0.16);
      background: linear-gradient(180deg, rgba(10,19,44,0.96), rgba(7,15,35,0.96));
      box-shadow: 0 10px 28px rgba(2,8,23,0.20);
      transition: transform 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
      overflow: hidden;
      position: relative;
    }
    .recent-match-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 16px 38px rgba(2,8,23,0.28);
    }
    .recent-match-card::before {
      content: "";
      position: absolute;
      inset: 0;
      opacity: 1;
      pointer-events: none;
      background: linear-gradient(180deg, rgba(255,255,255,0.018), rgba(255,255,255,0));
    }
    .recent-match-card.is-win {
      border-color: rgba(34, 197, 94, 0.34);
      background: linear-gradient(180deg, rgba(7,33,24,0.96), rgba(7,20,26,0.96));
      box-shadow: 0 12px 30px rgba(10, 70, 38, 0.16);
    }
    .recent-match-card.is-loss {
      border-color: rgba(239, 68, 68, 0.32);
      background: linear-gradient(180deg, rgba(42,14,20,0.96), rgba(16,16,32,0.96));
      box-shadow: 0 12px 30px rgba(80, 16, 28, 0.16);
    }
    .recent-match-card.is-draw {
      border-color: rgba(148, 163, 184, 0.24);
    }
    .recent-match-card-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
      margin-bottom: 14px;
      position: relative;
      z-index: 1;
    }
    .recent-match-meta {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
      color: #cbd5e1;
      font-size: 0.92rem;
    }
    .recent-match-time {
      font-weight: 700;
      color: #f8fafc;
      letter-spacing: 0.01em;
    }
    .recent-match-sep { color: rgba(203, 213, 225, 0.45); }
    .recent-match-result {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      font-size: 0.76rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      border: 1px solid rgba(148,163,184,0.2);
      background: rgba(15,23,42,0.45);
      color: #e2e8f0;
      flex-shrink: 0;
    }
    .recent-match-result.win {
      background: rgba(34,197,94,0.16);
      border-color: rgba(34,197,94,0.35);
      color: #86efac;
    }
    .recent-match-result.loss {
      background: rgba(239,68,68,0.14);
      border-color: rgba(239,68,68,0.34);
      color: #fca5a5;
    }
    .recent-match-result.draw {
      background: rgba(148,163,184,0.12);
      border-color: rgba(148,163,184,0.24);
      color: #cbd5e1;
    }
    .recent-match-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      position: relative;
      z-index: 1;
    }
    .recent-match-side {
      min-width: 0;
      border-radius: 14px;
      padding: 12px 13px;
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.05);
    }
    .recent-match-side.is-focus {
      background: rgba(255,255,255,0.045);
      border-color: rgba(255,255,255,0.11);
      box-shadow: inset 0 0 0 1px rgba(255,255,255,0.02);
    }
    .recent-match-side-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .recent-match-player {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
    }
    .recent-match-name {
      font-size: 1rem;
      font-weight: 800;
      color: #f8fafc;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .recent-match-you-badge {
      display: inline-flex;
      align-items: center;
      height: 20px;
      padding: 0 7px;
      border-radius: 999px;
      border: 1px solid rgba(96,165,250,0.35);
      background: rgba(59,130,246,0.14);
      color: #93c5fd;
      font-size: 0.68rem;
      font-weight: 800;
      letter-spacing: 0.03em;
      text-transform: uppercase;
    }
    .recent-match-side-result {
      flex-shrink: 0;
      font-size: 0.75rem;
      font-weight: 900;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #94a3b8;
    }
    .recent-match-side-result.win { color: #86efac; }
    .recent-match-side-result.loss { color: #fca5a5; }
    .recent-match-side-stats {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .recent-match-mini-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(15,23,42,0.40);
      border: 1px solid rgba(148,163,184,0.14);
      color: #cbd5e1;
      font-size: 0.79rem;
      font-weight: 600;
    }
    .recent-match-mini-chip strong {
      color: #f8fafc;
      font-weight: 800;
    }
    .recent-matches-empty {
      padding: 18px;
      border-radius: 14px;
      border: 1px solid rgba(148,163,184,0.14);
      background: rgba(15,23,42,0.34);
      color: #94a3b8;
    }
    @media (max-width: 720px) {
      .recent-match-grid { grid-template-columns: 1fr; }
      .recent-match-card-top { flex-direction: column; align-items: stretch; }
      .recent-match-result { align-self: flex-start; }
    }
  `;
  document.head.appendChild(styleElement);
}

function createPlayerNameHtml(playerSteamId, displayName, currentSteamId, premiumSteamIdSet) {
  const isPremium = premiumSteamIdSet.has(String(playerSteamId));
  const baseName = escapeHtml(displayName || playerSteamId || "Unknown");
  const nameWithPremium = isPremium ? `${baseName}${premiumCrownSvg}` : baseName;
  const youBadge = String(playerSteamId) === String(currentSteamId)
    ? `<span class="recent-match-you-badge">you</span>`
    : "";

  return `
    <div class="recent-match-player">
      <span class="recent-match-name">${nameWithPremium}</span>
      ${youBadge}
    </div>
  `;
}

function createMiniChipHtml(label, value) {
  return `<span class="recent-match-mini-chip"><span>${escapeHtml(label)}</span> <strong>${escapeHtml(value)}</strong></span>`;
}

function buildMatchCardHtml(matchRow, analysisRow, currentSteamId, premiumSteamIdSet) {
  const p1Id = String(matchRow.p1_id || "");
  const p2Id = String(matchRow.p2_id || "");
  const isCurrentP1 = p1Id === String(currentSteamId);
  const isCurrentP2 = p2Id === String(currentSteamId);
  const winnerSide = matchRow.winner === 1 || matchRow.winner === "1"
    ? "p1"
    : matchRow.winner === 2 || matchRow.winner === "2"
      ? "p2"
      : null;

  let currentResultState = "draw";
  if ((winnerSide === "p1" && isCurrentP1) || (winnerSide === "p2" && isCurrentP2)) {
    currentResultState = "win";
  } else if ((winnerSide === "p1" && isCurrentP2) || (winnerSide === "p2" && isCurrentP1)) {
    currentResultState = "loss";
  }

  const currentResultLabel = currentResultState === "win"
    ? "Victory"
    : currentResultState === "loss"
      ? "Defeat"
      : "Match";

  const durationSeconds = analysisRow?.summary && typeof analysisRow.summary.duration_s === "number"
    ? analysisRow.summary.duration_s
    : null;

  const p1Elo = matchRow.p1_elo_after ?? matchRow.p1_elo_before ?? "—";
  const p2Elo = matchRow.p2_elo_after ?? matchRow.p2_elo_before ?? "—";
  const p1Quality = formatRoundedQuality(analysisRow?.p1_quality);
  const p2Quality = formatRoundedQuality(analysisRow?.p2_quality);

  const p1Name = matchRow.p1_name || matchRow.p1_id || "P1";
  const p2Name = matchRow.p2_name || matchRow.p2_id || "P2";

  const p1SideResult = winnerSide === "p1" ? "win" : winnerSide === "p2" ? "loss" : "draw";
  const p2SideResult = winnerSide === "p2" ? "win" : winnerSide === "p1" ? "loss" : "draw";

  const p1ResultLabel = p1SideResult === "win" ? "Win" : p1SideResult === "loss" ? "Loss" : "—";
  const p2ResultLabel = p2SideResult === "win" ? "Win" : p2SideResult === "loss" ? "Loss" : "—";

  return `
    <a class="recent-match-card is-${currentResultState}" href="match.html?id=${encodeURIComponent(matchRow.id)}">
      <div class="recent-match-card-top">
        <div class="recent-match-meta">
          <span class="recent-match-time">${formatMatchTime(matchRow.played_at)}</span>
          <span class="recent-match-sep">•</span>
          <span>Map ${escapeHtml(matchRow.map_id ?? "-")}</span>
          <span class="recent-match-sep">•</span>
          <span>Duration ${escapeHtml(formatDurationSeconds(durationSeconds))}</span>
        </div>
        <div class="recent-match-result ${currentResultState}">${currentResultLabel}</div>
      </div>

      <div class="recent-match-grid">
        <div class="recent-match-side ${isCurrentP1 ? "is-focus" : ""}">
          <div class="recent-match-side-top">
            ${createPlayerNameHtml(p1Id, p1Name, currentSteamId, premiumSteamIdSet)}
            <span class="recent-match-side-result ${p1SideResult}">${p1ResultLabel}</span>
          </div>
          <div class="recent-match-side-stats">
            ${createMiniChipHtml("Elo", p1Elo)}
            ${createMiniChipHtml("Quality", p1Quality)}
          </div>
        </div>

        <div class="recent-match-side ${isCurrentP2 ? "is-focus" : ""}">
          <div class="recent-match-side-top">
            ${createPlayerNameHtml(p2Id, p2Name, currentSteamId, premiumSteamIdSet)}
            <span class="recent-match-side-result ${p2SideResult}">${p2ResultLabel}</span>
          </div>
          <div class="recent-match-side-stats">
            ${createMiniChipHtml("Elo", p2Elo)}
            ${createMiniChipHtml("Quality", p2Quality)}
          </div>
        </div>
      </div>
    </a>
  `;
}

function renderRecentMatches(matchesContainer, recentMatches, analysisByMatchId, currentSteamId, premiumSteamIdSet) {
  injectRecentMatchesStyles();

  if (!matchesContainer) return;
  matchesContainer.innerHTML = "";

  if (!recentMatches || !recentMatches.length) {
    matchesContainer.innerHTML = `<div class="recent-matches-empty">No recent matches.</div>`;
    return;
  }

  const groups = [];
  let currentGroup = null;

  for (const matchRow of recentMatches) {
    const dayKey = getMatchDayKey(matchRow.played_at);
    if (!currentGroup || currentGroup.dayKey !== dayKey) {
      currentGroup = {
        dayKey,
        label: formatMatchDayLabel(matchRow.played_at),
        matches: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.matches.push(matchRow);
  }

  const html = groups.map(group => {
    const cardsHtml = group.matches.map(matchRow => {
      const analysisRow = analysisByMatchId[matchRow.id] || {};
      return buildMatchCardHtml(matchRow, analysisRow, currentSteamId, premiumSteamIdSet);
    }).join("");

    return `
      <section class="match-day-group">
        <div class="match-day-label-row">
          <div class="match-day-label">${escapeHtml(group.label)}</div>
          <div class="match-day-separator"></div>
        </div>
        <div class="match-day-list">
          ${cardsHtml}
        </div>
      </section>
    `;
  }).join("");

  matchesContainer.innerHTML = `<div class="matches-timeline">${html}</div>`;
}

async function loadPlayerPage() {
  const headerElement = document.getElementById("header");
  steamId = await resolveSteamIdFromSearchQuery();

  if (!steamId) {
    headerElement.innerHTML = `<div class="card">Player not found.</div>`;
    return;
  }

  const snapshotPlayers = await loadSnapshotPlayers();
  let playerRow = snapshotPlayers.find(player => String(player.steam_id) === String(steamId));

  if (!playerRow) {
    const { data: dbRow, error } = await supabaseClient
      .from("players")
      .select("steam_id, username, elo, rp, games, win_rate, rank")
      .eq("steam_id", steamId)
      .maybeSingle();

    if (error) {
      console.error("[player] players select error", error);
    }

    if (!dbRow) {
      headerElement.innerHTML = `<div class="card">Player not found.</div>`;
      return;
    }

    playerRow = {
      steam_id: dbRow.steam_id,
      username: dbRow.username || dbRow.steam_id,
      elo: dbRow.elo,
      rp: dbRow.rp,
      games: dbRow.games,
      win_rate: dbRow.win_rate,
      rank_label: dbRow.rank,
    };
  }

  const headerRow = { ...playerRow };
  headerRow.rank = headerRow.rank_label || headerRow.rank || "Unranked";
  headerRow.win_rate = normalizeWinRateValue(headerRow.win_rate);

  const isPremiumPlayer = await isSteamIdPremium(steamId);
  headerElement.innerHTML = createHeaderCardHtml(headerRow, isPremiumPlayer);

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

  const timelineLabels = [];
  const timelineValues = [];
  const timelineMatchIds = [];

  if (matchesTimeline && matchesTimeline.length) {
    let index = 0;
    for (const matchRow of matchesTimeline) {
      const isPlayerP1 = String(matchRow.p1_id) === String(steamId);
      const eloAfterMatch = isPlayerP1
        ? (matchRow.p1_elo_after ?? matchRow.p1_elo_before)
        : (matchRow.p2_elo_after ?? matchRow.p2_elo_before);
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

    const eloHintElement = document.getElementById("eloHint");
    if (!ratingsRows || !ratingsRows.length) {
      if (eloHintElement) {
        eloHintElement.textContent = "No data available.";
      }
    } else {
      const labels = ratingsRows.map((_, index) => index + 1);
      const values = ratingsRows.map(row => row.elo_after ?? row.elo_before ?? null);
      renderEloChart(labels, values, null);
      if (eloHintElement) {
        eloHintElement.textContent = "No match IDs found for these points.";
      }
    }
  }

  const { data: recentMatches } = await supabaseClient
    .from("matches")
    .select("id, played_at, p1_id, p2_id, p1_name, p2_name, winner, map_id, p1_elo_after, p2_elo_after, p1_elo_before, p2_elo_before")
    .or(`p1_id.eq.${steamId},p2_id.eq.${steamId}`)
    .order("played_at", { ascending: false })
    .limit(50);

  const matchesContainer = document.getElementById("matches");
  if (!matchesContainer) return;

  if (!recentMatches || !recentMatches.length) {
    renderRecentMatches(matchesContainer, [], {}, steamId, new Set());
    return;
  }

  const steamIdSet = new Set([String(steamId)]);
  recentMatches.forEach(matchRow => {
    if (matchRow.p1_id) steamIdSet.add(String(matchRow.p1_id));
    if (matchRow.p2_id) steamIdSet.add(String(matchRow.p2_id));
  });

  const premiumSteamIdSet = await fetchPremiumSteamIdSet(Array.from(steamIdSet));
  const matchIds = recentMatches.map(matchRow => matchRow.id).filter(Boolean);
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

  renderRecentMatches(matchesContainer, recentMatches, analysisByMatchId, steamId, premiumSteamIdSet);
}

document.addEventListener("DOMContentLoaded", loadPlayerPage);
