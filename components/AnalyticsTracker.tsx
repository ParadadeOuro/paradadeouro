"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function generateSessionId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

export function AnalyticsTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const interactedRef = useRef(false);
  const sessionDataRef = useRef<{
    sessionId: string;
    startedAt: string;
    utm: { source: string | null; medium: string | null; campaign: string | null };
  } | null>(null);

  // Initialize session
  useEffect(() => {
    if (typeof window === "undefined") return;

    let sid = localStorage.getItem("po_session_id");
    let started = localStorage.getItem("po_session_start");

    if (!sid) {
      sid = generateSessionId();
      started = new Date().toISOString();
      localStorage.setItem("po_session_id", sid);
      localStorage.setItem("po_session_start", started);
    }

    const utm = {
      source: searchParams.get("utm_source"),
      medium: searchParams.get("utm_medium"),
      campaign: searchParams.get("utm_campaign"),
    };

    sessionDataRef.current = {
      sessionId: sid,
      startedAt: started || new Date().toISOString(),
      utm,
    };
  }, [searchParams]);

  // Track Interaction
  useEffect(() => {
    const handleInteraction = () => {
      interactedRef.current = true;
    };
    window.addEventListener("click", handleInteraction, { passive: true });
    window.addEventListener("scroll", handleInteraction, { passive: true });
    window.addEventListener("mousemove", handleInteraction, { passive: true });

    return () => {
      window.removeEventListener("click", handleInteraction);
      window.removeEventListener("scroll", handleInteraction);
      window.removeEventListener("mousemove", handleInteraction);
    };
  }, []);

  // Send Heartbeat
  useEffect(() => {
    if (typeof window === "undefined") return;

    const sendHeartbeat = () => {
      if (!sessionDataRef.current) return;
      const path = window.location.pathname;
      const inCheckout = path.startsWith("/checkout");

      fetch("/api/analytics/heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sessionDataRef.current.sessionId,
          sessionStartedAt: sessionDataRef.current.startedAt,
          path,
          interacted: interactedRef.current,
          inCheckout,
          userAgent: window.navigator.userAgent,
          referrer: document.referrer,
          utm: sessionDataRef.current.utm,
        }),
      }).catch(console.error);
    };

    // Send initial heartbeat
    const timeout = setTimeout(sendHeartbeat, 1000);

    // Ping every 30 seconds
    const interval = setInterval(sendHeartbeat, 30000);

    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [pathname]);

  // Track Page Views
  useEffect(() => {
    if (typeof window === "undefined" || !sessionDataRef.current) return;

    const trackVisit = async () => {
      try {
        await fetch("/api/analytics/event", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sessionDataRef.current!.sessionId,
            type: "visit",
            userAgent: window.navigator.userAgent,
            referrer: document.referrer,
          }),
        });
      } catch (err) {
        console.error(err);
      }
    };

    trackVisit();
  }, [pathname]);

  return null;
}
