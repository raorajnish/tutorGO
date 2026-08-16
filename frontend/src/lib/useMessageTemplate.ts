import { useEffect, useState } from "react";
import { apiFetch } from "./api";
import type { MessageTemplate, MessageTemplateType } from "./types";

const cache = new Map<MessageTemplateType, string>();
let inFlight: Promise<void> | null = null;

async function loadAll(): Promise<void> {
  if (!inFlight) {
    inFlight = apiFetch<MessageTemplate[]>("/org/message-templates")
      .then((templates) => {
        templates.forEach((t) => cache.set(t.type, t.body));
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** For one-off actions (e.g. a click handler) rather than a rendered component. */
export async function resolveMessageTemplate(type: MessageTemplateType): Promise<string> {
  if (!cache.has(type)) await loadAll();
  return cache.get(type) ?? "";
}

/** Fetches (and caches for the session) the resolved body for one template type. */
export function useMessageTemplate(type: MessageTemplateType | null): string | null {
  const [body, setBody] = useState<string | null>(type ? (cache.get(type) ?? null) : null);

  useEffect(() => {
    if (!type) return;
    const cached = cache.get(type);
    if (cached) {
      setBody(cached);
      return;
    }
    loadAll()
      .then(() => setBody(cache.get(type) ?? null))
      .catch(() => setBody(null));
  }, [type]);

  return body;
}
