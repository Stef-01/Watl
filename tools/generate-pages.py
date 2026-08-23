# -*- coding: utf-8 -*-
"""
Compose the interior pages from one shell.

The site is deliberately a set of plain documents with no build-time
templating, which is fine for five pages until the masthead changes and you
have to edit it five times. This script is the seam: shell here, body per
page, written out as the static files Vite then treats as entries.
"""
import io, os
os.chdir(r"C:\Users\stefa\Desktop\Watl")

NAV = [("index.html", "Index"), ("work.html", "Work"), ("approach.html", "Craft"),
       ("about.html", "Studio"), ("contact.html", "Contact")]

FOOT_LINKS = """      <div>
        <h4>Site</h4>
        <ul class="foot__list">
%s
        </ul>
      </div>""" % "\n".join(
    '          <li><a href="%s">%s</a></li>' % (h, t) for h, t in NAV)


def head(title, desc):
    return """<!DOCTYPE html>
<html lang="en-AU" data-theme="light" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(title)s</title>
<meta name="description" content="%(desc)s">
<meta name="theme-color" content="#FBFBFA">
<meta name="theme-color" content="#0D0D0C" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<meta property="og:type" content="website">
<meta property="og:title" content="%(title)s">
<meta property="og:description" content="%(desc)s">
<meta property="og:image" content="https://watl.com.au/assets/og.jpg">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,200..400;1,6..72,200..300&display=swap" rel="stylesheet">
<script>document.documentElement.classList.remove("no-js");try{var t=localStorage.getItem("watl-theme");if(t)document.documentElement.setAttribute("data-theme",t);else if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.setAttribute("data-theme","dark");}catch(e){}</script>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
""" % {"title": title, "desc": desc}


def mast(current):
    links = "\n".join(
        '      <a href="%s"%s>%s</a>' % (h, ' aria-current="page"' if h == current else "", t)
        for h, t in NAV)
    return """
<header class="mast">
  <div class="mast__in">
    <a class="brand" href="index.html" aria-label="WATL \u2014 home">
      <span class="brand__mark">WATL</span>
      <span class="brand__sub">Wattle Technologies</span>
    </a>
    <nav class="nav" id="primary-nav" data-open="false" aria-label="Primary">
%(links)s
    </nav>
    <div class="tools">
      <button class="theme-btn" type="button" data-theme-toggle aria-label="Switch to dark theme" aria-pressed="false">
        <svg class="moon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>
        <svg class="sun" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" stroke-linecap="round"/></svg>
      </button>
      <button class="nav-toggle" type="button" data-nav-toggle aria-expanded="false" aria-controls="primary-nav" aria-label="Menu"><span></span></button>
    </div>
  </div>
</header>
""" % {"links": links}


def foot(this_page=""):
    block = this_page or """      <div>
        <h4>Practice</h4>
        <ul class="foot__list">
          <li><a href="approach.html#gild">How the gild works</a></li>
          <li><a href="approach.html#motion">The motion system</a></li>
          <li><a href="work.html#bloom">Bloom of Remembrance</a></li>
        </ul>
      </div>"""
    return """
<footer class="foot">
  <div class="wrap">
    <div class="foot__grid">
      <div>
        <h4>WATL</h4>
        <ul class="foot__list">
          <li>Visual design, Wattle Technologies</li>
          <li>Naarm / Melbourne</li>
          <li><a href="mailto:hello@wattle.technology">hello@wattle.technology</a></li>
        </ul>
      </div>
%(nav)s
%(block)s
      <div>
        <h4>Elsewhere</h4>
        <ul class="foot__list">
          <li><a href="https://github.com/Stef-01/Watl">Source</a></li>
        </ul>
      </div>
    </div>

    <p class="foot__mark">WATL</p>

    <p class="foot__ack">WATL works on the lands of the Wurundjeri Woi-wurrung and Bunurong peoples of the Kulin Nation. We pay respect to Elders past and present, and acknowledge that the longest continuous practice of reading country, season and signal on this continent is not ours.</p>

    <div class="foot__base">
      <span>&copy; <span data-year>2026</span> Wattle Technologies</span>
      <span>Signals before seasons</span>
    </div>
  </div>
</footer>

<script type="module" src="/src/main.js"></script>
</body>
</html>
""" % {"nav": FOOT_LINKS, "block": block}


def page(path, title, desc, body, this_page=""):
    html = head(title, desc) + mast(path) + body + foot(this_page)
    io.open(path, "w", encoding="utf-8", newline="\n").write(html)
    print("  wrote", path, len(html), "bytes")


def seam(idx, h2, body, anchor=""):
    a = ' id="%s"' % anchor if anchor else ""
    return """
  <section class="seam"%(a)s>
    <div class="wrap seam__in" data-reveal>
      <p class="meta seam__idx">%(idx)s</p>
      <h2>%(h2)s</h2>
      <div class="seam__body">
%(body)s
      </div>
    </div>
  </section>
""" % {"a": a, "idx": idx, "h2": h2, "body": body}


