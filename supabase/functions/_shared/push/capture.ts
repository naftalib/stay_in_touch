import type { PushSender } from "./types.ts";

export function captureSender(): PushSender {
  return {
    send(_sub, _payload, _opts) {
      return Promise.resolve({ status: 201 });
    },
  };
}
