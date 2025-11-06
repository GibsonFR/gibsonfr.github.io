const url = new URL(location.href);
const steamId = url.searchParams.get("steam_id");
const WINDOW_ALL = 0;

const MAP_NAMES = {
    35: "Mini Monke",
    36: "Small Beach",
    38: "Small Containers",
    39: "Tiny Town 2",
    40: "Tiny Town"
};
const prettyMap = id => (MAP_NAMES[id] ? `${id} — ${MAP_NAMES[id]}` : String(id));

const PRESET_WINDOWS = [
    { label: "Last 20", value: 20 },
    { label: "Last 50", value: 50 },
    { label: "Last 100", value: 100 },
    { label: "All", value: WINDOW_ALL }
];

const ELO_BANDS = [
    { label: "<1100", min: 0, max: 1099 },
    { label: "1100–1299", min: 1100, max: 1299 },
    { label: "1300–1499", min: 1300, max: 1499 },
    { label: "1500–1699", min: 1500, max: 1699 },
    { label: "1700+", min: 1700, max: Infinity }
];

function getAverage(values) {
    if (!values || values.length === 0) return null;
    const sum = values.reduce((acc, val) => acc + val, 0);
    return sum / values.length;
}

function getMedian(values) {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
    }
    return sorted[mid];
}

function getStdDev(values) {
    if (!values || values.length < 2) return null;
    const avg = getAverage(values);
    const variance =
        values.reduce((acc, val) => acc + (val - avg) * (val - avg), 0) /
        values.length;
    return Math.sqrt(variance);
}

function getIQR(values) {
    if (!values || values.length < 4) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    return q3 - q1;
}

function getP90(values) {
    if (!values || values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.floor(sorted.length * 0.9);
    return sorted[Math.min(idx, sorted.length - 1)];
}

function getLastValues(values, count) {
    if (!values) return [];
    return values.slice(Math.max(0, values.length - count));
}

function getSum(values) {
    return (values || []).reduce(
        (acc, val) => (Number.isFinite(val) ? acc + val : acc),
        0
    );
}

function buildTooltipHtml(text) {
    const safe = String(text || "");
    return ` data-tip="${safe.replace(/"/g, "&quot;")}"`;
}

function buildChip(label, value, tip, suffix) {
    const finalSuffix = suffix || "";
    const isEmpty = value == null || value === "—";
    const displayValue = isEmpty ? "—" : value;
    const extraClass = isEmpty ? "text-slate-500" : "text-emerald-300";
    const tooltipAttr = tip ? buildTooltipHtml(tip) : "";
    return `<div class="flex flex-col gap-1 px-2 py-1 rounded bg-slate-800/70 border border-slate-700/70 chip tip"${tooltipAttr}>
      <div class="text-xs uppercase tracking-wide text-slate-400">${label}</div>
      <div class="text-lg font-semibold ${extraClass}">
        ${displayValue}${finalSuffix}
      </div>
    </div>`;
}

function buildSectionCard(title, subtitle, contentHtml, extraClasses, tip) {
    const tooltipAttr = tip ? buildTooltipHtml(tip) : "";
    return `<section class="bg-slate-900/70 rounded-xl border border-slate-700/80 p-4 shadow-sm section-card ${extraClasses || ""} tip"${tooltipAttr}>
      <div class="flex items-baseline justify-between gap-2 mb-2">
        <h2 class="text-base font-semibold text-slate-100">${title}</h2>
        ${subtitle
            ? `<p class="text-xs text-slate-400">${subtitle}</p>`
            : ""
        }
      </div>
      ${contentHtml}
    </section>`;
}

function formatPercent(value, decimals = 1) {
    if (value == null || !Number.isFinite(value)) return "—";
    const factor = Math.pow(10, decimals);
    return (Math.round(value * 100 * factor) / factor).toFixed(decimals);
}

function formatNumber(value, decimals = 2) {
    if (value == null || !Number.isFinite(value)) return "—";
    return Number(value).toFixed(decimals);
}

function formatSeconds(value, decimals = 1) {
    if (value == null || !Number.isFinite(value)) return "—";
    return Number(value).toFixed(decimals);
}

function buildEloBandFilterChips(currentBands) {
    return ELO_BANDS.map(band => {
        const isActive = currentBands.has(band.min);
        const baseClasses =
            "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border cursor-pointer select-none";
        const activeClasses =
            "bg-emerald-500/20 border-emerald-400 text-emerald-100";
        const inactiveClasses =
            "bg-slate-900/60 border-slate-600 text-slate-300 hover:border-emerald-300/70 hover:text-emerald-100";
        const finalClasses = baseClasses + " " + (isActive ? activeClasses : inactiveClasses);
        const tipText = `Filter matches where the opponent's Elo is in this range (${band.label}).`;
        return `<button class="${finalClasses} elo-band-chip tip" data-min="${band.min}" data-max="${band.max}"${buildTooltipHtml(
            tipText
        )}>
      <span class="w-2 h-2 rounded-full ${isActive ? "bg-emerald-400" : "bg-slate-500"
            }"></span>
      <span>${band.label}</span>
    </button>`;
    }).join("");
}

// ---------------------
// Data loading helpers
// ---------------------
async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.json();
}

