"""
Endpoint Flask: /madrinha/auto-login

Recebe ?jwt=XXX vindo da WebView do app mobile.
Valida assinatura HS256 com PAINEL_JWT_SECRET (mesma do Supabase).
Cria/atualiza sessão Flask e redireciona pro Painel das Madrinhas logado.

Instalar dependência:
  pip install PyJWT==2.8.0

Variável de ambiente necessária:
  PAINEL_JWT_SECRET — exatamente o mesmo secret usado na edge function do Supabase

Como adicionar ao seu painel.estudiomaisestetica.com.br:

1. Copia esta função pra um blueprint do Flask (ou diretamente em app.py).
2. Registra a rota: app.register_blueprint(madrinha_bp) ou cola dentro do @app.route.
3. Garante que sua função existente login_user(user) funciona com o User que vier do DB.
4. Define PAINEL_JWT_SECRET no mesmo .env do Flask.
5. Teste local:
     curl -L "http://localhost:5000/madrinha/auto-login?jwt=<token-gerado-pela-edge-function>"
"""

import os
import jwt as pyjwt
from datetime import datetime, timezone
from flask import Blueprint, request, redirect, abort, current_app, session
from flask_login import login_user  # ajuste se você usa outro sistema de auth

# === Ajuste estes 2 imports pro seu projeto ===
# from app.models import MadrinhaUser     # seu modelo de usuária no Flask
# from app.db import db                    # SQLAlchemy ou similar
# ===============================================

madrinha_bp = Blueprint("madrinha", __name__, url_prefix="/madrinha")

PAINEL_JWT_SECRET = os.environ.get("PAINEL_JWT_SECRET")
EXPECTED_ISSUER = "estudio-mais-supabase"
EXPECTED_AUDIENCE = "painel-madrinhas-flask"
ALLOWED_SCOPES = {"madrinha"}


@madrinha_bp.route("/auto-login", methods=["GET"])
def auto_login():
    """
    Valida JWT vindo da WebView do app e loga a cliente no Flask.
    """
    if not PAINEL_JWT_SECRET:
        current_app.logger.error("PAINEL_JWT_SECRET não está configurado")
        return abort(500, "Server misconfigured")

    token = request.args.get("jwt")
    if not token:
        return abort(400, "Missing jwt parameter")

    # 1. Decodificar e validar assinatura + claims básicos
    try:
        payload = pyjwt.decode(
            token,
            PAINEL_JWT_SECRET,
            algorithms=["HS256"],
            issuer=EXPECTED_ISSUER,
            audience=EXPECTED_AUDIENCE,
            options={
                "require": ["exp", "iat", "sub", "scope", "profile_id", "client_id"],
                "verify_exp": True,
                "verify_iat": True,
                "verify_iss": True,
                "verify_aud": True,
            },
        )
    except pyjwt.ExpiredSignatureError:
        return abort(401, "Token expired")
    except pyjwt.InvalidIssuerError:
        return abort(401, "Invalid issuer")
    except pyjwt.InvalidAudienceError:
        return abort(401, "Invalid audience")
    except pyjwt.InvalidTokenError as e:
        current_app.logger.warning(f"JWT inválido: {e}")
        return abort(401, "Invalid token")

    # 2. Validar scope
    if payload.get("scope") not in ALLOWED_SCOPES:
        return abort(403, f"Scope not allowed: {payload.get('scope')}")

    # 3. Encontrar (ou criar) a usuária Madrinha no DB do Flask
    profile_id = payload["profile_id"]
    cpf = payload.get("cpf")
    full_name = payload.get("full_name")
    email = payload.get("email")

    user = find_or_create_madrinha(
        supabase_profile_id=profile_id,
        cpf=cpf,
        full_name=full_name,
        email=email,
        high_value=payload.get("high_value"),
        membership_status=payload.get("membership_status"),
    )
    if not user:
        return abort(403, "Could not provision user")

    # 4. Login Flask + flag de auditoria
    login_user(user, remember=False, duration=None)
    session["madrinha_source"] = "mobile-app-jwt"
    session["jwt_issued_at"] = payload["iat"]
    session["high_value_active"] = bool(payload.get("high_value"))

    # 5. Redireciona pro painel principal — ajuste pro seu URL
    return redirect("/painel/dashboard")


def find_or_create_madrinha(
    supabase_profile_id: str,
    cpf: str | None,
    full_name: str | None,
    email: str | None,
    high_value: dict | None,
    membership_status: str | None,
):
    """
    Encontra Madrinha pelo supabase_profile_id (se você adicionou essa coluna)
    ou pelo CPF. Se não existir, cria com perfil mínimo.

    AJUSTE O CÓDIGO ABAIXO PRO SEU MODELO REAL no Flask.
    """
    # EXEMPLO — substitua MadrinhaUser/db pelos seus reais
    # user = MadrinhaUser.query.filter_by(supabase_profile_id=supabase_profile_id).first()
    # if not user and cpf:
    #     user = MadrinhaUser.query.filter_by(cpf=cpf).first()
    # if not user:
    #     user = MadrinhaUser(
    #         supabase_profile_id=supabase_profile_id,
    #         cpf=cpf,
    #         full_name=full_name,
    #         email=email,
    #         is_active=True,
    #     )
    #     db.session.add(user)
    #
    # # Sync flags do High Value (você decide se quer guardar)
    # user.has_high_value_benefits = bool(high_value)
    # user.membership_status = membership_status
    # user.last_jwt_login_at = datetime.now(timezone.utc)
    # db.session.commit()
    #
    # return user
    raise NotImplementedError(
        "Implementar find_or_create_madrinha() com seu modelo de usuária no Flask"
    )
