import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { SceneMedia } from "../../../types/video.types";

interface Props { media: SceneMedia }

export const AnimatedTextScene: React.FC<Props> = ({ media }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const mode = media.displayMode ?? "fade";

  // Fade in over first 0.5s
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], { extrapolateRight: "clamp" });

  // Typewriter effect: reveal characters
  const text = media.url; // searchTerm used as text content
  const totalChars = text.length;
  const charsPerFrame = totalChars / (fps * 1.5); // reveal over 1.5s
  const visibleChars = mode === "typewriter" ? Math.floor(frame * charsPerFrame) : totalChars;
  const displayText = text.slice(0, visibleChars);

  const translateY = mode === "fade"
    ? interpolate(frame, [0, fps * 0.5], [30, 0], { extrapolateRight: "clamp" })
    : 0;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#0a0a0a",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          color: "#ffffff",
          fontSize: 72,
          fontFamily: "sans-serif",
          fontWeight: "bold",
          textAlign: "center",
          padding: "0 80px",
          opacity,
          transform: `translateY(${translateY}px)`,
          maxWidth: "80%",
        }}
      >
        {displayText}
      </div>
    </AbsoluteFill>
  );
};
