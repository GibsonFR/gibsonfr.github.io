const SUPABASE_URL = "https://yykwhpeczfapkileuxtb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5a3docGVjemZhcGtpbGV1eHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjM4NzUsImV4cCI6MjA3NzU5OTg3NX0.Sz2G1DG0CVYC9WSuYSODnH9k0_ybVluZAtRGBwb55wo";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const premiumSteamIds = new Set();

const premiumCrownSvg = `<span title="Premium member" aria-label="Premium member">
  <svg class="inline-block ml-1 h-4 w-4 align-[-1px] text-amber-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 19h14a1 1 0 0 0 1-1v-7.5l-3.8 2.85a1 1 0 0 1-1.52-.47L12 5.6l-2.68 7.28a1 1 0 0 1-1.52.47L4 10.5V18a1 1 0 0 0 1 1Zm-3 2a1 1 0 1 0 0 2h20a1 1 0 1 0 0-2H2Z"/>
  </svg>
</span>`;

function escapeHtml(text) {
  return (text || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
}

function getPremiumNameHtml(leaderboardRow) {
  const baseName = escapeHtml(leaderboardRow.username || leaderboardRow.steam_id);
  const isPremium = premiumSteamIds.has(String(leaderboardRow.steam_id));
  if (isPremium) {
    return `<a title="Premium member" class="text-amber-300 hover:text-amber-200" href="player.html?steam_id=${encodeURIComponent(leaderboardRow.steam_id)}">${baseName}</a>${premiumCrownSvg}`;
  }
  return `<a class="text-indigo-400 hover:underline" href="player.html?steam_id=${encodeURIComponent(leaderboardRow.steam_id)}">${baseName}</a>`;
}

async function fetchPremiumFromProfiles() {
  try {
    let linksStateMap = null;
    try {
      const response = await fetch("links_state.json", { cache: "no-store" });
      if (response.ok) {
        linksStateMap = await response.json();
      }
    } catch (error) {
    }
    const nowIsoString = new Date().toISOString();
    const pageSizeProfiles = 1000;
    let currentOffset = 0;
    for (;;) {
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("steam_id,discord_id,premium_until")
        .gt("premium_until", nowIsoString)
        .range(currentOffset, currentOffset + pageSizeProfiles - 1);
      if (error) {
        console.warn("[premium] select error", error);
        break;
      }
      if (!data || data.length === 0) {
        break;
      }
      for (const profileRow of data) {
        let steamId = profileRow.steam_id ? String(profileRow.steam_id) : null;
        if (!steamId && linksStateMap && profileRow.discord_id) {
          const mappedSteamId = linksStateMap[String(profileRow.discord_id)];
          if (mappedSteamId) {
            steamId = String(mappedSteamId);
          }
        }
        if (steamId) {
          premiumSteamIds.add(steamId);
        }
      }
      if (data.length < pageSizeProfiles) {
        break;
      }
      currentOffset += pageSizeProfiles;
    }
  } catch (error) {
    console.warn("[premium] fetch failed", error);
  }
}

function getDiscordIdFromUser(user) {
  const identities = user && user.identities ? user.identities : [];
  const discordIdentity = identities.find(identity => identity && identity.provider === "discord");
  const identityData = discordIdentity && discordIdentity.identity_data ? discordIdentity.identity_data : {};
  const fromIdentity = identityData.user_id || identityData.sub || identityData.id;
  const userMetadata = user && user.user_metadata ? user.user_metadata : {};
  const fromMetadata = userMetadata.provider_id || userMetadata.sub || null;
  const finalValue = (fromIdentity || fromMetadata || "").toString().trim();
  return finalValue || null;
}

async function markSignedInUserAsPremium() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return;
    }
    const { data: profile } = await supabaseClient
      .from("profiles")
      .select("premium_until")
      .eq("id", user.id)
      .maybeSingle();
    const premiumUntilDate = profile && profile.premium_until ? new Date(profile.premium_until) : null;
    const hasActivePremium = premiumUntilDate && premiumUntilDate > new Date();
    if (!hasActivePremium) {
      return;
    }
    const response = await fetch("links_state.json", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    const linksStateMap = await response.json();
    const discordId = getDiscordIdFromUser(user);
    const steamId = discordId ? linksStateMap[discordId] : null;
    if (steamId) {
      premiumSteamIds.add(String(steamId));
    }
  } catch (error) {
  }
}

