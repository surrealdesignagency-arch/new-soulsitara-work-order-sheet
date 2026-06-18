// ==========================================================
// App Controller - Routing, Rendering, Events
// ==========================================================

const App = {
  currentView: "login",
  filters: {
    status: "",
    search: "",
    sortBy: "due_date",
    ascending: true
  },
  realtimeChannel: null,

  async init() {
    this.bindStaticEvents();

    const session = await Auth.init();
    if (session) {
      await this.showApp();
    } else {
      this.showLogin();
    }

    Auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_OUT") {
        this.showLogin();
      }
    });
  },

  // ------------------------------------------------------
  // STATIC EVENT BINDINGS
  // ------------------------------------------------------
  bindStaticEvents() {
    // Login form
    const loginForm = document.getElementById("login-form");
    loginForm.addEventListener("submit", async e => {
      e.preventDefault();
      await this.handleLogin();
    });

    // Remembered email
    const rememberedEmail = Auth.getRememberedEmail();
    if (rememberedEmail) {
      document.getElementById("login-email").value = rememberedEmail;
      document.getElementById("login-remember").checked = true;
    }

    // Logout
    document.getElementById("logout-btn").addEventListener("click", async () => {
      await Auth.logout();
      this.teardownRealtime();
      this.showLogin();
    });

    // Navigation
    document.querySelectorAll(".nav-link").forEach(link => {
      link.addEventListener("click", e => {
        e.preventDefault();
        const view = link.dataset.view;
        this.navigateTo(view);
      });
    });

    // Mobile menu toggle
    const menuToggle = document.getElementById("menu-toggle");
    if (menuToggle) {
      menuToggle.addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("open");
      });
    }

    // New Work Order / Sample Request buttons
    document.getElementById("new-work-order-btn").addEventListener("click", () => {
      this.openOrderForm("work_order");
    });
    document.getElementById("new-sample-request-btn").addEventListener("click", () => {
      this.openOrderForm("sample_request");
    });

    // Order form events
    document.getElementById("order-form").addEventListener("submit", async e => {
      e.preventDefault();
      await this.handleOrderSubmit();
    });
    document.getElementById("add-item-btn").addEventListener("click", () => {
      Orders.addItem();
      this.renderItemsTable();
    });
    document.getElementById("cancel-form-btn").addEventListener("click", () => {
      this.navigateTo(this.lastListView || "work-orders");
    });
    document.getElementById("client-manager-select").addEventListener("change", e => {
      const otherWrap = document.getElementById("other-manager-wrap");
      otherWrap.style.display = e.target.value === "Other" ? "block" : "none";
    });
    document.getElementById("advance-payment-input").addEventListener("input", () => {
      this.renderTotals();
    });

    // Order detail modal close
    document.getElementById("close-detail-modal").addEventListener("click", () => {
      document.getElementById("order-detail-modal").classList.remove("active");
    });

    // Filters
    document.getElementById("search-input").addEventListener("input", e => {
      this.filters.search = e.target.value;
      this.debounceRefreshList();
    });
    document.getElementById("status-filter").addEventListener("change", e => {
      this.filters.status = e.target.value;
      this.refreshCurrentList();
    });
    document.getElementById("sort-select").addEventListener("change", e => {
      const [field, dir] = e.target.value.split(":");
      this.filters.sortBy = field;
      this.filters.ascending = dir === "asc";
      this.refreshCurrentList();
    });
  },

  debounceRefreshList() {
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => this.refreshCurrentList(), 300);
  },

  // ------------------------------------------------------
  // LOGIN / APP SWITCH
  // ------------------------------------------------------
  showLogin() {
    document.getElementById("login-screen").classList.remove("hidden");
    document.getElementById("app-screen").classList.add("hidden");
    document.getElementById("login-error").textContent = "";
  },

  async showApp() {
    document.getElementById("login-screen").classList.add("hidden");
    document.getElementById("app-screen").classList.remove("hidden");

    document.getElementById("user-name-display").textContent =
      Auth.currentProfile?.full_name || Auth.currentProfile?.email || "User";
    document.getElementById("user-role-display").textContent =
      Auth.isAdmin() ? "Admin" : "Employee";

    this.setupRealtime();
    await this.navigateTo("dashboard");
  },

  async handleLogin() {
    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;
    const remember = document.getElementById("login-remember").checked;
    const errorEl = document.getElementById("login-error");
    const submitBtn = document.getElementById("login-submit-btn");

    errorEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in...";

    try {
      const result = await Auth.login(email, password, remember);
      if (result.success) {
        await this.showApp();
      } else {
        // Replace newlines with <br> for multi-line error messages
        errorEl.innerHTML = result.message
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/\n/g, "<br>");
      }
    } catch (err) {
      console.error(err);
      const msg = (err?.message || "").toLowerCase();
      if (msg.includes("failed to fetch") || msg.includes("fetch")) {
        errorEl.innerHTML = "❌ Cannot connect to Supabase.<br><br>Please check:<br>• Your internet connection<br>• The URL and Anon Key in <code>js/config.js</code><br>• That your Supabase project is active";
      } else {
        errorEl.textContent = "Something went wrong. Please try again.";
      }
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In";
    }
  },

  // ------------------------------------------------------
  // REALTIME
  // ------------------------------------------------------
  setupRealtime() {
    if (this.realtimeChannel) return;

    this.realtimeChannel = supabaseClient
      .channel("public:orders")
      .on("postgres_changes", { event: "*", schema: "public", table: "work_orders" }, () => {
        this.handleRealtimeUpdate();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sample_requests" }, () => {
        this.handleRealtimeUpdate();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => {
        this.handleRealtimeUpdate();
      })
      .subscribe();
  },

  teardownRealtime() {
    if (this.realtimeChannel) {
      supabaseClient.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  },

  handleRealtimeUpdate() {
    // Refresh whatever view is active
    if (this.currentView === "dashboard") {
      this.renderDashboard();
    } else if (this.currentView === "work-orders" || this.currentView === "sample-requests") {
      this.refreshCurrentList();
    }
  },

  // ------------------------------------------------------
  // NAVIGATION / ROUTER
  // ------------------------------------------------------
  async navigateTo(view) {
    this.currentView = view;

    document.querySelectorAll(".view").forEach(v => v.classList.add("hidden"));
    document.querySelectorAll(".nav-link").forEach(link => link.classList.remove("active"));

    const targetView = document.getElementById(`view-${view}`);
    if (targetView) targetView.classList.remove("hidden");

    const navLink = document.querySelector(`.nav-link[data-view="${view}"]`);
    if (navLink) navLink.classList.add("active");

    // Close mobile sidebar
    document.getElementById("sidebar").classList.remove("open");

    if (view === "dashboard") {
      await this.renderDashboard();
    } else if (view === "work-orders") {
      this.lastListView = "work-orders";
      this.resetFilters();
      await this.renderOrderList("work_order");
    } else if (view === "sample-requests") {
      this.lastListView = "sample-requests";
      this.resetFilters();
      await this.renderOrderList("sample_request");
    }
  },

  resetFilters() {
    this.filters = { status: "", search: "", sortBy: "due_date", ascending: true };
    document.getElementById("search-input").value = "";
    document.getElementById("status-filter").value = "";
    document.getElementById("sort-select").value = "due_date:asc";
  },

  async refreshCurrentList() {
    if (this.currentView === "work-orders") {
      await this.renderOrderList("work_order");
    } else if (this.currentView === "sample-requests") {
      await this.renderOrderList("sample_request");
    }
  },

  // ------------------------------------------------------
  // DASHBOARD
  // ------------------------------------------------------
  async renderDashboard() {
    const container = document.getElementById("view-dashboard");
    container.innerHTML = `<div class="loading">Loading dashboard...</div>`;

    try {
      const stats = await Dashboard.loadStats();
      const isAdmin = Auth.isAdmin();

      container.innerHTML = `
        <h1 class="page-title">Dashboard</h1>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-label">Total Work Orders</div>
            <div class="stat-value">${stats.totalWorkOrders}</div>
          </div>
          <div class="stat-card">
            <div class="stat-label">Total Sample Requests</div>
            <div class="stat-value">${stats.totalSampleRequests}</div>
          </div>
          ${isAdmin ? `
          <div class="stat-card highlight">
            <div class="stat-label">Total Revenue</div>
            <div class="stat-value">${formatCurrency(stats.totalRevenue)}</div>
          </div>` : ""}
          <div class="stat-card due-card-green">
            <div class="stat-label">Orders Due Today</div>
            <div class="stat-value">${stats.dueToday}</div>
          </div>
          <div class="stat-card due-card-yellow">
            <div class="stat-label">Orders Due This Week</div>
            <div class="stat-value">${stats.dueThisWeek}</div>
          </div>
          <div class="stat-card due-card-red">
            <div class="stat-label">Overdue Orders</div>
            <div class="stat-value">${stats.overdue}</div>
          </div>
        </div>

        <div class="charts-grid">
          <div class="chart-card">
            <h3>Monthly Revenue</h3>
            <div class="chart-wrap"><canvas id="monthly-revenue-chart"></canvas></div>
          </div>
          <div class="chart-card">
            <h3>Client Manager Performance</h3>
            <div class="chart-wrap"><canvas id="manager-performance-chart"></canvas></div>
          </div>
        </div>
      `;

      const monthlyData = Dashboard.buildMonthlyRevenue(stats.workOrders, stats.sampleRequests);
      const managerData = Dashboard.buildManagerPerformance(stats.workOrders, stats.sampleRequests);

      Dashboard.renderMonthlyChart("monthly-revenue-chart", monthlyData);
      Dashboard.renderManagerChart("manager-performance-chart", managerData);
    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="error-banner">Failed to load dashboard: ${this.errMsg(err)}</div>`;
    }
  },

  errMsg(err) {
    return err?.message || "Unknown error occurred.";
  },

  // ------------------------------------------------------
  // ORDER LIST RENDERING
  // ------------------------------------------------------
  async renderOrderList(type) {
    const isWorkOrder = type === "work_order";
    const containerId = isWorkOrder ? "view-work-orders" : "view-sample-requests";
    const container = document.getElementById(containerId);
    const tbody = container.querySelector("tbody");
    const title = isWorkOrder ? "Work Orders" : "Sample Requests";
    const numberLabel = isWorkOrder ? "WO No." : "Sample No.";

    container.querySelector(".page-title").textContent = title;
    container.querySelector("thead tr").innerHTML = `
      <th>${numberLabel}</th>
      <th>Client Name</th>
      <th>Client Manager</th>
      <th>Order Date</th>
      <th>Due Date</th>
      <th>Status</th>
      <th>Total Amount</th>
      <th>Actions</th>
    `;

    tbody.innerHTML = `<tr><td colspan="8" class="loading-cell">Loading...</td></tr>`;

    try {
      const fetchFn = isWorkOrder ? Orders.fetchWorkOrders : Orders.fetchSampleRequests;
      const data = await fetchFn.call(Orders, this.filters);

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="empty-cell">No records found.</td></tr>`;
        return;
      }

      tbody.innerHTML = "";
      data.forEach(order => {
        const number = isWorkOrder ? order.order_number : order.sample_number;
        const dueInfo = Orders.getDueDateStatus(order.due_date);
        const managerDisplay =
          order.client_manager === "Other" && order.other_manager_name
            ? order.other_manager_name
            : order.client_manager;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><strong>${number}</strong></td>
          <td>${this.escapeHtml(order.client_name)}</td>
          <td>${this.escapeHtml(managerDisplay || "—")}</td>
          <td>${formatDate(order.order_date)}</td>
          <td><span class="due-badge ${dueInfo.className}">${formatDate(order.due_date)}</span></td>
          <td>
            <select class="status-select" data-id="${order.id}" data-type="${type}">
              ${STATUS_OPTIONS.map(s => `<option value="${s}" ${s === order.status ? "selected" : ""}>${s}</option>`).join("")}
            </select>
          </td>
          <td>${formatCurrency(order.grand_total)}</td>
          <td class="actions-cell">
            <button class="icon-btn view-btn" data-id="${order.id}" data-type="${type}" title="View / PDF">View</button>
            <button class="icon-btn edit-btn" data-id="${order.id}" data-type="${type}" title="Edit">Edit</button>
            ${Auth.isAdmin() ? `<button class="icon-btn delete-btn" data-id="${order.id}" data-type="${type}" title="Delete">Delete</button>` : ""}
          </td>
        `;
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll(".status-select").forEach(sel => {
        sel.addEventListener("change", async e => {
          const id = e.target.dataset.id;
          const t = e.target.dataset.type;
          try {
            await Orders.updateStatus(t, id, e.target.value);
          } catch (err) {
            alert("Failed to update status: " + this.errMsg(err));
          }
        });
      });

      tbody.querySelectorAll(".view-btn").forEach(btn => {
        btn.addEventListener("click", () => this.openOrderDetail(btn.dataset.type, btn.dataset.id));
      });

      tbody.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", () => this.editOrder(btn.dataset.type, btn.dataset.id));
      });

      tbody.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", () => this.handleDelete(btn.dataset.type, btn.dataset.id));
      });
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="8" class="error-cell">Failed to load: ${this.errMsg(err)}</td></tr>`;
    }
  },

  escapeHtml(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  },

  async handleDelete(type, id) {
    if (!confirm("Are you sure you want to delete this order? This action cannot be undone.")) return;
    try {
      await Orders.deleteOrder(type, id);
      await this.refreshCurrentList();
    } catch (err) {
      alert("Failed to delete: " + this.errMsg(err));
    }
  },

  // ------------------------------------------------------
  // ORDER FORM (CREATE / EDIT)
  // ------------------------------------------------------
  openOrderForm(type, existingOrder = null) {
    Orders.resetItems();
    Orders.editingId = existingOrder ? existingOrder.id : null;
    Orders.editingType = existingOrder ? type : type;

    const isWorkOrder = type === "work_order";
    const view = document.getElementById("view-order-form");

    view.querySelector(".page-title").textContent = existingOrder
      ? `Edit ${isWorkOrder ? "Work Order" : "Sample Request"}`
      : `New ${isWorkOrder ? "Work Order" : "Sample Request"}`;

    document.getElementById("order-form").dataset.orderType = type;

    const numberLabel = document.getElementById("order-number-label");
    const numberDisplay = document.getElementById("order-number-display");
    numberLabel.style.display = "block";
    if (existingOrder) {
      numberDisplay.textContent = isWorkOrder ? existingOrder.order_number : existingOrder.sample_number;
    } else {
      numberDisplay.textContent = "Auto-generated on save";
    }

    document.getElementById("order-date-input").value = existingOrder?.order_date || todayISO();
    document.getElementById("due-date-input").value = existingOrder?.due_date || "";
    document.getElementById("client-name-input").value = existingOrder?.client_name || "";
    document.getElementById("contact-person-input").value = existingOrder?.contact_person || "";
    document.getElementById("mobile-number-input").value = existingOrder?.mobile_number || "";
    document.getElementById("email-input").value = existingOrder?.email || "";
    document.getElementById("address-input").value = existingOrder?.address || "";

    const managerSelect = document.getElementById("client-manager-select");
    managerSelect.innerHTML = CLIENT_MANAGERS.map(m => `<option value="${m}">${m}</option>`).join("");
    managerSelect.value = existingOrder?.client_manager || "Gowtham";

    const otherWrap = document.getElementById("other-manager-wrap");
    const otherInput = document.getElementById("other-manager-input");
    if (existingOrder?.client_manager === "Other") {
      otherWrap.style.display = "block";
      otherInput.value = existingOrder?.other_manager_name || "";
    } else {
      otherWrap.style.display = "none";
      otherInput.value = "";
    }

    const statusSelect = document.getElementById("status-select-form");
    statusSelect.innerHTML = STATUS_OPTIONS.map(s => `<option value="${s}">${s}</option>`).join("");
    statusSelect.value = existingOrder?.status || "Pending";

    document.getElementById("advance-payment-input").value = existingOrder?.advance_payment || 0;
    document.getElementById("form-error").textContent = "";

    if (existingOrder) {
      Orders.loadItems(type, existingOrder.id).then(items => {
        if (items.length === 0) {
          Orders.addItem();
        } else {
          items.forEach(it => Orders.addItem(it));
        }
        this.renderItemsTable();
        this.renderTotals();
      });
    } else {
      Orders.addItem();
      this.renderItemsTable();
      this.renderTotals();
    }

    this.navigateTo("order-form");
  },

  async editOrder(type, id) {
    try {
      const order = await Orders.fetchOne(type, id);
      this.openOrderForm(type, order);
    } catch (err) {
      alert("Failed to load order: " + this.errMsg(err));
    }
  },

  // ------------------------------------------------------
  // ITEMS TABLE RENDERING
  // ------------------------------------------------------
  renderItemsTable() {
    const tbody = document.querySelector("#items-table tbody");
    tbody.innerHTML = "";

    Orders.items.forEach(item => {
      const tr = document.createElement("tr");
      tr.dataset.uid = item.uid;

      const gst = Orders.calcItemGST(item);
      const total = Orders.calcItemTotal(item);

      tr.innerHTML = `
        <td class="serial-cell">${item.serial_number}</td>
        <td><input type="text" class="item-input" data-field="item_name" value="${this.escapeHtml(item.item_name)}" placeholder="Item name" required /></td>
        <td><input type="text" class="item-input small" data-field="pack_size" value="${this.escapeHtml(item.pack_size)}" placeholder="e.g. 100ml" /></td>
        <td><input type="text" class="item-input" data-field="formulation_reference" value="${this.escapeHtml(item.formulation_reference)}" placeholder="e.g. Refer WO-2512" /></td>
        <td><input type="text" class="item-input" data-field="packaging_container" value="${this.escapeHtml(item.packaging_container)}" placeholder="e.g. PET Bottle" /></td>
        <td><input type="text" class="item-input" data-field="label_packaging_details" value="${this.escapeHtml(item.label_packaging_details)}" placeholder="e.g. Label + Monocarton" /></td>
        <td><input type="number" class="item-input small num-input" data-field="quantity" value="${item.quantity}" min="0" step="0.01" required /></td>
        <td><input type="number" class="item-input small num-input" data-field="rate" value="${item.rate}" min="0" step="0.01" required /></td>
        <td>
          <select class="item-input small gst-select" data-field="gst_percent">
            ${GST_OPTIONS.map(g => `<option value="${g}" ${g === item.gst_percent ? "selected" : ""}>${g}%</option>`).join("")}
          </select>
        </td>
        <td class="amount-cell">
          <div class="amount-value">${formatCurrency(item.amount)}</div>
          <div class="gst-value">+GST: ${formatCurrency(gst)}</div>
          <div class="total-value">Total: ${formatCurrency(total)}</div>
        </td>
        <td><button type="button" class="icon-btn remove-item-btn" title="Remove">✕</button></td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("tr").forEach(tr => {
      const uid = tr.dataset.uid;

      tr.querySelectorAll(".item-input").forEach(input => {
        const eventType = input.tagName === "SELECT" ? "change" : "input";
        input.addEventListener(eventType, e => {
          Orders.updateItemField(uid, e.target.dataset.field, e.target.value);
          this.updateRowAmount(tr, uid);
          this.renderTotals();
        });
      });

      tr.querySelector(".remove-item-btn").addEventListener("click", () => {
        if (Orders.items.length <= 1) {
          alert("At least one item is required.");
          return;
        }
        Orders.removeItem(uid);
        this.renderItemsTable();
        this.renderTotals();
      });
    });
  },

  updateRowAmount(tr, uid) {
    const item = Orders.items.find(i => i.uid === uid);
    if (!item) return;
    const gst = Orders.calcItemGST(item);
    const total = Orders.calcItemTotal(item);
    tr.querySelector(".amount-value").textContent = formatCurrency(item.amount);
    tr.querySelector(".gst-value").textContent = `+GST: ${formatCurrency(gst)}`;
    tr.querySelector(".total-value").textContent = `Total: ${formatCurrency(total)}`;
  },

  renderTotals() {
    const advance = document.getElementById("advance-payment-input").value;
    const totals = Orders.getTotals(advance);

    document.getElementById("totals-subtotal").textContent = formatCurrency(totals.subtotal);
    document.getElementById("totals-gst").textContent = formatCurrency(totals.totalGst);
    document.getElementById("totals-grand").textContent = formatCurrency(totals.grandTotal);
    document.getElementById("totals-balance").textContent = formatCurrency(totals.balance);
  },

  // ------------------------------------------------------
  // FORM SUBMIT
  // ------------------------------------------------------
  async handleOrderSubmit() {
    const type = document.getElementById("order-form").dataset.orderType;
    const errorEl = document.getElementById("form-error");
    const submitBtn = document.getElementById("save-order-btn");

    const formData = {
      order_date: document.getElementById("order-date-input").value,
      due_date: document.getElementById("due-date-input").value,
      client_name: document.getElementById("client-name-input").value,
      contact_person: document.getElementById("contact-person-input").value,
      mobile_number: document.getElementById("mobile-number-input").value,
      email: document.getElementById("email-input").value,
      address: document.getElementById("address-input").value,
      client_manager: document.getElementById("client-manager-select").value,
      other_manager_name: document.getElementById("other-manager-input").value,
      status: document.getElementById("status-select-form").value,
      advance_payment: document.getElementById("advance-payment-input").value
    };

    const errors = Orders.validateForm(formData);
    if (errors.length > 0) {
      errorEl.innerHTML = errors.map(e => `• ${this.escapeHtml(e)}`).join("<br>");
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    errorEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
      let result;
      if (type === "work_order") {
        result = await Orders.saveWorkOrder(formData);
      } else {
        result = await Orders.saveSampleRequest(formData);
      }

      Orders.editingId = null;
      Orders.editingType = null;

      const successView = type === "work_order" ? "work-orders" : "sample-requests";
      await this.navigateTo(successView);
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Failed to save: " + this.errMsg(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save";
    }
  },

  // ------------------------------------------------------
  // ORDER DETAIL MODAL / PDF
  // ------------------------------------------------------
  async openOrderDetail(type, id) {
    const modal = document.getElementById("order-detail-modal");
    const body = document.getElementById("order-detail-body");
    body.innerHTML = `<div class="loading">Loading...</div>`;
    modal.classList.add("active");

    try {
      const order = await Orders.fetchOne(type, id);
      const items = await Orders.loadItems(type, id);
      const isWorkOrder = type === "work_order";
      const number = isWorkOrder ? order.order_number : order.sample_number;
      const dueInfo = Orders.getDueDateStatus(order.due_date);
      const managerDisplay =
        order.client_manager === "Other" && order.other_manager_name
          ? order.other_manager_name
          : order.client_manager;

      body.innerHTML = `
        <h2>${isWorkOrder ? "Work Order" : "Sample Request"} #${number}</h2>
        <div class="detail-grid">
          <div><strong>Client:</strong> ${this.escapeHtml(order.client_name)}</div>
          <div><strong>Contact Person:</strong> ${this.escapeHtml(order.contact_person || "—")}</div>
          <div><strong>Mobile:</strong> ${this.escapeHtml(order.mobile_number || "—")}</div>
          <div><strong>Email:</strong> ${this.escapeHtml(order.email || "—")}</div>
          <div><strong>Client Manager:</strong> ${this.escapeHtml(managerDisplay || "—")}</div>
          <div><strong>Status:</strong> ${order.status}</div>
          <div><strong>Order Date:</strong> ${formatDate(order.order_date)}</div>
          <div><strong>Due Date:</strong> <span class="due-badge ${dueInfo.className}">${formatDate(order.due_date)}</span></div>
          <div class="full-width"><strong>Address:</strong> ${this.escapeHtml(order.address || "—")}</div>
        </div>

        <h3>Products</h3>
        <div class="table-wrap">
          <table class="detail-items-table">
            <thead>
              <tr>
                <th>#</th><th>Item Name</th><th>Pack Size</th><th>Formulation Ref.</th>
                <th>Packaging</th><th>Label/Pkg Details</th><th>Qty</th><th>Rate</th><th>GST</th><th>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${items.map(it => {
                const gst = round2(it.amount * (it.gst_percent / 100));
                const total = round2(it.amount + gst);
                return `<tr>
                  <td>${it.serial_number}</td>
                  <td>${this.escapeHtml(it.item_name)}</td>
                  <td>${this.escapeHtml(it.pack_size || "—")}</td>
                  <td>${this.escapeHtml(it.formulation_reference || "—")}</td>
                  <td>${this.escapeHtml(it.packaging_container || "—")}</td>
                  <td>${this.escapeHtml(it.label_packaging_details || "—")}</td>
                  <td>${it.quantity}</td>
                  <td>${formatCurrency(it.rate)}</td>
                  <td>${it.gst_percent}%</td>
                  <td>${formatCurrency(total)}</td>
                </tr>`;
              }).join("")}
            </tbody>
          </table>
        </div>

        <div class="detail-totals">
          <div><span>Subtotal:</span> <strong>${formatCurrency(order.subtotal)}</strong></div>
          <div><span>Total GST:</span> <strong>${formatCurrency(order.total_gst)}</strong></div>
          <div><span>Grand Total:</span> <strong>${formatCurrency(order.grand_total)}</strong></div>
          <div><span>Advance Payment:</span> <strong>${formatCurrency(order.advance_payment)}</strong></div>
          <div><span>Balance Amount:</span> <strong>${formatCurrency(order.balance_amount)}</strong></div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-primary" id="download-pdf-btn">Download PDF</button>
          <button class="btn btn-secondary" id="print-view-btn">Print View</button>
        </div>
      `;

      document.getElementById("download-pdf-btn").addEventListener("click", async () => {
        try {
          await PDFGen.generate(type, order, items);
        } catch (err) {
          alert("Failed to generate PDF: " + this.errMsg(err));
        }
      });

      document.getElementById("print-view-btn").addEventListener("click", () => {
        window.print();
      });
    } catch (err) {
      console.error(err);
      body.innerHTML = `<div class="error-banner">Failed to load details: ${this.errMsg(err)}</div>`;
    }
  }
};

// ------------------------------------------------------
// BOOTSTRAP
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
