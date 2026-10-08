"use client";

import { motion, useReducedMotion } from "motion/react";

/** A single sweep line over the hero photo: shows that inference runs continuously on the frame. */
export function ScanOverlay() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 h-24 bg-gradient-to-b from-transparent via-[var(--accent)]/25 to-transparent"
      initial={{ top: "-15%" }}
      animate={{ top: "100%" }}
      transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity, repeatDelay: 0.6 }}
    />
  );
}
