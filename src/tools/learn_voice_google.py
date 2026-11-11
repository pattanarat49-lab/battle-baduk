# Makes the LEARN course voice files with Google Cloud Text-to-Speech (Thai AI voices).
#   GOOGLE_TTS_API_KEY=... python3 src/tools/learn_voice_google.py [voice]      (needs node; default voice th-TH-Chirp3-HD-Puck)
# Writes learn/voice/<key>.mp3 for every sentence in src/learn.js (same names the game looks up) and removes stale files.
# --force remakes files that already exist (use it when switching from the old offline voice).
import base64, json, os, subprocess, sys, urllib.request
key = os.environ["GOOGLE_TTS_API_KEY"]
args = [a for a in sys.argv[1:] if not a.startswith("--")]
voice = args[0] if args else "th-TH-Chirp3-HD-Puck"
force = "--force" in sys.argv
root = os.path.join(os.path.dirname(__file__), "..", "..")
out = os.path.join(root, "learn", "voice"); os.makedirs(out, exist_ok=True)
lines = json.loads(subprocess.check_output(["node", "-e",
  "const T=require(process.argv[1])._test;console.log(JSON.stringify(T.texts().map(t=>[T.vkey(t),t])))", os.path.join(root, "src", "learn.js")]))
keep = set()
for k, text in lines:
  keep.add(k + ".mp3"); dst = os.path.join(out, k + ".mp3")
  if os.path.exists(dst) and not force: continue
  body = {"input": {"text": text}, "voice": {"languageCode": "th-TH", "name": voice}, "audioConfig": {"audioEncoding": "MP3", "speakingRate": 0.95}}
  req = urllib.request.Request("https://texttospeech.googleapis.com/v1/text:synthesize?key=" + key, json.dumps(body).encode(), {"Content-Type": "application/json"})
  with urllib.request.urlopen(req) as r: open(dst, "wb").write(base64.b64decode(json.load(r)["audioContent"]))
  print(k, text)
for f in os.listdir(out):
  if f not in keep: os.remove(os.path.join(out, f)); print("removed", f)
print(len(lines), "lines,", sum(len(t) for _, t in lines), "characters")
