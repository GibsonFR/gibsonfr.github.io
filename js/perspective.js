const SUPABASE_URL = "https://yykwhpeczfapkileuxtb.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl5a3docGVjemZhcGtpbGV1eHRiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIwMjM4NzUsImV4cCI6MjA3NzU5OTg3NX0.Sz2G1DG0CVYC9WSuYSODnH9k0_ybVluZAtRGBwb55wo";
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const url = new URL(location.href);
const steamId = url.searchParams.get("steam_id");
const WINDOW_ALL = 0;

const MAP_NAMES = { 35: "Mini Monke", 36: "Small Beach", 38: "Small Containers", 39: "Tiny Town 2", 40: "Tiny Town" };
const prettyMap = id => (MAP_NAMES[id] ? `${id} — ${MAP_NAMES[id]}` : `Map ${id}`);

const escapeHtml = value => (value || "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character]));
const formatPercent = value => (value == null || Number.isNaN(value) ? "—" : `${Math.round(value * 1000) / 10}%`);
const formatNumber = (value, digits = 1) => (value == null || Number.isNaN(value) ? "—" : Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits));
const formatSeconds = value => (value == null || Number.isNaN(value) ? "—" : `${formatNumber(value, 1)}s`);

function getMedian(values) {
  const sorted = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const middle = sorted.length / 2;
  if (sorted.length % 2) {
    return sorted[middle | 0];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function getQuantile(values, quantileValue) {
  const sorted = (values || []).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) {
    return null;
  }
  const position = (sorted.length - 1) * quantileValue;
  const lowerIndex = Math.floor(position);
  const upperIndex = Math.ceil(position);
  if (lowerIndex === upperIndex) {
    return sorted[lowerIndex];
  }
  return sorted[lowerIndex] + (sorted[upperIndex] - sorted[lowerIndex]) * (position - lowerIndex);
}

function getP90(values) {
  return getQuantile(values, 0.9);
}

function getP10(values) {
  return getQuantile(values, 0.1);
}

function getSum(values) {
  return (values || []).reduce((total, current) => total + (Number.isFinite(current) ? current : 0), 0);
}

function getAverage(values) {
  const filtered = (values || []).filter(Number.isFinite);
  if (!filtered.length) {
    return null;
  }
  return getSum(filtered) / filtered.length;
}

function getStandardDeviation(values) {
  const filtered = (values || []).filter(Number.isFinite);
  if (!filtered.length) {
    return null;
  }
  const meanValue = getAverage(filtered);
  return Math.sqrt(getAverage(filtered.map(element => (element - meanValue) * (element - meanValue))));
}

function getLastValues(values, count) {
  return (values || []).slice(Math.max(0, values.length - count));
}

function clampUnit(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function buildSparkline(values, width = 240, height = 48) {
  const filteredValues = (values || []).filter(Number.isFinite);
  if (!filteredValues.length) {
    return `<svg width="${width}" height="${height}"></svg>`;
  }
  const minimum = Math.min(...filteredValues);
  const maximum = Math.max(...filteredValues);
  const normalize = value => (maximum === minimum ? 0.5 : (value - minimum) / (maximum - minimum));
  const points = filteredValues.map((value, index) => [
    (index * (width - 6)) / Math.max(1, filteredValues.length - 1) + 3,
    height - 6 - normalize(value) * (height - 12) + 3
  ]);
  const path = `M ${points.map(point => point.join(" ")).join(" L ")}`;
  return `<svg width="${width}" height="${height}" class="text-amber-300"><path d="${path}" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
}

function buildBar(shareValue, title) {
  const widthPercent = `${(clampUnit(shareValue) * 100).toFixed(1)}%`;
  const safeTitle = title ? escapeHtml(title) : "";
  return `<div class="w-full h-2 rounded bg-slate-800/80 overflow-hidden" title="${safeTitle}">
    <div class="bar h-2 rounded bg-gradient-to-r from-amber-400 to-amber-200" style="width:${widthPercent}"></div>
  </div>`;
}

const intersectionObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add("show", "pulse-once");
      intersectionObserver.unobserve(entry.target);
      entry.target.querySelectorAll("[data-count-to]").forEach(counterElement => {
        animateCounter(counterElement, Number(counterElement.dataset.countTo || 0), counterElement.dataset.suffix || "");
      });
      entry.target.querySelectorAll(".bar").forEach(barElement => {
        const finalWidth = barElement.style.width;
        barElement.style.width = "0%";
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            barElement.style.width = finalWidth;
          });
        });
      });
    }
  });
}, { threshold: 0.2 });

function mountRevealAnimations(scopeElement) {
  (scopeElement || document).querySelectorAll(".reveal").forEach(element => {
    intersectionObserver.observe(element);
  });
}

function animateCounter(element, targetValue, suffix) {
  if (!Number.isFinite(targetValue)) {
    element.textContent = "—";
    return;
  }
  const durationMs = 700;
  const startTime = performance.now();
  const startValue = 0;
  const endValue = Number(targetValue);

  function step(timestamp) {
    const progress = Math.min(1, (timestamp - startTime) / durationMs);
    const interpolatedValue = Math.round((startValue + (endValue - startValue) * progress) * 10) / 10;
    if (suffix === "%") {
      element.textContent = `${Math.round(interpolatedValue * 10) / 10}${suffix}`;
    } else {
      element.textContent = `${interpolatedValue}${suffix}`;
    }
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

const premiumCrownSvg = `<span title="Premium member" aria-label="Premium member">
  <svg class="inline-block ml-1 h-4 w-4 align-[-1px] text-amber-300" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M5 19h14a1 1 0 0 0 1-1v-7.5l-3.8 2.85a1 1 0 0 1-1.52-.47L12 5.6l-2.68 7.28a1 1 0 0 1-1.52.47L4 10.5V18a1 1 0 0 0 1 1Zm-3 2a1 1 0 1 0 0 2h20a1 1 0 1 0 0-2H2Z"/>
  </svg>
</span>`;

function getPremiumLabelHtml(steamIdValue, displayValue, isPremium) {
  const baseLabel = escapeHtml(displayValue || steamIdValue || "Player");
  if (isPremium) {
    return `<span class="text-amber-300" title="Premium member">${baseLabel}</span>${premiumCrownSvg}`;
  }
  return baseLabel;
}

async function isPremiumSteamId(steamIdValue) {
  try {
    const nowIsoString = new Date().toISOString();
    const { data } = await supabaseClient
      .from("profiles")
      .select("steam_id")
      .eq("steam_id", steamIdValue)
      .gt("premium_until", nowIsoString)
      .maybeSingle();
    return !!data;
  } catch {
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
    const { data } = await supabaseClient
      .from("profiles")
      .select("steam_id")
      .in("steam_id", steamIds)
      .gt("premium_until", nowIsoString);
    (data || []).forEach(row => {
      if (row.steam_id) {
        premiumSet.add(String(row.steam_id));
      }
    });
    return premiumSet;
  } catch {
    return premiumSet;
  }
}

async function getCurrentUser() {
  const { data: { user } } = await supabaseClient.auth.getUser();
  return user || null;
}

async function isUserPremium(user) {
  try {
    const { data } = await supabaseClient
      .from("profiles")
      .select("premium_until")
      .eq("id", user.id)
      .maybeSingle();
    return !!(data && data.premium_until && new Date(data.premium_until) > new Date());
  } catch {
    return false;
  }
}

async function updateGateBannerUi() {
  const gateBannerElement = document.getElementById("gateBanner");
  const refreshButton = document.getElementById("refreshBtn");
  const queueButton = document.getElementById("queueBtn");
  const compareButton = document.getElementById("cmpBtn");
  const user = await getCurrentUser();
  if (!user) {
    gateBannerElement.classList.remove("hidden");
    gateBannerElement.innerHTML = `<div class="flex items-start gap-3">
      <div class="text-amber-300">🔒</div>
      <div>
        <div class="font-semibold mb-1">Sign in required</div>
        <div class="text-slate-300 text-sm">Perspective is a <b>Premium</b> feature. Please sign in with Discord to continue.</div>
        <div class="mt-2"><button id="signinBtn" class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm">Sign in with Discord</button></div>
      </div>
    </div>`;
    refreshButton.disabled = true;
    queueButton.disabled = true;
    compareButton.disabled = true;
    document.getElementById("signinBtn").onclick = () => {
      supabaseClient.auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo: location.href }
      });
    };
    return { user: null, premium: false };
  }
  const isPremiumUser = await isUserPremium(user);
  if (!isPremiumUser) {
    gateBannerElement.classList.remove("hidden");
    gateBannerElement.innerHTML = `<div class="flex items-start gap-3">
      <div class="text-amber-300">👑</div>
      <div>
        <div class="font-semibold mb-1">Premium only</div>
        <div class="text-slate-300 text-sm">Perspective is available for <b>Premium members</b> only. Upgrade to unlock unlimited analyses and Perspective.</div>
        <div class="mt-2 flex items-center gap-2">
          <a href="account.html" class="px-3 py-1.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 text-sm">Go Premium (€2)</a>
        </div>
      </div>
    </div>`;
    refreshButton.disabled = true;
    queueButton.disabled = true;
    compareButton.disabled = true;
    return { user, premium: false };
  }
  gateBannerElement.classList.add("hidden");
  refreshButton.disabled = false;
  queueButton.disabled = false;
  compareButton.disabled = false;
  return { user, premium: true };
}

async function fetchPlayerRow() {
  const { data } = await supabaseClient
    .from("players")
    .select("*")
    .eq("steam_id", steamId)
    .maybeSingle();
  return data || null;
}

async function fetchMatchesForPlayer(steamIdValue, limit) {
  const { data, error } = await supabaseClient
    .from("matches")
    .select("id, played_at, map_id, winner, p1_id, p2_id, p1_name, p2_name, p1_elo_before, p1_elo_after, p2_elo_before, p2_elo_after")
    .or(`p1_id.eq.${steamIdValue},p2_id.eq.${steamIdValue}`)
    .order("played_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.warn("matches error", error);
    return [];
  }
  return data || [];
}

async function fetchAnalysesForMatchIds(matchIds) {
  if (!matchIds.length) {
    return new Map();
  }
  const { data, error } = await supabaseClient
    .from("match_analyses")
    .select("match_id, p1_quality, p2_quality, p1_stats, p2_stats, analyzed_at")
    .in("match_id", matchIds);
  if (error) {
    console.warn("analyses error", error);
    return new Map();
  }
  const map = new Map();
  (data || []).forEach(row => {
    map.set(row.match_id, row);
  });
  return map;
}

function groupSessions(sortedMatches, gapMs) {
  const sessions = [];
  let currentSession = [];
  let lastTime = null;
  for (const matchRow of sortedMatches) {
    const timeValue = new Date(matchRow.played_at).getTime();
    if (lastTime != null && timeValue - lastTime > gapMs) {
      if (currentSession.length) {
        sessions.push(currentSession);
      }
      currentSession = [];
    }
    currentSession.push(matchRow);
    lastTime = timeValue;
  }
  if (currentSession.length) {
    sessions.push(currentSession);
  }
  return sessions;
}

function getDaypartsBuckets(matches, playerSteamId) {
  const parts = [
    { key: "Night", range: "0–5", hours: [0, 1, 2, 3, 4, 5], matches: 0, wins: 0 },
    { key: "Morning", range: "6–11", hours: [6, 7, 8, 9, 10, 11], matches: 0, wins: 0 },
    { key: "Afternoon", range: "12–17", hours: [12, 13, 14, 15, 16, 17], matches: 0, wins: 0 },
    { key: "Evening", range: "18–23", hours: [18, 19, 20, 21, 22, 23], matches: 0, wins: 0 }
  ];
  const indexByHour = new Map();
  parts.forEach((part, index) => {
    part.hours.forEach(hour => {
      indexByHour.set(hour, index);
    });
  });
  for (const matchRow of matches) {
    const isPlayerP1 = String(matchRow.p1_id) === String(playerSteamId);
    const playerSide = isPlayerP1 ? "p1" : "p2";
    let isWin = null;
    if (matchRow.winner === 1 || matchRow.winner === "1") {
      isWin = playerSide === "p1";
    } else if (matchRow.winner === 2 || matchRow.winner === "2") {
      isWin = playerSide === "p2";
    }
    const hour = new Date(matchRow.played_at).getHours();
    const partIndex = indexByHour.get(hour);
    if (partIndex == null) {
      continue;
    }
    parts[partIndex].matches += 1;
    if (isWin) {
      parts[partIndex].wins += 1;
    }
  }
  return parts.map(part => ({
    key: part.key,
    range: part.range,
    matches: part.matches,
    winrate: part.matches ? part.wins / part.matches : null
  }));
}

function aggregateMetrics(playerSteamId, matches, analyses, mapId, eloBandSet) {
  let scopedMatches = mapId ? matches.filter(matchRow => String(matchRow.map_id) === String(mapId)) : matches.slice();
  if (eloBandSet && eloBandSet.size) {
    scopedMatches = scopedMatches.filter(matchRow => {
      const isPlayerP1 = String(matchRow.p1_id) === String(playerSteamId);
      const opponentElo = isPlayerP1
        ? matchRow.p2_elo_before ?? matchRow.p2_elo_after ?? null
        : matchRow.p1_elo_before ?? matchRow.p1_elo_after ?? null;
      if (!Number.isFinite(opponentElo)) {
        return false;
      }
      const band = Math.floor(Number(opponentElo) / 100) * 100;
      return eloBandSet.has(band);
    });
  }

  const eloSeries = [];
  const results = [];
  const qualityValues = [];
  const speeds = [];
  const distanceHider = [];
  const distanceTagger = [];
  const tagShareRaw = [];
  const tagShareFromSeconds = [];
  const tagSeconds = [];
  const hiderSeconds = [];
  const retagMedianValues = [];
  const retagAverageValues = [];
  const accuracyValues = [];
  const matchesByMap = new Map();
  const matchesByOpponent = new Map();

  for (const matchRow of scopedMatches) {
    const isPlayerP1 = String(matchRow.p1_id) === String(playerSteamId);
    const playerSide = isPlayerP1 ? "p1" : "p2";
    const opponentId = isPlayerP1 ? matchRow.p2_id : matchRow.p1_id;
    const opponentName = isPlayerP1 ? (matchRow.p2_name || matchRow.p2_id) : (matchRow.p1_name || matchRow.p1_id);
    let isWin = null;
    if (matchRow.winner === 1 || matchRow.winner === "1") {
      isWin = playerSide === "p1";
    } else if (matchRow.winner === 2 || matchRow.winner === "2") {
      isWin = playerSide === "p2";
    }
    if (isWin != null) {
      results.push(!!isWin);
    }
    const eloAfterMatch = isPlayerP1 ? (matchRow.p1_elo_after ?? matchRow.p1_elo_before) : (matchRow.p2_elo_after ?? matchRow.p2_elo_before);
    if (eloAfterMatch != null) {
      eloSeries.push(Number(eloAfterMatch));
    }
    const analysisRow = analyses.get(matchRow.id);
    if (analysisRow) {
      const qualityValue = isPlayerP1 ? analysisRow.p1_quality : analysisRow.p2_quality;
      if (Number.isFinite(qualityValue)) {
        qualityValues.push(Number(qualityValue));
      }
      const stats = isPlayerP1 ? (analysisRow.p1_stats || {}) : (analysisRow.p2_stats || {});
      if (Number.isFinite(stats.avg_speed_ms)) {
        speeds.push(Number(stats.avg_speed_ms));
      }
      if (Number.isFinite(stats.avg_distance_as_hider)) {
        distanceHider.push(Number(stats.avg_distance_as_hider));
      }
      if (Number.isFinite(stats.avg_distance_as_tagger)) {
        distanceTagger.push(Number(stats.avg_distance_as_tagger));
      }
      if (Number.isFinite(stats.time_as_tagger_share)) {
        tagShareRaw.push(Number(stats.time_as_tagger_share));
      }
      if (Number.isFinite(stats.seconds_as_tagger)) {
        tagSeconds.push(Number(stats.seconds_as_tagger));
      }
      if (Number.isFinite(stats.seconds_as_hider)) {
        hiderSeconds.push(Number(stats.seconds_as_hider));
      }
      if (Number.isFinite(stats.seconds_as_tagger) && Number.isFinite(stats.seconds_as_hider)) {
        const totalSeconds = Number(stats.seconds_as_tagger) + Number(stats.seconds_as_hider);
        if (totalSeconds > 0) {
          tagShareFromSeconds.push(Number(stats.seconds_as_tagger) / totalSeconds);
        }
      }
      if (Number.isFinite(stats.retag_median_seconds)) {
        retagMedianValues.push(Number(stats.retag_median_seconds));
      }
      if (Number.isFinite(stats.retag_avg_seconds)) {
        retagAverageValues.push(Number(stats.retag_avg_seconds));
      }
      if (Number.isFinite(stats.accuracy)) {
        accuracyValues.push(Number(stats.accuracy));
      }
    }

    const mapKey = String(matchRow.map_id);
    if (!matchesByMap.has(mapKey)) {
      matchesByMap.set(mapKey, {
        map_id: matchRow.map_id,
        matches: 0,
        wins: 0,
        qualityValues: [],
        speedValues: [],
        tagShares: [],
        retagMedian: [],
        distanceHider: [],
        distanceTagger: []
      });
    }
    const mapBucket = matchesByMap.get(mapKey);
    mapBucket.matches += 1;
    if (isWin) {
      mapBucket.wins += 1;
    }
    if (analysisRow) {
      const stats = isPlayerP1 ? (analysisRow.p1_stats || {}) : (analysisRow.p2_stats || {});
      const qualityValue = isPlayerP1 ? analysisRow.p1_quality : analysisRow.p2_quality;
      if (Number.isFinite(qualityValue)) {
        mapBucket.qualityValues.push(Number(qualityValue));
      }
      if (Number.isFinite(stats.avg_speed_ms)) {
        mapBucket.speedValues.push(Number(stats.avg_speed_ms));
      }
      let shareValue = null;
      if (Number.isFinite(stats.seconds_as_tagger) && Number.isFinite(stats.seconds_as_hider)) {
        const totalSeconds = Number(stats.seconds_as_tagger) + Number(stats.seconds_as_hider);
        if (totalSeconds > 0) {
          shareValue = Number(stats.seconds_as_tagger) / totalSeconds;
        }
      } else if (Number.isFinite(stats.time_as_tagger_share)) {
        shareValue = Number(stats.time_as_tagger_share);
      }
      if (shareValue != null) {
        mapBucket.tagShares.push(shareValue);
      }
      if (Number.isFinite(stats.retag_median_seconds)) {
        mapBucket.retagMedian.push(Number(stats.retag_median_seconds));
      }
      if (Number.isFinite(stats.avg_distance_as_hider)) {
        mapBucket.distanceHider.push(Number(stats.avg_distance_as_hider));
      }
      if (Number.isFinite(stats.avg_distance_as_tagger)) {
        mapBucket.distanceTagger.push(Number(stats.avg_distance_as_tagger));
      }
    }

    const opponentKey = String(opponentId || "unknown");
    if (!matchesByOpponent.has(opponentKey)) {
      matchesByOpponent.set(opponentKey, { id: opponentId, name: opponentName, matches: 0, wins: 0, qualityValues: [] });
    }
    const opponentBucket = matchesByOpponent.get(opponentKey);
    opponentBucket.matches += 1;
    if (isWin) {
      opponentBucket.wins += 1;
    }
    if (analysisRow) {
      const qualityValue = isPlayerP1 ? analysisRow.p1_quality : analysisRow.p2_quality;
      if (Number.isFinite(qualityValue)) {
        opponentBucket.qualityValues.push(Number(qualityValue));
      }
    }
  }

  const totalMatches = scopedMatches.length;
  const winCount = results.filter(Boolean).length;
  const winrate = totalMatches ? winCount / totalMatches : null;
  const tagShareValue = tagShareFromSeconds.length
    ? getAverage(tagShareFromSeconds)
    : tagShareRaw.length
      ? getAverage(tagShareRaw)
      : null;

  const qualityStats = {
    average: getAverage(qualityValues),
    median: getMedian(qualityValues),
    lower_quartile: getQuantile(qualityValues, 0.25),
    upper_quartile: getQuantile(qualityValues, 0.75),
    best_match: qualityValues.length ? Math.max(...qualityValues) : null,
    worst_match: qualityValues.length ? Math.min(...qualityValues) : null,
    spread_std: getStandardDeviation(qualityValues),
    spread_iqr: getQuantile(qualityValues, 0.75) != null && getQuantile(qualityValues, 0.25) != null
      ? getQuantile(qualityValues, 0.75) - getQuantile(qualityValues, 0.25)
      : null
  };

  const taggingStats = {
    share_as_tagger: tagShareValue,
    time_as_tagger_average: getAverage(tagSeconds),
    time_as_tagger_median: getMedian(tagSeconds),
    time_as_hider_average: getAverage(hiderSeconds),
    time_as_hider_median: getMedian(hiderSeconds)
  };

  const speedStats = {
    average_mps: getAverage(speeds),
    p90_mps: getP90(speeds),
    p10_mps: getP10(speeds)
  };

  const distanceStats = {
    average_hider_m: getAverage(distanceHider),
    average_tagger_m: getAverage(distanceTagger)
  };

  const retagStats = {
    median_seconds: getMedian(retagMedianValues),
    average_seconds: getAverage(retagAverageValues),
    p90_seconds: getP90(retagMedianValues)
  };

  const accuracyStats = {
    average: getAverage(accuracyValues)
  };

  const eloSeriesAll = eloSeries.slice();
  const recentResults = getLastValues(results, 20);

  let bestStreakValue = 0;
  let currentStreak = 0;
  for (const resultValue of results) {
    if (resultValue) {
      currentStreak += 1;
    } else {
      currentStreak = 0;
    }
    if (currentStreak > bestStreakValue) {
      bestStreakValue = currentStreak;
    }
  }

  const perMapMetrics = Array.from(matchesByMap.values())
    .map(mapBucket => ({
      map_id: mapBucket.map_id,
      matches: mapBucket.matches,
      winrate: mapBucket.matches ? mapBucket.wins / mapBucket.matches : null,
      average_quality: getAverage(mapBucket.qualityValues),
      average_speed_mps: getAverage(mapBucket.speedValues),
      share_as_tagger: getAverage(mapBucket.tagShares),
      retag_median_seconds: getAverage(mapBucket.retagMedian),
      average_hider_distance_m: getAverage(mapBucket.distanceHider),
      average_tagger_distance_m: getAverage(mapBucket.distanceTagger)
    }))
    .sort((a, b) => b.matches - a.matches);

  const perOpponentMetrics = Array.from(matchesByOpponent.values())
    .map(opponentBucket => ({
      id: opponentBucket.id,
      name: opponentBucket.name,
      matches: opponentBucket.matches,
      winrate: opponentBucket.matches ? opponentBucket.wins / opponentBucket.matches : null,
      average_quality: getAverage(opponentBucket.qualityValues)
    }))
    .sort((a, b) => b.matches - a.matches);

  const sessions = groupSessions(scopedMatches, 5 * 60 * 1000);
  const sessionStats = {
    sessions: sessions.length,
    avg_matches_per_session: sessions.length
      ? sessions.map(session => session.length).reduce((a, b) => a + b, 0) / sessions.length
      : null
  };
  const dayparts = getDaypartsBuckets(scopedMatches, playerSteamId);

  return {
    scopeCount: totalMatches,
    wins: winCount,
    winrate,
    quality: qualityStats,
    tagging: taggingStats,
    speed: speedStats,
    distance: distanceStats,
    retag: retagStats,
    accuracy: accuracyStats,
    eloSeries: eloSeriesAll,
    form: recentResults,
    bestStreak: bestStreakValue,
    maps: perMapMetrics,
    opponents: perOpponentMetrics,
    sessionStats,
    dayparts
  };
}

function buildChip(label, value, tip, suffix) {
  const finalSuffix = suffix || "";
  const isEmpty = value == null || value === "—";
  const displayedValue = isEmpty ? "—" : value;
  const dataValueAttributes = isEmpty ? "" : `data-count-to="${value}" data-suffix="${finalSuffix}"`;
  return `<div class="px-3 py-2 rounded-xl bg-slate-800/70 border border-slate-700 text-sm reveal">
    <span class="tip text-slate-400" data-tip="${escapeHtml(tip)}">${label}</span>
    <span class="ml-1 text-slate-100 font-semibold" ${dataValueAttributes}>${displayedValue}${finalSuffix}</span>
  </div>`;
}

function buildSection(title, bodyHtml) {
  return `<div class="mt-6 card reveal"><h3 class="text-xl font-semibold mb-3">${title}</h3>${bodyHtml}</div>`;
}

function buildOverviewChips(metrics) {
  return [
    buildChip("Matches played", metrics.scopeCount || 0, "Number of matches included in the current scope (All, or the selected map/Elo filter)."),
    buildChip("Wins", metrics.wins || 0, "Number of wins in the current scope."),
    buildChip(
      "Win rate",
      metrics.winrate != null ? Math.round(metrics.winrate * 1000) / 10 : "—",
      "Percentage of matches won.",
      "%"
    ),
    buildChip(
      "Average quality",
      metrics.quality.average != null ? Number(metrics.quality.average).toFixed(1) : "—",
      "Average game quality score for this player."
    ),
    buildChip(
      "Median quality",
      metrics.quality.median != null ? Number(metrics.quality.median).toFixed(1) : "—",
      "Middle value of the quality scores."
    ),
    buildChip(
      "Quality IQR",
      metrics.quality.spread_iqr != null ? Number(metrics.quality.spread_iqr).toFixed(1) : "—",
      "Interquartile range (Q3−Q1): middle 50% spread. Smaller = more consistent."
    ),
    buildChip(
      "Quality standard deviation",
      metrics.quality.spread_std != null ? Number(metrics.quality.spread_std).toFixed(2) : "—",
      "Overall spread of quality scores."
    ),
    buildChip(
      "Best match quality",
      metrics.quality.best_match != null ? Number(metrics.quality.best_match).toFixed(1) : "—",
      "Highest quality score observed."
    ),
    buildChip(
      "Worst match quality",
      metrics.quality.worst_match != null ? Number(metrics.quality.worst_match).toFixed(1) : "—",
      "Lowest quality score observed."
    ),
    buildChip(
      "Tag time share",
      metrics.tagging.share_as_tagger != null ? Math.round(metrics.tagging.share_as_tagger * 1000) / 10 : "—",
      "Share of total time spent as the tagger.",
      "%"
    ),
    buildChip(
      "Average time as tagger",
      metrics.tagging.time_as_tagger_average != null ? Number(metrics.tagging.time_as_tagger_average).toFixed(1) : "—",
      "Seconds per match as tagger.",
      "s"
    ),
    buildChip(
      "Average time as hider",
      metrics.tagging.time_as_hider_average != null ? Number(metrics.tagging.time_as_hider_average).toFixed(1) : "—",
      "Seconds per match as hider.",
      "s"
    ),
    buildChip(
      "Average speed",
      metrics.speed.average_mps != null ? Number(metrics.speed.average_mps).toFixed(2) : "—",
      "Movement speed (m/s).",
      " m/s"
    ),
    buildChip(
      "90th percentile speed",
      metrics.speed.p90_mps != null ? Number(metrics.speed.p90_mps).toFixed(2) : "—",
      "Top-burst speed (m/s).",
      " m/s"
    ),
    buildChip(
      "Average hider distance",
      metrics.distance.average_hider_m != null ? Number(metrics.distance.average_hider_m).toFixed(2) : "—",
      "Distance as hider (m).",
      " m"
    ),
    buildChip(
      "Average tagger distance",
      metrics.distance.average_tagger_m != null ? Number(metrics.distance.average_tagger_m).toFixed(2) : "—",
      "Distance as tagger (m).",
      " m"
    ),
    buildChip(
      "Retag median",
      metrics.retag.median_seconds != null ? Number(metrics.retag.median_seconds).toFixed(1) : "—",
      "Typical time between tags.",
      "s"
    ),
    buildChip(
      "Retag average",
      metrics.retag.average_seconds != null ? Number(metrics.retag.average_seconds).toFixed(1) : "—",
      "Average time between tags.",
      "s"
    ),
    buildChip(
      "Retag p90",
      metrics.retag.p90_seconds != null ? Number(metrics.retag.p90_seconds).toFixed(1) : "—",
      "Slow retag (90th percentile).",
      "s"
    ),
    buildChip(
      "Accuracy (average)",
      metrics.accuracy.average != null ? Math.round(metrics.accuracy.average * 1000) / 10 : "—",
      "Share of successful attempts.",
      "%"
    )
  ].join("");
}

function buildFormSection(metrics) {
  const dotsHtml = metrics.form
    .map(resultValue => `<span class="w-3 h-3 rounded-full ${resultValue ? "bg-emerald-400" : "bg-rose-400"} inline-block"></span>`)
    .join('<span class="w-1 inline-block"></span>');
  const finalDotsHtml = dotsHtml || '<span class="text-slate-500 text-sm">No recent games</span>';
  const contentHtml = `<div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="text-slate-300 tip" data-tip="Longest consecutive sequence of wins within the scope.">Best win streak: <b>${metrics.bestStreak || 0}</b></div>
      <div class="flex items-center gap-1" title="Most recent results (green = win, red = loss).">${finalDotsHtml}</div>
      <div class="ml-auto" title="Rating trend over time.">${buildSparkline(metrics.eloSeries)}</div>
    </div>`;
  return buildSection("Form & rating", contentHtml);
}

function buildTaggingSection(metrics) {
  const contentHtml = `<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Share of total time played as the tagger.">${formatPercent(metrics.tagging.share_as_tagger)}</div>
        ${buildBar(metrics.tagging.share_as_tagger || 0, "Tag time share")}
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Average number of seconds spent as the tagger each match.">Average time as tagger</div>
        <div class="text-slate-100 font-semibold">${formatSeconds(metrics.tagging.time_as_tagger_average)} <span class="text-slate-400">· median ${formatSeconds(metrics.tagging.time_as_tagger_median)}</span></div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Average number of seconds spent as the hider each match.">Average time as hider</div>
        <div class="text-slate-100 font-semibold">${formatSeconds(metrics.tagging.time_as_hider_average)} <span class="text-slate-400">· median ${formatSeconds(metrics.tagging.time_as_hider_median)}</span></div>
      </div>
    </div>`;
  return buildSection("Tagging profile", contentHtml);
}

function buildSpeedAndDistanceSection(metrics) {
  const contentHtml = `<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Average movement speed and 90th percentile (peak bursts).">Average speed / P90</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.speed.average_mps, 2)} m/s · ${formatNumber(metrics.speed.p90_mps, 2)} m/s</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Average distance traveled while playing as the hider.">Average hider distance</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.distance.average_hider_m, 2)} m</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Average distance traveled while playing as the tagger.">Average tagger distance</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.distance.average_tagger_m, 2)} m</div>
      </div>
    </div>`;
  return buildSection("Speed & distance", contentHtml);
}

function buildRetagAndAccuracySection(metrics) {
  const contentHtml = `<div class="grid grid-cols-1 md:grid-cols-3 gap-3">
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Typical time between consecutive tags.">Retag (median)</div>
        <div class="text-slate-100 font-semibold">${formatSeconds(metrics.retag.median_seconds)}</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Average and 90th percentile of retag time (lower is better).">Retag (average / P90)</div>
        <div class="text-slate-100 font-semibold">${formatSeconds(metrics.retag.average_seconds)} / ${formatSeconds(metrics.retag.p90_seconds)}</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Share of successful attempts; higher means better precision.">Accuracy (average)</div>
        <div class="text-slate-100 font-semibold">${metrics.accuracy.average != null ? formatPercent(metrics.accuracy.average) : "—"}</div>
      </div>
    </div>`;
  return buildSection("Retagging & accuracy", contentHtml);
}

function buildQualitySection(metrics) {
  const iqrWidth = metrics.quality.average != null && metrics.quality.upper_quartile != null && metrics.quality.lower_quartile != null
    ? (metrics.quality.average - metrics.quality.lower_quartile) / Math.max(0.001, metrics.quality.upper_quartile - metrics.quality.lower_quartile)
    : 0;
  const contentHtml = `<div class="grid grid-cols-1 md:grid-cols-4 gap-3">
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Average game quality score.">Average quality</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.quality.average, 1)}</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Median game quality score.">Median quality</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.quality.median, 1)}</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Interquartile range (Q3−Q1). Middle 50% spread. Smaller = more consistent.">Quality IQR</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.quality.spread_iqr, 1)}</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Standard deviation of quality scores.">Quality SD</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.quality.spread_std, 2)}</div>
      </div>
      <div class="md:col-span-2">
        <div class="text-slate-300 tip mb-1" data-tip="Average position inside the IQR band.">${formatNumber(metrics.quality.lower_quartile, 1)} to ${formatNumber(metrics.quality.upper_quartile, 1)} (IQR)</div>
        ${buildBar(iqrWidth, "Average inside the IQR band")}
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Best single-match quality in scope.">Best match quality</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.quality.best_match, 1)}</div>
      </div>
      <div>
        <div class="text-slate-300 tip mb-1" data-tip="Worst single-match quality in scope.">Worst match quality</div>
        <div class="text-slate-100 font-semibold">${formatNumber(metrics.quality.worst_match, 1)}</div>
      </div>
    </div>`;
  return buildSection("Quality & consistency", contentHtml);
}

function buildSessionsAndTimeSection(metrics) {
  const dayparts = metrics.dayparts || [];
  const encodedData = encodeURIComponent(JSON.stringify(dayparts));
  const defaultKey = dayparts.length
    ? dayparts.reduce((best, current) => (current.matches > best.matches ? current : best)).key
    : "Morning";
  const contentHtml = `<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
    <div>
      <div class="text-slate-400">Sessions (≤5 min gap)</div>
      <div class="text-lg font-semibold">${metrics.sessionStats.sessions || 0}</div>
      <div class="mt-2 text-slate-400">Avg matches per session</div>
      <div class="font-semibold">${formatNumber(metrics.sessionStats.avg_matches_per_session, 2)}</div>
    </div>
    <div class="md:col-span-2">
      <div class="flex items-center justify-between gap-2">
        <div class="text-slate-400">Win rate by daypart (local)</div>
        <div class="dp-tabs flex flex-wrap gap-2"></div>
      </div>
      <div class="dp-panel mt-3 p-4 rounded-xl border border-slate-800 bg-slate-900/40"></div>
      <div class="hidden" data-dp-scope data-dp-data="${encodedData}" data-dp-selected="${defaultKey}"></div>
    </div>
  </div>`;
  return buildSection("Playtime & sessions", contentHtml);
}

function mountDaypartTabs(scopeElement) {
  (scopeElement || document).querySelectorAll("[data-dp-scope]").forEach(container => {
    const rawData = container.getAttribute("data-dp-data") || "[]";
    const data = JSON.parse(decodeURIComponent(rawData));
    if (!data.length) {
      return;
    }
    let selectedKey = container.getAttribute("data-dp-selected") || data[0].key;
    const wrapElement = container.parentElement;
    const tabsElement = wrapElement.querySelector(".dp-tabs");
    const panelElement = wrapElement.querySelector(".dp-panel");

    function renderTabs() {
      tabsElement.innerHTML = data.map(part => `
        <button class="px-2 py-1.5 text-sm pill ${part.key === selectedKey ? "pill-active" : ""}" data-dp="${part.key}">
          ${part.key}<span class="ml-1 text-slate-400 text-xs">${part.range}</span>
        </button>`).join("");
    }

    function renderPanel() {
      const selectedPart = data.find(part => part.key === selectedKey) || data[0];
      const winrateText = selectedPart.winrate == null ? "—" : `${Math.round(selectedPart.winrate * 1000) / 10}%`;
      panelElement.innerHTML = `
        <div class="flex items-center justify_between gap-4 flex-wrap">
          <div>
            <div class="text-xs text-slate-400">${selectedPart.range} · ${selectedPart.matches || 0} matches</div>
            <div class="text-2xl font-extrabold tracking-tight mt-1">${winrateText}</div>
          </div>
          <div class="min-w-[180px] w-full sm:w-auto">${buildBar(selectedPart.winrate || 0, "Win rate")}</div>
        </div>`;
    }

    tabsElement.addEventListener("click", event => {
      const button = event.target.closest("[data-dp]");
      if (!button) {
        return;
      }
      selectedKey = button.getAttribute("data-dp");
      container.setAttribute("data-dp-selected", selectedKey);
      renderTabs();
      renderPanel();
    });

    renderTabs();
    renderPanel();
  });
}

function buildMapsSection(maps, currentMapFilter) {
  if (currentMapFilter != null) {
    return "";
  }
  if (!maps || !maps.length) {
    return buildSection("Per-map breakdown", '<div class="text-slate-400 text-sm">No data.</div>');
  }
  const topMaps = maps.slice(0, 12);
  const cardsHtml = topMaps.map(mapMetrics => `
    <div class="p-4 rounded-xl border border-slate-800 bg-slate-900/40">
      <div class="flex items-center justify-between">
        <div class="font-semibold">${prettyMap(mapMetrics.map_id)}</div>
      </div>
      <div class="mt-2 text-slate-400 text-sm">${mapMetrics.matches} matches</div>
      <div class="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div class="text-slate-400">Win rate</div>
          <div class="font-semibold">${mapMetrics.winrate != null ? `${Math.round(mapMetrics.winrate * 1000) / 10}%` : "—"}</div>
        </div>
        <div>
          <div class="text-slate-400">Avg quality</div>
          <div class="font-semibold">${formatNumber(mapMetrics.average_quality, 1)}</div>
        </div>
        <div>
          <div class="text-slate-400">Tag share</div>
          <div class="font-semibold">${mapMetrics.share_as_tagger != null ? `${Math.round(mapMetrics.share_as_tagger * 1000) / 10}%` : "—"}</div>
        </div>
        <div>
          <div class="text-slate-400">Avg speed</div>
          <div class="font-semibold">${formatNumber(mapMetrics.average_speed_mps, 2)} m/s</div>
        </div>
        <div class="col-span-2">
          <div class="text-slate-400">Retag median</div>
          <div class="font-semibold">${formatSeconds(mapMetrics.retag_median_seconds)}</div>
        </div>
      </div>
    </div>`).join("");
  return buildSection("Per-map breakdown", `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${cardsHtml}</div>`);
}

function buildOpponentsSection(opponents) {
  if (!opponents || !opponents.length) {
    return buildSection("Most faced opponents", '<div class="text-slate-400 text-sm">No data.</div>');
  }
  const headHtml = `
    <thead class="bg-slate-900/60 text-slate-300">
      <tr>
        <th class="py-2 pl-3 text-left font-medium">Opponent</th>
        <th class="py-2 text-right font-medium">Win rate</th>
        <th class="py-2 pr-3 text-right font-medium">Avg quality</th>
      </tr>
    </thead>`;
  const rowsHtml = opponents.slice(0, 50).map(opponentMetrics => {
    const name = opponentMetrics.name || opponentMetrics.id || "Unknown";
    const winrateText = opponentMetrics.winrate != null ? `${Math.round(opponentMetrics.winrate * 1000) / 10}%` : "—";
    const qualityText = formatNumber(opponentMetrics.average_quality, 1);
    return `<tr class="border-t border-slate-800">
      <td class="py-2 pl-3">
        <a class="text-indigo-400 hover:underline break-words" href="player.html?steam_id=${encodeURIComponent(opponentMetrics.id)}">${escapeHtml(name)}</a>
        <span class="text-slate-500 ml-1">${opponentMetrics.matches || 0} matches</span>
      </td>
      <td class="py-2 text-right">${winrateText}</td>
      <td class="py-2 pr-3 text-right">${qualityText}</td>
    </tr>`;
  }).join("");
  const tableHtml = `<div class="overflow-x-auto rounded border border-slate-800">
      <table class="min-w-full text-sm">${headHtml}<tbody>${rowsHtml}</tbody></table>
    </div>`;
  return buildSection("Most faced opponents", tableHtml);
}

function renderAllSections(contentElement, metrics, currentMapFilter) {
  contentElement.innerHTML = `
    <div id="chipGrid" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      ${buildOverviewChips(metrics)}
    </div>
    ${buildFormSection(metrics)}
    ${buildTaggingSection(metrics)}
    ${buildSpeedAndDistanceSection(metrics)}
    ${buildRetagAndAccuracySection(metrics)}
    ${buildQualitySection(metrics)}
    ${buildSessionsAndTimeSection(metrics)}
    ${buildMapsSection(metrics.maps, currentMapFilter)}
    ${buildOpponentsSection(metrics.opponents)}
  `;
  mountRevealAnimations(contentElement);
  mountDaypartTabs(contentElement);
}

async function loadPerspectiveRow(playerSteamId) {
  const { data } = await supabaseClient
    .from("player_perspectives")
    .select("*")
    .eq("player_id", playerSteamId)
    .eq("window_size", WINDOW_ALL)
    .maybeSingle();
  return data || null;
}

function renderLegacySummary(containerElement, perspectiveRow) {
  if (!perspectiveRow) {
    containerElement.innerHTML = "";
    return;
  }
  const summary = perspectiveRow.summary || {};
  containerElement.innerHTML = `
    <div class="mt-6 card">
      <div class="text-sm text-slate-300 mb-2">Worker summary</div>
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div>
          <div class="text-slate-400">Matches</div>
          <div class="font-semibold">${summary.matches ?? "—"}</div>
        </div>
        <div>
          <div class="text-slate-400">Wins</div>
          <div class="font-semibold">${summary.wins ?? "—"}</div>
        </div>
        <div>
          <div class="text-slate-400">Win rate</div>
          <div class="font-semibold">${summary.winrate != null ? `${Math.round(summary.winrate * 1000) / 10}%` : "—"}</div>
        </div>
        <div>
          <div class="text-slate-400">Avg quality</div>
          <div class="font-semibold">${summary.avg_quality != null ? Number(summary.avg_quality).toFixed(1) : "—"}</div>
        </div>
        <div>
          <div class="text-slate-400">Median quality</div>
          <div class="font-semibold">${summary.med_quality != null ? Number(summary.med_quality).toFixed(1) : "—"}</div>
        </div>
        <div>
          <div class="text-slate-400">Avg duration</div>
          <div class="font-semibold">${summary.avg_duration != null ? `${Number(summary.avg_duration).toFixed(1)}s` : "—"}</div>
        </div>
      </div>
    </div>`;
}

let jobChannel = null;

function subscribePerspectiveRealtime(playerSteamId, onReady) {
  if (jobChannel) {
    try {
      supabaseClient.removeChannel(jobChannel);
    } catch {
    }
    jobChannel = null;
  }
  jobChannel = supabaseClient
    .channel(`persp_live_${playerSteamId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "player_perspectives", filter: `player_id=eq.${playerSteamId}` }, payload => {
      onReady(payload.new);
    })
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "player_perspectives", filter: `player_id=eq.${playerSteamId}` }, payload => {
      onReady(payload.new);
    })
    .subscribe();
}

