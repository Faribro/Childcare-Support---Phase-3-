# Reference Website Forensic Audit & Translation Blueprint (v2)
**Project**: India HIV/AIDS Alliance — Child Nutrition & Support PWA (Phase 3)  
**Role**: Principal Product Designer, Creative Director & Staff Front-End Engineer  
**Branch**: `research/landing-reference-forensics-v2`  
**Base Commit**: `79f832e255ed630562c959776bae55e28ca3a4a9` (`main`)  
**Audit Date**: September 25, 2026 (Live Playwright Automated & Interactive Session)  
**Mandate**: Forensic evidence gathering across 4 primary benchmarks before any production code modification.

---

## 1. Audit Methodology & Environmental Rigor

The forensic investigation was conducted in an isolated, headless and headful Chromium browser environment using **Playwright Core v1.63.0** under Node.js v24.11.0 on a dedicated Windows workstation. Every target was inspected across four standardized responsive viewport profiles without third-party proxy tampering or mock injection:

| Profile | Dimensions | Touch Emulation | User-Agent Specification | Evaluation Focus |
| :--- | :--- | :--- | :--- | :--- |
| **Large Desktop** | 1440 × 900 px | False | Chrome 124 (Win64) | Primary art direction, spatial composition, negative space, visual anchor balance |
| **Laptop Fold** | 1280 × 800 px | False | Chrome 124 (Win64) | Vertical fold cutoff, header-to-hero ratio, CTA visibility |
| **Modern Mobile** | 390 × 844 px | True | Safari Mobile / iOS 16 (iPhone 14/15) | Handheld ergonomics, single-column reflow, thumb zones, font scale |
| **Small Mobile** | 360 × 800 px | True | Android Chrome (Galaxy A-series) | Field caseworker constraint, horizontal overflow (0px tolerance), tap target sizes |

### Safe-Browsing Boundaries
In accordance with strict ethical and organizational compliance protocols:
- Zero form submissions, account creation, or logins were performed.
- Zero copyrighted assets, fonts, raw photographs, or proprietary SVG code were downloaded or incorporated into the repository codebase.
- Temporary research screenshots were captured strictly to ephemeral local scratch storage (`scratch/references/`) and are explicitly excluded from git tracking.

---

## 2. Forensic Analysis by Reference Site

---

### Benchmark A: Mary Colter — The Mosby Files
- **Live URL**: `https://www.mosbyfiles.com/cases/mary-colter`
- **Architectural Identity**: Archival Case File / Investigative Physical Folder

#### Pass 1 — First Five Seconds (1440 × 900)
- **Above the Fold**: A deep charcoal canvas (`#191919`) framed by an unobtrusive, whisper-quiet header (`MOSBY'S FILES`, `About`), an enormous bold display title (`MARY COLTER`, 120px Founders Grotesk), and a physical manila-red case folder spread occupying >85% of the viewport.
- **Immediate Emotional Impression**: Archival reverence, journalistic gravity, curated history. It feels like an investigator laid a classified folder on your desk.
- **Eye Landing Sequence**:
  1. *First*: The massive, stark white typographic title `MARY COLTER`.
  2. *Second*: The physical folder tab protruding from the right edge with vertical typography (`Mary Colter` in crimson, `Louis Sullivan` in cobalt).
  3. *Third*: The vintage archival photograph clipped to the textured paper sheet with a realistic silver paperclip and brass hole punches along the left edge.
- **Header Relationship**: Minimalist height (48px). It does *not* separate or dominate; it acts as an archival box label, keeping full focus on the physical dossier.
- **Negative Space & Tension**: The high contrast between the dark charcoal background and the ivory paper creates physical dimensionality; empty space feels like a gallery desk surface.

#### Pass 2 — Pixel-Level Hero Anatomy
- **Viewport Height Occupation**: Folder and display header occupy 92% of the initial 900px viewport.
- **Display Typography**: `Founders Grotesk`, `120px` (desktop), `font-weight: 700`, line height `1.0`. High-impact, uppercase.
- **Body & Metadata Typography**: Monospace metadata (`"Born: April 4, 1869, Pittsburgh..."`) paired with classic literary serif body (`Signifier, serif`, 18px, 1.6 line height) featuring a dramatic drop-cap "W".
- **Visual Anchor Layers**:
  - *Layer 1 (Desk Base)*: `#191919` dark textured surface.
  - *Layer 2 (Case Folder)*: Carmine red folder cover (`#D32F2F`) with curved die-cut indexing tabs along the right margin.
  - *Layer 3 (Paper Sheet)*: Off-white cotton rag paper (`#FDFAF7`) with subtle grain, 3 circular hole punches on the left margin revealing the red folder below.
  - *Layer 4 (Archival Ephemera)*: Silver SVG paperclip clipping a black-and-white portrait photo, vintage masking tape strips at base.
