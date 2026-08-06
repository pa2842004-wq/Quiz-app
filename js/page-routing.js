export function resolvePageView(page, session) {
  if (page !== "quiz") {
    return "home";
  }

  if (!session) {
    return "redirect-home";
  }

  return session.submitted ? "results" : "quiz";
}
