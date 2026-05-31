// apps/web/app/(dashboard)/score-de-cuidado/page.tsx
//
// Dashboard admin do Score de Cuidado — gerente Paula vê todos os profissionais
// da unidade, ranking, prêmios desbloqueados, KPIs por categoria.
//
// Server Component com cliente Supabase server-side.

import { createServerClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";

type MonthlyScore = {
  profile_id: string;
  full_name: string;
  role: string;
  year_month: string;
  total_score: number;
  execucao_score: number;
  relacionamento_score: number;
  vendas_score: number;
  cocriacao_score: number;
  premio_centavos: number;
  ranking_unidade: number | null;
};

function ym() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function brl(centavos: number) {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 0 });
}

export default async function ScoreCuidadoDashboard({
  searchParams,
}: {
  searchParams: Promise<{ unit?: string; month?: string }>;
}) {
  const params = await searchParams;
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

  const month = params.month ?? ym();
  const unitId = params.unit ?? profile.franchise_id;

  const { data: scores } = await supabase
    .from("profile_score_monthly")
    .select(`
      profile_id, year_month, total_score,
      execucao_score, relacionamento_score, vendas_score, cocriacao_score,
      premio_centavos, ranking_unidade,
      profiles!profile_id(full_name, role)
    `)
    .eq("franchise_id", unitId)
    .eq("year_month", month)
    .order("total_score", { ascending: false });

  const rows: MonthlyScore[] = (scores ?? []).map((s: any) => ({
    profile_id: s.profile_id,
    full_name: s.profiles.full_name,
    role: s.profiles.role,
    year_month: s.year_month,
    total_score: Number(s.total_score) || 0,
    execucao_score: Number(s.execucao_score) || 0,
    relacionamento_score: Number(s.relacionamento_score) || 0,
    vendas_score: Number(s.vendas_score) || 0,
    cocriacao_score: Number(s.cocriacao_score) || 0,
    premio_centavos: s.premio_centavos || 0,
    ranking_unidade: s.ranking_unidade,
  }));

  const totalPaid = rows.reduce((s, r) => s + r.premio_centavos, 0);
  const avgScore = rows.length > 0 ? rows.reduce((s, r) => s + r.total_score, 0) / rows.length : 0;
  const topScore = rows[0]?.total_score ?? 0;

  return (
    <div style={{ padding: 32, maxWidth: 1400, margin: "0 auto", fontFamily: "system-ui" }}>
      <header style={{ marginBottom: 24 }}>
        <p style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "#8a6f3d", fontWeight: 700 }}>
          DASHBOARD GERENTE · CUIDADO CONTÍNUO
        </p>
        <h1 style={{ fontSize: 32, fontWeight: 600, letterSpacing: -0.5, marginTop: 4 }}>
          Score de Cuidado · {labelMonth(month)}
        </h1>
        <p style={{ color: "#5a4f47", fontSize: 14, marginTop: 4 }}>
          {rows.length} profissionais ativos · prêmios totais {brl(totalPaid)}
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        <Stat label="Score médio da unidade" value={avgScore.toFixed(1)} accent />
        <Stat label="Top score" value={Math.round(topScore).toString()} />
        <Stat label="Prêmios este mês" value={brl(totalPaid)} accent />
        <Stat label="Profissionais ativos" value={rows.length.toString()} />
      </section>

      <section
        style={{
          backgroundColor: "#fff",
          borderRadius: 14,
          padding: 24,
          boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
        }}
      >
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 16 }}>Ranking · {labelMonth(month)}</h2>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e8e1d6", color: "#5a4f47" }}>
              <Th>#</Th>
              <Th>Profissional</Th>
              <Th align="right">Score</Th>
              <Th align="right">Execução</Th>
              <Th align="right">Relac.</Th>
              <Th align="right">Vendas</Th>
              <Th align="right">Co-Cri.</Th>
              <Th align="right">Prêmio</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.profile_id} style={{ borderBottom: "1px solid #f3efe8" }}>
                <Td>{i + 1}º</Td>
                <Td>
                  <a
                    href={`/painel-interno/equipe/${r.profile_id}`}
                    style={{ color: "#1f1a17", textDecoration: "none", fontWeight: 600 }}
                  >
                    {r.full_name}
                  </a>
                  <div style={{ fontSize: 11, color: "#8a8a8a" }}>{r.role}</div>
                </Td>
                <Td align="right">
                  <strong style={{ fontSize: 18, color: i === 0 ? "#8a6f3d" : undefined }}>
                    {Math.round(r.total_score)}
                  </strong>
                </Td>
                <Td align="right">{Math.round(r.execucao_score)}%</Td>
                <Td align="right">{Math.round(r.relacionamento_score)}%</Td>
                <Td align="right">{Math.round(r.vendas_score)}%</Td>
                <Td align="right">{Math.round(r.cocriacao_score)}%</Td>
                <Td align="right">
                  <strong style={{ color: "#8a6f3d" }}>{brl(r.premio_centavos)}</strong>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>

        {rows.length === 0 && (
          <p style={{ textAlign: "center", color: "#8a8a8a", padding: 30 }}>
            Nenhum score computado pra esta unidade neste mês.
          </p>
        )}
      </section>

      <aside style={{ marginTop: 28, padding: 18, background: "#fef9e7", borderLeft: "3px solid #b89968", borderRadius: 4 }}>
        <p style={{ fontSize: 12, color: "#5a4f47", lineHeight: 1.6 }}>
          <strong>💡 Como o Score é calculado:</strong> Execução (40%) + Relacionamento (30%) + Vendas Saudáveis (20%) + Co-Criação (10%). Prêmios: 70-79 R$ 200 · 80-89 R$ 500 · 90-99 R$ 1.000 · 100 R$ 1.500. Ver{" "}
          <a href="/painel-interno/score-de-cuidado/regras" style={{ color: "#8a3a4f", fontWeight: 600 }}>
            regras completas
          </a>
          .
        </p>
      </aside>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        padding: "10px 12px",
        fontSize: 10,
        letterSpacing: 1,
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return <td style={{ padding: "12px", textAlign: align ?? "left" }}>{children}</td>;
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 10, letterSpacing: 1, textTransform: "uppercase", color: "#8a8a8a", fontWeight: 700 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: -0.5,
          color: accent ? "#8a6f3d" : "#1f1a17",
          marginTop: 4,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function labelMonth(ym: string): string {
  const months = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const [y, m] = ym.split("-");
  return `${months[Number(m) - 1]} ${y}`;
}
