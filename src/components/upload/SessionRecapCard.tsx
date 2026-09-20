"use client";

import { useEffect, useRef } from "react";

export interface SessionRecapData {
  words: number;
  pages: number;
  exchanges: number;
  captured: string[];
  lineOfTheDay: string;
  teaser: string;
}

/**
 * The real ending. A session used to end on a spinner that said "distilling"
 * and then showed the author nothing. People remember a session by its best
 * moment and its ending, so the ending now hands them something: how much they
 * said, what the book gained, their own best line, and one question to carry
 * until next time. The same card is what Theo opens the next session with.
 *
 * Every field is optional in practice: if the model call failed, the counts and
 * a line of theirs still come from code, and the card simply shows less.
 */
export default function SessionRecapCard({ recap, onDone }: { recap: SessionRecapData; onDone: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { doneRef.current?.focus(); }, []);

  const words = recap.words.toLocaleString("en-US");
  const pageWord = recap.pages === 1 ? "page" : "pages";

  return (
    <div className="ds-recap" role="region" aria-label="What you got down today">
      <p className="ds-recap-eyebrow">Saved to your sources</p>
      <h2 className="ds-recap-headline">
        You said {words} words today. That is about {recap.pages} {pageWord} of a book.
      </h2>

      {recap.lineOfTheDay && (
        <figure className="ds-recap-quote">
          <blockquote>&ldquo;{recap.lineOfTheDay}&rdquo;</blockquote>
          <figcaption>Your line of the day, kept word for word</figcaption>
        </figure>
      )}

      {recap.captured.length > 0 && (
        <div className="ds-recap-block">
          <p className="ds-recap-label">What the book gained</p>
          <ul>
            {recap.captured.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      {recap.teaser && (
        <div className="ds-recap-block">
          <p className="ds-recap-label">Something to think about before next time</p>
          <p className="ds-recap-teaser">{recap.teaser}</p>
        </div>
      )}

      <button ref={doneRef} type="button" className="ds-recap-done" onClick={onDone}>
        Done for today
      </button>

      <style>{`
        .ds-recap {
          width: min(92vw, 620px); display: flex; flex-direction: column; gap: 22px;
          color: #F9F7F2; font-family: var(--font-manrope), sans-serif; text-align: left;
          max-height: 86vh; overflow-y: auto; padding: 4px 2px;
        }
        .ds-recap-eyebrow { margin: 0; font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(249,247,242,0.5); }
        .ds-recap-headline { margin: 0; font-family: var(--font-lora), serif; font-weight: 400; font-size: clamp(1.35rem, 3.2vw, 1.9rem); line-height: 1.3; text-wrap: balance; }
        .ds-recap-quote { margin: 0; padding: 4px 0 4px 18px; border-left: 2px solid #F0A878; }
        .ds-recap-quote blockquote { margin: 0; font-family: var(--font-lora), serif; font-style: italic; font-size: clamp(1.05rem, 2.4vw, 1.25rem); line-height: 1.55; color: #FFFFFF; }
        .ds-recap-quote figcaption { margin-top: 8px; font-size: 12px; color: rgba(249,247,242,0.5); }
        .ds-recap-label { margin: 0 0 8px; font-size: 11px; letter-spacing: 0.09em; text-transform: uppercase; color: rgba(249,247,242,0.5); }
        .ds-recap-block ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 7px; }
        .ds-recap-block li { font-size: 14.5px; line-height: 1.5; color: rgba(249,247,242,0.9); padding-left: 16px; position: relative; }
        .ds-recap-block li::before { content: ""; position: absolute; left: 0; top: 0.62em; width: 6px; height: 6px; border-radius: 50%; background: #C17A47; }
        .ds-recap-teaser { margin: 0; font-size: 16px; line-height: 1.55; color: #FFFFFF; }
        .ds-recap-done {
          align-self: flex-start; margin-top: 4px; cursor: pointer; border: none; border-radius: 12px;
          padding: 13px 22px; font-size: 14px; font-weight: 600; font-family: inherit;
          background: #C17A47; color: #1A1610;
        }
        .ds-recap-done:hover { background: #D08A57; }
        .ds-recap-done:focus-visible { outline: 2px solid #F0A878; outline-offset: 3px; }
      `}</style>
    </div>
  );
}