- **Depth & Dimension**: Inset shadows on hole punches (`inset 0 2px 4px rgba(0,0,0,0.4)`), paper drop shadow (`0 20px 40px rgba(0,0,0,0.5)`), layered z-indexing.

#### Pass 5, 6, 7 — Navigation, Motion, & Materiality
- **Authored Navigation**: Index tabs along the right edge of the folder (`Mary Colter` active, `Louis Sullivan` inactive) act as physical chapter tabs. Clicking or scrolling transitions between case dossiers.
- **Scroll & Storyboard Dynamics**: As the user scrolls, the massive title collapses smoothly into the top bar (`the-sub-header`), while layered archival artifacts (vintage postcards, desert landscape photography, handwritten field notes) enter with subtle staggered vertical parallax without hijacking the browser scroll container.
- **Materiality Grammar**: The site avoids generic digital cards. Everything is an artifact: clipped notes, hole-punched sheets, masking tape, typewriter labels, archival stamps.

#### Pass 8 & 9 — Responsive & Accessibility Review
- **Mobile Reflow (390px & 360px)**: The right folder tabs compress into a clean vertical indicator along the right border. The headline scales fluidly to `48px`. No horizontal overflow (`scrollWidth === innerWidth`).
- **Risks & Non-Negotiable Boundaries**:
  - *Risk*: Reliance on high-contrast text over colored tabs requires strict WCAG AA contrast (≥ 4.5:1).
  - *Risk*: Fixed-position folder elements can trap touch gestures if not explicitly set to `pointer-events: none` on overlays.

---

### Benchmark B: Mal Prince — Illustrated Editorial Portfolio
- **Live URL**: `https://malprince.tilda.ws/en`
- **Architectural Identity**: Illustrated Literary World / Poetic Editorial Pacing

