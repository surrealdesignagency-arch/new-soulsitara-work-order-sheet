// ==========================================================
// Orders Module (Work Orders + Sample Requests share logic)
// parentType: 'work_order' | 'sample_request'
// ==========================================================

const Orders = {
  items: [], // current form line items
  itemSeq: 0,
  editingId: null,
  editingType: null, // 'work_order' | 'sample_request'

  // ------------------------------------------------------
  // ITEM TABLE HELPERS
  // ------------------------------------------------------
  resetItems() {
    this.items = [];
    this.itemSeq = 0;
  },

  addItem(prefill = {}) {
    this.itemSeq += 1;
    const item = {
      uid: "item_" + this.itemSeq + "_" + Date.now(),
      serial_number: this.items.length + 1,
      item_name: prefill.item_name || "",
      pack_size: prefill.pack_size || "",
      formulation_reference: prefill.formulation_reference || "",
      packaging_container: prefill.packaging_container || "",
      label_packaging_details: prefill.label_packaging_details || "",
      quantity: prefill.quantity != null ? prefill.quantity : 0,
      rate: prefill.rate != null ? prefill.rate : 0,
      gst_percent: prefill.gst_percent != null ? prefill.gst_percent : 0,
      amount: prefill.amount != null ? prefill.amount : 0
    };
    this.items.push(item);
    return item;
  },

  removeItem(uid) {
    this.items = this.items.filter(i => i.uid !== uid);
    this.items.forEach((it, idx) => (it.serial_number = idx + 1));
  },

  updateItemField(uid, field, value) {
    const item = this.items.find(i => i.uid === uid);
    if (!item) return;

    if (["quantity", "rate", "gst_percent"].includes(field)) {
      const num = parseFloat(value);
      item[field] = isNaN(num) || num < 0 ? 0 : num;
    } else {
      item[field] = value;
    }

    // Recalculate amount = quantity * rate
    if (field === "quantity" || field === "rate") {
      item.amount = round2(item.quantity * item.rate);
    }
  },

  calcItemGST(item) {
    return round2(item.amount * (item.gst_percent / 100));
  },

  calcItemTotal(item) {
    return round2(item.amount + this.calcItemGST(item));
  },

  // ------------------------------------------------------
  // TOTALS
  // ------------------------------------------------------
  getTotals(advancePayment = 0) {
    let subtotal = 0;
    let totalGst = 0;

    this.items.forEach(item => {
      const amt = round2((item.quantity || 0) * (item.rate || 0));
      const gst = round2(amt * ((item.gst_percent || 0) / 100));
      subtotal += amt;
      totalGst += gst;
    });

    subtotal = round2(subtotal);
    totalGst = round2(totalGst);
    const grandTotal = round2(subtotal + totalGst);
    const advance = round2(parseFloat(advancePayment) || 0);
    const balance = round2(grandTotal - advance);

    return { subtotal, totalGst, grandTotal, advance, balance };
  },

  // ------------------------------------------------------
  // VALIDATION
  // ------------------------------------------------------
  validateForm(formData) {
    const errors = [];

    if (!formData.client_name || !formData.client_name.trim()) {
      errors.push("Client Name is required.");
    }
    if (!formData.due_date) {
      errors.push("Due Date is mandatory.");
    }
    if (!formData.client_manager) {
      errors.push("Client Manager is required.");
    }
    if (formData.client_manager === "Other" && !formData.other_manager_name?.trim()) {
      errors.push("Please enter the Other Manager's name.");
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.push("Please enter a valid email address.");
    }
    if (formData.due_date && formData.order_date && formData.due_date < formData.order_date) {
      errors.push("Due Date cannot be earlier than Order Date.");
    }

    if (this.items.length === 0) {
      errors.push("Please add at least one product item.");
    } else {
      this.items.forEach((item, idx) => {
        if (!item.item_name || !item.item_name.trim()) {
          errors.push(`Item #${idx + 1}: Item Name is required.`);
        }
        if (item.quantity == null || item.quantity <= 0) {
          errors.push(`Item #${idx + 1}: Quantity must be greater than 0.`);
        }
        if (item.rate == null || item.rate < 0) {
          errors.push(`Item #${idx + 1}: Rate cannot be negative.`);
        }
        if (![0, 5, 18].includes(Number(item.gst_percent))) {
          errors.push(`Item #${idx + 1}: GST must be 0%, 5%, or 18%.`);
        }
      });
    }

    return errors;
  },

  // ------------------------------------------------------
  // VALIDATION - QUOTATION (no Due Date / Status / Advance / Balance)
  // ------------------------------------------------------
  validateQuotationForm(formData) {
    const errors = [];

    if (!formData.client_name || !formData.client_name.trim()) {
      errors.push("Client Name is required.");
    }
    if (!formData.quote_validity || !formData.quote_validity.trim()) {
      errors.push("Quote Validity is required (e.g. 15 Days).");
    }
    if (!formData.client_manager) {
      errors.push("Client Manager is required.");
    }
    if (formData.client_manager === "Other" && !formData.other_manager_name?.trim()) {
      errors.push("Please enter the Other Manager's name.");
    }
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.push("Please enter a valid email address.");
    }

    if (this.items.length === 0) {
      errors.push("Please add at least one product item.");
    } else {
      this.items.forEach((item, idx) => {
        if (!item.item_name || !item.item_name.trim()) {
          errors.push(`Item #${idx + 1}: Item Name is required.`);
        }
        if (item.quantity == null || item.quantity <= 0) {
          errors.push(`Item #${idx + 1}: Quantity must be greater than 0.`);
        }
        if (item.rate == null || item.rate < 0) {
          errors.push(`Item #${idx + 1}: Rate cannot be negative.`);
        }
        if (![0, 5, 18].includes(Number(item.gst_percent))) {
          errors.push(`Item #${idx + 1}: GST must be 0%, 5%, or 18%.`);
        }
      });
    }

    return errors;
  },

  // ------------------------------------------------------
  // CRUD - WORK ORDERS
  // ------------------------------------------------------
  async saveWorkOrder(formData) {
    const totals = this.getTotals(formData.advance_payment);

    const payload = {
      order_date: formData.order_date,
      due_date: formData.due_date,
      client_name: formData.client_name.trim(),
      contact_person: formData.contact_person?.trim() || null,
      mobile_number: formData.mobile_number?.trim() || null,
      email: formData.email?.trim() || null,
      address: formData.address?.trim() || null,
      client_manager: formData.client_manager,
      other_manager_name: formData.client_manager === "Other" ? formData.other_manager_name.trim() : null,
      status: formData.status || "Pending",
      additional_comments: formData.additional_comments?.trim() || null,
      lead_source: formData.lead_source?.trim() || null,
      ad_name: formData.ad_name?.trim() || null,
      subtotal: totals.subtotal,
      total_gst: totals.totalGst,
      grand_total: totals.grandTotal,
      advance_payment: totals.advance,
      balance_amount: totals.balance
    };

    let orderId;
    let orderNumber;

    if (this.editingId && this.editingType === "work_order") {
      const { data, error } = await supabaseClient
        .from("work_orders")
        .update(payload)
        .eq("id", this.editingId)
        .select()
        .single();
      if (error) throw error;
      orderId = data.id;
      orderNumber = data.order_number;

      // Remove old items, re-insert
      const { error: delErr } = await supabaseClient
        .from("order_items")
        .delete()
        .eq("parent_type", "work_order")
        .eq("parent_id", orderId);
      if (delErr) throw delErr;
    } else {
      payload.created_by = Auth.currentUser?.id || null;
      const { data, error } = await supabaseClient
        .from("work_orders")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      orderId = data.id;
      orderNumber = data.order_number;
    }

    await this.saveItems("work_order", orderId);
    return { id: orderId, order_number: orderNumber };
  },

  // ------------------------------------------------------
  // CRUD - SAMPLE REQUESTS
  // ------------------------------------------------------
  async saveSampleRequest(formData) {
    const totals = this.getTotals(formData.advance_payment);

    const payload = {
      order_date: formData.order_date,
      due_date: formData.due_date,
      client_name: formData.client_name.trim(),
      contact_person: formData.contact_person?.trim() || null,
      mobile_number: formData.mobile_number?.trim() || null,
      email: formData.email?.trim() || null,
      address: formData.address?.trim() || null,
      client_manager: formData.client_manager,
      other_manager_name: formData.client_manager === "Other" ? formData.other_manager_name.trim() : null,
      status: formData.status || "Pending",
      additional_comments: formData.additional_comments?.trim() || null,
      lead_source: formData.lead_source?.trim() || null,
      ad_name: formData.ad_name?.trim() || null,
      subtotal: totals.subtotal,
      total_gst: totals.totalGst,
      grand_total: totals.grandTotal,
      advance_payment: totals.advance,
      balance_amount: totals.balance
    };

    let recordId;
    let sampleNumber;

    if (this.editingId && this.editingType === "sample_request") {
      const { data, error } = await supabaseClient
        .from("sample_requests")
        .update(payload)
        .eq("id", this.editingId)
        .select()
        .single();
      if (error) throw error;
      recordId = data.id;
      sampleNumber = data.sample_number;

      const { error: delErr } = await supabaseClient
        .from("order_items")
        .delete()
        .eq("parent_type", "sample_request")
        .eq("parent_id", recordId);
      if (delErr) throw delErr;
    } else {
      payload.created_by = Auth.currentUser?.id || null;
      const { data, error } = await supabaseClient
        .from("sample_requests")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      recordId = data.id;
      sampleNumber = data.sample_number;
    }

    await this.saveItems("sample_request", recordId);
    return { id: recordId, sample_number: sampleNumber };
  },

  // ------------------------------------------------------
  // CRUD - QUOTATIONS (no Due Date / Status / Advance / Balance)
  // ------------------------------------------------------
  async saveQuotation(formData) {
    const totals = this.getTotals(0); // quotations have no advance payment

    const payload = {
      quote_date: formData.quote_date,
      quote_validity: formData.quote_validity.trim(),
      client_name: formData.client_name.trim(),
      contact_person: formData.contact_person?.trim() || null,
      mobile_number: formData.mobile_number?.trim() || null,
      email: formData.email?.trim() || null,
      address: formData.address?.trim() || null,
      client_manager: formData.client_manager,
      other_manager_name: formData.client_manager === "Other" ? formData.other_manager_name.trim() : null,
      terms_and_conditions: formData.terms_and_conditions?.trim() || null,
      lead_source: formData.lead_source?.trim() || null,
      ad_name: formData.ad_name?.trim() || null,
      subtotal: totals.subtotal,
      total_gst: totals.totalGst,
      grand_total: totals.grandTotal
    };

    let recordId;
    let quotationNumberRaw;

    if (this.editingId && this.editingType === "quotation") {
      const { data, error } = await supabaseClient
        .from("quotations")
        .update(payload)
        .eq("id", this.editingId)
        .select()
        .single();
      if (error) throw error;
      recordId = data.id;
      quotationNumberRaw = data.quotation_number;

      const { error: delErr } = await supabaseClient
        .from("order_items")
        .delete()
        .eq("parent_type", "quotation")
        .eq("parent_id", recordId);
      if (delErr) throw delErr;
    } else {
      payload.created_by = Auth.currentUser?.id || null;
      const { data, error } = await supabaseClient
        .from("quotations")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      recordId = data.id;
      quotationNumberRaw = data.quotation_number;
    }

    await this.saveItems("quotation", recordId);
    return { id: recordId, quotation_number: quotationNumberRaw };
  },

  // ------------------------------------------------------
  // ITEMS PERSISTENCE
  // ------------------------------------------------------
  async saveItems(parentType, parentId) {
    if (this.items.length === 0) return;

    const rows = this.items.map((item, idx) => ({
      parent_type: parentType,
      parent_id: parentId,
      serial_number: idx + 1,
      item_name: item.item_name.trim(),
      pack_size: item.pack_size?.trim() || null,
      formulation_reference: item.formulation_reference?.trim() || null,
      packaging_container: item.packaging_container?.trim() || null,
      label_packaging_details: item.label_packaging_details?.trim() || null,
      quantity: item.quantity,
      rate: item.rate,
      gst_percent: item.gst_percent,
      amount: item.amount
    }));

    const { error } = await supabaseClient.from("order_items").insert(rows);
    if (error) throw error;
  },

  async loadItems(parentType, parentId) {
    const { data, error } = await supabaseClient
      .from("order_items")
      .select("*")
      .eq("parent_type", parentType)
      .eq("parent_id", parentId)
      .order("serial_number", { ascending: true });
    if (error) throw error;
    return data || [];
  },

  // ------------------------------------------------------
  // FETCH LISTS
  // ------------------------------------------------------
  async fetchWorkOrders(filters = {}) {
    let query = supabaseClient.from("work_orders").select("*");
    query = this.applyFilters(query, filters);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async fetchSampleRequests(filters = {}) {
    let query = supabaseClient.from("sample_requests").select("*");
    query = this.applyFilters(query, filters);
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  async fetchQuotations(filters = {}) {
    let query = supabaseClient.from("quotations").select("*");
    query = this.applyFilters(query, filters, { noStatus: true, sortFallback: "created_at" });
    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  applyFilters(query, filters, opts = {}) {
    if (filters.status && !opts.noStatus) {
      query = query.eq("status", filters.status);
    }
    if (filters.search) {
      query = query.ilike("client_name", `%${filters.search}%`);
    }
    if (filters.sortBy) {
      query = query.order(filters.sortBy, { ascending: filters.ascending !== false });
    } else {
      query = query.order(opts.sortFallback || "created_at", { ascending: false });
    }
    return query;
  },

  async fetchOne(type, id) {
    const table = this.tableForType(type);
    const { data, error } = await supabaseClient.from(table).select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  },

  tableForType(type) {
    if (type === "work_order") return "work_orders";
    if (type === "sample_request") return "sample_requests";
    if (type === "quotation") return "quotations";
    throw new Error("Unknown order type: " + type);
  },

  async updateStatus(type, id, status) {
    if (type === "quotation") {
      throw new Error("Quotations do not have a status field.");
    }
    const table = this.tableForType(type);
    const { error } = await supabaseClient.from(table).update({ status }).eq("id", id);
    if (error) throw error;
  },

  async deleteOrder(type, id) {
    if (!Auth.isAdmin()) throw new Error("Only Admin can delete orders.");
    const table = this.tableForType(type);

    const { error: itemErr } = await supabaseClient
      .from("order_items")
      .delete()
      .eq("parent_type", type)
      .eq("parent_id", id);
    if (itemErr) throw itemErr;

    const { error } = await supabaseClient.from(table).delete().eq("id", id);
    if (error) throw error;
  },

  // ------------------------------------------------------
  // DUE DATE HELPERS
  // ------------------------------------------------------
  getDueDateStatus(dueDateStr) {
    if (!dueDateStr) return { label: "—", className: "" };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);

    const diffDays = Math.round((due - today) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Overdue by ${Math.abs(diffDays)} day(s)`, className: "due-red", days: diffDays };
    } else if (diffDays === 0) {
      return { label: "Due Today", className: "due-orange", days: diffDays };
    } else if (diffDays <= 3) {
      return { label: `Due in ${diffDays} day(s)`, className: "due-orange", days: diffDays };
    } else if (diffDays <= 7) {
      return { label: `Due in ${diffDays} day(s)`, className: "due-yellow", days: diffDays };
    } else {
      return { label: `Due in ${diffDays} day(s)`, className: "due-green", days: diffDays };
    }
  }
};

// ------------------------------------------------------
// UTILS
// ------------------------------------------------------
function round2(num) {
  return Math.round((Number(num) + Number.EPSILON) * 100) / 100;
}

function formatCurrency(num) {
  const n = Number(num) || 0;
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function todayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset();
  const local = new Date(d.getTime() - offset * 60 * 1000);
  return local.toISOString().split("T")[0];
}
