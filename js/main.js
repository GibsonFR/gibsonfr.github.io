function initializeApp() {
  if (window.authBar && typeof window.authBar.renderAuthBar === "function") {
    window.authBar.renderAuthBar();
  }
  if (window.leaderboardService && typeof window.leaderboardService.initializeLeaderboardPage === "function") {
    window.leaderboardService.initializeLeaderboardPage();
  }
  if (window.matchesService && typeof window.matchesService.loadRecentMatches === "function") {
    window.matchesService.loadRecentMatches();
  }
  if (window.premiumService && typeof window.premiumService.initializePremiumMarkers === "function") {
    window.premiumService.initializePremiumMarkers().then(function() {
      if (window.leaderboardService && typeof window.leaderboardService.reload === "function") {
        window.leaderboardService.reload(false);
      }
    });
  }
}

document.addEventListener("DOMContentLoaded", initializeApp);
