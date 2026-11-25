import type { EngineInterface, PluginOptions, Register, ThemeSetArgs, Timer } from 'claude-code'

import { makeColors } from './make-colors.js'

// Sea and surf: sea mist by day, deep ocean under the moon by night.
const { theme, problems } = makeColors({
  label: 'Mer et surf',
  roles: { accent: '#1a8fa8', danger: '#d0533f', success: '#2f9a6e', warning: '#e0962e', pro: '#5b6fd6' },
  light: {
    gray: {
      anchors: {
        'surface-0': '#e2eef0',
        'surface-1': '#eaf4f5',
        'surface-2': '#f3f9f9',
        'text-primary': '#0c2630',
        'text-secondary': '#2c4852',
        'text-muted': '#4a6670',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#081820',
        'surface-1': '#0d2029',
        'surface-2': '#122832',
        'surface-3': '#17303b',
        'text-primary': '#e3f1f4',
        'text-secondary': '#b4cbd2',
        'text-muted': '#8ea8b0',
      },
    },
  },
})

// ---------------------------------------------------------------------------
// Time of day: the scene follows the real sun where the person is (the
// `latitude` and `longitude` options; Paris when unset or out of range).

type Place = { latitude: number; longitude: number }

const DEFAULT_PLACE: Place = { latitude: 48.857, longitude: 2.352 }
const RECHECK_MS = 5 * 60_000

function placeFrom(options: PluginOptions): Place {
  const latitude = Number(options.latitude)
  const longitude = Number(options.longitude)

  if (Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) {
    return { latitude, longitude }
  }

  return DEFAULT_PLACE
}

type Phase = 'day' | 'golden' | 'night'

const PHASES: readonly Phase[] = ['day', 'golden', 'night']

/** Sun elevation in degrees (low-precision solar position, about 0.1 degree). */
function sunElevation(ms: number, latDeg: number, lonDeg: number): number {
  const rad = Math.PI / 180
  const d = ms / 86_400_000 - 10_957.5 // days since J2000
  const g = (357.529 + 0.98560028 * d) * rad
  const q = 280.459 + 0.98564736 * d
  const lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad
  const epsilon = (23.439 - 0.00000036 * d) * rad
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda))
  const dec = Math.asin(Math.sin(epsilon) * Math.sin(lambda))
  const gmst = (280.46061837 + 360.98564736629 * d) % 360
  const hourAngle = (gmst + lonDeg) * rad - ra
  const lat = latDeg * rad

  return Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)) / rad
}

/** Golden from 8 degrees above the horizon to civil dusk (-6), the same at dawn. */
function phaseAt(ms: number, place: Place): Phase {
  const elevation = sunElevation(ms, place.latitude, place.longitude)

  if (elevation >= 8) {
    return 'day'
  }

  return elevation >= -6 ? 'golden' : 'night'
}

// ---------------------------------------------------------------------------
// The scene, in a 1600 x 1000 viewBox.

type Palette = {
  sky: readonly [string, string, string]
  orb: string
  orbAt: readonly [number, number, number]
  halo: string
  haloOpacity: number
  haloRadius: number
  sea: string
  waves: readonly [string, string, string]
  foam: string
  foamOpacity: number
  glint: string
  glintOpacity: number
  wetSand: string
  sand: string
  dune: string
  grass: string
  rider: string
  board: string
  planted: string
  stripe: string
  gull: string
}

