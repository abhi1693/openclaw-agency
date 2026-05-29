"""CofiaPublisher — GARDE-FOU no_luma_billing_guard (HARDLOCK Erwin).

source_tag: NY_COFIAPUB_NO_LUMA_BILLING_GUARD_20260529

Bloque TOUTE commande / URL / action Luma (ou autre) qui touche au billing / compte / abonnement.
Vaut surtout pour le chemin cookie/session (pilotage du compte web d'Erwin) : on ne fait QUE
de la génération vidéo + lecture d'usage. JAMAIS billing, cancel, upgrade, downgrade, achat, etc.

Termes interdits (insensible à la casse) :
  billing · subscription · cancel · downgrade · upgrade · manage plan · manage subscription ·
  payment · invoice · delete account · account settings · checkout · pricing · plan/choose

Exception ERWIN_BILLING_GO=1 : existe pour d'AUTRES contextes, mais **interdite pour CofiaPublisher/Luma**
→ ici le garde-fou refuse même avec le flag (double sécurité).
"""
from __future__ import annotations

FORBIDDEN = [
    "billing", "subscription", "subscribe?", "cancel", "downgrade", "upgrade",
    "manage plan", "manage-plan", "manage subscription", "manage-subscription",
    "payment", "invoice", "delete account", "delete-account", "account settings",
    "account-settings", "checkout", "/pricing", "choose plan", "choose-plan",
]


class LumaBillingGuardViolation(RuntimeError):
    pass


def is_forbidden(target: str) -> str | None:
    """Retourne le terme interdit trouvé (ou None)."""
    t = (target or "").lower()
    for term in FORBIDDEN:
        if term in t:
            return term
    return None


def assert_no_billing(target: str, context: str = "luma") -> None:
    """Lève LumaBillingGuardViolation si `target` (URL/commande/action) touche au billing/compte.
    Pour CofiaPublisher/Luma : refuse TOUJOURS (ERWIN_BILLING_GO ignoré ici, double sécurité)."""
    hit = is_forbidden(target)
    if hit:
        raise LumaBillingGuardViolation(
            f"no_luma_billing_guard: action bloquée (terme « {hit} ») dans contexte {context}. "
            f"Génération/lecture-usage uniquement. Aucun accès billing/compte/abonnement Luma."
        )


def safe(target: str) -> bool:
    """True si l'action est autorisée (génération / lecture usage), False si billing/compte."""
    return is_forbidden(target) is None
