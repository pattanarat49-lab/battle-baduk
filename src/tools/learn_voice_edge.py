# Free alternative: makes the LEARN voice files with Microsoft Edge's online Thai neural voices (no account, no key).
# Run it on a normal computer (the cloud container can't reach Microsoft's speech service):
#   pip install edge-tts
#   python3 src/tools/learn_voice_edge.py [--force] [voice]      (needs node; default voice th-TH-NiwatNeural, female: th-TH-PremwadeeNeural)
import asyncio, json, os, subprocess, sys
import edge_tts
args = [a for a in sys.argv[1:] if not a.startswith("--")]
voice = args[0] if args else "th-TH-NiwatNeural"
force = "--force" in sys.argv
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
out = os.path.join(root, "learn", "voice"); os.makedirs(out, exist_ok=True)
lines = json.loads(subprocess.check_output(["node", "-e",
  "const T=require(process.argv[1])._test;console.log(JSON.stringify(T.texts().map(t=>[T.vkey(t),t])))", os.path.join(root, "src", "learn.js")]))
async def main():
  keep = set()
  for k, text in lines:
    keep.add(k + ".mp3"); dst = os.path.join(out, k + ".mp3")
    if os.path.exists(dst) and not force: continue
    # a little higher and brighter: Hikaru is a boy
    await edge_tts.Communicate(text, voice, rate="-5%", pitch="+20Hz").save(dst)
    print(k, text)
  for f in os.listdir(out):
    if f not in keep: os.remove(os.path.join(out, f)); print("removed", f)
  print(len(lines), "lines")
asyncio.run(main())
