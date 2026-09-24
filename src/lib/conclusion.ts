// The conclusion, block by block (spec v3 §3). Pure: it decides which blocks appear and
// with what, so the wording stays in the message files and the rules can be tested.
import { allStrong, scoresOf, type MapResult, type Pillar } from "./scoring.ts";

/** Her own words and her name. They never leave her device in Phase 1. */
export type Personal = {
  name: string; // C0
  vision: string; // J3
  question: string; // J5
  shareConsent: boolean;
};

export const emptyPersonal = (): Personal => ({ name: "", vision: "", question: "", shareConsent: false });

export type Block =
  /** 1 · her Map: the wheel and the bars. */
  | { id: "map"; name: string }
  /** 2 · the two areas with the least support; `strong` when nothing is actually low. */
  | { id: "focus"; a: Pillar; b: Pillar; strong: boolean }
  /** 3 · the connection between what she came for and her two pillars. */
  | { id: "connection"; topics: string[]; a: Pillar; b: Pillar }
  /** 4 · it was not her fault. */
  | { id: "notYou"; tried: string[]; obstacles: string[]; nothingTried: boolean }
  /** 5 · what Equilibrar does about each of her two pillars. */
  | { id: "howWeWork"; pillars: [Pillar, Pillar] }
  /** 6 · where everyone begins, plus the treatment line when she said yes. */
  | { id: "begin"; a: Pillar; focusIsClaim: boolean; inTreatment: boolean }
  /** 7 · her own 90-day words, and/or how long she has carried this. */
  | { id: "herWords"; vision: string; duration: string | null }
  /** 8 · one thing to try this week. */
  | { id: "thisWeek"; a: Pillar }
  /** The all-strong case: nothing is low, so the work is protecting it. */
  | { id: "allStrong" };

const LONG = ["1-3y", "gt3y"];

export function conclusionBlocks(result: MapResult, personal: Personal): Block[] {
  const strong = allStrong(scoresOf(result));
  const a = result.focus_pillar;
  const b = result.second_pillar;
  const nothingTried = result.tried.length > 0 && result.tried.every((t) => t === "nothing");
  const blocks: Block[] = [{ id: "map", name: personal.name.trim() }];

  if (strong) {
    // "Your Map is strong across the board — the work now is protecting it." It comes before
    // block 2, so she is never told an area is her lowest and a strength in the same breath.
    // Blocks 3 and 4 would be untrue here, so they are left out (spec §5).
    blocks.push({ id: "allStrong" }, { id: "focus", a, b, strong: true });
  } else {
    blocks.push({ id: "focus", a, b, strong: false });
    if (result.focus_topics.length > 0) {
      blocks.push({ id: "connection", topics: [...result.focus_topics], a, b });
    }
    blocks.push({
      id: "notYou",
      tried: result.tried.filter((t) => t !== "nothing"),
      obstacles: result.obstacles,
      nothingTried,
    });
  }

  blocks.push({ id: "howWeWork", pillars: [a, b] });
  blocks.push({
    id: "begin",
    a,
    focusIsClaim: a === "space" || a === "routine",
    inTreatment: result.in_treatment === "yes",
  });

  // Block 7 is left out rather than filled with a generic line (spec §3) — but if she has
  // carried this for a year or more, that line still belongs on the result even when she
  // wrote nothing (review 3, concern A).
  const longDuration = LONG.includes(result.duration ?? "") ? result.duration : null;
  if (personal.vision.trim() || longDuration) {
    blocks.push({ id: "herWords", vision: personal.vision.trim(), duration: longDuration });
  }

  blocks.push({ id: "thisWeek", a });
  return blocks;
}
