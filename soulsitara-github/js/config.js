// ==========================================================
// SoulSitara Wellness ERP - Configuration
// Replace these with your actual Supabase project values.
// Project Settings -> API -> Project URL / anon public key
// ==========================================================

const SUPABASE_CONFIG = {
  url: "https://efhilasiiemhpzzihggj.supabase.co",
  anonKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVmaGlsYXNpaWVtaHB6emloZ2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExNzM2NjgsImV4cCI6MjA5Njc0OTY2OH0.A2xcfEuMEspetkdasklTfa3ERI0Y-Quhgvspmdr81Nk"
};

const COMPANY_INFO = {
  name: "SOULSITARA WELLNESS PRODUCTS PVT LTD",
  address: "NO. 42/1, BLOCK A AND B, SAMYGOUNDANPALAYAM, WEST STREET, NASIYANUR, TAMIL NADU - 638107, INDIA",
  gstin: "33ABJCS6754NZO",
  mobile: "88383 03139",
  brandColor: "#9a7d5f",
  logo: "assets/logo.png"
};

const CLIENT_MANAGERS = ["Gowtham", "Priyanka", "Other"];

const STATUS_OPTIONS = [
  "Pending",
  "Formulation",
  "Production",
  "Packaging",
  "Quality Check",
  "Ready",
  "Dispatched",
  "Delivered"
];

const GST_OPTIONS = [0, 5, 18];
