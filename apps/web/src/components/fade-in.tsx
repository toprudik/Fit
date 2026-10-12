"use client";

import { motion, type HTMLMotionProps } from "motion/react";

/** Small entrance animation used across pages. */
export function FadeIn({ delay = 0, ...props }: HTMLMotionProps<"div"> & { delay?: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut", delay }}
      {...props}
    />
  );
}
