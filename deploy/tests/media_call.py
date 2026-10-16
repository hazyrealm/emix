"""Two Google Chrome participants in one Emix DM call on staging (run under
Xvfb by run-staging-checks.sh). Each publishes a fake webcam + microphone and
a real 1920x1080 screen capture, then reports what it sends (with Chrome's
quality-limitation reason) and what it actually receives from the other side.
Requires real Chrome: bundled Playwright Chromium has no H.264 encoder."""
import asyncio, json, sys
from playwright.async_api import async_playwright

state = json.load(open(sys.argv[1]))
LK = open(sys.argv[2]).read()
URL = "wss://staging.getemix.com/livekit"
SECONDS = int(sys.argv[3]) if len(sys.argv) > 3 else 25

JS = r"""
async ({url, token, seconds}) => {
  const L = window.LivekitClient;
  const room = new L.Room({ adaptiveStream: false, dynacast: true,
    publishDefaults: { videoCodec: 'h264', simulcast: true } });
  await room.connect(url, token);
  await room.localParticipant.setMicrophoneEnabled(true);
  await room.localParticipant.setCameraEnabled(true, { resolution: L.VideoPresets.h720.resolution });

  // 1080p "screen": a moving canvas, published as a screen share like Emix's VP9 path.
  const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
  const g = c.getContext('2d'); let t = 0;
  setInterval(() => { t++; g.fillStyle = `hsl(${t % 360},70%,40%)`; g.fillRect(0,0,1920,1080);
    g.fillStyle = '#fff'; g.font = '64px sans-serif'; for (let i=0;i<12;i++) g.fillText('Emix screen share ' + t, (t*7+i*160)%1920, 80+i*85); }, 33);
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh'; document.body.appendChild(c);
  const ds = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1920, height: 1080, frameRate: 30 }, audio: false });
  const track = ds.getVideoTracks()[0]; track.contentHint = 'motion';
  await room.localParticipant.publishTrack(track, { source: L.Track.Source.ScreenShare,
    videoCodec: 'vp9', simulcast: false, videoEncoding: { maxBitrate: 6_000_000, maxFramerate: 30 } });

  // Wait for the other participant's tracks, then let it run.
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const rp = [...room.remoteParticipants.values()][0];
    if (rp && rp.trackPublications.size >= 3 && [...rp.trackPublications.values()].every(p => p.track)) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const snap = async () => {
    const out = {};
    const rp = [...room.remoteParticipants.values()][0];
    if (!rp) return out;
    for (const pub of rp.trackPublications.values()) {
      if (!pub.track) { out[pub.source] = 'not subscribed'; continue; }
      const rep = await pub.track.getRTCStatsReport();
      const o = {};
      rep?.forEach(s => {
        if (s.type === 'inbound-rtp') Object.assign(o, { bytes: s.bytesReceived, w: s.frameWidth, h: s.frameHeight,
          fps: s.framesPerSecond, lost: s.packetsLost, pkts: s.packetsReceived, jitterMs: s.jitter != null ? +(s.jitter*1000).toFixed(1) : undefined,
          codecId: s.codecId, frozen: s.freezeCount });
        if (s.type === 'codec' ) o['codec:' + s.id] = s.mimeType;
        if (s.type === 'candidate-pair' && s.nominated && s.state === 'succeeded') o.rttMs = s.currentRoundTripTime != null ? +(s.currentRoundTripTime*1000).toFixed(1) : undefined;
        if (s.type === 'local-candidate') o['lc:' + s.id] = s.candidateType + '/' + s.protocol;
      });
      if (o.codecId) o.codec = o['codec:' + o.codecId];
      for (const k of Object.keys(o)) if (k.startsWith('codec:') || k.startsWith('lc:') || k === 'codecId') delete o[k];
      out[pub.source] = o;
    }
    return out;
  };
  const a = await snap();
  await new Promise(r => setTimeout(r, seconds * 1000));
  const b = await snap();
  const res = { state: room.state, received: {}, me: room.localParticipant.identity, room: room.name,
    local: [...room.localParticipant.trackPublications.values()].map(p => p.source),
    remotes: [...room.remoteParticipants.values()].map(rp => ({ id: rp.identity,
      pubs: [...rp.trackPublications.values()].map(p => p.source + ':' + (p.isSubscribed ? 'sub' : 'unsub')) })) };
  for (const k of Object.keys(b)) {
    const x = a[k] || {}, y = b[k];
    if (typeof y !== 'object') { res.received[k] = y; continue; }
    res.received[k] = { ...y, kbps: Math.round(((y.bytes - (x.bytes||0)) * 8) / seconds / 1000) };
    delete res.received[k].bytes;
  }
  // Outbound: what each encoder actually produced and what limited it.
  res.sent = {};
  for (const pub of room.localParticipant.trackPublications.values()) {
    if (pub.kind !== 'video' || !pub.track) continue;
    const rep = await pub.track.getRTCStatsReport();
    const layers = [];
    rep?.forEach(s => { if (s.type === 'outbound-rtp') layers.push({ rid: s.rid, w: s.frameWidth, h: s.frameHeight,
      fps: s.framesPerSecond, limit: s.qualityLimitationReason, kbps: s.targetBitrate ? Math.round(s.targetBitrate/1000) : undefined, enc: s.encoderImplementation }); });
    res.sent[pub.source] = layers;
  }
  // Let the other side finish measuring before leaving.
  await new Promise(r => setTimeout(r, 8000));
  await room.disconnect();
  return res;
}
"""

async def participant(browser, name, token):
    ctx = await browser.new_context(bypass_csp=True, permissions=["camera", "microphone"])
    page = await ctx.new_page()
    await page.goto("https://getemix.com/")
    await page.add_script_tag(content=LK)
    return name, await page.evaluate(JS, {"url": URL, "token": token, "seconds": SECONDS})

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=False, args=[
            "--auto-select-desktop-capture-source=Entire screen", "--enable-usermedia-screen-capturing", "--window-size=1920,1080",
            "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream",
            "--autoplay-policy=no-user-gesture-required", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-backgrounding-occluded-windows"])
        results = await asyncio.gather(*[participant(browser, n, state["lk"][n]) for n in ("stage_alice", "stage_bob")])
        for name, r in results:
            print(f"== {name} (room {r['state']} {r['room']}, me={r['me']}) local={r['local']} remotes={r['remotes']}")
            for src, v in r.get("sent", {}).items():
                print(f"   SENT {src:<9} {json.dumps(v)}")
            for src, v in r["received"].items():
                print(f"   RECV {src:<9} {json.dumps(v)}")
        await browser.close()

asyncio.run(main())