async function fetchMatchesForPlayer(steamId) {
    if (!steamId) return [];
    const params = new URLSearchParams({
        or: `(p1_id.eq.${steamId},p2_id.eq.${steamId})`,
        order: "played_at.desc",
        select:
            "id,played_at,winner,map_id,replay_url,p1_id,p2_id,p1_name,p2_name,p1_elo_before,p2_elo_before,p1_elo_after,p2_elo_after"
    });
    const baseUrl = `${window.SUPABASE_REST_URL}/matches`;
    const urlWithParams = `${baseUrl}?${params.toString()}`;
    const resp = await fetchJson(urlWithParams, {
        headers: {
            apikey: window.SUPABASE_ANON_KEY,
            Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`
        }
    });
    return resp || [];
}

async function fetchAnalysesForMatches(matchIds) {
    if (!matchIds || matchIds.length === 0) return [];
    const chunks = [];
    const size = 200;
    for (let i = 0; i < matchIds.length; i += size) {
        chunks.push(matchIds.slice(i, i + size));
    }
    const all = [];
    for (const chunk of chunks) {
        const baseUrl = `${window.SUPABASE_REST_URL}/match_analyses`;
        const params = new URLSearchParams({
            select: "*",
            match_id: `in.(${chunk.join(",")})`
        });
        const urlWithParams = `${baseUrl}?${params.toString()}`;
        const resp = await fetchJson(urlWithParams, {
            headers: {
                apikey: window.SUPABASE_ANON_KEY,
                Authorization: `Bearer ${window.SUPABASE_ANON_KEY}`
            }
        });
        if (Array.isArray(resp)) {
            all.push(...resp);
        }
    }
    return all;
}

// ---------------------
// Aggregation / metrics
// ---------------------
function aggregateMetrics(playerSteamId, matches, analyses, mapId, eloBandSet) {
    let scopedMatches = mapId
        ? matches.filter(matchRow => String(matchRow.map_id) === String(mapId))
        : matches.slice();

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

    const byId = new Map();
    for (const row of analyses) {
        if (row && row.match_id != null) {
            byId.set(row.match_id, row);
        }
    }

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
    // New aggregated series for advanced stats
    const taggerQualityValues = [];
    const hiderQualityValues = [];
    const chaseValues = [];
    const evasionValues = [];
    const pathDiversityValues = [];
    const movementRatioValues = [];
    const movementTaggerRatioValues = [];
    const movementHiderRatioValues = [];
    const verticalAboveShares = [];
    const verticalBelowShares = [];
    const matchesByMap = new Map();
    const matchesByOpponent = new Map();

    const results = [];
    const eloSeries = [];
    const dayparts = {
        morning: 0,
        afternoon: 0,
        evening: 0,
        night: 0
    };

    function classifyDaypart(dateString) {
        try {
            const d = new Date(dateString);
            const hour = d.getHours();
            if (hour >= 6 && hour < 12) return "morning";
            if (hour >= 12 && hour < 18) return "afternoon";
            if (hour >= 18 && hour < 24) return "evening";
            return "night";
        } catch {
            return null;
        }
    }

    const sessionThresholdMs = 60 * 60 * 1000;
    const sessionStats = {
        sessions: [],
        longestStreak: 0,
        averageSessionLength: null
    };

    let currentSession = null;

    const sortedByDate = scopedMatches
        .slice()
        .sort((a, b) => new Date(a.played_at) - new Date(b.played_at));
    for (const matchRow of sortedByDate) {
        const matchDate = new Date(matchRow.played_at);
        if (!currentSession) {
            currentSession = {
                start: matchDate,
                end: matchDate,
                matchCount: 1
            };
        } else {
            const deltaMs = matchDate - currentSession.end;
            if (deltaMs <= sessionThresholdMs) {
                currentSession.end = matchDate;
                currentSession.matchCount += 1;
            } else {
                sessionStats.sessions.push(currentSession);
                currentSession = {
                    start: matchDate,
                    end: matchDate,
                    matchCount: 1
                };
            }
        }
    }
    if (currentSession) {
        sessionStats.sessions.push(currentSession);
    }

    if (sessionStats.sessions.length > 0) {
        sessionStats.longestStreak = Math.max(
            ...sessionStats.sessions.map(s => s.matchCount)
        );
        const lengths = sessionStats.sessions.map(
            s => (s.end - s.start) / 60000
        );
        sessionStats.averageSessionLength = getAverage(lengths);
    }

    for (const matchRow of scopedMatches) {
        const isPlayerP1 = String(matchRow.p1_id) === String(playerSteamId);
        const playerSide = isPlayerP1 ? "p1" : "p2";
        const opponentId = isPlayerP1 ? matchRow.p2_id : matchRow.p1_id;
        const opponentName = isPlayerP1
            ? matchRow.p2_name || matchRow.p2_id
            : matchRow.p1_name || matchRow.p1_id;

        let isWin = null;
        if (matchRow.winner === 1 || matchRow.winner === "1") {
            isWin = playerSide === "p1";
        } else if (matchRow.winner === 2 || matchRow.winner === "2") {
            isWin = playerSide === "p2";
        }
        if (isWin != null) {
            results.push(!!isWin);
        }

        const eloAfterMatch = isPlayerP1
            ? matchRow.p1_elo_after
            : matchRow.p2_elo_after;
        if (Number.isFinite(eloAfterMatch)) {
            eloSeries.push({
                played_at: matchRow.played_at,
                elo: Number(eloAfterMatch),
                win: isWin === true
            });
        }

        const part = classifyDaypart(matchRow.played_at);
        if (part && dayparts[part] != null) {
            dayparts[part] += 1;
        }

        const analysisRow = byId.get(matchRow.id);
        if (analysisRow) {
            const qualityValue = isPlayerP1
                ? analysisRow.p1_quality
                : analysisRow.p2_quality;
            if (Number.isFinite(qualityValue)) {
                qualityValues.push(Number(qualityValue));
            }
            const stats = isPlayerP1 ? analysisRow.p1_stats || {} : analysisRow.p2_stats || {};
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
            if (
                Number.isFinite(stats.seconds_as_tagger) &&
                Number.isFinite(stats.seconds_as_hider)
            ) {
                const totalSeconds =
                    Number(stats.seconds_as_tagger) + Number(stats.seconds_as_hider);
                if (totalSeconds > 0) {
                    tagShareFromSeconds.push(
                        Number(stats.seconds_as_tagger) / totalSeconds
                    );
                }
            }
            if (Number.isFinite(stats.retag_median_seconds)) {
                retagMedianValues.push(Number(stats.retag_median_seconds));
            }
            if (Number.isFinite(stats.retag_avg_seconds)) {
                retagAverageValues.push(Number(stats.retag_avg_seconds));
            }
            // Item accuracy (backend: item_accuracy)
            if (Number.isFinite(stats.item_accuracy)) {
                accuracyValues.push(Number(stats.item_accuracy));
            }
            // Role qualities
            if (Number.isFinite(stats.tagger_quality)) {
                taggerQualityValues.push(Number(stats.tagger_quality));
            }
            if (Number.isFinite(stats.hider_quality)) {
                hiderQualityValues.push(Number(stats.hider_quality));
            }
            // Chase / evasion
            if (Number.isFinite(stats.chase_score)) {
                chaseValues.push(Number(stats.chase_score));
            }
            if (Number.isFinite(stats.evasion_score)) {
                evasionValues.push(Number(stats.evasion_score));
            }
            // Path diversity & movement ratios
            if (Number.isFinite(stats.path_diversity_score)) {
                pathDiversityValues.push(Number(stats.path_diversity_score));
            }
            if (Number.isFinite(stats.movement_ratio)) {
                movementRatioValues.push(Number(stats.movement_ratio));
            }
            if (Number.isFinite(stats.movement_ratio_tagger)) {
                movementTaggerRatioValues.push(Number(stats.movement_ratio_tagger));
            }
            if (Number.isFinite(stats.movement_ratio_hider)) {
                movementHiderRatioValues.push(Number(stats.movement_ratio_hider));
            }
            // Vertical play shares
            if (Number.isFinite(stats.vertical_above_share)) {
                verticalAboveShares.push(Number(stats.vertical_above_share));
            }
            if (Number.isFinite(stats.vertical_below_share)) {
                verticalBelowShares.push(Number(stats.vertical_below_share));
            }
        }

        const mapKey = String(matchRow.map_id || "unknown");
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
                distanceTagger: [],
                // per-map advanced series
                taggerQ: [],
                hiderQ: [],
                pathDiv: [],
                chase: [],
                evade: []
            });
        }
        const mapBucket = matchesByMap.get(mapKey);
        mapBucket.matches += 1;
        if (isWin) {
            mapBucket.wins += 1;
        }
        const analysisRowForMap = byId.get(matchRow.id);
        if (analysisRowForMap) {
            const stats = isPlayerP1
                ? analysisRowForMap.p1_stats || {}
                : analysisRowForMap.p2_stats || {};
            const qualityValForMap = isPlayerP1
                ? analysisRowForMap.p1_quality
                : analysisRowForMap.p2_quality;
            if (Number.isFinite(qualityValForMap)) {
                mapBucket.qualityValues.push(Number(qualityValForMap));
            }
            if (Number.isFinite(stats.avg_speed_ms)) {
                mapBucket.speedValues.push(Number(stats.avg_speed_ms));
            }
            if (Number.isFinite(stats.time_as_tagger_share)) {
                mapBucket.tagShares.push(Number(stats.time_as_tagger_share));
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
            if (Number.isFinite(stats.tagger_quality)) {
                mapBucket.taggerQ.push(Number(stats.tagger_quality));
            }
            if (Number.isFinite(stats.hider_quality)) {
                mapBucket.hiderQ.push(Number(stats.hider_quality));
            }
            if (Number.isFinite(stats.path_diversity_score)) {
                mapBucket.pathDiv.push(Number(stats.path_diversity_score));
            }
            if (Number.isFinite(stats.chase_score)) {
                mapBucket.chase.push(Number(stats.chase_score));
            }
            if (Number.isFinite(stats.evasion_score)) {
                mapBucket.evade.push(Number(stats.evasion_score));
            }
        }

        const opponentKey = String(opponentId || "unknown");
        if (!matchesByOpponent.has(opponentKey)) {
            matchesByOpponent.set(opponentKey, {
                id: opponentId,
                name: opponentName,
                matches: 0,
                wins: 0,
                qualityValues: []
            });
        }
        const oppBucket = matchesByOpponent.get(opponentKey);
        oppBucket.matches += 1;
        if (isWin) {
            oppBucket.wins += 1;
        }
        if (analysisRow) {
            const qValue = isPlayerP1
                ? analysisRow.p1_quality
                : analysisRow.p2_quality;
            if (Number.isFinite(qValue)) {
                oppBucket.qualityValues.push(Number(qValue));
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
        spread_std: getStdDev(qualityValues),
        spread_iqr: getIQR(qualityValues),
        best_match: qualityValues.length ? Math.max(...qualityValues) : null,
        worst_match: qualityValues.length ? Math.min(...qualityValues) : null
    };

    const taggingStats = {
        share_as_tagger: tagShareValue,
        time_as_tagger_average: getAverage(tagSeconds),
        time_as_hider_average: getAverage(hiderSeconds),
        time_as_tagger_total: getSum(tagSeconds),
        time_as_hider_total: getSum(hiderSeconds)
    };

    const speedStats = {
        average_mps: getAverage(speeds),
        median_mps: getMedian(speeds),
        p90_mps: getP90(speeds)
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

    // Advanced aggregated role / movement stats
    const roleQuality = {
        tagger_avg: getAverage(taggerQualityValues),
        hider_avg: getAverage(hiderQualityValues)
    };

    const chasing = {
        chase_avg: getAverage(chaseValues),
        evasion_avg: getAverage(evasionValues)
    };

    const movement = {
        ratio_avg: getAverage(movementRatioValues),
        ratio_tagger_avg: getAverage(movementTaggerRatioValues),
        ratio_hider_avg: getAverage(movementHiderRatioValues)
    };

    const path = {
        diversity_avg: getAverage(pathDiversityValues)
    };

    const vertical = {
        above_share_avg: getAverage(verticalAboveShares),
        below_share_avg: getAverage(verticalBelowShares)
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
            average_tagger_distance_m: getAverage(mapBucket.distanceTagger),
            average_tagger_quality: getAverage(mapBucket.taggerQ),
            average_hider_quality: getAverage(mapBucket.hiderQ),
            path_diversity_avg: getAverage(mapBucket.pathDiv),
            chase_avg: getAverage(mapBucket.chase),
            evasion_avg: getAverage(mapBucket.evade)
        }))
        .sort((a, b) => b.matches - a.matches);

    const perOpponentMetrics = Array.from(matchesByOpponent.values())
        .map(opponentBucket => ({
            id: opponentBucket.id,
            name: opponentBucket.name,
            matches: opponentBucket.matches,
            wins: opponentBucket.wins,
            winrate: opponentBucket.matches
                ? opponentBucket.wins / opponentBucket.matches
                : null,
            average_quality: getAverage(opponentBucket.qualityValues)
        }))
        .sort((a, b) => b.matches - a.matches);

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
        roleQuality,
        chasing,
        movement,
        path,
        vertical,
        eloSeries: eloSeriesAll,
        form: recentResults,
        bestStreak: bestStreakValue,
        maps: perMapMetrics,
        opponents: perOpponentMetrics,
        sessionStats,
        dayparts
    };
}

// ---------------------
// UI builders
// ---------------------
function buildOverviewChips(metrics) {
    return [
        buildChip(
            "Matches played",
            metrics.scopeCount || 0,
            "Number of matches included in the current scope (All, or the selected map/Elo filter)."
        ),
        buildChip(
            "Wins",
            metrics.wins || 0,
            "Number of wins in the current scope."
        ),
        buildChip(
            "Win rate",
            metrics.winrate != null
                ? Math.round(metrics.winrate * 1000) / 10
                : "—",
            "Percentage of matches won.",
            "%"
        ),
        buildChip(
            "Average quality",
            metrics.quality.average != null
                ? Number(metrics.quality.average).toFixed(1)
                : "—",
            "Average game quality score for this player."
        ),
        buildChip(
            "Median quality",
            metrics.quality.median != null
                ? Number(metrics.quality.median).toFixed(1)
                : "—",
            "Middle value of the quality scores."
        ),
        buildChip(
            "Quality IQR",
            metrics.quality.spread_iqr != null
                ? Number(metrics.quality.spread_iqr).toFixed(1)
                : "—",
            "Interquartile range (Q3−Q1): middle 50% spread. Smaller = more consistent."
        ),
        buildChip(
            "Quality standard deviation",
            metrics.quality.spread_std != null
                ? Number(metrics.quality.spread_std).toFixed(2)
                : "—",
            "Overall spread of quality scores."
        ),
        buildChip(
            "Best match quality",
            metrics.quality.best_match != null
                ? Number(metrics.quality.best_match).toFixed(1)
                : "—",
            "Highest quality score observed."
        ),
        buildChip(
            "Worst match quality",
            metrics.quality.worst_match != null
                ? Number(metrics.quality.worst_match).toFixed(1)
                : "—",
            "Lowest quality score observed."
        ),
        buildChip(
            "Tag time share",
            metrics.tagging.share_as_tagger != null
                ? Math.round(metrics.tagging.share_as_tagger * 1000) / 10
                : "—",
            "Share of total time spent as the tagger.",
            "%"
        ),
        buildChip(
            "Average time as tagger",
            metrics.tagging.time_as_tagger_average != null
                ? Number(metrics.tagging.time_as_tagger_average).toFixed(1)
                : "—",
            "Seconds per match as tagger.",
            "s"
        ),
        buildChip(
            "Average time as hider",
            metrics.tagging.time_as_hider_average != null
                ? Number(metrics.tagging.time_as_hider_average).toFixed(1)
                : "—",
            "Seconds per match as hider.",
            "s"
        ),
        buildChip(
            "Average speed",
            metrics.speed.average_mps != null
                ? Number(metrics.speed.average_mps).toFixed(2)
                : "—",
            "Average movement speed (m/s).",
            " m/s"
        ),
        buildChip(
            "Median speed",
            metrics.speed.median_mps != null
                ? Number(metrics.speed.median_mps).toFixed(2)
                : "—",
            "Middle speed value (m/s).",
            " m/s"
        ),
        buildChip(
            "90th percentile speed",
            metrics.speed.p90_mps != null
                ? Number(metrics.speed.p90_mps).toFixed(2)
                : "—",
            "Top-burst speed (m/s).",
            " m/s"
        ),
        buildChip(
            "Average hider distance",
            metrics.distance.average_hider_m != null
                ? Number(metrics.distance.average_hider_m).toFixed(2)
                : "—",
            "Distance as hider (m).",
            " m"
        ),
        buildChip(
            "Average tagger distance",
            metrics.distance.average_tagger_m != null
                ? Number(metrics.distance.average_tagger_m).toFixed(2)
                : "—",
            "Distance as tagger (m).",
            " m"
        ),
        buildChip(
            "Retag median",
            metrics.retag.median_seconds != null
                ? Number(metrics.retag.median_seconds).toFixed(1)
                : "—",
            "Typical time between tags.",
            "s"
        ),
        buildChip(
            "Retag average",
            metrics.retag.average_seconds != null
                ? Number(metrics.retag.average_seconds).toFixed(1)
                : "—",
            "Average time between tags.",
            "s"
        ),
        buildChip(
            "Retag p90",
            metrics.retag.p90_seconds != null
                ? Number(metrics.retag.p90_seconds).toFixed(1)
                : "—",
            "Slow retag (90th percentile).",
            "s"
        ),
        buildChip(
            "Item accuracy (average)",
            metrics.accuracy.average != null
                ? Math.round(metrics.accuracy.average * 1000) / 10
                : "—",
            "Average success rate of offensive items (only when item use was relevant).",
            "%"
        ),
        buildChip(
            "Tagger quality (avg)",
            metrics.roleQuality.tagger_avg != null
                ? Number(metrics.roleQuality.tagger_avg).toFixed(1)
                : "—",
            "Average tagger-quality score over the selected games (0–100)."
        ),
        buildChip(
            "Hider quality (avg)",
            metrics.roleQuality.hider_avg != null
                ? Number(metrics.roleQuality.hider_avg).toFixed(1)
                : "—",
            "Average hider-quality score over the selected games (0–100)."
        ),
        buildChip(
            "Chase efficiency (avg)",
            metrics.chasing.chase_avg != null
                ? Number(metrics.chasing.chase_avg).toFixed(1)
                : "—",
            "How effectively you close distance as the tagger during chases (0–100)."
        ),
        buildChip(
            "Evasion efficiency (avg)",
            metrics.chasing.evasion_avg != null
                ? Number(metrics.chasing.evasion_avg).toFixed(1)
                : "—",
            "How effectively you increase distance as the hider during chases (0–100)."
        ),
        buildChip(
            "Path diversity (avg)",
            metrics.path.diversity_avg != null
                ? Number(metrics.path.diversity_avg).toFixed(1)
                : "—",
            "Average path diversity score across games (higher = explores more of the map)."
        ),
        buildChip(
            "Movement ratio (overall)",
            metrics.movement.ratio_avg != null
                ? Math.round(metrics.movement.ratio_avg * 1000) / 10
                : "—",
            "Share of time spent moving (any role).",
            "%"
        ),
        buildChip(
            "Movement ratio as tagger",
            metrics.movement.ratio_tagger_avg != null
                ? Math.round(metrics.movement.ratio_tagger_avg * 1000) / 10
                : "—",
            "Share of time spent moving while you are the tagger.",
            "%"
        ),
        buildChip(
            "Movement ratio as hider",
            metrics.movement.ratio_hider_avg != null
                ? Math.round(metrics.movement.ratio_hider_avg * 1000) / 10
                : "—",
            "Share of time spent moving while you are the hider.",
            "%"
        ),
        buildChip(
            "Air time share",
            metrics.vertical.above_share_avg != null
                ? Math.round(metrics.vertical.above_share_avg * 1000) / 10
                : "—",
            "Share of time spent above your opponent (aerial style).",
            "%"
        ),
        buildChip(
            "Ground time share",
            metrics.vertical.below_share_avg != null
                ? Math.round(metrics.vertical.below_share_avg * 1000) / 10
                : "—",
            "Share of time spent below your opponent (ground style).",
            "%"
        )
    ].join("");
}

function buildFormSection(metrics) {
    const dotsHtml = metrics.form
        .map(
            resultValue =>
                `<span class="w-3 h-3 rounded-full ${resultValue ? "bg-emerald-400" : "bg-rose-400"
                } inline-block"></span>`
        )
        .join('<span class="w-1 inline-block"></span>');
    const finalDotsHtml =
        dotsHtml || '<span class="text-slate-500 text-sm">No recent games</span>';
    const contentHtml = `<div class="flex items-center justify-between gap-4 flex-wrap">
      <div class="text-slate-300 tip" data-tip="Recent match outcomes (win = green, loss = red).">
        <div class="mb-1 text-xs uppercase tracking-wide text-slate-400">
          Recent Form
        </div>
        <div class="flex items-center flex-wrap gap-1">
          ${finalDotsHtml}
        </div>
      </div>
      <div class="text-right">
        <div class="text-xs text-slate-400 mb-0.5 tip" data-tip="Longest sequence of consecutive wins in the selected matches.">
          Best win streak
        </div>
        <div class="text-xl font-semibold text-emerald-300">${metrics.bestStreak || 0}</div>
      </div>
    </div>`;
    return buildSectionCard("Form & streaks", "", contentHtml, "");
}

function buildEloSection(metrics) {
    const series = metrics.eloSeries || [];
    if (!series.length) {
        const contentHtml =
            '<p class="text-slate-400 text-sm">No Elo data available for this scope.</p>';
        return buildSectionCard("Elo trend", "", contentHtml, "");
    }

    const sortedSeries = [...series].sort(
        (a, b) => new Date(a.played_at) - new Date(b.played_at)
    );
    const pointsHtml = sortedSeries
        .map(point => {
            const dateStr = new Date(point.played_at).toLocaleString(undefined, {
                hour12: false
            });
            const tipText = `Elo: ${point.elo} (match on ${dateStr})`;
            return `<div class="flex items-center gap-1 tip" data-tip="${tipText.replace(
                /"/g,
                "&quot;"
            )}">
        <div class="w-2 h-2 rounded-full ${point.win ? "bg-emerald-400" : "bg-rose-400"
                }"></div>
        <span class="text-xs text-slate-300">${point.elo}</span>
      </div>`;
        })
        .join('<span class="w-2 inline-block"></span>');

    const contentHtml = `<div class="flex flex-wrap items-center gap-2">
      ${pointsHtml}
    </div>`;
    return buildSectionCard(
        "Elo trend",
        "Chronological Elo after each match (colored by result).",
        contentHtml,
        ""
    );
}

function buildMapsSection(metrics) {
    const maps = metrics.maps || [];
    if (!maps.length) {
        const contentHtml =
            '<p class="text-slate-400 text-sm">No map-specific data for this scope.</p>';
        return buildSectionCard("Maps", "", contentHtml, "");
    }
    const rowsHtml = maps
        .map(mapRow => {
            const winrateText =
                mapRow.winrate != null
                    ? `${formatPercent(mapRow.winrate)}%`
                    : "—";
            const avgQuality = formatNumber(mapRow.average_quality, 1);
            const avgSpeed = formatNumber(mapRow.average_speed_mps, 2);
            const shareTagger =
                mapRow.share_as_tagger != null
                    ? `${formatPercent(mapRow.share_as_tagger)}%`
                    : "—";
            const retagMedian = formatSeconds(mapRow.retag_median_seconds, 1);
            const distHider = formatNumber(
                mapRow.average_hider_distance_m,
                2
            );
            const distTagger = formatNumber(
                mapRow.average_tagger_distance_m,
                2
            );
            const taggerQ = formatNumber(mapRow.average_tagger_quality, 1);
            const hiderQ = formatNumber(mapRow.average_hider_quality, 1);
            const pathDiv = formatNumber(mapRow.path_diversity_avg, 1);
            const chaseAvg = formatNumber(mapRow.chase_avg, 1);
            const evadeAvg = formatNumber(mapRow.evasion_avg, 1);

            const tipMapName = `Your performance statistics on this map (${prettyMap(
                mapRow.map_id
            )}).`;

            return `<tr class="border-b border-slate-800 hover:bg-slate-800/40 transition">
      <td class="px-2 py-1 text-sm text-slate-200 tip" data-tip="${tipMapName.replace(
                /"/g,
                "&quot;"
            )}">
        ${prettyMap(mapRow.map_id)}
      </td>
      <td class="px-2 py-1 text-xs text-slate-300">${mapRow.matches}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${winrateText}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${avgQuality}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${avgSpeed}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${shareTagger}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${retagMedian}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${distHider}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${distTagger}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${taggerQ}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${hiderQ}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${pathDiv}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${chaseAvg}</td>
      <td class="px-2 py-1 text-xs text-slate-300">${evadeAvg}</td>
    </tr>`;
        })
        .join("");
    const headerHtml = `<tr class="border-b border-slate-700/80 text-xs text-slate-400 uppercase tracking-wide">
      <th class="px-2 py-1 text-left">Map</th>
      <th class="px-2 py-1 text-right">Matches</th>
      <th class="px-2 py-1 text-right">Win&nbsp;%</th>
      <th class="px-2 py-1 text-right">Avg Q</th>
      <th class="px-2 py-1 text-right">Avg speed</th>
      <th class="px-2 py-1 text-right">Tag share</th>
      <th class="px-2 py-1 text-right">Retag med</th>
      <th class="px-2 py-1 text-right">Hider dist</th>
      <th class="px-2 py-1 text-right">Tagger dist</th>
      <th class="px-2 py-1 text-right">Tagger Q</th>
      <th class="px-2 py-1 text-right">Hider Q</th>
      <th class="px-2 py-1 text-right">Path div</th>
      <th class="px-2 py-1 text-right">Chase</th>
      <th class="px-2 py-1 text-right">Evade</th>
    </tr>`;
    const tableHtml = `<div class="overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>${headerHtml}</thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
    return buildSectionCard(
        "Maps",
        "Per-map performance overview.",
        tableHtml,
        ""
    );
}

function buildOpponentsSection(metrics) {
    const opponents = metrics.opponents || [];
    if (!opponents.length) {
        const contentHtml =
            '<p class="text-slate-400 text-sm">No opponent data for this scope.</p>';
        return buildSectionCard("Opponents", "", contentHtml, "");
    }
    const rowsHtml = opponents
        .slice(0, 20)
        .map(opp => {
            const winrateText =
                opp.winrate != null
                    ? `${formatPercent(opp.winrate)}%`
                    : "—";
            const avgQual = formatNumber(opp.average_quality, 1);
            const tipText = `Aggregated performance against ${opp.name} (${opp.matches} matches).`;
            return `<tr class="border-b border-slate-800 hover:bg-slate-800/40 transition tip"
      data-tip="${tipText.replace(/"/g, "&quot;")}">
      <td class="px-2 py-1 text-xs text-slate-200">${opp.name}</td>
      <td class="px-2 py-1 text-xs text-slate-300 text-right">${opp.matches}</td>
      <td class="px-2 py-1 text-xs text-slate-300 text-right">${winrateText}</td>
      <td class="px-2 py-1 text-xs text-slate-300 text-right">${avgQual}</td>
    </tr>`;
        })
        .join("");
    const headerHtml = `<tr class="border-b border-slate-700/80 text-xs text-slate-400 uppercase tracking-wide">
      <th class="px-2 py-1 text-left">Opponent</th>
      <th class="px-2 py-1 text-right">Matches</th>
      <th class="px-2 py-1 text-right">Win&nbsp;%</th>
      <th class="px-2 py-1 text-right">Avg Q</th>
    </tr>`;
    const tableHtml = `<div class="overflow-x-auto">
      <table class="min-w-full text-xs">
        <thead>${headerHtml}</thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    </div>`;
    return buildSectionCard(
        "Opponents",
        "Top opponents in this scope.",
        tableHtml,
        ""
    );
}

function buildSessionSection(metrics) {
    const sess = metrics.sessionStats || {};
    const sessions = sess.sessions || [];
    if (!sessions.length) {
        const contentHtml =
            '<p class="text-slate-400 text-sm">No session data for this scope.</p>';
        return buildSectionCard("Sessions", "", contentHtml, "");
    }
    const avgSessionLength = sess.averageSessionLength || 0;
    const longestStreak = sess.longestStreak || 0;
    const totalMatches = metrics.scopeCount || 0;

    const contentHtml = `<div class="grid grid-cols-2 gap-4">
      <div class="tip" data-tip="Approximate average session length (in minutes) for the selected matches.">
        <div class="text-xs text-slate-400 mb-1 uppercase tracking-wide">Avg session length</div>
        <div class="text-2xl font-semibold text-emerald-300">${formatNumber(
        avgSessionLength,
        1
    )}<span class="text-sm text-slate-400 ml-1">min</span></div>
      </div>
      <div class="tip" data-tip="Longest session (number of matches played without a long break).">
        <div class="text-xs text-slate-400 mb-1 uppercase tracking-wide">Longest session</div>
        <div class="text-2xl font-semibold text-emerald-300">${longestStreak}</div>
      </div>
      <div class="tip col-span-2" data-tip="Total matches included in the sessions calculation.">
        <div class="text-xs text-slate-400 mb-1 uppercase tracking-wide">Matches in scope</div>
        <div class="text-lg font-semibold text-slate-200">${totalMatches}</div>
      </div>
    </div>`;
    return buildSectionCard(
        "Sessions",
        "How your matches group into play sessions.",
        contentHtml,
        ""
    );
}

function buildDaypartSection(metrics) {
    const d = metrics.dayparts || {};
    const total =
        (d.morning || 0) +
        (d.afternoon || 0) +
        (d.evening || 0) +
        (d.night || 0);
    const parts = [
        { key: "morning", label: "Morning (06–12)", value: d.morning || 0 },
        { key: "afternoon", label: "Afternoon (12–18)", value: d.afternoon || 0 },
        { key: "evening", label: "Evening (18–24)", value: d.evening || 0 },
        { key: "night", label: "Night (00–06)", value: d.night || 0 }
    ];
    const contentHtml = `<div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      ${parts
            .map(part => {
                const share = total > 0 ? part.value / total : 0;
                const pctText = `${formatPercent(share)}%`;
                const tipText = `Matches played in this daypart: ${part.value} (${pctText} of scope).`;
                return `<div class="flex flex-col tip" data-tip="${tipText.replace(
                    /"/g,
                    "&quot;"
                )}">
            <div class="text-xs text-slate-400 mb-0.5">${part.label}</div>
            <div class="flex items-baseline gap-1">
              <span class="text-lg font-semibold text-slate-100">${part.value}</span>
              <span class="text-xs text-slate-400">${pctText}</span>
            </div>
          </div>`;
            })
            .join("")}
    </div>`;
    return buildSectionCard(
        "When you play",
        "Distribution of matches over the day.",
        contentHtml,
        ""
    );
}

// ---------------------
// Rendering
// ---------------------
function mountOverview(metrics, container) {
    const chipsHtml = buildOverviewChips(metrics);
    const formSectionHtml = buildFormSection(metrics);
    const eloSectionHtml = buildEloSection(metrics);
    container.innerHTML = `
    <div class="flex flex-col gap-4">
      <div class="overflow-x-auto">
        <div class="flex flex-wrap gap-2 items-stretch">
          ${chipsHtml}
        </div>
      </div>
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        ${formSectionHtml}
        ${eloSectionHtml}
      </div>
    </div>
  `;
}

function mountMapsAndOpponents(metrics, container) {
    const mapsSection = buildMapsSection(metrics);
    const oppSection = buildOpponentsSection(metrics);
    const sessionsSection = buildSessionSection(metrics);
    const daypartSection = buildDaypartSection(metrics);
    container.innerHTML = `
    <div class="grid grid-cols-1 2xl:grid-cols-[2fr_1.2fr] gap-4 items-start">
      <div class="flex flex-col gap-4">
        ${mapsSection}
        ${oppSection}
      </div>
      <div class="flex flex-col gap-4">
        ${sessionsSection}
        ${daypartSection}
      </div>
    </div>
  `;
}

function mountWindowSelector(container, currentWindow) {
    const chipsHtml = PRESET_WINDOWS.map(win => {
        const isActive = win.value === currentWindow;
        const baseClasses =
            "inline-flex items-center px-2 py-1 rounded-full text-xs border cursor-pointer select-none";
        const activeClasses =
            "bg-emerald-500/20 border-emerald-400 text-emerald-100";
        const inactiveClasses =
            "bg-slate-900/60 border-slate-600 text-slate-300 hover:border-emerald-300/70 hover:text-emerald-100";
        const finalClasses =
            baseClasses + " " + (isActive ? activeClasses : inactiveClasses);
        const tipText =
            win.value === WINDOW_ALL
                ? "Use all matches on record."
                : `Use only the last ${win.value} matches.`;
        return `<button class="${finalClasses} window-chip tip" data-window="${win.value}"${buildTooltipHtml(
            tipText
        )}>
      ${win.label}
    </button>`;
    }).join("");
    container.innerHTML = `
    <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2 mb-3">
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-xs uppercase tracking-wide text-slate-400">Scope</div>
        <div class="flex flex-wrap gap-1">
          ${chipsHtml}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <div class="text-xs uppercase tracking-wide text-slate-400">Opponent Elo filter</div>
        <div class="flex flex-wrap gap-1" id="elo-band-chips"></div>
      </div>
    </div>
  `;
}

function mountMapSelector(container, maps, currentMapId) {
    const uniqueMaps = Array.from(
        new Map(
            maps
                .filter(m => m.map_id != null)
                .map(m => [String(m.map_id), m.map_id])
        ).values()
    );
    uniqueMaps.sort((a, b) => Number(a) - Number(b));

    const buttonsHtml = [
        `<button class="inline-flex items-center px-2 py-1 rounded-full text-xs border cursor-pointer select-none ${currentMapId == null
            ? "bg-emerald-500/20 border-emerald-400 text-emerald-100"
            : "bg-slate-900/60 border-slate-600 text-slate-300 hover:border-emerald-300/70 hover:text-emerald-100"
        } map-chip tip" data-map-id="all"${buildTooltipHtml(
            "Include all maps."
        )}>
      All maps
    </button>`
    ]
        .concat(
            uniqueMaps.map(mapId => {
                const isActive = String(mapId) === String(currentMapId);
                const baseClasses =
                    "inline-flex items-center px-2 py-1 rounded-full text-xs border cursor-pointer select-none";
                const activeClasses =
                    "bg-emerald-500/20 border-emerald-400 text-emerald-100";
                const inactiveClasses =
                    "bg-slate-900/60 border-slate-600 text-slate-300 hover:border-emerald-300/70 hover:text-emerald-100";
                const finalClasses =
                    baseClasses + " " + (isActive ? activeClasses : inactiveClasses);
                const tipText = `Limit scope to matches on map ${prettyMap(mapId)}.`;
                return `<button class="${finalClasses} map-chip tip" data-map-id="${mapId}"${buildTooltipHtml(
                    tipText
                )}>
        ${prettyMap(mapId)}
      </button>`;
            })
        )
        .join("");

    container.innerHTML = `
    <div class="flex flex-col gap-1 mb-3">
      <div class="text-xs uppercase tracking-wide text-slate-400">Map filter</div>
      <div class="flex flex-wrap gap-1">
        ${buttonsHtml}
      </div>
    </div>
  `;
}

function mountEloBandChips(container, currentBandsSet) {
    container.innerHTML = buildEloBandFilterChips(currentBandsSet);
}

function mountRevealAnimations(root) {
    const sections = root.querySelectorAll(".section-card");
    sections.forEach((section, index) => {
        section.style.opacity = 0;
        section.style.transform = "translateY(6px)";
        section.style.transition =
            "opacity 0.35s ease-out, transform 0.35s ease-out";
        setTimeout(() => {
            section.style.opacity = 1;
            section.style.transform = "translateY(0px)";
        }, 40 + index * 30);
    });
}

function mountDaypartTabs(root) {
    const section = root.querySelector(".section-card:nth-child(4)");
    if (!section) return;
    section.classList.add("hover:border-emerald-400/60", "transition-colors");
}

function initializePerspectivePage() {
    const root = document.getElementById("perspective-root");
    if (!root) return;

    let allMatches = [];
    let allAnalyses = [];
    let currentWindow = WINDOW_ALL;
    let currentMapId = null;
    let currentEloBandSet = new Set();

    const overlay = document.createElement("div");
    overlay.className =
        "fixed inset-x-0 top-0 flex justify-center pointer-events-none z-30";
    overlay.innerHTML = `
    <div class="mt-2 px-3 py-1 rounded-full bg-slate-900/90 border border-slate-700/80 shadow text-xs text-slate-300 flex items-center gap-2 pointer-events-auto">
      <span id="status-text">Loading perspective…</span>
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
    </div>
  `;
    document.body.appendChild(overlay);
    const statusText = overlay.querySelector("#status-text");

    const central = document.createElement("div");
    central.className =
        "max-w-6xl mx-auto px-3 py-4 flex flex-col gap-4 text-slate-50";
    central.innerHTML = `
    <header class="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
      <div>
        <h1 class="text-xl font-semibold text-slate-100">Player Perspective</h1>
        <p class="text-xs text-slate-400 mt-0.5">
          Steam ID: <span id="persp-steam-id" class="font-mono text-sky-300"></span>
        </p>
      </div>
      <div class="flex flex-wrap gap-2 items-center" id="window-selector"></div>
    </header>
    <div id="map-selector"></div>
    <main class="flex flex-col gap-4">
      <section id="overview-section" class="bg-slate-950/40 rounded-xl border border-slate-800/90 p-3 md:p-4 shadow-sm"></section>
      <section id="detail-section"></section>
    </main>
  `;
    root.appendChild(central);

    const steamIdSpan = central.querySelector("#persp-steam-id");
    steamIdSpan.textContent = steamId || "(unknown)";

    const windowSelectorContainer =
        central.querySelector("#window-selector");
    const mapSelectorContainer = central.querySelector("#map-selector");
    const overviewSection = central.querySelector("#overview-section");
    const detailSection = central.querySelector("#detail-section");

    mountWindowSelector(windowSelectorContainer, currentWindow);

    async function loadData() {
        statusText.textContent = "Loading matches…";
        allMatches = await fetchMatchesForPlayer(steamId);
        statusText.textContent = "Loading analyses…";
        const ids = allMatches.map(m => m.id);
        allAnalyses = await fetchAnalysesForMatches(ids);
        statusText.textContent = "Rendering…";
        recomputeAndRender();
        setTimeout(() => {
            overlay.style.opacity = "0";
            overlay.style.pointerEvents = "none";
        }, 400);
    }

    function recomputeAndRender() {
        const slicedMatches =
            currentWindow === WINDOW_ALL
                ? allMatches
                : allMatches.slice(0, currentWindow);

        const metrics = aggregateMetrics(
            steamId,
            slicedMatches,
            allAnalyses,
            currentMapId,
            currentEloBandSet
        );

        mountWindowSelector(windowSelectorContainer, currentWindow);
        mountMapSelector(mapSelectorContainer, allMatches, currentMapId);

        const eloBandChipsContainer = document.getElementById("elo-band-chips");
        if (eloBandChipsContainer) {
            mountEloBandChips(eloBandChipsContainer, currentEloBandSet);
        }

        mountOverview(metrics, overviewSection);
        mountMapsAndOpponents(metrics, detailSection);

        const rowsContainer = central;
        rowsContainer.querySelectorAll(".tip").forEach(el => {
            const tipText = el.getAttribute("data-tip");
            if (!tipText) return;
            el.addEventListener("mouseenter", () => {
                const rect = el.getBoundingClientRect();
                let tip = document.createElement("div");
                tip.className =
                    "fixed z-40 max-w-xs px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[11px] text-slate-100 shadow-lg pointer-events-none";
                tip.textContent = tipText;
                document.body.appendChild(tip);
                const tipRect = tip.getBoundingClientRect();
                const top = rect.top - tipRect.height - 6;
                const left = Math.min(
                    Math.max(rect.left, 4),
                    window.innerWidth - tipRect.width - 4
                );
                tip.style.top = `${Math.max(top, 4)}px`;
                tip.style.left = `${left}px`;
                el._liveTooltip = tip;
            });
            el.addEventListener("mouseleave", () => {
                if (el._liveTooltip) {
                    document.body.removeChild(el._liveTooltip);
                    el._liveTooltip = null;
                }
            });
        });

        mountRevealAnimations(central);
    }

    windowSelectorContainer.addEventListener("click", evt => {
        const chip = evt.target.closest(".window-chip");
        if (!chip) return;
        const value = Number(chip.getAttribute("data-window"));
        currentWindow = value;
        recomputeAndRender();
    });

    mapSelectorContainer.addEventListener("click", evt => {
        const chip = evt.target.closest(".map-chip");
        if (!chip) return;
        const mapIdStr = chip.getAttribute("data-map-id");
        currentMapId = mapIdStr === "all" ? null : mapIdStr;
        recomputeAndRender();
    });

    document.addEventListener("click", evt => {
        const chip = evt.target.closest(".elo-band-chip");
        if (!chip) return;
        const min = Number(chip.getAttribute("data-min"));
        if (currentEloBandSet.has(min)) {
            currentEloBandSet.delete(min);
        } else {
            currentEloBandSet.add(min);
        }
        recomputeAndRender();
    });

    loadData().catch(err => {
        console.error("Error loading perspective:", err);
        statusText.textContent = "Error loading perspective.";
    });

    const contentRoot = central;
    const observer = new ResizeObserver(() => {
        const rowsContainer = contentRoot;
        const cards = rowsContainer.querySelectorAll(".section-card");
        cards.forEach(card => {
            if (!card._observed) {
                card._observed = true;
            }
        });
    });
    observer.observe(contentRoot);

    window.addEventListener("focus", () => {
        mountRevealAnimations(contentRoot);
        mountDaypartTabs(contentRoot);
    });

    let resizeTimer = null;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            recomputeAndRender();
        }, 120);
    });
}

document.addEventListener("DOMContentLoaded", initializePerspectivePage);
