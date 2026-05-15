"use client";

import { useEffect, useRef, useState } from "react";

const BOT_USERNAME = "dont_worry_club_bot";
const AUTH_URL = "https://poker-app-psi-livid.vercel.app/api/auth/telegram/callback";

export default function TelegramTestPage() {
  const widgetRef = useRef<HTMLDivElement>(null);
  const [log, setLog] = useState<string[]>([]);

  function addLog(msg: string) {
    const ts = new Date().toISOString().slice(11, 23);
    setLog((prev) => [...prev, `[${ts}] ${msg}`]);
    console.log("[TG-TEST]", msg);
  }

  useEffect(() => {
    addLog(`origin: ${window.location.origin}`);
    addLog(`auth-url: ${AUTH_URL}`);
    addLog(`bot: ${BOT_USERNAME}`);

    const container = widgetRef.current;
    if (!container) {
      addLog("ERROR: widget container ref is null");
      return;
    }
    addLog("widget container found in DOM");

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", BOT_USERNAME);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", AUTH_URL);
    script.setAttribute("data-request-access", "write");

    script.onload = () => addLog("script LOADED — widget should render below");
    script.onerror = () => addLog("ERROR: script failed to load (network/CSP?)");

    container.appendChild(script);
    addLog("script element inserted into DOM");

    return () => {
      if (container.contains(script)) {
        container.removeChild(script);
        addLog("script removed on unmount");
      }
    };
  }, []);

  return (
    <div style={{ fontFamily: "monospace", background: "#111", color: "#eee", minHeight: "100vh", padding: "24px" }}>
      <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>Telegram Login Widget — Test</h1>
      <p style={{ fontSize: "12px", color: "#888", marginBottom: "24px" }}>
        Минимальная страница без email-логина и кастомной логики.
        Если кнопка ниже появляется и авторизация работает — проблема в интеграции на /login.
        Если нет — проблема в настройках бота/домена.
      </p>

      <div style={{ marginBottom: "24px", padding: "16px", background: "#1a1a1a", borderRadius: "8px" }}>
        <p style={{ fontSize: "12px", marginBottom: "8px", color: "#aaa" }}>Официальный Telegram Login Widget:</p>
        <div ref={widgetRef} />
      </div>

      <div style={{ padding: "12px", background: "#0d0d0d", borderRadius: "8px", fontSize: "11px", lineHeight: "1.7" }}>
        <p style={{ color: "#555", marginBottom: "8px" }}>Debug log:</p>
        {log.map((line, i) => (
          <div key={i} style={{ color: line.includes("ERROR") ? "#f87171" : "#6ee7b7" }}>
            {line}
          </div>
        ))}
      </div>
    </div>
  );
}
