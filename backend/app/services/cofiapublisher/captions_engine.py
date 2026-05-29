"""CofiaPublisher — moteur de CAPTIONS word-level (horloge maître).

source_tag: NY_COFIAPUB_CAPTIONS_20260529
Source de timing : alignement caractère ElevenLabs (with-timestamps) — exact, zéro whisper requis
pour la voix premium. Convertit chars→mots avec emphase mot-clé pour le rendu kinetic Remotion.
"""
from __future__ import annotations

# Mots-clés trading qui passent en couleur accent (surlignage kinetic).
EMPHASIS_LEXICON = {
    "95", "200", "ia", "intelligences", "escrocs", "arnaque", "arnaquer", "mentir", "vérité",
    "risque", "signaux", "formation", "gratuit", "cofiatrading", "erwin", "millions", "seul",
    "armée", "perdent", "broker", "honnête", "marre", "pourries", "1%", "jamais",
}


def words_from_elevenlabs(alignment: dict, emphasis_lexicon: set[str] | None = None) -> list[dict]:
    """Chars ElevenLabs → mots [{text,startMs,endMs,emphasis}]. Découpe sur les espaces."""
    lex = emphasis_lexicon or EMPHASIS_LEXICON
    chars = alignment.get("characters", [])
    starts = alignment.get("starts_s", [])
    ends = alignment.get("ends_s", [])
    words: list[dict] = []
    cur, cur_start = "", None
    for i, ch in enumerate(chars):
        if ch == " " or ch == "\n":
            if cur.strip():
                words.append(_mk(cur, cur_start, ends[i - 1] if i > 0 else cur_start, lex))
            cur, cur_start = "", None
        else:
            if cur_start is None:
                cur_start = starts[i] if i < len(starts) else 0.0
            cur += ch
    if cur.strip():
        words.append(_mk(cur, cur_start, ends[-1] if ends else cur_start, lex))
    # fusionne la ponctuation isolée (FR: espace avant ? ! : ;) dans le mot précédent → pas d'orphelin
    merged: list[dict] = []
    for w in words:
        if merged and all(c in ".,!?;:»«…-" for c in w["text"]):
            merged[-1]["text"] += " " + w["text"]
            merged[-1]["endMs"] = w["endMs"]
        else:
            merged.append(w)
    return merged


def _mk(word: str, start_s, end_s, lex: set[str]) -> dict:
    clean = word.strip().lower().strip(".,!?;:\"'»«")
    return {"text": word.strip(),
            "startMs": int((start_s or 0) * 1000),
            "endMs": int((end_s or 0) * 1000),
            "emphasis": clean in lex or any(k in clean for k in ("%", "€"))}


def chunk_words(words: list[dict], max_chunk: int = 3, max_ms: int = 900) -> list[dict]:
    """Regroupe en chunks 2-4 mots tenus ≤900ms (pacing Dynamic Minimalism 2026)."""
    chunks, buf = [], []
    for w in words:
        buf.append(w)
        span = buf[-1]["endMs"] - buf[0]["startMs"]
        if len(buf) >= max_chunk or span >= max_ms:
            chunks.append(_merge(buf)); buf = []
    if buf:
        chunks.append(_merge(buf))
    return chunks


def _merge(buf: list[dict]) -> dict:
    return {"text": " ".join(w["text"] for w in buf),
            "startMs": buf[0]["startMs"], "endMs": buf[-1]["endMs"],
            "tokens": buf, "emphasis": any(w["emphasis"] for w in buf)}
