// ==========================================================
// PDF Generation Module (jsPDF + autoTable)
// ==========================================================

const PDFGen = {
  async generate(type, order, items) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: "mm", format: "a4" });

    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 12;
    let y = 15;

    const brand = [154, 125, 95]; // #9a7d5f

    // ---------------- HEADER ----------------
    try {
      const logoData = await this.loadImageAsDataURL(COMPANY_INFO.logo);
      if (logoData) {
        doc.addImage(logoData, "PNG", margin, y, 18, 18);
      }
    } catch (e) {
      console.warn("Logo not loaded for PDF:", e);
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(...brand);
    doc.text(COMPANY_INFO.name, margin + 22, y + 5);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    const addrLines = doc.splitTextToSize(COMPANY_INFO.address, pageWidth - margin * 2 - 22);
    doc.text(addrLines, margin + 22, y + 10);

    doc.text(`GSTIN: ${COMPANY_INFO.gstin}`, margin + 22, y + 10 + addrLines.length * 3.6 + 2);
    doc.text(`Mobile: ${COMPANY_INFO.mobile}`, margin + 22, y + 10 + addrLines.length * 3.6 + 6);

    y += 28;
    doc.setDrawColor(...brand);
    doc.setLineWidth(0.6);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // ---------------- TITLE ----------------
    const title = type === "work_order" ? "WORK ORDER" : "SAMPLE REQUEST";
    const number = type === "work_order" ? order.order_number : order.sample_number;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0, 0, 0);
    doc.text(title, margin, y);

    doc.setFontSize(11);
    doc.text(`No: ${number}`, pageWidth - margin, y, { align: "right" });
    y += 8;

    // ---------------- ORDER & DUE DATE (PROMINENT) ----------------
    doc.setFillColor(245, 240, 233);
    doc.rect(margin, y - 4, pageWidth - margin * 2, 10, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(40, 40, 40);
    doc.text(`Order Date: ${formatDate(order.order_date)}`, margin + 2, y + 2);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(...brand);
    doc.text(`DUE DATE: ${formatDate(order.due_date)}`, pageWidth - margin - 2, y + 2, { align: "right" });
    doc.setTextColor(0, 0, 0);
    y += 12;

    // ---------------- CLIENT INFO ----------------
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Client Information", margin, y);
    y += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    const clientManagerDisplay =
      order.client_manager === "Other" && order.other_manager_name
        ? order.other_manager_name
        : order.client_manager;

    const leftCol = [
      `Client Name: ${order.client_name || "—"}`,
      `Contact Person: ${order.contact_person || "—"}`,
      `Mobile: ${order.mobile_number || "—"}`
    ];
    const rightCol = [
      `Email: ${order.email || "—"}`,
      `Client Manager: ${clientManagerDisplay || "—"}`,
      `Status: ${order.status || "—"}`
    ];

    leftCol.forEach((line, i) => doc.text(line, margin, y + i * 5));
    rightCol.forEach((line, i) => doc.text(line, pageWidth / 2 + 5, y + i * 5));
    y += leftCol.length * 5 + 2;

    if (order.address) {
      const addrText = doc.splitTextToSize(`Address: ${order.address}`, pageWidth - margin * 2);
      doc.text(addrText, margin, y);
      y += addrText.length * 5 + 2;
    }

    y += 3;

    // ---------------- PRODUCT TABLE ----------------
    const tableBody = (items || []).map(item => {
      const amount = round2(item.quantity * item.rate);
      const gstAmt = round2(amount * (item.gst_percent / 100));
      const total = round2(amount + gstAmt);
      return [
        item.serial_number,
        item.item_name || "",
        item.pack_size || "-",
        item.formulation_reference || "-",
        item.packaging_container || "-",
        item.label_packaging_details || "-",
        item.quantity,
        formatCurrency(item.rate),
        `${item.gst_percent}%`,
        formatCurrency(total)
      ];
    });

    doc.autoTable({
      startY: y,
      margin: { left: margin, right: margin },
      head: [["#", "Item Name", "Pack Size", "Formulation Ref.", "Packaging", "Label/Pkg Details", "Qty", "Rate", "GST", "Amount"]],
      body: tableBody,
      styles: { fontSize: 7.5, cellPadding: 1.8, valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: brand, textColor: 255, fontStyle: "bold" },
      columnStyles: {
        0: { cellWidth: 7, halign: "center" },
        1: { cellWidth: 28 },
        2: { cellWidth: 16 },
        3: { cellWidth: 24 },
        4: { cellWidth: 20 },
        5: { cellWidth: 24 },
        6: { cellWidth: 12, halign: "right" },
        7: { cellWidth: 18, halign: "right" },
        8: { cellWidth: 12, halign: "center" },
        9: { cellWidth: 20, halign: "right" }
      },
      theme: "grid"
    });

    y = doc.lastAutoTable.finalY + 6;

    // ---------------- GST SUMMARY / PAYMENT ----------------
    if (y > 250) {
      doc.addPage();
      y = 15;
    }

    const summaryX = pageWidth - margin - 70;
    const summaryWidth = 70;

    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(250, 248, 246);
    const summaryRows = [
      ["Subtotal", formatCurrency(order.subtotal)],
      ["Total GST", formatCurrency(order.total_gst)],
      ["Grand Total", formatCurrency(order.grand_total)],
      ["Advance Payment", formatCurrency(order.advance_payment)],
      ["Balance Amount", formatCurrency(order.balance_amount)]
    ];

    let sy = y;
    const rowHeight = 6.5;
    doc.rect(summaryX, sy, summaryWidth, rowHeight * summaryRows.length, "FD");

    summaryRows.forEach((row, i) => {
      const rowY = sy + i * rowHeight;
      if (row[0] === "Grand Total" || row[0] === "Balance Amount") {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...brand);
      } else {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(40, 40, 40);
      }
      doc.setFontSize(9);
      doc.text(row[0], summaryX + 2, rowY + 4.5);
      doc.text(row[1], summaryX + summaryWidth - 2, rowY + 4.5, { align: "right" });
      if (i < summaryRows.length - 1) {
        doc.setDrawColor(230, 230, 230);
        doc.line(summaryX, rowY + rowHeight, summaryX + summaryWidth, rowY + rowHeight);
      }
    });

    doc.setTextColor(0, 0, 0);

    // ---------------- STATUS & FOOTER ----------------
    const footerY = sy + rowHeight * summaryRows.length + 12;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`Production Status: ${order.status}`, margin, footerY);

    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text("This is a computer-generated document and does not require a signature.", margin, footerY + 8);

    // ---------------- PAGE NUMBERS ----------------
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 8, { align: "right" });
    }

    const filenamePrefix = type === "work_order" ? "WorkOrder" : "SampleRequest";
    doc.save(`${filenamePrefix}_${number}.pdf`);
  },

  async loadImageAsDataURL(path) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        try {
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = reject;
      img.src = path;
    });
  }
};