const PALETTES: Record<Phase, Palette> = {
  day: {
    sky: ['#6fbfdf', '#a9dcea', '#e8f7f5'],
    orb: '#fff1c9',
    orbAt: [300, 230, 64],
    halo: '#fff4d6',
    haloOpacity: 0.75,
    haloRadius: 170,
    sea: '#4fa9c0',
    waves: ['#3e96ae', '#2b819a', '#1f708a'],
    foam: '#f6fcfc',
    foamOpacity: 0.75,
    glint: '#fff8e1',
    glintOpacity: 0.55,
    wetSand: '#cdb68c',
    sand: '#eddcb4',
    dune: '#e4cf9f',
    grass: '#7b8d4a',
    rider: '#0c2630',
    board: '#f6efe0',
    planted: '#f07f4f',
    stripe: '#fff3e0',
    gull: '#2c4852',
  },
  golden: {
    sky: ['#3f5d94', '#d98a86', '#ffcf8c'],
    orb: '#ffcf6e',
    orbAt: [330, 548, 74],
    halo: '#ffb766',
    haloOpacity: 0.7,
    haloRadius: 260,
    sea: '#58799b',
    waves: ['#4a6b8e', '#3b5a7d', '#2e4a69'],
    foam: '#ffe4c4',
    foamOpacity: 0.7,
    glint: '#ffd08a',
    glintOpacity: 0.8,
    wetSand: '#a9876c',
    sand: '#dfb58c',
    dune: '#cf9f79',
    grass: '#5f5a36',
    rider: '#1d1a2b',
    board: '#ffd6a0',
    planted: '#2e4a69',
    stripe: '#ffd6a0',
    gull: '#2a2238',
  },
  night: {
    sky: ['#040c12', '#081a24', '#0f2a36'],
    orb: '#e6eef0',
    orbAt: [300, 220, 40],
    halo: '#cfe0e6',
    haloOpacity: 0.28,
    haloRadius: 130,
    sea: '#0b2a36',
    waves: ['#0a2430', '#08202a', '#061820'],
    foam: '#a9cdd5',
    foamOpacity: 0.35,
    glint: '#dfe9ec',
    glintOpacity: 0.35,
    wetSand: '#232a2c',
    sand: '#3a3a36',
    dune: '#33322e',
    grass: '#1e2a24',
    rider: '#020a0e',
    board: '#9fb4ba',
    planted: '#56636c',
    stripe: '#9fb4ba',
    gull: '#020a0e',
  },
}

const HORIZON = 560

type Wave = { y0: number; amp: number; period: number }

const BACK: Wave = { y0: 625, amp: 14, period: 300 }
const MID: Wave = { y0: 700, amp: 28, period: 400 }
const FRONT: Wave = { y0: 775, amp: 22, period: 520 }

// A periodic crest line: crests at period/4 + k * period, troughs half a period later.
// Each layer drifts left by two periods, so the loop is seamless.
function crest({ y0, amp, period }: Wave): string {
  const half = period / 2
  const width = 1600 + 3 * period
  let d = `M0 ${y0} Q${half / 2} ${y0 - amp} ${half} ${y0}`

  for (let x = period; x <= width; x += half) {
    d += ` T${x} ${y0}`
  }

  return d
}

function body(wave: Wave): string {
  return `${crest(wave)} L${1600 + 3 * wave.period} 1000 L0 1000 Z`
}

// The surfer rides MID at a crest (x = 100 + 3 * 400). The drift moves MID left by
// 800 in 44s, so a crest passes that x every 22s: the ride animation goes crest to
// trough (amp) in 11s and back, keeping the board on the water.
const SURFER_X = 1300
const SURFER_Y = MID.y0 - MID.amp / 2 - 2

const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [120, 90, 1.6], [260, 60, 1.2], [420, 140, 1.8], [560, 70, 1.3], [700, 170, 1.1],
  [860, 60, 1.5], [990, 130, 1.2], [1120, 80, 1.7], [1240, 180, 1.2], [1380, 60, 1.4],
  [1500, 140, 1.6], [1450, 280, 1.1], [640, 300, 1.0], [940, 260, 1.2], [180, 330, 1.0],
]

const GLINTS: ReadonlyArray<readonly [number, number, number]> = [
  [255, 572, 90], [272, 588, 56], [240, 604, 120], [280, 618, 44],
]

function tuft(x: number, y: number, h: number): string {
  return `M${x} ${y}q-4 ${-h * 0.6} -12 ${-h}M${x} ${y}q1 ${-h * 0.7} 3 ${-h * 1.1}M${x} ${y}q6 ${-h * 0.5} 14 ${-h * 0.85}`
}

const GRASS = [tuft(170, 774, 42), tuft(230, 764, 54), tuft(290, 766, 46), tuft(350, 782, 38), tuft(410, 804, 30)]

const n = (value: number): string => value.toFixed(2)