async function queuePerspectiveRequest(playerSteamId, requestedBy) {
  const { error } = await supabaseClient
    .from("perspective_requests")
    .insert({ player_id: playerSteamId, window_size: WINDOW_ALL, requested_by: requestedBy || "web" });
  if (error) {
    throw new Error(error.message || "Insert failed");
  }
}

async function waitForPerspective(playerSteamId, timeoutMs) {
  const startTime = Date.now();
  while (Date.now() - startTime < timeoutMs) {
    const row = await loadPerspectiveRow(playerSteamId);
    if (row) {
      return row;
    }
    await new Promise(resolve => {
      setTimeout(resolve, 1500);
    });
  }
  return null;
}

let matchesCache = [];
let analysesCache = new Map();
let currentMapFilter = null;
let currentEloBands = new Set();

function buildPill(isActive, label, attributeName, attributeValue) {
  const activeClass = isActive ? "pill-active" : "";
  return `<button ${attributeName}="${attributeValue}" class="px-3 py-1.5 pill ${activeClass}">${label}</button>`;
}

function renderScopeBar() {
  const scopeBarElement = document.getElementById("scopeBar");
  const presentMaps = [...new Set(matchesCache.map(matchRow => matchRow.map_id))].sort((a, b) => a - b);
  const buttonsHtml = [
    buildPill(currentMapFilter == null, "All", "data-map", ""),
    ...presentMaps.map(mapId => buildPill(currentMapFilter != null && String(currentMapFilter) === String(mapId), prettyMap(mapId), "data-map", mapId))
  ].join("");
  scopeBarElement.innerHTML = `<div class="flex flex-wrap items-center gap-2">${buttonsHtml}</div>`;
  scopeBarElement.classList.remove("hidden");
  scopeBarElement.querySelectorAll("[data-map]").forEach(buttonElement => {
    buttonElement.onclick = async () => {
      const value = buttonElement.getAttribute("data-map");
      currentMapFilter = value === "" ? null : value;
      await recomputeAndRender();
      renderScopeBar();
    };
  });
}

