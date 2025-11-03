const leaderboardService = (function() {
  let currentPageSize = 1000;
  let currentPageIndex = 0;
  let totalPlayerCount = 0;
  let leaderboardRows = [];
  let sortedLeaderboardRows = [];
  const currentSortConfig = {
    key: "rank",
    direction: "desc"
  };

  function getTierOrder(rankLabel) {
    const normalized = (rankLabel || "").toLowerCase();
    if (normalized.startsWith("chall")) return 9;
    if (normalized.startsWith("gm") || normalized.startsWith("grand")) return 8;
    if (normalized.startsWith("master")) return 7;
    if (normalized.startsWith("diamond")) return 6;
    if (normalized.startsWith("platinum")) return 5;
    if (normalized.startsWith("gold")) return 4;
    if (normalized.startsWith("silver")) return 3;
    if (normalized.startsWith("bronze")) return 2;
    if (normalized.startsWith("clown")) return 1;
    return 0;
  }

  function getDivisionFromRank(rankLabel) {
    const tokens = (rankLabel || "").trim().split(/\s+/);
    const lastToken = tokens.length > 0 ? tokens[tokens.length - 1].toUpperCase() : "";
    const mapping = { I: 1, II: 2, III: 3, IV: 4 };
    return mapping[lastToken] || 4;
  }

  function createHeaderCellHtml(label, sortKey) {
    const isCurrent = currentSortConfig.key === sortKey;
    const arrow = isCurrent ? (currentSortConfig.direction === "asc" ? " ▲" : " ▼") : "";
    return `
    <th
      class="p-2 text-left select-none cursor-pointer"
      data-sort-key="${sortKey}"
    >
      ${label}${arrow}
    </th>
  `;
  }

  function applySorting(rows) {
    const key = currentSortConfig.key;
    const direction = currentSortConfig.direction;
    function getSafeNumber(value) {
      return value === null || value === undefined ? -Infinity : value;
    }
    function comparator(a, b) {
      if (key === "rank") {
        const tierDiff = getTierOrder(b.rank) - getTierOrder(a.rank);
        if (tierDiff !== 0) return tierDiff;
        const divisionDiff = getDivisionFromRank(a.rank) - getDivisionFromRank(b.rank);
        if (divisionDiff !== 0) return divisionDiff;
        const rpDiff = (b.rp || 0) - (a.rp || 0);
        if (rpDiff !== 0) return rpDiff;
        return (b.elo || 0) - (a.elo || 0);
      }
      if (key === "player") {
        const aName = a.username || "";
        const bName = b.username || "";
        return aName.localeCompare(bName, undefined, { sensitivity: "base" });
      }
      if (key === "rp") return getSafeNumber(b.rp) - getSafeNumber(a.rp);
      if (key === "elo") return getSafeNumber(b.elo) - getSafeNumber(a.elo);
      if (key === "games") return getSafeNumber(b.games) - getSafeNumber(a.games);
      if (key === "wr") return getSafeNumber(b.win_rate) - getSafeNumber(a.win_rate);
      return 0;
    }
    rows.sort(comparator);
    if (direction === "asc") {
      rows.reverse();
    }
    rows.forEach(function(row, index) {
      row.__position = index + 1;
    });
    return rows;
  }

  function getPlayerNameHtml(row) {
    const premiumAvailable = window.premiumService && typeof window.premiumService.getPremiumPlayerNameHtml === "function";
    if (premiumAvailable) {
      return window.premiumService.getPremiumPlayerNameHtml(row);
    }
    const username = escapeHtml(row.username || row.steam_id);
    const steamId = String(row.steam_id);
    return `
    <a
      class="text-indigo-400 hover:underline"
      href="player.html?steam_id=${encodeURIComponent(steamId)}"
    >
      ${username}
    </a>
  `;
  }

  function renderLeaderboardTable(visibleRows) {
    const tableHeadHtml = `
    <thead class="bg-slate-900">
      <tr>
        ${createHeaderCellHtml("#", "rank")}
        ${createHeaderCellHtml("Player", "player")}
        ${createHeaderCellHtml("Rank", "rank")}
        ${createHeaderCellHtml("RP", "rp")}
        ${createHeaderCellHtml("Elo", "elo")}
        ${createHeaderCellHtml("Games", "games")}
        ${createHeaderCellHtml("Win%", "wr")}
      </tr>
    </thead>
  `;
    const tableBodyHtml = visibleRows
      .map(function(row) {
        return `
      <tr class="border-t border-slate-800 hover:bg-slate-900">
        <td class="p-2">${row.__position}</td>
        <td class="p-2">${getPlayerNameHtml(row)}</td>
        <td class="p-2 text-center">${escapeHtml(row.rank || "")}</td>
        <td class="p-2 text-center">${row.rp != null ? row.rp : ""}</td>
        <td class="p-2 text-center">${row.elo != null ? row.elo : ""}</td>
        <td class="p-2 text-center">${row.games != null ? row.games : 0}</td>
        <td class="p-2 text-center">${row.win_rate != null ? row.win_rate : 0}</td>
      </tr>
    `;
      })
      .join("");
    const leaderboardContainer = document.getElementById("leaderboardContainer");
    leaderboardContainer.innerHTML = `
    <table class="w-full text-sm">
      ${tableHeadHtml}
      <tbody>${tableBodyHtml}</tbody>
    </table>
  `;
    document.querySelectorAll("[data-sort-key]").forEach(function(headerCell) {
      headerCell.onclick = function() {
        const sortKey = headerCell.getAttribute("data-sort-key");
        if (currentSortConfig.key === sortKey) {
          currentSortConfig.direction = currentSortConfig.direction === "asc" ? "desc" : "asc";
        } else {
          currentSortConfig.key = sortKey;
          currentSortConfig.direction = sortKey === "player" ? "asc" : "desc";
        }
        sortedLeaderboardRows = applySorting(leaderboardRows.slice());
        currentPageIndex = 0;
        renderLeaderboard();
      };
    });
  }

  function renderPaginationControls() {
    const totalPages = Math.max(1, Math.ceil(totalPlayerCount / currentPageSize));
    const pagerContainer = document.getElementById("pagerContainer");
    pagerContainer.innerHTML = `
    <button
      id="pagerFirst"
      class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex <= 0 ? "opacity-50" : ""}"
    >
      « First
    </button>
    <button
      id="pagerPrev"
      class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex <= 0 ? "opacity-50" : ""}"
    >
      ‹ Prev
    </button>
    <span class="text-slate-300">
      Page <b>${currentPageIndex + 1}</b> / ${totalPages}
      · Total <b>${totalPlayerCount}</b>
    </span>
    <button
      id="pagerNext"
      class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex >= totalPages - 1 ? "opacity-50" : ""}"
    >
      Next ›
    </button>
    <button
      id="pagerLast"
      class="px-2 py-1 rounded bg-slate-800 border border-slate-700 ${currentPageIndex >= totalPages - 1 ? "opacity-50" : ""}"
    >
      Last »
    </button>
  `;
    document.getElementById("pagerFirst").onclick = function() {
      currentPageIndex = 0;
      renderLeaderboard();
    };
    document.getElementById("pagerPrev").onclick = function() {
      if (currentPageIndex > 0) {
        currentPageIndex -= 1;
        renderLeaderboard();
      }
    };
    document.getElementById("pagerNext").onclick = function() {
      const totalPagesInner = Math.ceil(totalPlayerCount / currentPageSize);
      if (currentPageIndex < totalPagesInner - 1) {
        currentPageIndex += 1;
        renderLeaderboard();
      }
    };
    document.getElementById("pagerLast").onclick = function() {
      currentPageIndex = Math.ceil(totalPlayerCount / currentPageSize) - 1;
      renderLeaderboard();
    };
  }

  function renderLeaderboard() {
    const startIndex = currentPageIndex * currentPageSize;
    const endIndex = startIndex + currentPageSize;
    const visibleRows = sortedLeaderboardRows.slice(startIndex, endIndex);
    renderLeaderboardTable(visibleRows);
    renderPaginationControls();
  }

  async function loadLeaderboardData(isManualRefresh) {
    const statusBadge = document.getElementById("statusBadge");
    statusBadge.textContent = isManualRefresh ? "Refreshing…" : "Loading…";
    const countResult = await supabaseClient
      .from("view_leaderboard")
      .select("steam_id", { count: "exact", head: false })
      .range(0, 0);
    const count = countResult.count;
    const countError = countResult.error;
    if (countError) {
      console.error("leaderboard count error", countError);
      statusBadge.textContent = "Error";
      return;
    }
    totalPlayerCount = count || 0;
    const fetchPageSize = 1000;
    const totalPages = Math.ceil(totalPlayerCount / fetchPageSize);
    const rows = [];
    for (let pageIndex = 0; pageIndex < totalPages; pageIndex += 1) {
      const from = pageIndex * fetchPageSize;
      const to = from + fetchPageSize - 1;
      const pageResult = await supabaseClient
        .from("view_leaderboard")
        .select("steam_id, username, rank, elo, rp, games, wins, win_rate")
        .range(from, to);
      const data = pageResult.data;
      const error = pageResult.error;
      if (error) {
        console.error("leaderboard data error", error);
        continue;
      }
      rows.push.apply(rows, data || []);
      const loadedCount = Math.min(to + 1, totalPlayerCount);
      statusBadge.textContent = "Loaded " + loadedCount + "/" + totalPlayerCount;
    }
    leaderboardRows = rows;
    sortedLeaderboardRows = applySorting(leaderboardRows.slice());
    currentPageIndex = 0;
    statusBadge.textContent = "Ready · " + totalPlayerCount + " players";
    renderLeaderboard();
  }

  function bindLeaderboardEvents() {
    const searchInput = document.getElementById("searchInput");
    const searchButton = document.getElementById("searchButton");
    const pageSizeSelect = document.getElementById("pageSizeSelect");
    const refreshButton = document.getElementById("refreshLeaderboardButton");
    searchButton.onclick = function() {
      const query = searchInput.value.trim();
      if (!query) return;
      window.location.href = "player.html?q=" + encodeURIComponent(query);
    };
    searchInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") {
        searchButton.click();
      }
    });
    pageSizeSelect.onchange = function(event) {
      const value = parseInt(event.target.value, 10);
      currentPageSize = value || 1000;
      currentPageIndex = 0;
      renderLeaderboard();
    };
    refreshButton.onclick = function() {
      loadLeaderboardData(true);
    };
    supabaseClient
      .channel("realtime:players")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "players" },
        function() {
          refreshButton.classList.remove("hidden");
          refreshButton.textContent = "Refresh data";
        }
      )
      .subscribe();
  }

  async function initializeLeaderboardPage() {
    bindLeaderboardEvents();
    await loadLeaderboardData(false);
  }

  return {
    initializeLeaderboardPage,
    reload: loadLeaderboardData
  };
})();

window.leaderboardService = leaderboardService;
