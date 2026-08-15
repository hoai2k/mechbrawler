// ============================================================================
// ROBOTWORLD — ALL USER-FACING TEXT LIVES HERE.
// ============================================================================
// Every string a player can read — menus, HUD, announcements, mech names and
// bios, arena names, touch-button labels, toasts — is registered in MESSAGES
// under a readable dotted id, and pulled out with `t(id, params)`.
//
//   t('match.round', { n: 2 })   →  "ROUND 2"
//
// Rules of the road:
//   · Never write a player-visible literal in game code — add a message id.
//   · Ids are namespaced: ui.* menus.* hud.* match.* mech.<id>.* arena.<id>.*
//   · Placeholders are {braced} and substituted from the params object.
//   · Some values are HTML (hint bars, the controls sheet) — those ids end in
//     `.html` so it's obvious the string is injected as markup, not text.
//   · Mech / arena text is applied onto ROSTER and THEMES at import time
//     (see roster.js / themes.js), so gameplay code keeps using `def.name`.
//
// i18n: this file is the whole translation surface. To add a language, ship a
// second table with the same ids and hand it to `setMessages()` at boot.
// ============================================================================

export const MESSAGES = {
  // ---------------------------------------------------------------- document
  'app.title': 'MECH MAYHEM — Robot Battle Arena',
  'app.rotate.title': 'Rotate your device',
  'app.rotate.sub': 'MECH MAYHEM plays best in landscape',

  // ------------------------------------------------------------------- title
  'title.game': 'MECH MAYHEM',
  'title.tagline': 'ROBOT BATTLE ARENA',
  'title.menu.battle': 'BATTLE',
  'title.menu.fullscreen': 'FULLSCREEN',
  'title.hint.html': '<b>↑↓</b> select&nbsp;&nbsp;<b>ENTER / A</b> confirm&nbsp;&nbsp;·&nbsp;&nbsp;<b>LB / RB</b> (Q/E) settings · sound&nbsp;&nbsp;·&nbsp;&nbsp;pad <b>SELECT</b> mouse pointer&nbsp;&nbsp;·&nbsp;&nbsp;P1 <b>WASD</b> + <b>F G H R T Y</b> · <b>SPACE</b> jump · <b>SHIFT</b> dash',

  // ----------------------------------------------------------- fighter select
  'select.heading': 'CHOOSE YOUR FIGHTER',
  'select.ready.html': '<div class="rb-chip">GAME READY. PRESS <b>A</b> TO PLAY.</div>',
  // controller vocabulary only — the ⓘ button carries the full diagram, and
  // keyboard players have the same buttons under the same names
  'select.hint.html': '<b>A</b> join · select&nbsp;&nbsp;<b>D-PAD</b> pick&nbsp;&nbsp;<b>◀ ▶</b> color&nbsp;&nbsp;<b>B</b> cancel&nbsp;&nbsp;<b>LB / RB</b> visit a slot&nbsp;&nbsp;<b>RIGHT STICK</b> turn&nbsp;&nbsp;·&nbsp;&nbsp;<span class="xb-btn" aria-hidden="true"><i></i><i></i><i></i></span> use pointer',
  'select.colorHint': 'change color',
  'select.player': 'PLAYER {n}',
  'select.playerDevice': 'PLAYER {n} · {device}',
  'select.addPlayer': '＋ ADD PLAYER',
  'select.addHint': 'press A / ENTER to join · LB/RB from your seat, or click, to add CPU / KB',
  'select.cpu': '🤖 CPU · {diff}',
  // sits between the card's two clickable difficulty arrows
  'select.cpuHint': 'difficulty',
  // bumper badges pinned to the corners of the player-card row: LB/RB walk
  // your focus from slot to slot
  'select.bumperL': 'LB',
  'select.bumperR': 'RB',
  'select.bumperHint': 'slots',
  'select.picking': 'picking…',
  'select.editing': '▶ P{n} EDITING · ↑↓ change · B done',
  'select.locked': '· LOCKED ✓',
  'select.colorLabel': 'COLOR',
  'select.stat.power': 'POWER',
  'select.stat.speed': 'SPEED',
  'select.stat.defense': 'DEFENSE',
  'select.move.ranged': 'RANGED',
  'select.move.special': 'SPECIAL',
  'select.move.ult': 'ULTIMATE',
  'select.move.rangedShort': 'RNG',
  'select.move.specialShort': 'SPC',
  'select.move.ultShort': 'ULT',
  'select.unknownMove': '???',

  // the RANDOM roster cell (a pseudo-mech)
  'select.random.name': 'RANDOM',
  'select.random.title': 'Mystery Unit',
  'select.random.blurb': 'A different robot every round — dealt fresh at each bell. Pick a color scheme; it carries onto whatever shows up.',
  'select.random.short': 'a different robot every round',

  // input device labels
  'device.touch': 'TOUCH',
  'device.kb1': 'KEYBOARD 1',
  'device.kb2': 'KEYBOARD 2',
  'device.pad': 'GAMEPAD {n}',

  // AI difficulty names (shown uppercased on the player cards)
  'diff.rookie': 'ROOKIE',
  'diff.veteran': 'VETERAN',
  'diff.ace': 'ACE',

  // ------------------------------------------------------------ arena select
  'arena.heading': 'SELECT ARENA',
  'arena.random.name': 'RANDOM',
  'arena.random.desc': 'Spin the wheel — any arena could come up.',
  'arena.hint.html': '<b>ARROWS</b> move&nbsp;&nbsp;<b>ENTER / A</b> fight!&nbsp;&nbsp;<b>ESC / B</b> back',

  // -------------------------------------------------------------------- pause
  'pause.title': 'PAUSED',
  'pause.menu.resume': 'RESUME',
  'pause.menu.controls': 'CONTROLS',
  'pause.menu.fullscreen': 'FULLSCREEN',
  'pause.menu.settings': 'SETTINGS',
  'pause.menu.quit': 'QUIT TO MENU',
  'pause.controls.html': `
      <b style="color:#fff">KEYBOARD P1</b> — WASD move · SPACE jump · F light · G heavy · H block · R ranged · T special · Y ultimate · SHIFT dash · Q strafe-lock · C duck · B taunt<br>
      <b style="color:#fff">KEYBOARD P2</b> — Arrows move · Num0 jump · Num1 light · Num2 heavy · Num3 block · Num4 ranged · Num5 special · Num6 ult · NumEnter dash · Num7 strafe-lock · Num8 duck<br>
      <b style="color:#fff">XBOX PAD</b> — L-stick move · R-stick camera (free look, nothing auto-swings it) · A jump · X light · Y heavy · RB ranged · RT special · LT block · L-stick CLICK camera adjust (R-stick ↑↓ zooms in/out) · D-pad ↑ ultimate · D-pad ↓ taunt<br>
      <b style="color:#fff">B / SHIFT — DASH &amp; SPRINT</b> — standing still, HOLD to wind up a dash coil (3s cap, crouches); the moment you push a direction it FIRES a dash that way — longer wind-up, farther dash. Already moving, press-and-HOLD for a short dash into a SPRINT that drains the yellow stamina bar (refills when you let go)<br>
      <b style="color:#fff">PAD LB — TAP: TARGET LOCK</b> — lock onto the nearest enemy: you face them, the camera keeps them framed, and sideways movement becomes a strafe. Tap again to release<br>
      <b style="color:#fff">PAD LB — HOLD: SNIPER MODE</b> — the view drops in behind your own head and sights down the barrel for as long as you hold it, in either camera mode and with or without a lock (holding never changes the lock). SHOVE the right stick at anything shootable — another robot, or a prop — to switch targets; let go of a prop and the aim returns to the nearest robot<br>
      <b style="color:#fff">AIM</b> — the crosshair IS your ranged target: every shot fired while it is up flies at it, height included. The RIGHT STICK LEADS IT — push toward where a strafing enemy is going and the camera follows your aim; let go and it eases back onto them. UP/DOWN still moves the CAMERA (except in sniper mode, where it aims). Unlocked shots fire along your facing<br>
      <b style="color:#fff">HOVER JETS</b> — press JUMP again in mid-air and HOLD to fly (lighter mechs fly higher)<br>
      <b style="color:#fff">CHARGED STRIKES</b> — TITANUS &amp; COLOSSUS: HOLD light (X) to keep the punch wound up, or heavy (Y) to keep the pound raised — release to strike with banked power<br>
      <b style="color:#fff">3+ ROBOTS — BRAWL</b> — with three or four in the arena a KO is not the end of the round: you fade out where you fell and RESPAWN a couple of seconds later. The round goes to the last robot with a clean sheet, or at the bell to whoever went down fewest times<br>
      <b style="color:#fff">ARENAS</b> — every round of a match is fought somewhere new<br>
      <b style="color:#fff">FINISHERS</b> — hold JUMP (A / SPACE) for 1s to skip the KO cinematic<br>
      <b style="color:#fff">DOWNED?</b> — press JUMP while knocked down to spring clear · every ranged weapon runs on AMMO — grab the yellow crates<br>
      <b style="color:#fff">WORLD</b> — the arena wraps: walk off any side and you come around the other<br>
      <b style="color:#fff">VIEW</b> — F9 flips the 2-player split (side-by-side ↔ stacked) · F10 fullscreen`,

  // ----------------------------------------------------------------- settings
  'settings.title': 'SETTINGS',
  'settings.back': 'BACK',
  'settings.sound.on': 'SOUND: ON',
  'settings.sound.off': 'SOUND: OFF',
  'settings.infiniteUlts.on': 'INFINITE ULTIMATES: ON',
  'settings.infiniteUlts.off': 'INFINITE ULTIMATES: OFF',
  // split-screen post FX: bloom, distance haze, anti-aliasing in local
  // multiplayer. DEFAULT = run them unless the frame rate says otherwise.
  'settings.splitFx.auto': 'SPLIT-SCREEN FX: DEFAULT',
  'settings.splitFx.autoOff': 'SPLIT-SCREEN FX: DEFAULT (OFF — SLOW)',
  'settings.splitFx.on': 'SPLIT-SCREEN FX: ALWAYS ON',
  'settings.splitFx.off': 'SPLIT-SCREEN FX: OFF',
  'settings.reverseCamY.on': 'REVERSE CAMERA Y: ON',
  'settings.reverseCamY.off': 'REVERSE CAMERA Y: OFF',
  'settings.showAllRobots.on': 'SHOW ALL ROBOTS: ON',
  'settings.showAllRobots.off': 'SHOW ALL ROBOTS: OFF',
  // which design system lays out each match's arena (src/arena/designs/):
  // AUTHORED (default) plays the hand-built levels where they exist and
  // generates the rest with the default system; the named systems generate
  // EVERY arena fresh; FALLBACK is the original scatter generator.
  'settings.arenaDesign.authored': 'ARENA DESIGN: AUTHORED',
  'settings.arenaDesign.wards': 'ARENA DESIGN: CITY WARDS',
  'settings.arenaDesign.avenues': 'ARENA DESIGN: GRAND AXIS',
  'settings.arenaDesign.circuit': 'ARENA DESIGN: COLOSSEUM',
  'settings.arenaDesign.fallback': 'ARENA DESIGN: FALLBACK',
  'settings.reload': 'RELOAD PAGE',
  'settings.split.side': 'SPLIT: SIDE BY SIDE',
  'settings.split.stacked': 'SPLIT: STACKED',
  // {bar} is the ten-block level readout; the level belongs to whichever
  // source (recorded / synth) is in use — see CONFIG.sfxVolume
  'settings.sfxVol': 'SFX VOLUME {bar} {pct}%',
  // RECORDED sound FX (public/sfx/) vs the procedural synth in core/audio.js
  'settings.sfx.on': 'SOUND FX: RECORDED',
  'settings.sfx.off': 'SOUND FX: SYNTH',
  'settings.music.on': 'MUSIC: ON',
  'settings.music.off': 'MUSIC: OFF',
  // {bar} is the ten-block level readout with its own dim ←→ hint (markup)
  'settings.musicVol': 'MUSIC VOLUME {bar} {pct}%',
  // how fast every robot walks / runs / flies; 100% is the old baseline pace
  'settings.robotSpeed': 'ROBOT SPEED {bar} {pct}%',
  // seconds on the round clock before a timeout
  'settings.roundTime': 'ROUND TIME {bar} {secs}s',
  'settings.btn.sound': 'sound on/off',
  'settings.btn.settings': 'settings',
  'settings.btn.instructions': 'how to play',

  // ------------------------------------------------------- controls (ⓘ modal)
  // The IN-GAME controls, and only those: what each button does with a mech on
  // the ground. Menu navigation is spelled out on the menus themselves, so it
  // stays off this diagram. Per control: .name is what's printed on the pad,
  // .action the short label beside it, .detail the sentence shown when it's
  // selected. Keep these true to input.js.
  'controls.title': 'HOW TO PLAY',
  'controls.close': 'CLOSE',
  'controls.foot.html': 'pick a control — hover, or <b>↑ ↓</b> — for what it does&nbsp;&nbsp;·&nbsp;&nbsp;<b>B / ESC</b> close'
    + '<br>keyboard P1: <b>WASD</b> move · <b>SPACE</b> jump · <b>F</b> light · <b>G</b> heavy · <b>H</b> block · <b>R</b> ranged · <b>T</b> special · <b>Y</b> ultimate · <b>SHIFT</b> dash · <b>Q</b> strafe-lock · <b>C</b> duck · <b>B</b> taunt',
  'controls.lstick.name': 'LEFT STICK',
  'controls.lstick.action': 'move',
  'controls.lstick.detail': 'walks your mech around the arena. Press in for camera adjust mode: while held, the right stick will zoom the view in and out, and where you leave it is remembered.',
  'controls.dpad.name': 'D-PAD',
  'controls.dpad.action': '▲ ultimate · ▼ taunt',
  'controls.dpad.detail': 'UP fires your ultimate once you\'ve collected a charge from a golden fountain — the big one, named on your mech\'s card. You can pocket two. DOWN strikes your mech\'s pose and calls its line — free, and worth nothing, except that standing still to do it in front of someone holding an ultimate charge is its own kind of statement. LEFT and RIGHT walk you around as a backup for the left stick.',
  'controls.lb.name': 'LB',
  'controls.lb.action': 'target lock · hold to snipe',
  'controls.lb.detail': 'TAP to lock onto the nearest enemy: you turn to face them, the camera keeps them framed, sideways movement becomes a strafe, and the crosshair sits on them so ranged shots fly their way — steer it with the right stick to lead a moving target. HOLD LB instead and the view zooms in around the crosshair for as long as you hold it.',
  'controls.lt.name': 'LT',
  'controls.lt.action': 'block',
  'controls.lt.detail': 'holds your guard up: blocking bleeds incoming damage down and stops chip knockback. A heavy swing will break it, so it buys you a beat rather than safety.',
  'controls.start.name': 'START',
  'controls.start.action': 'pause',
  'controls.start.detail': 'pauses the match: also access settings, sound and exiting to main menu.',
  'controls.rstick.name': 'RIGHT STICK',
  'controls.rstick.action': 'camera',
  'controls.rstick.detail': 'orbits the battle camera around your mech. When target lock (LB) is on, camera moves back to lock when right stick is released.',
  // The four face buttons get a callout each — the buttons a player reaches for
  // most, so each says exactly what it does in a fight.
  'controls.a.name': 'A',
  'controls.a.action': 'jump',
  'controls.a.detail': 'jumps. Press it again in mid-air and HOLD to fly on your hover jets — lighter mechs climb higher. It is also the way up off the floor: press it while knocked down to spring clear.',
  'controls.b.name': 'B',
  'controls.b.action': 'dash & sprint',
  'controls.b.detail': 'standing still, HOLD to wind up a dash coil — it fires the moment you push a direction, and the longer the wind-up the further you go. Already moving, hold it to dash into a sprint that drains your stamina bar.',
  'controls.x.name': 'X',
  'controls.x.action': 'light attack',
  'controls.x.detail': 'fast, cheap to throw, and it chains — the button you poke with. TITANUS and COLOSSUS can HOLD it to keep the punch wound up and release with banked power.',
  'controls.y.name': 'Y',
  'controls.y.action': 'heavy attack',
  'controls.y.detail': 'a slow, committed swing that hits hard and breaks a guard. It leaves you open on a whiff, so it wants a dash or a block to set it up.',
  'controls.rb.name': 'RB',
  'controls.rb.action': 'ranged weapon',
  'controls.rb.detail': 'fires your mech\'s ranged weapon. Every one of them runs on AMMO — grab the yellow crates — and while LB target lock is held the shots fly at whoever you are locked onto.',
  'controls.rt.name': 'RT',
  'controls.rt.action': 'special attack',
  'controls.rt.detail': 'throws your mech\'s signature special attack — the move named on its card. Each one has its own cooldown, so it is something to open with, not a button to lean on.',

  // ------------------------------------------------------------------ results
  'results.champion': 'CHAMPION',
  'results.menu.rematch': 'REMATCH',
  'results.menu.changeMechs': 'CHANGE MECHS',
  'results.menu.mainMenu': 'MAIN MENU',

  // ---------------------------------------------------------------- nav / misc
  'nav.back': '◀ BACK',
  'nav.color': '🎨 COLOR',
  'nav.lockIn': 'LOCK IN ▶',
  'nav.skip': 'SKIP',

  // -------------------------------------------------------------------- warmup
  'warmup.nowEntering': 'NOW ENTERING',
  'warmup.loadingArena.html': 'LOADING ARENA… &nbsp;·&nbsp; warm up! <b>MOVE</b> · <b>ATTACK</b> · <b>BLOCK</b> · <b>CROUCH</b>',
  'warmup.loadingModel': 'LOADING MODEL',

  // ----------------------------------------------------------------------- HUD
  'hud.cpu': 'CPU',
  'hud.player': 'P{n}',
  'hud.ammo': 'AMMO {n}',
  'hud.ammoEmpty': 'AMMO 0 — FIND A CRATE',
  'hud.special': '{mech} — {move}',
  'hud.ult': '⚡ {mech}: {move}! ⚡',

  // --------------------------------------------------------- battle soundtrack
  // {name} is the song's FILENAME from src/music/ — add a file, it plays.
  'music.nowPlaying': 'NOW PLAYING · {name}',
  'music.off': 'MUSIC OFF',
  'music.btn': 'music on/off',

  // --------------------------------------------------------------------- match
  'match.round': 'ROUND {n}',
  'match.intro': '{mech}: {quote}',
  'match.fight': 'FIGHT!',
  'match.ko': 'K.O.!',
  'match.timeUp': 'TIME UP',
  // brawl (3+ robots): the round is won by the one robot who never went down
  'match.lastStanding': 'LAST ONE STANDING',
  'match.roundWinner': '{mech} WINS THE ROUND',
  'match.draw': 'DRAW',

  // -------------------------------------------------------------------- toasts
  'toast.padConnected': '🎮 Controller connected: {id}',
  'toast.padDisconnected': '🎮 Controller disconnected',

  // ------------------------------------------------------- touch control pads
  'touch.light.label': 'LT',
  'touch.light.hint': 'Light',
  'touch.heavy.label': 'HV',
  'touch.heavy.hint': 'Heavy',
  'touch.jump.label': 'JMP',
  'touch.jump.hint': 'Jump',
  'touch.dash.label': 'DSH',
  'touch.dash.hint': 'Dash',
  'touch.block.label': 'BLK',
  'touch.block.hint': 'Block',
  'touch.duck.label': 'DUK',
  'touch.duck.hint': 'Duck',
  'touch.ranged.label': 'RNG',
  'touch.ranged.hint': 'Ranged',
  'touch.special.label': 'SP',
  'touch.special.hint': 'Special',
  'touch.ult.label': 'ULT',
  'touch.ult.hint': 'Ultimate',
  'touch.taunt.hint': 'Taunt',
  'touch.pause.hint': 'Pause',

  // ------------------------------------------------- in-combat banner callouts
  // AEGIS's JUDGEMENT ultimate holds court mid-arena
  'combat.judgement.0': 'JUDGEMENT',
  'combat.judgement.1': 'JUDGEMENT .',
  'combat.judgement.2': 'JUDGEMENT . .',
  'combat.judgement.3': 'JUDGEMENT . . .',
  'combat.judgement.dismissed': 'CASE DISMISSED',
  'combat.judgement.innocent': "INNOCENT: YOU'RE FREE TO GO",
  'combat.judgement.guilty': 'GUILTY: DEATH PENALTY',

  // =========================================================================
  // MECHS — name / title / bio / round quotes / move names.
  // Applied onto ROSTER at import time (src/mechs/roster.js), which keeps the
  // numbers (stats, damage, cooldowns) and the words in separate files.
  // =========================================================================
  'mech.titanus.name': 'TITANUS',
  'mech.titanus.title': 'The Iron Avalanche',
  'mech.titanus.blurb': 'A decommissioned siege engine that refused to power down. Slow as a glacier, hits like the end of the world. Speaks rarely — mostly in earthquakes.',
  'mech.titanus.quote.intro': '"I am the wall. I am the wrecking ball."',
  'mech.titanus.quote.win': '"Demolition complete. Anything else need... flattening?"',
  'mech.titanus.move.ranged': 'Rocket Fist',
  'mech.titanus.move.special': 'Skyline Slam',
  'mech.titanus.move.ult': 'METEOR BREAKER',

  'mech.vulcan.name': 'VULCAN',
  'mech.vulcan.title': 'The Lead Storm',
  'mech.vulcan.blurb': 'Ex-military fire-support platform with a laugh setting stuck on maniacal. Believes every problem is just insufficient ammunition.',
  'mech.vulcan.quote.intro': '"Say hello to my six little friends!"',
  'mech.vulcan.quote.win': '"HAHAHA! Reload and repeat! WHO\'S NEXT?!"',
  'mech.vulcan.move.ranged': 'Gatling Burst',
  'mech.vulcan.move.special': 'Micro-Missile Volley',
  'mech.vulcan.move.ult': 'BULLET HURRICANE',

  'mech.aegis.name': 'AEGIS',
  'mech.aegis.title': 'The Bastion of Dawn',
  'mech.aegis.blurb': 'A knight-errant forged from cathedral steel. Sworn to protect the innocent, the outnumbered, and anyone standing behind that enormous shield.',
  'mech.aegis.quote.intro': '"By dawn\'s light — I shall not falter!"',
  'mech.aegis.quote.win': '"Honor is the finest armor. Yield with grace, friend."',
  'mech.aegis.move.ranged': 'Dawn Javelin',
  'mech.aegis.move.special': 'Bulwark Bash',
  'mech.aegis.move.ult': 'JUDGEMENT',

  'mech.viper.name': 'VIPER',
  'mech.viper.title': 'The Whispering Fang',
  'mech.viper.blurb': 'A prototype infiltration unit that developed a taste for theatrics. Strikes from angles geometry teachers refuse to acknowledge.',
  'mech.viper.quote.intro': '"Shall we dance? You won\'t hear the music."',
  'mech.viper.quote.win': '"Ssso predictable. You never even sssaw me."',
  'mech.viper.move.ranged': 'Fang Throw',
  'mech.viper.move.special': 'Blade Cyclone',
  'mech.viper.move.ult': 'SERPENT STORM',

  'mech.nova.name': 'NOVA',
  'mech.nova.title': 'The Starborn Oracle',
  'mech.nova.blurb': 'Built around a fragment of a collapsed star. Speaks in riddles, fights in constellations. Gravity is more of a suggestion to her.',
  'mech.nova.quote.intro': '"Come — witness the light between worlds."',
  'mech.nova.quote.win': '"The stars foretold this. They usually do."',
  'mech.nova.move.ranged': 'Plasma Lance',
  'mech.nova.move.special': 'Starfall Trio',
  'mech.nova.move.ult': 'SUPERNOVA',

  'mech.rhino.name': 'RHINO',
  'mech.rhino.title': 'The Unstoppable Object',
  'mech.rhino.blurb': 'One horn. One direction. Zero brakes. RHINO once charged through four buildings to win an argument he was already winning.',
  'mech.rhino.quote.intro': '"You look like something worth flattening."',
  'mech.rhino.quote.win': '"HRRNGH! Next time — bring a wall that works!"',
  'mech.rhino.move.ranged': 'Shoulder Cannon',
  'mech.rhino.move.special': 'Bull Rush',
  'mech.rhino.move.ult': 'STAMPEDE',

  'mech.tempest.name': 'TEMPEST',
  'mech.tempest.title': 'The Voltage Virtuoso',
  'mech.tempest.blurb': 'A weather-control unit that discovered showmanship. Every battle is a concert, every lightning bolt a chord. The crowd goes wild; the crowd is usually on fire.',
  'mech.tempest.quote.intro': '"Lights up! The show starts NOW."',
  'mech.tempest.quote.win': '"⚡ ENCORE? No? Suit yourselves. I was ELECTRIC."',
  'mech.tempest.move.ranged': 'Arc Bolt',
  'mech.tempest.move.special': 'Static Overload',
  'mech.tempest.move.ult': 'THUNDERFALL',

  'mech.fenrir.name': 'FENRIR',
  'mech.fenrir.title': 'The Last Wild Thing',
  'mech.fenrir.blurb': 'An autonomous hunter-frame that slipped its leash decades ago. Runs with no pack, answers to no handler, howls at every full moon — and every explosion.',
  'mech.fenrir.quote.intro': '"I smell fear-coolant. It\'s yours."',
  'mech.fenrir.quote.win': '"*low growl* ...The hunt was short. Run faster next time."',
  'mech.fenrir.move.ranged': 'Rend Wave',
  'mech.fenrir.move.special': 'Lunar Pounce',
  'mech.fenrir.move.ult': 'WILD HUNT',

  'mech.colossus.name': 'COLOSSUS',
  'mech.colossus.title': 'The Patient Thunder',
  'mech.colossus.blurb': 'A firebase that learned to walk, then learned chess. Plays the long game: every shell placed three moves ahead of where you plan to be.',
  'mech.colossus.quote.intro': '"Range confirmed. This will be educational."',
  'mech.colossus.quote.win': '"Checkmate was eight shells ago. You just heard it now."',
  'mech.colossus.move.ranged': 'Mortar Lob',
  'mech.colossus.move.special': 'Skyline Toss',
  'mech.colossus.move.ult': 'COLOSSAL FORM',

  'mech.wraith.name': 'WRAITH',
  'mech.wraith.title': 'The Hollow Echo',
  'mech.wraith.blurb': 'Officially, this unit was scrapped years ago. Officially, nobody is picking off mechs from 800 meters. Officially, you are perfectly safe.',
  'mech.wraith.quote.intro': '"*static* ...target acquired."',
  'mech.wraith.quote.win': '"...you were dead before the round began."',
  'mech.wraith.move.ranged': 'Night Swarm',
  'mech.wraith.move.special': 'Ghost Protocol',
  'mech.wraith.move.ult': 'DEATH SWARM',

  'mech.inferno.name': 'INFERNO',
  'mech.inferno.title': 'The Joyful Furnace',
  'mech.inferno.blurb': 'A demolition unit whose safety governor "fell off" — twice. Finds fire genuinely hilarious. The laughter you hear over the flames? That\'s him having the best day ever.',
  'mech.inferno.quote.intro': '"Who ordered the flame-grilled special?!"',
  'mech.inferno.quote.win': '"AHAHA! TOASTY! Anyone else cold? ANYONE?"',
  'mech.inferno.move.ranged': "Dragon's Breath",
  'mech.inferno.move.special': 'Napalm Carpet',
  'mech.inferno.move.ult': 'FIRE TORNADO',

  'mech.glacier.name': 'GLACIER',
  'mech.glacier.title': 'The Cold Shoulder',
  'mech.glacier.blurb': 'Guardian of a polar research station, promoted to war machine by boredom. Devastating in combat, insufferable at parties — every joke is about ice, and he thinks they all land.',
  'mech.glacier.quote.intro': '"Chill out. No? Fine — I\'ll handle it."',
  'mech.glacier.quote.win': '"Ice to beat you. ...I\'m contractually obligated to say that."',
  'mech.glacier.move.ranged': 'Icicle Barrage',
  'mech.glacier.move.special': 'Cryo Beam',
  'mech.glacier.move.ult': 'ABSOLUTE ZERO',

  'mech.cranky.name': 'CRANKY',
  'mech.cranky.title': 'The Abyssal Bulwark',
  'mech.cranky.blurb': 'A deep-sea salvage rig that got tired of being salvaged. Waddled ashore trailing kelp and grudges, shell first, questions never. The claws are non-negotiable.',
  'mech.cranky.quote.intro': '"You look... crackable."',
  'mech.cranky.quote.win': '"*bubbling chuckle* Shell: 1. Everything else: 0."',
  'mech.cranky.move.ranged': 'Hydro Hose',
  'mech.cranky.move.special': 'Geyser',
  'mech.cranky.move.ult': 'TSUNAMI',

  'mech.saurion.name': 'SAURION',
  'mech.saurion.title': 'The Apex Prototype',
  'mech.saurion.blurb': 'Unit MX-7, grown in a black-site lab by a corporation that wanted to end wars by ending everything else. It ate the lab, filed itself as CEO, and went hunting.',
  'mech.saurion.quote.intro': '"Clever girl? No. Clever MACHINE."',
  'mech.saurion.quote.win': '"*metallic shriek* Target archive updated: extinct."',
  'mech.saurion.move.ranged': 'Quill Fan',
  'mech.saurion.move.special': 'Sickle Pounce',
  'mech.saurion.move.ult': 'RAPTOR PACK',

  'mech.frogger.name': 'FROGGER',
  'mech.frogger.title': 'The Gunk Gladiator',
  'mech.frogger.blurb': 'Vat-grown smart-slime poured into a bounce-frame with four gunk guns and no indoor voice. Jumps like gravity is a suggestion, lands like a lawsuit.',
  'mech.frogger.quote.intro': '"Four arms. Zero mercy. MAXIMUM GUNK."',
  'mech.frogger.quote.win': '"Ribbit means gg. Look it up."',
  'mech.frogger.move.ranged': 'Slime Slinger',
  'mech.frogger.move.special': 'Quad Gunk Barrage',
  'mech.frogger.move.ult': 'SONIC CROAK',

  'mech.jerry.name': 'JERRY',
  'mech.jerry.title': 'The Tide-Bringer',
  'mech.jerry.blurb': 'Dredged from a flooded aquaculture lab, JERRY is a colony pretending to be a mech. The cannons are full of something alive. He would like you to hold still.',
  'mech.jerry.quote.intro': '"They’re hungry. I’m generous."',
  'mech.jerry.quote.win': '"*wet clicking* ...the swarm is fed. For now."',
  'mech.jerry.move.ranged': 'Bilge Spit',
  'mech.jerry.move.special': 'Brine Swarm',
  'mech.jerry.move.ult': 'FLEA CIRCUS',

  'mech.nullbot.name': 'NULLBOT',
  'mech.nullbot.title': 'The Fatal Exception',
  'mech.nullbot.blurb': "Nobody built NULLBOT. It was simply found in the arena's memory one morning, already undefeated. Where it walks, textures tear, audio stutters, and the scoreboard reads NaN.",
  'mech.nullbot.quote.intro': '"> fatal exception 0x00NULLBOT :: you will be nullified"',
  'mech.nullbot.quote.win': '"SEGMENTATION FAULT. core dumped. ...that was you."',
  'mech.nullbot.move.ranged': 'Null Pointer',
  'mech.nullbot.move.special': 'SEGFAULT',
  'mech.nullbot.move.ult': 'SYSTEM CRASH',

  'mech.konga.name': 'KONGA',
  'mech.konga.title': 'The Silverback Siege',
  'mech.konga.blurb': 'Half the mountain gorilla they started with, half the ordnance they bolted on afterward. The engineers called the arm-graft a success. KONGA calls it the smaller fist.',
  'mech.konga.quote.intro': '"*drums chest* ...Come closer. I want to reach you."',
  'mech.konga.quote.win': '"You brought armor. I brought both arms."',
  'mech.konga.move.ranged': 'Shoulder Salvo',
  'mech.konga.move.special': 'Skull Driver',
  'mech.konga.move.ult': 'APEX POUND',

  'mech.tritone.name': 'TRITONE',
  'mech.tritone.title': 'The Walking Siege',
  'mech.tritone.blurb': 'Three horns, two cannons, one direction. TRITONE was rebuilt as a mobile gun platform, but nobody told the animal underneath — it still prefers to solve things at a full gallop.',
  'mech.tritone.quote.intro': '"*low bellow* ...Move, or be moved."',
  'mech.tritone.quote.win': '"The horns were enough. The guns were courtesy."',
  'mech.tritone.move.ranged': 'Flank Cannons',
  'mech.tritone.move.special': 'Gore Charge',
  'mech.tritone.move.ult': 'SIEGE PROTOCOL',

  // =========================================================================
  // ARENAS — applied onto THEMES at import time (src/arena/themes.js).
  // =========================================================================
  'arena.neon.name': 'Neon District',
  'arena.neon.desc': 'Downtown at midnight. The signs stay lit even while the towers come down.',
  'arena.foundry.name': 'Ironworks Foundry',
  'arena.foundry.desc': 'Steam, brass and molten light. The old machine-heart of Robotworld still beats.',
  'arena.uptown.name': 'Uptown Plaza',
  'arena.uptown.desc': 'Glass towers, blue skies, and a city block with excellent demolition insurance.',
  'arena.harbor.name': 'Harbor Docks',
  'arena.harbor.desc': 'Cranes, containers, salt air — and nowhere for a 40-ton mech to hide.',
  'arena.skyterrace.name': 'Sky Terrace',
  'arena.skyterrace.desc': 'A rooftop arena above the cloud deck. Mind the drop. Actually — use the drop.',
  'arena.scrapyard.name': 'Scrapyard 7',
  'arena.scrapyard.desc': 'Where old mechs go to rest. Tonight, the scrap pile grows either way.',
  'arena.quarry.name': 'Crystal Quarry',
  'arena.quarry.desc': 'A mining pit lined with resonant crystal. Every impact rings like a bell.',
  'arena.volcano.name': 'Volcanic Forge',
  'arena.volcano.desc': 'Built on a live caldera. The floor is not lava — but it is adjacent.',
  'arena.frozen.name': 'Frozen Outpost',
  'arena.frozen.desc': 'Research station K-9. Ambient temperature: hostile. Combat temperature: worse.',
  'arena.ruins.name': 'Desert Ruins',
  'arena.ruins.desc': 'An excavation site older than the war. The columns held for 3,000 years. Held.',
  'arena.jungle.name': 'Jungle Temple',
  'arena.jungle.desc': 'The canopy hides an arena the old kings built. The vines will grow back. Probably.',
  'arena.orbital.name': 'Orbital Platform',
  'arena.orbital.desc': "Station VALKYRIE's landing deck. Artificial gravity, genuine consequences.",
};

