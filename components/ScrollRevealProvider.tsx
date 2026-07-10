"use client";

import { useEffect } from "react";

export default function ScrollRevealProvider() {
  useEffect(() => {
    // If the browser natively supports scroll-driven animations, do nothing.
    if (CSS.supports('(animation-timeline: view()) and (animation-range: entry)')) {
      return;
    }

    // Fallback: Intersection Observer for Safari/Firefox
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.remove('reveal-fallback-hidden');
            entry.target.classList.add('reveal-fallback-visible');
            observer.unobserve(entry.target); // Reveal only once
          }
        }
      },
      {
        threshold: 0.1, // Trigger when 10% of the element is visible
        rootMargin: "0px 0px -50px 0px"
      }
    );

    // Initial setup for fallback classes
    const revealElements = document.querySelectorAll('.reveal-on-scroll');
    revealElements.forEach((el) => {
      el.classList.add('reveal-fallback-hidden');
      observer.observe(el);
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return null;
}
