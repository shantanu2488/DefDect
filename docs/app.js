const FALLBACK_RULES = [
  { code: 205, title: "Memo of parties incomplete or unsigned", keywords: ["memo of parties", "petitioner", "respondent", "address", "email"] },
  { code: 209, title: "Court fee short/missing or stamping issue", keywords: ["court fee", "stamp", "valuation", "ad valorem"] },
  { code: 211, title: "Margin/paper format issues", keywords: ["margin", "left side", "a4", "legal size", "formatting"] },
  { code: 212, title: "Affidavit attestation and deponent details missing", keywords: ["affidavit", "attested", "age", "address", "deponent"] },
  { code: 216, title: "Annexures not marked as true copies", keywords: ["annexure", "true copy", "signed", "index"] },
  { code: 219, title: "Improper page numbering", keywords: ["page", "pagination", "alpha", "double page"] },
  { code: 221, title: "Vernacular docs without English translation", keywords: ["hindi", "vernacular", "translation", "english translation"] },
  { code: 227, title: "Incorrect classification / maintainability", keywords: ["maintainable", "nomenclature", "classification", "provision of law"] },
  { code: 237, title: "Vakalatnama details incomplete", keywords: ["vakalatnama", "welfare stamp", "enrolment", "advocate"] },
  { code: 257, title: "Improper margin settings for e-filing", keywords: ["left 1.75", "right 1", "top 1.5", "margin"] }
];

const input = document.getElementById("pdfInput");
const button = document.getElementById("checkBtn");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const status = document.getElementById("status");
const result = document.getElementById("result");
const PDFJS_VERSION = "4.4.168";
let ACTIVE_RULES = [...FALLBACK_RULES];
let RULE_SOURCE = "fallback_static_rules";

function setStatus(text, isError = false) {
  status.textContent = text;
  status.style.color = isError ? "#dc2626" : "#111827";
}

function confidenceClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

function formatNowLikeNotice(now) {
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const hh = now.getHours() % 12 || 12;
  const min = String(now.getMinutes()).padStart(2, "0");
  const ampm = now.getHours() >= 12 ? "PM" : "AM";
  return `${dd}/${mm}/${yyyy} ${hh}:${min} ${ampm}`;
}

function extractCaseContext(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean);

  const diaryMatch = rawText.match(/diary\s*no\.?\s*[:\-]?\s*([0-9]{3,}\/[0-9]{2,4})/i);
  const diaryNo = diaryMatch?.[1] || "N/A";

  let caseTitle = "N/A";
  for (const line of lines) {
    if (/\b(vs\.?|versus)\b/i.test(line) && line.length > 12) {
      caseTitle = line.replace(/\s+/g, " ");
      break;
    }
  }

  return { diaryNo, caseTitle };
}

function keywordsFromText(text) {
  const words = (text.toLowerCase().match(/[a-z]{4,}/g) || []);
  const stop = new Set(["should", "filed", "given", "with", "that", "from", "this", "been", "also", "into", "only", "where", "which"]);
  const out = [];
  for (const w of words) {
    if (stop.has(w)) continue;
    if (!out.includes(w)) out.push(w);
    if (out.length >= 6) break;
  }
  return out.length ? out : ["petition", "application", "affidavit"];
}

function parseRulesFromMarkdown(mdText) {
  const rules = [];
  const lines = mdText.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*(\d{3})\\?\.\s*(.+)\s*$/);
    if (!m) continue;
    const code = Number(m[1]);
    const title = m[2].trim();
    if (!title || title.length < 8) continue;
    rules.push({ code, title, keywords: keywordsFromText(title) });
  }
  return rules;
}

async function loadRules() {
  try {
    const res = await fetch("./list-of-common-objections-0.md", { cache: "no-store" });
    if (!res.ok) throw new Error(`source file fetch failed: ${res.status}`);
    const md = await res.text();
    const parsed = parseRulesFromMarkdown(md);
    if (parsed.length < 20) throw new Error("parsed too few rules");
    ACTIVE_RULES = parsed;
    RULE_SOURCE = "delhi_hc_markdown_source";
  } catch (err) {
    console.error("Rule-source load failed, using fallback rules", err);
    ACTIVE_RULES = [...FALLBACK_RULES];
    RULE_SOURCE = "fallback_static_rules";
  }
}

async function extractPdfText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let pdfjsLib;
  try {
    // Preferred: module build
    pdfjsLib = await import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`);
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
  } catch (importErr) {
    // Fallback: legacy UMD build injected via <script>
    console.error("pdf.js module import failed, falling back to legacy build", importErr);
    pdfjsLib = window.pdfjsLib;
    if (!pdfjsLib) {
      throw importErr;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`;
  }

  const baseOpts = {
    data: bytes,
    useWorkerFetch: true,
    isEvalSupported: false
  };

  // Some browsers (notably older iOS/Safari) have issues with module workers from CDN.
  // Fallback to parsing on main thread if worker setup fails.
  let pdf;
  try {
    pdf = await pdfjsLib.getDocument({
      ...baseOpts,
      stopAtErrors: false,
      disableFontFace: true
    }).promise;
  } catch (err) {
    console.error("pdf.js worker load failed, retrying without worker", err);
    pdf = await pdfjsLib.getDocument({
      ...baseOpts,
      disableWorker: true,
      stopAtErrors: false,
      disableFontFace: true
    }).promise;
  }
  const chunks = [];
  setStatus(`Reading ${pdf.numPages} page(s)...`);

  for (let i = 1; i <= pdf.numPages; i += 1) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent({ disableCombineTextItems: false });
      const text = content.items.map((x) => x.str).join(" ");
      chunks.push(text);
    } catch (pageErr) {
      // Keep going even if a page can't be decoded.
      console.error(`PDF page ${i} parse error`, pageErr);
      chunks.push("");
    }
    progressBar.style.width = `${Math.round((i / pdf.numPages) * 100)}%`;
    setStatus(`Analyzing page ${i} of ${pdf.numPages}...`);
  }
  const rawText = chunks.join("\n");
  return {
    rawText,
    normalizedText: rawText.toLowerCase()
  };
}

