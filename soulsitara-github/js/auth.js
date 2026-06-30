// ==========================================================
// Authentication Module
// ==========================================================

const Auth = {
  currentUser: null,
  currentProfile: null,

  async init() {
    // Check if Supabase credentials are still placeholders
    if (
      SUPABASE_CONFIG.url.includes("YOUR-PROJECT-REF") ||
      SUPABASE_CONFIG.anonKey.includes("YOUR_ANON_PUBLIC_KEY")
    ) {
      showSetupBanner();
      return null;
    }

    try {
      const { data: { session }, error } = await supabaseClient.auth.getSession();
      if (error) {
        console.error("Session error:", error);
        return null;
      }
      if (session) {
        this.currentUser = session.user;
        await this.loadProfile();
      }
      return session;
    } catch (err) {
      console.error("Init error:", err);
      return null;
    }
  },

  async loadProfile() {
    if (!this.currentUser) return null;
    try {
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("*")
        .eq("id", this.currentUser.id)
        .single();

      if (error) {
        console.error("Profile load error:", error);
        this.currentProfile = {
          id: this.currentUser.id,
          email: this.currentUser.email,
          full_name: this.currentUser.email,
          role: "employee"
        };
        return this.currentProfile;
      }
      this.currentProfile = data;
      return data;
    } catch (err) {
      console.error("Profile fetch exception:", err);
      this.currentProfile = {
        id: this.currentUser.id,
        email: this.currentUser.email,
        full_name: this.currentUser.email,
        role: "employee"
      };
      return this.currentProfile;
    }
  },

  async login(email, password, remember) {
    // Guard: placeholder credentials
    if (
      SUPABASE_CONFIG.url.includes("YOUR-PROJECT-REF") ||
      SUPABASE_CONFIG.anonKey.includes("YOUR_ANON_PUBLIC_KEY")
    ) {
      return {
        success: false,
        message: "⚠️ Supabase is not configured yet. Please edit js/config.js with your real Project URL and Anon Key."
      };
    }

    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (error) {
        return { success: false, message: this.friendlyError(error) };
      }
      this.currentUser = data.user;
      await this.loadProfile();

      if (remember) {
        localStorage.setItem("ss_remember_email", email.trim());
      } else {
        localStorage.removeItem("ss_remember_email");
      }
      return { success: true };
    } catch (err) {
      console.error("Login exception:", err);
      return { success: false, message: this.friendlyError(err) };
    }
  },

  async logout() {
    try {
      await supabaseClient.auth.signOut();
    } catch (e) {
      console.warn("Logout error:", e);
    }
    this.currentUser = null;
    this.currentProfile = null;
  },

  getRememberedEmail() {
    return localStorage.getItem("ss_remember_email") || "";
  },

  isAdmin() {
    return this.currentProfile && this.currentProfile.role === "admin";
  },

  isLoggedIn() {
    return !!this.currentUser;
  },

  friendlyError(error) {
    if (!error) return "Login failed. Please try again.";
    const msg = (error.message || "").toLowerCase();

    if (msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("fetch")) {
      return "❌ Cannot connect to Supabase.\n\nPossible causes:\n• Wrong Project URL in js/config.js\n• No internet connection\n• Supabase project is paused\n\nFix: Open js/config.js and enter your real Supabase URL and Anon Key.";
    }
    if (msg.includes("invalid login credentials") || msg.includes("invalid credentials")) {
      return "Incorrect email or password. Please try again.";
    }
    if (msg.includes("email not confirmed")) {
      return "Please confirm your email address before logging in.";
    }
    if (msg.includes("too many requests")) {
      return "Too many login attempts. Please wait a few minutes and try again.";
    }
    if (msg.includes("user not found")) {
      return "No account found with this email address.";
    }
    if (msg.includes("network") || msg.includes("connection")) {
      return "Network error. Please check your internet connection and try again.";
    }
    return error.message || "Login failed. Please try again.";
  },

  onAuthStateChange(callback) {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      callback(event, session);
    });
  }
};

// Show a prominent setup banner on the login screen
function showSetupBanner() {
  const existing = document.getElementById("setup-banner");
  if (existing) return;

  const banner = document.createElement("div");
  banner.id = "setup-banner";
  banner.innerHTML = `
    <div style="
      background: #fff3cd;
      border: 2px solid #f9a825;
      border-radius: 10px;
      padding: 18px 20px;
      margin-bottom: 20px;
      text-align: left;
      font-size: 13px;
      line-height: 1.7;
      color: #5d4037;
    ">
      <strong style="font-size:15px;">⚙️ Setup Required</strong><br><br>
      The app is not connected to a database yet.<br>
      Edit <code style="background:#fef9c3;padding:2px 5px;border-radius:4px;">js/config.js</code> and replace:<br><br>
      <code style="background:#fef9c3;padding:4px 8px;border-radius:4px;display:block;margin:4px 0;">url: "https://YOUR-PROJECT-REF.supabase.co"</code>
      <code style="background:#fef9c3;padding:4px 8px;border-radius:4px;display:block;margin:4px 0;">anonKey: "YOUR_ANON_PUBLIC_KEY"</code><br>
      👉 Get these from <a href="https://supabase.com/dashboard" target="_blank" style="color:#7d6249">supabase.com/dashboard</a> →
      Your Project → Settings → API
    </div>
  `;

  const loginCard = document.querySelector(".login-card");
  if (loginCard) {
    loginCard.insertBefore(banner, loginCard.querySelector("form"));
  }
}
