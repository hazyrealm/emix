"""Staging checks for Emix 1.12: profile styles and the changelog. Uses the
demo accounts from demo_seed.py. Never run against production."""
import json, sys, urllib.request, urllib.error

BASE = "https://staging.getemix.com"
creds = json.load(open("/srv/emix/staging/demo-users.json"))


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method, data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


fails = 0
def check(label, cond, detail=""):
    global fails
    print(("PASS " if cond else "FAIL ") + label + (f"  {detail}" if detail and not cond else ""))
    fails += 0 if cond else 1


tok = {}
for name in ("maya", "leo"):
    s, r = call("POST", "/api/auth/login", {"username": name, "password": creds[name]})
    tok[name] = r["token"]

style = {
    "name": {"effect": "animated", "colors": ["#ff3ea5", "#9333ea", "#22a0ff"], "glow": True},
    "nameplate": "neon-pulse", "decoration": "neon-ring", "effect": "sparkles",
    "background": {"preset": "nebula"}, "glass": True, "pronouns": "she/her",
    "links": [{"label": "Portfolio", "url": "maya.example.com"}, {"label": "x", "url": "javascript:alert(1)"}],
    "css": "body{display:none}",
}
s, me = call("PATCH", "/api/users/@me", {"profileStyle": style}, tok["maya"])
ps = (me or {}).get("profileStyle") or {}
check("profile style saves", s == 200, f"{s} {me}")
check("unknown fields and unsafe links are dropped", "css" not in ps and ps.get("links") == [{"label": "Portfolio", "url": "https://maya.example.com/"}], json.dumps(ps))
s, r = call("PATCH", "/api/users/@me", {"profileStyle": {"background": {"image": "../../etc/passwd"}}}, tok["maya"])
check("path-like background image is rejected or dropped", s in (200, 400) and not ((r or {}).get("profileStyle") or {}).get("background"), f"{s} {r}")
s, r = call("PATCH", "/api/users/@me", {"profileStyle": style}, tok["maya"])  # restore the demo look

s, friends = call("GET", "/api/social/friends", None, tok["leo"])
lst = friends if isinstance(friends, list) else (friends or {}).get("friends", [])
maya = next((f for f in lst if f.get("username") == "maya"), None)
check("friends see the style", bool(maya and (maya.get("profileStyle") or {}).get("nameplate") == "neon-pulse"), json.dumps(maya)[:200])

s, cl = call("GET", "/api/changelog")
rels = (cl or {}).get("releases", [])
check("changelog is public and lists 1.12.0 first", s == 200 and rels and rels[0]["version"] == "1.12.0", f"{s} {str(cl)[:200]}")
check("no drafts are served", all(r["status"] == "published" for r in rels))
s, st = call("GET", "/api/changelog/state", None, tok["leo"])
check("state is per account", s == 200 and "acknowledged" in st, f"{s} {st}")
s, bad = call("POST", "/api/changelog/ack", {"version": "99.0.0"}, tok["leo"])
check("unannounced version refused", s == 400, f"{s}")
s, unauth = call("GET", "/api/changelog/state")
check("state needs sign-in", s == 401, f"{s}")
print("failures:", fails)
sys.exit(1 if fails else 0)
