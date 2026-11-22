export interface WaterfallStatueAnchor {
  /** Horizontal center X (in logical canvas CSS pixels) of the waterfall */
  waterfallCenterX: number;
  /** Top Y (in logical canvas CSS pixels) where the waterfall cascade begins */
  waterfallTopY: number;
  /** Width of the waterfall cascade in logical canvas CSS pixels */
  waterfallWidth: number;
  /** Optional scale multiplier (defaults to 1, auto-clamped for mobile/tablet) */
  scale?: number;
  /** Optional animation time for gentle breathing golden aura */
  time?: number;
}

const GOLD_PALETTE = {
  outline: '#1E293B',         // Crisp dark slate vector contour matching playground characters
  mossDark: '#3F6212',        // Deep moss plinth shadow
  mossLight: '#65A30D',       // Sunlit moss highlight
  plinthFace: '#94A3B8',      // Stepped stone plinth front face
  plinthTop: '#CBD5E1',       // Sunlit stone plinth cap
  plinthShade: '#64748B',     // Shaded stone edge

  // Luminous Gold Statue Palette (Refined, tasteful radiance)
  auraInner: 'rgba(254, 240, 138, 0.38)',   // Soft luminous gold center
  auraMid: 'rgba(250, 204, 21, 0.16)',     // Gentle gold mid
  auraOuter: 'rgba(245, 158, 11, 0)',       // Seamless transparent falloff
  haloFill: 'rgba(254, 240, 138, 0.28)',    // Delicate golden halo disc
  haloRing: 'rgba(245, 158, 11, 0.75)',     // Gilded halo rim outline

  robeHighlight: '#FFFBEB',   // Gleaming gold highlight on robe crests
  robeSunlit: '#FEF08A',      // Sunlit gold front face
  robeBody: '#FACC15',        // Luminous warm gold body
  robeShade: '#EAB308',       // Deep amber-gold robe body
  robeShadow: '#B45309',      // Rich bronze-gold shadow fold

  mantleLight: '#FDE047',     // Sunlit gold mantle
  mantleMid: '#F59E0B',       // Flowing outer golden cloak
  mantleShadow: '#D97706',    // Shaded golden drapery

  // Majestic Long White Beard
  beardWhite: '#FFFFFF',      // Pure white beard
  beardShade: '#E2E8F0',      // Soft silver-white fold shadow
  beardCrease: '#CBD5E1',     // Delicate silver crease

  staffWood: '#78350F',       // Polished cedar staff
  staffGold: '#FEF08A',       // Gilded staff finial
  staffRing: '#F59E0B',       // Gold ferrule
};

function safeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number | number[]
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radii);
  } else {
    ctx.rect(x, y, w, h);
  }
}

/**
 * Draws a small, dignified, flat comic-vector statue of Prophet Abraham
 * with a long flowing gold gown, a long flowing white beard touching the knees,
 * and a tasteful soft golden aura above the waterfall crest.
 */
