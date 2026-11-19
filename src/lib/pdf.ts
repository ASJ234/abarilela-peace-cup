import { PDFDocument, type PDFFont, type PDFPage, StandardFonts, rgb } from "pdf-lib";
import { formatDate } from "./format";
import type { Match } from "./types";

/**
 * Fixture lists as a printable PDF (A4 landscape): one section per team, each starting
 * on a new page, with its matches in date order. Uses the PDF built-in Helvetica, so
 * text outside its character set (e.g. emoji) is simplified or replaced.
 */

export type TeamFixtures = {
  team: { name: string; coach: string | null };
  groupName: string | null;
  matches: Match[];
  teamId: number;
};

const PAGE: [number, number] = [841.89, 595.28]; // A4 landscape, in points
const MARGIN = 36;
const ROW_H = 20;
const BRAND = rgb(0.06, 0.4, 0.27);
const MUTED = rgb(0.4, 0.44, 0.5);
const LINE = rgb(0.86, 0.89, 0.92);
const ZEBRA = rgb(0.96, 0.97, 0.98);

const COLUMNS = [
  { key: "round", label: "Round", width: 95 },
  { key: "date", label: "Date", width: 100 },
  { key: "kickoff", label: "Kick-off", width: 50 },
  { key: "side", label: "H/A", width: 32 },
  { key: "opponent", label: "Opponent", width: 168 },
  { key: "venue", label: "Venue", width: 125 },
  { key: "referee", label: "Referee", width: 120 },
  { key: "result", label: "Result", width: 79 },
] as const;
type Column = (typeof COLUMNS)[number]["key"];

/** Characters Helvetica (WinAnsi) can draw besides printable ASCII and Latin-1. */
const EXTRA = new Set("–—‘’“”•…€‚„†‡ˆ‰Š‹ŒŽ˜™š›œžŸ");

/** Keeps text drawable: accents are kept where possible, anything else becomes "?". */
export function pdfSafe(text: string): string {
  let out = "";
  for (const ch of text.replace(/\s+/g, " ")) {
    const code = ch.codePointAt(0)!;
    if ((code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) || EXTRA.has(ch)) {
      out += ch;
      continue;
    }
    const plain = ch.normalize("NFKD").replace(/[̀-ͯ]/g, "");
    out += /^[\x20-\x7e]+$/.test(plain) ? plain : "?";
  }
  return out.trim();
}

/** Cuts text with "…" so it fits the width. */
function fit(text: string, font: PDFFont, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(`${t}…`, size) > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function cells(m: Match, teamId: number): Record<Column, string> {
  const home = m.home.id === teamId;
  const opponent = home ? m.away.name : m.home.name;
  let result = "–";
  if (m.played) {
    const us = home ? m.homeScore! : m.awayScore!;
    const them = home ? m.awayScore! : m.homeScore!;
    result = `${us > them ? "W" : us < them ? "L" : "D"}  ${us}–${them}`;
  }
  const round = m.stage ?? [m.groupName, m.round > 0 ? `MD${m.round}` : null].filter(Boolean).join(" · ");
  return {
    round: round || "–",
    date: formatDate(m.date),
    kickoff: m.kickoff ?? "–",
    side: home ? "H" : "A",
    opponent,
    venue: m.venue ?? "–",
    referee: m.referee ?? "–",
    result,
  };
}

export async function fixturesPdf(input: { seasonName: string; teams: TeamFixtures[]; generatedOn: string }): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const title = input.teams.length === 1
    ? `${input.teams[0].team.name} fixtures – ${input.seasonName}`
    : `${input.seasonName} fixtures by team`;
  doc.setTitle(pdfSafe(title));
  doc.setAuthor("Abarilela Peace Cup");
  doc.setCreator("Abarilela Peace Cup");
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const [width, height] = PAGE;
  const tableWidth = COLUMNS.reduce((s, c) => s + c.width, 0);

  const text = (page: PDFPage, s: string, x: number, y: number, opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; maxWidth?: number } = {}) => {
    const size = opts.size ?? 9;
    const f = opts.font ?? font;
    const safe = pdfSafe(s);
    page.drawText(opts.maxWidth ? fit(safe, f, size, opts.maxWidth) : safe, { x, y, size, font: f, color: opts.color ?? rgb(0.1, 0.12, 0.15) });
  };

  const tableHeader = (page: PDFPage, y: number) => {
    page.drawRectangle({ x: MARGIN, y: y - 6, width: tableWidth, height: ROW_H, color: BRAND });
    let x = MARGIN;
    for (const c of COLUMNS) {
      text(page, c.label, x + 5, y, { font: bold, size: 8.5, color: rgb(1, 1, 1), maxWidth: c.width - 8 });
      x += c.width;
    }
    return y - ROW_H;
  };

  for (const t of input.teams) {
    let page = doc.addPage(PAGE);
    const played = t.matches.filter((m) => m.played).length;

    const pageTop = (p: PDFPage, continued: boolean) => {
      let y = height - MARGIN - 4;
      text(p, "ABARILELA PEACE CUP", MARGIN, y, { font: bold, size: 9, color: BRAND });
      text(p, input.seasonName, MARGIN + 130, y, { size: 9, color: MUTED, maxWidth: width - 2 * MARGIN - 130 });
      y -= 26;
      text(p, `${t.team.name}${continued ? " (continued)" : ""}`, MARGIN, y, { font: bold, size: 20, maxWidth: width - 2 * MARGIN });
      y -= 18;
      const sub = [
        t.groupName,
        t.team.coach ? `Coach: ${t.team.coach}` : null,
        `${t.matches.length} match${t.matches.length === 1 ? "" : "es"} · ${played} played`,
      ].filter(Boolean).join("   ·   ");
      text(p, sub, MARGIN, y, { size: 10, color: MUTED, maxWidth: width - 2 * MARGIN });
      return y - 28;
    };

    let y = tableHeader(page, pageTop(page, false));
    if (t.matches.length === 0) {
      text(page, "No matches scheduled yet.", MARGIN + 5, y, { color: MUTED });
    }
    t.matches.forEach((m, i) => {
      if (y < MARGIN + 30) {
        page = doc.addPage(PAGE);
        y = tableHeader(page, pageTop(page, true));
      }
      if (i % 2 === 1) page.drawRectangle({ x: MARGIN, y: y - 6, width: tableWidth, height: ROW_H, color: ZEBRA });
      page.drawLine({ start: { x: MARGIN, y: y - 6 }, end: { x: MARGIN + tableWidth, y: y - 6 }, thickness: 0.5, color: LINE });
      const row = cells(m, t.teamId);
      let x = MARGIN;
      for (const c of COLUMNS) {
        const isKey = c.key === "opponent" || (c.key === "result" && m.played);
        text(page, row[c.key], x + 5, y, { font: isKey ? bold : font, size: 9, maxWidth: c.width - 8 });
        x += c.width;
      }
      y -= ROW_H;
    });
  }

  // Footer on every page: when it was made, and page numbers.
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    text(p, `Generated ${input.generatedOn}. Times and venues may change: check the website for the latest.`, MARGIN, MARGIN - 14, { size: 7.5, color: MUTED });
    const label = `Page ${i + 1} of ${pages.length}`;
    text(p, label, width - MARGIN - font.widthOfTextAtSize(label, 7.5), MARGIN - 14, { size: 7.5, color: MUTED });
  });

  return doc.save();
}
