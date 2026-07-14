// Geospatial-foundation assertions — package road rules + honest source manifest.
//   npm run test:geo
// Road/label/profile logic now lives in the portable package; this test verifies the
// locked rules there PLUS the AspectLead-level source manifest honesty.

import { motorwayLocked, validateRoadCoverage, ROAD_CLASS_MAPPINGS, LOCKED_DECISIONS } from "@geospatial-map";
import { GEOSPATIAL_SOURCES, isNationalCoverageReady, sourceById } from "../src/lib/geo/geospatial-source-manifest";

let failures = 0;
const assert = (cond: boolean, m: string) => { if (!cond) { console.error("  ✗ FAIL:", m); failures++; } else console.log("  ✓", m); };

console.log("Geospatial foundation checks:");

// 1. Motorways can never be switched off (package invariant).
assert(motorwayLocked(), "motorways are always-visible and cannot be disabled");
const mw = ROAD_CLASS_MAPPINGS.find((r) => r.applicationClass === "motorway")!;
assert(mw.userToggle === false && mw.defaultVisibility === "always", "motorway class has locked toggle");

// 2. Every OS Open Roads class maps (national readiness); unknown class fails.
const fullOsClasses = ["Motorway", "A Road", "B Road", "Minor Road", "Local Road", "Local Access Road", "Restricted Local Access Road", "Secondary Access Road", "Private Road - Publicly Accessible", "Private Road - Restricted Access", "Track"];
assert(validateRoadCoverage(fullOsClasses).ok, "every OS Open Roads class maps to a style (no permanent omission)");
assert(validateRoadCoverage(["Unclassified", "Not Classified", "Unknown", "Classified Unnumbered"]).ok, "road_classification aliases all map");
assert(validateRoadCoverage(["Imaginary Road"]).ok === false, "an unmapped road class is reported as a coverage failure");

// 3. minzoom rises from motorway → A → B → track (zoom-dependent detail).
const a = ROAD_CLASS_MAPPINGS.find((r) => r.applicationClass === "a_road")!;
const b = ROAD_CLASS_MAPPINGS.find((r) => r.applicationClass === "b_road")!;
const track = ROAD_CLASS_MAPPINGS.find((r) => r.applicationClass === "track")!;
assert(mw.minZoom <= a.minZoom && a.minZoom <= b.minZoom && b.minZoom <= track.minZoom, "road minZoom rises motorway → A → B → track");

// 4. Locked decisions recorded in the package.
assert(LOCKED_DECISIONS.some((d) => /Motorways are always visible/i.test(d)), "locked decision: motorways always visible");
assert(LOCKED_DECISIONS.some((d) => /never limits national browsing/i.test(d)), "locked decision: territory never limits browsing");
assert(LOCKED_DECISIONS.some((d) => /No application-specific rule/i.test(d)), "locked decision: no application rule becomes generic map logic");

// 5. Manifest — national (GB) coverage imported + verified; NI honest gap; no OGL data committed.
assert(isNationalCoverageReady() === true, "national (GB) coverage is ready (basemap + roads + postcodes imported)");
assert(sourceById("os-open-zoomstack")!.status === "available", "OS Open Zoomstack available");
assert(sourceById("os-open-roads")!.status === "available", "OS Open Roads available (national)");
assert(sourceById("ni-gap")!.status === "missing", "Northern Ireland honestly marked a gap");
assert(GEOSPATIAL_SOURCES.every((s) => s.repositoryStorageAllowed !== true), "no OS source is repo-storable (tiles in object storage, never git)");

console.log(failures === 0 ? "\nAll geospatial-foundation assertions passed ✓" : `\n${failures} assertion(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);
