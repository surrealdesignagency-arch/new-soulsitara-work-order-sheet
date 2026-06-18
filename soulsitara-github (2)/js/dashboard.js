// ==========================================================
// Dashboard Module
// ==========================================================

const Dashboard = {
  monthlyChart: null,
  managerChart: null,

  async loadStats() {
    const [workOrders, sampleRequests] = await Promise.all([
      Orders.fetchWorkOrders(),
      Orders.fetchSampleRequests()
    ]);

    const allOrders = [
      ...workOrders.map(o => ({ ...o, _type: "work_order" })),
      ...sampleRequests.map(o => ({ ...o, _type: "sample_request" }))
    ];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    let dueToday = 0;
    let dueThisWeek = 0;
    let overdue = 0;
    let totalRevenue = 0;

    allOrders.forEach(o => {
      const due = new Date(o.due_date);
      due.setHours(0, 0, 0, 0);

      if (!["Dispatched", "Delivered"].includes(o.status)) {
        if (due.getTime() === today.getTime()) dueToday++;
        if (due >= today && due <= endOfWeek) dueThisWeek++;
        if (due < today) overdue++;
      }

      totalRevenue += Number(o.grand_total) || 0;
    });

    return {
      totalWorkOrders: workOrders.length,
      totalSampleRequests: sampleRequests.length,
      totalRevenue: round2(totalRevenue),
      dueToday,
      dueThisWeek,
      overdue,
      workOrders,
      sampleRequests
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
  }
};
