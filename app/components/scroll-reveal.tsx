"use client";

import * as React from "react";

interface ScrollRevealProps {
  children: React.ReactNode;
  animation?: "fade-up" | "fade-down" | "fade-left" | "fade-right" | "fade" | "scale-up";
  delay?: number;
  duration?: number;
  className?: string;
  threshold?: number;
  once?: boolean;
}

export function ScrollReveal({
  children,
  animation = "fade-up",
  delay = 0,
  duration = 650,
  className = "",
  threshold = 0.12,
  once = true,
}: ScrollRevealProps) {
  const [isVisible, setIsVisible] = React.useState(false);
  const elementRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    // Check if user prefers reduced motion
    const prefersReducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          if (once && elementRef.current) {
            observer.unobserve(elementRef.current);
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      {
        threshold,
        rootMargin: "0px 0px -40px 0px",
      }
    );

    const currentEl = elementRef.current;
    if (currentEl) {
      observer.observe(currentEl);
    }

    return () => {
      if (currentEl) {
        observer.unobserve(currentEl);
      }
    };
  }, [threshold, once]);

  // Compute transform styles based on animation type
  const getHiddenStyles = () => {
    switch (animation) {
      case "fade-up":
        return "opacity-0 translate-y-10";
      case "fade-down":
        return "opacity-0 -translate-y-10";
      case "fade-left":
        return "opacity-0 translate-x-10";
      case "fade-right":
        return "opacity-0 -translate-x-10";
      case "scale-up":
        return "opacity-0 scale-95";
      case "fade":
      default:
        return "opacity-0";
    }
  };

  const visibleStyles = "opacity-100 translate-y-0 translate-x-0 scale-100";

  return (
    <div
      ref={elementRef}
      style={{
        transitionDuration: `${duration}ms`,
        transitionDelay: `${delay}ms`,
      }}
      className={`transition-all ease-[cubic-bezier(0.16,1,0.3,1)] will-change-transform ${
        isVisible ? visibleStyles : getHiddenStyles()
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * ScrollProgressBar: Sticky top-level reading indicator showing scroll
 * progress through the landing page narrative.
 */
export function ScrollProgressBar() {
  const [progress, setProgress] = React.useState(0);

  React.useEffect(() => {
    const handleScroll = () => {
      const totalScroll = document.documentElement.scrollTop;
      const windowHeight =
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight;
      if (windowHeight > 0) {
        const scrolled = (totalScroll / windowHeight) * 100;
        setProgress(Math.min(100, Math.max(0, scrolled)));
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div
      className="fixed top-0 left-0 right-0 h-1 z-50 pointer-events-none bg-transparent"
      aria-hidden="true"
    >
      <div
        className="h-full bg-[#FF5A26] transition-all duration-75 ease-out shadow-[0_0_8px_rgba(255,90,38,0.5)]"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