function scene(phase: Phase): string {
  const p = PALETTES[phase]
  const [orbX, orbY, orbR] = p.orbAt

  const style = `
.sky1{stop-color:${p.sky[0]}}.sky2{stop-color:${p.sky[1]}}.sky3{stop-color:${p.sky[2]}}
.orb{fill:${p.orb}}
.h1{stop-color:${p.halo};stop-opacity:${n(p.haloOpacity)}}.h2{stop-color:${p.halo};stop-opacity:0}
.glow{opacity:.75;animation:glow 9s ease-in-out infinite alternate}
.star{fill:#e6eef0;opacity:.8}
.sea{fill:${p.sea}}
.w1{fill:${p.waves[0]}}.w2{fill:${p.waves[1]}}.w3{fill:${p.waves[2]}}
.foam{fill:none;stroke:${p.foam};stroke-width:5;stroke-linecap:round;opacity:${n(p.foamOpacity)}}
.thin{stroke-width:3;opacity:${n(p.foamOpacity * 0.65)}}
.sheet{fill:${p.foam};opacity:${n(p.foamOpacity * 0.55)}}
.lace{fill:none;stroke:${p.foam};stroke-width:4;stroke-linecap:round;opacity:${n(p.foamOpacity)}}
.glint{fill:${p.glint};opacity:${n(p.glintOpacity)};animation:glint 6s ease-in-out infinite alternate}
.wet{fill:${p.wetSand}}.sand{fill:${p.sand}}.dune{fill:${p.dune}}
.grass{fill:none;stroke:${p.grass};stroke-width:3;stroke-linecap:round}
.planted{fill:${p.planted}}.stripe{fill:none;stroke:${p.stripe};stroke-width:3;stroke-linecap:round}
.gull{fill:none;stroke:${p.gull};stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.limb{fill:none;stroke:${p.rider};stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.head{fill:${p.rider}}
.board{fill:${p.board};stroke:${p.rider};stroke-width:2}
.d1{animation:drift1 96s linear infinite}
.d2{animation:drift2 44s linear infinite}
.d3{animation:drift3 30s linear infinite}
.b1{animation:bob 13s ease-in-out infinite alternate}
.b3{animation:bob 9s ease-in-out infinite alternate}
.ride{animation:ride 11s cubic-bezier(.37,0,.63,1) infinite alternate}
.swash{animation:swash 7s ease-in-out infinite alternate}
.sway{transform-box:fill-box;transform-origin:50% 100%;animation:sway 6s ease-in-out infinite alternate}
.flock{animation:glide 34s ease-in-out infinite alternate}
.tw{animation:tw 7s ease-in-out infinite alternate}
.tw2{animation:tw 11s ease-in-out infinite alternate}
@keyframes drift1{to{transform:translateX(-${2 * BACK.period}px)}}
@keyframes drift2{to{transform:translateX(-${2 * MID.period}px)}}
@keyframes drift3{to{transform:translateX(-${2 * FRONT.period}px)}}
@keyframes bob{to{transform:translateY(7px)}}
@keyframes ride{to{transform:translateY(${MID.amp}px)}}
@keyframes swash{to{transform:translateY(12px);opacity:.45}}
@keyframes sway{from{transform:rotate(-2deg)}to{transform:rotate(3deg)}}
@keyframes glide{to{transform:translate(90px,-14px)}}
@keyframes glow{to{opacity:1}}
@keyframes glint{to{opacity:${n(p.glintOpacity * 0.4)}}}
@keyframes tw{to{opacity:.25}}
`

  const stars =
    phase === 'night'
      ? STARS.map(([x, y, r], i) => `<circle class="star ${i % 2 === 0 ? 'tw' : 'tw2'}" cx="${x}" cy="${y}" r="${r}"/>`).join('')
      : ''

  const gulls =
    phase === 'night'
      ? ''
      : `<g transform="translate(560 190)"><g class="flock"><path class="gull" d="M-14 0Q-7 -8 0 0Q7 -8 14 0"/><path class="gull" d="M30 22Q36 15 42 22Q48 15 54 22"/></g></g>`

  const glints = GLINTS.map(
    ([x, y, w]) => `<rect class="glint" x="${x + orbX - 300}" y="${y}" width="${w}" height="4" rx="2"/>`,
  ).join('')

  // Nobody surfs at night: the board waits on the beach.
  const surfer =
    phase === 'night'
      ? ''
      : `<g transform="translate(${SURFER_X} ${SURFER_Y})"><g class="ride"><g transform="scale(-1.35 1.35)">
<path class="board" d="M-36 0Q-30 -6 0 -6Q30 -6 40 -1Q30 4 0 4Q-30 4 -36 0Z"/>
<path class="limb" d="M-13 -6L-9 -17L-1 -27M12 -6L9 -17L1 -27M0 -27L5 -45M4 -43L-9 -38L-22 -41M4 -43L17 -40L28 -33"/>
<circle class="head" cx="8" cy="-53" r="6"/>
</g></g></g>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice">
<style>${style}</style>
<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sky1"/><stop offset="0.6" class="sky2"/><stop offset="1" class="sky3"/></linearGradient>
<radialGradient id="halo"><stop offset="0.3" class="h1"/><stop offset="1" class="h2"/></radialGradient></defs>
<!-- sky -->
<rect x="0" y="0" width="1600" height="${HORIZON + 10}" fill="url(#sky)"/>
${stars}
<circle class="glow" cx="${orbX}" cy="${orbY}" r="${p.haloRadius}" fill="url(#halo)"/>
<circle class="orb" cx="${orbX}" cy="${orbY}" r="${orbR}"/>
${gulls}
<!-- sea -->
<rect class="sea" x="0" y="${HORIZON}" width="1600" height="${1000 - HORIZON}"/>
${glints}
<g class="b1"><path class="w1 d1" d="${body(BACK)}"/></g>
<g><path class="w2 d2" d="${body(MID)}"/><path class="foam thin d2" d="${crest(MID)}"/>${surfer}</g>
<g class="b3"><path class="w3 d3" d="${body(FRONT)}"/><path class="foam d3" d="${crest(FRONT)}"/></g>
<!-- beach -->
<path class="wet" d="M0 828C300 808 560 822 820 816S1300 800 1600 808L1600 1000L0 1000Z"/>
<g class="swash"><path class="sheet" d="M0 830C300 810 560 824 820 818S1300 802 1600 810L1600 836C1460 830 1300 842 1120 838S760 846 560 842S200 836 0 842Z"/>
<path class="lace" d="M0 842C200 836 380 850 560 842S940 832 1120 838S1460 828 1600 836"/></g>
<path class="sand" d="M0 868C320 846 620 862 900 856S1340 842 1600 850L1600 1000L0 1000Z"/>
<g transform="translate(1380 915) rotate(10) scale(0.85)"><path class="planted" d="M0 0C-16 -10 -20 -80 -16 -130C-12 -165 -4 -182 0 -186C4 -182 12 -165 16 -130C20 -80 16 -10 0 0Z"/>
<path class="stripe" d="M0 -8L0 -178"/></g>
<ellipse class="sand" cx="1382" cy="917" rx="30" ry="8"/>
<path class="dune" d="M0 790C120 760 250 754 360 788C450 816 520 900 560 1000L0 1000Z"/>
<g class="sway">${GRASS.map(d => `<path class="grass" d="${d}"/>`).join('')}</g>
</svg>`
}

