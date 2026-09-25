// Rê's notification (spec v4 §12). Supabase calls this the moment a woman presses
// "Share my Map with Rê", and it sends Rê one email: who, which path, her two focus
// pillars, and a link to the Map in the admin view.
//
// It runs inside Supabase (EU region), not in the browser, which is why it may hold the
// secret keys. Nothing here ever includes the check-in, and never the 24 answers.
//
// Deploy:  supabase functions deploy notify-re
// Secrets: supabase secrets set RESEND_API_KEY=... RE_EMAIL=... FROM_EMAIL=... ADMIN_URL=...
// Then:    Database → Webhooks → table `contacts`, event INSERT, type Supabase Edge Function.

type ContactRow = {
  map_id: string;
  first_name: string | null;
  email: string;
  whatsapp: string | null;
  question_for_re: string | null;
};

type Payload = { type: string; table: string; record: ContactRow };

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

Deno.serve(async (request: Request) => {
  const payload = (await request.json()) as Payload;
  if (payload.type !== "INSERT" || payload.table !== "contacts") {
    return new Response("ignored", { status: 200 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const resendKey = Deno.env.get("RESEND_API_KEY")!;
  const to = Deno.env.get("RE_EMAIL")!;
  const from = Deno.env.get("FROM_EMAIL") ?? "Equilibrar <onboarding@resend.dev>";
  const adminUrl = Deno.env.get("ADMIN_URL") ?? "";

  // The Map itself, read with the service key so the row-level rules do not apply here.
  const mapResponse = await fetch(
    `${supabaseUrl}/rest/v1/maps?id=eq.${payload.record.map_id}&select=focus_pillar,second_pillar,chosen_path,recommended_path,locale`,
    { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
  );
  const [map] = (await mapResponse.json()) as Array<Record<string, string | null>>;

  const name = payload.record.first_name?.trim() || "Uma mulher";
  const focus = [map?.focus_pillar, map?.second_pillar].filter(Boolean).map((p) => PILLAR_PT[p!] ?? p).join(" e ");
  const chosen = map?.chosen_path ? (PATH_PT[map.chosen_path] ?? map.chosen_path) : "nenhum caminho";

  const lines = [
    `${name} compartilhou o Mapa dela com você.`,
    ``,
    `Caminho escolhido: ${chosen}`,
    `Áreas com menos apoio: ${focus || "—"}`,
    `E-mail: ${payload.record.email}`,
    payload.record.whatsapp ? `WhatsApp: ${payload.record.whatsapp}` : ``,
    payload.record.question_for_re ? `` : ``,
    payload.record.question_for_re ? `A pergunta dela: “${payload.record.question_for_re}”` : ``,
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
      subject: `Novo Mapa compartilhado — ${name} · ${chosen}`,
      text: lines.join("\n"),
    }),
  });

  return new Response(sent.ok ? "sent" : "email failed", { status: sent.ok ? 200 : 500 });
});
