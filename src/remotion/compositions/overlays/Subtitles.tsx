import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { Caption, SrtStyle } from "../../../types/video.types";

interface Props {
  captions: Caption[];
  style?: Partial<SrtStyle>;
}

export const Subtitles: React.FC<Props> = ({ captions, style = {} }) => {
  const frame = useCurrentFrame();
  const fps = 30;
  const currentMs = (frame / fps) * 1000;

  // Find the active caption at this moment
  const activeCaption = captions.find(
    (c) => currentMs >= c.startMs && currentMs <= c.endMs,
  );

  if (!activeCaption) return null;

  const position = style.position ?? "bottom";
  const bgColor = style.backgroundColor ?? "#0066ff";
  const fontSize = style.fontSize ?? 48;
  const fontFamily = style.fontFamily ?? "sans-serif";

  const verticalPosition: React.CSSProperties =
    position === "bottom"
      ? { bottom: 80 }
      : position === "top"
      ? { top: 80 }
      : { top: "50%", transform: "translateY(-50%)" };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          padding: "0 60px",
          ...verticalPosition,
        }}
      >
        <span
          style={{
            backgroundColor: bgColor,
            color: "#ffffff",
            fontSize,
            fontFamily,
            fontWeight: "bold",
            padding: "12px 24px",
            borderRadius: 8,
            textAlign: "center",
            lineHeight: 1.4,
            maxWidth: "80%",
          }}
        >
          {activeCaption.text}
        </span>
      </div>
    </AbsoluteFill>
  );
};
