import { useEffect } from "react";
import { api } from "./lib";

export function usePresence(session) {
  useEffect(() => {
    if (session.mode !== "cloud") return;
    const tabId = crypto.randomUUID();
    const body = JSON.stringify({ tabId });
    const controller = new AbortController();
    let pending = false;
    let closed = false;
    async function heartbeat() {
      if (pending || closed) return;
      pending = true;
      try {
        await api("/presence/heartbeat", {
          method: "POST",
          body,
          signal: AbortSignal.any([
            controller.signal,
            AbortSignal.timeout(10000),
          ]),
        });
      } catch {
        /* Retry on the next heartbeat. The API handles expired sessions. */
      } finally {
        pending = false;
      }
    }
    function leave() {
      navigator.sendBeacon(
        "/api/presence/leave",
        new Blob([body], { type: "application/json" }),
      );
    }
    function resume() {
      heartbeat();
    }
    heartbeat();
    const timer = setInterval(heartbeat, 30000);
    window.addEventListener("focus", resume);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", leave);
    return () => {
      closed = true;
      clearInterval(timer);
      controller.abort();
      window.removeEventListener("focus", resume);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [session.mode, session.user.id]);
}
