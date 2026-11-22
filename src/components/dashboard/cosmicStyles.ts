export const COSMIC_STYLES = `
  @keyframes kobo-star-twinkle {
    0%, 100% { opacity: 0.28; transform: scale(0.82); }
    50%      { opacity: 1;    transform: scale(1.22); }
  }
  @keyframes kobo-planet-float {
    0%, 100% { transform: translate3d(0, 0px, 0); }
    50%      { transform: translate3d(0, -6px, 0); }
  }
  @keyframes kobo-flame-flicker {
    0%, 100% { transform: scaleX(1) scaleY(1); opacity: 0.96; }
    35%      { transform: scaleX(0.84) scaleY(1.1); opacity: 0.84; }
    70%      { transform: scaleX(1.12) scaleY(0.92); opacity: 1; }
  }
  @keyframes kobo-halo-breathe {
    0%, 100% { opacity: 0.55; transform: scale(0.98); }
    50%      { opacity: 0.95; transform: scale(1.07); }
  }
  @keyframes kobo-sun-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes kobo-gem-drift {
    0%, 100% { transform: translate3d(0, 0px, 0) rotate(0deg); }
    50%      { transform: translate3d(0, -6px, 0) rotate(5deg); }
  }

  .kobo-star         { animation: kobo-star-twinkle var(--dur, 2.4s) var(--delay, 0s) ease-in-out infinite; transform-box: fill-box; transform-origin: center; }
  .kobo-float-d      { animation: kobo-planet-float 5.6s 0.0s ease-in-out infinite; will-change: transform; }
  .kobo-float-o      { animation: kobo-planet-float 6.2s 0.7s ease-in-out infinite; will-change: transform; }
  .kobo-float-p      { animation: kobo-planet-float 6.8s 1.3s ease-in-out infinite; will-change: transform; }
  .kobo-flame        { animation: kobo-flame-flicker 0.48s ease-in-out infinite; transform-box: fill-box; transform-origin: 100% 50%; }
  .kobo-halo-active  { animation: kobo-halo-breathe 2.5s ease-in-out infinite; will-change: transform, opacity; }
  .kobo-sun-rays     { animation: kobo-sun-spin 28s linear infinite; transform-box: fill-box; transform-origin: center; will-change: transform; }
  .kobo-gem          { animation: kobo-gem-drift 5.2s ease-in-out infinite; will-change: transform; }

  .kobo-animations-paused *,
  .kobo-animations-paused *::before,
  .kobo-animations-paused *::after {
    animation-play-state: paused !important;
  }

  @media (prefers-reduced-motion: reduce) {
    .kobo-star, .kobo-float-d, .kobo-float-o, .kobo-float-p,
    .kobo-flame, .kobo-halo-active, .kobo-sun-rays, .kobo-gem {
      animation: none !important;
    }
  }
`;
