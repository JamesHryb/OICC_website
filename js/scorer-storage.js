/**
 * Imperial Super Sixes - Live Scorer local persistence.
 * Pure localStorage wrapper — every match auto-saves after each ball so a
 * refresh, crash, or dead signal never loses scoring progress.
 */

const PREFIX = 'ss_scorer_match_';

export function saveMatch(match) {
    localStorage.setItem(PREFIX + match.matchNo, JSON.stringify(match));
}

export function loadMatch(matchNo) {
    const raw = localStorage.getItem(PREFIX + matchNo);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function deleteMatch(matchNo) {
    localStorage.removeItem(PREFIX + matchNo);
}

export function listSavedMatches() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith(PREFIX)) continue;
        try {
            const match = JSON.parse(localStorage.getItem(key));
            out.push({
                matchNo: match.matchNo, round: match.round,
                teamA: match.teamA, teamB: match.teamB,
                inningsCount: match.innings.length,
                updatedAt: match.updatedAt,
                archived: !!match.archived,
                ended: !!match.ended,
                abandoned: !!match.abandoned,
            });
        } catch { /* skip corrupt entry */ }
    }
    return out.sort((a, b) => a.matchNo - b.matchNo);
}