def ledger(rows, top=""):
    out = ['\n  <div class="wrap" style="margin-top:%s" data-reveal>\n    <div class="ledger" data-cascade>'
           % (top or "clamp(3rem,7vw,5rem)")]
    for label, term, prose in rows:
        out.append("""      <article class="ledger__row">
        <p class="meta">%s</p>
        <h3>%s</h3>
        <div><p>%s</p></div>
      </article>""" % (label, term, prose))
    out.append("    </div>\n  </div>\n")
    return "\n".join(out)


# =====================================================================
# Craft
# =====================================================================
craft_body = """
<main id="main">

  <section class="head">
    <div class="wrap">
      <p class="meta">Craft</p>
      <h1>How the work<br>is actually made</h1>
      <p class="lede">Not a philosophy page. The specific decisions behind the piece on the index, and why each one went the way it did.</p>
    </div>
  </section>
""" + seam("01 \u2014 Principle", "Describe it,<br>do not draw it", """        <p class="lede">A poster is a fixed crop of one moment. Everything we make has to survive a resize, a theme flip and a visitor who moves.</p>
        <div class="prose">
          <p>So the first question on any piece is whether it can be written down as a rule rather than baked into a file. A leaf that exists as forty lines of canvas code can be retuned by changing a number, recoloured for a dark ground, and drawn crisp at whatever pixel density the visitor turns up with. The same leaf as a PNG is a decision you can no longer revisit.</p>
          <p>It also keeps the work honest. If the vine on the figure's chest can be described \u2014 stem, pairs, taper, lean \u2014 then we understand it. If it can only be exported, we do not.</p>
        </div>""") + seam("02 \u2014 Light", "The gild", """        <p class="lede">A physically based material spends its budget conserving energy. An illustration needs control instead.</p>
        <div class="prose">
          <p>The figure's material is a hand-written lighting model, five terms deep, and every one of them is there for a reason you can point at:</p>
        </div>""", anchor="gild") + ledger([
    ("Key", "One soft light, above and front", "Half-lambert rather than true lambert, because a hard terminator fights the flatness the reference depends on. Raised to a small power so the falloff is not linear."),
    ("Bounce", "Warm light from below", "The figure stands in a field of gold, so the field lights it. Only downward-facing surfaces receive it. This is the term that keeps the underside of the jaw alive."),
    ("Rim", "A contour, kept quiet", "Fresnel along the silhouette. The first version ran it at double strength and the body read as chrome \u2014 the reference defines its figure by value contrast against a bright ground, not by a hot edge."),
    ("Mottle", "Low-frequency noise", "Layered soft blobs at three frequencies, so the gradients read as beaten leaf rather than as plastic."),
    ("Aerial", "Distance dissolves into haze", "The trick the reference leans on hardest. The band is tied to the live camera distance, so only the field recedes and never the figure \u2014 the first version fixed it at seven units, the lens moved to eleven, and the figure dissolved into its own atmosphere."),
]) + seam("03 \u2014 Colour", "Two bugs that<br>looked like taste", """        <div class="prose">
          <p>Both of these read as bad art direction and were neither. Both were found by measuring pixels out of a screenshot rather than by looking harder.</p>
          <p><strong>The figure was a paper cut-out.</strong> No palette change fixed it. The composer's terminal pass was writing linear values straight into an sRGB canvas: custom shaders receive neither of three.js's tone-mapping nor colour-space includes, so every colour arrived on screen as its own square. A bronze at twenty-three per cent luminance landed at five. The fix is one pass at the end of the chain, and it belongs on every device \u2014 correct colour is not a quality tier.</p>
          <p><strong>The face was blank.</strong> The eyes are geometry, not paint, and they sat at a depth of 0.152 on a head whose surface is at 0.162. They were inside the skull. Two millimetres of world space.</p>
          <p>The lesson we keep relearning: when a render looks wrong, sample it. An impression of a screenshot will send you to the palette every time.</p>
        </div>""") + seam("04 \u2014 Timing", "The motion<br>system", """        <p class="lede">Springs for anything a hand drives. Tweens for anything the page drives.</p>
        <div class="prose">
          <p>The distinction is physical. A cursor is a hand, and a hand has mass, so it gets a spring. A scrollbar is a position, so it gets read straight. Mixing them up is why so much web motion feels either sluggish or twitchy.</p>
          <p>One library covers both the DOM and the geometry, which matters more than it sounds: when the title's letters land, the vine has finished climbing, and that only stays true while one timeline owns both.</p>
          <p>Reduced motion is a design, not a subtraction. The scene renders exactly one frame \u2014 the composition, held \u2014 and then never touches the animation loop again.</p>
        </div>""", anchor="motion") + ledger([
    ("Pointer", "Two springs, deliberately mismatched", "The horizontal is looser than the vertical. A lens that yaws freely and pitches reluctantly reads as a head turning; matched springs read as a gimbal."),
    ("Heat", "Proximity, not hover", "The body warms as the cursor closes on where the chest actually projects to \u2014 so the hot zone follows the entity when the lens swings, instead of sitting in a fixed rectangle."),
    ("Pulse", "One gesture, four answers", "Petals fly on an ease-out, the body's heat spikes and decays, the vine relights from the root, and the lens takes a small breath in. Four curves, one press."),
    ("Arrival", "Tracking, then rise, then spring", "The eyebrow opens out of tight letter-spacing. The title rises a letter at a time. The ornament arrives on a spring, which is the only bounce on the site."),
]) + seam("05 \u2014 Cost", "Three tiers,<br>decided once", """        <div class="prose">
          <p>Device capability is read once at startup \u2014 pointer type, core count, viewport \u2014 and turned into a single value. Nothing else in the codebase branches on device.</p>
          <p>That value picks instance counts, pixel ratio and whether the glow pass exists. The composition is identical on a phone; there is simply less of it. What never varies is the colour pipeline, the proportions, or the interaction.</p>
          <p>The whole artwork is behind a dynamic import guarded by two questions \u2014 is there a canvas, and is there WebGL. Everything else on the page runs immediately, and the type starts arriving before the GPU has answered.</p>
        </div>""") + """
  <section class="seam">
    <div class="wrap seam__in" data-reveal>
      <p class="meta seam__idx">06 \u2014 Next</p>
      <h2>See it<br>working</h2>
      <div class="seam__body">
        <p class="prose">The piece all of this describes is on the index page, and its source is public.</p>
        <p style="margin-top:2.4rem"><a class="go" href="work.html#bloom" data-go>Bloom of Remembrance <span data-arrow aria-hidden="true">&rarr;</span></a></p>
      </div>
    </div>
  </section>

</main>
"""

