"use client";

import { useRef } from "react";
import { gsap } from "gsap";

type MagneticButtonProps = {
  children: React.ReactNode;
  className?: string;
  strength?: number;
  onClick?: () => void;
};

export function MagneticButton({ children, className, strength = 0.3, onClick }: MagneticButtonProps) {
  const ref = useRef<HTMLButtonElement>(null);

  const onMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    gsap.to(el, { x: x * strength, y: y * strength, duration: 0.3, ease: "power2.out", overwrite: true });
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    gsap.to(el, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.5)", overwrite: true });
  };

  return (
    <button
      ref={ref}
      className={className}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
