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
  googleCalendarUrl,
  eventToICS,
  type Workgroup,
  type Profile,
  type GroupEvent,
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

// --- events merge ------------------------------------------------------------
{
  const a = createGroup("Con eventi", "", anna);
  a.events!.push({ id: "e1", title: "Sessione in biblioteca", date: "2026-09-01", time: "15:00", createdBy: "Anna", createdAt: 1 });

  const b: Workgroup = JSON.parse(JSON.stringify(a));
  b.events!.push({ id: "e2", title: "Aperitivo post-esame", date: "2026-09-10", createdBy: "Luca", createdAt: 2 });

  const m = mergeGroups(a, b);
  assert((m.events ?? []).length === 2, "merge unions events");
  assert((mergeGroups(m, b).events ?? []).length === 2, "event merge is idempotent");

  // Snapshots from versions that predate events must merge without loss.
  const legacy: Workgroup = { ...a, events: undefined };
  assert((mergeGroups(legacy, b).events ?? []).length === 2, "legacy local + events incoming keeps events");
  assert((mergeGroups(b, legacy).events ?? []).length === 2, "events local + legacy incoming keeps events");

  // And the invite round-trip carries events along.
  const back = decodeInvite(encodeInvite(m));
  assert((back?.events ?? []).length === 2, "events survive the invite round-trip");
}

// --- chat merge --------------------------------------------------------------
{
  const a = createGroup("Con chat", "", anna);
  a.chat!.push({ id: "m1", kind: "text", text: "Chi c'è domani?", author: "Anna", at: 10 });

  const b: Workgroup = JSON.parse(JSON.stringify(a));
  b.chat!.push({ id: "m2", kind: "gif", text: "thumbs up", media: "https://media.tenor.com/x.gif", author: "Luca", at: 5 });

  const m = mergeGroups(a, b);
  assert((m.chat ?? []).length === 2, "merge unions chat messages");
  assert(m.chat![0].id === "m2" && m.chat![1].id === "m1", "merged chat is sorted by timestamp");
  assert((mergeGroups(m, b).chat ?? []).length === 2, "chat merge is idempotent");

  const legacy: Workgroup = { ...a, chat: undefined };
  assert((mergeGroups(legacy, b).chat ?? []).length === 2, "legacy local + chat incoming keeps messages");
  assert((mergeGroups(b, legacy).chat ?? []).length === 2, "chat local + legacy incoming keeps messages");

  const back = decodeInvite(encodeInvite(m));
  assert((back?.chat ?? []).length === 2, "chat survives the invite round-trip");
  assert(back?.chat?.find((x) => x.id === "m2")?.media === "https://media.tenor.com/x.gif", "media url survives the round-trip");
}

// --- calendar bridges --------------------------------------------------------
{
  const ev: GroupEvent = {
    id: "e1", title: "Ripasso, cap. 3", date: "2026-09-01", time: "15:00",
    location: "Aula B", notes: "Portare appunti", createdBy: "Anna", createdAt: 1,
  };

  const url = googleCalendarUrl(ev, "Psico");
  assert(url.startsWith("https://calendar.google.com/calendar/render?"), "google link hits the template endpoint");
  assert(url.includes("20260901T150000%2F20260901T160000"), "timed event spans one hour");
  assert(url.includes("location=Aula+B") || url.includes("location=Aula%20B"), "google link carries the location");

  const allDay = googleCalendarUrl({ ...ev, time: undefined }, "Psico");
  assert(allDay.includes("20260901%2F20260902"), "all-day event uses date/date+1 bounds");

  const monthEnd = googleCalendarUrl({ ...ev, time: undefined, date: "2026-08-31" }, "Psico");
  assert(monthEnd.includes("20260831%2F20260901"), "all-day end rolls over month boundaries");

  const ics = eventToICS(ev, "Psico");
  assert(ics.includes("BEGIN:VEVENT") && ics.includes("END:VCALENDAR"), "ics has the calendar envelope");
  assert(ics.includes("SUMMARY:Ripasso\\, cap. 3"), "ics escapes commas in the summary");
  assert(ics.includes("DTSTART:20260901T150000") && ics.includes("DTEND:20260901T160000"), "ics timed bounds");

  const icsAllDay = eventToICS({ ...ev, time: undefined }, "Psico");
  assert(icsAllDay.includes("DTSTART;VALUE=DATE:20260901"), "ics all-day uses VALUE=DATE");

  const lateNight = eventToICS({ ...ev, time: "23:30" }, "Psico");
  assert(lateNight.includes("DTEND:20260901T235900"), "23:30 event clamps the end to the same day");
}

console.log(`\nWorkgroup tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
