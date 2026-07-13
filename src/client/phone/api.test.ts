import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneActionRejectedError, sendPlayerAction } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendPlayerAction failure semantics", () => {
  it("throws PhoneActionRejectedError on a definitive 4xx rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ error: "It is not your detective's turn" }),
    })));
    await expect(
      sendPlayerAction("p1", "token", "turn_action", { action: "use_secret_passage" })
    ).rejects.toThrowError(PhoneActionRejectedError);
    await expect(
      sendPlayerAction("p1", "token", "turn_action", { action: "use_secret_passage" })
    ).rejects.toThrow(/not your detective/i);
  });

  it("treats a 5xx as ambiguous, never as a definitive rejection", async () => {
    // Post-create D1 work (touchPlayer/getSession) can throw after the event
    // was created, so a 500 does not prove the event is absent.
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal error" }),
    })));
    const failure = await sendPlayerAction("p1", "token", "turn_action", { action: "use_secret_passage" })
      .then(() => null, (err: unknown) => err);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PhoneActionRejectedError);
    expect((failure as Error).message).toMatch(/internal error/i);
  });

  it("does NOT classify a transport failure as a rejection (the event may exist)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }));
    const failure = await sendPlayerAction("p1", "token", "turn_action", { action: "use_secret_passage" })
      .then(() => null, (err: unknown) => err);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PhoneActionRejectedError);
  });

  it("does NOT classify an unparsable success body as a rejection (the event was created)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      },
    })));
    const failure = await sendPlayerAction("p1", "token", "turn_action", { action: "use_secret_passage" })
      .then(() => null, (err: unknown) => err);
    expect(failure).toBeInstanceOf(Error);
    expect(failure).not.toBeInstanceOf(PhoneActionRejectedError);
  });
});
