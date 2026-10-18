"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

type Turnstile = {
  render(element: HTMLElement, options: { sitekey: string; callback(token: string): void; "expired-callback"(): void; "error-callback"(): void }): string;
  remove(id: string): void;
};

export function TrialCaptcha({ onToken }: { onToken(token: string): void }) {
  const element = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  useEffect(() => {
    const turnstile = (window as Window & { turnstile?: Turnstile }).turnstile;
    if (!ready || !sitekey || !turnstile || !element.current) return;
    const id = turnstile.render(element.current, {
      sitekey,
      callback: token => { setError(""); onToken(token); },
      "expired-callback": () => onToken(""),
      "error-callback": () => { onToken(""); setError("Security check failed. Please reload and retry."); },
    });
    return () => { turnstile.remove(id); onToken(""); };
  }, [ready, sitekey, onToken]);
  if (!sitekey) return null;
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      onReady={() => setReady(true)} onError={() => setError("Unable to load security check. Please reload and retry.")} />
    <div ref={element} />
    {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
  </>;
}
