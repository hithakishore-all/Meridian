"""Record the captioned Meridian walkthrough video from the clickable demo.

    python3 scripts/record_walkthrough.py OUT_DIR [--url URL] [--fonts DIR]

Drives the clickable demo (default: the live page) with Playwright through one story: a buyer searches and buys,
IT deploys, three agents run under policy (GTM Orbit, Conviction AI, Fieldwise), and the operator reviews a
submission and checks marketplace health. Every painted frame is captured through the Chrome screencast into
OUT_DIR/frames/*.jpg plus OUT_DIR/timeline.json and chapters.json; scripts/encode_walkthrough.py turns that into
an MP4. Silent by design: captions and highlights carry the story.

--fonts points at a node_modules/@fontsource folder (ibm-plex-sans, ibm-plex-mono, bricolage-grotesque, archivo,
source-sans-3). When given, requests to Google Fonts are answered from those local files, so the video uses the
demo's real typefaces even where Google Fonts cannot be reached.
"""
import argparse
import asyncio
import base64
import json
import time
from pathlib import Path

from playwright.async_api import async_playwright

OVERLAY = (Path(__file__).parent / "overlay.js").read_text()
W, H = 1280, 800
LIVE = "https://hithakishore-all.github.io/meridian/"
PC = {"Marcus": "#f08a00", "Priya": "#0ea5e9", "Jordan": "#e0336f", "Avery": "#7c3aed", "Ana": "#2450D8", "Ops": "#11865a"}
ROLE = {"Marcus": "procurement", "Priya": "IT admin", "Jordan": "sales rep", "Avery": "deal team",
        "Ana": "service desk", "Ops": "marketplace operator"}
LOGO = ('<svg viewBox="0 0 28 28"><circle cx="14" cy="14" r="12" fill="none" stroke="#ff5c93" stroke-width="2"/>'
        '<path d="M14 2v24M2 14h24" stroke="#ff5c93" stroke-width="1.2"/><circle cx="14" cy="14" r="3.5" fill="#ffb23f"/></svg>')
TOTAL = 15
FONTS = {  # family -> (fontsource package, weights)
    "Bricolage Grotesque": ("bricolage-grotesque", [500, 700]),
    "IBM Plex Sans": ("ibm-plex-sans", [400, 500, 600]),
    "IBM Plex Mono": ("ibm-plex-mono", [400, 500, 600]),
    "Archivo": ("archivo", [700]),
    "Source Sans 3": ("source-sans-3", [400, 600]),
}


def font_css():
    rules = []
    for fam, (pkg, weights) in FONTS.items():
        for w in weights:
            rules.append(f"@font-face{{font-family:'{fam}';font-style:normal;font-weight:{w};font-display:block;"
                         f"src:url(https://fonts.gstatic.com/local/{pkg}/{pkg}-latin-{w}-normal.woff2) format('woff2')}}")
    return "\n".join(rules)


class Recorder:
    def __init__(self, out: Path):
        self.out, self.frames, self.events, self.chapters = out, [], [], []
        (out / "frames").mkdir(parents=True, exist_ok=True)
        self.cdp, self.seg_start, self.acc, self.n = None, None, 0.0, 0

    async def use(self, page):
        await self.stop()
        self.cdp = await page.context.new_cdp_session(page)

        async def on_frame(params):
            self.n += 1
            path = self.out / "frames" / f"{self.n:06d}.jpg"
            path.write_bytes(base64.b64decode(params["data"]))
            self.frames.append((str(path), time.monotonic()))
            try:
                await self.cdp.send("Page.screencastFrameAck", {"sessionId": params["sessionId"]})
            except Exception:  # noqa: BLE001
                pass
        self.cdp.on("Page.screencastFrame", lambda p: asyncio.ensure_future(on_frame(p)))
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92, "maxWidth": W, "maxHeight": H, "everyNthFrame": 1})
        self.seg_start = time.monotonic()
        self.events.append(("start", self.seg_start))

    async def stop(self):
        if self.cdp:
            await asyncio.sleep(0.15)
            end = time.monotonic()
            try:
                await self.cdp.send("Page.stopScreencast")
            except Exception:  # noqa: BLE001
                pass
            self.events.append(("end", end))
            self.acc += end - self.seg_start
            self.cdp = None

    def now(self):
        return self.acc + (time.monotonic() - self.seg_start)

    def save(self):
        (self.out / "timeline.json").write_text(json.dumps({"frames": self.frames, "events": self.events}))
        (self.out / "chapters.json").write_text(json.dumps(self.chapters, indent=1))


