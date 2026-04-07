import re
from dataclasses import dataclass
from typing import List, Tuple

import requests
from bs4 import BeautifulSoup


@dataclass
class ObjectionRule:
    code: int
    title: str
    keywords: List[str]
    guidance: str


# Curated subset based on Delhi High Court common objections list.
RULES: List[ObjectionRule] = [
    ObjectionRule(
        code=205,
        title="Memo of parties incomplete or unsigned",
        keywords=["memo of parties", "petitioner", "respondent", "address", "email"],
        guidance="File signed memo of parties with complete party details and addresses.",
    ),
    ObjectionRule(
        code=209,
        title="Court fee short/missing or stamping issue",
        keywords=["court fee", "stamp", "valuation", "ad valorem"],
        guidance="Affix correct court fee as per valuation and ensure proper stamping.",
    ),
    ObjectionRule(
        code=211,
        title="Margin/paper format issues",
        keywords=["margin", "left side", "a4", "legal size", "formatting"],
        guidance="Maintain required margins and filing paper format as per rules.",
    ),
    ObjectionRule(
        code=212,
        title="Affidavit attestation and deponent details missing",
        keywords=["affidavit", "attested", "age", "address", "deponent"],
        guidance="Ensure affidavit is properly attested with age and complete details.",
    ),
    ObjectionRule(
        code=216,
        title="Annexures not marked as true copies",
        keywords=["annexure", "true copy", "signed", "index"],
        guidance="Mark each annexure as true copy and sign at the bottom of each page.",
    ),
    ObjectionRule(
        code=219,
        title="Improper page numbering",
        keywords=["page", "pagination", "alpha", "double page"],
        guidance="Use continuous numeric pagination without duplicates or alphanumeric pages.",
    ),
    ObjectionRule(
        code=221,
        title="Vernacular documents without English translation",
        keywords=["hindi", "vernacular", "translation", "english translation"],
        guidance="Provide certified English translations for vernacular documents.",
    ),
    ObjectionRule(
        code=227,
        title="Incorrect classification / maintainability not shown",
        keywords=["maintainable", "nomenclature", "classification", "provision of law"],
        guidance="Correctly classify the petition and mention relevant legal provision.",
    ),
    ObjectionRule(
        code=237,
        title="Vakalatnama details incomplete",
        keywords=["vakalatnama", "welfare stamp", "enrolment", "advocate"],
        guidance="File complete vakalatnama with signatures, welfare stamp, and counsel details.",
    ),
    ObjectionRule(
        code=257,
        title="Improper margin settings for e-filing",
        keywords=["left 1.75", "right 1", "top 1.5", "margin"],
        guidance="Use e-filing margin settings exactly as prescribed in the rules.",
    ),
]

SOURCE_URL = "https://www.delhihighcourt.nic.in/web/faqs/list-of-common-objections?page=3"


def _keywords_from_text(text: str) -> List[str]:
    words = re.findall(r"[a-zA-Z]{4,}", text.lower())
    stop = {
        "should",
        "filed",
        "given",
        "with",
        "that",
        "from",
        "this",
        "been",
        "only",
        "into",
        "also",
        "where",
        "which",
    }
    uniq = []
    for w in words:
        if w in stop:
            continue
        if w not in uniq:
            uniq.append(w)
        if len(uniq) >= 6:
            break
    return uniq or ["petition", "application", "affidavit"]


def fetch_dynamic_rules() -> List[ObjectionRule]:
    resp = requests.get(SOURCE_URL, timeout=10)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text("\n")
    rules: List[ObjectionRule] = []
    for raw_line in text.splitlines():
        line = " ".join(raw_line.split())
        match = re.match(r"^(\d{3})\.\s*(.+)$", line)
        if not match:
            continue
        code = int(match.group(1))
        title = match.group(2)[:140]
        if len(title) < 10:
            continue
        rules.append(
            ObjectionRule(
                code=code,
                title=title,
                keywords=_keywords_from_text(title),
                guidance=title,
            )
        )
    if len(rules) < 20:
        raise ValueError("Dynamic objection parsing returned too few rules.")
    return rules


def load_rules() -> Tuple[List[ObjectionRule], str]:
    try:
        return fetch_dynamic_rules(), "delhi_hc_live_page"
    except Exception:
        return RULES, "curated_fallback"
