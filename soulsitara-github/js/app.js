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
  quotationFilters: {
    search: ""
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
    const sidebarOverlay = document.getElementById("sidebar-overlay");
    const sidebar = document.getElementById("sidebar");

    if (menuToggle) {
      menuToggle.addEventListener("click", () => {
        sidebar.classList.toggle("open");
        sidebarOverlay.classList.toggle("active");
      });
    }
    if (sidebarOverlay) {
      sidebarOverlay.addEventListener("click", () => {
        sidebar.classList.remove("open");
        sidebarOverlay.classList.remove("active");
      });
    }

    // New Work Order / Sample Request / Quotation buttons
    document.getElementById("new-work-order-btn").addEventListener("click", () => {
      this.openOrderForm("work_order");
    });
    document.getElementById("new-sample-request-btn").addEventListener("click", () => {
      this.openOrderForm("sample_request");
    });
    document.getElementById("new-quotation-btn").addEventListener("click", () => {
      this.openQuotationForm();
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

    // Quotation form events
    document.getElementById("quotation-form").addEventListener("submit", async e => {
      e.preventDefault();
      await this.handleQuotationSubmit();
    });
    document.getElementById("quotation-add-item-btn").addEventListener("click", () => {
      Orders.addItem();
      this.renderQuotationItemsTable();
    });
    document.getElementById("cancel-quotation-form-btn").addEventListener("click", () => {
      this.navigateTo("quotations");
    });
    document.getElementById("quotation-client-manager-select").addEventListener("change", e => {
      const otherWrap = document.getElementById("quotation-other-manager-wrap");
      otherWrap.style.display = e.target.value === "Other" ? "block" : "none";
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

    // Quotation search filter
    const quotationSearch = document.getElementById("quotation-search-input");
    if (quotationSearch) {
      quotationSearch.addEventListener("input", e => {
        this.quotationFilters.search = e.target.value;
        this.debounceRefreshQuotationList();
      });
    }
  },

  debounceRefreshList() {
    clearTimeout(this._searchDebounce);
    this._searchDebounce = setTimeout(() => this.refreshCurrentList(), 300);
  },

  debounceRefreshQuotationList() {
    clearTimeout(this._quotationSearchDebounce);
    this._quotationSearchDebounce = setTimeout(() => this.renderQuotationList(), 300);
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

    const topbarUser = document.getElementById("topbar-user");
    if (topbarUser) {
      topbarUser.textContent = Auth.currentProfile?.full_name || Auth.currentProfile?.email || "";
    }

    this.setupRealtime();
    this.checkSupabaseConnection();
    await this.navigateTo("dashboard");
  },

  // ------------------------------------------------------
  // SUPABASE CONNECTION VERIFICATION
  // Confirms the DB is reachable AND that reads/writes work,
  // so you can be sure orders are really being stored.
  // ------------------------------------------------------
  async checkSupabaseConnection() {
    const dot = document.querySelector("#connection-status .status-dot");
    const text = document.querySelector("#connection-status .status-text");
    if (!dot || !text) return;

    dot.className = "status-dot status-checking";
    text.textContent = "Checking connection...";

    try {
      // Lightweight read — counts work_orders rows. Confirms URL/key + RLS read access.
      const { count, error } = await supabaseClient
        .from("work_orders")
        .select("id", { count: "exact", head: true });

      if (error) throw error;

      dot.className = "status-dot status-online";
      text.textContent = `Connected (${count ?? 0} work order${count === 1 ? "" : "s"} stored)`;
    } catch (err) {
      console.error("Supabase connection check failed:", err);
      dot.className = "status-dot status-offline";
      text.textContent = "Connection failed — check config.js";
    }
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
      .on("postgres_changes", { event: "*", schema: "public", table: "quotations" }, () => {
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
    } else if (this.currentView === "quotations") {
      this.renderQuotationList();
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
    const overlay = document.getElementById("sidebar-overlay");
    if (overlay) overlay.classList.remove("active");

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
    } else if (view === "quotations") {
      this.lastListView = "quotations";
      this.quotationFilters = { search: "" };
      const qSearch = document.getElementById("quotation-search-input");
      if (qSearch) qSearch.value = "";
      await this.renderQuotationList();
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
          <div class="stat-card clickable" data-filter="all-wo" title="View all Work Orders">
            <div class="stat-label">Total Work Orders</div>
            <div class="stat-value">${stats.totalWorkOrders}</div>
          </div>
          <div class="stat-card clickable" data-filter="all-sr" title="View all Sample Requests">
            <div class="stat-label">Total Sample Requests</div>
            <div class="stat-value">${stats.totalSampleRequests}</div>
          </div>
          <div class="stat-card stat-card-quotation clickable" data-filter="all-q" title="View all Quotations">
            <div class="stat-label">Total Quotations</div>
            <div class="stat-value">${stats.totalQuotations}</div>
          </div>
          ${isAdmin ? `
          <div class="stat-card highlight">
            <div class="stat-label">Total Revenue</div>
            <div class="stat-value">${formatCurrency(stats.totalRevenue)}</div>
          </div>` : ""}
          <div class="stat-card due-card-green clickable" data-filter="due-today" title="View orders due today">
            <div class="stat-label">Due Today</div>
            <div class="stat-value">${stats.dueToday}</div>
          </div>
          <div class="stat-card due-card-orange clickable" data-filter="due-yesterday" title="View orders due yesterday">
            <div class="stat-label">Due Yesterday</div>
            <div class="stat-value">${stats.dueYesterday}</div>
          </div>
          <div class="stat-card due-card-yellow clickable" data-filter="due-week" title="View orders due this week">
            <div class="stat-label">Due This Week</div>
            <div class="stat-value">${stats.dueThisWeek}</div>
          </div>
          <div class="stat-card due-card-month clickable" data-filter="due-month" title="View orders due this month">
            <div class="stat-label">Due This Month</div>
            <div class="stat-value">${stats.dueThisMonth}</div>
          </div>
          <div class="stat-card due-card-red clickable" data-filter="overdue" title="View overdue orders">
            <div class="stat-label">Overdue Orders</div>
            <div class="stat-value">${stats.overdue}</div>
          </div>
        </div>

        <div class="charts-grid" style="margin-top:18px;">
          <div class="chart-card">
            <h3>Monthly Revenue</h3>
            <div class="chart-wrap"><canvas id="monthly-revenue-chart"></canvas></div>
          </div>
          <div class="chart-card">
            <h3>Client Manager Performance</h3>
            <div class="chart-wrap"><canvas id="manager-performance-chart"></canvas></div>
          </div>
        </div>

        <div class="source-analytics-section">
          <h2 class="section-title">📣 Marketing Analytics</h2>
          <p class="section-subtitle">Track which ads and campaigns bring the most clients and revenue</p>
          <div id="marketing-analytics-wrap"></div>
        </div>
      `;

      // Charts
      const monthlyData = Dashboard.buildMonthlyRevenue(stats.workOrders, stats.sampleRequests);
      const managerData = Dashboard.buildManagerPerformance(stats.workOrders, stats.sampleRequests);
      Dashboard.renderMonthlyChart("monthly-revenue-chart", monthlyData);
      Dashboard.renderManagerChart("manager-performance-chart", managerData);

      // Marketing analytics
      const allOrders = [
        ...stats.workOrders.map(o => ({ ...o, _type: "work_order" })),
        ...stats.sampleRequests.map(o => ({ ...o, _type: "sample_request" })),
        ...(stats.quotations || []).map(o => ({ ...o, _type: "quotation" }))
      ];
      Dashboard.renderMarketingCharts("marketing-analytics-wrap", allOrders);

      // Clickable stat cards → open filtered due-date lists
      container.querySelectorAll(".stat-card.clickable").forEach(card => {
        card.addEventListener("click", () => {
          const filter = card.dataset.filter;
          this.openDueList(filter, allOrders);
        });
      });

    } catch (err) {
      console.error(err);
      container.innerHTML = `<div class="error-banner">Failed to load dashboard: ${this.errMsg(err)}</div>`;
    }
  },

  // ------------------------------------------------------
  // DUE-DATE FILTERED LIST (opened by clicking stat cards)
  // ------------------------------------------------------
  openDueList(filter, allOrders) {
    const today = new Date(); today.setHours(0,0,0,0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
    const startOfWeek = new Date(today); startOfWeek.setDate(today.getDate()-today.getDay());
    const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate()+6);
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth   = new Date(today.getFullYear(), today.getMonth()+1, 0);

    let filtered = [];
    let title = "";

    if (filter === "all-wo") {
      filtered = allOrders.filter(o => o._type === "work_order");
      title = "🛠️ All Production Work Orders";
    } else if (filter === "all-sr") {
      filtered = allOrders.filter(o => o._type === "sample_request");
      title = "🧪 All Sample Requests";
    } else if (filter === "all-q") {
      filtered = allOrders.filter(o => o._type === "quotation");
      title = "💰 All Quotations";
    } else {
      const woSr = allOrders.filter(o => o._type !== "quotation" && o.due_date);
      if (filter === "due-today") {
        filtered = woSr.filter(o => {
          const d = new Date(o.due_date); d.setHours(0,0,0,0);
          return d.getTime() === today.getTime();
        });
        title = "📅 Orders Due Today";
      } else if (filter === "due-yesterday") {
        filtered = woSr.filter(o => {
          const d = new Date(o.due_date); d.setHours(0,0,0,0);
          return d.getTime() === yesterday.getTime();
        });
        title = "⚠️ Orders Due Yesterday";
      } else if (filter === "due-week") {
        filtered = woSr.filter(o => {
          const d = new Date(o.due_date); d.setHours(0,0,0,0);
          return d >= today && d <= endOfWeek;
        });
        title = "📆 Orders Due This Week";
      } else if (filter === "due-month") {
        filtered = woSr.filter(o => {
          const d = new Date(o.due_date); d.setHours(0,0,0,0);
          return d >= startOfMonth && d <= endOfMonth;
        });
        title = "📅 Orders Due This Month";
      } else if (filter === "overdue") {
        filtered = woSr.filter(o => {
          const d = new Date(o.due_date); d.setHours(0,0,0,0);
          return d < today && !["Dispatched","Delivered"].includes(o.status);
        });
        title = "🔴 Overdue Orders";
      }
    }

    this.showDueListModal(title, filtered);
  },

  showDueListModal(title, orders) {
    let modal = document.getElementById("due-list-modal");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "due-list-modal";
      modal.className = "modal-overlay";
      modal.innerHTML = `
        <div class="modal-content" style="max-width:960px;">
          <button class="modal-close" id="close-due-list-modal">✕</button>
          <div id="due-list-modal-body"></div>
        </div>`;
      document.body.appendChild(modal);
      document.getElementById("close-due-list-modal").addEventListener("click", () => {
        modal.classList.remove("active");
      });
    }

    const typeLabel = t =>
      t === "work_order"    ? "🛠️ Work Order" :
      t === "sample_request"? "🧪 Sample Request" :
                              "💰 Quotation";

    const rows = orders.map(o => {
      const num = o._type === "work_order" ? o.order_number
                : o._type === "sample_request" ? o.sample_number
                : "Q-" + String(o.quotation_number).padStart(4,"0");
      const dueInfo = o.due_date ? Orders.getDueDateStatus(o.due_date) : { label: "—", className: "" };
      return `<tr>
        <td>${typeLabel(o._type)}</td>
        <td><strong>${num}</strong></td>
        <td>${this.escapeHtml(o.client_name || "—")}</td>
        <td><span class="due-badge ${dueInfo.className}">${formatDate(o.due_date)}</span></td>
        <td>${formatCurrency(o.grand_total)}</td>
        <td>${o.status || "—"}</td>
      </tr>`;
    }).join("");

    document.getElementById("due-list-modal-body").innerHTML = `
      <h2 style="margin-bottom:14px;">${title}</h2>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:14px;">${orders.length} order${orders.length!==1?"s":""} found</p>
      <div class="table-wrap">
        <table class="due-list-table">
          <thead><tr>
            <th>Type</th><th>Number</th><th>Company / Brand</th>
            <th>Due Date</th><th>Amount</th><th>Status</th>
          </tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty-cell">No records found</td></tr>'}</tbody>
        </table>
      </div>`;

    modal.classList.add("active");
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
    const title = isWorkOrder ? "🛠️ Production Work Orders" : "🧪 Sample Requests";
    const numberLabel = isWorkOrder ? "WO No." : "Sample No.";

    // Apply theme class so CSS can color-differentiate the two sections
    container.classList.remove("theme-work-order", "theme-sample-request");
    container.classList.add(isWorkOrder ? "theme-work-order" : "theme-sample-request");

    container.querySelector(".page-title").textContent = title;
    container.querySelector("thead tr").innerHTML = `
      <th>${numberLabel}</th>
      <th>Company / Brand Name</th>
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
          <td><span class="order-number-chip ${isWorkOrder ? "chip-work-order" : "chip-sample-request"}">${number}</span></td>
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

  // ------------------------------------------------------
  // QUOTATION LIST RENDERING
  // (no Due Date / Status columns — quotations don't have them)
  // ------------------------------------------------------
  async renderQuotationList() {
    const container = document.getElementById("view-quotations");
    const tbody = container.querySelector("tbody");

    container.classList.add("theme-quotation");

    container.querySelector("thead tr").innerHTML = `
      <th>Quote No.</th>
      <th>Company / Brand Name</th>
      <th>Client Manager</th>
      <th>Quote Date</th>
      <th>Validity</th>
      <th>Total Amount</th>
      <th>Actions</th>
    `;

    tbody.innerHTML = `<tr><td colspan="7" class="loading-cell">Loading...</td></tr>`;

    try {
      const data = await Orders.fetchQuotations(this.quotationFilters);

      if (data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="empty-cell">No quotations found.</td></tr>`;
        return;
      }

      tbody.innerHTML = "";
      data.forEach(q => {
        const number = "Q-" + String(q.quotation_number).padStart(4, "0");
        const managerDisplay =
          q.client_manager === "Other" && q.other_manager_name
            ? q.other_manager_name
            : q.client_manager;

        const tr = document.createElement("tr");
        tr.innerHTML = `
          <td><span class="order-number-chip chip-quotation">${number}</span></td>
          <td>${this.escapeHtml(q.client_name)}</td>
          <td>${this.escapeHtml(managerDisplay || "—")}</td>
          <td>${formatDate(q.quote_date)}</td>
          <td>${this.escapeHtml(q.quote_validity || "—")}</td>
          <td>${formatCurrency(q.grand_total)}</td>
          <td class="actions-cell">
            <button class="icon-btn view-btn" data-id="${q.id}" title="View / PDF">View</button>
            <button class="icon-btn edit-btn" data-id="${q.id}" title="Edit">Edit</button>
            ${Auth.isAdmin() ? `<button class="icon-btn delete-btn" data-id="${q.id}" title="Delete">Delete</button>` : ""}
          </td>
        `;
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll(".view-btn").forEach(btn => {
        btn.addEventListener("click", () => this.openOrderDetail("quotation", btn.dataset.id));
      });
      tbody.querySelectorAll(".edit-btn").forEach(btn => {
        btn.addEventListener("click", () => this.editQuotation(btn.dataset.id));
      });
      tbody.querySelectorAll(".delete-btn").forEach(btn => {
        btn.addEventListener("click", () => this.handleDelete("quotation", btn.dataset.id));
      });
    } catch (err) {
      console.error(err);
      tbody.innerHTML = `<tr><td colspan="7" class="error-cell">Failed to load: ${this.errMsg(err)}</td></tr>`;
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
      if (type === "quotation") {
        await this.renderQuotationList();
      } else {
        await this.refreshCurrentList();
      }
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

    view.classList.remove("theme-work-order", "theme-sample-request");
    view.classList.add(isWorkOrder ? "theme-work-order" : "theme-sample-request");

    const icon = isWorkOrder ? "🛠️" : "🧪";
    view.querySelector(".page-title").textContent = existingOrder
      ? `${icon} Edit ${isWorkOrder ? "Production Work Order" : "Sample Request"}`
      : `${icon} New ${isWorkOrder ? "Production Work Order" : "Sample Request"}`;

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
    document.getElementById("additional-comments-input").value = existingOrder?.additional_comments || "";
    document.getElementById("lead-source-input").value = existingOrder?.lead_source || "";
    document.getElementById("ad-name-input").value = existingOrder?.ad_name || "";
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
  // QUOTATION FORM (CREATE / EDIT)
  // ------------------------------------------------------
  openQuotationForm(existingQuotation = null) {
    Orders.resetItems();
    Orders.editingId = existingQuotation ? existingQuotation.id : null;
    Orders.editingType = "quotation";

    const view = document.getElementById("view-quotation-form");
    view.classList.add("theme-quotation");

    view.querySelector(".page-title").textContent = existingQuotation
      ? "💰 Edit Quotation"
      : "💰 New Quotation";

    const numDisplay = document.getElementById("quotation-number-display");
    if (existingQuotation) {
      numDisplay.textContent = "Q-" + String(existingQuotation.quotation_number).padStart(4, "0");
    } else {
      numDisplay.textContent = "Auto-generated on save";
    }

    document.getElementById("quote-date-input").value = existingQuotation?.quote_date || todayISO();
    document.getElementById("quote-validity-input").value = existingQuotation?.quote_validity || "";
    document.getElementById("quotation-client-name-input").value = existingQuotation?.client_name || "";
    document.getElementById("quotation-contact-person-input").value = existingQuotation?.contact_person || "";
    document.getElementById("quotation-mobile-number-input").value = existingQuotation?.mobile_number || "";
    document.getElementById("quotation-email-input").value = existingQuotation?.email || "";
    document.getElementById("quotation-address-input").value = existingQuotation?.address || "";
    document.getElementById("terms-conditions-input").value = existingQuotation?.terms_and_conditions || "";
    document.getElementById("quotation-lead-source-input").value = existingQuotation?.lead_source || "";
    document.getElementById("quotation-ad-name-input").value = existingQuotation?.ad_name || "";
    document.getElementById("quotation-form-error").textContent = "";

    const managerSelect = document.getElementById("quotation-client-manager-select");
    managerSelect.innerHTML = CLIENT_MANAGERS.map(m => `<option value="${m}">${m}</option>`).join("");
    managerSelect.value = existingQuotation?.client_manager || "Gowtham";

    const otherWrap = document.getElementById("quotation-other-manager-wrap");
    const otherInput = document.getElementById("quotation-other-manager-input");
    if (existingQuotation?.client_manager === "Other") {
      otherWrap.style.display = "block";
      otherInput.value = existingQuotation?.other_manager_name || "";
    } else {
      otherWrap.style.display = "none";
      otherInput.value = "";
    }

    if (existingQuotation) {
      Orders.loadItems("quotation", existingQuotation.id).then(items => {
        if (items.length === 0) Orders.addItem();
        else items.forEach(it => Orders.addItem(it));
        this.renderQuotationItemsTable();
        this.renderQuotationTotals();
      });
    } else {
      Orders.addItem();
      this.renderQuotationItemsTable();
      this.renderQuotationTotals();
    }

    this.navigateTo("quotation-form");
  },

  async editQuotation(id) {
    try {
      const q = await Orders.fetchOne("quotation", id);
      this.openQuotationForm(q);
    } catch (err) {
      alert("Failed to load quotation: " + this.errMsg(err));
    }
  },

  renderQuotationItemsTable() {
    const tbody = document.querySelector("#quotation-items-table tbody");
    const mobileWrap = document.getElementById("quotation-items-mobile-list");
    tbody.innerHTML = "";
    if (mobileWrap) mobileWrap.innerHTML = "";

    Orders.items.forEach(item => {
      const gst = Orders.calcItemGST(item);
      const total = Orders.calcItemTotal(item);

      // Desktop table row
      const tr = document.createElement("tr");
      tr.dataset.uid = item.uid;
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
      this.bindQuotationItemRowEvents(tr, item.uid);

      // Mobile card
      if (mobileWrap) {
        const card = document.createElement("div");
        card.className = "item-mobile-card";
        card.dataset.uid = item.uid;
        card.innerHTML = `
          <div class="item-mobile-header">
            <span class="item-mobile-badge">Item #${item.serial_number}</span>
            <button type="button" class="icon-btn remove-item-btn" title="Remove">✕ Remove</button>
          </div>
          <div class="item-mobile-field">
            <label>Item Name <span class="req">*</span></label>
            <input type="text" class="item-input" data-field="item_name" value="${this.escapeHtml(item.item_name)}" placeholder="e.g. Aloevera Soap" required />
          </div>
          <div class="item-mobile-row-2">
            <div class="item-mobile-field">
              <label>Pack Size</label>
              <input type="text" class="item-input" data-field="pack_size" value="${this.escapeHtml(item.pack_size)}" placeholder="e.g. 100ml" />
            </div>
            <div class="item-mobile-field">
              <label>Quantity <span class="req">*</span></label>
              <input type="number" class="item-input num-input qty-highlight" data-field="quantity" value="${item.quantity}" min="0" step="0.01" placeholder="0" required />
            </div>
          </div>
          <div class="item-mobile-field">
            <label>Formulation Reference</label>
            <input type="text" class="item-input" data-field="formulation_reference" value="${this.escapeHtml(item.formulation_reference)}" placeholder="e.g. Refer WO-2512" />
          </div>
          <div class="item-mobile-field">
            <label>Packaging &amp; Container</label>
            <input type="text" class="item-input" data-field="packaging_container" value="${this.escapeHtml(item.packaging_container)}" placeholder="e.g. PET Bottle" />
          </div>
          <div class="item-mobile-field">
            <label>Label &amp; Packaging Details</label>
            <input type="text" class="item-input" data-field="label_packaging_details" value="${this.escapeHtml(item.label_packaging_details)}" placeholder="e.g. Label + Monocarton" />
          </div>
          <div class="item-mobile-row-2">
            <div class="item-mobile-field">
              <label>Rate (₹) <span class="req">*</span></label>
              <input type="number" class="item-input num-input" data-field="rate" value="${item.rate}" min="0" step="0.01" placeholder="0.00" required />
            </div>
            <div class="item-mobile-field">
              <label>GST %</label>
              <select class="item-input gst-select" data-field="gst_percent">
                ${GST_OPTIONS.map(g => `<option value="${g}" ${g === item.gst_percent ? "selected" : ""}>${g}%</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="item-mobile-summary">
            <div><span>Amount</span><strong class="amount-value">${formatCurrency(item.amount)}</strong></div>
            <div><span>GST</span><strong class="gst-value">${formatCurrency(gst)}</strong></div>
            <div class="total-row"><span>Item Total</span><strong class="total-value">${formatCurrency(total)}</strong></div>
          </div>
        `;
        mobileWrap.appendChild(card);
        this.bindQuotationItemRowEvents(card, item.uid);
      }
    });
  },

  bindQuotationItemRowEvents(container, uid) {
    container.querySelectorAll(".item-input").forEach(input => {
      const eventType = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventType, e => {
        Orders.updateItemField(uid, e.target.dataset.field, e.target.value);
        this.syncItemUI(uid);
        this.renderQuotationTotals();
      });
    });
    const removeBtn = container.querySelector(".remove-item-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        if (Orders.items.length <= 1) { alert("At least one item is required."); return; }
        Orders.removeItem(uid);
        this.renderQuotationItemsTable();
        this.renderQuotationTotals();
      });
    }
  },

  renderQuotationTotals() {
    const totals = Orders.getTotals(0);
    document.getElementById("quotation-totals-subtotal").textContent = formatCurrency(totals.subtotal);
    document.getElementById("quotation-totals-gst").textContent = formatCurrency(totals.totalGst);
    document.getElementById("quotation-totals-grand").textContent = formatCurrency(totals.grandTotal);
  },

  async handleQuotationSubmit() {
    const errorEl = document.getElementById("quotation-form-error");
    const submitBtn = document.getElementById("save-quotation-btn");

    const formData = {
      quote_date: document.getElementById("quote-date-input").value,
      quote_validity: document.getElementById("quote-validity-input").value,
      client_name: document.getElementById("quotation-client-name-input").value,
      contact_person: document.getElementById("quotation-contact-person-input").value,
      mobile_number: document.getElementById("quotation-mobile-number-input").value,
      email: document.getElementById("quotation-email-input").value,
      address: document.getElementById("quotation-address-input").value,
      client_manager: document.getElementById("quotation-client-manager-select").value,
      other_manager_name: document.getElementById("quotation-other-manager-input").value,
      terms_and_conditions: document.getElementById("terms-conditions-input").value,
      lead_source: document.getElementById("quotation-lead-source-input").value,
      ad_name: document.getElementById("quotation-ad-name-input").value,
    };

    const errors = Orders.validateQuotationForm(formData);
    if (errors.length > 0) {
      errorEl.innerHTML = errors.map(e => `• ${this.escapeHtml(e)}`).join("<br>");
      errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    errorEl.textContent = "";
    submitBtn.disabled = true;
    submitBtn.textContent = "Saving...";

    try {
      await Orders.saveQuotation(formData);
      Orders.editingId = null;
      Orders.editingType = null;
      await this.navigateTo("quotations");
    } catch (err) {
      console.error(err);
      errorEl.textContent = "Failed to save: " + this.errMsg(err);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Save";
    }
  },

  // ------------------------------------------------------
  // ITEMS TABLE RENDERING
  // ------------------------------------------------------
  renderItemsTable() {
    const tbody = document.querySelector("#items-table tbody");
    const mobileWrap = document.getElementById("items-mobile-list");
    tbody.innerHTML = "";
    if (mobileWrap) mobileWrap.innerHTML = "";

    Orders.items.forEach(item => {
      const gst = Orders.calcItemGST(item);
      const total = Orders.calcItemTotal(item);

      // ---- DESKTOP TABLE ROW ----
      const tr = document.createElement("tr");
      tr.dataset.uid = item.uid;
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
      this.bindItemRowEvents(tr, item.uid);

      // ---- MOBILE CARD ----
      if (mobileWrap) {
        const card = document.createElement("div");
        card.className = "item-mobile-card";
        card.dataset.uid = item.uid;
        card.innerHTML = `
          <div class="item-mobile-header">
            <span class="item-mobile-badge">Item #${item.serial_number}</span>
            <button type="button" class="icon-btn remove-item-btn" title="Remove">✕ Remove</button>
          </div>

          <div class="item-mobile-field">
            <label>Item Name <span class="req">*</span></label>
            <input type="text" class="item-input" data-field="item_name" value="${this.escapeHtml(item.item_name)}" placeholder="e.g. Aloevera Soap" required />
          </div>

          <div class="item-mobile-row-2">
            <div class="item-mobile-field">
              <label>Pack Size</label>
              <input type="text" class="item-input" data-field="pack_size" value="${this.escapeHtml(item.pack_size)}" placeholder="e.g. 100ml" />
            </div>
            <div class="item-mobile-field">
              <label>Quantity <span class="req">*</span></label>
              <input type="number" class="item-input num-input qty-highlight" data-field="quantity" value="${item.quantity}" min="0" step="0.01" placeholder="0" required />
            </div>
          </div>

          <div class="item-mobile-field">
            <label>Formulation Reference</label>
            <input type="text" class="item-input" data-field="formulation_reference" value="${this.escapeHtml(item.formulation_reference)}" placeholder="e.g. Refer WO-2512" />
          </div>

          <div class="item-mobile-field">
            <label>Packaging &amp; Container</label>
            <input type="text" class="item-input" data-field="packaging_container" value="${this.escapeHtml(item.packaging_container)}" placeholder="e.g. PET Bottle" />
          </div>

          <div class="item-mobile-field">
            <label>Label &amp; Packaging Details</label>
            <input type="text" class="item-input" data-field="label_packaging_details" value="${this.escapeHtml(item.label_packaging_details)}" placeholder="e.g. Label + Monocarton" />
          </div>

          <div class="item-mobile-row-2">
            <div class="item-mobile-field">
              <label>Rate (₹) <span class="req">*</span></label>
              <input type="number" class="item-input num-input" data-field="rate" value="${item.rate}" min="0" step="0.01" placeholder="0.00" required />
            </div>
            <div class="item-mobile-field">
              <label>GST %</label>
              <select class="item-input gst-select" data-field="gst_percent">
                ${GST_OPTIONS.map(g => `<option value="${g}" ${g === item.gst_percent ? "selected" : ""}>${g}%</option>`).join("")}
              </select>
            </div>
          </div>

          <div class="item-mobile-summary">
            <div><span>Amount</span><strong class="amount-value">${formatCurrency(item.amount)}</strong></div>
            <div><span>GST</span><strong class="gst-value">${formatCurrency(gst)}</strong></div>
            <div class="total-row"><span>Item Total</span><strong class="total-value">${formatCurrency(total)}</strong></div>
          </div>
        `;
        mobileWrap.appendChild(card);
        this.bindItemRowEvents(card, item.uid);
      }
    });
  },

  bindItemRowEvents(container, uid) {
    container.querySelectorAll(".item-input").forEach(input => {
      const eventType = input.tagName === "SELECT" ? "change" : "input";
      input.addEventListener(eventType, e => {
        Orders.updateItemField(uid, e.target.dataset.field, e.target.value);
        this.syncItemUI(uid);
        this.renderTotals();
      });
    });

    const removeBtn = container.querySelector(".remove-item-btn");
    if (removeBtn) {
      removeBtn.addEventListener("click", () => {
        if (Orders.items.length <= 1) {
          alert("At least one item is required.");
          return;
        }
        Orders.removeItem(uid);
        this.renderItemsTable();
        this.renderTotals();
      });
    }
  },

  // Keep desktop row + mobile card in sync when either is edited
  syncItemUI(uid) {
    const item = Orders.items.find(i => i.uid === uid);
    if (!item) return;
    const gst = Orders.calcItemGST(item);
    const total = Orders.calcItemTotal(item);

    document.querySelectorAll(`[data-uid="${uid}"]`).forEach(container => {
      // Update all input values that aren't the one currently focused
      container.querySelectorAll(".item-input").forEach(input => {
        const field = input.dataset.field;
        if (document.activeElement === input) return; // don't fight the user's typing
        const val = item[field];
        if (input.value != val) input.value = val;
      });

      const amountEl = container.querySelector(".amount-value");
      const gstEl = container.querySelector(".gst-value");
      const totalEl = container.querySelector(".total-value");
      if (amountEl) amountEl.textContent = formatCurrency(item.amount);
      if (gstEl) gstEl.textContent = (gstEl.textContent.startsWith("+") ? "+GST: " : "") + formatCurrency(gst);
      if (totalEl) totalEl.textContent = (totalEl.textContent.startsWith("Total") ? "Total: " : "") + formatCurrency(total);
    });
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
      advance_payment: document.getElementById("advance-payment-input").value,
      additional_comments: document.getElementById("additional-comments-input").value,
      lead_source: document.getElementById("lead-source-input").value,
      ad_name: document.getElementById("ad-name-input").value,
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
      this.checkSupabaseConnection(); // re-verify and update stored-count display
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
    // Quotations have their own detail renderer (different fields / PDF)
    if (type === "quotation") {
      return this.openQuotationDetail(id);
    }

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
        <span class="order-type-badge ${isWorkOrder ? "badge-work-order" : "badge-sample-request"}">
          ${isWorkOrder ? "🛠️ PRODUCTION WORK ORDER" : "🧪 SAMPLE REQUEST"}
        </span>
        <h2>#${number}</h2>
        <div class="detail-grid">
          <div><strong>Company / Brand:</strong> ${this.escapeHtml(order.client_name)}</div>
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

        ${order.additional_comments ? `
        <div class="detail-comments">
          <h3>📝 Additional Comments</h3>
          <p>${this.escapeHtml(order.additional_comments).replace(/\n/g, "<br>")}</p>
        </div>` : ""}

        ${order.lead_source ? `
        <div class="detail-source-box">
          <h3>📣 Source / Ad Tracking</h3>
          <div class="detail-source-grid">
            ${order.lead_source ? `<div><strong>Lead Source:</strong> <span class="source-chip">${this.escapeHtml(order.lead_source)}</span></div>` : ""}
            ${order.ad_name ? `<div><strong>Ad / Campaign:</strong> <span>${this.escapeHtml(order.ad_name)}</span></div>` : ""}
          </div>
        </div>` : ""}

        <div class="modal-actions">
          <button class="btn btn-primary" id="download-pdf-btn">Download PDF</button>
          <button class="btn btn-secondary" id="print-view-btn">Print View</button>
        </div>
      `;

      document.getElementById("download-pdf-btn").addEventListener("click", async () => {
        try {
          if (type === "quotation") {
            await PDFGen.generateQuotation(order, items);
          } else {
            await PDFGen.generate(type, order, items);
          }
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
  },

  // ------------------------------------------------------
  // QUOTATION FORM (OPEN / POPULATE)

  // ------------------------------------------------------
  // QUOTATION DETAIL MODAL
  // (reuses the same modal as work orders / sample requests)
  // ------------------------------------------------------
  async openQuotationDetail(id) {
    const modal = document.getElementById("order-detail-modal");
    const body = document.getElementById("order-detail-body");
    body.innerHTML = `<div class="loading">Loading...</div>`;
    modal.classList.add("active");

    try {
      const q = await Orders.fetchOne("quotation", id);
      const items = await Orders.loadItems("quotation", id);
      const number = "Q-" + String(q.quotation_number).padStart(4, "0");
      const managerDisplay =
        q.client_manager === "Other" && q.other_manager_name
          ? q.other_manager_name
          : q.client_manager;

      body.innerHTML = `
        <span class="order-type-badge badge-quotation">💰 QUOTATION</span>
        <h2>${number}</h2>
        <div class="detail-grid">
          <div><strong>Company / Brand:</strong> ${this.escapeHtml(q.client_name)}</div>
          <div><strong>Contact Person:</strong> ${this.escapeHtml(q.contact_person || "—")}</div>
          <div><strong>Mobile:</strong> ${this.escapeHtml(q.mobile_number || "—")}</div>
          <div><strong>Email:</strong> ${this.escapeHtml(q.email || "—")}</div>
          <div><strong>Client Manager:</strong> ${this.escapeHtml(managerDisplay || "—")}</div>
          <div><strong>Quote Date:</strong> ${formatDate(q.quote_date)}</div>
          <div><strong>Validity:</strong> ${this.escapeHtml(q.quote_validity || "—")}</div>
          <div class="full-width"><strong>Address:</strong> ${this.escapeHtml(q.address || "—")}</div>
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
          <div><span>Subtotal:</span> <strong>${formatCurrency(q.subtotal)}</strong></div>
          <div><span>Total GST:</span> <strong>${formatCurrency(q.total_gst)}</strong></div>
          <div><span>Grand Total:</span> <strong>${formatCurrency(q.grand_total)}</strong></div>
        </div>

        ${q.terms_and_conditions ? `
        <div class="detail-comments" style="border-color:#c9ad8c;background:#fffaf0;">
          <h3>📜 Terms &amp; Conditions</h3>
          <p>${this.escapeHtml(q.terms_and_conditions).replace(/\n/g, "<br>")}</p>
        </div>` : ""}

        ${q.lead_source ? `
        <div class="detail-source-box">
          <h3>📣 Source / Ad Tracking</h3>
          <div class="detail-source-grid">
            ${q.lead_source ? `<div><strong>Lead Source:</strong> <span class="source-chip">${this.escapeHtml(q.lead_source)}</span></div>` : ""}
            ${q.ad_name ? `<div><strong>Ad / Campaign:</strong> <span>${this.escapeHtml(q.ad_name)}</span></div>` : ""}
          </div>
        </div>` : ""}

        <div class="modal-actions">
          <button class="btn btn-primary" id="download-pdf-btn">📄 Download PDF</button>
          <button class="btn btn-secondary" id="print-view-btn">🖨️ Print</button>
          <button class="btn btn-convert" id="convert-to-wo-btn">🔄 Convert to Work Order</button>
        </div>
      `;

      document.getElementById("download-pdf-btn").addEventListener("click", async () => {
        try {
          await PDFGen.generateQuotation(q, items);
        } catch (err) {
          alert("Failed to generate PDF: " + this.errMsg(err));
        }
      });

      document.getElementById("print-view-btn").addEventListener("click", () => window.print());

      document.getElementById("convert-to-wo-btn").addEventListener("click", async () => {
        const dueDate = prompt(
          `Convert Quotation Q-${String(q.quotation_number).padStart(4,"0")} to Work Order.\n\nEnter Due Date (YYYY-MM-DD):`,
          new Date(Date.now() + 7*24*60*60*1000).toISOString().split("T")[0]
        );
        if (!dueDate || !dueDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          alert("Invalid date. Please enter in YYYY-MM-DD format (e.g. 2025-02-15).");
          return;
        }
        try {
          await this.convertQuotationToWorkOrder(q, items, dueDate);
          document.getElementById("order-detail-modal").classList.remove("active");
        } catch (err) {
          alert("Conversion failed: " + this.errMsg(err));
        }
      });

    } catch (err) {
      console.error(err);
      body.innerHTML = `<div class="error-banner">Failed to load quotation: ${this.errMsg(err)}</div>`;
    }
  },

  // ------------------------------------------------------
  // CONVERT QUOTATION → WORK ORDER
  // ------------------------------------------------------
  async convertQuotationToWorkOrder(quotation, items, dueDate) {
    // Build a work order payload from the quotation's data
    const formData = {
      order_date: todayISO(),
      due_date: dueDate,
      client_name: quotation.client_name,
      contact_person: quotation.contact_person,
      mobile_number: quotation.mobile_number,
      email: quotation.email,
      address: quotation.address,
      client_manager: quotation.client_manager,
      other_manager_name: quotation.other_manager_name,
      status: "Pending",
      advance_payment: 0,
      additional_comments: quotation.terms_and_conditions
        ? "Converted from Quotation Q-" + String(quotation.quotation_number).padStart(4,"0") +
          "\n\nOriginal T&C: " + quotation.terms_and_conditions
        : "Converted from Quotation Q-" + String(quotation.quotation_number).padStart(4,"0"),
      lead_source: quotation.lead_source || null,
      ad_name: quotation.ad_name || null
    };

    // Re-use Orders module items list
    Orders.resetItems();
    items.forEach(it => Orders.addItem(it));

    const result = await Orders.saveWorkOrder(formData);

    alert(
      `✅ Work Order #${result.order_number} created successfully!\n\n` +
      `Company: ${quotation.client_name}\n` +
      `Due Date: ${formatDate(dueDate)}\n\n` +
      `The original Quotation remains stored.`
    );

    await this.navigateTo("work-orders");
  }
};

// ------------------------------------------------------
// BOOTSTRAP
// ------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  App.init();
});