const SCENES: Record<string, string> = Object.fromEntries(PHASES.map(phase => [`surf-${phase}`, scene(phase)]))

const ALT: Record<Phase, string> = {
  day: 'Une plage ensoleillée, des vagues lentes et un surfeur au large',
  golden: 'Une plage au coucher du soleil, des vagues dorées et un surfeur au large',
  night: 'Une plage sous la lune, des vagues lentes et une planche plantée dans le sable',
}

function lookFor(phase: Phase): ThemeSetArgs {
  return { colors: theme, backdrop: { scene: `surf-${phase}`, glass: { blur: 18, opacity: 0.66 } } }
}

// ---------------------------------------------------------------------------

let shown: Phase | undefined
let timer: Timer | undefined

async function apply($: EngineInterface, place: Place): Promise<void> {
  const phase = phaseAt(await $.clock.now(), place)

  if (phase === shown) {
    return
  }
  shown = phase
  const set = await $.theme.set(lookFor(phase))

  if (!set.isDrawn) {
    $.ui.status(set.reason)
  }
}

export const register: Register = (on, options) => {
  const place = placeFrom(options)

  on('session.start', async ($, e, next) => {
    // While building: the line that would stop Desktop painting this look.
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    shown = undefined

    try {
      await apply($, place)
    } catch (error) {
      // Headless sessions (claude -p, SDK hosts) have no theme to set: nothing to draw.
      try {
        $.ui.log(`ocean-surf: theme not set: ${String(error)}`)
      } catch {
        // No UI either.
      }

      return next(e)
    }
    timer?.cancel()
    timer = $.clock.every(RECHECK_MS, () => {
      apply($, place).catch((error: unknown) => $.ui.log(String(error)))
    })

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    const source = SCENES[e.props.scene]

    if ((e.surface !== 'desktop' && e.surface !== 'mobile') || source === undefined) {
      return next(e)
    }

    const phase = e.props.scene.slice('surf-'.length) as Phase
    const { Svg } = $.ui.resolve(e)

    return <Svg source={source} alt={ALT[phase]} isInteractive />
  })
}
