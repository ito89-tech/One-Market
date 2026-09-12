"use client";

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body
        style={{
          margin: 0,
          fontFamily:
            '"Hiragino Sans", "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif',
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7fafb",
          color: "#1c2430",
        }}
      >
        <div style={{ maxWidth: 420, padding: 24, textAlign: "center" }}>
          <h1 style={{ fontSize: 20, margin: 0 }}>ページを表示できませんでした</h1>
          <p style={{ fontSize: 14, lineHeight: 1.6, color: "#5b6573" }}>
            サーバー側で一時的な問題が起きています。再読み込みをお試しください。
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              border: 0,
              borderRadius: 8,
              background: "#00a3ae",
              color: "#fff",
              padding: "10px 18px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            再読み込み
          </button>
        </div>
      </body>
    </html>
  );
}
