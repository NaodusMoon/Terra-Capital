"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

export function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const [enableMotion, setEnableMotion] = useState(false);

  useEffect(() => {
    const widthQuery = window.matchMedia("(max-width: 900px)");
    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const update = () => {
      setEnableMotion(!widthQuery.matches && !reducedQuery.matches);
    };

    update();
    widthQuery.addEventListener("change", update);
    reducedQuery.addEventListener("change", update);
    return () => {
      widthQuery.removeEventListener("change", update);
      reducedQuery.removeEventListener("change", update);
    };
  }, []);

  if (!enableMotion) {
    return <div>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay }}
    >
      {children}
    </motion.div>
  );
}