page("approach.html", "Craft \u2014 WATL",
     "How WATL's work is made: the hand-written gild, the motion system, the colour pipeline, and the three quality tiers.",
     craft_body,
     """      <div>
        <h4>This page</h4>
        <ul class="foot__list">
          <li><a href="#gild">The gild</a></li>
          <li><a href="#motion">The motion system</a></li>
        </ul>
      </div>""")

# =====================================================================
# Studio
# =====================================================================
studio_body = """
<main id="main">

  <section class="head">
    <div class="wrap">
      <p class="meta">Studio</p>
      <h1>The design arm<br>of a futures practice</h1>
      <p class="lede">WATL makes the visual work for Wattle Technologies, and takes outside briefs when the problem is interesting.</p>
    </div>
  </section>
""" + seam("01 \u2014 Position", "Design downstream<br>of an argument", """        <div class="prose">
          <p>Wattle Technologies is a modern futurism practice: signal intelligence, scenario architecture, applied prototypes. That work produces a great deal that has to be looked at \u2014 scenarios that need a form, prototypes that need an interface, arguments that need an image before anyone will fund them.</p>
          <p>WATL is the arm that does the looking-at. It means our design work starts somewhere unusual: not from a moodboard, but from a claim about the future that somebody has to be persuaded is real.</p>
          <p>The practical effect is that we are used to designing for things that do not exist yet, for audiences who are sceptical, on evidence that is still thin. That is a specific skill and it is most of what we do.</p>
        </div>""") + seam("02 \u2014 Name", "Wattle blooms<br>in winter", """        <p class="lede"><em>Acacia pycnantha</em> flowers while the ground is still cold. The first colour in the paddock, and the last thing you would bet on.</p>
        <div class="prose">
          <p>The flower is the obvious half of the reference. The useful half is the behaviour: wattle is a pioneer species. It colonises disturbed ground, fixes nitrogen into soil nothing else will grow in, and leaves the place richer than it found it.</p>
          <p>That is the standard we hold the studio to. We would rather work on ground nobody has made legible yet than add another layer to something already well-designed.</p>
        </div>""", anchor="principle") + seam("03 \u2014 Method", "How a brief<br>runs", "") + ledger([
    ("01", "Read", "We start with the argument, not the aesthetic. What is the claim, who disbelieves it, and what would change their mind. If nobody can answer the third question, the design brief is not ready."),
    ("02", "Frame", "Two or three genuinely different directions, each taken far enough to be judged \u2014 not one idea with three colourways. You pick a direction, or you tell us both are wrong, which is also useful."),
    ("03", "Build", "Made in the medium it will live in. Browser work is designed in a browser against real copy. Print is proofed on the stock. Nothing is approved from a mockup that flatters it."),
    ("04", "Hand over", "Source, tokens, a short written standard, and a walkthrough with whoever has to maintain it. If the handover needs us to explain it twice, the system is wrong and we fix the system."),
], top="clamp(1rem,3vw,2rem)") + seam("04 \u2014 Terms", "How we<br>work", """        <div class="prose">
          <p>Fixed scope, fixed fee, agreed in writing before anything starts. Rate card on request. No hourly billing.</p>
          <p>Two rounds of revision are in every quote, and a third is free if we misread the brief. We will tell you which of those is happening.</p>
          <p>You own the output outright, including source. We ask only to be able to show the work once it is public, and we will wait as long as you need.</p>
          <p>We are small. If we cannot do your brief well we will say so on the first call, and where we can, point you at someone who can.</p>
        </div>""") + """
  <section class="seam">
    <div class="wrap seam__in" data-reveal>
      <p class="meta seam__idx">05 \u2014 Next</p>
      <h2>Start<br>a brief</h2>
      <div class="seam__body">
        <p class="prose">Naarm / Melbourne. Working remotely across Australian time zones, and awake later than we should be for European ones.</p>
        <p style="margin-top:2.4rem"><a class="act" href="contact.html">Start a brief</a></p>
      </div>
    </div>
  </section>

</main>
"""

