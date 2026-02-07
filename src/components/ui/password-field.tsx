"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Eye, EyeOff } from "lucide-react";
import { InputHTMLAttributes, useState } from "react";

type PasswordFieldProps = InputHTMLAttributes<HTMLInputElement>;

export function PasswordField(props: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <input
        {...props}
        type={visible ? "text" : "password"}
        className={`h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 pr-11 ${props.className ?? ""}`.trim()}
      />
      <button
        type="button"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        onClick={() => setVisible((prev) => !prev)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-surface-soft)]"
      >
        <AnimatePresence mode="wait" initial={false}>
          {visible ? (
            <motion.span
              key="off"
              initial={{ opacity: 0, rotate: -25, scale: 0.85 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 25, scale: 0.85 }}
              transition={{ duration: 0.16 }}
              className="block"
            >
              <EyeOff size={18} />
            </motion.span>
          ) : (
            <motion.span
              key="on"
              initial={{ opacity: 0, rotate: 25, scale: 0.85 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: -25, scale: 0.85 }}
              transition={{ duration: 0.16 }}
              className="block"
            >
              <Eye size={18} />
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  );
}
