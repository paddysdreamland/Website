import { fromFrostbite } from "./glg_map.js";

/* Round data for GlassGuessr.
 *
 * Coordinates are RAW FROSTBITE values, exactly as read in-game: Y-up, metres,
 * no conversion applied. fromFrostbite() handles the axis change and the 1:100
 * scale at read time, so a location can be pasted straight in without any
 * arithmetic and can always be checked back against the game later.
 *
 *   image       the screenshot for the round.
 *   position    [x, y, z] in Frostbite coordinates.
 *   difficulty  1..5, optional.
 */
export const LOCATIONS = [
    {
        image: "images/glg/locations/regatta-bay-waterfront.jpg",
        position: [1017.928711, 116.246872, -147.650406],
        difficulty: 2
    }
];

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
   or misplaced decimal puts a location in the ocean or off the map entirely,
   and that is otherwise invisible until the round comes up in play. */
const PLAYABLE = { minX: -10, maxX: 16, minY: -13, maxY: 9 };

export function validateLocations(locations = LOCATIONS) {
    const problems = [];
    const seen = new Set();

    for (const location of locations) {
        const name = location.image || JSON.stringify(location);

        if (!location.image) problems.push(name + ": no image");
        else if (seen.has(location.image)) problems.push(name + ": duplicate image");
        seen.add(location.image);

        if (!Array.isArray(location.position) || location.position.length !== 3) {
            problems.push(name + ": position must be [x, y, z]");
            continue;
        }
        if (location.position.some((n) => typeof n !== "number" || !isFinite(n))) {
            problems.push(name + ": position has a non-numeric component");
            continue;
        }

        const p = locationPosition(location);
        if (p.x < PLAYABLE.minX || p.x > PLAYABLE.maxX ||
            p.y < PLAYABLE.minY || p.y > PLAYABLE.maxY) {
            problems.push(
                name + ": lands outside Glass at model (" +
                p.x.toFixed(2) + ", " + p.y.toFixed(2) + ") - check for a lost decimal"
            );
        }
    }

    return problems;
}
