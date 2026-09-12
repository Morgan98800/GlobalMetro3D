"""
check_feed_freshness.py — Veille de fraîcheur du flux GTFS STM (§5.2)

Effectue une requête HTTP HEAD sur le fichier GTFS officiel de la STM
et compare l'empreinte (Last-Modified, ETag, Content-Length) avec l'empreinte
locale enregistrée dans cities/montreal/data/feed_fingerprint.json.

Avertit explicitement lorsqu'un nouveau jeu est disponible sans téléchargement
automatique (conformément à la consigne §5.2 : revue requise car les évolutions
de structure de données STM nécessitent une validation manuelle).
"""

from __future__ import annotations

import json
import os
import sys
import urllib.request
from pathlib import Path

DEFAULT_URL = "https://www.stm.info/sites/default/files/gtfs/gtfs_stm.zip"


def check_freshness(
    url: str = DEFAULT_URL,
    fingerprint_path: Optional[str | Path] = None,
) -> dict:
    base_dir = Path(__file__).resolve().parents[3]
    if fingerprint_path is None:
        fingerprint_path = base_dir / "cities" / "montreal" / "data" / "feed_fingerprint.json"
    else:
        fingerprint_path = Path(fingerprint_path)

    stored_fp = {}
    if fingerprint_path.exists():
        try:
            with open(fingerprint_path, "r", encoding="utf-8") as f:
                stored_fp = json.load(f)
        except Exception:
            stored_fp = {}

    req = urllib.request.Request(url, method="HEAD", headers={
        "User-Agent": "MontrealSubwayFreshnessChecker/1.0"
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            headers = dict(resp.headers)
            remote_last_modified = headers.get("Last-Modified", "")
            remote_etag = headers.get("ETag", "").strip('"')
            remote_content_length = headers.get("Content-Length", "")
    except Exception as err:
        print(f"⚠️ [freshness] Erreur de vérification du serveur STM : {err}", file=sys.stderr)
        return {
            "status": "error",
            "error": str(err),
            "checked": False
        }

    current_fp = {
        "url": url,
        "last_modified": remote_last_modified,
        "etag": remote_etag,
        "content_length": remote_content_length,
    }

    is_new = False
    if stored_fp:
        if (
            (remote_etag and remote_etag != stored_fp.get("etag"))
            or (remote_last_modified and remote_last_modified != stored_fp.get("last_modified"))
            or (remote_content_length and remote_content_length != stored_fp.get("content_length"))
        ):
            is_new = True

    if is_new:
        print("=" * 70)
        print("⚠️ ALERTE : UN NOUVEAU JEU DE DONNÉES GTFS STM EST PUBLIÉ SUR LE SERVEUR !")
        print(f"   Précédent : {stored_fp}")
        print(f"   Nouveau   : {current_fp}")
        print("   Action requise : Revue manuelle avant ingestion (pas d'ingestion automatique).")
        print("=" * 70)
    else:
        print(f"✅ [freshness] Jeu de données distant STM vérifié et inchangé : {current_fp['last_modified'] or current_fp['etag']}")

    # Sauvegarder l'empreinte
    fingerprint_path.parent.mkdir(parents=True, exist_ok=True)
    with open(fingerprint_path, "w", encoding="utf-8") as f:
        json.dump(current_fp, f, indent=2)

    return {
        "status": "new_available" if is_new else "up_to_date",
        "fingerprint": current_fp,
        "is_new": is_new
    }


if __name__ == "__main__":
    check_freshness()
