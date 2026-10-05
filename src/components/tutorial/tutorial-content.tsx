import type { ReactNode } from "react";
import {
  IlUploadFour,
  IlBrainstorm,
  IlTranscribe,
  IlEditParagraph,
  IlViews,
  IlStructure,
  IlMindMap,
  IlDragNote,
  IlNoteTools,
  IlExpandOutline,
  IlGenerate,
  IlQuotes,
  IlForeword,
  IlEditSave,
  IlMagicEdit,
  IlMagicRewrite,
  IlExport,
} from "./illustrations";

// Feature flags (inlined at build): new steps and features only appear in the
// tours once they are switched on.
const SPEAKER_LABELS = process.env.NEXT_PUBLIC_SPEAKER_LABELS === "true";
const PUBLISHER_READY = process.env.NEXT_PUBLIC_PUBLISHER_READY === "true";

export interface TutorialSlide {
  title: string;
  body: string;
  art?: ReactNode;
}

/** One stop of the on-page spotlight tour. `target` matches a
 *  `data-tut="..."` attribute; stops whose target isn't currently rendered
 *  are skipped, so state-dependent UI (pre/post analysis, quote lists, etc.)
 *  degrades gracefully. */
export interface CoachmarkStep {
  target: string;
  title: string;
  body: string;
}

export interface StepTutorial {
  slides: TutorialSlide[];
  coachmarks: CoachmarkStep[];
}

