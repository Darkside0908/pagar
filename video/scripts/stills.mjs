// Style board: renders one still per key moment (half resolution) for review.
//   node scripts/stills.mjs [frame ...]
import path from "node:path";
import { mkdirSync } from "node:fs";
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";

const frames = process.argv.slice(2).map(Number);
const list = frames.length ? frames : [26, 100, 180, 288, 340, 452, 482, 612, 668, 760, 846, 912, 1046, 1135, 1232, 1340, 1392, 1500, 1526, 1625, 1700, 1765];
const serveUrl = await bundle({ entryPoint: path.resolve("src/index.ts") });
const composition = await selectComposition({ serveUrl, id: "PagarSilent" });
mkdirSync("out/stills", { recursive: true });
for (const frame of list) {
  await renderStill({ composition, serveUrl, frame, output: `out/stills/f${String(frame).padStart(4, "0")}.png`, scale: 0.5 });
  process.stdout.write(`${frame} `);
}
console.log("\ndone");
