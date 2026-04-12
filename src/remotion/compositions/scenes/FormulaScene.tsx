import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneMedia } from "../../../types/video.types";

interface Props { media: SceneMedia }

export const FormulaScene: React.FC<Props> = ({ media }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mode = media.displayMode ?? "reveal";

  // Scale reveal animation
  const scale = mode === "reveal"
    ? interpolate(frame, [0, fps * 0.8], [0.3, 1], { extrapolateRight: "clamp" })
    : 1;

  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0f0f1a",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      {/* Formula display using HTML/CSS — use KaTeX-like rendering if available */}
      <div
        style={{
          backgroundColor: "rgba(255,255,255,0.05)",
          borderRadius: 16,
          padding: "48px 64px",
          border: "1px solid rgba(255,255,255,0.1)",
          opacity,
          transform: `scale(${scale})`,
        }}
      >
        <span
          style={{
            color: "#e2e8f0",
            fontSize: 96,
            fontFamily: "serif",
            fontStyle: "italic",
            letterSpacing: 4,
          }}
        >
          {media.url}
        </span>
      </div>
    </AbsoluteFill>
  );
};
