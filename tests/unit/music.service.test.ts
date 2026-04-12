import { describe, it, expect } from "vitest";
import { MusicService } from "../../src/services/music/music.service";

const service = new MusicService("/fake/path", "http://localhost:3000");

describe("MusicService", () => {
  it("lists all unique music styles", () => {
    const styles = service.listStyles();
    expect(styles.length).toBeGreaterThan(0);
    expect(styles).toContain("chill");
    expect(styles).toContain("dark");
    expect(styles).toContain("happy");
  });

  it("picks a random track without mood filter", () => {
    const track = service.pickTrack();
    expect(track.file).toBeTruthy();
    expect(track.url).toContain("http://localhost:3000");
    expect(track.mood).toBeTruthy();
  });

  it("picks a track matching specified mood", () => {
    const track = service.pickTrack("chill");
    expect(track.mood).toBe("chill");
  });

  it("track url is correctly encoded", () => {
    const track = service.pickTrack("happy");
    expect(track.url).toContain("/api/videos/music/");
    expect(track.url).not.toContain(" "); // spaces should be encoded
  });
});
