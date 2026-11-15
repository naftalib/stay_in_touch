import { test, expect, resetDatabase } from "./fixtures.ts";
import { accessToken, rpc } from "./api.ts";

test.describe("Member removal (runs last)", () => {
  test.afterAll(() => {
    resetDatabase();
  });

  test("removed member loses REST access", async () => {
    const momToken = await accessToken("mom@example.test");
    const removeRes = await rpc("mom@example.test", "remove_member", {
      p_member_id: "a2000000-0000-4000-8000-000000000005",
    });
    const removeBody = await removeRes.text();
    expect(removeRes.ok, removeBody).toBeTruthy();
    const noaToken = await accessToken("mom+noa@example.test");
    const res = await fetch(
      `${process.env.VITE_SUPABASE_URL}/rest/v1/messages?space_id=eq.a3000000-0000-4000-8000-000000000001&select=id`,
      {
        headers: {
          apikey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
          Authorization: `Bearer ${noaToken}`,
        },
      },
    );
    const rows = (await res.json()) as unknown[];
    expect(rows.length).toBe(0);
    void momToken;
  });
});