const ELO_BANDS = [800, 900, 1000, 1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800];

function inferAutoBand() {
  const eloSeriesForPlayer = matchesCache
    .map(matchRow => {
      const isPlayerP1 = String(matchRow.p1_id) === String(steamId);
      const selfAfter = isPlayerP1 ? (matchRow.p1_elo_after ?? matchRow.p1_elo_before) : (matchRow.p2_elo_after ?? matchRow.p2_elo_before);
      return Number(selfAfter);
    })
    .filter(Number.isFinite);
  if (!eloSeriesForPlayer.length) {
    return 1300;
  }
  const medianValue = getMedian(eloSeriesForPlayer);
  return Math.floor(medianValue / 100) * 100;
}

function renderFilterBar() {
  const filterBarElement = document.getElementById("filterBar");
  const autoBand = inferAutoBand();
  const bandButtonsHtml = ELO_BANDS.map(bandValue => {
    const isActive = currentEloBands.has(bandValue);
    const activeClass = isActive ? "pill-active" : "";
    return `<button data-band="${bandValue}" class="px-2 py-1 text-sm pill ${activeClass}">${bandValue}–${bandValue + 99}</button>`;
  }).join("");
  filterBarElement.innerHTML = `
    <div class="flex items_center gap-2 flex-wrap">
      <span class="text-slate-400 mr-1">Elo bands:</span>
      <button id="autoBand" class="px-2 py-1 text-sm pill">${autoBand}–${autoBand + 99} (auto)</button>
      <button id="clearBands" class="px-2 py-1 text-sm pill">All opponents</button>
      ${bandButtonsHtml}
    </div>`;
  filterBarElement.classList.remove("hidden");

  document.getElementById("autoBand").onclick = async () => {
    currentEloBands = new Set([inferAutoBand()]);
    await recomputeAndRender();
    renderFilterBar();
  };
  document.getElementById("clearBands").onclick = async () => {
    currentEloBands = new Set();
    await recomputeAndRender();
    renderFilterBar();
  };
  filterBarElement.querySelectorAll("[data-band]").forEach(buttonElement => {
    buttonElement.onclick = async () => {
      const bandValue = Number(buttonElement.getAttribute("data-band"));
      if (currentEloBands.has(bandValue)) {
        currentEloBands.delete(bandValue);
      } else {
        currentEloBands.add(bandValue);
      }
      await recomputeAndRender();
      renderFilterBar();
    };
  });
}

