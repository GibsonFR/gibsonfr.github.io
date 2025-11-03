async function initializeAuthBar() {
  try {
    const client = typeof supabaseClient !== "undefined"
      ? supabaseClient
      : supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const host = document.getElementById("authbar");
    if (!host) {
      return;
    }
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      host.innerHTML = `
        <div class="flex items-center justify-end">
          <button id="btnDiscord"
                  class="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-sm">
            Sign in with Discord
          </button>
        </div>`;
      const discordButton = document.getElementById("btnDiscord");
      if (discordButton) {
        discordButton.onclick = () => {
          client.auth.signInWithOAuth({
            provider: "discord",
            options: { redirectTo: location.href }
          });
        };
      }
      return;
    }
    const metadata = user.user_metadata || {};
    const username = metadata.name || metadata.full_name || "Account";
    host.innerHTML = `
      <div class="flex items-center justify-end gap-2">
        <span class="text-sm text-slate-300">${username}</span>
        <a href="account.html"
           class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm hover:bg-slate-700">
          Account
        </a>
        <button id="btnSignout"
                class="px-2 py-1 rounded bg-slate-800 border border-slate-700 text-sm hover:bg-slate-700">
          Sign out
        </button>
      </div>`;
    const signoutButton = document.getElementById("btnSignout");
    if (signoutButton) {
      signoutButton.onclick = async () => {
        await client.auth.signOut();
        location.reload();
      };
    }
  } catch (error) {
    console.error("[authbar]", error);
  }
}

document.addEventListener("DOMContentLoaded", initializeAuthBar);
