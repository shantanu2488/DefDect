# DefDect

Single-PDF objection checker prototype for Delhi High Court style filing defects.

## Run locally

1. Create virtual environment and install dependencies:
   - `python3 -m venv .venv`
   - `source .venv/bin/activate`
   - `pip install -r requirements.txt`
2. Start server:
   - `uvicorn backend.main:app --reload`
3. Open:
   - `http://127.0.0.1:8000`

## Current behavior

- Accepts one PDF.
- Tries to fetch Delhi HC objection rules from the live FAQ page, and falls back to curated rules if needed.
- Shows upload progress bar and a tabular defect output (email-style metadata supported).
- Exports screening report as PDF and Word (`.docx`).

## Notes

- This is keyword-based matching, not legal advice.
- You can expand `backend/objections.py` with more rules and better NLP scoring.
