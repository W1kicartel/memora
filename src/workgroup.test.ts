/**
 * Dependency-free tests for the workgroup logic.
 * Run with:  npx tsx src/workgroup.test.ts
 */
import {
  createGroup,
  encodeInvite,
  decodeInvite,
  mergeGroups,
  joinGroup,
  type Workgroup,
  type Profile,
} from "./workgroup";

let passed = 0;
let failed = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) passed++;
  else {
    failed++;
    console.error("  ✗ FAIL:", msg);
  }
}

const anna: Profile = { id: "u-anna", name: "Anna" };
const luca: Profile = { id: "u-luca", name: "Luca" };

// --- createGroup -------------------------------------------------------------
{
  const g = createGroup("  Psicologia 2026  ", " ripasso condiviso ", anna);
  assert(g.name === "Psicologia 2026", "createGroup trims the name");
  assert(g.description === "ripasso condiviso", "createGroup trims the description");
  assert(g.members.length === 1 && g.members[0].role === "owner", "creator is the owner");
  assert(g.folders.length === 0, "new group starts with no folders");
}

// --- invite round-trip -------------------------------------------------------
{
  const g = createGroup("Neuroscienze — Kandel & co. 🧠", "", anna);
  g.folders.push({
    id: "f1",
    name: "Dispense",
    items: [{ id: "i1", kind: "note", title: "Città però — àèìòù", content: "unicode ✓", addedBy: "Anna", addedAt: 1 }],
  });
  const link = encodeInvite(g);
  assert(link.startsWith("memora://join/"), "invite link carries the memora://join/ prefix");
  const back = decodeInvite(link);
  assert(back !== null, "invite decodes");
  assert(back!.id === g.id && back!.name === g.name, "group identity survives the round-trip");
  assert(back!.folders[0].items[0].title === "Città però — àèìòù", "unicode content survives");
  // A bare code (no prefix) also decodes — users often lose the scheme when pasting.
  const bare = link.slice("memora://join/".length);
  assert(decodeInvite(bare)?.id === g.id, "bare code without prefix decodes too");
  // Raw bundle JSON decodes as well (exported-file path).
  assert(decodeInvite(JSON.stringify({ v: 1, group: g }))?.id === g.id, "raw bundle JSON decodes");
}

// --- decode rejects garbage --------------------------------------------------
{
  assert(decodeInvite("not an invite at all") === null, "garbage → null");
  assert(decodeInvite("memora://join/%%%%") === null, "broken base64 → null");
  assert(decodeInvite('{"v":1,"group":{"id":""}}') === null, "invalid group shape → null");
}

// --- mergeGroups -------------------------------------------------------------
{
  const a = createGroup("Gruppo", "", anna);
  a.folders.push({ id: "f1", name: "Slides", items: [{ id: "i1", kind: "link", title: "L1", content: "https://x", addedBy: "Anna", addedAt: 1 }] });

  const b: Workgroup = JSON.parse(JSON.stringify(a));
  b.members.push({ id: luca.id, name: luca.name, role: "member", joinedAt: 2 });
  b.folders[0].items.push({ id: "i2", kind: "note", title: "N1", content: "appunti", addedBy: "Luca", addedAt: 3 });
  b.folders.push({ id: "f2", name: "Esercizi", items: [] });

  const m = mergeGroups(a, b);
  assert(m.members.length === 2, "merge unions members");
  assert(m.folders.length === 2, "merge unions folders");
  assert(m.folders[0].items.length === 2, "merge unions items inside a folder");

  const again = mergeGroups(m, b);
  assert(again.members.length === 2 && again.folders[0].items.length === 2, "merge is idempotent");
}

// --- joinGroup ---------------------------------------------------------------
{
  const g = createGroup("Da invito", "", anna);
  const joined = joinGroup([], g, luca);
  assert(joined.length === 1, "joining a new group adds it");
  assert(joined[0].members.some((m) => m.id === luca.id && m.role === "member"), "joiner becomes a member");

  const rejoined = joinGroup(joined, g, luca);
  assert(rejoined[0].members.filter((m) => m.id === luca.id).length === 1, "re-joining does not duplicate the member");
}

console.log(`\nWorkgroup tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