async function initializePremiumMarkers() {
  await Promise.all([markSignedInUserAsPremium(), fetchPremiumFromProfiles()]);
}

let pageSizeValue = 1000;
let currentPageIndex = 0;
let totalPlayers = 0;
let leaderboardRows = [];
let sortedLeaderboardRows = [];
let currentSortState = { key: "rank", dir: "desc" };

function getTierOrderFromRank(rankText) {
  const normalizedRank = (rankText || "").toLowerCase();
  if (normalizedRank.startsWith("chall")) return 9;
  if (normalizedRank.startsWith("gm") || normalizedRank.startsWith("grand")) return 8;
  if (normalizedRank.startsWith("master")) return 7;
  if (normalizedRank.startsWith("diamond")) return 6;
  if (normalizedRank.startsWith("platinum")) return 5;
  if (normalizedRank.startsWith("gold")) return 4;
  if (normalizedRank.startsWith("silver")) return 3;
  if (normalizedRank.startsWith("bronze")) return 2;
  if (normalizedRank.startsWith("clown")) return 1;
  return 0;
}

function getDivisionFromRank(rankText) {
  const parts = (rankText || "").trim().split(/\s+/);
  const lastPart = parts[parts.length - 1] || "";
  const normalizedDivision = lastPart.toUpperCase();
  const divisionMap = { I: 1, II: 2, III: 3, IV: 4 };
  return divisionMap[normalizedDivision] || 4;
}

function getHeaderCell(label, sortKey) {
  const isCurrent = currentSortState.key === sortKey;
  const arrow = isCurrent ? (currentSortState.dir === "asc" ? " ▲" : " ▼") : "";
  return `<th class="p-2 text-left select-none cursor-pointer" data-sort="${sortKey}">${label}${arrow}</th>`;
}

function applySortToLeaderboardRows(rows) {
  const sortKey = currentSortState.key;
  const sortDirection = currentSortState.dir;
  function asNumber(value) {
    return value == null ? -Infinity : value;
  }
  function compareRows(a, b) {
    if (sortKey === "rank") {
      const tierDifference = getTierOrderFromRank(b.rank) - getTierOrderFromRank(a.rank);
      if (tierDifference) return tierDifference;
      const divisionDifference = getDivisionFromRank(a.rank) - getDivisionFromRank(b.rank);
      if (divisionDifference) return divisionDifference;
      const ratingPointDifference = (b.rp ?? 0) - (a.rp ?? 0);
      if (ratingPointDifference) return ratingPointDifference;
      return (b.elo ?? 0) - (a.elo ?? 0);
    }
    if (sortKey === "player") {
      const nameA = (a.username || "").toString();
      const nameB = (b.username || "").toString();
      return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
    }
    if (sortKey === "rp") {
      return asNumber(b.rp) - asNumber(a.rp);
    }
    if (sortKey === "elo") {
      return asNumber(b.elo) - asNumber(a.elo);
    }
    if (sortKey === "games") {
      return asNumber(b.games) - asNumber(a.games);
    }
    if (sortKey === "wr") {
      return asNumber(b.win_rate) - asNumber(a.win_rate);
    }
    return 0;
  }
  rows.sort(compareRows);
  if (sortDirection === "asc") {
    rows.reverse();
  }
  rows.forEach((row, index) => {
    row.__position = index + 1;
  });
  return rows;
}

