/**
 * Imperial Super Sixes — master team/player list.
 * Used only to pre-fill the New Match screen's Team dropdown and roster
 * textarea (pick a team, its players auto-fill) — both stay fully editable
 * afterward, since a squad here may have more names than the 6 who actually
 * play a given match (just delete whoever's sitting out that game).
 * Update this file if teams/players change before or during the day.
 */
export const TEAMS = [
    { name: 'Crabtree CC', players: ['Suhas', 'Sree', 'Sid', 'Joel', 'George', 'Matt G', 'BJ'] },
    { name: 'Mumbai Indians Imperial', players: ['James H', 'Ameya', 'Sheth', 'Ashish', 'Ish', 'Haider'] },
    { name: 'Take Em Deep', players: ['Deep', 'Ro Shah', 'Ro Shen', 'Kamaljit', 'Dhyey', 'Mithun', 'Madhav'] },
    { name: 'Fable 6', players: ['Himanshu', 'Het', 'Henil', 'Shivannk', 'Darshil', 'Shivit'] },
    { name: 'Redback Rapscallions', players: ['Deano', 'Vik', 'Hogan', 'Lizzie', 'Ach', 'Chaz'] },
    { name: 'Sunrisers Harlington', players: ['Rohil', 'Saj', 'Tom H', 'Manny', 'Josh D', 'Ahad', 'Venkies'] },
];

export function rosterForTeamName(teamName) {
    const team = TEAMS.find(t => t.name === teamName);
    return team ? team.players : [];
}
