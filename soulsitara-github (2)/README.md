# SoulSitara Wellness — Work Order & Sample Request Management System

A production-ready SaaS application for **SOULSITARA WELLNESS PRODUCTS PVT LTD** to manage Work Orders, Sample Requests, Production Status, and Revenue Reporting with shared real-time access for employees.

---

## 1. Tech Stack

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend / DB:** Supabase (PostgreSQL)
- **Auth:** Supabase Email Authentication
- **Realtime:** Supabase Realtime (Postgres changes)
- **Deployment:** GitHub + Vercel

---

## 2. Project Structure

```
soulsitara/
├── index.html          # Main app (SPA - login, dashboard, orders, samples, PDF)
├── css/
│   └── style.css       # All styling, brand color #9a7d5f, responsive
├── js/
│   ├── config.js       # Supabase URL/Key (from env)
│   ├── supabaseClient.js
│   ├── auth.js
│   ├── dashboard.js
│   ├── orders.js
│   ├── samples.js
│   ├── pdf.js
│   └── app.js           # Router / bootstrapping
├── assets/
│   └── logo.png         # Company logo (Sitara Group)
├── supabase-schema.sql
├── .env.example
└── README.md
```

---

## 3. Supabase Setup Guide

1. Go to https://supabase.com and create a new project (e.g. `soulsitara-erp`).
2. In the SQL editor, run the entire contents of **supabase-schema.sql**. This creates:
   - `profiles` (employee roles)
   - `work_orders`, `sample_requests`, `order_items`
   - sequences for auto-numbering (Work Orders start at 2501, Samples start at 1)
   - Row Level Security (RLS) policies for shared access
3. Go to **Authentication → Providers** and ensure **Email** is enabled.
4. Go to **Authentication → Users** and manually invite/create employees:
   - `gowtham@company.com`
   - `priyanka@company.com`
   - Set a temporary password for each; ask them to change it on first login.
5. After each user signs up/is created, insert a row into `profiles` with their `id`, `email`, `full_name`, and `role` (`admin` or `employee`). Example:
   ```sql
   insert into profiles (id, email, full_name, role)
   values ('<auth-user-uuid>', 'gowtham@company.com', 'Gowtham', 'employee');
   ```
6. Go to **Project Settings → API** and copy:
   - `Project URL`
   - `anon public` key
7. Enable **Realtime** for `work_orders`, `sample_requests`, and `order_items` tables (Database → Replication → toggle on).

---

## 4. Environment Variables

Copy `.env.example` to `.env` (used only as reference — since this is a static frontend, values are placed directly into `js/config.js`):

```
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_PUBLIC_KEY
```

Edit `js/config.js` and replace the placeholder values with the above.

---

## 5. GitHub Upload Guide

```bash
cd soulsitara
git init
git add .
git commit -m "Initial commit - SoulSitara Wellness ERP"
git branch -M main
git remote add origin https://github.com/<your-username>/soulsitara-erp.git
git push -u origin main
```

---

## 6. Vercel Deployment Guide

1. Go to https://vercel.com → **Add New Project** → Import the GitHub repo `soulsitara-erp`.
2. Framework Preset: **Other** (static site).
3. Build Command: *(leave empty)*
4. Output Directory: `.` (root)
5. Click **Deploy**.
6. After deployment, open the live URL and log in with an employee account created in Supabase.

> Note: Since `js/config.js` contains the Supabase anon key (which is safe to expose — it's protected by RLS), no environment variable injection is required. For stricter setups, you may wire Vercel environment variables + a small build step to inject these values.

---

## 7. User Roles

| Feature | Admin/Owner | Employee |
|---|---|---|
| View all orders & samples | ✅ | ✅ |
| Create orders/samples | ✅ | ✅ |
| Update status | ✅ | ✅ |
| Edit orders | ✅ | ❌ |
| Delete orders | ✅ | ❌ |
| View dashboard & revenue reports | ✅ | ✅ (revenue hidden) |

---

## 8. Numbering System

- **Work Orders**: start at `2501`, auto-increment (2501, 2502, 2503…) via DB sequence.
- **Sample Requests**: start at `1`, auto-increment (1, 2, 3…) via separate DB sequence.
- Both are concurrency-safe (DB sequences avoid duplicate numbers across simultaneous users).

---

## 9. GST & Calculations

- Allowed GST: `0%`, `5%`, `18%`
- `Amount = Quantity × Rate`
- `GST Amount = Amount × GST%`
- `Line Total = Amount + GST Amount`
- `Subtotal = Σ Amount`
- `Total GST = Σ GST Amount`
- `Grand Total = Subtotal + Total GST`
- `Balance = Grand Total - Advance Payment`

All calculations are done live in JS on input change and re-validated before saving.

---

## 10. Due Date Color Coding

- 🟢 **Green** — more than 7 days remaining
- 🟠 **Orange** — due within 3 days
- 🔴 **Red** — overdue

---

## 11. Support

Company: SOULSITARA WELLNESS PRODUCTS PVT LTD
GSTIN: 33ABJCS6754NZO
Mobile: 88383 03139
