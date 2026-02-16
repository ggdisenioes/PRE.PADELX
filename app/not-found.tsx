"use client";

// app/not-found.tsx

import { useTranslation } from "./i18n";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0f16",
        padding: "24px",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          background: "white",
          borderRadius: 16,
          padding: 28,
          boxShadow: "0 20px 60px rgba(0,0,0,.35)",
          borderTop: "4px solid #00b4ff",
        }}
      >
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111827" }}>
          {t("notFound.title")}
        </h1>
        <p style={{ marginTop: 10, marginBottom: 18, color: "#4b5563", lineHeight: 1.45 }}>
          {t("notFound.body")}
        </p>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "12px 16px",
            borderRadius: 12,
            background: "#111827",
            color: "white",
            fontWeight: 800,
            textDecoration: "none",
          }}
        >
          {t("notFound.backToHome")}
        </a>
      </div>
    </main>
  );
}
