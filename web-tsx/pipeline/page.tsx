// apps/web/app/(dashboard)/pipeline/page.tsx
//
// Pipeline da unidade — gerente vê TODAS as clientes em jornada das designers da unidade.
// Kanban 6 colunas (desktop friendly).

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

type PipelineRow = {
  client_id: string;
  client_name: string;
  professional_name: string;
  procedure_name: string;
  days_since: number;
  memory_snippet: string | null;
  next_action_text: string | null;
  context_tag: string | null;
  priority: "high" | "med" | "low";
  pipeline_column: string;
};

const COLUMNS = [
  { key: "primeira_visita", emoji: "🌱", title: "1ª Visita", subtitle: "D+1 a D+7" },
  { key: "janela_magica", emoji: "⚡", title: "Janela Mágica", subtitle: "D+8 a D+30 · 12,6× Premium" },
  { key: "em_pacote", emoji: "📦", title: "Em Pacote", subtitle: "Sessões 1-5" },
  { key: "meio_pacote", emoji: "🔄", title: "Meio do Pacote", subtitle: "Ponte 2" },
  { key: "penultima_sessao", emoji: "🔐", title: "Penúltima", subtitle: "Ponte 3" },
  { key: "constelacao", emoji: "✨", title: "Constelação", subtitle: "Premium consolidada" },
];

export default async function PipelineUnitDashboard() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("franchise_id, role")
    .eq("id", user.id)
    .single();
  if (!profile || !["manager", "admin", "owner"].includes(profile.role)) {
    redirect("/painel-interno");
  }

  const { data } = await supabase.rpc("pipeline_clients_for_unit", { p_franchise_id: profile.franchise_id });
  const rows: PipelineRow[] = (data ?? []) as PipelineRow[];

  const byColumn = COLUMNS.map((c) => ({
    ...c,
    clients: rows.filter((r) => r.pipeline_column === c.key),
  }));

  const totalPriority = rows.filter((r) => r.priority === "high").length;

  return (
    <div style={{ padding: 24, fontFamily: "system-ui" }}>
      <header style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#8a6f3d", fontWeight: 700 }}>
          GERENTE · PIPELINE DA UNIDADE
        </p>
        <h1 style={{ fontSize: 28, fontWeight: 600, letterSpacing: -0.5, marginTop: 4 }}>
          {rows.length} clientes em jornada
        </h1>
        <p style={{ color: "#5a4f47", fontSize: 14, marginTop: 4 }}>
          {totalPriority} ações prioritárias acontecendo agora.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(6, minmax(220px, 1fr))",
          gap: 12,
          overflowX: "auto",
          paddingBottom: 20,
        }}
      >
        {byColumn.map((col) => (
          <div key={col.key} style={{ background: "rgba(255,255,255,0.55)", borderRadius: 16, padding: 12 }}>
            <header style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong style={{ fontSize: 11, letterSpacing: 1.5, textTransform: "uppercase", color: "#8a3a4f", fontWeight: 700 }}>
                  {col.emoji} {col.title}
                </strong>
                <span style={{ background: "#8a3a4f", color: "#fff", padding: "2px 8px", borderRadius: 100, fontSize: 11, fontWeight: 700 }}>
                  {col.clients.length}
                </span>
              </div>
              <p style={{ fontSize: 11, color: "#8a8a8a", fontStyle: "italic", marginTop: 4 }}>{col.subtitle}</p>
            </header>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {col.clients.map((c) => (
                <a
                  key={c.client_id}
                  href={`/painel-interno/clientes/${c.client_id}`}
                  style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: 10,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.04)",
                    textDecoration: "none",
                    color: "inherit",
                    borderLeft: `3px solid ${
                      c.priority === "high" ? "#c25a4a" : c.priority === "med" ? "#b89968" : "#6b8e6f"
                    }`,
                  }}
                >
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{c.client_name}</div>
                  <div style={{ fontSize: 10, color: "#8a8a8a", marginTop: 2 }}>
                    {c.procedure_name} · D+{c.days_since} · {c.professional_name}
                  </div>
                  {c.context_tag && (
                    <div
                      style={{
                        marginTop: 6,
                        fontSize: 9,
                        fontWeight: 700,
                        color: "#8a3a4f",
                        background: "#fdf5f7",
                        padding: "2px 6px",
                        borderRadius: 6,
                        display: "inline-block",
                        letterSpacing: 0.5,
                      }}
                    >
                      {c.context_tag}
                    </div>
                  )}
                  {c.memory_snippet && (
                    <div style={{ fontSize: 10, color: "#5a4f47", background: "#faf7f1", padding: 6, borderRadius: 6, marginTop: 6, lineHeight: 1.4 }}>
                      🧠 {c.memory_snippet}
                    </div>
                  )}
                  {c.next_action_text && (
                    <div style={{ fontSize: 10, fontWeight: 600, color: "#1f1a17", marginTop: 6 }}>
                      → {c.next_action_text}
                    </div>
                  )}
                </a>
              ))}
              {col.clients.length === 0 && (
                <p style={{ fontSize: 11, color: "#8a8a8a", padding: 12, textAlign: "center", fontStyle: "italic" }}>
                  Nenhuma cliente aqui agora.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
