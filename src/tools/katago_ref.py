"""Ask a real KataGo (GTP, kata-raw-nn) for raw network outputs on a few fixed positions, to check the browser port.
Usage: python3 katago_ref.py <katago binary> <model.bin.gz> <gtp.cfg> [human-model.bin.gz] > ref.json
With a human model, the HumanSL outputs (kata-raw-human-nn, profile from the config) are recorded instead."""
import json, subprocess, sys

POSITIONS = [[], ["D16"], ["D16", "Q4"], ["D16", "Q4", "C3", "R16", "E4", "D5", "K10"],
             ["Q16", "D4", "Q3", "D16", "R6", "C14", "F17", "O17", "P17", "O16", "P15", "N15"]]

def main(exe, model, cfg, human=None):
    args = [exe, "gtp", "-model", model, "-config", cfg] + (["-human-model", human] if human else [])
    p = subprocess.Popen(args, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    def cmd(c):
        p.stdin.write(c + "\n"); p.stdin.flush(); out = []
        while True:
            line = p.stdout.readline()
            if line.strip() == "" and out:
                break
            if line.strip():
                out.append(line.rstrip())
        return "\n".join(out)
    cmd("boardsize 19"); cmd("kata-set-rules chinese"); cmd("komi 7.5")
    res = []
    for moves in POSITIONS:
        cmd("clear_board")
        for i, m in enumerate(moves):
            cmd("play %s %s" % ("B" if i % 2 == 0 else "W", m))
        raw = cmd("kata-raw-human-nn 0" if human else "kata-raw-nn 0")
        res.append({"moves": moves, "raw": raw})
    cmd("quit")
    print(json.dumps(res))

if __name__ == "__main__":
    main(*sys.argv[1:5])
