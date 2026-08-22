/**
 * Imperial Super Sixes — master team/player list.
 * Used only to pre-fill the New Match screen's Team dropdown and roster
 * textarea (pick a team, its players auto-fill) — both stay fully editable
 * afterward, since a squad here may have more names than the 6 who actually
 * play a given match (just delete whoever's sitting out that game).
 * Update this file if teams/players change before or during the day.
 */
export const TEAMS = [
    { name: 'Crabtree CC', players: ['S. Arun', 'B. James', 'G. John', 'J. Grabinar', 'M. Gummow', 'S. Kanakala', 'S. Sureshkumar'] },
    { name: 'Mumbai Indians Imperial', players: ['J. Hryb', 'A. Athawale', 'A. Lobo', 'D. Sheth', 'H. Toha', 'I. Mayor'] },
    { name: 'Take Em Deep', players: ['R. Shah', 'D. Shah', 'D. Trivedi', 'K. Singh', 'M. Manoj', 'M. Padmanabhan', 'R. Shenoy'] },
    { name: 'Fable 6', players: ['H. Tyagi', 'D. Gajjar', 'H. Shah', 'H. Talati', 'S. Jain', 'S. Kapoor'] },
    { name: 'Redback Rapscallions', players: ['C. Deane', 'A. Srivastav', 'C. Miller', 'H. Whiteley', 'V. Thakrar'] },
    { name: 'Sunrisers Harlington', players: ['A. Menon', 'A. Riaz', 'J. Dickerson', 'M. Ganesh', 'R. Anandkar', 'S. Sajjad', 'V. Venkat'] },
];

export function rosterForTeamName(teamName) {
    const team = TEAMS.find(t => t.name === teamName);
    return team ? team.players : [];
}
