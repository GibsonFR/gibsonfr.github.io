function escapeHtml(value) {
  return (value || "").replace(/[&<>"']/g, function(char) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      """: "&quot;",
      "'": "&#39;"
    }[char];
  });
}