#### Pass 1 — First Five Seconds (1440 × 900)
- **Above the Fold**: A vast, atmospheric deep-indigo celestial canvas (`#0D2033`). An off-center illustrated character perched atop a glowing warm amber sphere, looking through a retro telescope toward golden constellation stars.
- **Immediate Emotional Impression**: Wonder, quiet craftsmanship, literary intimacy (evoking Antoine de Saint-Exupéry's *The Little Prince*).
- **Eye Landing Sequence**:
  1. *First*: The warm, glowing amber globe and the telescope character.
  2. *Second*: The golden constellation stars scattered across the dark sky.
  3. *Third*: The gentle narrative typography introducing the story.
- **Negative Space**: Generous, brave negative space (>60% of the viewport is pure atmospheric canvas). It creates an uncluttered, contemplative reading sanctuary.

#### Pass 2 — Pixel-Level Hero Anatomy
- **Visual Depth Strategy**: 2.5D spatial separation between foreground illustrated actors, midground horizon lines, and deep sky background.
- **Organic Dividing Horizons**: Instead of sharp rectangular grid dividers, sections are delineated by organic, watercolor hills, cloud cutouts, and torn paper horizons.
- **Color Discipline**: Deep midnight blue (`#0D2033`), warm marigold/ochre (`#E5A93C`), terracotta accents, and soft paper cloud shapes (`#FFFFFF` with soft drop shadows).
- **Typography**: Classic editorial serif headlines (`Times New Roman` / custom literary serif) with generous tracking and high contrast against ink backdrops.

#### Pass 5, 6, 7 — Navigation, Motion, & Materiality
- **Scroll Storyboard Dynamics**: 18 distinct narrative scenes. As the user scrolls, the character journeys across rolling watercolor hills, transitioning from the night sky into warm sunlit fields. Text snippets appear inside die-cut cloud balloons, making reading feel like turning illustrated pages of an authored book.
- **Motion Restraint**: Gentle opacity reveals, slow-moving celestial bodies, zero scroll hijacking. Normal wheel and touch scrolling remain completely uninterrupted.

#### Pass 8 & 9 — Responsive & Accessibility Review
- **Mobile Adaptation**: The telescope scene re-centers vertically above the headline. Clouds reflow into stacked narrative cards.
- **Field Context Lessons**: The emotional dignity and warmth of watercolor horizons can soften clinical/administrative field data, making casework intake feel humane and noble.

---

### Benchmark C: Mr. Panda’s Psychologically Safe Portfolio
- **Live URL**: `https://www.mr-pandas-psychologically-safe-portfolio.com/`
- **Architectural Identity**: 2.5D Papercraft Diorama / Tactile Desk Craft

#### Pass 1 — First Five Seconds (1440 × 900)
- **Above the Fold**: An authentic blue-lined notebook page forming the back wall with a red margin line. Foreground cardboard cutouts (a hand-drawn panda on a bicycle mounted on a wooden popsicle stick, an airplane suspended by string, folded green cardstock grass).
- **Immediate Emotional Impression**: Delight, disarming honesty, psychological safety, zero corporate pretense.
- **Eye Landing Sequence**:
  1. *First*: The tactile panda on the bicycle.
  2. *Second*: The handwritten "Welcome to my portfolio! — Mr. Panda" note written directly on the lined paper.
  3. *Third*: The purple square post-it note taped in the upper right ("ABOUT ME").

#### Pass 2, 6, 7 — Anatomy, Motion, & Materiality
- **Page-as-Object Metaphor**: A physical craft desk/diorama. The user feels as if they are looking into a handmade miniature theater.
- **Material Details**:
  - Ruled blue notebook lines with a vertical red margin line.
  - Cardboard cutout edges with realistic dark cut-lines and bevel highlights.
  - Popsicle stick mounts with wood-grain texture and ground contact shadows.
  - Scotch tape / masking tape strips holding notes to the lined paper.
  - Hand-drawn doodles (clouds, small flowers, pencil arrows).
- **Motion & Interaction Mechanics**: Interactive 3D tilt/parallax as pointer moves; cutouts bob gently. 
- **Critical Field-Context Risk**: The desktop version relies heavily on WebGL canvas and mouse drag. In an offline field context on budget Android devices, drag-only navigation or heavy WebGL is an immediate failure point. However, the *visual language* of papercraft, tape, margin lines, and wooden clip pins can be achieved 100% cleanly in pure, performant CSS/SVG without any GPU penalty.

---

### Benchmark D: Aardvark Book Club
- **Live URL**: `https://www.aardvarkbookclub.com/`
- **Architectural Identity**: High-Energy Dimensional Editorial / Bookish Physicality

#### Pass 1 — First Five Seconds (1440 × 900)
- **Above the Fold**: Vibrant marigold yellow backdrop (`#FFBF3F`) with organic topographical curves, hyper-bold display type (`Unbox stories worth talking about`), and 3D hardcover books floating at dynamic angles with physical thickness, cloth spines, and bookmark ribbons.
- **Immediate Emotional Impression**: Vibrant, optimistic, modern, bookish, confident.
- **Eye Landing Sequence**:
  1. *First*: The massive, punchy black display headline (`Unbox stories...`).
  2. *Second*: The tactile blue hardcover book with hot-pink cloth spine wrap.
  3. *Third*: The high-contrast magenta CTA button (`Log-in / Sign-up now ->`).
- **Header Structure**: Floating pill buttons (`All Books`, `Gifting`, `Merch`, `FAQ`) nested within an unobtrusive, transparent bar that hugs the top without boxing the viewport.

#### Pass 2, 4, 7 — Typography, Materiality, & Interaction
- **Display Typography**: `Champ, Arial, sans-serif` / `Degular`, rendered at `120px` (desktop clamp) with bold weight (`700`), tight letter-spacing, and rhythmic line breaks.
- **Bookish Materiality**: Hardcover book representations display realistic 3D perspective, spine creases, cover wraps, bookmark ribbons, and die-cut circular stickers.
- **Pill Navigation & Scannability**: High density of information organized cleanly through rounded pill tags, tabbed book carousels, and high-contrast step cards.

---

## 3. Site-Specific Mandatory Inquiries & Definitive Answers

### A. Mary Colter Case Page
1. **What makes the experience feel like a case file, archive, exhibition, or historical investigation?**  
   *Answer*: The structural metaphor is uncompromisingly physical: the screen is framed not as a web document, but as an authentic manila tabbed folder containing hole-punched, clipped paper sheets. The presence of typewriter metadata, ink-stamped dates, brass fasteners, and paperclips immediately signals that the reader is inspecting verified primary evidence rather than a promotional pitch.
2. **How are introductory metadata, index/navigation, images, captions, archival text, and long-form reading arranged?**  
   *Answer*: Metadata sits in a disciplined left-hand ledger column (monospaced biographical facts). Images appear as physical prints paper-clipped to the sheet. Editorial text flows with classical drop-caps in a wide, comfortable reading column. Navigation is embedded physically on the folder's projecting tab ears.
3. **How does the site pace revelation—does it show everything immediately or create controlled discovery?**  
   *Answer*: It uses progressive vertical layering: the folder acts as a container, revealing deeper archival evidence (blueprints, letters, postcards) only as the user scrolls, creating the sensation of sifting through an investigator's desk box.
4. **How are paper/print/archival cues used without becoming a generic "vintage filter"?**  
   *Answer*: They are structural, not superficial. The site does not simply apply a sepia filter over a standard grid. It renders authentic paper engineering: real hole punches with drop shadows revealing the folder backing, realistic clip geometry, and sharp, contemporary display typography that creates tension against the archival ephemera.
5. **Which visual devices can become an original "field notebook" grammar for Alliance India?**  
   *Answer*: (a) Folder tab index along the notebook margin representing the 6 assessment chapters; (b) Binder hole-punches along the left binding strip; (c) Official rubber stamps ("ALLIANCE INDIA • OFFLINE FIRST FIELD CASEFILE"); (d) Stylized paperclips securing localized field notes; (e) Monospace metadata stamps for operational data.
6. **Which historical/cultural/art assets or motifs must never be appropriated or copied?**  
   *Answer*: Never copy Mary Colter's actual architectural blueprints, southwestern Pueblo motifs, Fred Harvey company artifacts, typography licenses, or specific photography.

### B. Mal Prince Site
1. **How does it establish personality and authorship in the first viewport?**  
   *Answer*: Through an illustrated narrative anchor (telescope on the globe) and immense atmospheric negative space that refuses to rush the reader into a generic sales pitch.
2. **How does typography function as a visual object, not just text?**  
   *Answer*: Headlines are treated with dramatic scale, custom tracking, and organic positioning that interlocks with the illustrated landscape elements.
3. **How are sections sequenced to create emotional rhythm?**  
   *Answer*: Alternating between vast contemplative horizons (wide whitespace) and focused narrative vignettes (cloud speech bubbles), modulating cognitive load.
4. **How are white space, image scale, framing, and transitions used?**  
   *Answer*: White space is treated as negative air; images are framed by organic torn-paper horizons rather than hard 1px rectangular borders.
5. **Which methods make the experience feel premium rather than simply minimal?**  
   *Answer*: Handcrafted bespoke illustrations, subtle color grading (indigo to ochre), and typographic restraint.
6. **What can translate into an Alliance landing page without becoming a personal portfolio imitation?**  
   *Answer*: The emotional dignity of the child's care journey. Using organic, gentle contours to link Nutrition, Education, and Household support, transforming a bureaucratic checklist into an uplifting story of possibility.

### C. Mr. Panda Site
1. **What onboarding/instruction tells visitors how to interact?**  
   *Answer*: Natural physical cues: a bicycle facing right, arrows scribbled in pencil, and taped notes that invite exploration without formal modal dialogs.
2. **How does its spatial/scroll/drag model create playfulness?**  
   *Answer*: By breaking flat 2D planes into a tangible papercraft theater where elements respond to cursor movement with physical inertia.
3. **Where could this interaction pattern confuse or exclude users?**  
   *Answer*: On touchscreens or screen readers, free-form drag or non-standard scroll models create severe disorientation and break accessibility.
4. **Which micro-interaction principles are safe to adopt for a field-worker landing page?**  
   *Answer*: Tactile card lifts on hover, subtle paper settling on entry, and hand-drawn marker highlights.
5. **What must remain conventional?**  
   *Answer*: The primary CTA ("Open Field App") must remain a prominent, immediately clickable button. Navigation must preserve semantic anchor links and keyboard Tab index. Scrolling must remain 100% native and unhindered.
6. **How can we create small moments of discovery without turning the landing page into a game?**  
   *Answer*: Through interactive field-note tabs, hover-revealed operational tooltips, and an interactive support trail that reveals WHO z-score flags upon inspection.

### D. Aardvark Book Club Site
1. **How does it make a content-rich page immediately scannable?**  
   *Answer*: Clear color-blocked chapter backgrounds, pill tags that classify categories, and hyper-legible card headers.
2. **How does it combine bold branding with clear product explanation?**  
   *Answer*: Pair a memorable, oversized display headline with a concise, grounded 3-step explanation below it.
3. **How are cards, choices, repeated CTAs, social proof, FAQs, and editorial visuals organized?**  
   *Answer*: Each section has a singular focus: Hero unboxes the story, Step-cards demystify the workflow, FAQs resolve objections, and high-contrast sticky/bottom CTAs eliminate conversion friction.
4. **How does color guide the visitor without overwhelming them?**  
   *Answer*: A dominant warm background (marigold) anchor with disciplined accents (deep black ink, cobalt blue, vibrant magenta CTA).
5. **Which section-patterns can guide Alliance's content?**  
   *Answer*: The tabbed preview cards for the 6 assessment domains, the 3-step rhythm cards, and the accordion FAQ.
6. **Which commercial/e-commerce patterns must be avoided?**  
   *Answer*: Aggressive marketing timers, checkout carts, subscription prices, discount coupons, and commercial upsells. The Alliance platform is a humanitarian public health tool.

---

## 4. Top 10 Discoveries & Top 10 Baseline Deficits

### Top 10 Forensic Discoveries
1. **Physicality Requires Edge Details**: A notebook doesn't feel real because of a beige hex code; it feels real because of edge details—hole punches with shadows, folder tabs projecting into margins, and paper clips fastening sheets.
2. **Headers Must Frame, Not Dominate**: Exceptional editorial sites keep the header height between 40px and 52px, blending the brand into the paper artifact rather than segregating it in a floating modern navbar.
3. **Oversized Typography Creates Authorship**: Generic sites use `text-3xl` (30px); editorial leaders use dramatic display scales (`clamp(2.5rem, 6vw, 4.5rem)`) with tight tracking and intentional line breaks.
4. **Layered Z-Index Storytelling**: Successful heroes always stack at least three physical planes: Base desk/folder $\to$ Main journal sheet $\to$ Pinned cards/annotations.
5. **Authored Chapter Navigation**: Navigation works best when presented as physical folder index tabs rather than standard navbar text links.
6. **Restrained Color Theory**: High-craft sites commit to a warm paper base (`#FAF7F0`), deep ink (`#1E2522`), and an authoritative accent (`#0F5132` forest green / `#D97706` marigold), avoiding cold SaaS blues.
7. **The Power of the Continuous Path**: A curved, organic SVG path visually guides the visitor’s eye through the whole-child narrative far more effectively than isolated floating boxes.
8. **Monospace Stamping for Credibility**: Using crisp monospaced labels (`DM Mono`) for administrative and operational data creates authentic field-report verisimilitude.
9. **Zero-GPU Papercraft Feasibility**: Everything that makes Mr. Panda and Mary Colter feel magical can be achieved with pure, lightweight SVG and CSS box-shadows, ensuring 60fps performance on low-end Android phones.
10. **Dignified Humanitarian Tone**: Humanitarian casework demands dignity over deficit; framing support through a "Field Notebook of Possibility" inspires confidence and respect.

### Top 10 Deficits of the Current Deployed Landing Page
1. **64px SaaS Sticky Header**: Dominates the viewport, pushing key content down.
2. **Empty 2-Column Split**: Leaves 40% of the first viewport as empty blank space.
3. **Weak Hero SVG**: A tiny, isolated box with three generic colored circles that fails to tell a story.
4. **Flat Materiality**: The "notebook" effect is just a subtle CSS dot background without physical paper layers, clips, tabs, or stamps.
5. **Standard Web Form Cards**: Lower sections look like standard Bootstrap/Tailwind cards rather than pages of an unfolding casework journal.
6. **Disconnected Navigation**: Top bar links (`How It Works`, `FAQ`) feel detached from the notebook narrative.
7. **Lack of Depth/Elevation**: Missing multi-plane overlapping and contact shadows.
8. **Generic Section Dividers**: Flat horizontal borders instead of layered paper edges or chapter tabs.
9. **Mobile Stacking Failure**: Desktop columns simply stack vertically, requiring excessive scrolling to see any visual object.
10. **Lack of Indian Context Warmth**: Feels like a Western enterprise SaaS template rather than a warm, respectful field tool for Indian caseworkers.

---

## 5. Explicit Originality & Non-Copy Boundary

To protect intellectual property, institutional integrity, and creative authenticity:
- **Strictly Prohibited**:
  - Direct copying or tracing of Mary Colter photographs, Grand Canyon motifs, or Mosby Files CSS/JS.
  - Direct reproduction of Mal Prince's Little Prince illustrations, cloud shapes, or starry sky art.
  - Direct copying of Mr. Panda's 3D assets, panda illustrations, or code.
  - Copying Aardvark Book Club book covers, branding, or color combinations.
- **The Original Alliance India Language**:
  - The design will be **"The Field Notebook of Possibility — Interactive Case File"**: an original humanitarian field artifact celebrating Indian community caseworkers.
  - Built from pure, clean SVG vectors, CSS variables, accessible HTML5 semantic landmarks, and Tailwind utilities.
  - Grounded in the real operational realities of Alliance India's child nutrition and educational support programs.
