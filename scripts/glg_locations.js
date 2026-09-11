import { fromFrostbite } from "./glg_map.js";

/* Round data for Glass Location Guesser.
 *
 * Coordinates are RAW FROSTBITE values, exactly as read in-game: Y-up, metres,
 * no conversion applied. fromFrostbite() handles the axis change and the 1:100
 * scale at read time. Keeping the stored form identical to what the game prints
 * means a location can be pasted in without arithmetic, and can always be
 * checked back against the game later.
 *
 *   id         stable slug. Used for save data and for sharing a round by URL,
 *              so treat it as permanent once a location ships.
 *   image      single still. Fine on its own - the viewer treats a flat image
 *              as a panorama that cannot be looked around.
 *   faces      optional cubemap { px, nx, py, ny, pz, nz }. When present the
 *              viewer uses it and ignores `image`.
 *   position   [x, y, z] in Frostbite coordinates.
 *   heading    degrees the camera faced when captured. Needed to orient a
 *              cubemap; worth recording for stills too, since it is impossible
 *              to recover afterwards.
 *   district   for district-only modes and for the result screen.
 *   difficulty 1..5, for curated sets.
 */
export const LOCATIONS = [
    {
        id: "regatta-bay-waterfront",
        image: "images/glg/locations/regatta-bay-waterfront.jpg",
        position: [1017.928711, 116.246872, -147.650406],
        heading: 0,
        district: "The View",
        difficulty: 2
    }
];

const BY_ID = new Map(LOCATIONS.map((l) => [l.id, l]));

export function getLocation(id) {
    return BY_ID.get(id) || null;
}

/* Frostbite position as model-space coordinates, ready for addMarker, scoring
   or anything else that speaks the map's own space. */
export function locationPosition(location) {
    return fromFrostbite(
        location.position[0],
        location.position[1],
        location.position[2]
    );
}

/* Roughly the playable extent of Glass in model units, from the district
   centroids plus headroom. Only used to catch data entry mistakes - a dropped
   or misplaced decimal puts a location in the ocean or outside the map
   entirely, and that is otherwise invisible until the round is played. */
const PLAYABLE = { minX: -10, maxX: 16, minY: -13, maxY: 9 };

export function validateLocations(locations = LOCATIONS) {
    const problems = [];
    const seen = new Set();

    for (const l of locations) {
        if (!l.id) {
            problems.push("entry with no id: " + JSON.stringify(l));
            continue;
        }
        if (seen.has(l.id)) problems.push(l.id + ": duplicate id");
        seen.add(l.id);

        if (!l.image && !l.faces) problems.push(l.id + ": neither image nor faces");
        if (!Array.isArray(l.position) || l.position.length !== 3) {
            problems.push(l.id + ": position must be [x, y, z]");
            continue;
        }
        if (l.position.some((n) => typeof n !== "number" || !isFinite(n))) {
            problems.push(l.id + ": position has a non-numeric component");
            continue;
        }

        const p = locationPosition(l);
        if (p.x < PLAYABLE.minX || p.x > PLAYABLE.maxX ||
            p.y < PLAYABLE.minY || p.y > PLAYABLE.maxY) {
            problems.push(
                l.id + ": lands outside Glass at model (" +
                p.x.toFixed(2) + ", " + p.y.toFixed(2) + ") - check for a lost decimal"
            );
        }
    }

    return problems;
}
