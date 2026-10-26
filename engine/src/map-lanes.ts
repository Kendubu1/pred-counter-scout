// Lane geometry for pred.gg world coordinates (kill `location`, structure
// `location`). Measured, not guessed: every lane polyline below runs through
// the tower positions pred.gg reports for destroyed structures, averaged over
// 1,264 located tower events in 122 committed films (2026-10-26, spread 0 per
// tower: structures are static). Dawn's base sits at +y, Dusk's at -y.
//
// Lane identity is physical and the same for both teams: the -x side lane is
// the duo lane (carry + support) and the +x side lane is the offlane. Checked
// against the first eight minutes of the same films: carry kill/death credits
// fell on the -x lane 397 times vs 0 on +x, offlane credits on +x 412 vs 3.
//
// A point far from all three polylines is jungle/river. THEORY at the edges:
// lanes have width, river crossings sit between lanes, and the cut-off below
// is a tuned radius, so a kill a few hundred units off a lane can read either way.

export type MapLane = 'duo' | 'mid' | 'offlane' | 'jungle';

type Pt = [number, number];
const LANES: Record<Exclude<MapLane, 'jungle'>, Pt[]> = {
  // dawn inhibitor -> inner -> outer -> dusk outer -> inner -> inhibitor
  duo: [[-2330, 13139], [-6327, 9954], [-10052, 6416], [-9946, -3459], [-5841, -7200], [-2735, -10077]],
  mid: [[981, 11698], [2106, 8056], [-995, 5145], [2592, -2060], [-588, -5155], [582, -8603]],
  offlane: [[4328, 13196], [7424, 10308], [11578, 7204], [11639, -4291], [7912, -6873], [3849, -10050]],
};
/** Distance (world units) inside which a point counts as on a lane. */
export const LANE_RADIUS = 2500;

/** The roles whose home is one lane. Jungle and support roam by design. */
export const HOME_LANE: Record<string, MapLane | undefined> = { carry: 'duo', support: 'duo', midlane: 'mid', offlane: 'offlane' };

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Distance from a point to each lane, nearest first. */
export function laneDistances(x: number, y: number): { lane: Exclude<MapLane, 'jungle'>; d: number }[] {
  return (Object.entries(LANES) as [Exclude<MapLane, 'jungle'>, Pt[]][])
    .map(([lane, pts]) => ({ lane, d: Math.min(...pts.slice(1).map((b, i) => segDist([x, y], pts[i]!, b))) }))
    .sort((a, b) => a.d - b.d);
}

/** Which lane a world point sits on, or 'jungle' when it is off every lane. */
export function laneOfPoint(x: number, y: number): MapLane {
  const [near] = laneDistances(x, y);
  return near && near.d <= LANE_RADIUS ? near.lane : 'jungle';
}

/** Whose half of the map a point is in: Dawn's base is +y. */
export function halfOfPoint(y: number): 'dawn' | 'dusk' {
  return y >= 1500 ? 'dawn' : 'dusk';
}

export const laneLabel = (l: MapLane) => (l === 'duo' ? 'duo lane' : l === 'mid' ? 'mid lane' : l === 'offlane' ? 'offlane' : 'jungle/river');
