import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  followUpKey,
  followUpToTaskBody,
  isActionableFollowUp,
  isFollowUpOnBoard,
  loadClearedFollowUpKeys,
  normalizeFollowUpTitle,
  openFollowUps,
  saveClearedFollowUpKeys,
  withClearedFollowUp,
  withClearedFollowUps,
} from "./followups.js";

const item = {
  text: "  Review logs and environmental variables.  ",
  rel_path: "ge_vernova/GEVernova_Observability/2026-09-08T10-32-32.txt",
  account: "ge_vernova",
  poc: "GEVernova_Observability",
  started_at: "2026-09-08T10:32:32",
};

describe("followUpToTaskBody", () => {
  it("maps a Scrappy follow-up onto a Fielder createTask payload", () => {
    const body = followUpToTaskBody(item, {
      pocId: 3,
      account: "ge_vernova",
      stage: "backlog",
    });
    assert.equal(body.title, "Review logs and environmental variables.");
    assert.match(body.description, /From meeting 2026-09-08 10:32/);
    assert.match(body.description, /GEVernova_Observability/);
    assert.equal(body.account, "ge_vernova");
    assert.equal(body.pocId, 3);
    assert.equal(body.stage, "backlog");
    assert.equal(body.workstream, "misc");
    assert.equal(body.source, "scrappy");
    assert.deepEqual(body.labels, ["meeting"]);
  });

  it("omits pocId when attaching to an account", () => {
    const body = followUpToTaskBody(item, { account: "ge_vernova" });
    assert.equal(body.pocId, null);
    assert.equal(body.account, "ge_vernova");
  });

  it("returns null for empty text", () => {
    assert.equal(followUpToTaskBody({ text: "   " }, { pocId: 3 }), null);
  });
});

describe("isFollowUpOnBoard", () => {
  it("matches an existing card on the same account by title", () => {
    const tasks = [
      { account: "ge_vernova", title: "Review logs and environmental variables." },
      { account: "ge_aerospace", title: "Review logs and environmental variables." },
    ];
    assert.equal(isFollowUpOnBoard(item, tasks, { account: "ge_vernova" }), true);
    assert.equal(isFollowUpOnBoard(item, tasks, { account: "travelers" }), false);
    assert.equal(isFollowUpOnBoard(item, tasks, null), false);
    assert.equal(normalizeFollowUpTitle("  a   b "), "a b");
  });
});

describe("isActionableFollowUp", () => {
  it("keeps concrete account actions", () => {
    assert.equal(isActionableFollowUp(item), true);
  });

  it("drops live-captions and vague attendee lines", () => {
    assert.equal(
      isActionableFollowUp({
        ...item,
        account: "live-captions",
        text: "Send an update to the team",
      }),
      false
    );
    assert.equal(
      isActionableFollowUp({
        ...item,
        text: "Attendees to review and discuss further.",
      }),
      false
    );
    assert.equal(
      isActionableFollowUp({
        ...item,
        text: "Schedule a follow-up meeting to discuss next steps.",
      }),
      false
    );
  });
});

describe("cleared follow-ups", () => {
  const other = { ...item, text: "Send the PDF" };

  it("hides a cleared item and keeps others", () => {
    const keys = withClearedFollowUp([], item);
    assert.equal(keys[0], followUpKey(item));
    const open = openFollowUps([item, other], keys);
    assert.deepEqual(
      open.map((it) => it.text),
      ["Send the PDF"]
    );
  });

  it("clears a batch without duplicating keys", () => {
    const keys = withClearedFollowUps([followUpKey(item)], [item, other]);
    assert.equal(keys.length, 2);
    assert.deepEqual(openFollowUps([item, other], keys), []);
  });

  it("persists cleared keys through a storage object", () => {
    const memory = new Map();
    const storage = {
      getItem: (key) => (memory.has(key) ? memory.get(key) : null),
      setItem: (key, value) => memory.set(key, String(value)),
    };
    const saved = saveClearedFollowUpKeys(withClearedFollowUp([], item), storage);
    assert.deepEqual(loadClearedFollowUpKeys(storage), saved);
  });

  it("ignores empty follow-up text", () => {
    assert.deepEqual(withClearedFollowUp([], { ...item, text: "   " }), []);
  });
});