function checkRules(text) {
  const hits = [];
  for (const rule of ACTIVE_RULES) {
    const matched = rule.keywords.filter((k) => text.includes(k));
    if (matched.length) {
      hits.push({
        code: rule.code,
        title: rule.title,
        confidence: Math.round((matched.length / rule.keywords.length) * 100)
      });
    }
  }
  return hits.sort((a, b) => b.confidence - a.confidence);
}

function renderResult(defects, context) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const dateOnly = `${dd}/${mm}/${yyyy}`;
  const nowDisplay = formatNowLikeNotice(now);
  const main = defects.slice(0, 3);
  const other = defects.slice(3);
  const topRisk = defects[0]?.confidence ?? 0;

  const mainRows = main.map((d, i) => `
    <tr>
      <td class="c-sl">${i + 1}</td>
      <td>(${d.code}) - ${d.title} <span class="pill ${confidenceClass(d.confidence)}">${d.confidence}%</span></td>
      <td class="c-date">${dateOnly}</td>
      <td class="c-date"></td>
    </tr>
  `).join("") || `<tr><td colspan="4">No defects detected.</td></tr>`;

  const otherRows = other.map((d, i) => `
    <tr>
      <td class="c-sl">${i + 4}</td>
      <td colspan="2">Description of any other Defects: (${d.code}) - ${d.title} <span class="pill ${confidenceClass(d.confidence)}">${d.confidence}%</span></td>
      <td class="c-date">${dateOnly}</td>
    </tr>
  `).join("");

  result.innerHTML = `
    <div class="summary">
      <div class="metric"><span class="label">Rules Checked</span><span class="value">${ACTIVE_RULES.length}</span></div>
      <div class="metric"><span class="label">Possible Defects</span><span class="value">${defects.length}</span></div>
      <div class="metric"><span class="label">Top Risk</span><span class="value">${topRisk}%</span></div>
    </div>
    <p>Dear Sir/Madam</p>
    <p class="indent">Thank you for using e-filing.</p>
    <p class="indent">Please check defect(s) marked against</p>
    <p class="indent">Diary No:${context.diaryNo} in the matter</p>
    <p class="indent">${context.caseTitle}</p>
    <table>
      <thead>
        <tr>
          <th class="c-sl">SlNo.</th>
          <th>Defects marked during Scrutiny</th>
          <th class="c-date">Date of Defects Marked</th>
          <th class="c-date">Date of Defect Removed</th>
        </tr>
      </thead>
      <tbody>
        ${mainRows}
        ${otherRows ? `<tr><th colspan="3">Any Other Defects</th><th>Marked On</th></tr>${otherRows}` : ""}
      </tbody>
    </table>
    <p><strong>Date :</strong>${nowDisplay}</p>
    <p class="indent">Please check your Dashboard regularly for new updates.</p>
    <p><small>Rules checked: ${ACTIVE_RULES.length} | Possible defects: ${defects.length} | Source: ${RULE_SOURCE}</small></p>
  `;
  result.classList.remove("hidden");
}

button.addEventListener("click", async () => {
  const file = input.files?.[0];
  if (!file) {
    setStatus("Please select a PDF file first.", true);
    return;
  }
  progressWrap.classList.remove("hidden");
  progressBar.style.width = "0%";
  result.classList.add("hidden");
  button.disabled = true;
  button.textContent = "Checking...";
  setStatus("Preparing analysis...");

  try {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please upload a .pdf file.");
    }
    const textPayload = await extractPdfText(file);
    const context = extractCaseContext(textPayload.rawText);
    if (!textPayload.normalizedText || textPayload.normalizedText.trim().length < 30) {
      setStatus(
        "This PDF has little/no extractable text (often scanned/image-only). Convert it to a text-based PDF (OCR) and try again.",
        true
      );
      return;
    }
    setStatus("Matching objections...");
    const defects = checkRules(textPayload.normalizedText);
    renderResult(defects, context);
    setStatus("Check completed.");
  } catch (e) {
    console.error("PDF read error:", e);
    const name = e?.name ? `${e.name}` : "Error";
    const msg = e?.message ? `${e.message}` : "";
    const reason = msg ? ` Reason: ${name}: ${msg}` : ` Reason: ${name}`;
    setStatus(
      `Unable to read this PDF in browser.${reason} If it is password-protected or scanned (image-only), this static site may fail—try exporting a text-based PDF.`,
      true
    );
  } finally {
    button.disabled = false;
    button.textContent = "Check Defects";
  }
});

loadRules().then(() => {
  setStatus(`Rule source ready: ${RULE_SOURCE.replaceAll("_", " ")}`);
});
