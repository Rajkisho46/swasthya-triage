/**
 * Global Ultra-Smooth Mobile-Safe Scroll-Reveal Animation Engine
 * Institutional, Apple-grade motion using pure IntersectionObserver.
 * GPU-accelerated translate3d, 0.08 threshold, "0px 0px -60px 0px" rootMargin.
 * Zero heavy scroll event listeners to prevent mobile frame drops or layout recalculations.
 */

const REVEAL_SELECTOR = '.scroll-reveal, .reveal, .fade-in, [data-scroll-reveal]';

let globalIntersectionObserver: IntersectionObserver | null = null;
let globalMutationObserver: MutationObserver | null = null;

function isReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function revealAllImmediately(): void {
  if (typeof document === 'undefined') return;
  const elements = document.querySelectorAll(REVEAL_SELECTOR);
  elements.forEach((el) => {
    el.classList.add('is-visible', 'fade-in-visible');
    globalIntersectionObserver?.unobserve(el);
  });
}

function observePendingElements(): void {
  if (typeof document === 'undefined') return;

  if (isReducedMotion()) {
    revealAllImmediately();
    return;
  }

  if (!globalIntersectionObserver) return;

  const unrevealed = document.querySelectorAll(REVEAL_SELECTOR);
  unrevealed.forEach((el) => {
    if (!el.classList.contains('is-visible') && !el.classList.contains('fade-in-visible')) {
      globalIntersectionObserver?.observe(el);
    }
  });
}

export function initScrollRevealObserver(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {};
  }

  if (isReducedMotion()) {
    revealAllImmediately();
    return () => {};
  }

  // Pure, high-performance IntersectionObserver configured for mobile and desktop
  if (!globalIntersectionObserver && 'IntersectionObserver' in window) {
    globalIntersectionObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting || entry.intersectionRatio >= 0.08) {
            entry.target.classList.add('is-visible', 'fade-in-visible');
            observer.unobserve(entry.target);
          }
        });
      },
      {
        root: null, // Viewport
        threshold: 0.08,
        rootMargin: '0px 0px -60px 0px',
      }
    );
  }

  // Observe existing elements on mount
  observePendingElements();

  // Handle dynamic React components, portals, and tab switching via MutationObserver
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
    // Keep observer active across route transitions
  };
}

export function refreshScrollReveal(): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (isReducedMotion()) {
    revealAllImmediately();
    return;
  }

  observePendingElements();
}
