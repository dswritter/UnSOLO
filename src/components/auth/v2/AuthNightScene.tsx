/** Animated scene behind the login / sign-up forms: night sky in dusk mode, sunrise in day mode (colours in alpine-shell.css). */

function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const rand = rng(7)
const STARS = Array.from({ length: 140 }, () => ({
  x: rand() * 1600,
  y: rand() * 560,
  r: rand() < 0.12 ? 1.8 : rand() < 0.5 ? 1.1 : 0.7,
  delay: (rand() * 6).toFixed(2),
  dur: (2.5 + rand() * 4).toFixed(2),
}))

const treeRand = rng(21)
const TREES = Array.from({ length: 34 }, (_, i) => {
  const x = i * 50 + treeRand() * 30 - 20
  const h = 70 + treeRand() * 90
  return { x, h, base: 870 + treeRand() * 30 }
})

const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  dx: (i % 7) * 6 - 18,
  delay: (i * 0.37).toFixed(2),
  dur: (2.2 + (i % 5) * 0.45).toFixed(2),
  r: i % 3 === 0 ? 2.2 : 1.4,
}))

function pine(x: number, base: number, h: number) {
  const w = h * 0.42
  const tiers = 4
  let d = ''
  for (let t = 0; t < tiers; t++) {
    const top = base - h + (t * h) / (tiers + 1)
    const bottom = top + h / 2.2
    const half = (w * (t + 1.6)) / (tiers + 1)
    d += `M${x} ${top} L${x - half} ${bottom} L${x + half} ${bottom} Z `
  }
  return d + `M${x - 3} ${base - h / 6} h6 v${h / 6} h-6 Z`
}

