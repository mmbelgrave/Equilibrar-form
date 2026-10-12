import type { MapStatus } from "./db.ts";
import type { Locale } from "./i18n.ts";
import type { Pillar } from "./scoring.ts";

/**
 * Every word on Rê's own page, in both languages.
 *
 * It used to be one Portuguese object, on the reasoning that the page is Rê's. There are two
 * people on the admin list now and they do not read the same language, so each opens the page
 * in her own — Renata in Portuguese, Mwata in English — from the `locale` column on her row
 * in `admins`. A toggle on the page overrides it for that device.
 */
export type AdminCopy = typeof COPY.pt;

export const COPY = {
  pt: {
    title: "Mapas",
    signIn: "Entrar",
    signInLead: "Digite o seu e-mail. Eu mando um link para entrar — não precisa de senha.",
    signInDevice: "Abra o link neste mesmo aparelho. Depois disso ele continua entrando sozinho aqui.",
    email: "E-mail",
    sent: "Pronto. Olhe o seu e-mail e clique no link, neste mesmo aparelho.",
    signOut: "Sair",
    signOutConfirm: "Sair mesmo? Você vai precisar de um link novo para entrar.",
    signOutYes: "Sim, sair",
    signOutNo: "Não",
    noAccess: "Não consegui mandar o link. Confira o e-mail, ou fale com quem cuida do sistema.",
    tooMany:
      "Já foram mandados links demais na última hora. Espere uma hora e tente de novo — o link antigo que estiver no seu e-mail ainda funciona.",
    noAccessAccount: "Esta conta não está na lista de quem pode ver os Mapas. Fale com quem cuida do sistema.",
    notConfigured: "O banco de dados ainda não está configurado, então não há Mapas para mostrar.",
    failed: "Não deu para falar com o banco de dados. Atualize a página.",
    loading: "Carregando…",
    none: "Nenhum Mapa ainda.",
    people: "Quem fez o Mapa",
    peopleCount: (n: number) => (n === 1 ? "1 pessoa" : `${n} pessoas`),
    emptyHidden: (n: number) =>
      n === 1
        ? "1 Mapa foi aberto e largado sem nenhuma resposta. Está escondido."
        : `${n} Mapas foram abertos e largados sem nenhuma resposta. Estão escondidos.`,
    emptyShow: "Mostrar mesmo assim",
    emptyHide: "Esconder de novo",
    noName: "Sem nome",
    today: "hoje",
    yesterday: "ontem",
    daysAgo: (n: number) => `há ${n} dias`,
    status: {
      in_progress: "Fazendo agora",
      stopped: "Parou no meio",
      finished: "Terminou",
      shared: "Mandou para você",
    } as Record<MapStatus, string>,
    reStatus: { open: "Aberto", contacted: "Já falei", joined: "Entrou", not_now: "Agora não" } as Record<string, string>,
    pathName: { community: "Comunidade", consultoria: "Consultoria", mentorship: "Mentoria" } as Record<string, string>,
    suggested: "O Mapa sugeriu",
    summaryShow: "Ver os números",
    summaryHide: "Esconder os números",
    overview: "Resumo",
    started: "Começaram",
    finished: "Terminaram",
    shared: "Compartilharam",
    week: "7 dias",
    month: "30 dias",
    completion: "Taxa de conclusão",
    completionNote: "Dos Mapas que já pararam ou terminaram — os que estão em andamento ficam de fora.",
    shareRate: "Taxa de compartilhamento",
    lowest: "Pilar mais baixo, com que frequência",
    averages: "Média de cada pilar",
    averagesAll: "Todas que terminaram",
    averagesShared: "As que compartilharam com você",
    averagesCount: (finished: number, shared: number) =>
      `${finished} ${finished === 1 ? "terminou" : "terminaram"} · ${shared} ${shared === 1 ? "compartilhou" : "compartilharam"}`,
    averagesNone: "Ainda não há Mapas compartilhados para comparar.",
    byLanguage: "Começaram e terminaram, por idioma",
    followed: "Seguiram a sugestão",
    export: "Baixar CSV",
    back: "Voltar à lista",
    detail: "Detalhes",
    contact: "Contato",
    note: "Anotação",
    save: "Salvar",
    saving: "Salvando…",
    saveFailed: "Não deu para salvar. Tente de novo.",
    whatsapp: "Abrir WhatsApp",
    consentEmailYes: "Aceitou receber e-mails da Rê",
    consentEmailNo: "Não aceitou receber e-mails",
    consentShare: "Deixou a Rê ver o Mapa dela",
    delete: "Apagar este Mapa",
    deleteConfirm: "Apagar mesmo? O Mapa e os dados dela somem para sempre.",
    deleteYes: "Sim, apagar",
    deleteNo: "Não",
    deleteFailed: "Não deu para apagar. Tente de novo.",
    print: "Imprimir este Mapa",
    printHint: "Escolha “Salvar como PDF” para guardar o Mapa dela antes da conversa.",
    answersTitle: "As respostas dela",
    noAnswersShared:
      "Não há respostas uma a uma neste Mapa: ou ela não marcou a caixa que deixa você vê-las, ou o Mapa é anterior a essa caixa existir. Pode pedir na conversa, se fizer sentido.",
    answersBroken: "As respostas chegaram incompletas. Vale avisar quem cuida do sistema.",
    answersCodes: "O que ela respondeu sobre a vida dela",
    pillarOf: (n: number) => `Pilar ${n} de 6`,
    waiting: "Esperando resposta há mais de 48 horas",
    sinceShared: (days: number) => (days < 1 ? "Compartilhou hoje" : `Compartilhou há ${Math.floor(days)} dia(s)`),
  },
  en: {
    title: "Maps",
    signIn: "Sign in",
    signInLead: "Type your e-mail. I send you a link to sign in — no password to remember.",
    signInDevice: "Open the link on this same device. After that it signs you in here on its own.",
    email: "E-mail",
    sent: "Done. Check your e-mail and open the link, on this same device.",
    signOut: "Sign out",
    signOutConfirm: "Sign out? You will need a new link to get back in.",
    signOutYes: "Yes, sign out",
    signOutNo: "No",
    noAccess: "I could not send the link. Check the address, or ask whoever looks after the system.",
    tooMany:
      "Too many sign-in links have gone out in the last hour. Wait an hour and try again — an older link still sitting in your inbox will also still work.",
    noAccessAccount: "This account is not on the list of people who may see the Maps. Ask whoever looks after the system.",
    notConfigured: "The database is not set up yet, so there are no Maps to show.",
    failed: "I could not reach the database. Reload the page.",
    loading: "Loading…",
    none: "No Maps yet.",
    people: "Who did the Map",
    peopleCount: (n: number) => (n === 1 ? "1 person" : `${n} people`),
    emptyHidden: (n: number) =>
      n === 1
        ? "1 Map was opened and left without a single answer. It is hidden."
        : `${n} Maps were opened and left without a single answer. They are hidden.`,
    emptyShow: "Show them anyway",
    emptyHide: "Hide them again",
    noName: "No name",
    today: "today",
    yesterday: "yesterday",
    daysAgo: (n: number) => `${n} days ago`,
    status: {
      in_progress: "Answering now",
      stopped: "Stopped partway",
      finished: "Finished",
      shared: "Sent it to you",
    } as Record<MapStatus, string>,
    reStatus: { open: "Open", contacted: "Talked to her", joined: "Joined", not_now: "Not now" } as Record<string, string>,
    pathName: { community: "Community", consultoria: "Consultoria", mentorship: "Mentorship" } as Record<string, string>,
    suggested: "The Map suggested",
    summaryShow: "Show the figures",
    summaryHide: "Hide the figures",
    overview: "Summary",
    started: "Started",
    finished: "Finished",
    shared: "Shared",
    week: "7 days",
    month: "30 days",
    completion: "Completion rate",
    completionNote: "Of the Maps that have stopped or finished — the ones still in progress are left out.",
    shareRate: "Share rate",
    lowest: "Lowest pillar, how often",
    averages: "Average of each pillar",
    averagesAll: "Everyone who finished",
    averagesShared: "The ones who shared with you",
    averagesCount: (finished: number, shared: number) => `${finished} finished · ${shared} shared`,
    averagesNone: "No shared Maps yet to compare.",
    byLanguage: "Started and finished, by language",
    followed: "Followed the suggestion",
    export: "Download CSV",
    back: "Back to the list",
    detail: "Details",
    contact: "Contact",
    note: "Note",
    save: "Save",
    saving: "Saving…",
    saveFailed: "I could not save that. Try again.",
    whatsapp: "Open WhatsApp",
    consentEmailYes: "Agreed to Rê's e-mails",
    consentEmailNo: "Did not agree to e-mails",
    consentShare: "Let Rê see her Map",
    delete: "Delete this Map",
    deleteConfirm: "Delete it? Her Map and her details go for good.",
    deleteYes: "Yes, delete",
    deleteNo: "No",
    deleteFailed: "I could not delete that. Try again.",
    print: "Print this Map",
    printHint: "Choose “Save as PDF” to keep her Map before the conversation.",
    answersTitle: "Her answers",
    noAnswersShared:
      "There are no answer-by-answer details on this Map: either she did not tick the box that lets you see them, or the Map is older than that box. You can ask her in the conversation, if it fits.",
    answersBroken: "The answers arrived incomplete. Worth telling whoever looks after the system.",
    answersCodes: "What she said about her life",
    pillarOf: (n: number) => `Pillar ${n} of 6`,
    waiting: "Waiting for a reply for more than 48 hours",
    sinceShared: (days: number) => (days < 1 ? "Shared today" : `Shared ${Math.floor(days)} day(s) ago`),
  },
} satisfies Record<Locale, Record<string, unknown>>;

