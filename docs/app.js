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
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const status = document.getElementById("status");
const result = document.getElementById("result");
const pdfActions = document.getElementById("pdfActions");
const downloadPdfBtn = document.getElementById("downloadPdfBtn");
const PDFJS_VERSION = "4.4.168";

/** @type {{ defects: Array<{code:number,title:string,confidence:number}>, dateOnly: string, nowDisplay: string, topRisk: number } | null} */
let lastReport = null;

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
  const pdfjsLib = await import(`https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.min.mjs`);
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

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

function downloadPdfReport() {
  if (!lastReport || !window.jspdf) {
    setStatus("PDF library not ready. Refresh the page and try again.", true);
    return;
  }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const margin = 14;
  let y = 16;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("Defect screening report", margin, y);
  y += 9;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Rules checked: ${RULES.length}  |  Possible defects: ${lastReport.defects.length}  |  Top risk: ${lastReport.topRisk}%`, margin, y);
  y += 8;

  doc.text("Dear Sir/Madam", margin, y);
  y += 6;
  doc.text("Please find below the defect screening summary for your filing.", margin + 2, y);
  y += 10;

  const main = lastReport.defects.slice(0, 3);
  const other = lastReport.defects.slice(3);
  const bodyMain =
    main.length > 0
      ? main.map((d, i) => [
          String(i + 1),
          `(${d.code}) - ${d.title} (${d.confidence}%)`,
          lastReport.dateOnly,
          ""
        ])
      : [["-", "No defects detected.", "", ""]];

  doc.autoTable({
    startY: y,
    head: [["SlNo.", "Defects marked during Scrutiny", "Date of Defects Marked", "Date of Defect Removed"]],
    body: bodyMain,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39] },
    margin: { left: margin, right: margin },
    columnStyles: {
      0: { cellWidth: 14 },
      1: { cellWidth: 110 },
      2: { cellWidth: 28 },
      3: { cellWidth: 28 }
    }
  });

  let cursorY = doc.lastAutoTable.finalY + 8;

  if (other.length > 0) {
    doc.setFontSize(10);
    doc.text("Any Other Defects", margin, cursorY);
    cursorY += 6;
    const bodyOther = other.map((d, idx) => [
      String(main.length + idx + 1),
      `(${d.code}) - ${d.title} (${d.confidence}%)`,
      lastReport.dateOnly
    ]);
    doc.autoTable({
      startY: cursorY,
      head: [["SlNo.", "Description of any other Defects", "Marked On"]],
      body: bodyOther,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [243, 244, 246], textColor: [17, 24, 39] },
      margin: { left: margin, right: margin },
      columnStyles: {
        0: { cellWidth: 14 },
        1: { cellWidth: 138 },
        2: { cellWidth: 28 }
      }
    });
    cursorY = doc.lastAutoTable.finalY + 8;
  }

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Date : ${lastReport.nowDisplay}`, margin, cursorY);

  doc.save("defect-screening-report.pdf");
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

  lastReport = { defects, dateOnly, nowDisplay, topRisk };
  if (pdfActions) pdfActions.classList.remove("hidden");

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
    <p class="indent">Please find below the defect screening summary for your filing.</p>
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
    <p><small>Rules checked: ${RULES.length} | Possible defects: ${defects.length} | Source: static_rules</small></p>
  `;
  result.classList.remove("hidden");
}

if (downloadPdfBtn) {
  downloadPdfBtn.addEventListener("click", () => {
    try {
      downloadPdfReport();
      setStatus("PDF downloaded.");
    } catch (err) {
      setStatus(err?.message ? `PDF export failed: ${err.message}` : "PDF export failed.", true);
    }
  });
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
  if (pdfActions) pdfActions.classList.add("hidden");
  lastReport = null;
  button.disabled = true;
  button.textContent = "Checking...";
  setStatus("Preparing analysis...");

  try {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("Please upload a .pdf file.");
    }
    const text = await extractPdfText(file);
    if (!text || text.trim().length < 30) {
      setStatus(
        "This PDF has little/no extractable text (often scanned/image-only). Convert it to a text-based PDF (OCR) and try again.",
        true
      );
      return;
    }
    setStatus("Matching objections...");
    const defects = checkRules(text);
    renderResult(defects);
    setStatus("Check completed.");
  } catch (e) {
    if (pdfActions) pdfActions.classList.add("hidden");
    lastReport = null;
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