function renderLeaderboardTable(rowsSlice) {
  const tableHeadHtml = `<thead class="bg-slate-900">
    <tr>
      ${getHeaderCell("#", "rank")}
      ${getHeaderCell("Player", "player")}
      ${getHeaderCell("Rank", "rank")}
      ${getHeaderCell("RP", "rp")}
      ${getHeaderCell("Elo", "elo")}
      ${getHeaderCell("Games", "games")}
      ${getHeaderCell("Win%", "wr")}
    </tr>
  </thead>`;
  const tableBodyHtml = rowsSlice.map(row => `
    <tr class="border-t border-slate-800 hover:bg-slate-900">
      <td class="p-2">${row.__position}</td>
      <td class="p-2">${getPremiumNameHtml(row)}</td>
      <td class="p-2 text-center">${escapeHtml(row.rank || "")}</td>
      <td class="p-2 text-center">${row.rp ?? ""}</td>
      <td class="p-2 text-center">${row.elo ?? ""}</td>
      <td class="p-2 text-center">${row.games ?? 0}</td>
      <td class="p-2 text-center">${row.win_rate ?? 0}</td>
    </tr>`).join("");
  const boardElement = document.getElementById("board");
  boardElement.innerHTML = `<table class="w-full text-sm">${tableHeadHtml}<tbody>${tableBodyHtml}</tbody></table>`;
  document.querySelectorAll("[data-sort]").forEach(headerCell => {
    headerCell.onclick = () => {
      const clickedKey = headerCell.getAttribute("data-sort");
      if (!clickedKey) {
        return;
      }
      if (currentSortState.key === clickedKey) {
        currentSortState.dir = currentSortState.dir === "asc" ? "desc" : "asc";
      } else {
        currentSortState.key = clickedKey;
        currentSortState.dir = clickedKey === "player" ? "asc" : "desc";
      }
      sortedLeaderboardRows = applySortToLeaderboardRows([...leaderboardRows]);
      currentPageIndex = 0;
      renderLeaderboard();
    };
  });
}

function renderPagerControls() {
  const totalPages = Math.max(1, Math.ceil(totalPlayers / pageSizeValue));
  const pagerElement = document.getElementById("pager");
  pagerElement.innerHTML = `
    <button id="first" class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex <= 0 ? "opacity-50" : ""}">« First</button>
    <button id="prev" class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex <= 0 ? "opacity-50" : ""}">‹ Prev</button>
    <span class="text-slate-300">Page <b>${currentPageIndex + 1}</b> / ${totalPages} · Total <b>${totalPlayers}</b></span>
    <button id="next" class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex >= totalPages - 1 ? "opacity-50" : ""}">Next ›</button>
    <button id="last" class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex >= totalPages - 1 ? "opacity-50" : ""}">Last »</button>`;
  document.getElementById("first").onclick = () => {
    currentPageIndex = 0;
    renderLeaderboard();
  };
  document.getElementById("prev").onclick = () => {
    if (currentPageIndex > 0) {
      currentPageIndex -= 1;
      renderLeaderboard();
    }
  };
  document.getElementById("next").onclick = () => {
    const totalPagesInner = Math.ceil(totalPlayers / pageSizeValue);
    if (currentPageIndex < totalPagesInner - 1) {
      currentPageIndex += 1;
      renderLeaderboard();
    }
  };
  document.getElementById("last").onclick = () => {
    currentPageIndex = Math.ceil(totalPlayers / pageSizeValue) - 1;
    renderLeaderboard();
  };
}

function renderLeaderboard() {
  const startIndex = currentPageIndex * pageSizeValue;
  const endIndex = startIndex + pageSizeValue;
  const currentSlice = sortedLeaderboardRows.slice(startIndex, endIndex);
  renderLeaderboardTable(currentSlice);
  renderPagerControls();
}

