/**
 * conceptmap.tsx — schematic renderer for AI-generated concept maps.
 *
 * The Study Engine emits maps as a ```conceptmap JSON fence (see the schema in
 * claude.ts). Instead of showing raw code, this component draws them the way
 * the mnemonic techniques prescribe:
 *
 *   • CHUNKING     — concepts live inside labelled clusters of 3-5 (Miller 1956)
 *   • METHOD OF LOCI — every concept shows its vivid-image hook (🧠)
 *   • ACRONYMS     — a chunk's mnemonic initials render as a badge
 *
 * Layout is pure CSS (central topic → cluster grid → cross-links), so it stays
 * dependency-free and renders instantly.
 */

import { extractJson } from "./jsonx";

export interface CMConcept {
  name: string;
  mnemo?: string;
}

export interface CMChunk {
  label: string;
  acronym?: string;
  concepts: CMConcept[];
}

export interface CMLink {
  from: string;
  to: string;
  label?: string;
}

export interface ConceptMapData {
  title: string;
  chunks: CMChunk[];
  links?: CMLink[];
}

/** Parse the body of a ```conceptmap fence. Null if it isn't a usable map. */
export function parseConceptMap(body: string): ConceptMapData | null {
  const raw = extractJson<ConceptMapData>(body);
  if (!raw || typeof raw.title !== "string" || !Array.isArray(raw.chunks)) return null;
  const chunks = raw.chunks
    .filter((c) => c && typeof c.label === "string" && Array.isArray(c.concepts))
    .map((c) => ({
      label: c.label,
      acronym: typeof c.acronym === "string" && c.acronym.trim() ? c.acronym.trim() : undefined,
      concepts: c.concepts
        .filter((k) => k && typeof k.name === "string" && k.name.trim())
        .map((k) => ({ name: k.name.trim(), mnemo: typeof k.mnemo === "string" ? k.mnemo.trim() : undefined })),
    }))
    .filter((c) => c.concepts.length > 0);
  if (chunks.length === 0) return null;
  const links = Array.isArray(raw.links)
    ? raw.links.filter((l) => l && typeof l.from === "string" && typeof l.to === "string")
    : [];
  return { title: raw.title.trim(), chunks, links };
}

/** Rotating accent hues for the cluster headers. */
const CHUNK_HUES = [232, 262, 200, 160, 28, 320];

export function ConceptMapView({ data }: { data: ConceptMapData }) {
  return (
    <figure className="cmap" aria-label={`Mappa concettuale: ${data.title}`}>
      <div className="cmap-title">{data.title}</div>
      <div className="cmap-stem" aria-hidden="true" />

      <div className="cmap-chunks">
        {data.chunks.map((chunk, ci) => {
          const hue = CHUNK_HUES[ci % CHUNK_HUES.length];
          return (
            <section
              key={ci}
              className="cmap-chunk"
              style={{ ["--chunk-hue" as string]: hue }}
            >
              <header className="cmap-chunk-head">
                <span className="cmap-chunk-label">{chunk.label}</span>
                {chunk.acronym && <span className="cmap-acronym">{chunk.acronym}</span>}
              </header>
              <ul className="cmap-concepts">
                {chunk.concepts.map((c, ki) => (
                  <li key={ki} className="cmap-concept">
                    <span className="cmap-concept-name">{c.name}</span>
                    {c.mnemo && <span className="cmap-mnemo">🧠 {c.mnemo}</span>}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {data.links && data.links.length > 0 && (
        <ul className="cmap-links" aria-label="collegamenti trasversali">
          {data.links.map((l, i) => (
            <li key={i} className="cmap-link">
              <span className="cmap-link-node">{l.from}</span>
              <span className="cmap-link-arrow">{l.label ? `—${l.label}→` : "→"}</span>
              <span className="cmap-link-node">{l.to}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
