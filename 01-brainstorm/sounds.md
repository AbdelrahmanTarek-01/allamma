# Sound effects — every game, every meaningful moment

Rules
- WebAudio synth only (client/src/sound.ts). Reuse existing sfx where they fit; add new ones there. All on the sfx bus; respect mute/volume.
- Never play a sound that leaks a secret to people sitting together (e.g. same sound for every role, every reveal).
- Add vibration (buzz) on: your turn, time almost up (last 5s), correct/wrong, big result.
- Ticking: soft tick each second in the last 5s of ANY timer, rising pitch in the last 3.
- Music: 'tension' during guessing/bidding/drawing phases, 'lobby' elsewhere; duck music 50% under big moments.

Shared (all games)
- round start: start · your turn: turn + buzz · timer last 5s: tick (rising) · time up: close
- correct: confirm/gotcha · wrong: error · "قريب!": new soft 'near' (two quick high notes)
- standings: rows move = whoosh per move; points count = soft tick stream; rank up = pop; rank down = low blip
- game over: drumroll → fanfare on podium #1 + crown; confetti = pop sprinkle; team win = win; your loss = lose (soft, not sad)
- help sheet open/close: card/close · votes/likes: pop

Spy: role card flip = flip+stamp (same for all roles) · vote cast = vote · reveal = drumroll → gotcha (caught) / boo (escaped) · spy last guess = tension tick
Map: pin drop = pinDrop · reveal arcs = lineDraw per player · closest = crown
Wave: needle drag = soft tick per notch · lock = confirm · reveal sweep = whoosh → bullseye = fanfare short
Quiz: pick cell = card · question appear = whoosh · 50:50 = new 'poof' (two descending noise puffs) · lock answer = confirm · steal = new 'swipe' · right/wrong = gotcha/error
Words: card flip = flip · team colour = confirm · neutral = soft · other team = error · BOMB = new 'boom' (low noise burst + sub thump, 0.8s) with screen shake + buzz long · board win = win
Auction: each bid = new 'coin' (bright double ding), pitch up with price · "على واحد/اتنين" = tick louder · SOLD = new 'gavel' (hard wood knock x1) + stamp · coins fly = coin sprinkle · prediction right = pop
Draw: pick word = card · start drawing = start · submit drawing = stamp · guess phase start = turn + buzz for guessers · someone guessed (others) = soft pop · you guessed = gotcha · reveal-letter card = flip · out of attempts = error low · gallery like = pop
