"use client";

import { useEffect, useRef } from "react";

export function CinematicMurmurWaveform() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function createWaveform() {
      const stage = stageRef.current;
      if (!stage) return;

      const numBars = 120;
      const viewBoxWidth = 1100;
      const viewBoxHeight = 350;
      const barWidth = viewBoxWidth / numBars;
      const gap = 1.2;

      let rectsHTML = "";
      for (let i = 0; i < numBars; i++) {
        const x = i * barWidth;
        const normalizedX = i / numBars;
        const slowWave = Math.sin(normalizedX * Math.PI * 2);
        const fastWave = Math.sin(normalizedX * Math.PI * 8) * 0.4;
        const noise = (Math.random() - 0.5) * 0.2;
        const combinedWave = (slowWave + fastWave + noise) / 1.5;
        const delay = normalizedX * -3.2;
        const duration = 1.5 + Math.random() * 1.5;
        const baseScaleMin = 0.05 + Math.abs(fastWave) * 0.3;
        const baseScaleMax = 0.5 + Math.abs(combinedWave) * 0.5;

        rectsHTML += `<rect class="bar" x="${x}" y="0" width="${barWidth - gap}" height="100%" style="--anim-delay:${delay}s;--anim-duration:${duration}s;--scale-min:${baseScaleMin};--scale-max:${baseScaleMax}" />`;
      }

      stage.innerHTML = `
        <svg class="murmur-svg" viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" style="will-change: transform; transform: translateZ(0);">
          <defs>
            <clipPath id="cinematicMurmurMask">
              <text x="50%" y="60%" text-anchor="middle" alignment-baseline="middle" font-family="var(--font-playfair), 'Playfair Display', serif" font-style="italic" font-weight="500" font-size="220px" letter-spacing="-0.02em">D. scribe</text>
            </clipPath>
          </defs>
          <g clip-path="url(#cinematicMurmurMask)">${rectsHTML}</g>
        </svg>
      `;
    }

    createWaveform();
    window.addEventListener("resize", createWaveform);
    return () => window.removeEventListener("resize", createWaveform);
  }, []);

  return (
    <div
      ref={stageRef}
      style={{ width: "100%", display: "flex", justifyContent: "center", height: "100%", alignItems: "center" }}
    />
  );
}

export function CinematicCircularText() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const str = "INTELLIGENT DICTATION \u2022 EDITORIAL AI \u2022 ";
    el.innerHTML = "";
    for (let i = 0; i < str.length; i++) {
      const span = document.createElement("span");
      span.innerHTML = str[i] === " " ? "&nbsp;" : str[i];
      span.style.transform = `rotate(${i * (360 / str.length)}deg)`;
      el.appendChild(span);
    }
  }, []);

  return <div ref={ref} className="circular-text cinematic-spin-slow" />;
}

export function CinematicNavScrollEffect() {
  useEffect(() => {
    const navbar = document.getElementById("cinematic-navbar");
    if (!navbar) return;

    function handleScroll() {
      if (!navbar) return;
      if (window.scrollY > 50) {
        navbar.classList.add("cinematic-glass-nav");
        navbar.style.borderColor = "transparent";
      } else {
        navbar.classList.remove("cinematic-glass-nav");
        navbar.style.borderColor = "transparent";
      }
    }

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return null;
}

export function CinematicPaneHoverEffect() {
  useEffect(() => {
    const stage = document.getElementById("cinematic-murmur-stage");
    const panes = document.querySelectorAll<HTMLElement>(".cinematic-root .pane");
    if (!stage || panes.length === 0) return;

    const defaults = [
      "transparent",
      "transparent",
      "transparent",
      "transparent",
      "transparent",
      "transparent",
    ];

    function handleEnter() {
      panes.forEach((pane, index) => {
        pane.style.backgroundColor = `rgba(193, 122, 71, ${0.02 + index * 0.015})`;
      });
    }

    function handleLeave() {
      panes.forEach((pane, index) => {
        pane.style.backgroundColor = defaults[index];
      });
    }

    stage.addEventListener("mouseenter", handleEnter);
    stage.addEventListener("mouseleave", handleLeave);
    return () => {
      stage.removeEventListener("mouseenter", handleEnter);
      stage.removeEventListener("mouseleave", handleLeave);
    };
  }, []);

  return null;
}
