export interface WaterfallStatueAnchor {
  /** Horizontal center X (in logical canvas CSS pixels) of the waterfall */
  waterfallCenterX: number;
  /** Top Y (in logical canvas CSS pixels) where the waterfall cascade begins */
  waterfallTopY: number;
  /** Width of the waterfall cascade in logical canvas CSS pixels */
  waterfallWidth: number;
  /** Optional scale multiplier (defaults to 1, auto-clamped for mobile/tablet) */
  scale?: number;
  /** Optional animation time for gentle breathing golden aura & glints */
  time?: number;
}

const GOLD_PALETTE = {
  outline: '#1E293B',         // Crisp dark slate vector contour matching playground characters
  outlineSoft: '#334155',     // Finer internal contour for miniature legibility

  // Stepped Stone Plinth & Moss
  plinthLight: '#E2E8F0',     // Upper-right sunlit stone cap
  plinthTop: '#CBD5E1',       // Stone top plane
  plinthFace: '#94A3B8',      // Mid stone front face
  plinthShade: '#64748B',     // Left shaded stone edge
  plinthDeep: '#475569',      // Carved inset shadow
  mossBright: '#84CC16',      // Sunlit moss highlight
  mossLight: '#65A30D',       // Mid moss tuft
  mossDark: '#3F6212',        // Deep moss shadow

  // Bronze Baseplate
  bronzeLight: '#D97706',
  bronzeMid: '#92400E',
  bronzeDark: '#78350F',

  // Tasteful Luminous Gold Aura & Filigree Halo
  auraInner: 'rgba(254, 240, 138, 0.20)',
  auraMid: 'rgba(250, 204, 21, 0.07)',
  auraOuter: 'rgba(245, 158, 11, 0)',
  haloFill: 'rgba(254, 249, 195, 0.30)',
  haloRingOuter: 'rgba(245, 158, 11, 0.80)',
  haloRingInner: 'rgba(254, 240, 138, 0.72)',

  // Sculpted Gilded Robe & Mantle (lit from upper-right)
  robeGleam: '#FFFBEB',       // Specular metallic highlight
  robeSunlit: '#FEF08A',      // Sunlit warm gold face
  robeBody: '#FACC15',        // Luminous mid gold
  robeWarm: '#EAB308',        // Deep warm gold
  robeShadow: '#B45309',      // Shaded bronze-gold fold
  robeCrevice: '#92400E',     // Deep sculpted fold crevice

  mantleLight: '#FDE047',     // Sunlit outer cloak
  mantleMid: '#F59E0B',       // Mid golden cloak
  mantleShadow: '#D97706',    // Shaded drapery
  mantleDeep: '#9A3412',      // Deep bronze underside
  trimGold: '#FEF3C7',        // Embroidered hem & collar trim
  circletBand: '#78350F',     // Braided headcloth band

  // Majestic Long White Beard
  beardWhite: '#FFFFFF',      // Pure white lit beard
  beardPearl: '#F1F5F9',      // Soft mid-tone pearl
  beardShade: '#CBD5E1',      // Cool silver shadow on left
  beardCrease: '#94A3B8',     // Delicate strand definition

  // Wayfarer Cedar & Gold Staff
  staffHighlight: '#B45309',
  staffWood: '#78350F',
  staffDark: '#451A03',
  staffGold: '#FEF08A',
  staffRing: '#F59E0B',
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

/** Draws a crisp 4-point star glint for subtle golden luster */
function drawStarGlint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  alpha: number
) {
  if (alpha <= 0.01) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = `rgba(255, 251, 235, ${alpha})`;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.quadraticCurveTo(0, 0, 0, radius);
  ctx.quadraticCurveTo(0, 0, -radius, 0);
  ctx.quadraticCurveTo(0, 0, 0, -radius);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Draws a dignified, richly detailed flat comic-vector golden statue of Prophet Abraham
 * with a floor-length gilded robe & draped mantle, braided headcloth, long flowing white
 * beard touching the knees, gripped wayfarer staff, sculpted mossy plinth, and a subtle
 * filigree golden halo above the waterfall crest.
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

  // Responsive scale so it stays crisp on mobile (360px+) and balanced on desktop (~26-34px tall)
  const responsiveFactor = Math.max(0.42, Math.min(0.56, (waterfallWidth / 48) * 0.52));
  const s = responsiveFactor * scale;

  // Seat the stone plinth slightly above the top cascade crest so foam never clips the pedestal
  const plinthBottomY = waterfallTopY - Math.round(2.2 * s);

  const headCenterY = -52.5;
  const shoulderY = -44.2;
  const robeBaseY = -12.6;

  ctx.save();
  ctx.translate(waterfallCenterX, plinthBottomY);
  ctx.scale(s, s);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // ── 0. Subtle Breathing Golden Aura & 4-Point Glints ───────────────────────
  const breath = Math.sin(time * 0.045) * 0.03;
  const auraRadius = 18 + Math.sin(time * 0.045) * 1.2;
  const auraGrad = ctx.createRadialGradient(0, -37, 2.5, 0, -37, auraRadius);
  auraGrad.addColorStop(0, `rgba(254, 240, 138, ${0.15 + breath})`);
  auraGrad.addColorStop(0.55, `rgba(250, 204, 21, ${0.06 + breath * 0.5})`);
  auraGrad.addColorStop(1, GOLD_PALETTE.auraOuter);

  ctx.fillStyle = auraGrad;
  ctx.beginPath();
  ctx.arc(0, -37, auraRadius, 0, Math.PI * 2);
  ctx.fill();

  const glints: Array<[number, number, number]> = [
    [-11.5, -45, 2.0],
    [12.5, -49, 2.2],
    [-13.0, -25, 1.7],
    [15.2, -31, 1.8],
  ];
  glints.forEach(([gx, gy, gr], idx) => {
    const phase = (time * 0.07 + idx * 1.65) % (Math.PI * 2);
    const alpha = 0.28 + Math.sin(phase) * 0.18;
    drawStarGlint(ctx, gx, gy, gr, alpha);
  });

  // ── 1. Sculpted 3-Tier Mossy Stone Plinth & Bronze Statue Baseplate ────────
  // Soft grounded contact shadow on cliff ledge
  ctx.fillStyle = 'rgba(15, 23, 42, 0.24)';
  ctx.beginPath();
  ctx.ellipse(0, 1.1, 23.5, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tier 1: Lower stepped stone base
  ctx.fillStyle = GOLD_PALETTE.plinthFace;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  safeRoundRect(ctx, -21, -3.8, 42, 4.0, [1.5, 1.5, 2.0, 2.0]);
  ctx.fill();
  ctx.stroke();

  // Shaded left side of Tier 1 (upper-right sun)
  ctx.fillStyle = GOLD_PALETTE.plinthShade;
  ctx.beginPath();
  safeRoundRect(ctx, -20.2, -3.2, 16, 2.8, [1, 0, 0, 1.4]);
  ctx.fill();

  // Tier 2: Main carved pedestal block
  ctx.fillStyle = GOLD_PALETTE.plinthFace;
  ctx.beginPath();
  safeRoundRect(ctx, -18.5, -9.8, 37, 6.4, 1.5);
  ctx.fill();
  ctx.stroke();

  // Left shadow facet & right sunlit highlight on Tier 2
  ctx.fillStyle = GOLD_PALETTE.plinthShade;
  ctx.fillRect(-17.8, -9.1, 13.5, 5.0);
  ctx.fillStyle = GOLD_PALETTE.plinthTop;
  ctx.fillRect(6.5, -9.1, 11.2, 5.0);

  // Subtle carved relief tablet inset on front face of pedestal
  ctx.fillStyle = 'rgba(71, 85, 105, 0.28)';
  ctx.strokeStyle = GOLD_PALETTE.plinthDeep;
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  safeRoundRect(ctx, -9.5, -8.3, 19, 3.4, 0.8);
  ctx.fill();
  ctx.stroke();

  // Delicate engraved gold line inside relief tablet
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.48)';
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(-6.2, -6.6);
  ctx.lineTo(6.2, -6.6);
  ctx.stroke();

  // Subtle masonry joints
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.35)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-13.5, -9.5);
  ctx.lineTo(-13.5, -3.6);
  ctx.moveTo(13.5, -9.5);
  ctx.lineTo(13.5, -3.6);
  ctx.stroke();

  // Tier 3: Top overhanging cornice cap ledge
  ctx.fillStyle = GOLD_PALETTE.plinthTop;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.45;
  ctx.beginPath();
  safeRoundRect(ctx, -20.5, -12.0, 41, 2.9, 1.4);
  ctx.fill();
  ctx.stroke();

  // Sunlit upper-right stone edge bevel
  ctx.fillStyle = GOLD_PALETTE.plinthLight;
  ctx.fillRect(-2, -11.4, 21.2, 1.2);

  // Warm golden ambient reflection cast by statue onto stone top
  const stoneGlow = ctx.createRadialGradient(0, -11.4, 1, 0, -11.4, 14);
  stoneGlow.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
  stoneGlow.addColorStop(1, 'rgba(254, 240, 138, 0)');
  ctx.fillStyle = stoneGlow;
  ctx.fillRect(-15, -12.0, 30, 2.2);

  // Small stepped bronze statue baseplate seated on top of stone plinth
  const baseGrad = ctx.createLinearGradient(-13, -13.6, 13, -13.6);
  baseGrad.addColorStop(0, GOLD_PALETTE.bronzeDark);
  baseGrad.addColorStop(0.55, GOLD_PALETTE.bronzeMid);
  baseGrad.addColorStop(1, GOLD_PALETTE.bronzeLight);
  ctx.fillStyle = baseGrad;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  safeRoundRect(ctx, -13.2, -13.9, 26.4, 2.2, [1.2, 1.2, 0.4, 0.4]);
  ctx.fill();
  ctx.stroke();

  // Layered moss clusters & trailing lichen on plinth edges
  ctx.fillStyle = GOLD_PALETTE.mossDark;
  ctx.beginPath();
  ctx.ellipse(-16.2, -11.4, 5.2, 1.9, -0.18, 0, Math.PI * 2);
  ctx.ellipse(-18.0, -9.6, 2.2, 1.6, 0.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = GOLD_PALETTE.mossLight;
  ctx.beginPath();
  ctx.ellipse(-15.2, -12.0, 3.8, 1.3, -0.14, 0, Math.PI * 2);
  ctx.ellipse(15.4, -11.5, 4.8, 1.7, 0.14, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = GOLD_PALETTE.mossBright;
  ctx.beginPath();
  ctx.ellipse(16.2, -12.0, 2.8, 1.0, 0.1, 0, Math.PI * 2);
  ctx.fill();

  // ── 2. Intricate Filigree Golden Halo Disc behind Head ─────────────────────
  ctx.save();
  ctx.translate(0, headCenterY - 0.5);

  // Soft translucent golden halo disc
  const haloGrad = ctx.createRadialGradient(1.5, -1.5, 1.5, 0, 0, 9.2);
  haloGrad.addColorStop(0, 'rgba(255, 251, 235, 0.48)');
  haloGrad.addColorStop(0.7, GOLD_PALETTE.haloFill);
  haloGrad.addColorStop(1, 'rgba(250, 204, 21, 0.08)');
  ctx.fillStyle = haloGrad;
  ctx.beginPath();
  ctx.arc(0, 0, 9.0, 0, Math.PI * 2);
  ctx.fill();

  // Delicate radial filigree rays inside halo
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.55)';
  ctx.lineWidth = 0.65;
  for (let i = 0; i < 12; i++) {
    const angle = (i * Math.PI * 2) / 12;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 5.8, Math.sin(angle) * 5.8);
    ctx.lineTo(Math.cos(angle) * 8.4, Math.sin(angle) * 8.4);
    ctx.stroke();
  }

  // Outer gilded ring + fine inner rim
  ctx.strokeStyle = GOLD_PALETTE.haloRingOuter;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.arc(0, 0, 8.9, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = GOLD_PALETTE.haloRingInner;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();

  // ── 3. Floor-Length Flowing Golden Gown / Inner Tunic ──────────────────────
  const robeGrad = ctx.createLinearGradient(-12, -28, 12, -28);
  robeGrad.addColorStop(0, GOLD_PALETTE.robeShadow);
  robeGrad.addColorStop(0.28, GOLD_PALETTE.robeWarm);
  robeGrad.addColorStop(0.68, GOLD_PALETTE.robeBody);
  robeGrad.addColorStop(1, GOLD_PALETTE.robeSunlit);

  ctx.save();
  const traceRobePath = () => {
    ctx.beginPath();
    ctx.moveTo(-11.4, robeBaseY);
    ctx.bezierCurveTo(-12.4, -22, -10.8, -35, -8.2, shoulderY);
    ctx.lineTo(8.2, shoulderY);
    ctx.bezierCurveTo(10.8, -35, 12.4, -22, 11.4, robeBaseY);
    // Subtle scalloped hem curve resting on bronze baseplate
    ctx.quadraticCurveTo(5.5, robeBaseY + 0.9, 0, robeBaseY + 0.3);
    ctx.quadraticCurveTo(-5.5, robeBaseY + 0.9, -11.4, robeBaseY);
    ctx.closePath();
  };

  traceRobePath();
  ctx.fillStyle = robeGrad;
  ctx.fill();

  // Clip interior robe folds, trim, and highlights cleanly inside silhouette
  ctx.save();
  ctx.clip();

  // Deep sculpted left bronze shadow fold
  ctx.fillStyle = 'rgba(146, 64, 14, 0.42)';
  ctx.beginPath();
  ctx.moveTo(-12.5, robeBaseY + 2);
  ctx.quadraticCurveTo(-9.2, -28, -6.4, shoulderY);
  ctx.lineTo(-12.5, shoulderY);
  ctx.closePath();
  ctx.fill();

  // Sunlit metallic right face sheen
  ctx.fillStyle = 'rgba(255, 251, 235, 0.36)';
  ctx.beginPath();
  ctx.moveTo(3.8, robeBaseY + 1);
  ctx.quadraticCurveTo(6.2, -28, 5.2, shoulderY);
  ctx.lineTo(9.8, shoulderY);
  ctx.quadraticCurveTo(11.6, -24, 10.6, robeBaseY + 1);
  ctx.closePath();
  ctx.fill();

  // Sculpted vertical drapery pleats descending to the hem
  const pleatPaths: Array<[number, number, number, number]> = [
    [-5.8, robeBaseY - 0.5, -4.6, -24],
    [-2.4, robeBaseY - 0.3, -2.0, -21],
    [2.4, robeBaseY - 0.3, 2.0, -21],
    [6.0, robeBaseY - 0.5, 4.8, -25],
  ];
  pleatPaths.forEach(([x1, y1, x2, y2], idx) => {
    ctx.strokeStyle = idx < 2 ? 'rgba(120, 53, 15, 0.45)' : 'rgba(180, 83, 9, 0.35)';
    ctx.lineWidth = 0.95;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo((x1 + x2) * 0.5, (y1 + y2) * 0.5, x2, y2);
    ctx.stroke();

    // Fine sunlit highlight ridge next to each pleat
    ctx.strokeStyle = 'rgba(255, 251, 235, 0.48)';
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.moveTo(x1 + 0.9, y1 - 0.5);
    ctx.quadraticCurveTo((x1 + x2) * 0.5 + 0.9, (y1 + y2) * 0.5, x2 + 0.8, y2);
    ctx.stroke();
  });

  // Ornate gilded hem border band along bottom of robe
  ctx.fillStyle = GOLD_PALETTE.robeShadow;
  ctx.fillRect(-12, robeBaseY - 3.4, 24, 3.6);
  ctx.strokeStyle = GOLD_PALETTE.trimGold;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(-11.5, robeBaseY - 2.6);
  ctx.lineTo(11.5, robeBaseY - 2.6);
  ctx.moveTo(-11.5, robeBaseY - 1.1);
  ctx.lineTo(11.5, robeBaseY - 1.1);
  ctx.stroke();

  // Subtle metallic gold rim bounce on far-left shadow edge
  ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-10.6, robeBaseY - 1);
  ctx.bezierCurveTo(-11.5, -22, -10.0, -35, -7.6, shoulderY + 1);
  ctx.stroke();

  ctx.restore(); // end robe clip

  // Crisp outer contour of robe
  traceRobePath();
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ── 4. Draped Outer Golden Mantle / Cloak & Sash ───────────────────────────
  const mantleGrad = ctx.createLinearGradient(-10, -32, 10, -38);
  mantleGrad.addColorStop(0, GOLD_PALETTE.mantleShadow);
  mantleGrad.addColorStop(0.45, GOLD_PALETTE.mantleMid);
  mantleGrad.addColorStop(1, GOLD_PALETTE.mantleLight);

  ctx.save();
  const traceMantlePath = () => {
    ctx.beginPath();
    ctx.moveTo(-9.2, shoulderY + 0.2);
    ctx.quadraticCurveTo(0, -39.5, 9.2, shoulderY + 0.2);
    ctx.quadraticCurveTo(10.4, -33, 8.6, -23.5);
    ctx.quadraticCurveTo(4.2, -20.5, 0, -22.2);
    ctx.quadraticCurveTo(-4.2, -20.5, -8.6, -23.5);
    ctx.quadraticCurveTo(-10.4, -33, -9.2, shoulderY + 0.2);
    ctx.closePath();
  };

  traceMantlePath();
  ctx.fillStyle = mantleGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();

  // Left mantle shadow & right sunlit highlight fold
  ctx.fillStyle = 'rgba(154, 52, 18, 0.34)';
  ctx.beginPath();
  ctx.moveTo(-10.5, shoulderY);
  ctx.quadraticCurveTo(-6.2, -32, -4.4, -20.5);
  ctx.lineTo(-10.5, -20.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = 'rgba(255, 251, 235, 0.38)';
  ctx.beginPath();
  ctx.moveTo(9.4, shoulderY);
  ctx.quadraticCurveTo(5.6, -34, 3.6, -21);
  ctx.lineTo(9.8, -21.5);
  ctx.closePath();
  ctx.fill();

  // Diagonal draped fold line sweeping across torso
  ctx.strokeStyle = 'rgba(146, 64, 14, 0.45)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-8.2, -36);
  ctx.quadraticCurveTo(0, -31.5, 8.2, -37.5);
  ctx.moveTo(-7.8, -27);
  ctx.quadraticCurveTo(0, -24.5, 7.6, -27.8);
  ctx.stroke();

  // Gilded border trim along lower edge of mantle
  ctx.strokeStyle = GOLD_PALETTE.trimGold;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(-8.2, -24.3);
  ctx.quadraticCurveTo(-4.0, -21.6, 0, -23.1);
  ctx.quadraticCurveTo(4.0, -21.6, 8.2, -24.3);
  ctx.stroke();

  ctx.restore(); // end mantle clip

  traceMantlePath();
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();

  // ── 5. Back Sleeve (Viewer's Right) & Wayfarer Shepherd Staff ──────────────
  // Draped right-side arm reaching out to clasp the staff
  ctx.fillStyle = GOLD_PALETTE.mantleMid;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(7.4, -42.2);
  ctx.quadraticCurveTo(12.2, -39.2, 12.2, -33.2);
  ctx.lineTo(9.2, -32.2);
  ctx.quadraticCurveTo(9.0, -36.5, 6.4, -38.6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sunlit crest along sleeve
  ctx.strokeStyle = GOLD_PALETTE.robeGleam;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(8.2, -41.2);
  ctx.quadraticCurveTo(11.3, -38.6, 11.4, -34.2);
  ctx.stroke();

  // Cedar wayfarer staff shaft (planted firmly onto top stone ledge beside baseplate)
  const staffX = 12.4;
  const staffTopY = -55.0;

  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 3.2;
  ctx.beginPath();
  ctx.moveTo(staffX, robeBaseY + 0.8);
  ctx.lineTo(staffX, staffTopY);
  ctx.stroke();

  ctx.strokeStyle = GOLD_PALETTE.staffWood;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.moveTo(staffX, robeBaseY + 0.4);
  ctx.lineTo(staffX, staffTopY + 0.4);
  ctx.stroke();

  // Sunlit cedar wood grain highlight on right side of shaft
  ctx.strokeStyle = GOLD_PALETTE.staffHighlight;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(staffX + 0.45, robeBaseY);
  ctx.lineTo(staffX + 0.45, staffTopY + 1);
  ctx.stroke();

  // Decorative gold ferrule collar rings on staff (base, grip, and crown)
  const ferruleYs = [robeBaseY - 1.5, -30.5, -35.8, -51.6];
  ferruleYs.forEach((fy) => {
    ctx.fillStyle = GOLD_PALETTE.staffRing;
    ctx.strokeStyle = GOLD_PALETTE.outline;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    safeRoundRect(ctx, staffX - 1.45, fy - 0.8, 2.9, 1.6, 0.5);
    ctx.fill();
    ctx.stroke();
  });

  // Ornate gilded staff finial crown & radiant orb
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.25;
  ctx.fillStyle = GOLD_PALETTE.mantleMid;
  ctx.beginPath();
  ctx.moveTo(staffX - 2.3, -53.2);
  ctx.quadraticCurveTo(staffX, -51.8, staffX + 2.3, -53.2);
  ctx.lineTo(staffX + 1.5, -54.8);
  ctx.lineTo(staffX - 1.5, -54.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const orbGrad = ctx.createRadialGradient(staffX + 0.9, -57.2, 0.4, staffX, -56.4, 2.8);
  orbGrad.addColorStop(0, '#FFFFFF');
  orbGrad.addColorStop(0.45, GOLD_PALETTE.staffGold);
  orbGrad.addColorStop(1, GOLD_PALETTE.staffRing);
  ctx.fillStyle = orbGrad;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(staffX, -56.4, 2.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tiny crisp star gleam on staff finial
  drawStarGlint(ctx, staffX + 1.2, -57.8, 2.4, 0.85);

  // Sculpted hand gripping the staff (drawn OVER shaft so fingers clasp it)
  ctx.fillStyle = GOLD_PALETTE.robeSunlit;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  safeRoundRect(ctx, staffX - 2.0, -34.6, 3.6, 3.1, 1.3);
  ctx.fill();
  ctx.stroke();

  // Subtle finger crease lines on gripping hand
  ctx.strokeStyle = GOLD_PALETTE.robeShadow;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(staffX - 0.2, -33.6);
  ctx.lineTo(staffX + 1.1, -33.6);
  ctx.moveTo(staffX - 0.2, -32.5);
  ctx.lineTo(staffX + 1.1, -32.5);
  ctx.stroke();

  // ── 6. Serene Arm Resting Near Heart (Viewer's Left) ───────────────────────
  ctx.fillStyle = GOLD_PALETTE.mantleShadow;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.moveTo(-7.6, -42.0);
  ctx.quadraticCurveTo(-12.6, -37.2, -10.8, -32.4);
  ctx.quadraticCurveTo(-9.0, -30.5, -5.8, -32.0);
  ctx.lineTo(-5.8, -34.8);
  ctx.quadraticCurveTo(-8.2, -35.2, -6.6, -38.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Gilded cuff trim on sleeve
  ctx.strokeStyle = GOLD_PALETTE.trimGold;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-6.4, -34.6);
  ctx.lineTo(-6.4, -32.1);
  ctx.stroke();

  // Serene hand resting peacefully near the heart
  ctx.fillStyle = GOLD_PALETTE.robeBody;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.15;
  ctx.beginPath();
  ctx.ellipse(-5.1, -33.4, 2.2, 1.65, -0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Sunlit highlight on back of hand
  ctx.fillStyle = GOLD_PALETTE.robeSunlit;
  ctx.beginPath();
  ctx.arc(-4.7, -33.8, 0.85, 0, Math.PI * 2);
  ctx.fill();

  // ── 7. Back Headcloth Drape, Dignified Face & Braided Circlet ──────────────
  // 7a) Back flowing drape of headcloth falling behind neck onto shoulders
  const drapeGrad = ctx.createLinearGradient(-8, -46, 8, -46);
  drapeGrad.addColorStop(0, GOLD_PALETTE.mantleShadow);
  drapeGrad.addColorStop(0.55, GOLD_PALETTE.mantleMid);
  drapeGrad.addColorStop(1, GOLD_PALETTE.mantleLight);

  ctx.fillStyle = drapeGrad;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-6.2, headCenterY - 1.0);
  ctx.quadraticCurveTo(-8.8, -46.2, -8.5, -39.8);
  ctx.quadraticCurveTo(-4.0, -38.6, 0, -39.2);
  ctx.quadraticCurveTo(4.0, -38.6, 8.5, -39.8);
  ctx.quadraticCurveTo(8.8, -46.2, 6.2, headCenterY - 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Subtle side drapery creases on headcloth tails
  ctx.strokeStyle = 'rgba(146, 64, 14, 0.42)';
  ctx.lineWidth = 0.75;
  ctx.beginPath();
  ctx.moveTo(-6.6, -47.5);
  ctx.quadraticCurveTo(-7.2, -43.5, -6.4, -40.2);
  ctx.moveTo(6.6, -47.5);
  ctx.quadraticCurveTo(7.2, -43.5, 6.4, -40.2);
  ctx.stroke();

  // 7b) Sculpted Golden Face Oval (lit softly from upper-right)
  const faceGrad = ctx.createRadialGradient(1.6, headCenterY - 1.4, 0.8, 0, headCenterY, 5.4);
  faceGrad.addColorStop(0, GOLD_PALETTE.robeGleam);
  faceGrad.addColorStop(0.52, GOLD_PALETTE.robeSunlit);
  faceGrad.addColorStop(1, GOLD_PALETTE.robeWarm);

  ctx.fillStyle = faceGrad;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.35;
  ctx.beginPath();
  ctx.ellipse(0, headCenterY + 0.2, 4.7, 5.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Dignified brows, calm eyes & subtle nose bridge
  ctx.strokeStyle = GOLD_PALETTE.robeShadow;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-2.7, headCenterY - 1.7);
  ctx.quadraticCurveTo(-1.7, headCenterY - 2.3, -0.7, headCenterY - 1.7);
  ctx.moveTo(0.7, headCenterY - 1.7);
  ctx.quadraticCurveTo(1.7, headCenterY - 2.3, 2.7, headCenterY - 1.7);
  ctx.stroke();

  // Calm serene statue eyes
  ctx.fillStyle = GOLD_PALETTE.outline;
  ctx.beginPath();
  ctx.arc(-1.65, headCenterY - 0.5, 0.78, 0, Math.PI * 2);
  ctx.arc(1.65, headCenterY - 0.5, 0.78, 0, Math.PI * 2);
  ctx.fill();

  // Subtle nose ridge contour
  ctx.strokeStyle = 'rgba(180, 83, 9, 0.55)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(0, headCenterY - 0.8);
  ctx.lineTo(-0.3, headCenterY + 0.7);
  ctx.lineTo(0.4, headCenterY + 0.9);
  ctx.stroke();

  // 7c) Upper Headcloth Hood framing forehead cleanly (never cutting across face)
  ctx.fillStyle = drapeGrad;
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(-5.8, headCenterY - 1.8);
  ctx.arc(0, headCenterY - 1.4, 5.9, Math.PI * 1.02, Math.PI * 1.98);
  ctx.quadraticCurveTo(4.8, headCenterY - 2.6, 3.6, headCenterY - 3.6);
  ctx.quadraticCurveTo(0, headCenterY - 4.7, -3.6, headCenterY - 3.6);
  ctx.quadraticCurveTo(-4.8, headCenterY - 2.6, -5.8, headCenterY - 1.8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Sunlit crown highlight on upper-right of headcloth
  ctx.fillStyle = GOLD_PALETTE.robeGleam;
  ctx.beginPath();
  ctx.ellipse(2.0, headCenterY - 5.6, 2.2, 0.9, 0.35, 0, Math.PI * 2);
  ctx.fill();

  // Traditional braided double-cord circlet / headband (agal) securing headcloth
  ctx.strokeStyle = GOLD_PALETTE.outline;
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(-5.5, headCenterY - 3.4);
  ctx.quadraticCurveTo(0, headCenterY - 5.3, 5.5, headCenterY - 3.4);
  ctx.stroke();

  ctx.strokeStyle = GOLD_PALETTE.circletBand;
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(-5.2, headCenterY - 3.4);
  ctx.quadraticCurveTo(0, headCenterY - 5.2, 5.2, headCenterY - 3.4);
  ctx.stroke();

  // Tiny gold thread glints along the braided band
  ctx.strokeStyle = GOLD_PALETTE.robeSunlit;
  ctx.lineWidth = 0.65;
  ctx.beginPath();
  ctx.moveTo(-2.2, headCenterY - 4.2);
  ctx.lineTo(-0.8, headCenterY - 4.4);
  ctx.moveTo(1.2, headCenterY - 4.3);
  ctx.lineTo(2.8, headCenterY - 4.0);
  ctx.stroke();

  // ── 8. Majestic Long White Beard Touching the Knees (y = -22) ──────────────
  // Soft drop shadow cast by the long white beard onto the golden mantle/robe
  ctx.fillStyle = 'rgba(120, 53, 15, 0.24)';
  ctx.beginPath();
  ctx.moveTo(-3.4, headCenterY + 2.2);
  ctx.bezierCurveTo(-5.2, -41, -4.6, -29, -2.2, -21.5);
  ctx.quadraticCurveTo(0.2, -19.8, 2.4, -21.8);
  ctx.bezierCurveTo(4.4, -29, 4.8, -41, 3.2, headCenterY + 2.2);
  ctx.closePath();
  ctx.fill();

  // Main flowing sculpted white beard body cascading gracefully to knee level (y = -22)
  ctx.save();
  const traceBeardPath = () => {
    ctx.beginPath();
    ctx.moveTo(-3.8, headCenterY + 0.8);
    ctx.bezierCurveTo(-5.4, -44.5, -5.0, -34.5, -3.5, -26.8);
    ctx.quadraticCurveTo(-2.7, -23.0, -1.6, -22.0);
    ctx.quadraticCurveTo(0, -20.4, 1.6, -22.0);
    ctx.quadraticCurveTo(2.7, -23.0, 3.5, -26.8);
    ctx.bezierCurveTo(5.0, -34.5, 5.4, -44.5, 3.8, headCenterY + 0.8);
    ctx.quadraticCurveTo(1.8, headCenterY + 2.6, 0, headCenterY + 2.2);
    ctx.quadraticCurveTo(-1.8, headCenterY + 2.6, -3.8, headCenterY + 0.8);
    ctx.closePath();
  };

  const beardGrad = ctx.createLinearGradient(-4.6, -36, 4.6, -36);
  beardGrad.addColorStop(0, GOLD_PALETTE.beardShade);
  beardGrad.addColorStop(0.35, GOLD_PALETTE.beardPearl);
  beardGrad.addColorStop(0.7, GOLD_PALETTE.beardWhite);
  beardGrad.addColorStop(1, GOLD_PALETTE.beardWhite);

  traceBeardPath();
  ctx.fillStyle = beardGrad;
  ctx.fill();

  // Clip layered silver-white lock shading inside the beard silhouette
  ctx.save();
  ctx.clip();

  // Soft shaded left contour lock (matching upper-right sun)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.30)';
  ctx.beginPath();
  ctx.moveTo(-5.5, headCenterY);
  ctx.quadraticCurveTo(-2.2, -36, -0.6, -20.5);
  ctx.lineTo(-5.5, -20.5);
  ctx.closePath();
  ctx.fill();

  // Luminous pure-white sunlit center-right wave lock
  ctx.fillStyle = GOLD_PALETTE.beardWhite;
  ctx.beginPath();
  ctx.moveTo(0.2, headCenterY + 2.0);
  ctx.quadraticCurveTo(3.6, -36, 1.2, -21.5);
  ctx.quadraticCurveTo(0.4, -22.0, -0.4, -21.8);
  ctx.quadraticCurveTo(1.4, -35, 0.2, headCenterY + 2.0);
  ctx.closePath();
  ctx.fill();

  // Flowing multi-strand sculptural hair lines
  ctx.strokeStyle = GOLD_PALETTE.beardCrease;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-2.2, headCenterY + 3.2);
  ctx.bezierCurveTo(-3.4, -41, -2.9, -31, -1.6, -23.0);
  ctx.moveTo(-0.3, headCenterY + 3.8);
  ctx.bezierCurveTo(-0.9, -40, 0.6, -30, 0.0, -22.2);
  ctx.moveTo(2.0, headCenterY + 3.2);
  ctx.bezierCurveTo(3.2, -41, 2.7, -31, 1.5, -23.0);
  ctx.stroke();

  ctx.restore(); // end beard clip

  traceBeardPath();
  ctx.strokeStyle = GOLD_PALETTE.outlineSoft;
  ctx.lineWidth = 1.05;
  ctx.stroke();

  // Sculpted flowing white moustache bridging upper lip into cheek whiskers
  ctx.fillStyle = GOLD_PALETTE.beardWhite;
  ctx.strokeStyle = GOLD_PALETTE.outlineSoft;
  ctx.lineWidth = 0.85;
  ctx.beginPath();
  ctx.moveTo(0, headCenterY + 1.3);
  ctx.quadraticCurveTo(-2.0, headCenterY + 0.8, -3.5, headCenterY + 2.6);
  ctx.quadraticCurveTo(-1.7, headCenterY + 3.2, 0, headCenterY + 2.3);
  ctx.quadraticCurveTo(1.7, headCenterY + 3.2, 3.5, headCenterY + 2.6);
  ctx.quadraticCurveTo(2.0, headCenterY + 0.8, 0, headCenterY + 1.3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore(); // end beard save

  ctx.restore(); // end statue transform
}
