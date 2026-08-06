import test from "node:test";
import assert from "node:assert/strict";

import { resolvePageView } from "../js/page-routing.js";

test("home page never auto-renders quiz or results", () => {
  assert.equal(resolvePageView("home", null), "home");
  assert.equal(resolvePageView("home", { submitted: false }), "home");
  assert.equal(resolvePageView("home", { submitted: true }), "home");
});

test("quiz page redirects home when there is no active session", () => {
  assert.equal(resolvePageView("quiz", null), "redirect-home");
});

test("quiz page renders the active quiz for an unfinished session", () => {
  assert.equal(resolvePageView("quiz", { submitted: false }), "quiz");
});

test("quiz page renders results for a submitted session", () => {
  assert.equal(resolvePageView("quiz", { submitted: true }), "results");
});
