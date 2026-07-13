import { afterEach, describe, expect, it, vi } from "vitest";
import { PhoneActionRejectedError, sendPlayerAction } from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendPlayerAction failure semantics", () => {
  it("throws PhoneActionRejectedError on a definitive HTTP rejection", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "It is not your detective's turn" }),
    })));
    await expect(
      sendPlayerAction("p1", "token", "turn_action", { action: "use_secret_passage" })
    ).rejects.toThrowError(PhoneActionRejectedError);
    await expect(
      sendPlayerAction("p1", "token", "turn_action", { action: "use_secret_passage" })
    ).rejects.toThrow(/not your detective/i);
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
