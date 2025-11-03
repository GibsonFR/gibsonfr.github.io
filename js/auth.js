const authBar = (function() {
  async function renderAuthBar() {
    try {
      if (typeof supabaseClient === "undefined") {
        console.error("supabaseClient is not available");
        return;
      }
      const authbarHost = document.getElementById("authbar");
      if (!authbarHost) {
        return;
      }
      const result = await supabaseClient.auth.getUser();
      const user = result && result.data ? result.data.user : null;
      if (!user) {
        authbarHost.innerHTML = `
        <div class="flex items-center justify-end">
          <button
            id="discordSignInButton"
            class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm"
          >
            Sign in with Discord
          </button>
        </div>
      `;
        const discordButton = document.getElementById("discordSignInButton");
        discordButton.onclick = function() {
          supabaseClient.auth.signInWithOAuth({
            provider: "discord",
            options: { redirectTo: window.location.href }
          });
        };
        return;
      }
      const metadata = user.user_metadata || {};
      const displayName = metadata.name || metadata.full_name || "Account";
      authbarHost.innerHTML = `
        <div class="flex items-center justify-end gap-2">
          <span class="text-sm text-slate-300">${escapeHtml(displayName)}</span>
          <a
            href="account.html"
            class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm hover:bg-slate-700"
          >
            Account
          </a>
          <button
            id="signOutButton"
            class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm hover:bg-slate-700"
          >
            Sign out
          </button>
        </div>
      `;
      const signOutButton = document.getElementById("signOutButton");
      signOutButton.onclick = async function() {
        await supabaseClient.auth.signOut();
        window.location.reload();
      };
    } catch (error) {
      console.error("renderAuthBar error", error);
    }
  }

  return {
    renderAuthBar
  };
})();

window.authBar = authBar;
