"""Staging verification: registration gate, logins, DM messaging both ways,
LiveKit token issuance. Test accounts are created once (via an admin invite)
and their passwords kept root-only in /srv/emix/staging/test-users.json.
Prints results, never secrets. Writes tokens for media_call.py to argv[1]."""
import json, os, re, secrets, sys, urllib.request, urllib.error

BASE = "https://staging.getemix.com"
USERS_FILE = "/srv/emix/staging/test-users.json"
OUT = sys.argv[1] if len(sys.argv) > 1 else "/tmp/emix-media-state.json"


def call(method, path, body=None, token=None):
    req = urllib.request.Request(BASE + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    req.add_header("Content-Type", "application/json")
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"null")


def check(label, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + label + (f"  [{detail}]" if detail and not cond else ""))
    if not cond:
        sys.exit(1)


s, r = call("POST", "/api/auth/register", {"username": "nobody_x", "password": "Pw-" + secrets.token_hex(8)})
check("registration without invite is refused", s == 403, f"{s} {r}")

if not os.path.exists(USERS_FILE):
    # First run only: needs the original admin credential file.
    cred = open("/root/emix-admin-staging.txt").read()
    admin_pw = re.search(r"^Password: (.+)$", cred, re.M).group(1)
    s, r = call("POST", "/api/auth/login", {"username": "hero", "password": admin_pw})
    check("admin login", s == 200 and r.get("token"), f"{s}")
    s, r = call("POST", "/api/admin/invites", {"name": "staging-tests", "maxUses": 2, "expiresAt": None}, r["token"])
    check("admin creates invite", s in (200, 201), f"{s} {r}")
    inv = r.get("invite", r); tok = inv.get("token") or inv.get("code")
    creds = {}
    for name in ("stage_alice", "stage_bob"):
        pw = "Pw-" + secrets.token_hex(12)
        s, r = call("POST", "/api/auth/register", {"username": name, "password": pw, "displayName": name, "inviteToken": tok})
        check(f"register {name} with invite", s in (200, 201), f"{s} {r}")
        creds[name] = pw
    fd = os.open(USERS_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    os.write(fd, json.dumps(creds).encode()); os.close(fd)

creds = json.load(open(USERS_FILE))
users = {}
for name, pw in creds.items():
    s, r = call("POST", "/api/auth/login", {"username": name, "password": pw})
    check(f"login {name}", s == 200 and r.get("token"), f"{s} {r}")
    check(f"{name} is not admin", not r["user"].get("isAdmin"))
    users[name] = {"token": r["token"], "id": r["user"]["id"]}

a, b = users["stage_alice"], users["stage_bob"]
s, r = call("POST", "/api/dm", {"userId": b["id"]}, a["token"])
check("alice opens DM with bob", s in (200, 201), f"{s} {r}")
dm_id = r.get("id") or r.get("channel", {}).get("id")

msg = "hello from alice " + secrets.token_hex(4)
s, r = call("POST", f"/api/dm/{dm_id}/messages", {"content": msg}, a["token"])
check("alice sends DM message", s in (200, 201), f"{s} {r}")

s, r = call("GET", f"/api/dm/{dm_id}/messages", None, b["token"])
items = r if isinstance(r, list) else (r.get("messages") or [])
check("bob receives the message", any(m.get("content") == msg for m in items), f"{s} {json.dumps(r)[:300]}")

s, r = call("POST", f"/api/dm/{dm_id}/messages", {"content": "hi alice"}, b["token"])
check("bob replies", s in (200, 201), f"{s} {r}")

for name in ("stage_alice", "stage_bob"):
    s, r = call("POST", "/api/livekit/token", {"dmChannelId": dm_id}, users[name]["token"])
    check(f"LiveKit token for {name} in DM call", s == 200 and (r.get("token")), f"{s} {json.dumps(r)[:300]}")
    users[name]["lk"] = r["token"]

fd = os.open(OUT, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
os.write(fd, json.dumps({"lk": {n: u["lk"] for n, u in users.items()}}).encode()); os.close(fd)
print("ALL API CHECKS PASSED")
