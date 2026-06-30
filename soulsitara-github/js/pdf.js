// ==========================================================
// PDF Generation — Professional A4 Invoice Layout
// Color system:
//   Work Order    → Brown  #9a7d5f
//   Sample Request → Blue  #1565c0
//   Quotation      → Green #2e7d32
//
// GST spec:
//   Amount = Qty × Rate  (no GST in Amount column)
//   GST% shown as own column in product table
//   GST total shown in summary: "GST (5%)" / "GST (Mixed Tax Rate)"
//
// Internal fields NOT shown in PDF:
//   Lead Source / Ad Name (analytics only)
// Client Manager IS shown in PDF (per latest requirement)
// ==========================================================

const PDFGen = {

  // Rupee formatting using "Rs." (jsPDF built-in fonts can't render ₹)
  Rs(num) {
    const n = Number(num) || 0;
    return "Rs. " + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  // Auto-detect GST label from items list
  gstLabel(items) {
    if (!items || !items.length) return "GST (0%)";
    const rates = [...new Set(items.map(it => Number(it.gst_percent) || 0).filter(r => r > 0))];
    if (!rates.length) return "GST (0%)";
    if (rates.length === 1) return "GST (" + rates[0] + "%)";
    return "GST (Mixed Tax Rate)";
  },

  // Color palette per document type
  pal(docType) {
    const p = {
      sample_request: { P: [21,101,192], D: [13,71,161],  L: [227,242,253], B: [144,202,249] },
      quotation:      { P: [46,125, 50], D: [27,94, 32],  L: [232,245,233], B: [165,214,167] },
    };
    return p[docType] || { P: [154,125,95], D: [100,74,46], L: [245,240,233], B: [201,173,140] };
  },

  // ── PUBLIC API ────────────────────────────────────────────
  async generate(type, order, items) {
    return this._build({
      docType: type, order, items,
      title:      type === "work_order" ? "PRODUCTION WORK ORDER" : "SAMPLE REQUEST",
      docNum:     type === "work_order" ? String(order.order_number) : String(order.sample_number),
      fname:      type === "work_order" ? "WorkOrder" : "SampleRequest",
      hasDueDate: true, hasPayment: true, hasTerms: false
    });
  },

  async generateQuotation(q, items) {
    return this._build({
      docType: "quotation", order: q, items,
      title: "QUOTATION",
      docNum: "Q-" + String(q.quotation_number).padStart(4,"0"),
      fname: "Quotation",
      hasDueDate: false, hasPayment: false, hasTerms: true
    });
  },

  // ── CORE BUILDER ─────────────────────────────────────────
  async _build({ docType, order, items, title, docNum, fname, hasDueDate, hasPayment, hasTerms }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const PW = 210, PH = 297;
    const ML = 14, MR = 14;           // left / right margins
    const UW = PW - ML - MR;          // 182mm usable

    const C = this.pal(docType);
    const BLACK   = [20,  20,  20];
    const GREY    = [90,  90,  90];
    const LGREY   = [200, 200, 200];
    const WHITE   = [255, 255, 255];
    const ROWALT  = [252, 249, 247];

    let y = 0;

    // ─────────────────────────────────────────────────────
    // 1. FULL-WIDTH COLOUR HEADER BAND
    // ─────────────────────────────────────────────────────
    const BAND_H = 36;
    doc.setFillColor(...C.P);
    doc.rect(0, 0, PW, BAND_H, "F");

    // Logo — top-left inside band, preserved aspect ratio
    const LOGO_H = 26;
    let logoW = 0;
    try {
      const logoData = await this.loadLogo(COMPANY_INFO.logo);
      const dims     = await this.logoSize(COMPANY_INFO.logo);
      if (logoData && dims.height > 0) {
        logoW = round2(LOGO_H * (dims.width / dims.height));
        doc.addImage(logoData, "PNG", ML, (BAND_H - LOGO_H) / 2, logoW, LOGO_H);
      }
    } catch (_) { /* no logo — continue */ }

    // Company name right-side of band
    const compX = ML + (logoW > 0 ? logoW + 5 : 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(...WHITE);
    doc.text(COMPANY_INFO.name, compX, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    const addrLines = doc.splitTextToSize(COMPANY_INFO.address, UW - (logoW > 0 ? logoW + 8 : 0));
    doc.text(addrLines, compX, 19);
    const aH = addrLines.length * 3.2;
    doc.text("GSTIN: " + COMPANY_INFO.gstin + "   |   Ph: " + COMPANY_INFO.mobile,
             compX, 19 + aH + 1.5);

    y = BAND_H + 6;

    // ─────────────────────────────────────────────────────
    // 2. DOCUMENT TITLE ROW
    // ─────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(...C.D);
    doc.text(title, ML, y + 6);

    doc.setFontSize(10);
    doc.setTextColor(...GREY);
    doc.text("No: " + docNum, PW - MR, y + 6, { align: "right" });

    y += 12;

    // Thin separator
    doc.setDrawColor(...C.B);
    doc.setLineWidth(0.6);
    doc.line(ML, y, PW - MR, y);
    y += 5;

    // ─────────────────────────────────────────────────────
    // 3. DATE / VALIDITY PILL
    // ─────────────────────────────────────────────────────
    doc.setFillColor(...C.L);
    doc.setDrawColor(...C.B);
    doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, UW, 9, 2, 2, "FD");

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...BLACK);

    if (docType === "quotation") {
      doc.text("Quote Date: " + formatDate(order.quote_date), ML + 4, y + 6);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...C.D);
      doc.text("VALIDITY: " + (order.quote_validity || "—"), PW - MR - 4, y + 6, { align: "right" });
    } else {
      doc.text("Order Date: " + formatDate(order.order_date), ML + 4, y + 6);
      if (hasDueDate && order.due_date) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...C.D);
        doc.text("DUE DATE: " + formatDate(order.due_date), PW - MR - 4, y + 6, { align: "right" });
      }
    }
    y += 15;

    // ─────────────────────────────────────────────────────
    // 4. CLIENT / COMPANY DETAILS — TWO-COLUMN GRID
    // ─────────────────────────────────────────────────────
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...C.D);
    doc.text("COMPANY / CLIENT DETAILS", ML, y);
    y += 3;
    doc.setDrawColor(...C.P);
    doc.setLineWidth(0.4);
    doc.line(ML, y, PW - MR, y);
    y += 5;

    const C1 = ML, C2 = ML + UW / 2 + 3;
    const LW = 32;   // label width
    const RG = 5.8;  // row gap

    // Resolve manager display name
    const managerDisplay = order.client_manager === "Other" && order.other_manager_name
      ? order.other_manager_name
      : (order.client_manager || "—");

    // 2 columns × 3 rows = 6 fields side by side horizontally
    const LEFT = [
      ["Company / Brand", order.client_name    || "—"],
      ["Contact Person",  order.contact_person || "—"],
      ["Client Manager",  managerDisplay],
    ];
    const RIGHT = [
      ["Email",   order.email          || "—"],
      ["Mobile",  order.mobile_number  || "—"],
      ["Address", order.address        || "—"],
    ];

    doc.setFontSize(8);
    LEFT.forEach((r, i) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREY);
      doc.text(r[0] + ":", C1, y + i * RG);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BLACK);
      const wrapped = doc.splitTextToSize(String(r[1]), UW / 2 - LW - 6);
      doc.text(wrapped, C1 + LW, y + i * RG);
    });
    RIGHT.forEach((r, i) => {
      doc.setFont("helvetica", "bold");
      doc.setTextColor(...GREY);
      doc.text(r[0] + ":", C2, y + i * RG);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(...BLACK);
      const wrapped = doc.splitTextToSize(String(r[1]), UW / 2 - LW - 6);
      doc.text(wrapped, C2 + LW, y + i * RG);
    });

    y += 3 * RG + 8;

    // ─────────────────────────────────────────────────────
    // 5. PRODUCT TABLE
    // ─────────────────────────────────────────────────────
    // 10 columns; Amount = Qty × Rate (GST NOT added into Amount)
    // Column widths must sum to UW = 182mm
    //   # | Item | Pack | FormRef | Pkg | Label | Qty | Rate | GST% | Amt
    //   6 +  28  +  12  +   18   +  16 +  18  +  10 +  18  +  10  + 46 = 182 ✓
    const CW = [6, 28, 12, 18, 16, 18, 10, 18, 10, 46];

    const colSt = {};
    CW.forEach((w, i) => {
      colSt[i] = {
        cellWidth: w,
        halign: (i === 0 || i === 6 || i === 8) ? "center"
               : (i === 7 || i === 9)            ? "right"
               : "left"
      };
    });

    if (y > PH - 90) { doc.addPage(); y = 14; }

    const LNW = 0.22;
    const CP  = { top: 2.8, right: 1.8, bottom: 2.8, left: 1.8 };

    doc.autoTable({
      startY: y,
      tableWidth: "wrap",
      margin: { left: ML },
      head: [["#", "Item Name", "Pack", "Formulation Ref.", "Packaging", "Label/Pkg Details", "Qty", "Rate", "GST%", "Amount"]],
      body: (items || []).map(it => {
        const amt = round2((it.quantity || 0) * (it.rate || 0));  // Amount = Qty × Rate ONLY
        return [
          String(it.serial_number),
          it.item_name               || "",
          it.pack_size               || "—",
          it.formulation_reference   || "—",
          it.packaging_container     || "—",
          it.label_packaging_details || "—",
          String(it.quantity || 0),
          this.Rs(it.rate),
          (it.gst_percent || 0) + "%",
          this.Rs(amt)              // ← base amount, no GST
        ];
      }),
      columnStyles: colSt,
      styles: {
        fontSize: 7.5, cellPadding: CP, valign: "middle",
        overflow: "linebreak", lineColor: LGREY, lineWidth: LNW,
        textColor: BLACK, font: "helvetica",
      },
      headStyles: {
        fillColor: C.P, textColor: WHITE, fontStyle: "bold",
        fontSize: 7.5, cellPadding: { top: 3, right: 1.8, bottom: 3, left: 1.8 },
        halign: "center", valign: "middle", lineColor: C.D, lineWidth: LNW,
      },
      tableLineColor: LGREY,
      tableLineWidth: LNW,
      alternateRowStyles: { fillColor: ROWALT },
      theme: "grid",
    });

    y = doc.lastAutoTable.finalY + 8;
    if (y > PH - 80) { doc.addPage(); y = 14; }

    // ─────────────────────────────────────────────────────
    // 6. SUMMARY TABLE (professional invoice style)
    // ─────────────────────────────────────────────────────
    const GL  = this.gstLabel(items);
    const SRS = hasPayment ? [
      { lbl: "Subtotal",        val: this.Rs(order.subtotal),       hl: false, sep: false },
      { lbl: GL,                val: this.Rs(order.total_gst),       hl: false, sep: false },
      { lbl: "Grand Total",     val: this.Rs(order.grand_total),     hl: true,  sep: true  },
      { lbl: "Advance Payment", val: this.Rs(order.advance_payment), hl: false, sep: false },
      { lbl: "Balance Amount",  val: this.Rs(order.balance_amount),  hl: true,  sep: true  },
    ] : [
      { lbl: "Subtotal",    val: this.Rs(order.subtotal),   hl: false, sep: false },
      { lbl: GL,            val: this.Rs(order.total_gst),  hl: false, sep: false },
      { lbl: "Grand Total", val: this.Rs(order.grand_total), hl: true,  sep: true  },
    ];

    const SW = 88;              // summary width
    const SX = PW - MR - SW;   // start x
    const LW2 = 52;             // label column
    const VW  = SW - LW2;      // value column
    const RH  = 7.8;            // row height
    const TH  = SRS.length * RH;

    SRS.forEach((r, i) => {
      const ry = y + i * RH;

      // Background
      doc.setFillColor(...(r.hl ? C.L : [250, 248, 246]));
      doc.rect(SX, ry, SW, RH, "F");

      // Top separator (thick for highlighted rows)
      if (r.sep) {
        doc.setDrawColor(...C.P);
        doc.setLineWidth(0.55);
      } else if (i > 0) {
        doc.setDrawColor(...LGREY);
        doc.setLineWidth(0.2);
      }
      if (i > 0) doc.line(SX, ry, SX + SW, ry);

      // Vertical divider
      doc.setDrawColor(...LGREY);
      doc.setLineWidth(0.2);
      doc.line(SX + LW2, ry, SX + LW2, ry + RH);

      // Text — vertically centred
      const ty = ry + RH * 0.66;
      doc.setFontSize(r.hl ? 9 : 8.5);
      doc.setFont("helvetica", r.hl ? "bold" : "normal");
      doc.setTextColor(...(r.hl ? C.D : BLACK));
      doc.text(r.lbl, SX + 3.5, ty);
      doc.text(r.val, SX + SW - 3.5, ty, { align: "right" });
    });

    // Outer border — branded colour
    doc.setDrawColor(...C.P);
    doc.setLineWidth(0.55);
    doc.rect(SX, y, SW, TH, "S");

    // ─────────────────────────────────────────────────────
    // 7. ADDITIONAL COMMENTS (left of summary)
    // ─────────────────────────────────────────────────────
    if (!hasTerms && order.additional_comments && order.additional_comments.trim()) {
      const CMW = UW - SW - 8;
      let cy = y + 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8.5);
      doc.setTextColor(...C.D);
      doc.text("Additional Notes:", ML, cy);
      cy += 4.5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...BLACK);
      doc.text(doc.splitTextToSize(order.additional_comments.trim(), Math.max(CMW, 55)), ML, cy);
    }

    // ─────────────────────────────────────────────────────
    // 8. TERMS & CONDITIONS (Quotation only)
    // ─────────────────────────────────────────────────────
    if (hasTerms) {
      let ty = y + TH + 12;
      if (ty > PH - 42) { doc.addPage(); ty = 14; }

      // T&C header band
      doc.setFillColor(...C.L);
      doc.rect(ML, ty - 1, UW, 9, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...C.D);
      doc.text("TERMS & CONDITIONS", ML + 3, ty + 5.5);
      ty += 13;

      doc.setDrawColor(...C.P);
      doc.setLineWidth(0.25);
      doc.line(ML, ty - 3, PW - MR, ty - 3);

      const t = (order.terms_and_conditions || "").trim();
      if (t) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8.2);
        doc.setTextColor(...BLACK);
        doc.text(doc.splitTextToSize(t, UW), ML, ty);
      } else {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(...GREY);
        doc.text("No specific terms provided.", ML, ty);
      }
    }

    // ─────────────────────────────────────────────────────
    // 9. FOOTER — branded bar every page
    // ─────────────────────────────────────────────────────
    const pageCount = doc.internal.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);

      const FY = PH - 11;
      doc.setFillColor(...C.L);
      doc.rect(0, FY, PW, 11, "F");
      doc.setDrawColor(...C.P);
      doc.setLineWidth(0.35);
      doc.line(0, FY, PW, FY);

      doc.setFont("helvetica", "italic");
      doc.setFontSize(6.8);
      doc.setTextColor(...GREY);
      doc.text(
        "This is a computer-generated document  |  " + COMPANY_INFO.name + "  |  GSTIN: " + COMPANY_INFO.gstin,
        PW / 2, FY + 6.5, { align: "center" }
      );
      doc.setFont("helvetica", "normal");
      doc.setFontSize(6.8);
      doc.text("Page " + p + " / " + pageCount, PW - MR, FY + 6.5, { align: "right" });
    }

    doc.save(fname + "_" + docNum + ".pdf");
  },

  // ── LOGO HELPERS — PNG only, no SVG fallback ─────────────
  async loadLogo(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        try { resolve(c.toDataURL("image/png")); } catch (e) { reject(e); }
      };
      img.onerror = reject;
      img.src = path;
    });
  },

  async logoSize(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload  = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = reject;
      img.src = path;
    });
  }
};