export const PILLAR_NAME: Record<Locale, Record<Pillar, string>> = {
  pt: { space: "Espaço", routine: "Rotina", sleep: "Sono", calm: "Emoções", food: "Alimentação", strength: "Força" },
  en: { space: "Space", routine: "Routine", sleep: "Sleep", calm: "Emotions", food: "Food", strength: "Strength" },
};

/** "today", "yesterday", "5 days ago" — how Rê actually thinks about when somebody came. */
export function whenWas(iso: string, t: AdminCopy, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return t.today;
  if (days === 1) return t.yesterday;
  return t.daysAgo(days);
}

/**
 * Has she answered anything at all?
 *
 * A row is written the moment a woman leaves the welcome screen, so opening the Map and
 * closing it again leaves a row with nothing in it. Those are not people to follow up;
 * they are bounces, and a page full of them hides the handful that matter.
 */
export function hasAnswered(m: {
  age_band: string | null;
  life_stage: string | null;
  caring_for: string | null;
  duration: string | null;
  focus_topics?: string[] | null;
  tried?: string[] | null;
  score_space?: number | null;
}): boolean {
  return Boolean(
    m.age_band ||
      m.life_stage ||
      m.caring_for ||
      m.duration ||
      (m.focus_topics?.length ?? 0) > 0 ||
      (m.tried?.length ?? 0) > 0 ||
      typeof m.score_space === "number",
  );
}
