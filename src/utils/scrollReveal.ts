/**
 * Global Scroll-Reveal Animation Engine
 * Institutional, Apple-like smooth section entrance motion using IntersectionObserver.
 * Adheres to prefers-reduced-motion, mobile optimizations, and single-shot activation.
 */

let globalIntersectionObserver: IntersectionObserver | null = null;
let globalMutationObserver: MutationObserver | null = null;

export function initScrollRevealObserver(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  const isReducedMotion = () => {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  const revealAllImmediately = () => {
    const elements = document.querySelectorAll('.scroll-reveal');
    elements.forEach((el) => {
      el.classList.add('is-visible');
    });
  };

  if (isReducedMotion() || !('IntersectionObserver' in window)) {
    revealAllImmediately();
    return () => {};
  }

  // Create or reuse the IntersectionObserver instance
  if (!globalIntersectionObserver) {
    globalIntersectionObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
        rootMargin: '0px 0px -20px 0px',
      }
    );
  }

  const observePendingElements = () => {
    if (isReducedMotion()) {
      revealAllImmediately();
      return;
    }
    const unobserved = document.querySelectorAll('.scroll-reveal:not(.is-visible)');
    unobserved.forEach((el) => {
      globalIntersectionObserver?.observe(el);
    });
  };

  // Initial pass for currently rendered DOM elements
  observePendingElements();

  // Watch for dynamic page transitions, tab switches, and dynamically rendered sections
  if ('MutationObserver' in window && !globalMutationObserver) {
    globalMutationObserver = new MutationObserver(() => {
      observePendingElements();
    });

    globalMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  return () => {
    if (globalMutationObserver) {
      globalMutationObserver.disconnect();
      globalMutationObserver = null;
    }
  };
}

export function refreshScrollReveal(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.querySelectorAll('.scroll-reveal').forEach((el) => {
      el.classList.add('is-visible');
    });
    return;
  }

  if (globalIntersectionObserver) {
    const unobserved = document.querySelectorAll('.scroll-reveal:not(.is-visible)');
    unobserved.forEach((el) => {
      globalIntersectionObserver?.observe(el);
    });
  }
}
