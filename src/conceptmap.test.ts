/**
 * Dependency-free tests for concept-map parsing (rendering is covered by tsc).
 * Run with:  npx tsx src/conceptmap.test.ts
 */
import { parseConceptMap } from "./conceptmap";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

const VALID = JSON.stringify({
  title: "Teorie delle emozioni",
  chunks: [
    {
      label: "Teorie periferiche",
      acronym: "JL-CB",
      concepts: [
        { name: "James-Lange (1884)", mnemo: "un cuore che corre PRIMA della paura" },
        { name: "Cannon-Bard (1927)", mnemo: "talamo che spara due frecce insieme" },
      ],
    },
    {
      label: "Teorie cognitive",
      concepts: [{ name: "Schachter-Singer (1962)", mnemo: "adrenalina + etichetta" }],
    },
  ],
  links: [{ from: "James-Lange (1884)", to: "Cannon-Bard (1927)", label: "critica" }],
});

{
  const m = parseConceptMap(VALID);
  assert(m !== null, "valid map parses");
  assert(m!.title === "Teorie delle emozioni", "title preserved");
  assert(m!.chunks.length === 2, "chunks preserved");
  assert(m!.chunks[0].acronym === "JL-CB", "acronym preserved");
  assert(m!.chunks[0].concepts[0].mnemo?.includes("cuore") === true, "loci hook preserved");
  assert(m!.links!.length === 1 && m!.links![0].label === "critica", "links preserved");
}

{
  assert(parseConceptMap("non è json") === null, "garbage → null");
  assert(parseConceptMap('{"title":"x","chunks":[]}') === null, "no usable chunks → null");
  assert(
    parseConceptMap('{"title":"x","chunks":[{"label":"a","concepts":[{"name":"  "}]}]}') === null,
    "chunks with only empty concepts → null",
  );
  // Empty-name concepts are dropped but the chunk survives if others remain.
  const mixed = parseConceptMap(
    '{"title":"x","chunks":[{"label":"a","concepts":[{"name":""},{"name":"ok"}]}]}',
  );
  assert(mixed !== null && mixed.chunks[0].concepts.length === 1, "empty concepts filtered out");
}

console.log(`\nConceptmap tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
