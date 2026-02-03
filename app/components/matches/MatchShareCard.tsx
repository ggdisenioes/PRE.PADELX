"use client";

type Props = {
  winnerTeam: string;
  loserTeam: string;
  score: string;
};

export default function MatchShareCard({ winnerTeam, loserTeam, score }: Props) {
  return (
    <div
      style={{
        width: 600,
        height: 600,
        background: "#020617",
        borderRadius: 24,
        padding: 40,
        color: "#ffffff",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        fontFamily:
          "Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
      }}
    >
      <div style={{ textAlign: "center" }}>
        <img
          src="/logo.svg"
          alt="DEMO Padel Manager"
          style={{ height: 32, width: "auto", objectFit: "contain" }}
        />
        <div
          style={{
            marginTop: 8,
            fontSize: 12,
            letterSpacing: 2,
            color: "#07fdbb",
          }}
        >
          PADEL MANAGER
        </div>
      </div>

      <div style={{ textAlign: "center" }}>
        <div
          style={{
            color: "#07fdbb",
            fontSize: 22,
            fontWeight: 700,
            marginBottom: 12,
          }}
        >
          {winnerTeam}
        </div>

        <div style={{ fontSize: 72, fontWeight: 800, margin: "12px 0" }}>
          {score}
        </div>

        <div style={{ color: "#f87171", fontSize: 18 }}>{loserTeam}</div>
      </div>

      <div style={{ textAlign: "center", fontSize: 12, opacity: 0.7 }}>
        demo.padelx.es
      </div>
    </div>
  );
}