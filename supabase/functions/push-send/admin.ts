import type { SupabaseClient } from "@supabase/supabase-js";
import type { FactRow, PushAdmin, SubscriptionRow } from "./handler.ts";

type RpcError = { message: string } | null;

function unwrap<T>(result: { data: T; error: RpcError }): T {
  if (result.error) throw new Error("push query failed");
  return result.data;
}

export function createPushAdmin(client: SupabaseClient): PushAdmin {
  return {
    async claim(limit) {
      const result = await client.rpc("claim_push_batch", { p_limit: limit });
      const rows = unwrap(result) as { id: string }[] | null;
      return (rows ?? []).map((row) => row.id);
    },
    async facts(ids) {
      const result = await client.rpc("push_group_facts", { p_ids: ids });
      return (unwrap(result) as FactRow[] | null) ?? [];
    },
    async subscriptions(userId) {
      const result = await client
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, failure_count")
        .eq("user_id", userId)
        .is("disabled_at", null);
      return (unwrap(result) as SubscriptionRow[] | null) ?? [];
    },
    async record(input) {
      const result = await client.rpc("record_push_result", {
        p_ids: input.ids,
        p_status: input.status,
        p_last_status: input.lastStatus,
        p_skip_reason: input.skipReason,
        p_sent_payload: input.sentPayload,
        p_retry: input.retry,
      });
      unwrap(result);
    },
    async deleteSubscription(id) {
      const result = await client.from("push_subscriptions").delete().eq("id", id);
      unwrap(result);
    },
    async markUsed(id) {
      const result = await client
        .from("push_subscriptions")
        .update({ last_used_at: new Date().toISOString(), failure_count: 0 })
        .eq("id", id);
      unwrap(result);
    },
    async noteFailure(id, failureCount) {
      const result = await client
        .from("push_subscriptions")
        .update({ failure_count: failureCount })
        .eq("id", id);
      unwrap(result);
    },
    async delivered(ids) {
      const result = await client.rpc("delivered_push_subscriptions", { p_outbox_ids: ids });
      const rows = unwrap(result) as string[] | null;
      return rows ?? [];
    },
    async noteDelivered(ids, subscriptionId) {
      const result = await client.rpc("record_push_delivery", {
        p_outbox_ids: ids,
        p_subscription_id: subscriptionId,
      });
      unwrap(result);
    },
    async prune() {
      const result = await client.rpc("prune_notification_outbox");
      unwrap(result);
    },
  };
}
