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

## GitHub Pages deployment (static mode)

The repository now includes a Pages-ready static app in `docs/`:

- `docs/index.html`
- `docs/app.js`
- `docs/style.css`
- `.github/workflows/pages.yml` (auto deploy)

How to enable:

1. Push latest `main` branch to GitHub.
2. Open repository **Settings -> Pages**.
3. Under **Build and deployment**, choose **GitHub Actions**.
4. Wait for workflow **Deploy GitHub Pages** to complete.
5. Your app will be available at:
   - `https://shantanu2488.github.io/DefDect/`

Notes:

- GitHub Pages mode runs entirely in browser (no FastAPI backend).
- PDF text extraction is done client-side using `pdf.js`.
- This mode keeps the same email-style output format and objection screening flow.

## Notes

- This is keyword-based matching, not legal advice.
- You can expand `backend/objections.py` with more rules and better NLP scoring.
