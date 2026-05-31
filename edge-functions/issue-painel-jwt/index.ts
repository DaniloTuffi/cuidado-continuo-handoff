// supabase/functions/issue-painel-jwt/index.ts
//
// Edge Function (Deno) — emite um JWT assinado pra cliente Madrinha entrar
// no Painel das Madrinhas (Flask) via WebView do app sem precisar logar de novo.
//
// Fluxo:
//   App invoca:  supabase.functions.invoke('issue-painel-jwt', { body: { profile_id, scope } })
//   Esta função:
//     1. Valida que profile_id == auth.uid() (não pode emitir JWT pra outra pessoa)
//     2. Confirma membership ativa em clube_madrinhas_membership
//     3. Pega dados básicos da cliente (nome, email, cpf, client_details.id)
//     4. Gera JWT HMAC-SHA256 com payload + assinatura usando PAINEL_JWT_SECRET
//     5. Retorna { jwt, expires_at }
//
// Flask valida com a mesma PAINEL_JWT_SECRET (compartilhada via env var).
//
// Env vars necessárias no Supabase:
//   SUPABASE_URL                — auto
//   SUPABASE_SERVICE_ROLE_KEY   — auto
//   PAINEL_JWT_SECRET           — secret compartilhado com Flask (mínimo 32 bytes random)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate, Header, Payload } from "https://deno.land/x/djwt@v3.0.2/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const PAINEL_JWT_SECRET = Deno.env.get("PAINEL_JWT_SECRET")!;

const TTL_SECONDS = 30 * 60; // 30 minutos

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Converte PAINEL_JWT_SECRET (string) em CryptoKey HS256 — djwt exige
async function loadKey(): Promise<CryptoKey> {
  const enc = new TextEncoder().encode(PAINEL_JWT_SECRET);
  return await crypto.subtle.importKey(
    "raw",
    enc,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const userToken = authHeader.replace("Bearer ", "");
    if (!userToken) return json({ error: "missing_authorization" }, 401);

    // Cliente Supabase com o JWT do usuário pra validar identidade
    const supaUser = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supaUser.auth.getUser(userToken);
    if (userErr || !userData?.user) return json({ error: "invalid_user" }, 401);

    const authUid = userData.user.id;
    const body = await req.json().catch(() => ({}));
    const requestedProfileId: string = body.profile_id;
    const scope: string = body.scope ?? "madrinha";

    if (!requestedProfileId) return json({ error: "missing_profile_id" }, 400);
    if (requestedProfileId !== authUid) {
      // Não emite JWT pra terceiro — defesa contra impersonation
      return json({ error: "forbidden_other_profile" }, 403);
    }

    // Cliente Service Role pra checar membership (bypassa RLS pra essa checagem específica)
    const supaService = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Profile + client_details
    const { data: profile, error: pErr } = await supaService
      .from("profiles")
      .select(`
        id, full_name, email, cpf,
        client_details!profile_id (id, total_spent)
      `)
      .eq("id", authUid)
      .single();

    if (pErr || !profile) return json({ error: "profile_not_found" }, 404);
    const clientDetails = (profile as any).client_details?.[0] ?? (profile as any).client_details;
    if (!clientDetails?.id) return json({ error: "not_a_client" }, 403);

    // 2. Confirma Madrinha ativa
    const { data: membership } = await supaService
      .from("clube_madrinhas_membership")
      .select("status, expires_at, entry_type")
      .eq("client_id", clientDetails.id)
      .maybeSingle();

    const ALLOWED_STATUSES = ["active", "invited"];
    if (!membership || !ALLOWED_STATUSES.includes(membership.status)) {
      return json({ error: "not_a_madrinha", current_status: membership?.status ?? "none" }, 403);
    }
    if (membership.expires_at && new Date(membership.expires_at) < new Date()) {
      return json({ error: "membership_expired" }, 403);
    }

    // 3. Verifica se tem benefícios High Value ativos (informativo, vai no JWT)
    const { data: benefits } = await supaService
      .from("clube_high_value_benefits")
      .select("medical_consultations_remaining, nutri_consultations_remaining, nutri_photo_reviews_remaining, ends_at")
      .eq("client_id", clientDetails.id)
      .eq("is_active", true)
      .maybeSingle();

    // 4. Monta payload do JWT
    const now = Math.floor(Date.now() / 1000);
    const payload: Payload = {
      iss: "estudio-mais-supabase",
      aud: "painel-madrinhas-flask",
      sub: authUid,
      iat: now,
      nbf: now,
      exp: now + TTL_SECONDS,
      scope,
      profile_id: authUid,
      client_id: clientDetails.id,
      full_name: profile.full_name,
      email: profile.email,
      cpf: (profile as any).cpf,
      membership_status: membership.status,
      entry_type: membership.entry_type,
      high_value: benefits ? {
        medical_left: benefits.medical_consultations_remaining ?? 0,
        nutri_left: benefits.nutri_consultations_remaining ?? 0,
        nutri_photos_left: benefits.nutri_photo_reviews_remaining ?? 0,
        benefits_expire_at: benefits.ends_at,
      } : null,
    };

    const header: Header = { alg: "HS256", typ: "JWT" };
    const key = await loadKey();
    const jwt = await create(header, payload, key);

    // 5. Log de auditoria (membership.flask_token_issued_at)
    await supaService
      .from("clube_madrinhas_membership")
      .update({ flask_token_issued_at: new Date().toISOString() })
      .eq("client_id", clientDetails.id);

    return json({
      jwt,
      expires_at: new Date(payload.exp! * 1000).toISOString(),
      scope,
    });
  } catch (e) {
    console.error("issue-painel-jwt error:", e);
    return json({ error: "internal_error", message: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
