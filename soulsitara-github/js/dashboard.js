// ==========================================================
// Dashboard Module
// ==========================================================

const Dashboard = {
  monthlyChart: null,
  managerChart: null,

  async loadStats() {
    const [workOrders, sampleRequests, quotations] = await Promise.all([
      Orders.fetchWorkOrders(),
      Orders.fetchSampleRequests(),
      Orders.fetchQuotations()
    ]);

    const allOrders = [
      ...workOrders.map(o => ({ ...o, _type: "work_order" })),
      ...sampleRequests.map(o => ({ ...o, _type: "sample_request" }))
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const endOfMonth   = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    let dueToday = 0;
    let dueYesterday = 0;
    let dueThisWeek = 0;
    let dueThisMonth = 0;
    let overdue = 0;
    let totalRevenue = 0;

    allOrders.forEach(o => {
      const due = new Date(o.due_date);
      due.setHours(0, 0, 0, 0);
      const active = !["Dispatched", "Delivered"].includes(o.status);

      if (active) {
        if (due.getTime() === today.getTime())     dueToday++;
        if (due.getTime() === yesterday.getTime()) dueYesterday++;
        if (due >= today && due <= endOfWeek)       dueThisWeek++;
        if (due >= startOfMonth && due <= endOfMonth) dueThisMonth++;
        if (due < today)                            overdue++;
      }

      totalRevenue += Number(o.grand_total) || 0;
    });

    return {
      totalWorkOrders: workOrders.length,
      totalSampleRequests: sampleRequests.length,
      totalQuotations: quotations.length,
      totalRevenue: round2(totalRevenue),
      dueToday, dueYesterday, dueThisWeek, dueThisMonth, overdue,
      workOrders, sampleRequests, quotations
    };
  },

  buildMonthlyRevenue(workOrders, sampleRequests) {
    const allOrders = [...workOrders, ...sampleRequests];
    const monthly = {};

    allOrders.forEach(o => {
      if (!o.order_date) return;
      const d = new Date(o.order_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (!monthly[key]) monthly[key] = 0;
      monthly[key] += Number(o.grand_total) || 0;
    });

    const sortedKeys = Object.keys(monthly).sort();
    const labels = sortedKeys.map(k => {
      const [y, m] = k.split("-");
      const date = new Date(parseInt(y), parseInt(m) - 1);
      return date.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    });
    const data = sortedKeys.map(k => round2(monthly[k]));

    return { labels, data };
  },

  buildManagerPerformance(workOrders, sampleRequests) {
    const allOrders = [...workOrders, ...sampleRequests];
    const managers = {};

    allOrders.forEach(o => {
      let name = o.client_manager || "Unknown";
      if (name === "Other" && o.other_manager_name) {
        name = o.other_manager_name;
      }
      if (!managers[name]) managers[name] = { count: 0, revenue: 0 };
      managers[name].count += 1;
      managers[name].revenue += Number(o.grand_total) || 0;
    });

    const labels = Object.keys(managers);
    const counts = labels.map(l => managers[l].count);
    const revenues = labels.map(l => round2(managers[l].revenue));

    return { labels, counts, revenues };
  },

  renderMonthlyChart(canvasId, chartData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (this.monthlyChart) {
      this.monthlyChart.destroy();
    }

    this.monthlyChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: "Monthly Revenue (₹)",
            data: chartData.data,
            borderColor: "#9a7d5f",
            backgroundColor: "rgba(154,125,95,0.15)",
            tension: 0.3,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: "#9a7d5f"
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top" }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: value => "₹" + value.toLocaleString("en-IN")
            }
          }
        }
      }
    });
  },

  renderManagerChart(canvasId, chartData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (this.managerChart) {
      this.managerChart.destroy();
    }

    this.managerChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels: chartData.labels,
        datasets: [
          {
            label: "Orders Handled",
            data: chartData.counts,
            backgroundColor: "#c9ad8c",
            borderRadius: 6
          },
          {
            label: "Revenue (₹)",
            data: chartData.revenues,
            backgroundColor: "#9a7d5f",
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "top" }
        },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
  },

  // ── SOURCE / AD ANALYTICS ────────────────────────────────

  sourceChart: null,

  renderSourceChart(canvasId, allOrders) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (this.sourceChart) { this.sourceChart.destroy(); }

    // Count orders per lead_source
    const sources = {};
    allOrders.forEach(o => {
      const src = (o.lead_source && o.lead_source.trim())
        ? o.lead_source.trim()
        : "No Ad Specified";
      sources[src] = (sources[src] || 0) + 1;
    });

    // Sort by count descending
    const sorted = Object.entries(sources).sort((a, b) => b[1] - a[1]);
    const labels = sorted.map(s => s[0]);
    const data   = sorted.map(s => s[1]);

    const COLORS = [
      "#9a7d5f","#3949ab","#1b7a72","#b45309","#c62828",
      "#6a1b9a","#2e7d32","#f9a825","#00838f","#ad1457"
    ];

    this.sourceChart = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data,
          backgroundColor: COLORS.slice(0, labels.length),
          borderWidth: 2,
          borderColor: "#fff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: "right", labels: { font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ${ctx.raw} order${ctx.raw !== 1 ? "s" : ""}`
            }
          }
        }
      }
    });
  },

  // ── MARKETING ANALYTICS ──────────────────────────────────

  // Build source/ad analytics from all orders
  buildMarketingData(allOrders) {
    const bySource = {};
    const byAd = {};

    allOrders.forEach(o => {
      const src = (o.lead_source && o.lead_source.trim()) ? o.lead_source.trim() : null;
      const ad  = (o.ad_name    && o.ad_name.trim())    ? o.ad_name.trim()    : null;
      const rev = Number(o.grand_total) || 0;

      if (src) {
        if (!bySource[src]) bySource[src] = { orders: 0, revenue: 0 };
        bySource[src].orders++;
        bySource[src].revenue = round2(bySource[src].revenue + rev);
      }
      if (ad) {
        if (!byAd[ad]) byAd[ad] = { orders: 0, revenue: 0 };
        byAd[ad].orders++;
        byAd[ad].revenue = round2(byAd[ad].revenue + rev);
      }
    });

    return {
      bySource: Object.entries(bySource).sort((a,b) => b[1].orders - a[1].orders),
      byAd:     Object.entries(byAd).sort((a,b) => b[1].orders - a[1].orders)
    };
  },

  CHART_COLORS: [
    "#9a7d5f","#1565c0","#2e7d32","#b45309","#c62828",
    "#6a1b9a","#00838f","#f9a825","#ad1457","#37474f"
  ],

  sourceOrderChart: null,
  sourceRevenueChart: null,
  adOrderChart: null,
  adRevenueChart: null,

  renderMarketingCharts(containerId, allOrders) {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;

    const data = this.buildMarketingData(allOrders);

    if (data.bySource.length === 0 && data.byAd.length === 0) {
      wrap.innerHTML = `<div class="marketing-empty">
        <p>📊 No lead source or ad data yet.</p>
        <p>Add <strong>Lead Source</strong> and <strong>Ad Name</strong> when creating orders to see analytics here.</p>
      </div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="marketing-grid">
        <div class="chart-card">
          <h3>📱 Orders by Lead Source</h3>
          <div class="chart-wrap"><canvas id="source-order-chart"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>💰 Revenue by Lead Source</h3>
          <div class="chart-wrap"><canvas id="source-revenue-chart"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>📣 Orders by Ad / Campaign</h3>
          <div class="chart-wrap"><canvas id="ad-order-chart"></canvas></div>
        </div>
        <div class="chart-card">
          <h3>💵 Revenue by Ad / Campaign</h3>
          <div class="chart-wrap"><canvas id="ad-revenue-chart"></canvas></div>
        </div>
        <div class="chart-card full-width-card">
          <h3>📋 Ad / Campaign Summary</h3>
          <div id="ad-stats-table-wrap"></div>
        </div>
      </div>
    `;

    // Source orders — doughnut
    if (data.bySource.length > 0) {
      this.renderDoughnut("source-order-chart",
        data.bySource.map(s => s[0]),
        data.bySource.map(s => s[1].orders),
        "Orders"
      );
      this.renderBarChart("source-revenue-chart",
        data.bySource.map(s => s[0]),
        data.bySource.map(s => s[1].revenue),
        "Revenue (Rs.)"
      );
    }

    // Ad name charts
    if (data.byAd.length > 0) {
      this.renderBarChart("ad-order-chart",
        data.byAd.map(a => a[0]),
        data.byAd.map(a => a[1].orders),
        "Orders"
      );
      this.renderBarChart("ad-revenue-chart",
        data.byAd.map(a => a[0]),
        data.byAd.map(a => a[1].revenue),
        "Revenue (Rs.)"
      );

      // Summary table
      const rows = data.byAd.map(([ad, d], i) => `
        <tr>
          <td>${i + 1}</td>
          <td><strong>${ad}</strong></td>
          <td class="num-cell">${d.orders}</td>
          <td class="num-cell">${formatCurrency(d.revenue)}</td>
        </tr>`).join("");

      document.getElementById("ad-stats-table-wrap").innerHTML = `
        <table class="analytics-table">
          <thead><tr><th>#</th><th>Ad / Campaign Name</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>`;
    }
  },

  renderDoughnut(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: "doughnut",
      data: {
        labels,
        datasets: [{ data, backgroundColor: this.CHART_COLORS.slice(0, labels.length), borderWidth: 2, borderColor: "#fff" }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { font: { size: 11 }, boxWidth: 12 } },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${c.raw} ${label}` } }
        }
      }
    });
  },

  renderBarChart(canvasId, labels, data, label) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    return new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label, data, backgroundColor: this.CHART_COLORS, borderRadius: 4 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, ticks: { callback: v => "Rs." + v.toLocaleString("en-IN") } } }
      }
    });
  }

};
