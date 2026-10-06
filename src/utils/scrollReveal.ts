/**
 * Global Mobile-Safe Scroll-Reveal Animation Engine
 * Institutional, Apple-grade smooth section entrance motion using IntersectionObserver.
 * Fully responsive across 320px–430px mobile, tablets, and desktop displays.
 * Supports scrolling DOWN and UP, dynamic React lifecycle renders, and prefers-reduced-motion.
 */

const REVEAL_SELECTOR = '.scroll-reveal, .reveal, .fade-in, [data-scroll-reveal]';

let globalIntersectionObserver: IntersectionObserver | null = null;
let globalMutationObserver: MutationObserver | null = null;
let isInitialized = false;
let rafId: number | null = null;

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

function checkAndRevealElement(el: Element): boolean {
  if (typeof window === 'undefined') return false;
  if (el.classList.contains('is-visible') || el.classList.contains('fade-in-visible')) {
    return true;
  }

  const rect = el.getBoundingClientRect();
  const windowHeight = window.innerHeight || document.documentElement.clientHeight || 800;

  // Trigger when approximately top edge enters viewport with -40px rootMargin,
  // or when scrolling back up and bottom edge re-enters from top
  const isInsideViewport = rect.top <= windowHeight - 40 && rect.bottom >= 0;

  if (isInsideViewport) {
    el.classList.add('is-visible', 'fade-in-visible');
    globalIntersectionObserver?.unobserve(el);
    return true;
  }
  return false;
}

function checkVisibleElements(): void {
  if (typeof document === 'undefined') return;

  if (isReducedMotion()) {
    revealAllImmediately();
    return;
  }

  const unrevealed = document.querySelectorAll(REVEAL_SELECTOR);
  unrevealed.forEach((el) => {
    if (!el.classList.contains('is-visible') && !el.classList.contains('fade-in-visible')) {
      checkAndRevealElement(el);
    }
  });
}

function observePendingElements(): void {
  if (typeof document === 'undefined') return;

  if (isReducedMotion()) {
    revealAllImmediately();
    return;
  }

  // Immediate check for elements already in viewport
  checkVisibleElements();

  if (!globalIntersectionObserver) return;

  const unrevealed = document.querySelectorAll(REVEAL_SELECTOR);
  unrevealed.forEach((el) => {
    if (!el.classList.contains('is-visible') && !el.classList.contains('fade-in-visible')) {
      globalIntersectionObserver?.observe(el);
    }
  });
}

function handleThrottledScrollOrTouch(): void {
  if (typeof window === 'undefined') return;
  if (rafId) return;

  rafId = window.requestAnimationFrame(() => {
    rafId = null;
    checkVisibleElements();
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

  // Create IntersectionObserver with mobile-safe threshold and rootMargin
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
        root: null, // Default to browser viewport
        threshold: 0.08, // Mobile-safe ~8-10% intersection
        rootMargin: '0px 0px -40px 0px', // Triggers cleanly when scrolling down and up
      }
    );
  }

  // Initial pass on existing DOM
  observePendingElements();

  // Multi-pass checks to handle asynchronous React hydration and font/image layout stabilization
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => {
      observePendingElements();
    });
  }
  setTimeout(() => {
    observePendingElements();
  }, 100);
  setTimeout(() => {
    observePendingElements();
  }, 350);

  // Setup MutationObserver to automatically catch dynamically rendered React components & tabs
  if ('MutationObserver' in window && !globalMutationObserver) {
    globalMutationObserver = new MutationObserver(() => {
      observePendingElements();
    });

    globalMutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Attach mobile touch & scroll event listeners for fluid multi-touch & inertial momentum scrolling
  if (!isInitialized) {
    isInitialized = true;
    window.addEventListener('scroll', handleThrottledScrollOrTouch, { passive: true });
    window.addEventListener('touchmove', handleThrottledScrollOrTouch, { passive: true });
    window.addEventListener('touchend', handleThrottledScrollOrTouch, { passive: true });
    window.addEventListener('resize', handleThrottledScrollOrTouch, { passive: true });
    window.addEventListener('orientationchange', handleThrottledScrollOrTouch, { passive: true });
  }

  return () => {
    // Keep observer active across React re-renders while allowing manual cleanup if needed
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
