export type PushSubscriptionKeys = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSendOptions = {
  ttl: number;
  urgency: "normal";
};

export type PushSendResult = { status: number };

export type PushSender = {
  send(
    sub: PushSubscriptionKeys,
    payload: string,
    opts: PushSendOptions,
  ): Promise<PushSendResult>;
};

export type PushPayload = {
  web_push: 8030;
  notification: {
    title: "Stay In Touch";
    body: string;
    navigate: string;
    tag: string;
    lang: "en";
    dir: "ltr";
  };
  app_badge: number;
};
