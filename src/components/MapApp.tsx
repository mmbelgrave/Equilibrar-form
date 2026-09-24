"use client";

import { NextIntlClientProvider } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { About, CheckIn, Divider, JourneyScreen, Paths, Question, Result, Welcome } from "@/components/screens";
import type { Personal } from "@/lib/conclusion";
import { FLAT_MESSAGES, HTML_LANG, MESSAGES, PATHS, type Locale } from "@/lib/i18n";
import {
  CONTEXT_KEYS,
  QUESTIONS_PER_PILLAR,
  QUESTION_COUNT,
  buildResult,
  contextComplete,
  isComplete,
  journeyComplete,
  triedNothing,
  type Answer,
  type Context,
  type Journey,
} from "@/lib/scoring";
import {
  ABOUT_LENGTH,
  FLOW_LENGTH,
  JOURNEY_LENGTH,
  emptyState,
  loadLocale,
  loadState,
  saveLocale,
  saveState,
  type SavedState,
  type Screen,
} from "@/lib/storage";

/** Flow positions: each pillar is a divider followed by its four statements (6 × 5 = 30). */
const posToQuestion = (pos: number) => {
  const within = pos % (QUESTIONS_PER_PILLAR + 1);
  return within === 0 ? null : Math.floor(pos / (QUESTIONS_PER_PILLAR + 1)) * QUESTIONS_PER_PILLAR + within - 1;
};
const questionToPos = (q: number) =>
  Math.floor(q / QUESTIONS_PER_PILLAR) * (QUESTIONS_PER_PILLAR + 1) + (q % QUESTIONS_PER_PILLAR) + 1;
const posToPillarIndex = (pos: number) => Math.floor(pos / (QUESTIONS_PER_PILLAR + 1));

/** "About you" position of each context answer: C0 name is 1, C1 is 2 … C8 is 9. */
const CONTEXT_AT_POS = [null, null, ...CONTEXT_KEYS] as const;

/** Where "Continue where I stopped" goes: the first thing not answered yet. */
function resumePoint(s: SavedState): Pick<SavedState, "screen" | "pos"> {
  const c = CONTEXT_KEYS.findIndex((k) => (k === "topics" ? s.context.topics.length === 0 : s.context[k] === null));
  if (c !== -1) return { screen: "about", pos: c + 2 };
  const q = s.answers.findIndex((a) => a === null);
  // The first statement of a pillar is resumed at its divider, where the pillar is taught.
  if (q !== -1) return { screen: "flow", pos: questionToPos(q) - (q % QUESTIONS_PER_PILLAR === 0 ? 1 : 0) };
  if (!journeyComplete(s.journey)) {
    if (s.journey.tried.length === 0) return { screen: "journey", pos: 1 };
    if (s.journey.obstacles.length === 0 && !triedNothing(s.journey)) return { screen: "journey", pos: 2 };
    return { screen: "journey", pos: 4 };
  }
  return { screen: "checkin", pos: 0 };
}

const inProgress = (s: SavedState) =>
  s.answers.some((a) => a !== null) ||
  CONTEXT_KEYS.some((k) => (k === "topics" ? s.context.topics.length > 0 : s.context[k] !== null)) ||
  s.journey.tried.length > 0 ||
  s.personal.name !== "";

