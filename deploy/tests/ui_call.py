"""Drive the real Emix UI on staging: Alice starts a video call from the DM,
Bob accepts and turns his camera on, optionally both share their screens,
then both report what their peer connections actually send and receive.

Camera presets are set through the app's own persisted voice settings.
Runs under Xvfb in real Google Chrome (H.264 encoder present).
  usage: ui_call.py users.json <height> <fps> <quality> <seconds> [share]
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

creds = json.load(open(sys.argv[1]))
HEIGHT, FPS, QUALITY, SECONDS = int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], int(sys.argv[5])
SHARE = "share" in sys.argv[6:]
DPR = 2 if "hidpi" in sys.argv[6:] else 1
SHARE_PRESET = next((a.split("=", 1)[1] for a in sys.argv[6:] if a.startswith("preset=")), None)
VIEWPORT = {"width": 2560, "height": 1600} if "large" in sys.argv[6:] else {"width": 1600, "height": 1000}
BASE = "https://staging.getemix.com"

INIT = """
(() => {
  window.__pcs = [];
  const Orig = window.RTCPeerConnection;
  window.RTCPeerConnection = function (...a) { const pc = new Orig(...a); window.__pcs.push(pc); return pc; };
  window.RTCPeerConnection.prototype = Orig.prototype;
  Object.setPrototypeOf(window.RTCPeerConnection, Orig);
  try {
    const key = 'backspace-voice-settings';
    const cur = JSON.parse(localStorage.getItem(key) || '{"state":{},"version":14}');
    cur.state = Object.assign({}, cur.state, { cameraConfig: %s });
    localStorage.setItem(key, JSON.stringify(cur));
    localStorage.setItem('emix_welcome_seen:' + '*', '1');
  } catch (e) {}
})();
""" % json.dumps({"height": HEIGHT, "fps": FPS, "quality": QUALITY})

STATS = """
async () => {
  const out = { send: [], recv: [] };
  for (const pc of window.__pcs) {
    if (pc.connectionState === 'closed') continue;
    const rep = await pc.getStats();
    rep.forEach(s => {
      if (s.type === 'outbound-rtp' && s.kind === 'video') out.send.push({ id: s.id, rid: s.rid || '-', w: s.frameWidth, h: s.frameHeight, fps: s.framesPerSecond, bytes: s.bytesSent, tgt: s.targetBitrate, enc: s.encoderImplementation, hw: s.powerEfficientEncoder, limit: s.qualityLimitationReason, active: s.active });
      if (s.type === 'inbound-rtp' && s.kind === 'video') out.recv.push({ id: s.id, w: s.frameWidth, h: s.frameHeight, fps: s.framesPerSecond, bytes: s.bytesReceived, lost: s.packetsLost, dec: s.decoderImplementation, hw: s.powerEfficientDecoder, freezes: s.freezeCount });
      if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') out.rtt = s.currentRoundTripTime;
      if (s.type === 'media-source' && s.kind === 'video') (out.src = out.src || []).push({ w: s.width, h: s.height, fps: s.framesPerSecond });
    });
  }
  return out;
}
"""

async def login(ctx, user):
    page = await ctx.new_page()
    await page.goto(BASE + "/login", wait_until="networkidle")
    await page.fill("#login-username", user); await page.fill("#login-password", creds[user])
    await page.click("button[type=submit]"); await page.wait_for_url("**/channels/**", timeout=20000)
    await page.wait_for_timeout(1500)
    gs = page.get_by_role("button", name="Get Started")
    if await gs.count(): await gs.click()
    return page

async def share(page, preset):
    """Open the share setup, pick a preset, choose the (auto-selected) screen, start."""
    await page.locator('[title="Share Screen"]').first.click()
    await page.wait_for_timeout(1500)
    if preset:
        await page.get_by_role("button", name=preset, exact=True).first.click()
    await page.get_by_role("button", name="Choose", exact=True).first.click()
    await page.wait_for_timeout(3000)
    await page.get_by_role("button", name="Start stream", exact=True).first.click()
    await page.wait_for_timeout(2000)
    return True

def summarize(label, a, b, secs):
    print(f"== {label}")
    prev = {x["id"]: x for x in a["send"] + a["recv"]}
    for x in b["send"]:
        p = prev.get(x["id"], {}); kbps = round(((x["bytes"] or 0) - (p.get("bytes") or 0)) * 8 / secs / 1000)
        if x["w"]:
            print(f"   SENT rid={x['rid']:<2} {x['w']}x{x['h']} @{x['fps']} {kbps} kbps (target {round((x['tgt'] or 0)/1000)}k) limit={x['limit']} enc={x['enc']} hwEnc={x['hw']}")
    for x in b["recv"]:
        p = prev.get(x["id"], {}); kbps = round(((x["bytes"] or 0) - (p.get("bytes") or 0)) * 8 / secs / 1000)
        if x["w"]:
            print(f"   RECV {x['w']}x{x['h']} @{x['fps']} {kbps} kbps lost={x['lost']} freezes={x['freezes']} dec={x['dec']} hwDec={x['hw']}")
    for x in b.get("src", []): print(f"   CAPTURE {x['w']}x{x['h']} @{x['fps']}")
    if b.get("rtt") is not None: print(f"   RTT {round(b['rtt']*1000)} ms")

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False, args=[
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--auto-select-desktop-capture-source=Entire screen", "--autoplay-policy=no-user-gesture-required",
            "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])
        ctxs = []
        for _ in range(2):
            # DPR 2 = a 200%-scaled laptop display: a ~750 px tile has ~1500 physical px.
            c = await browser.new_context(viewport=VIEWPORT, device_scale_factor=DPR, permissions=["camera", "microphone"])
            await c.add_init_script(INIT); ctxs.append(c)
        alice = await login(ctxs[0], "stage_alice")
        bob = await login(ctxs[1], "stage_bob")
        await alice.get_by_text("stage_bob").first.click(); await alice.wait_for_timeout(1500)
        await alice.locator('[title="Start Video Call"]').first.click()
        try:
            await bob.locator('[title="Accept"]').first.wait_for(timeout=20000)
        except Exception:
            await alice.screenshot(path="/out/fail-alice.png"); await bob.screenshot(path="/out/fail-bob.png"); raise
        await bob.locator('[title="Accept"]').first.click()
        await bob.wait_for_timeout(4000)
        await bob.locator('[title="Turn On Camera"]').first.click()
        if SHARE:
            print("alice share:", await share(alice, SHARE_PRESET)); print("bob share:", await share(bob, SHARE_PRESET))
        await alice.wait_for_timeout(SECONDS * 1000)
        a1, b1 = await alice.evaluate(STATS), await bob.evaluate(STATS)
        await alice.wait_for_timeout(10_000)
        a2, b2 = await alice.evaluate(STATS), await bob.evaluate(STATS)
        summarize("alice", a1, a2, 10); summarize("bob", b1, b2, 10)
        await alice.screenshot(path="/out/call-alice.png"); await bob.screenshot(path="/out/call-bob.png")
        await browser.close()

asyncio.run(main())