export const TUTORIALS: Record<string, StepTutorial> = {
  upload: {
    slides: [
      {
        title: "Four ways to give us your voice",
        body: "This step collects the raw material for your book. Use any of the four sources — or all of them. A rough voice note, a brainstorm session, and a three-hour interview can all belong to the same book.",
        art: <IlUploadFour />,
      },
      {
        title: "Not sure where to start? Brainstorm.",
        body: "Enter the studio and talk with T.H.E.O, your AI ghostwriter. He interviews you live — no script, no blank page — and the whole conversation becomes book material automatically.",
        art: <IlBrainstorm />,
      },
      {
        title: "Already have material? Bring it in.",
        body: "Record yourself live on the cassette, drag and drop audio files you already have (MP3, WAV, M4A, MP4), or paste a YouTube link to import a public conversation's transcript.",
        art: <IlUploadFour />,
      },
      {
        title: "Then press Transcribe",
        body: "When your sources are staged, the Transcribe button turns everything into text. You can always come back and add more material later — the book grows with it.",
        art: <IlTranscribe />,
      },
    ],
    coachmarks: [
      {
        target: "upload-brainstorm",
        title: "01 · Brainstorm Studio",
        body: "The featured way in. T.H.E.O interviews you live and turns the conversation into book material. Great when you're starting from nothing.",
      },
      {
        target: "upload-record",
        title: "02 · Record live",
        body: "Press the red button on the cassette and just talk. 15–60 minutes in a quiet room is the sweet spot. Stop saves the recording here.",
      },
      {
        target: "upload-files",
        title: "03 · Audio files",
        body: "Drop recordings you already have anywhere on this card, or click Choose audio. Combine as many files as the book needs — up to 500 MB each.",
      },
      {
        target: "upload-youtube",
        title: "04 · YouTube",
        body: "Paste a public YouTube URL and press Fetch. We import only the transcript, never the video.",
      },
      {
        target: "upload-transcribe",
        title: "Start the machine",
        body: "Once anything is staged, this button uploads and transcribes it all. When it's done you'll move on to review the transcript.",
      },
    ],
  },

  transcript: {
    slides: [
      {
        title: "Read it before the book does",
        body: "Everything here feeds the book — nothing is final. Click any paragraph to fix names, cut tangents, or reword. Your edits save right back into the transcript.",
        art: <IlEditParagraph />,
      },
      {
        title: "Two ways to read, one way to rewrite",
        body: "Segments keeps speakers and timestamps; Full text reads as continuous prose. Use Edit Transcript in the sidebar to rewrite the whole thing at once, then Save Changes.",
        art: <IlViews />,
      },
      ...(SPEAKER_LABELS
        ? [{
            title: "Tell us who is speaking",
            body: "Every voice in your recording gets a name: you, or someone else (a guest, a pastor, a grandparent). Your interviewer and writer then never mix up your story with theirs. Solo recording? Skip it: labels are optional and every voice counts as yours. The × under a speaker's name deletes that whole paragraph (Undo brings it back).",
            art: <IlViews />,
          }]
        : []),
    ],
    coachmarks: [
      ...(SPEAKER_LABELS
        ? [{
            target: "transcript-speakers",
            title: "Who is speaking?",
            body: "Name each voice: the book's author (you, unless you're writing for someone) or someone else. \"Same person as\" merges a voice the detector split in two. The little speaker label on each paragraph fixes one it got wrong.",
          }]
        : []),
      {
        target: "transcript-body",
        title: "Click to edit",
        body: "Click any paragraph and it opens for editing right in place. Save writes it back; Escape cancels.",
      },
      {
        target: "transcript-views",
        title: "Reading views",
        body: "Segments keeps speaker labels and timestamps. Full text flows as prose. It's only a reading choice — edits work the same in both.",
      },
      {
        target: "transcript-edit",
        title: "Edit everything at once",
        body: "Opens the whole transcript as one editable text — useful for big cuts. Anything you wouldn't want in the book, cut here.",
      },
    ],
  },

  structure: {
    slides: [
      {
        title: "Shape the book",
        body: "Set how many chapters you want, how long each should run, and who you're writing for. The live estimate shows the manuscript size. These are starting targets — you can rework the outline in the next step.",
        art: <IlStructure />,
      },
    ],
    coachmarks: [
      {
        target: "structure-chapters",
        title: "Chapter count",
        body: "How many chapters the outline should aim for. You can add, remove, or merge chapters later on the Analysis canvas.",
      },
      {
        target: "structure-words",
        title: "Words per chapter",
        body: "The target length for each chapter's draft. 2,000–3,000 words is a comfortable read for most books.",
      },
      {
        target: "structure-audience",
        title: "Target reader",
        body: "Who the book speaks to. This tunes the writing voice and, for faith audiences, unlocks a scripture translation choice.",
      },
      {
        target: "structure-commence",
        title: "Lock it in",
        body: "Saves your settings and moves to Analysis, where the outline gets built. Settings also auto-save as you change them.",
      },
    ],
  },

  analysis: {
    slides: [
      {
        title: "Your book's mind map",
        body: "Run Analysis reads the transcript, pulls out key points, learns your voice, and drafts a chapter outline. Each column is a chapter card with its key points stacked below as sticky notes.",
        art: <IlMindMap />,
      },
      {
        title: "Drag anything anywhere",
        body: "Drag a sticky note into another chapter's column to move it, or up and down to reorder it. Drag whole chapter cards left or right to reorder chapters — drop one on top of another to merge them.",
        art: <IlDragNote />,
      },
      {
        title: "Add, edit, remove",
        body: "Click any text on a note to rewrite it. The + on a chapter card adds a key point; the colored + buttons in the bottom toolbar add chapters. Undo and redo have your back, and everything auto-saves.",
        art: <IlNoteTools />,
      },
      {
        title: "It grows with your uploads",
        body: "Upload more audio later and new key points appear with a banner — Preview New Chapters proposes where they fit, and you approve before anything changes. Happy with the map? Continue to Generate.",
        art: <IlExpandOutline />,
      },
    ],
    coachmarks: [
      {
        target: "analysis-run",
        title: "Run Analysis",
        body: "One click extracts key points from your transcript, builds a voice profile, and drafts the chapter outline. It takes a couple of minutes.",
      },
      {
        target: "analysis-tabs",
        title: "Outline and Voice",
        body: "Outline is the interactive mind map. Voice Profile shows what the analysis learned about how you sound — the generator writes in that voice.",
      },
      {
        target: "analysis-canvas",
        title: "The canvas",
        body: "Drag sticky notes between chapters, drag chapters to reorder, click any text to edit it. Scroll to zoom, drag the background to pan.",
      },
      {
        target: "analysis-toolbar",
        title: "Your toolkit",
        body: "Undo and redo, colored + buttons to add chapters, an auto-save indicator, and Continue to Generate when the map feels right.",
      },
    ],
  },

  generate: {
    slides: [
      {
        title: "From outline to prose",
        body: "Pick a chapter on the left, then Generate Chapter writes it in your voice — or Generate All drafts the entire book in one run. The Creative Freedom slider sets how closely the AI sticks to your exact words.",
        art: <IlGenerate />,
      },
      {
        title: "Enrichment quotes",
        body: "Before generating, the AI can find relevant quotes from real books and thinkers for each chapter. Tick the ones you want woven in, untick to drop them, and New quotes fetches a fresh set.",
        art: <IlQuotes />,
      },
      {
        title: "Add a foreword",
        body: "Flip the Include Foreword toggle and Generate All also writes an opening chapter previewing the topics ahead. You can regenerate it on its own later.",
        art: <IlForeword />,
      },
      ...(PUBLISHER_READY
        ? [{
            title: "Write your first draft",
            body: "Write my first draft drafts every chapter, and each one opens with Read as soon as it lands, so you can start reading while the rest are written. When the last lands you choose: an optional publisher-ready review, or straight to your final draft.",
            art: <IlGenerate />,
          }]
        : []),
    ],
    coachmarks: [
      ...(PUBLISHER_READY
        ? [{
            target: "generate-publisher-ready",
            title: "Write my first draft",
            body: "Drafts every chapter, a couple at a time. Finished chapters get a Read button in the list. Quick draft is still there if you're in a hurry.",
          }]
        : []),
      {
        target: "generate-chapters",
        title: "Your chapter list",
        body: "Click any chapter to work on it. The dot shows its status — outlined, generating, or drafted.",
      },
      {
        target: "generate-foreword",
        title: "Foreword toggle",
        body: "On means Generate All also writes an AI foreword previewing the book. Off skips it. You can change your mind anytime.",
      },
      {
        target: "generate-freedom",
        title: "Creative Freedom",
        body: "Low keeps the prose close to your transcript's exact words. High lets the AI embellish and restructure more freely.",
      },
      {
        target: "generate-quotes",
        title: "Enrichment quotes",
        body: "Click a quote to include or drop it — checked quotes get woven into the chapter. New quotes fetches a fresh set if these don't fit.",
      },
      {
        target: "generate-actions",
        title: "Generate",
        body: "Generate Chapter drafts just this one; Generate All runs the whole book (and the foreword, if it's on). Finished chapters land in the Editor.",
      },
    ],
  },

  // Flow v2 (Kyle 2026-09-28): Editor review, then the Interview room.
  review: {
    slides: [
      {
        title: "Your editor reads first",
        body: "Optional, and only for publisher-ready edits and additions. An editor reads every chapter the way a literary agent would and finds the thin spots: a missing scene, a name, what someone actually said.",
        art: <IlGenerate />,
      },
      {
        title: "Which would you actually say?",
        body: "While the editor reads, lines from your own chapters show up written two ways. Pick the one you'd say out loud, or type it your way. They keep coming until the editor is done, and they teach the writer how you really talk.",
        art: <IlEditParagraph />,
      },
    ],
    coachmarks: [
      { target: "pr-picker", title: "Which would you say?", body: "Tap the line that sounds like you. \"Neither\" lets you write it your way, which is the most useful answer of all." },
      { target: "pr-editor-notes", title: "What the editor saw", body: "A short read on each chapter's first draft. It's D.Scribe's own measure, not a prediction of any publisher's decision." },
    ],
  },

  interview: {
    slides: [
      {
        title: "Welcome back",
        body: "The same room as your first interview. T.H.E.O. asks your editor's questions out loud; answer the way you'd tell a friend: names, places, what was said.",
        art: <IlBrainstorm />,
      },
      {
        title: "Skip anything",
        body: "Skip a question, jump to the next chapter, or tap I'm done whenever you've said enough. Your answers go into the book in your own words on the Final Draft.",
        art: <IlMagicRewrite />,
      },
    ],
    coachmarks: [],
  },

  // Pre-flow-v2 Publisher-Ready page (kept for the old 9-step rail's tours).
  "interview-v1": {
    slides: [
      {
        title: "Your editor reads first",
        body: "An editor reads every chapter the way a literary agent would and finds the thin spots: a missing scene, a name, what someone actually said. Craft fixes it handles itself. The rest become questions for you.",
        art: <IlGenerate />,
      },
      {
        title: "Which would you actually say?",
        body: "While the editor reads, you'll see a few lines from your own chapter written two ways. Pick the one you'd say out loud, or type it your way. It takes about a minute, only happens once, and teaches the writer how you really talk.",
        art: <IlEditParagraph />,
      },
      {
        title: "Answer what only you know",
        body: "Then the questions, five per chapter at a time before moving on, so no chapter hogs you. Type or answer out loud. Skip anything, finish a chapter early, or stop whenever you like. Your answers go into the book in your words.",
        art: <IlBrainstorm />,
      },
    ],
    coachmarks: [
      { target: "pr-stages", title: "Where you are", body: "Draft, editor read, your interview, revision, final check. Each chapter moves through on its own; you can pause after any chapter." },
      { target: "pr-picker", title: "Which would you say?", body: "Tap the line that sounds like you. \"Neither\" lets you write it your way, which is the most useful answer of all." },
      { target: "pr-interview", title: "Your editor's questions", body: "Say it the way you'd tell a friend: names, places, what was said. Done with this chapter moves on; Done with all questions starts the revision." },
    ],
  },

  revise: {
    slides: [
      {
        title: "Your answers go in",
        body: "Each chapter is revised with your answers in your own words. Anything you didn't answer is never made up. Quotes are never changed. The editor's craft notes get fixed along the way.",
        art: <IlMagicRewrite />,
      },
      {
        title: "A final check, then yours",
        body: "A last pass catches flat rhythm, repeated phrases across chapters and anything that reads machine-written. Then the book lands in the Editor for you to polish.",
        art: <IlEditSave />,
      },
    ],
    coachmarks: [
      { target: "pr-stages", title: "Revision and final check", body: "Keep this tab open while chapters finish. Each one saves as a new version, so nothing you wrote before is lost." },
      { target: "pr-editor-notes", title: "What the editor saw", body: "A short read on each chapter's first draft. It's D.Scribe's own measure, not a prediction of any publisher's decision." },
    ],
  },

  editor: {
    slides: [
      {
        title: "Polish every chapter",
        body: "Pick a chapter in the sidebar and write directly on the page — it's a full text editor. When you're done, Save Changes stores the revision to your book's editorial memory.",
        art: <IlEditSave />,
      },
      {
        title: "Magic Edit — fix a passage",
        body: "Select any sentence or paragraph and a bubble appears. Tell it what to change — \"make this punchier\", \"less formal\" — and it rewrites just that selection, in your voice.",
        art: <IlMagicEdit />,
      },
      {
        title: "Magic Rewrite — reshape the chapter",
        body: "The bar at the bottom rewrites the whole chapter from one instruction. If a rewrite misses, your previous text is restored automatically on failure — and saving keeps every version in memory.",
        art: <IlMagicRewrite />,
      },
    ],
    coachmarks: [
      {
        target: "editor-chapters",
        title: "The manuscript",
        body: "Every chapter lives here. Click one to open it — word counts and draft status at a glance.",
      },
      {
        target: "editor-page",
        title: "The page",
        body: "Click anywhere and type — this is a full editor. Select text to summon the Magic Edit bubble for targeted rewrites.",
      },
      {
        target: "editor-rewrite",
        title: "Magic Rewrite",
        body: "Type an instruction here — \"tighten this chapter\", \"warmer tone\" — and the whole chapter is rewritten live before your eyes.",
      },
      {
        target: "editor-save",
        title: "Save your work",
        body: "Stores the chapter to editorial memory. Save after edits you want to keep — Magic Rewrite auto-saves when it finishes.",
      },
    ],
  },

  export: {
    slides: [
      {
        title: "Your book, out the door",
        body: "Download the manuscript as a print-ready PDF or an editable DOCX, send it straight to Google Drive as a Google Doc, or publish an excerpt. This is the finish line — congratulations.",
        art: <IlExport />,
      },
    ],
    coachmarks: [
      {
        target: "export-downloads",
        title: "Download formats",
        body: "PDF for print-ready pages, DOCX for editing in Word. Both include every generated chapter.",
      },
      {
        target: "export-drive",
        title: "Straight to Drive",
        body: "Lands in your Google Drive as a real Google Doc, ready to edit and share. First use connects your Google account.",
      },
    ],
  },
};
