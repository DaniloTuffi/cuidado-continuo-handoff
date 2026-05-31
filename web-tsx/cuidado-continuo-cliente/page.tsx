// apps/web/app/(dashboard)/clientes/[id]/cuidado-continuo/page.tsx
//
// Aba "Cuidado Contínuo" no perfil da cliente vista pelo admin/gerente.
// Mostra protocolo ativo, aderência, eventos do Diário que ela foi, colunas que escreveu.

import { createServerClient } from "@/lib/supabase/server";
import { notFound } from "next/navigation";

type Params = { id: string };

export default async function ClienteCuidadoContinuoPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: client } = await supabase
    .from("client_details")
    .select(`
      id, full_name, ltv_centavos, total_visits, nps_avg,
      loyalty_tiers!loyalty_tier_id(name)
    `)
    .eq("id", id)
    .maybeSingle();

  if (!client) notFound();

  const { data: activeProtocol } = await supabase
    .from("client_protocol_progress")
    .select(`
      id, started_at, expected_end_at, adherence_score, status,
      protocol_definitions!protocol_definition_id(procedure_name, duration_days)
    `)
    .eq("client_id", id)
    .eq("status", "active")
    .maybeSingle();

  const { data: history } = await supabase
    .from("client_protocol_progress")
    .select(`
      id, started_at, expected_end_at, adherence_score, status,
      protocol_definitions!protocol_definition_id(procedure_name)
    `)
    .eq("client_id", id)
    .order("started_at", { ascending: false })
    .limit(10);

  const { data: rsvps } = await supabase
    .from("diario_event_rsvp")
    .select(`
      status, confirmed_at, attended_at,
      diario_events!event_id(title, starts_at)
    `)
    .eq("profile_id", id)
    .order("confirmed_at", { ascending: false });

  const { data: columns } = await supabase
    .from("diario_columns")
    .select("id, title, slug, published_at, view_count, like_count")
    .eq("author_profile_id", id)
    .eq("is_draft", false);

  const tier = (client as any).loyalty_tiers?.name;

  return (
    <div style={{ padding: 32, maxWidth: 1100, margin: "0 auto", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#8a6f3d", fontWeight: 700 }}>
          CUIDADO CONTÍNUO · {tier?.toUpperCase()}
        </p>
        <h1 style={{ fontSize: 30, fontWeight: 600, letterSpacing: -0.5, marginTop: 4 }}>{client.full_name}</h1>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {activeProtocol ? (
          <div style={{ background: "#fff", padding: 20, borderRadius: 14, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
            <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#8a3a4f", fontWeight: 700, marginBottom: 8 }}>
              Protocolo ativo
            </p>
            <h3 style={{ fontSize: 18, fontWeight: 600 }}>
              {(activeProtocol as any).protocol_definitions?.procedure_name}
            </h3>
            <p style={{ fontSize: 13, color: "#5a4f47", marginTop: 4 }}>
              Iniciado em {fmtDate(activeProtocol.started_at)} · termina em {fmtDate(activeProtocol.expected_end_at)}
            </p>
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                <span>Aderência</span>
                <strong>{Math.round(Number(activeProtocol.adherence_score))}%</strong>
              </div>
              <div style={{ height: 6, background: "#f5f5f5", borderRadius: 3, overflow: "hidden" }}>
                <div
                  style={{
                    height: 6,
                    width: `${activeProtocol.adherence_score}%`,
                    background: "linear-gradient(90deg, #d4bf95, #b89968)",
                  }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div style={{ background: "#fff", padding: 20, borderRadius: 14, color: "#8a8a8a", fontStyle: "italic" }}>
            Sem protocolo ativo. Próxima visita gera protocolo automaticamente.
          </div>
        )}

        <div style={{ background: "#1f1a17", color: "#f4ece2", padding: 20, borderRadius: 14 }}>
          <p style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#d4bf95", fontWeight: 700, marginBottom: 10 }}>
            Resumo
          </p>
          <Stat label="LTV total" value={brl(client.ltv_centavos)} />
          <Stat label="Visitas" value={client.total_visits.toString()} />
          <Stat label="NPS médio" value={client.nps_avg?.toFixed(1) ?? "—"} />
          <Stat label="Colunas Diário" value={columns?.length.toString() ?? "0"} />
        </div>
      </section>

      <section style={{ background: "#fff", padding: 20, borderRadius: 14, marginBottom: 24 }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Histórico de protocolos</h2>
        {(history ?? []).map((h: any) => (
          <div
            key={h.id}
            style={{ padding: "10px 0", borderBottom: "1px solid #f3efe8", display: "flex", justifyContent: "space-between" }}
          >
            <div>
              <strong style={{ fontSize: 13 }}>{h.protocol_definitions?.procedure_name}</strong>
              <div style={{ fontSize: 11, color: "#8a8a8a" }}>
                {fmtDate(h.started_at)} – {fmtDate(h.expected_end_at)}
              </div>
            </div>
            <Status status={h.status} />
          </div>
        ))}
        {(history ?? []).length === 0 && <p style={{ color: "#8a8a8a", fontSize: 13 }}>Sem histórico.</p>}
      </section>

      {(rsvps ?? []).length > 0 && (
        <section style={{ background: "#fff", padding: 20, borderRadius: 14, marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Eventos Constelação</h2>
          {(rsvps ?? []).map((r: any, i: number) => (
            <div key={i} style={{ padding: "8px 0", borderBottom: "1px solid #f3efe8" }}>
              <strong style={{ fontSize: 13 }}>{r.diario_events?.title}</strong>
              <div style={{ fontSize: 11, color: "#8a8a8a" }}>
                {fmtDate(r.diario_events?.starts_at)} · <Status status={r.status} />
              </div>
            </div>
          ))}
        </section>
      )}

      {(columns ?? []).length > 0 && (
        <section style={{ background: "#fff", padding: 20, borderRadius: 14 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Colunas no Diário</h2>
          {(columns ?? []).map((c) => (
            <a
              key={c.id}
              href={`/portal/diario/${c.slug}`}
              style={{
                padding: "10px 0",
                borderBottom: "1px solid #f3efe8",
                display: "block",
                textDecoration: "none",
                color: "inherit",
              }}
            >
              <strong style={{ fontSize: 13 }}>{c.title}</strong>
              <div style={{ fontSize: 11, color: "#8a8a8a" }}>
                {fmtDate(c.published_at)} · 👁 {c.view_count} · ♡ {c.like_count}
              </div>
            </a>
          ))}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13 }}>
      <span style={{ color: "rgba(244,236,226,0.7)" }}>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function Status({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    active: "#6b8e6f",
    completed: "#5a4f47",
    abandoned: "#c25a4a",
    confirmed: "#6b8e6f",
    canceled: "#c25a4a",
    waitlist: "#b89968",
    attended: "#6b8e6f",
  };
  return (
    <span
      style={{
        background: (colorMap[status] ?? "#8a8a8a") + "22",
        color: colorMap[status] ?? "#8a8a8a",
        padding: "2px 8px",
        borderRadius: 6,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase",
      }}
    >
      {status}
    </span>
  );
}

function brl(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}
