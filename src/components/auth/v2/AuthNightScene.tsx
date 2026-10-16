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
        <radialGradient id="as-tentbody" cx="0.5" cy="0.85" r="0.75">
          <stop className="as-tent-0" offset="0" stopColor="#c8f59a" />
          <stop className="as-tent-1" offset="0.35" stopColor="#5fbf6e" />
          <stop className="as-tent-2" offset="1" stopColor="#1f5a38" />
        </radialGradient>
        <radialGradient id="as-tenthalo" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#8ef08a" stopOpacity="0.45" />
          <stop offset="0.5" stopColor="#4fd17a" stopOpacity="0.12" />
          <stop offset="1" stopColor="#4fd17a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="as-flame-outer" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d9361a" />
          <stop offset="0.6" stopColor="#f2621f" />
          <stop offset="1" stopColor="#ff9a3c" stopOpacity="0.6" />
        </linearGradient>
        <linearGradient id="as-flame-mid" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ff7a1a" />
          <stop offset="1" stopColor="#ffc23d" />
        </linearGradient>
        <linearGradient id="as-flame-core" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffd96b" />
          <stop offset="1" stopColor="#fff8dc" />
        </linearGradient>
        <filter id="as-smokeblur" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="7" />
        </filter>
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
        <mask id="as-moonmask">
          <rect width="1600" height="1000" fill="#fff" />
          <circle cx="1376" cy="140" r="36" fill="#000" />
        </mask>
        <circle cx="1360" cy="150" r="38" fill="#f8fafc" opacity="0.9" mask="url(#as-moonmask)" />
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

      {/* Flat camp ground shared by the tent, the fire and the two travellers */}
      <path className="as-knoll" d="M170 1000 C 220 880, 300 806, 400 800 L 900 800 C 980 806, 1050 880, 1090 1000 Z" fill="#0b1122" />
      <ellipse className="auth-fireglow" cx="740" cy="790" rx="300" ry="150" fill="url(#as-fireglow)" />

      {/* Tent lit from inside */}
      <g transform="translate(330 690)">
        <ellipse className="as-night-only auth-tenthalo" cx="95" cy="80" rx="170" ry="110" fill="url(#as-tenthalo)" />
        <ellipse cx="95" cy="112" rx="104" ry="7" fill="#05080f" opacity="0.45" />
        <path className="auth-tentglow" d="M0 110 L95 0 L190 110 Z" fill="url(#as-tentbody)" />
        <path d="M95 0 L0 110 M95 0 L190 110" stroke="#173f28" strokeWidth="2.5" opacity="0.7" />
        <path className="auth-tentglow" d="M74 110 L95 52 L116 110 Z" fill="url(#as-tent)" />
        <path d="M95 52 L66 112 L74 110 Z" fill="#2a7a45" opacity="0.9" />
        <path d="M95 -6 L95 110" stroke="#0e2417" strokeWidth="3" />
      </g>

      {/* Boy, left of the fire, warming his hands */}
      <g transform="translate(632 800)">
        <rect x="-30" y="-12" width="60" height="12" rx="6" fill="#3b2412" />
        <path className="as-pants" d="M-2 -14 L22 -30 L38 -2" fill="none" stroke="#151b2e" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <g className="auth-breathe">
          <rect className="as-jacket-b" x="-11" y="-58" width="22" height="46" rx="11" fill="#24425a" transform="rotate(10 0 -14)" />
          <g className="auth-head-b">
            <circle className="as-skin" cx="8" cy="-68" r="10" fill="#8a5a44" />
            <path className="as-hair" d="M-2 -70 C -2 -82, 18 -84, 18 -70 C 12 -76, 4 -76, -2 -70 Z" fill="#120d0a" />
          </g>
          <g className="auth-arm-b">
            <rect className="as-jacket-b" x="0" y="-3.5" width="32" height="7" rx="3.5" fill="#24425a" transform="translate(6 -50) rotate(28)" />
          </g>
        </g>
      </g>

      {/* Girl, right of the fire */}
      <g transform="translate(850 800) scale(-1 1)">
        <rect x="-30" y="-12" width="60" height="12" rx="6" fill="#4a2c15" />
        <path className="as-pants" d="M-2 -14 L22 -28 L36 -2" fill="none" stroke="#151b2e" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
        <g className="auth-breathe auth-breathe-g">
          <rect className="as-jacket-g" x="-11" y="-56" width="22" height="44" rx="11" fill="#6b2f2a" transform="rotate(8 0 -14)" />
          <g className="auth-head-g">
            <path className="as-hair auth-ponytail" d="M-4 -70 C -18 -66, -20 -50, -12 -44 C -10 -54, -8 -60, -2 -64 Z" fill="#120d0a" />
            <circle className="as-skin" cx="7" cy="-66" r="9.5" fill="#8a5a44" />
            <path className="as-hair" d="M-3 -66 C -4 -80, 18 -82, 17 -67 C 10 -73, 3 -72, -3 -66 Z" fill="#120d0a" />
          </g>
          <g className="auth-arm-g">
            <rect className="as-jacket-g" x="0" y="-3.5" width="30" height="7" rx="3.5" fill="#6b2f2a" transform="translate(5 -48) rotate(34)" />
          </g>
        </g>
      </g>

      {/* Campfire: stone ring, logs, layered flames, sparks and smoke */}
      <g transform="translate(740 800)">
        {[-48, -32, -14, 4, 22, 40, 52].map((x, i) => (
          <ellipse key={i} className="as-stone" cx={x} cy={i % 2 ? 2 : 0} rx="9" ry="6" fill="#2a3048" />
        ))}
        <rect x="-38" y="-10" width="76" height="11" rx="5.5" fill="#3b2412" transform="rotate(12 0 -4)" />
        <rect x="-38" y="-10" width="76" height="11" rx="5.5" fill="#55331a" transform="rotate(-12 0 -4)" />
        <g className="auth-smoke-group" filter="url(#as-smokeblur)">
          {[0, 1, 2].map((i) => (
            <circle key={i} className="auth-smoke" cx={(i - 1) * 6} cy="-90" r="10" fill="#9aa3b8" style={{ animationDelay: `${i * 1.6}s` }} />
          ))}
        </g>
        <g className="auth-flame auth-flame-b">
          <path d="M-18 -6 C -36 -26, -28 -56, -18 -74 C -12 -54, 0 -34, -18 -6 Z" fill="url(#as-flame-outer)" />
        </g>
        <g className="auth-flame auth-flame-c">
          <path d="M18 -6 C 36 -26, 28 -60, 20 -80 C 12 -56, 0 -34, 18 -6 Z" fill="url(#as-flame-outer)" />
        </g>
        <g className="auth-flame auth-flame-a">
          <path d="M0 -4 C -30 -26, -18 -66, 0 -100 C 18 -66, 30 -26, 0 -4 Z" fill="url(#as-flame-outer)" />
        </g>
        <g className="auth-flame auth-flame-b">
          <path d="M0 -6 C -20 -24, -12 -54, 0 -78 C 12 -54, 20 -24, 0 -6 Z" fill="url(#as-flame-mid)" />
        </g>
        <g className="auth-flame auth-flame-c">
          <path d="M0 -8 C -11 -20, -6 -38, 0 -52 C 6 -38, 11 -20, 0 -8 Z" fill="url(#as-flame-core)" />
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