async def wait(s):
    await asyncio.sleep(s)


async def main(out: Path, url: str, fonts: Path | None):
    rec = Recorder(out)
    step = {"n": 0}

    async def cap(page, who, title, body):
        step["n"] += 1
        rec.chapters.append({"t": round(rec.now(), 2), "title": title, "who": who})
        await page.evaluate("c => __fw.cap(c)", {"n": f"{step['n']:02d} / {TOTAL} · {who} · {ROLE[who]}", "t": title, "b": body,
                                                  "pc": PC[who]})

    async def to(page, loc):
        await loc.scroll_into_view_if_needed()
        box = await loc.bounding_box()
        x, y = box["x"] + min(box["width"] / 2, 60), box["y"] + box["height"] / 2
        await page.evaluate("([x,y]) => __fw.cur(x,y)", [x, y])
        await wait(0.85)

    async def click(page, loc, settle=0.9):
        await to(page, loc)
        await page.evaluate("() => __fw.ripple()")
        await wait(0.25)
        await loc.click()
        await wait(settle)

    async def show(page, loc, label, secs, top=150):
        await loc.evaluate(f"e => {{ const r = e.getBoundingClientRect(); window.scrollBy({{top: r.top - {top}, behavior: 'smooth'}}); }}")
        await wait(0.5)
        b = await loc.bounding_box()
        for _ in range(15):  # wait for smooth scrolling and re-renders to settle, so the box lands on the element
            await wait(0.12)
            nb = await loc.bounding_box()
            if nb == b:
                break
            b = nb
        await page.evaluate("([x,y,w,h,l]) => __fw.hl(x,y,w,h,l)", [b["x"], b["y"], b["width"], b["height"], label])
        await wait(secs)

    async def nohl(page):
        await page.evaluate("() => __fw.nohl()")
        await wait(0.3)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={"width": W, "height": H}, device_scale_factor=1, color_scheme="light")
        await ctx.add_init_script(OVERLAY)
        if fonts:
            css = font_css()
            await ctx.route("https://fonts.googleapis.com/**", lambda r: r.fulfill(status=200, content_type="text/css", body=css))

            async def serve_font(route):
                pkg, name = route.request.url.split("/local/")[1].split("/", 1)
                f = fonts / pkg / "files" / name
                await route.fulfill(status=200, content_type="font/woff2", body=f.read_bytes()) if f.exists() else await route.abort()
            await ctx.route("https://fonts.gstatic.com/local/**", serve_font)
        page = await ctx.new_page()
        await page.goto(url + "#discover")
        await page.evaluate("() => localStorage.clear()")
        await page.goto(url + "#discover")
        await page.evaluate("() => document.fonts.ready")
        app = page.locator("#app")
        stage_last = lambda: page.locator("#stage > *").last  # noqa: E731

        # ---------- title ----------
        await page.evaluate("h => __fw.card(h)", f"""<h1>{LOGO}Meridian</h1><div class="tag">Every agent, governed and paid for in one place.</div>
          <p>A B2B agent marketplace, end to end: a buyer finds and buys an agent, IT governs it once, three agents run under policy, and the operator checks what gets used.</p>
          <div class="fine">Walkthrough of the clickable demo · no sound · all data is fictional</div>""")
        await wait(0.4)
        await rec.use(page)
        await wait(4.2)
        await page.evaluate("() => __fw.nocard()")
        await page.evaluate("() => __fw.cur(760, 300, true)")

        # ---------- Discover ----------
        await cap(page, "Marcus", "Search by the job, not the product",
                  "Marcus in procurement describes what his sales team needs. Listings are ranked by fit, then by weekly use in workspaces like his.")
        await click(page, page.locator("#q"), 0.3)
        await page.keyboard.type("research accounts before sales calls", delay=55)
        await wait(0.6)
        await show(page, app.locator(".intent"), "Matched by the job described", 2.6)
        await show(page, app.locator(".card").first, "Ranked first: GTM Orbit", 2.6)
        await nohl(page)
        await click(page, page.locator("#q"), 0.2)
        await page.keyboard.press("Control+A")
        await page.keyboard.press("Backspace")
        await wait(0.6)
        await cap(page, "Marcus", "Five working agents, one new",
                  "The featured listings are my own prototypes, and each one really runs. Fieldwise, for field-service repairs, is the newest. The other 15 are sample listings.")
        await show(page, app.locator(".sec").first, "Featured partner listings", 3.2)
        await show(page, app.locator('[data-open="fieldwise"]'), "New: Fieldwise", 3.0)
        await nohl(page)

        # ---------- Evaluate ----------
        await click(page, app.locator('[data-open="orbit"]'))
        await cap(page, "Marcus", "Know what it touches before you buy",
                  "Every listing shows which tools read and which write, and the review it passed: least-privilege scopes, task evals, latency and a prompt-injection suite.")
        await show(page, app.locator(".panel", has=page.get_by_role("heading", name="Tools it exposes")), "Reads vs. writes", 3.6)
        await show(page, app.locator(".panel", has=page.get_by_role("heading", name="Marketplace review")), "Checked before listing", 3.0)
        await nohl(page)

        # ---------- Buy ----------
        await click(page, page.locator("#cta"))
        await cap(page, "Marcus", "Buy on the commitment Northwind already has",
                  "Orbit Labs sent a private offer. It draws down Northwind's existing platform commitment: no new vendor, contract or invoice.")
        await show(page, app.locator('[data-plan="annual"]'), "Private offer for Northwind", 2.8)
        await show(page, app.locator("label", has=page.locator("#pay-commit")), "Draw down from commitment", 2.8)
        await nohl(page)
        await click(page, page.locator("#accept"), 1.2)

        # ---------- Deploy ----------
        await click(page, app.get_by_role("button", name="Next: deploy →"))
        await cap(page, "Priya", "IT approves once, for every surface",
                  "Priya chooses which groups and tools get Orbit. Marketing stays off, and logging to the CRM stays off until IT allows a write.")
        await show(page, app.locator(".panel", has=page.get_by_role("heading", name="Who can use it")), "Marketing stays off", 3.0)
        await show(page, app.locator(".panel", has=page.get_by_role("heading", name="Which tools")), "Writes off by default", 3.0)
        await show(page, app.locator(".panel", has=page.get_by_role("heading", name="Effective policy")), "One policy: chat, data cloud, Slack", 2.6)
        await nohl(page)
        await click(page, page.locator("#approve"), 1.4)

        # ---------- Use: Orbit ----------
        await click(page, app.get_by_role("button", name="Next: use it →"))
        await cap(page, "Jordan", "A cited brief, with every check shown",
                  "Jordan asks for a call brief. The trace shows the policy check, Orbit calling a data partner agent-to-agent, and a warning that the partner's data is 41 days old.")
        await click(page, app.locator('[data-ask="brief"]'), 1.0)
        await show(page, app.locator(".trace").last, "Policy, agent-to-agent call, freshness", 4.2, top=160)
        await show(page, app.locator(".msg.agent").last.locator(".cite"), "Every fact has a source", 2.8, top=300)
        await nohl(page)
        await click(page, app.locator('[data-surf="slack"]'), 0.6)
        await cap(page, "Jordan", "Same agent, same policy, in Slack",
                  "In the deal channel Orbit answers under the same identity, the same tool limits and the same meter. Nothing is set up twice.")
        await click(page, app.locator('[data-ask="signals"]'), 1.0)
        await show(page, stage_last(), "Answered in #deal-halcyon", 3.6, top=200)
        await nohl(page)

        # ---------- Use: Conviction ----------
        await click(page, app.locator('[data-agent="conviction"]'), 0.6)
        await click(page, app.locator('[data-surf="chat"]'), 0.6)
        await cap(page, "Avery", "Unknowns stay unknown",
                  "Avery's diligence memo cites every claim. Halden's headcount could not be confirmed, so the memo says so instead of guessing.")
        await click(page, app.locator('[data-ask="memo"]'), 1.0)
        await show(page, app.locator(".msg.agent").last, "Headcount: shown as unknown", 3.8, top=160)
        await nohl(page)
        await cap(page, "Avery", "Writes wait for the person who asked",
                  "Saving the memo to the deal room is a write, so it stops for Avery's approval. Approving it is recorded in the audit log.")
        await click(page, app.locator('[data-ask="export"]'), 1.0)
        await show(page, app.locator(".approve").last, "Waiting for Avery", 2.8, top=220)
        await nohl(page)
        await click(page, app.locator("[data-approve]").last, 1.4)

        # ---------- Use: Fieldwise ----------
        await click(page, app.locator('[data-agent="fieldwise"]'), 0.8)
        await cap(page, "Ana", "Fieldwise asks before it answers",
                  "A caller reports elevator fault D17. Two models share that code and need different fixes, so Fieldwise gives zero repair steps until the model is confirmed.")
        await click(page, app.locator('[data-ask="d17"]'), 1.0)
        await show(page, app.locator(".msg.agent").last, "Model unknown · 0 steps", 4.4, top=160)
        await nohl(page)
        await cap(page, "Ana", "Cited steps, and a bad claim rejected",
                  "With Model B, revision 2 confirmed, every step cites manual MB2. The validator removed “works every time” because nothing backs it.")
        await click(page, app.locator('[data-ask="guide"]'), 1.0)
        await show(page, app.locator(".trace").last, "Uncited claim rejected", 3.6, top=160)
        await show(page, app.locator(".msg.agent").last, "Manual MB2 rev 2, pages 14 and 15", 3.6, top=160)
        await nohl(page)
        await cap(page, "Ana", "The handoff to the technician waits for Ana",
                  "Assigning the approved, version-pinned procedure to Teo changes a service system, so it needs Ana's approval. Each run is metered to Northwind's account.")
        await click(page, app.locator('[data-ask="handoff"]'), 1.0)
        await show(page, app.locator(".approve").last, "Assign to Teo?", 2.6, top=220)
        await nohl(page)
        await click(page, app.locator("[data-approve]").last, 1.2)
        await show(page, app.locator(".meterbox"), "Metered, capped, billed once", 3.0, top=160)
        await nohl(page)

        # ---------- Operator ----------
        await click(page, page.locator('#rail [data-go="review"]'), 0.9)
        await cap(page, "Ops", "Every submission is checked first",
                  "Fieldwise v1.0 passes all six checks. Because it writes to a service system, it ships with that tool off and a named approver on every run.")
        await click(page, app.locator('tr[data-sel="q6"]'), 0.6)
        await show(page, app.locator(".grid2 > .panel").nth(1), "Fieldwise v1.0 · 6 of 6", 3.8, top=150)
        await nohl(page)
        await click(page, app.locator('[data-decide="Approved"]'), 1.0)
        await cap(page, "Ops", "And some are stopped",
                  "Inbox Autopilot followed 3 of 40 instructions planted in prospect emails, including one that forwarded a thread. It does not get listed.")
        await click(page, app.locator('tr[data-sel="q3"]'), 0.6)
        await show(page, app.locator(".grid2 > .panel").nth(1), "Fails the injection suite", 3.8, top=150)
        await nohl(page)
        await click(page, page.locator('#rail [data-go="health"]'), 0.9)
        await cap(page, "Ops", "The north star is use, not bookings",
                  "Bookings are up 31%, but only 54% of purchased agents are used weekly. Listings that are bought but not used get a fix plan with the partner.")
        await show(page, app.locator(".kpi").nth(1), "Purchase → weekly active", 3.4, top=150)
        await show(page, app.locator(".panel", has=page.get_by_role("heading", name="Bought but not used")), "Bought but not used", 3.6, top=150)
        await nohl(page)

        # ---------- close ----------
        await page.evaluate("() => __fw.nocap()")
        await page.evaluate("h => __fw.card(h)", f"""<h1>{LOGO}Meridian</h1><div class="tag">Every agent, governed and paid for in one place.</div>
          <p>Buy on the commitment you have. IT governs once. Every claim cited, every write approved, every call metered.</p>
          <div class="fine">Try it yourself below · code: github.com/hithakishore-all/Meridian</div>""")
        await wait(4.5)
        await rec.stop()
        await browser.close()
    rec.save()
    assert step["n"] == TOTAL, f"captions: {step['n']} (TOTAL says {TOTAL})"
    print(f"frames: {len(rec.frames)}  duration: {rec.acc:.1f}s  chapters: {len(rec.chapters)}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--url", default=LIVE)
    ap.add_argument("--fonts", default=None)
    a = ap.parse_args()
    out = Path(a.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    asyncio.run(main(out, a.url, Path(a.fonts) if a.fonts else None))
