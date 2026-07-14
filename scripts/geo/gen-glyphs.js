// Production glyph generation for the map labels.
//
// Uses OPEN SANS (SIL Open Font Licence 1.1) shipped by @expo-google-fonts/open-sans
// — legally redistributable, generated glyphs permitted. Fully reproducible from a
// clean checkout (npm install → node scripts/geo/gen-glyphs.js); no manual files, no
// runtime download. Generated PBFs are deployed via the map asset pipeline / object
// storage (gitignored public/map/fonts in dev) and are NOT committed.
//
//   node scripts/geo/gen-glyphs.js            (or: npm run geo:glyphs)
const fontnik = require("fontnik");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "public/map/fonts");
const PKG = path.join(ROOT, "node_modules/@expo-google-fonts/open-sans");
const FONTS = [
  { stack: "Open Sans Regular", file: path.join(PKG, "400Regular/OpenSans_400Regular.ttf") },
  { stack: "Open Sans Bold", file: path.join(PKG, "700Bold/OpenSans_700Bold.ttf") },
];
// Unicode blocks for GB place/road/postcode labels (Latin + Welsh/Gaelic diacritics + punctuation).
const RANGES = [[0, 255], [256, 511], [512, 767], [768, 1023], [7680, 7935], [8192, 8447]];

async function main() {
  const meta = { font: "Open Sans", licence: "SIL Open Font License 1.1", source: "@expo-google-fonts/open-sans", generatedRanges: RANGES.length, stacks: [], files: [] };
  for (const { stack, file } of FONTS) {
    if (!fs.existsSync(file)) { console.error("Missing font (run `npm install`):", file); process.exit(1); }
    const font = fs.readFileSync(file);
    meta.files.push({ stack, ttf: path.relative(ROOT, file), sha256: crypto.createHash("sha256").update(font).digest("hex") });
    const dir = path.join(OUT, stack);
    fs.mkdirSync(dir, { recursive: true });
    for (const [start, end] of RANGES) {
      await new Promise((res, rej) => fontnik.range({ font, start, end }, (err, buf) => {
        if (err) return rej(err);
        fs.writeFileSync(path.join(dir, `${start}-${end}.pbf`), buf); res();
      }));
    }
    meta.stacks.push(stack);
    console.log(`✓ ${stack}: ${RANGES.length} ranges → ${path.relative(ROOT, dir)}`);
  }
  // Record reproducible metadata + source checksums in the repo (the glyphs themselves are not committed).
  fs.writeFileSync(path.join(ROOT, "docs/data-sources/font-glyph-metadata.json"), JSON.stringify(meta, null, 2) + "\n");
  console.log("Glyphs ready (gitignored public/map/fonts). Metadata → docs/data-sources/font-glyph-metadata.json");
  console.log("Licence text: docs/data-sources/OFL-OpenSans.txt");
}
main().catch((e) => { console.error(e); process.exit(1); });
