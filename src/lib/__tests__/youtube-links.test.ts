import { describe, it, expect } from "vitest";
import { parseYoutubeLinks, youtubeVideoId } from "@/lib/youtube-links";

// Regression for the single-link intake: importing a series of interviews meant
// one paste, one click and one 2-Ink charge per video. A paste of N links is one
// batch, one click, N charges — and the same video twice is still one charge.

const A = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const B = "https://youtu.be/9bZkp7q19f0";
const C = "https://www.youtube.com/shorts/aBcDeFgHiJk";

describe("parseYoutubeLinks", () => {
  it("reads one link per line", () => {
    const { urls, invalid } = parseYoutubeLinks(`${A}\n${B}\n${C}`);
    expect(urls).toEqual([
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://www.youtube.com/watch?v=9bZkp7q19f0",
      "https://www.youtube.com/watch?v=aBcDeFgHiJk",
    ]);
    expect(invalid).toEqual([]);
  });

  it("tolerates commas, spaces and surrounding whitespace", () => {
    const { urls } = parseYoutubeLinks(`  ${A} , ${B} \n\n  ${C}  `);
    expect(urls).toHaveLength(3);
  });

  it("counts the same video once, however it was linked", () => {
    const { urls } = parseYoutubeLinks(`${A}\nhttps://youtu.be/dQw4w9WgXcQ\nhttps://m.youtube.com/watch?v=dQw4w9WgXcQ&t=90s`);
    expect(urls).toEqual(["https://www.youtube.com/watch?v=dQw4w9WgXcQ"]);
  });

  it("separates non-links from links instead of failing the whole paste", () => {
    const { urls, invalid } = parseYoutubeLinks(`${A}\nhttps://vimeo.com/12345\nnot a link`);
    expect(urls).toHaveLength(1);
    expect(invalid).toEqual(["https://vimeo.com/12345", "not", "a", "link"]);
  });

  it("returns nothing for an empty paste", () => {
    expect(parseYoutubeLinks("   \n  ")).toEqual({ urls: [], invalid: [] });
  });
});

describe("youtubeVideoId", () => {
  it("reads watch, short, embed, live and music URLs", () => {
    expect(youtubeVideoId(A)).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/live/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ");
  });

  it("rejects a link with no video id", () => {
    expect(youtubeVideoId("https://www.youtube.com/")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/watch?v=short")).toBeNull();
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).not.toBeNull();
  });
});