export function MapApp({ initialLocale }: { initialLocale: Locale }) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [state, setState] = useState<SavedState | null>(null); // null = not read from storage yet
  const [storageOk, setStorageOk] = useState(true);
  const [online, setOnline] = useState(true);
  const [direction, setDirection] = useState<"next" | "back" | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [suggestOther, setSuggestOther] = useState(false);
  // Whether the mood line was ticked lives in memory only, never in storage (spec §6).
  const [moodTicked, setMoodTicked] = useState(false);

  // Read saved progress once, on the client.
  useEffect(() => {
    const { state: s, resultLost } = loadState();
    const stale =
      (s.screen === "checkin" && !isComplete(s.answers)) ||
      (s.screen === "flow" && !contextComplete(s.context)) ||
      (s.screen === "journey" && !isComplete(s.answers));
    if (stale) Object.assign(s, resumePoint(s));
    setState(s); // eslint-disable-line react-hooks/set-state-in-effect -- one-time read of saved progress from localStorage
    setNotFound(resultLost);
    document.documentElement.removeAttribute("data-resume");
    // First visit with a non-Portuguese browser: Portuguese stays, with a visible offer of English.
    if (!loadLocale() && initialLocale === "pt" && !navigator.language.toLowerCase().startsWith("pt")) {
      setSuggestOther(true);
    }
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [initialLocale]);

  const update = useCallback((fn: (s: SavedState) => SavedState, dir: "next" | "back" = "next") => {
    setDirection(dir);
    setState((prev) => (prev ? fn(prev) : prev));
  }, []);

  // Every change is written straight to this browser, so a refresh or a dropped
  // connection never loses an answer.
  const loaded = useRef(false);
  useEffect(() => {
    if (!state) return;
    if (!loaded.current) {
      loaded.current = true; // the first state is what was just read
      return;
    }
    setStorageOk(saveState(state));
  }, [state]);

  // Switching language keeps every answer and re-renders the same screen (spec §11).
  const switchLocale = useCallback((l: Locale) => {
    setLocale(l);
    saveLocale(l);
    setSuggestOther(false);
    document.documentElement.lang = HTML_LANG[l];
    document.title = FLAT_MESSAGES[l]["meta.title"];
    window.history.replaceState({ eqGuard: window.history.state?.eqGuard === true }, "", PATHS[l].map);
  }, []);

  // Moves focus to the new screen's heading so screen readers and keyboards follow along.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const screenKey = state ? `${state.screen}-${state.pos}` : "loading";
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screenKey]);

  function go(screen: Screen, pos = 0, dir: "next" | "back" = "next") {
    update((s) => ({ ...s, screen, pos }), dir);
  }

  /** A new run. The last finished Map stays until the new one is finished. */
  function start() {
    setNotFound(false);
    update((s) => ({ ...emptyState(), result: s.result, animated: s.animated, screen: "about", pos: 0 }));
  }

  function answer(q: number, a: Answer) {
    update((s) => {
      const answers = [...s.answers];
      answers[q] = a;
      return { ...s, answers };
    });
  }

  const setContext = <K extends keyof Context>(key: K, value: Context[K]) =>
    update((s) => ({ ...s, context: { ...s.context, [key]: value } }));
  const setJourney = <K extends keyof Journey>(key: K, value: Journey[K]) =>
    update((s) => ({ ...s, journey: { ...s.journey, [key]: value } }));
  const setPersonal = (personal: Personal) => update((s) => ({ ...s, personal }));

  // All navigation reads the latest state, so the 250 ms auto-advance never acts on a
  // stale copy. `from` is the position the caller was on; a late timer does nothing.
  function forward(screen: "about" | "flow" | "journey", from: number) {
    update((s) => {
      if (s.screen !== screen || s.pos !== from) return s;
      if (screen === "about") {
        const key = CONTEXT_AT_POS[s.pos]; // C0 (the name) is optional
        if (key && (key === "topics" ? s.context.topics.length === 0 : s.context[key] === null)) return s;
        return s.pos + 1 >= ABOUT_LENGTH ? { ...s, screen: "flow", pos: 0 } : { ...s, pos: s.pos + 1 };
      }
      if (screen === "journey") {
        // J1 and J4 must be answered; J3 and J5 are her own words and optional.
        if (s.pos === 1 && s.journey.tried.length === 0) return s;
        if (s.pos === 2 && s.journey.obstacles.length === 0) return s;
        if (s.pos === 4 && s.journey.readiness === null) return s;
        // "Nothing yet" means nothing got in the way either: J2 is skipped rather than
        // forcing an untrue answer (review 3, finding 1).
        if (s.pos === 1 && triedNothing(s.journey)) return { ...s, journey: { ...s.journey, obstacles: [] }, pos: 3 };
        return s.pos + 1 >= JOURNEY_LENGTH ? { ...s, screen: "checkin", pos: 0 } : { ...s, pos: s.pos + 1 };
      }
      const q = posToQuestion(s.pos);
      if (q !== null && s.answers[q] === null) return s; // no skipping
      return s.pos + 1 >= FLOW_LENGTH ? { ...s, screen: "journey", pos: 0 } : { ...s, pos: s.pos + 1 };
    });
  }

  const back = useCallback(() => {
    update((s) => {
      switch (s.screen) {
        case "about":
          return s.pos === 0 ? { ...s, screen: "welcome", pos: 0 } : { ...s, pos: s.pos - 1 };
        case "flow":
          return s.pos === 0 ? { ...s, screen: "about", pos: ABOUT_LENGTH - 1 } : { ...s, pos: s.pos - 1 };
        case "journey":
          if (s.pos === 0) return { ...s, screen: "flow", pos: FLOW_LENGTH - 1 };
          // J2 was skipped, so Back from J3 goes to J1.
          return { ...s, pos: s.pos === 3 && triedNothing(s.journey) ? 1 : s.pos - 1 };
        case "checkin":
          return { ...s, screen: "journey", pos: JOURNEY_LENGTH - 1 };
        case "paths":
          return { ...s, screen: "result", pos: 0 };
        case "result":
          return { ...s, screen: "welcome", pos: 0 };
        default:
          return s;
      }
    }, "back");
  }, [update]);

  // The phone's own Back button does what the in-app Back does, instead of leaving the
  // Map mid-way. While she is past the welcome screen one history entry sits "above" the
  // page; Back pops it, we step back one screen and put it back.
  const screenRef = useRef<Screen | null>(null);
  const localeRef = useRef<Locale>(initialLocale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  useEffect(() => {
    screenRef.current = state?.screen ?? null;
    if (!state) return;
    const guarded = window.history.state?.eqGuard === true;
    if (state.screen !== "welcome" && !guarded) window.history.pushState({ eqGuard: true }, "");
    // Back on the welcome screen by the in-app button: drop the extra entry, so the
    // phone's Back then leaves the page normally (the popstate below ignores it).
    if (state.screen === "welcome" && guarded) window.history.back();
  }, [state]);
  useEffect(() => {
    function onPop(e: PopStateEvent) {
      // A tap on an in-page "#" link also fires popstate, with no state: not a Back.
      if (!e.state) return;
      if (!screenRef.current || screenRef.current === "welcome") return;
      back();
      // The entry we landed on may carry the language she had before a switch; the URL
      // must keep the language she chose (spec §11).
      window.history.replaceState(window.history.state, "", PATHS[localeRef.current].map);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [back]);

  function finish(flagged: boolean, mood: boolean) {
    setMoodTicked(flagged && mood);
    update((s) => {
      if (!isComplete(s.answers) || !contextComplete(s.context) || !journeyComplete(s.journey)) {
        return { ...s, ...resumePoint(s) };
      }
      const result = buildResult(s.answers, {
        id: crypto.randomUUID(),
        locale,
        now: new Date(),
        flagged,
        context: s.context,
        journey: s.journey,
      });
      // The 24 answers are not kept once the result exists (spec §12, §13). Her name and
      // her own words stay, because the conclusion is written with them — on this device only.
      return { ...emptyState(), screen: "result", result, personal: s.personal, animated: false };
    });
  }

  // The wheel animates once, on the first render of a result — never again.
  useEffect(() => {
    if (state?.screen === "result" && state.result && !state.animated) {
      const id = setTimeout(() => update((s) => ({ ...s, animated: true })), 1000);
      return () => clearTimeout(id);
    }
  }, [state?.screen, state?.result, state?.animated, update]);

  const q = state?.screen === "flow" ? posToQuestion(state.pos) : null;
  const answered = state ? state.answers.filter((a) => a !== null).length : 0;
  const showProgress = state?.screen === "flow";
  const full = !state || state.screen === "welcome" || state.screen === "result";

  return (
    <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]} timeZone="Europe/Lisbon">
      {showProgress && (
        <div className="fixed inset-x-0 top-0 z-10 h-[3px] bg-line" aria-hidden="true">
          <div className="h-full bg-rose-600 transition-[width] duration-200" style={{ width: `${(answered / QUESTION_COUNT) * 100}%` }} />
        </div>
      )}
      <Header locale={locale} hrefs={{ pt: PATHS.pt.map, en: PATHS.en.map }} onSwitch={switchLocale} variant={full ? "full" : "compact"} />
      <div className="mx-auto flex w-full max-w-[600px] flex-1 flex-col px-5 pt-4">
        {suggestOther && state?.screen === "welcome" && (
          <p className="no-print mb-2 text-right text-sm">
            <a href={PATHS.en.map} lang="en" className="link" onClick={(e) => { e.preventDefault(); switchLocale("en"); }}>
              {FLAT_MESSAGES.pt["lang.suggestOther"]}
            </a>
          </p>
        )}
        <Notices online={online} storageOk={storageOk} locale={locale} />
        <main className="flex flex-1 flex-col pb-12">
          {state === null ? (
            // Server render and the moment before saved progress is read. An inline script
            // (layout) swaps the welcome for the loading line when progress exists.
            <>
              <div className="ssr-welcome flex flex-1 flex-col">
                <Welcome
                  headingRef={headingRef}
                  locale={locale}
                  notFound={false}
                  inProgress={false}
                  hasResult={false}
                  onStart={() => {}}
                  onResume={() => {}}
                  onSeeResult={() => {}}
                />
              </div>
              <p className="ssr-loading t-helper py-12 text-center" role="status">
                {FLAT_MESSAGES[locale].loading}
              </p>
            </>
          ) : (
            <div
              key={screenKey}
              className={"flex flex-1 flex-col " + (direction === "next" ? "enter-next" : direction === "back" ? "enter-back" : "")}
            >
              {state.screen === "welcome" && (
                <Welcome
                  headingRef={headingRef}
                  locale={locale}
                  notFound={notFound}
                  inProgress={inProgress(state)}
                  hasResult={!!state.result}
                  onStart={start}
                  onResume={() => {
                    const r = resumePoint(state);
                    go(r.screen, r.pos);
                  }}
                  onSeeResult={() => go("result")}
                />
              )}
              {state.screen === "about" && (
                <About
                  headingRef={headingRef}
                  pos={state.pos}
                  context={state.context}
                  personal={state.personal}
                  onChoose={setContext}
                  onName={(name) => setPersonal({ ...state.personal, name })}
                  onNext={() => forward("about", state.pos)}
                  onBack={back}
                />
              )}
              {state.screen === "flow" && q === null && (
                <Divider
                  headingRef={headingRef}
                  pillarIndex={posToPillarIndex(state.pos)}
                  onContinue={() => forward("flow", state.pos)}
                  onBack={back}
                />
              )}
              {state.screen === "flow" && q !== null && (
                <Question
                  headingRef={headingRef}
                  index={q}
                  value={state.answers[q]}
                  onAnswer={(a) => answer(q, a)}
                  onNext={() => forward("flow", state.pos)}
                  onBack={back}
                />
              )}
              {state.screen === "journey" && (
                <JourneyScreen
                  headingRef={headingRef}
                  pos={state.pos}
                  journey={state.journey}
                  personal={state.personal}
                  onChange={setJourney}
                  onPersonal={setPersonal}
                  onNext={() => forward("journey", state.pos)}
                  onBack={back}
                />
              )}
              {state.screen === "checkin" && <CheckIn headingRef={headingRef} onContinue={finish} onBack={back} />}
              {state.screen === "result" && state.result && (
                <Result
                  headingRef={headingRef}
                  locale={locale}
                  result={state.result}
                  personal={state.personal}
                  moodTicked={moodTicked}
                  animate={!state.animated}
                  onContinue={() => go("paths")}
                  onRetake={start}
                />
              )}
              {state.screen === "paths" && state.result && (
                <Paths headingRef={headingRef} result={state.result} onBack={back} />
              )}
            </div>
          )}
        </main>
      </div>
    </NextIntlClientProvider>
  );
}

function Notices({ online, storageOk, locale }: { online: boolean; storageOk: boolean; locale: Locale }) {
  const flat = FLAT_MESSAGES[locale];
  // When storage is blocked, the offline line ("your answers are saved") would be untrue.
  const message = !storageOk ? flat.storageBlocked : !online ? flat.offline : null;
  if (!message) return null;
  return (
    <div role="status" className="no-print mb-4">
      <p className="card px-4 py-3 text-sm">{message}</p>
    </div>
  );
}
