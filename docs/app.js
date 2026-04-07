const RULES = [
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
const diaryNo = document.getElementById("diaryNo");
const caseTitle = document.getElementById("caseTitle");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const status = document.getElementById("status");
const result = document.getElementById("result");

function setStatus(text, isError = false) {
  status.textContent = text;
  status.style.color = isError ? "#dc2626" : "#111827";
}

function confidenceClass(score) {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
}

async function extractPdfText(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs");
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  const chunks = [];
  setStatus(`Reading ${pdf.numPages} page(s)...`);

  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((x) => x.str).join(" ");
    chunks.push(text);
    progressBar.style.width = `${Math.round((i / pdf.numPages) * 100)}%`;
    setStatus(`Analyzing page ${i} of ${pdf.numPages}...`);
  }
  return chunks.join("\n").toLowerCase();
}

function checkRules(text) {
  const hits = [];
  for (const rule of RULES) {
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

function renderResult(defects) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const dateOnly = `${dd}/${mm}/${yyyy}`;
  const nowDisplay = now.toLocaleString();
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
      <div class="metric"><span class="label">Rules Checked</span><span class="value">${RULES.length}</span></div>
      <div class="metric"><span class="label">Possible Defects</span><span class="value">${defects.length}</span></div>
      <div class="metric"><span class="label">Top Risk</span><span class="value">${topRisk}%</span></div>
    </div>
    <p>Dear Sir/Madam</p>
    <p class="indent">Thank you for using e-filing.</p>
    <p class="indent">Please check defect(s) marked against</p>
    <p class="indent">Diary No:${diaryNo.value || "N/A"} in the matter</p>
    <p class="indent">${caseTitle.value || "N/A"}</p>
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
    <p><small>Rules checked: ${RULES.length} | Possible defects: ${defects.length} | Source: static_rules</small></p>
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
    const text = await extractPdfText(file);
    setStatus("Matching objections...");
    const defects = checkRules(text);
    renderResult(defects);
    setStatus("Check completed.");
  } catch (e) {
    setStatus("Unable to read this PDF in browser.", true);
  } finally {
    button.disabled = false;
    button.textContent = "Check Defects";
  }
});