export function drawAbrahamStatueAboveWaterfall(
  ctx: CanvasRenderingContext2D,
  anchor: WaterfallStatueAnchor
): void {
  const {
    waterfallCenterX,
    waterfallTopY,
    waterfallWidth,
    scale = 1,
    time = 0,
  } = anchor;

  // Responsive scale so it stays crisp on mobile (360px+) and balanced on desktop (~26-30px tall)
  const responsiveFactor = Math.max(0.42, Math.min(0.55, (waterfallWidth / 48) * 0.52));
  const s = responsiveFactor * scale;

  // Sit the stone plinth slightly above the top cascade edge so foam never clips into the figure
  const plinthBottomY = waterfallTopY - Math.round(2.5 * s);

  ctx.save();
  ctx.translate(waterfallCenterX, plinthBottomY);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── 0. Luminous Golden Radiant Aura ("reduce the statue glow a bit") ──────────
  const auraRadius = 13;
  const auraGrad = ctx.createRadialGradient(0, -32, 2, 0, -32, auraRadius);
  auraGrad.addColorStop(0, 'rgba(254, 240, 138, 0.12)');
  auraGrad.addColorStop(0.60, 'rgba(250, 204, 21, 0.04)');
  auraGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');

  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(0, -32, auraRadius, 0, Math.PI * 2);
  ctx.fill();

  // Subtle golden sparkles in aura
  const sparkleOffsets = [
    [-9, -40, 0.8],
    [10, -36, 0.7],
    [-11, -22, 0.8],
    [11, -20, 0.8],
  ];
  sparkleOffsets.forEach(([sx, sy, sr], idx) => {
    const spTime = (time * 0.08 + idx * 1.5) % (Math.PI * 2);
    const spAlpha = 0.16 + Math.sin(spTime) * 0.12;
    ctx.fillStyle = `rgba(254, 240, 138, ${spAlpha})`;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  });

  // ── 1. Mossy Stone Plinth / Pedestal ──────────────────────────────────────
  // Base shadow
  ctx.fillStyle = 'rgba(15, 23, 42, 0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 1, 23, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main stepped stone block
  ctx.fillStyle = GOLD_PALETTE.plinthFace;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  safeRoundRect(ctx, -19, -8, 38, 8, 2.5);
  ctx.fill();
  ctx.stroke();

  // Shaded right half of plinth
  ctx.fillStyle = GOLD_PALETTE.plinthShade;
  ctx.beginPath();
  safeRoundRect(ctx, 2, -8, 17, 8, [0, 2.5, 2.5, 0]);
  ctx.fill();

  // Top cap ledge with warm sunlit stone lip
  ctx.fillStyle = GOLD_PALETTE.plinthTop;
  ctx.beginPath();
  safeRoundRect(ctx, -21, -11, 42, 3.5, 2);
  ctx.fill();
  ctx.stroke();

  // Small moss tufts hugging stone corners
  ctx.fillStyle = GOLD_PALETTE.mossLight;
  ctx.beginPath();
  ctx.ellipse(-15, -10.5, 5.5, 2.0, -0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = GOLD_PALETTE.mossDark;
  ctx.beginPath();
  ctx.ellipse(14, -10, 5, 1.8, 0.12, 0, Math.PI * 2);
  ctx.fill();

  // ── 2. Delicate Golden Halo Disc behind Head ──────────────────────────────
  const headCenterY = -52;
  ctx.save();
  ctx.fillStyle = GOLD_PALETTE.haloFill;
  ctx.strokeStyle = GOLD_PALETTE.haloRing;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, headCenterY - 0.5, 8.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // ── 3. Long Flowing Traditional Wear ("long wear" from y = -11 up to y = -45) ──
  const robeBaseY = -11;
  const shoulderY = -44;

  // Outer flowing robe silhouette (elongated floor-length gown)
  ctx.fillStyle = GOLD_PALETTE.robeBody;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-11.5, robeBaseY);
  ctx.quadraticCurveTo(-12.5, -28, -8, shoulderY);
  ctx.lineTo(8, shoulderY);
  ctx.quadraticCurveTo(12.5, -28, 11.5, robeBaseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sunlit warm gold front face (matches upper-right Sun illumination)
  ctx.fillStyle = GOLD_PALETTE.robeSunlit;
  ctx.beginPath();
  ctx.moveTo(-10.2, robeBaseY - 0.5);
  ctx.quadraticCurveTo(-11.2, -28, -7, shoulderY + 1);
  ctx.lineTo(-0.5, shoulderY + 1);
  ctx.lineTo(-1.8, robeBaseY - 0.5);
  ctx.closePath();
  ctx.fill();

  // Shaded right bronze-gold drape fold
  ctx.fillStyle = GOLD_PALETTE.robeShadow;
  ctx.beginPath();
  ctx.moveTo(3.2, robeBaseY - 0.5);
  ctx.lineTo(3.8, shoulderY + 1);
  ctx.lineTo(7.2, shoulderY + 1);
  ctx.quadraticCurveTo(11.2, -28, 10.2, robeBaseY - 0.5);
  ctx.closePath();
  ctx.fill();

  // Gilded highlight line on the left crest
  ctx.strokeStyle = GOLD_PALETTE.robeHighlight;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-9.5, robeBaseY - 1);
  ctx.quadraticCurveTo(-10.5, -28, -6.8, shoulderY + 2);
  ctx.stroke();

  // Elegant long vertical sculpted robe pleats extending to the floor
  ctx.strokeStyle = 'rgba(180, 83, 9, 0.40)';
  ctx.lineWidth = 1.0;
  ctx.beginPath();
  ctx.moveTo(-4.5, robeBaseY - 1);
  ctx.lineTo(-3.0, -32);
  ctx.moveTo(4.5, robeBaseY - 1);
  ctx.lineTo(3.0, -32);
  ctx.stroke();

  // ── 4. Flowing Outer Mantle / Cloak draped across shoulders & back ─────────
  ctx.fillStyle = GOLD_PALETTE.mantleMid;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-9.5, shoulderY);
  ctx.quadraticCurveTo(0, -38.5, 9.5, shoulderY);
  ctx.lineTo(8.0, -22);
  ctx.quadraticCurveTo(4.0, -18, 0, -20);
  ctx.quadraticCurveTo(-4.0, -18, -8.0, -22);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Mantle sunlit highlight on left
  ctx.fillStyle = GOLD_PALETTE.mantleLight;
  ctx.beginPath();
  ctx.moveTo(-9.0, shoulderY + 0.5);
  ctx.quadraticCurveTo(-5.0, -34, -1.0, -21);
  ctx.lineTo(-6.8, -21.5);
  ctx.quadraticCurveTo(-8.2, -28, -9.0, shoulderY + 0.5);
  ctx.closePath();
  ctx.fill();

  // Right arm gently resting near the heart in a serene, peaceful stance
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  ctx.moveTo(-8.0, -41);
  ctx.quadraticCurveTo(-12.5, -35, -9.0, -29);
  ctx.stroke();

  ctx.strokeStyle = GOLD_PALETTE.mantleMid;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(-8.0, -41);
  ctx.quadraticCurveTo(-12.5, -35, -9.0, -29);
  ctx.stroke();

  // Serene hand resting near chest
  ctx.fillStyle = GOLD_PALETTE.robeSunlit;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(-8.8, -28.8, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // ── 5. Shepherd / Wayfarer Staff on Viewer's Right ────────────────────────
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(11.2, robeBaseY);
  ctx.lineTo(11.2, -54);
  ctx.stroke();

  ctx.strokeStyle = GOLD_PALETTE.staffWood;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(11.2, robeBaseY - 0.5);
  ctx.lineTo(11.2, -53.5);
  ctx.stroke();

  // Glowing golden staff finial orb
  ctx.fillStyle = GOLD_PALETTE.staffGold;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(11.2, -55.2, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Staff golden highlight gleam
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(10.5, -55.9, 0.8, 0, Math.PI * 2);
  ctx.fill();

  // ── 6. Dignified Head & Traditional Flowing Headcloth / Mantle ─────────────
  // Base golden face oval
  ctx.fillStyle = GOLD_PALETTE.robeSunlit;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, headCenterY, 5.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Traditional flowing headcloth / mantle framing head and shoulders
  ctx.fillStyle = GOLD_PALETTE.mantleMid;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-6.4, headCenterY - 0.5);
  ctx.arc(0, headCenterY - 0.5, 6.4, Math.PI * 0.95, Math.PI * 2.05);
  ctx.quadraticCurveTo(7.8, -45, 8.8, -39.5);
  ctx.lineTo(5.0, -39.5);
  ctx.quadraticCurveTo(5.2, -45, 4.0, headCenterY + 2.0);
  ctx.lineTo(-4.0, headCenterY + 2.0);
  ctx.quadraticCurveTo(-5.2, -45, -7.8, -40.5);
  ctx.quadraticCurveTo(-8.4, -45, -6.4, headCenterY - 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sunlit gold crest on headcloth
  ctx.fillStyle = GOLD_PALETTE.mantleLight;
  ctx.beginPath();
  ctx.arc(0, headCenterY - 0.5, 5.6, Math.PI * 1.1, Math.PI * 1.6);
  ctx.lineTo(0, headCenterY - 6.0);
  ctx.closePath();
  ctx.fill();

  // Minimalist serene statue eyes
  ctx.fillStyle = GOLD_PALETTE.outline;
  ctx.beginPath();
  ctx.arc(-1.6, headCenterY - 0.3, 0.85, 0, Math.PI * 2);
  ctx.arc(1.6, headCenterY - 0.3, 0.85, 0, Math.PI * 2);
  ctx.fill();

  // ── 7. Long White Beard Touching the Knee ("beard should be long and should touch the statue knee and it should be white beard") ──
  // The knees are at y ≈ -22 to -23. The beard starts at y = headCenterY + 1.2 (-50.8) and flows gracefully to y = -22!
  ctx.save();
  ctx.fillStyle = GOLD_PALETTE.beardWhite;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  // Start under cheeks
  ctx.moveTo(-3.0, headCenterY + 1.5);
  // Flow gently inward at neck, then cascade gracefully over chest to knees (y = -22)
  ctx.quadraticCurveTo(-4.8, -36, -2.6, -22);
  // Tapered dignified rounded beard tip at the knees
  ctx.quadraticCurveTo(0, -20.2, 2.6, -22);
  // Flow back up right side past right cheek
  ctx.quadraticCurveTo(4.8, -36, 3.0, headCenterY + 1.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Soft silver-white shaded right side of the beard for dimensional depth
  ctx.fillStyle = GOLD_PALETTE.beardShade;
  ctx.beginPath();
  ctx.moveTo(0.4, headCenterY + 1.8);
  ctx.lineTo(3.0, headCenterY + 1.5);
  ctx.quadraticCurveTo(4.8, -36, 2.6, -22);
  ctx.quadraticCurveTo(1.2, -20.8, 0.4, -21.4);
  ctx.quadraticCurveTo(1.8, -34, 0.4, headCenterY + 1.8);
  ctx.closePath();
  ctx.fill();

  // Subtle natural flowing beard strand lines
  ctx.strokeStyle = GOLD_PALETTE.beardCrease;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(-1.0, headCenterY + 3.5);
  ctx.quadraticCurveTo(-1.6, -34, -0.8, -23);
  ctx.moveTo(1.0, headCenterY + 3.5);
  ctx.quadraticCurveTo(1.6, -34, 0.8, -23);
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}
