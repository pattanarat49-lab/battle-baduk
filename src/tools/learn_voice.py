# Makes the spoken lines of the LEARN course: learn/voice/<key>.mp3 for every sentence in src/learn.js.
# Voice: Meta MMS Thai TTS (VITS) through sherpa-onnx, offline.
#   pip install sherpa-onnx soundfile
#   curl -LO https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/vits-mms-tha.tar.bz2 && tar xjf vits-mms-tha.tar.bz2
#   python3 src/tools/learn_voice.py path/to/vits-mms-tha      (needs node and ffmpeg; keeps files that already exist)
import json, os, subprocess, sys, tempfile
import sherpa_onnx, soundfile as sf
model = sys.argv[1]
root = os.path.join(os.path.dirname(__file__), "..", "..")
out = os.path.join(root, "learn", "voice")
os.makedirs(out, exist_ok=True)
lines = json.loads(subprocess.check_output(["node", "-e",
  "const T=require(process.argv[1])._test;console.log(JSON.stringify(T.texts().map(t=>[T.vkey(t),t])))", os.path.join(root, "src", "learn.js")]))
DIG = "ศูนย์ หนึ่ง สอง สาม สี่ ห้า หก เจ็ด แปด เก้า".split()
spoken = lambda t: "".join(DIG[int(c)] if c.isdigit() else c for c in t)
tts = sherpa_onnx.OfflineTts(sherpa_onnx.OfflineTtsConfig(model=sherpa_onnx.OfflineTtsModelConfig(
  vits=sherpa_onnx.OfflineTtsVitsModelConfig(model=os.path.join(model, "model.onnx"), tokens=os.path.join(model, "tokens.txt")), num_threads=4)))
keep = set()
for key, text in lines:
  keep.add(key + ".mp3"); dst = os.path.join(out, key + ".mp3")
  if os.path.exists(dst): continue
  a = tts.generate(spoken(text), sid=0, speed=0.92)
  with tempfile.NamedTemporaryFile(suffix=".wav") as w:
    sf.write(w.name, a.samples, a.sample_rate)
    subprocess.check_call(["ffmpeg", "-loglevel", "error", "-y", "-i", w.name, "-af", "silenceremove=start_periods=1:start_threshold=-45dB,volume=1.6", "-ac", "1", "-b:a", "32k", dst])
  print(key, text)
for f in os.listdir(out):
  if f not in keep: os.remove(os.path.join(out, f)); print("removed", f)
print(len(lines), "lines")
