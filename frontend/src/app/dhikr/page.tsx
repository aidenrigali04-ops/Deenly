"use client";

import { useEffect, useMemo, useState } from "react";

const QURAN_PASSAGES = [
  {
    surah: "Al-Fatihah",
    ayahRange: "1-7",
    arabic: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ...",
    translation:
      "In the name of Allah, the Most Compassionate, the Most Merciful. Guide us to the straight path."
  },
  {
    surah: "Al-Ikhlas",
    ayahRange: "1-4",
    arabic: "قُلْ هُوَ ٱللَّهُ أَحَدٌ ...",
    translation: "Say: He is Allah, the One. Allah, the Eternal Refuge."
  },
  {
    surah: "Ayat al-Kursi",
    ayahRange: "Al-Baqarah 2:255",
    arabic: "ٱللَّهُ لَآ إِلَٰهَ إِلَّا هُوَ ٱلْحَىُّ ٱلْقَيُّومُ ...",
    translation: "Allah - there is no deity except Him, the Ever-Living, the Sustainer of existence."
  }
];

const STORAGE_KEY = "deenly_dhikr_count_v1";

export default function DhikrPage() {
  const [tab, setTab] = useState<"tasbeeh" | "quran">("tasbeeh");
  const [count, setCount] = useState(0);
  const [passageIdx, setPassageIdx] = useState(0);
  const currentPassage = useMemo(() => QURAN_PASSAGES[passageIdx], [passageIdx]);

  useEffect(() => {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      setCount(parsed);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(count));
  }, [count]);

  return (
    <section className="space-y-4">
      <header className="surface-card space-y-2">
        <h1 className="section-title">Dhikr Mode</h1>
        <p className="text-sm text-muted">
          Step away from scrolling and return to remembrance.
        </p>
        <div className="profile-tab-strip mt-2">
          <button
            className={`profile-tab ${tab === "tasbeeh" ? "profile-tab-active" : ""}`}
            onClick={() => setTab("tasbeeh")}
          >
            Tasbeeh
          </button>
          <button
            className={`profile-tab ${tab === "quran" ? "profile-tab-active" : ""}`}
            onClick={() => setTab("quran")}
          >
            Quran Reading
          </button>
        </div>
      </header>

      {tab === "tasbeeh" ? (
        <article className="surface-card space-y-4">
          <p className="text-sm text-muted">Tap to count your dhikr.</p>
          <div className="rounded-panel border border-black/10 px-5 py-8 text-center">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">Count</p>
            <p className="mt-2 text-5xl font-semibold tracking-tight">{count}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={() => setCount((value) => value + 1)}>
              +1 Tasbeeh
            </button>
            <button className="btn-secondary" onClick={() => setCount(0)}>
              Reset
            </button>
          </div>
        </article>
      ) : (
        <article className="surface-card space-y-4">
          <div className="rounded-panel border border-black/10 px-4 py-5">
            <p className="text-xs uppercase tracking-[0.16em] text-muted">
              {currentPassage.surah} - {currentPassage.ayahRange}
            </p>
            <p className="mt-3 text-lg leading-8">{currentPassage.arabic}</p>
            <p className="mt-3 text-sm text-muted">{currentPassage.translation}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              onClick={() => setPassageIdx((value) => (value === 0 ? QURAN_PASSAGES.length - 1 : value - 1))}
            >
              Previous
            </button>
            <button
              className="btn-secondary"
              onClick={() => setPassageIdx((value) => (value + 1) % QURAN_PASSAGES.length)}
            >
              Next
            </button>
          </div>
        </article>
      )}
    </section>
  );
}