// active table — swap wholesale for another language
let active = MESSAGES;

/** Install a different message table (i18n). Missing ids fall back to English. */
export function setMessages(table) {
  active = table === MESSAGES ? MESSAGES : { ...MESSAGES, ...table };
}

/** True when `id` exists in the active table. */
export function hasMessage(id) {
  return Object.prototype.hasOwnProperty.call(active, id);
}

/**
 * Look up a message and substitute {placeholders}.
 *   t('match.round', { n: 2 })  →  'ROUND 2'
 * An unknown id returns the id itself (loud but harmless on screen).
 */
export function t(id, params = null) {
  let s = active[id];
  if (s === undefined) {
    if (import.meta.env?.DEV) console.warn('[text] missing message id:', id);
    return id;
  }
  if (params) {
    s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : params[k]));
  }
  return s;
}

/**
 * Apply `mech.<id>.*` / `arena.<id>.*` text onto a data record, so gameplay
 * code can keep reading `def.name`, `theme.desc`, `def.moves.ult.name`, …
 * Fields with no message id are left exactly as the data file declared them.
 */
export function applyMechText(def) {
  const p = `mech.${def.id}.`;
  if (hasMessage(p + 'name')) def.name = t(p + 'name');
  if (hasMessage(p + 'title')) def.title = t(p + 'title');
  if (hasMessage(p + 'blurb')) def.blurb = t(p + 'blurb');
  if (def.quotes) {
    if (hasMessage(p + 'quote.intro')) def.quotes.intro = t(p + 'quote.intro');
    if (hasMessage(p + 'quote.win')) def.quotes.win = t(p + 'quote.win');
  }
  for (const k of ['ranged', 'special', 'ult']) {
    if (def.moves?.[k] && hasMessage(`${p}move.${k}`)) def.moves[k].name = t(`${p}move.${k}`);
  }
  return def;
}

export function applyArenaText(theme) {
  const p = `arena.${theme.id}.`;
  if (hasMessage(p + 'name')) theme.name = t(p + 'name');
  if (hasMessage(p + 'desc')) theme.desc = t(p + 'desc');
  return theme;
}