async function buildMetrics() {
  return aggregateMetrics(steamId, matchesCache, analysesCache, currentMapFilter, currentEloBands);
}

async function recomputeAndRender() {
  const contentElement = document.getElementById("content");
  const statusElement = document.getElementById("status");
  statusElement.textContent = "Computing…";
  const metrics = await buildMetrics();
  contentElement.innerHTML = "";
  renderAllSections(contentElement, metrics, currentMapFilter);
  statusElement.textContent = "";
}

async function initializePerspectivePage() {
  const headElement = document.getElementById("head");
  const statusElement = document.getElementById("status");
  const jobInfoElement = document.getElementById("jobInfo");
  const contentElement = document.getElementById("content");

  const playerRow = await fetchPlayerRow();
  if (!playerRow) {
    headElement.innerHTML = '<div class="text-red-400">Player not found.</div>';
    return;
  }

  const isSelfPremium = await isPremiumSteamId(steamId);
  const displayName = playerRow.username || playerRow.steam_id || "?";
  const avatarLetter = displayName.trim().charAt(0).toUpperCase() || "?";

  headElement.innerHTML = `
    <div class="card reveal">
      <div class="flex items-center gap-4">
        <div class="w-14 h-14 rounded-full bg-indigo-600/20 border border-indigo-500/30 grid place-items-center text-xl font-bold text-indigo-300">
          ${avatarLetter}
        </div>
        <div>
          <div class="text-2xl font-extrabold leading-tight">
            ${getPremiumLabelHtml(steamId, displayName, isSelfPremium)}
          </div>
          <div id="chips" class="mt-2 grid grid-cols-2 sm:flex sm:flex-wrap gap-2"></div>
        </div>
      </div>
    </div>`;

  mountRevealAnimations(headElement);

  let gateState = await updateGateBannerUi();
  supabaseClient.auth.onAuthStateChange(async () => {
    gateState = await updateGateBannerUi();
  });

  if (gateState.premium) {
    statusElement.textContent = "Loading…";
    matchesCache = await fetchMatchesForPlayer(steamId, 1200);
    analysesCache = await fetchAnalysesForMatchIds(matchesCache.map(matchRow => matchRow.id));
    renderScopeBar();
    renderFilterBar();
    await recomputeAndRender();

    const legacyRow = await loadPerspectiveRow(steamId);
    const legacyContainer = document.createElement("div");
    contentElement.prepend(legacyContainer);
    renderLegacySummary(legacyContainer, legacyRow);
  } else {
    contentElement.innerHTML = '<div class="mt-6 text-slate-400">Sign in and go Premium to see Perspective.</div>';
  }

  document.getElementById("refreshBtn").onclick = async () => {
    if (!gateState.user || !gateState.premium) {
      return;
    }
    matchesCache = await fetchMatchesForPlayer(steamId, 1200);
    analysesCache = await fetchAnalysesForMatchIds(matchesCache.map(matchRow => matchRow.id));
    renderScopeBar();
    renderFilterBar();
    await recomputeAndRender();
  };

  document.getElementById("queueBtn").onclick = async () => {
    if (!gateState.user || !gateState.premium) {
      return;
    }
    try {
      jobInfoElement.textContent = "Queuing…";
      subscribePerspectiveRealtime(steamId, async row => {
        jobInfoElement.textContent = "Worker finished. Refreshing…";
        const legacyContainer = document.createElement("div");
        document.getElementById("content").prepend(legacyContainer);
        renderLegacySummary(legacyContainer, row);
        document.getElementById("refreshBtn").click();
      });

      await queuePerspectiveRequest(steamId, gateState.user ? gateState.user.id : "web");
      jobInfoElement.textContent = "Queued. Waiting for worker…";

      const row = await waitForPerspective(steamId, 90000);
      if (row) {
        jobInfoElement.textContent = "Ready ✓";
        const legacyContainer = document.createElement("div");
        document.getElementById("content").prepend(legacyContainer);
        renderLegacySummary(legacyContainer, row);
        document.getElementById("refreshBtn").click();
      } else {
        jobInfoElement.textContent = "Still queued / timeout. It will appear here when ready.";
      }
    } catch (error) {
      console.error(error);
      jobInfoElement.textContent = `Failed to queue: ${error.message || error}`;
    }
  };

  async function resolvePlayerSmart(text) {
    if (!text) {
      return null;
    }
    if (/^\d{5,}$/.test(text)) {
      return text;
    }
    try {
      const rpcResult = await supabaseClient.rpc("search_players", { q: text, p_limit: 1 });
      if (!rpcResult.error && rpcResult.data && rpcResult.data.length) {
        return rpcResult.data[0].steam_id;
      }
    } catch {
    }
    try {
      const { data } = await supabaseClient
        .from("players")
        .select("steam_id, username")
        .ilike("username", `%${text}%`)
        .limit(1)
        .maybeSingle();
      if (data && data.steam_id) {
        return data.steam_id;
      }
    } catch {
    }
    return null;
  }

  document.getElementById("cmpBtn").onclick = async () => {
    if (!gateState.user || !gateState.premium) {
      return;
    }
    const compareStatusElement = document.getElementById("cmpStatus");
    compareStatusElement.textContent = "";
    const rawQuery = document.getElementById("cmpInput").value.trim();
    const applyFilter = document.getElementById("cmpUseFilter").checked;
    const otherSteamId = await resolvePlayerSmart(rawQuery);
    if (!otherSteamId) {
      compareStatusElement.textContent = "Player not found.";
      return;
    }

    const metricsA = aggregateMetrics(
      steamId,
      matchesCache,
      analysesCache,
      applyFilter ? currentMapFilter : null,
      applyFilter ? currentEloBands : new Set()
    );
    const matchesB = await fetchMatchesForPlayer(otherSteamId, 1200);
    const analysesB = await fetchAnalysesForMatchIds(matchesB.map(matchRow => matchRow.id));
    const metricsB = aggregateMetrics(
      otherSteamId,
      matchesB,
      analysesB,
      applyFilter ? currentMapFilter : null,
      applyFilter ? currentEloBands : new Set()
    );
    compareStatusElement.textContent = "";

    const premiumSet = await fetchPremiumSteamIdSet([steamId, otherSteamId]);
    const { data: playerBRow } = await supabaseClient
      .from("players")
      .select("username")
      .eq("steam_id", otherSteamId)
      .maybeSingle();
    const nameB = (playerBRow && playerBRow.username) || otherSteamId;
    const nameA = playerRow.username || steamId;

    const wrapElement = document.createElement("div");
    wrapElement.innerHTML = `
      <div class="mirror-row">
        <div class="card reveal">
          <div class="text-lg font-semibold truncate" title="${escapeHtml(nameA)}">${getPremiumLabelHtml(steamId, nameA, premiumSet.has(String(steamId)))}</div>
          <div class="mt-2 kv">
            <div class="k">Win rate</div><div class="v">${metricsA.winrate != null ? `${Math.round(metricsA.winrate * 1000) / 10}%` : "—"}</div>
            <div class="k">Average quality</div><div class="v">${formatNumber(metricsA.quality.average, 1)}</div>
            <div class="k">Average speed</div><div class="v">${formatNumber(metricsA.speed.average_mps, 2)} m/s</div>
          </div>
        </div>
        <div class="card reveal">
          <div class="text-lg font-semibold truncate" title="${escapeHtml(nameB)}">${getPremiumLabelHtml(otherSteamId, nameB, premiumSet.has(String(otherSteamId)))}</div>
          <div class="mt-2 kv">
            <div class="k">Win rate</div><div class="v">${metricsB.winrate != null ? `${Math.round(metricsB.winrate * 1000) / 10}%` : "—"}</div>
            <div class="k">Average quality</div><div class="v">${formatNumber(metricsB.quality.average, 1)}</div>
            <div class="k">Average speed</div><div class="v">${formatNumber(metricsB.speed.average_mps, 2)} m/s</div>
          </div>
        </div>
      </div>`;

  const rowsContainer = document.createElement("div");

  function addRowPair(leftHtml, rightHtml) {
    const rowElement = document.createElement("div");
    rowElement.className = "mirror-row";
    rowElement.innerHTML = `<div>${leftHtml}</div><div>${rightHtml}</div>`;
    rowsContainer.appendChild(rowElement);
  }

  addRowPair(`<div class="card">${buildOverviewChips(metricsA)}</div>`, `<div class="card">${buildOverviewChips(metricsB)}</div>`);
  addRowPair(buildFormSection(metricsA), buildFormSection(metricsB));
  addRowPair(buildTaggingSection(metricsA), buildTaggingSection(metricsB));
  addRowPair(buildSpeedAndDistanceSection(metricsA), buildSpeedAndDistanceSection(metricsB));
  addRowPair(buildRetagAndAccuracySection(metricsA), buildRetagAndAccuracySection(metricsB));
  addRowPair(buildQualitySection(metricsA), buildQualitySection(metricsB));
  addRowPair(buildSessionsAndTimeSection(metricsA), buildSessionsAndTimeSection(metricsB));

  const contentRoot = document.getElementById("content");
  contentRoot.innerHTML = "";
  contentRoot.appendChild(wrapElement);
  contentRoot.appendChild(rowsContainer);
  mountRevealAnimations(contentRoot);
  mountDaypartTabs(contentRoot);
  };

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      recomputeAndRender();
    }, 120);
  });
}

document.addEventListener("DOMContentLoaded", initializePerspectivePage);