export function AuthNightScene() {
  return (
    <svg
      className="auth-scene fixed inset-0 h-full w-full"
      viewBox="0 0 1600 1000"
      preserveAspectRatio="xMinYMax slice"
      aria-hidden
    >
      <defs>
        <linearGradient id="as-sky" x1="0" y1="0" x2="0" y2="1">
          <stop className="as-sky-0" offset="0" stopColor="#060a16" />
          <stop className="as-sky-1" offset="0.45" stopColor="#111a33" />
          <stop className="as-sky-2" offset="0.75" stopColor="#1f2a4a" />
          <stop className="as-sky-3" offset="1" stopColor="#2b3557" />
        </linearGradient>
        <radialGradient id="as-milky" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#c7d2fe" stopOpacity="0.28" />
          <stop offset="1" stopColor="#c7d2fe" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="as-aurora" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#5eead4" stopOpacity="0" />
          <stop offset="0.35" stopColor="#5eead4" stopOpacity="0.35" />
          <stop offset="0.7" stopColor="#818cf8" stopOpacity="0.28" />
          <stop offset="1" stopColor="#818cf8" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="as-fireglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb547" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#ff7a1a" stopOpacity="0.18" />
          <stop offset="1" stopColor="#ff7a1a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="as-flame" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff5a1f" />
          <stop offset="0.55" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#fff2a8" />
        </linearGradient>
        <linearGradient id="as-tent" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffcf6b" />
          <stop offset="1" stopColor="#e07a1f" />
        </linearGradient>
        <linearGradient id="as-shoot" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#fff" stopOpacity="0.95" />
        </linearGradient>
        <radialGradient id="as-sun" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#fff4d6" stopOpacity="0.95" />
          <stop offset="0.25" stopColor="#ffd27a" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb05a" stopOpacity="0" />
        </radialGradient>
        <filter id="as-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="18" />
        </filter>
      </defs>

      <rect width="1600" height="1000" fill="url(#as-sky)" />
      <ellipse className="as-night-only" cx="900" cy="230" rx="760" ry="120" fill="url(#as-milky)" transform="rotate(-18 900 230)" filter="url(#as-blur)" />

      <g>
        {STARS.map((s, i) => (
          <circle
            key={i}
            className="auth-star"
            cx={s.x.toFixed(1)}
            cy={s.y.toFixed(1)}
            r={s.r}
            fill="#fff"
            style={{ animationDelay: `${s.delay}s`, animationDuration: `${s.dur}s` }}
          />
        ))}
      </g>

      <g className="auth-shooting">
        <line x1="0" y1="0" x2="140" y2="0" stroke="url(#as-shoot)" strokeWidth="2" strokeLinecap="round" />
      </g>

      <path
        className="auth-aurora"
        d="M0 330 C 220 250, 420 380, 640 300 S 1060 240, 1280 310 S 1520 280, 1600 300 L1600 420 C 1380 380, 1180 430, 960 400 S 520 440, 300 420 S 80 430, 0 440 Z"
        fill="url(#as-aurora)"
        filter="url(#as-blur)"
      />

      <g className="as-night-only">
        <circle cx="1360" cy="150" r="38" fill="#f8fafc" opacity="0.9" />
        <circle cx="1376" cy="140" r="36" fill="#111a33" />
      </g>
      <g className="as-day-only auth-sun">
        <circle cx="860" cy="590" r="300" fill="url(#as-sun)" />
        <circle cx="860" cy="590" r="54" fill="#fff1c9" />
      </g>

      <path d="M0 640 L140 520 L260 600 L420 440 L560 580 L700 470 L860 600 L1000 430 L1160 590 L1300 500 L1460 610 L1600 520 L1600 1000 L0 1000 Z" fill="#273352" className="as-far" />
      <path d="M420 440 L380 476 L402 470 L420 486 L440 468 L462 478 Z M1000 430 L962 466 L986 460 L1000 476 L1018 458 L1040 470 Z M700 470 L672 496 L690 492 L702 504 L716 490 L730 498 Z" className="as-snow" fill="#dbe4f5" opacity="0.75" />
      <path d="M0 760 L180 650 L330 720 L520 620 L700 730 L880 660 L1060 740 L1240 650 L1420 730 L1600 680 L1600 1000 L0 1000 Z" fill="#1a2440" className="as-mid" />
      <path d="M0 880 C 300 840, 600 860, 900 850 S 1400 860, 1600 840 L1600 1000 L0 1000 Z" fill="#0d1325" className="as-ground" />

      <g className="as-trees" fill="#0a0f1e">
        {TREES.map((t, i) => (
          <path key={i} d={pine(t.x, t.base, t.h)} />
        ))}
      </g>

      {/* Camp knoll between the headline column and the form, clear of the stats card */}
      <path d="M420 1000 C 470 860, 560 800, 720 790 S 960 820, 1040 1000 Z" fill="#0b1122" className="as-knoll" />
      <ellipse className="auth-fireglow" cx="840" cy="790" rx="280" ry="140" fill="url(#as-fireglow)" />

      <g transform="translate(560 690)">
        <path className="as-tent" d="M0 110 L95 0 L190 110 Z" fill="#1c2238" />
        <path className="auth-tentglow" d="M64 110 L95 40 L126 110 Z" fill="url(#as-tent)" />
        <path d="M95 0 L95 110" stroke="#0a0f1e" strokeWidth="3" />
      </g>

      <g transform="translate(745 734)">
        <path d="M-6 64 c 6 -26 26 -30 34 -46 c 8 16 2 30 -6 46 Z" fill="#111827" />
        <circle cx="22" cy="12" r="9" fill="#111827" />
      </g>

      <g transform="translate(840 800)">
        <rect x="-42" y="-6" width="84" height="12" rx="6" fill="#3b2412" transform="rotate(14)" />
        <rect x="-42" y="-6" width="84" height="12" rx="6" fill="#4a2c15" transform="rotate(-14)" />
        <g className="auth-flame auth-flame-a">
          <path d="M0 -6 C -30 -30, -14 -70, 0 -104 C 14 -70, 30 -30, 0 -6 Z" fill="url(#as-flame)" />
        </g>
        <g className="auth-flame auth-flame-b">
          <path d="M-14 -6 C -34 -24, -26 -52, -16 -70 C -8 -50, 4 -30, -14 -6 Z" fill="url(#as-flame)" opacity="0.85" />
        </g>
        <g className="auth-flame auth-flame-c">
          <path d="M14 -6 C 34 -24, 26 -56, 18 -76 C 8 -52, -4 -30, 14 -6 Z" fill="url(#as-flame)" opacity="0.85" />
        </g>
        <g className="auth-flame auth-flame-a">
          <path d="M0 -8 C -12 -22, -6 -40, 0 -54 C 6 -40, 12 -22, 0 -8 Z" fill="#fff6c8" opacity="0.9" />
        </g>
        {EMBERS.map((e, i) => (
          <circle
            key={i}
            className="auth-ember"
            cx={e.dx}
            cy={-60}
            r={e.r}
            fill="#ffc560"
            style={{ animationDelay: `${e.delay}s`, animationDuration: `${e.dur}s` }}
          />
        ))}
      </g>
    </svg>
  )
}
