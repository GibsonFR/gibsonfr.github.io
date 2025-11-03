const matchesService = (function() {
  async function loadRecentMatches() {
    const result = await supabaseClient
      .from("matches")
      .select("id, played_at, p1_name, p2_name, winner, map_id, replay_url")
      .order("played_at", { ascending: false })
      .limit(20);
    const data = result.data;
    const error = result.error;
    if (error) {
      console.error("recent matches error", error);
      return;
    }
    const container = document.getElementById("recentMatchesContainer");
    container.innerHTML = "";
    (data || []).forEach(function(match) {
      const winnerName =
        match.winner === "1"
          ? match.p1_name || "P1"
          : match.winner === "2"
          ? match.p2_name || "P2"
          : "—";
      const playedAt = match.played_at ? new Date(match.played_at).toLocaleString() : "";
      const cardHtml = `
      <a
        href="match.html?id=${match.id}"
        class="block p-3 rounded border border-slate-800 hover:border-indigo-500"
      >
        <div class="text-slate-300 text-sm">
          ${escapeHtml(playedAt)}
        </div>
        <div class="font-semibold">
          ${escapeHtml(match.p1_name || "P1")} vs ${escapeHtml(match.p2_name || "P2")}
        </div>
        <div class="text-slate-400 text-sm">
          Winner:
          <span class="text-slate-100">${escapeHtml(winnerName)}</span>
          · Map ${match.map_id != null ? match.map_id : "-"}
        </div>
      </a>
    `;
      container.insertAdjacentHTML("beforeend", cardHtml);
    });
  }

  return {
    loadRecentMatches
  };
})();

window.matchesService = matchesService;
