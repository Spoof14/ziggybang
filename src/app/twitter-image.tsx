import { ImageResponse } from "next/og";

export const alt = "Ziggybang — Korea rentals, in English";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 80,
          background: "linear-gradient(135deg, #020617 0%, #0f172a 60%, #0c4a6e 100%)",
          color: "#f8fafc",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 700, display: "flex" }}>
          Ziggybang
        </div>
        <div style={{ fontSize: 48, color: "#7dd3fc", marginTop: 16, display: "flex" }}>
          Korea rentals, in English
        </div>
        <div style={{ fontSize: 30, color: "#cbd5e1", marginTop: 32, display: "flex" }}>
          Zigbang · Peterpan · Naver on one map, with KRW prices and jeonse explained
        </div>
      </div>
    ),
    size,
  );
}