async function loadLeaderboardData(isReload) {
  const statusElement = document.getElementById("status");
  statusElement.textContent = isReload ? "Refreshing…" : "Loading…";
  const { count, error } = await supabaseClient
    .from("view_leaderboard")
    .select("steam_id", { count: "exact", head: false })
    .range(0, 0);
  if (error) {
    console.error(error);
    statusElement.textContent = "Error";
    return;
  }
  totalPlayers = count || 0;
  const fetchStep = 1000;
  const fetchPages = Math.ceil(totalPlayers / fetchStep);
  const rows = [];
  for (let i = 0; i < fetchPages; i += 1) {
    const fromIndex = i * fetchStep;
    const toIndex = fromIndex + fetchStep - 1;
    const { data, error: fetchError } = await supabaseClient
      .from("view_leaderboard")
      .select("steam_id,username,rank,elo,rp,games,wins,win_rate")
      .range(fromIndex, toIndex);
    if (fetchError) {
      console.error(fetchError);
      continue;
    }
    rows.push(...(data || []));
    const loadedCount = Math.min(toIndex + 1, totalPlayers);
    statusElement.textContent = `Loaded ${loadedCount}/${totalPlayers}`;
  }
  leaderboardRows = rows;
  sortedLeaderboardRows = applySortToLeaderboardRows([...leaderboardRows]);
  currentPageIndex = 0;
  statusElement.textContent = `Ready · ${totalPlayers} players`;
  renderLeaderboard();
}

async function loadRecentMatches() {
  const { data, error } = await supabaseClient
    .from("matches")
    .select("id, played_at, p1_name, p2_name, winner, map_id, replay_url")
    .order("played_at", { ascending: false })
    .limit(20);
  if (error) {
    console.error(error);
    return;
  }
  const recentContainer = document.getElementById("recent");
  recentContainer.innerHTML = "";
  for (const matchRow of data || []) {
    const winnerName = matchRow.winner === "1"
      ? matchRow.p1_name || "P1"
      : matchRow.winner === "2"
        ? matchRow.p2_name || "P2"
        : "—";
    const playedAtDate = new Date(matchRow.played_at);
    const matchHtml = `<a href="match.html?id=${matchRow.id}" class="block p-3 rounded border border-slate-800 hover:border-indigo-500">
      <div class="text-slate-300 text-sm">${playedAtDate.toLocaleString()}</div>
      <div class="font-semibold">${escapeHtml(matchRow.p1_name || "P1")} vs ${escapeHtml(matchRow.p2_name || "P2")}</div>
      <div class="text-slate-400 text-sm">Winner: <span class="text-slate-100">${escapeHtml(winnerName)}</span> · Map ${matchRow.map_id ?? "-"}</div>
    </a>`;
    recentContainer.innerHTML += matchHtml;
  }
}

function initializeLeaderboardPageBindings() {
  const searchButton = document.getElementById("go");
  const searchInput = document.getElementById("search");
  const pageSizeSelect = document.getElementById("pageSize");
  const refreshButton = document.getElementById("refresh");

  searchButton.onclick = () => {
    const queryValue = searchInput.value.trim();
    if (!queryValue) {
      return;
    }
    window.location.href = `player.html?q=${encodeURIComponent(queryValue)}`;
  };

  pageSizeSelect.onchange = event => {
    const value = parseInt(event.target.value, 10) || 1000;
    pageSizeValue = value;
    currentPageIndex = 0;
    renderLeaderboard();
  };

  refreshButton.onclick = () => {
    loadLeaderboardData(true);
  };

  supabaseClient
    .channel("realtime:players")
    .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => {
      const buttonElement = document.getElementById("refresh");
      buttonElement.classList.remove("hidden");
      buttonElement.textContent = "Refresh data";
    })
    .subscribe();
}

function initializeLeaderboardPage() {
  initializeLeaderboardPageBindings();
  loadLeaderboardData(false);
  loadRecentMatches();
  initializePremiumMarkers().then(() => {
    renderLeaderboard();
  });
}

document.addEventListener("DOMContentLoaded", initializeLeaderboardPage);