page("about.html", "Studio \u2014 WATL",
     "WATL is the visual design arm of Wattle Technologies. How the studio is positioned, how a brief runs, and the terms it runs on.",
     studio_body,
     """      <div>
        <h4>This page</h4>
        <ul class="foot__list">
          <li><a href="#principle">The wattle principle</a></li>
          <li><a href="work.html#bloom">Bloom of Remembrance</a></li>
        </ul>
      </div>""")

# =====================================================================
# Contact
# =====================================================================
contact_body = """
<main id="main">

  <section class="head">
    <div class="wrap">
      <p class="meta">Contact</p>
      <h1>Tell us what<br>has to be seen</h1>
      <p class="lede">And who has to be convinced. That second part is usually the brief.</p>
    </div>
  </section>

  <section class="seam">
    <div class="wrap seam__in" data-reveal>
      <p class="meta seam__idx">01 \u2014 Brief</p>
      <h2>A short<br>form</h2>
      <div class="seam__body">
        <p class="prose" style="margin-bottom:2.5rem">Four fields, and none of it goes anywhere but your own mail client \u2014 the form composes a message and hands it to you to send. There is no analytics on this site and nothing to consent to.</p>

        <form data-contact-form novalidate>
          <div class="field">
            <label for="name">Name</label>
            <input id="name" name="name" type="text" autocomplete="name" required>
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input id="email" name="email" type="email" autocomplete="email" required>
          </div>
          <div class="field">
            <label for="org">Organisation</label>
            <input id="org" name="org" type="text" autocomplete="organization">
          </div>
          <div class="field">
            <label for="horizon">When</label>
            <select id="horizon" name="horizon">
              <option value="">Choose one</option>
              <option>This quarter</option>
              <option>Next quarter</option>
              <option>This year, no date yet</option>
              <option>Exploring</option>
            </select>
          </div>
          <div class="field">
            <label for="brief">The brief</label>
            <textarea id="brief" name="brief" rows="6" required placeholder="What has to be seen, and who has to be convinced."></textarea>
          </div>
          <button class="act" type="submit">Compose the email</button>
          <p class="form-status" role="status" aria-live="polite"></p>
        </form>
      </div>
    </div>
  </section>
""" + seam("02 \u2014 Direct", "Or just<br>write to us", """        <div class="prose">
          <p><a href="mailto:hello@wattle.technology">hello@wattle.technology</a></p>
          <p>Naarm / Melbourne. We answer within two working days, and if the answer is no you will get that within one.</p>
          <p>A useful first email is three paragraphs: what the thing is, who it has to persuade, and when it has to exist. Budget helps and is never held against you \u2014 it is the fastest way for both of us to know whether this is worth a call.</p>
        </div>""") + """
</main>
"""

page("contact.html", "Contact \u2014 WATL",
     "Start a brief with WATL. A short form, or write directly to hello@wattle.technology.",
     contact_body)

# =====================================================================
# 404
# =====================================================================
notfound_body = """
<main id="main">
  <section class="head">
    <div class="wrap">
      <p class="meta">404</p>
      <h1>Nothing<br>grows here</h1>
      <p class="lede">The page you asked for is not on this site. It may never have been.</p>
      <p style="margin-top:clamp(2.5rem,6vw,4rem)"><a class="go" href="index.html" data-go>Back to the index <span data-arrow aria-hidden="true">&rarr;</span></a></p>
    </div>
  </section>
</main>
"""

page("404.html", "Not found \u2014 WATL", "That page is not on this site.", notfound_body)
print("done")
