const input = document.getElementById("pdfInput");
const button = document.getElementById("checkBtn");
const diaryNo = document.getElementById("diaryNo");
const caseTitle = document.getElementById("caseTitle");
const progressWrap = document.getElementById("progressWrap");
const progressBar = document.getElementById("progressBar");
const status = document.getElementById("status");
const result = document.getElementById("result");
const exportCard = document.getElementById("exportCard");
const pdfExportBtn = document.getElementById("pdfExportBtn");
const docxExportBtn = document.getElementById("docxExportBtn");
let latestReport = null;

function setStatus(text, isError = false) {
  status.textContent = text;
  status.style.color = isError ? "#dc2626" : "#111827";
}

function renderTable(data) {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const dateOnly = `${dd}/${mm}/${yyyy}`;
  const timeOnly = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const ampm = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true }).split(" ").pop();
  const nowDisplay = `${dateOnly} ${timeOnly} ${ampm}`;

  const maxMain = 3;
  const main = data.defects.slice(0, maxMain);
  const other = data.defects.slice(maxMain);

  const mainRows =
    main
      .map(
        (d, i) => `
      <tr>
        <td class="c-sl">${i + 1}</td>
        <td class="c-defect">(${d.code}) - ${d.title}</td>
        <td class="c-date">${dateOnly}</td>
        <td class="c-date"></td>
      </tr>
    `
      )
      .join("") ||
    `<tr><td colspan="4" class="empty">No defects detected.</td></tr>`;

  const otherRows = other
    .map(
      (d, i) => `
      <tr>
        <td class="c-sl">${maxMain + i + 1}</td>
        <td class="c-defect" colspan="2">Description of any other Defects: (${d.code}) - ${d.title}</td>
        <td class="c-date">${dateOnly}</td>
      </tr>
    `
    )
    .join("");

  result.innerHTML = `
    <div class="email">
      <div class="email-body">
        <p>Dear Sir/Madam</p>
        <p class="indent">Thank you for using e-filing.</p>
        <p class="indent">Please check defect(s) marked against</p>
        <p class="indent">Diary No:${diaryNo.value || "N/A"} in the matter</p>
        <p class="indent">${caseTitle.value || "N/A"}</p>

        <div class="table-wrap">
          <table class="grid">
            <thead>
              <tr>
                <th class="c-sl">SlNo.</th>
                <th class="c-defect">Defects marked during Scrutiny</th>
                <th class="c-date">Date of Defects Marked</th>
                <th class="c-date">Date of Defect Removed</th>
              </tr>
            </thead>
            <tbody>
              ${mainRows}
              ${
                otherRows
                  ? `
                <tr class="subhead">
                  <th colspan="3" class="any-other">Any Other Defects</th>
                  <th class="marked-on">Marked On</th>
                </tr>
                ${otherRows}
              `
                  : ""
              }
            </tbody>
          </table>
        </div>

        <p class="footer">Date :${nowDisplay}</p>
        <p class="indent">Please check your Dashboard regularly for new updates.</p>
        <p class="meta">Rules checked: ${data.total_rules_checked} | Possible defects: ${data.possible_defects_found} | Source: ${data.rules_source}</p>
      </div>
    </div>
  `;
  result.classList.remove("hidden");
  exportCard.classList.remove("hidden");
}

button.addEventListener("click", () => {
  const file = input.files?.[0];
  if (!file) {
    setStatus("Please select a PDF file first.", true);
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/check");

  progressWrap.classList.remove("hidden");
  progressBar.style.width = "0%";
  setStatus("Uploading and checking...");
  result.classList.add("hidden");

  xhr.upload.onprogress = (event) => {
    if (event.lengthComputable) {
      const percent = Math.round((event.loaded / event.total) * 100);
      progressBar.style.width = `${percent}%`;
    }
  };

  xhr.onload = () => {
    if (xhr.status >= 200 && xhr.status < 300) {
      const data = JSON.parse(xhr.responseText);
      progressBar.style.width = "100%";
      setStatus("Check completed.");
      renderTable(data);
      latestReport = {
        diary_no: diaryNo.value || "N/A",
        case_title: caseTitle.value || "N/A",
        generated_on: dateOnly,
        now_display: nowDisplay,
        file_name: data.file_name,
        defects: data.defects.map((d) => ({
          code: d.code,
          title: d.title,
          confidence: d.confidence,
          guidance: d.guidance,
          date_marked: dateOnly,
          date_removed: "",
          marked_on: dateOnly,
        })),
        max_main_rows: 3,
      };
      return;
    }

    try {
      const err = JSON.parse(xhr.responseText);
      setStatus(err.detail || "Failed to process the file.", true);
    } catch {
      setStatus("Failed to process the file.", true);
    }
  };

  xhr.onerror = () => {
    setStatus("Network or server error.", true);
  };

  xhr.send(formData);
});

async function exportReport(kind) {
  if (!latestReport) {
    setStatus("Please run a defect check first.", true);
    return;
  }
  const endpoint = kind === "pdf" ? "/api/export/pdf" : "/api/export/docx";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(latestReport),
  });
  if (!res.ok) {
    setStatus("Export failed.", true);
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = kind === "pdf" ? "defect_report.pdf" : "defect_report.docx";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

pdfExportBtn.addEventListener("click", () => exportReport("pdf"));
docxExportBtn.addEventListener("click", () => exportReport("docx"));
