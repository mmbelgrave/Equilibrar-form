// Rê's notification (spec v4 §12). Supabase calls this the moment a woman presses
// "Share my Map with Rê", and it sends Rê one email: who, which path, her two focus
// pillars, and a link to the Map in the admin view.
//
// It runs inside Supabase (EU region), not in the browser, which is why it may hold the
// secret keys. Nothing here ever includes the check-in or the 24 answers: the email tells
// Rê that somebody shared and who, and she reads the Map itself on her own page.
//
// It trusts two things and nothing else: the shared secret in the request header, and what
// it then reads from the database itself. The body of the request is only used for the id.
// Before that, the public key printed inside the website was enough to make Rê's own
// notification address send her invented leads (review 5, finding 3).
//
// Deploy:  supabase functions deploy notify-re
// Secrets: supabase secrets set RESEND_API_KEY=... RE_EMAIL=... FROM_EMAIL=... ADMIN_URL=... NOTIFY_SECRET=...
// Then:    Database → Webhooks → table `contacts`, event INSERT, type Supabase Edge
//          Function, and add the header `x-webhook-secret` with the same NOTIFY_SECRET.

type Payload = { type?: string; table?: string; record?: { id?: string; map_id?: string } };

type ContactRow = {
  map_id: string;
  first_name: string | null;
  email: string;
  whatsapp: string | null;
  question_for_re: string | null;
  consent_share: boolean;
  maps: {
    focus_pillar: string | null;
    second_pillar: string | null;
    chosen_path: string | null;
    recommended_path: string | null;
    locale: string | null;
  } | null;
};

const PILLAR_PT: Record<string, string> = {
  space: "Espaço",
  routine: "Rotina",
  sleep: "Sono",
  calm: "Calma",
  food: "Alimentação",
  strength: "Força",
};
const PATH_PT: Record<string, string> = {
  community: "Comunidade",
  consultoria: "Consultoria",
  mentorship: "Mentoria",
};

/** Nothing from the outside goes into a header or a subject line with its control characters. */
const oneLine = (value: string, max: number) =>
  value.replace(/[\r\n\t\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  // 1. Is this the webhook, or somebody with the public key?
  const expected = Deno.env.get("NOTIFY_SECRET");
  if (!expected || request.headers.get("x-webhook-secret") !== expected) {
    return new Response("no", { status: 401 });
  }

  const payload = (await request.json().catch(() => ({}))) as Payload;
  if (payload.type !== "INSERT" || payload.table !== "contacts") {
    return new Response("ignored", { status: 200 });
  }

  const contactId = payload.record?.id ?? "";
  if (!UUID.test(contactId)) return new Response("bad id", { status: 400 });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY")!;
  const to = Deno.env.get("RE_EMAIL")!;
  const from = Deno.env.get("FROM_EMAIL") ?? "Equilibrar <onboarding@resend.dev>";
  const adminUrl = Deno.env.get("ADMIN_URL") ?? "";

  // 2. Everything in the email comes from the row itself, read with the service key so the
  //    row-level rules do not apply here. The id is the only thing taken from the request.
  const query = new URL(`${supabaseUrl}/rest/v1/contacts`);
  query.searchParams.set("id", `eq.${contactId}`);
  query.searchParams.set(
    "select",
    "map_id,first_name,email,whatsapp,question_for_re,consent_share," +
      "maps(focus_pillar,second_pillar,chosen_path,recommended_path,locale)",
  );
  const response = await fetch(query, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  const [contact] = (await response.json().catch(() => [])) as ContactRow[];
  if (!contact) return new Response("no such contact", { status: 404 });

  const map = contact.maps;
  const name = oneLine(contact.first_name ?? "", 60) || "Uma mulher";
  const focus = [map?.focus_pillar, map?.second_pillar]
    .filter((p): p is string => !!p)
    .map((p) => PILLAR_PT[p] ?? p)
    .join(" e ");
  const chosen = map?.chosen_path ? (PATH_PT[map.chosen_path] ?? map.chosen_path) : "nenhum caminho";
  // Her question travels only with the consent she ticked. The app already leaves it out
  // without it; this is the function having its own opinion about it.
  const question = contact.consent_share ? contact.question_for_re : null;

  const lines = [
    `${name} compartilhou o Mapa dela com você.`,
    ``,
    `Caminho escolhido: ${chosen}`,
    `Áreas com menos apoio: ${focus || "—"}`,
    `E-mail: ${contact.email}`,
    contact.whatsapp ? `WhatsApp: ${contact.whatsapp}` : ``,
    question ? `` : ``,
    question ? `A pergunta dela: “${question}”` : ``,
    ``,
    adminUrl ? `Ver o Mapa: ${adminUrl}` : ``,
    ``,
    `Você prometeu responder em 48 horas.`,
  ].filter((line) => line !== undefined);

  const sent = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [to],
      subject: oneLine(`Novo Mapa compartilhado — ${name} · ${chosen}`, 200),
      text: lines.join("\n"),
    }),
  });

  if (!sent.ok) {
    // Without this, a refused send is a 500 with nothing to look at in the function's logs.
    console.error("Resend refused:", sent.status, await sent.text().catch(() => ""));
    return new Response("email failed", { status: 500 });
  }
  return new Response("sent", { status: 200 });
});
