"""Game records for the KIFU screen (src/kifu.js): one index of players, events and games, and the moves in small files.
Sources (neither is stored in the repository, only what this script writes under kifu/):
  - Andries Brouwer's public collection https://homepages.cwi.nl/~aeb/go/games/games.tgz (about 98,000 games from the
    17th century to this year, with event, round, date and ranks),
  - github.com/yenw/computer-go-dataset Professional/pro1940-1999.txt and pro2000+.txt (73,500 games, no event names).
A game found in both (same first 70 moves, in any of the 8 orientations) is kept once, with Brouwer's details; the two
names it carries tell which spellings are the same person ("Lee Sedol" = "Yi Se-tol").
Output: kifu/index.json (players, events, counts), kifu/meta-N.json (one row of columns per game, oldest first),
kifu/g/NNNN.json (moves and details of SHARD games each).
usage: python3 -I kifu_build.py <brouwer games dir> <pro1940-1999.txt> <pro2000+.txt> <out dir>"""
import collections, difflib, json, os, re, sys

SHARD = 500
PARTS = 6

# ---------- reading SGF (first branch only) ----------
def parse(s):
    i = s.find("(;")
    if i < 0:
        return None
    i += 1; n = len(s); root = {}; moves = []; node = -1
    while i < n:
        c = s[i]
        if c == ";":
            node += 1; i += 1
        elif c == "(":
            i += 1
        elif c == ")":
            break
        elif c.isupper():
            j = i
            while j < n and s[j].isalpha(): j += 1
            key = "".join(ch for ch in s[i:j] if ch.isupper()); vals = []
            while True:
                while j < n and s[j] in " \t\r\n": j += 1
                if j < n and s[j] == "[":
                    k = j + 1; buf = []
                    while k < n and s[k] != "]":
                        if s[k] == "\\" and k + 1 < n: k += 1
                        buf.append(s[k]); k += 1
                    vals.append("".join(buf)); j = k + 1
                else:
                    break
            i = j
            if key in ("B", "W"):
                v = vals[0].strip().lower() if vals else ""
                moves.append((key, v if re.fullmatch(r"[a-s]{2}", v) else ""))
            elif key in ("AB", "AW"):
                if not moves: root.setdefault(key, []).extend(vals)
            elif node <= 0:
                root.setdefault(key, vals[0] if vals else "")
        else:
            i += 1
    return root, moves


def T(k, s):
    x, y = ord(s[0]) - 97, ord(s[1]) - 97
    if k & 1: x = 18 - x
    if k & 2: y = 18 - y
    if k & 4: x, y = y, x
    return chr(97 + x) + chr(97 + y)


def gkey(m):
    mv = [s for c, s in m[:70] if s]
    return min("".join(T(k, s) for s in mv) for k in range(8))


# ---------- names ----------
def clean(n):
    n = re.sub(r"\s+", " ", n or "").strip()
    if is_group(n): return n
    n = re.sub(r",.*$", "", n)
    n = re.sub(r"\s+\d{1,2}[pdk]$", "", n)
    n = re.sub(r"\?$", "", n)
    return n.strip()


def is_group(n):
    return bool(re.search(r"&| and |\bteam\b|\betc\b|;", n)) or n.count(",") > 1 or len(n) > 40


# one person, several names in the records (the first is shown)
ALIASES = [
    ["Honinbo Shusai", "Shusai", "Shusai Meijin", "Honinbo Shusai Meijin", "Shusai Honinbo", "Tamura Hoju", "Tamura Hoju (later Shusai)", "Tamura Hoju (Tamura Yasuhisa)", "Tamura Yasuhisa"],
    ["Honinbo Shusaku", "Yasuda Shusaku", "Kuwahara Shusaku", "Kuwabara Shusaku", "Shusaku"],
    ["Honinbo Jowa", "Kadono Jowa", "Jowa"],
    ["Honinbo Shuwa", "Tsuchiya Shuwa", "Shuwa"],
    ["Honinbo Shuho", "Murase Shuho", "Shuho"],
    ["Honinbo Shuei", "Hayashi Shuei", "Tsuchiya Shuei", "Shuei"],
    ["Honinbo Dosaku", "Dosaku"],
    ["Fujisawa Shuko", "Fujisawa Hideyuki", "Fujisawa Tamotsu (later Hideyuki or Shuko)"],
    ["Fujisawa Hosai", "Fujisawa Kuranosuke"],
    ["Takagawa Kaku", "Takagawa Shukaku"],
    ["AlphaGo", "Alphago", "AlphaGo Lee", "AlphaGo Master", "Master", "Magist", "AlphaGo Zero"],
    ["Shin Jinseo", "Shin Jin Seo", "Sin Chin-seo"],
    ["Go Seigen", "Wu Qingyuan"],
    ["Vorawat Charoensitthisathien", "Charoensitthisathien Vorawat"],
]
# shown names for well-known players, with the Thai name (found by the search too)
FAMOUS = {
    "Honinbo Dosaku": "โฮนินโบ โดซากุ", "Honinbo Jowa": "โฮนินโบ โจวะ", "Honinbo Shusaku": "โฮนินโบ ชูซากุ", "Honinbo Shuwa": "โฮนินโบ ชูวะ",
    "Honinbo Shuho": "โฮนินโบ ชูโฮ", "Honinbo Shuei": "โฮนินโบ ชูเอ", "Honinbo Shusai": "โฮนินโบ ชูไซ", "Inoue Gennan Inseki": "อิโนอุเอะ เก็นนัน อินเซกิ",
    "Go Seigen": "โก เซเก็น (อู๋ ชิงหยวน)", "Kitani Minoru": "คิทานิ มิโนรุ", "Sakata Eio": "ซากาตะ เอโอะ", "Takagawa Kaku": "ทากากาวะ คาคุ",
    "Fujisawa Shuko": "ฟูจิซาวะ ชูโก", "Fujisawa Hosai": "ฟูจิซาวะ โฮไซ", "Hashimoto Utaro": "ฮาชิโมโตะ อุทาโร", "Iwamoto Kaoru": "อิวาโมโตะ คาโอรุ",
    "Segoe Kensaku": "เซโกเอะ เค็นซากุ", "Rin Kaiho": "ริน ไคโฮ", "Otake Hideo": "โอตาเกะ ฮิเดโอะ", "Ishida Yoshio": "อิชิดะ โยชิโอะ",
    "Kato Masao": "คาโต้ มาซาโอะ", "Takemiya Masaki": "ทาเกมิยะ มาซากิ", "Cho Chikun": "โช ชิคุน", "Kobayashi Koichi": "โคบายาชิ โคอิจิ",
    "Kobayashi Satoru": "โคบายาชิ ซาโตรุ", "Yoda Norimoto": "โยดะ โนริโมโตะ", "O Rissei": "โอ ริสเซ", "O Meien": "โอ เมเอ็น", "Cho U": "โช อู",
    "Yamashita Keigo": "ยามาชิตะ เคโกะ", "Hane Naoki": "ฮาเนะ นาโอกิ", "Takao Shinji": "ทากาโอะ ชินจิ", "Kono Rin": "โคโนะ ริน", "Yuki Satoshi": "ยูกิ ซาโตชิ",
    "Iyama Yuta": "อิยามะ ยูตะ", "Ichiriki Ryo": "อิจิริกิ เรียว", "Shibano Toramaru": "ชิบาโนะ โทรามารุ", "Kyo Kagen": "เคียว คาเง็น",
    "Yu Zhengqi": "หยู เจิ้งฉี", "Murakawa Daisuke": "มูราคาวะ ไดสุเกะ", "Fujisawa Rina": "ฟูจิซาวะ รินะ", "Xie Yimin": "เซี่ย อีหมิน",
    "Ueno Asami": "อุเอโนะ อาซามิ", "Nakamura Sumire": "นากามูระ สุมิเระ", "Michael Redmond": "ไมเคิล เรดมอนด์",
    "Cho Hunhyun": "โช ฮุนฮยอน", "Lee Changho": "อี ชางโฮ", "Seo Bongsoo": "ซอ บงซู", "Yoo Changhyuk": "ยู ชางฮยอก", "Lee Sedol": "อี เซดล",
    "Park Yeonghun": "พัค ยองฮุน", "Choi Cheolhan": "ชเว ชอลฮัน", "Park Junghwan": "พัค จองฮวาน", "Kim Jiseok": "คิม จีซอก", "Kang Dongyun": "คัง ดงยุน",
    "Shin Jinseo": "ชิน จินซอ", "Shin Minjun": "ชิน มินจุน", "Byun Sangil": "บยอน ซังอิล", "Choi Jeong": "ชเว จอง", "Won Sungjin": "วอน ซองจิน",
    "Nie Weiping": "เนี่ย เว่ยผิง", "Ma Xiaochun": "หม่า เสี่ยวชุน", "Chang Hao": "ฉาง ฮ่าว", "Gu Li": "กู่ ลี่", "Kong Jie": "ข่ง เจี๋ย",
    "Chen Yaoye": "เฉิน เย่าเย่", "Ke Jie": "เคอ เจี๋ย", "Shi Yue": "สือ เยว่", "Mi Yuting": "หมี่ อวี้ถิง", "Tang Weixing": "ถัง เหวยซิง",
    "Fan Tingyu": "ฟ่าน ถิงอวี้", "Tuo Jiaxi": "ถัว เจียซี", "Zhou Ruiyang": "โจว รุ่ยหยาง", "Yang Dingxin": "หยาง ติ่งซิน", "Gu Zihao": "กู่ จื่อเฮ่า",
    "Ding Hao": "ติง ฮ่าว", "Li Xuanhao": "หลี่ เซวียนเฮ่า", "Rui Naiwei": "รุ่ย ไหน่เหว่ย", "Chen Zude": "เฉิน จู่เต๋อ", "Yu Bin": "อวี๋ ปิน",
    "Huang Longshi": "หวง หลงซื่อ", "Fan Xiping": "ฟ่าน ซีผิง", "Shi Xiangxia": "ซือ เซียงเซี่ย", "AlphaGo": "อัลฟ่าโกะ",
}
COUNTRY = {  # where the name alone would say otherwise
    "AlphaGo": "AI", "DeepZenGo": "AI", "Zen": "AI", "FineArt": "AI", "Golaxy": "AI", "Leela Zero": "AI", "KataGo": "AI", "Crazy Stone": "AI",
    "Michael Redmond": "JP", "Go Seigen": "JP", "Rin Kaiho": "JP", "Cho Chikun": "JP", "Hans Pietsch": "JP", "Catalin Taranu": "JP", "Antti Törmänen": "JP",
    "Zhou Junxun": "TW", "Lin Zhihan": "TW", "Chen Shiyuan": "TW", "Xu Haohong": "TW", "Wang Yuanjun": "TW", "Lin Junyan": "TW", "Xiao Zhenghao": "TW",
    "Hei Jiajia": "TW", "Lai Junfu": "TW", "Lin Lixiang": "TW", "Jian Jingting": "TW", "Chen Qirui": "TW", "Xu Jiayuan": "TW", "Lin Shixun": "TW",
    "Pongsakarn Sornarra": "TH", "Thanapol Tiawattananont": "TH", "Vorawat Tanapatsopol": "TH", "Rit Bencharit": "TH", "Krit Jamkachornkiat": "TH", "Vorawat Charoensitthisathien": "TH", "Husdin Aekasinghachai": "TH", "Korsak Chairasmisak": "TH", "Paisal Thunthadaluk": "TH", "V. Ngamjarassrivichai": "TH", "Choltit Rattanasetyut": "TH", "Nitipone Aroonphaichitra": "TH", "Ruechagorn Trairatananusor": "TH", "Taechaamnuayvit Nuttakrit": "TH", "Thanomnual Leekulpitak": "TH",
    "CrazyStone": "AI", "DolBaram": "AI", "Zen19X": "AI", "Zen19S": "AI", "DarkForest": "AI", "Many Faces of Go": "AI", "Goemate": "AI", "SilverIgo": "AI", "Go++": "AI", "Go4++": "AI", "AyaMC": "AI", "Nomitan": "AI", "GLOBIS-AQZ": "AI", "deepmind": "AI",
    "Rui Naiwei": "CN", "Kim In": "KR", "Shi Yue": "CN", "Jimmy Cha": "KR", "Jiang Zhujiu": "CN",
}
KR_SUR = set("""kim lee yi park pak choi ch'oe cho jo kang yun yoon jang chang shin sin han seo song hong an ahn heo hur mok won weon na paek baek
byun pyeon yoo yu ryu kwon gueon hwang o oh min moon mun jin chin jeong jung cheong chung ko go ha yang lim im rim no noh bae pae on nam seol ju joo
chu ji chi do to um eom wi son sohn cha pang bang hyun hyeon ki myung pyo gu ku kwak sim shim yeom ok jeon jun cheon chun tak ra yeo yuk pyun jen
cheon gil kil hwangbo namgung seon sun eun uh eo kong gong ban pan ham bok pok tae kuk guk chae ch'ae jeo""".split())
KR_STRONG = set("kim lee park pak choi shin seo heo kwon hwang moon yoon jeong jung baek paek ahn oh noh lim nam yoo byun won mok jeon hyun eom kweon".split())
PINYIN = re.compile(r"^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ang|eng|ing|ong|iao|ian|uai|uan|üan|ai|ei|ao|ou|an|en|er|ia|ie|iu|in|ua|uo|ui|un|üe|ue|[aeiouüv]))+$")
ROMAJI = re.compile(r"^(?:(?:ky|gy|sh|ch|ts|ny|hy|by|py|my|ry|[kgsztdnhfbpmyrwj])?[aeiouôōû]|n(?![aeiouy])|[kstpgdbz](?=[kstpgdbzc])|m(?=[bpm])|h(?=$)|')+$")
KR_GIVEN = re.compile(r"(eo|eu|ae|oo|ee|hy|hw|kw|gw|yu?ng$|[bdgjkpst]h?y|seok|cheol|[^aeioung]$|wo+n|sik|beom|min$|jun$|hun$|ho$|su$|soo$)")


def name_country(variants):
    """KR / CN / JP / '' from the spellings alone"""
    v = [x for x in variants if x.isascii()]
    if not v:
        s = "".join(variants)
        return "KR" if re.search(r"[가-힣]", s) else ""
    for n in v:  # GoGoD writes Korean given names with a hyphen
        t = n.lower().split()
        if len(t) == 2 and re.fullmatch(r"[a-z']+-[a-z']+", t[1]) and len(t[0]) <= 7: return "KR"
        if len(t) in (2, 3) and t[0] in KR_STRONG: return "KR"
    votes = collections.Counter()
    for n in v:
        t = re.sub(r"\s*\(.*?\)|\s+(sr|jr)\.?$", "", n.lower()).split()
        if len(t) < 2: continue
        sur, giv = t[0], "".join(t[1:])
        py = all(PINYIN.match(x) for x in t)
        ro = all(ROMAJI.match(x) for x in t)
        kr = sur in KR_SUR and len(t) <= 3 and bool(KR_GIVEN.search(giv)) and not (py and not re.search(r"eo|eu|ae|oo|ee|hy|hw", giv))
        if kr and not ro: votes["KR"] += 2
        elif py and not ro: votes["CN"] += 2
        elif ro and not py: votes["JP"] += 2
        elif py and ro: votes["CN" if len(sur) <= 5 and len(t) == 2 and len(giv) <= 7 and not re.search(r"[aiueo](ko|mi|ro|ta|shi|ki|ji|to|ya|ka|e)$", giv) else "JP"] += 1
        elif kr: votes["KR"] += 1
    return votes.most_common(1)[0][0] if votes else ""


JP_DIRS = set("""Honinbo Judan Kisei Oza Meijin Tengen Gosei NHK Ryusei Oteai Shinjin-O OMeijin NKCh ProBest10 FHoninbo FMeijin Agon KK1st KK NK NK1st
Hayago FKisei AJ1st Shinei Daiwa NEC Okan Alum FKakusei TokyoShinbun Kakusei FChamp Senko Saikoi Saikyo FSaikyo Teikei_FLegend Teikei_Legend
Teikei_Shunei NEC_Shunei Yugen Masters Okage Aizu Wakagoi Fumakilla Tachiaoi Chikurin Hankyu Kintetsu JAL_Female_Hayago JAL_Shinei_Hayago
JAL_Super_Hayago JT Yucho Ryokusei Shinryusei Seniors Over40 Eikyu Densei Chubu_1st Bosai Lakeside Ryuen Ryufu Chisato FLeague FKansai FDaiwa
DaiwaGC Hayago_Meijin HakataKamachi IBM Keiinsha Masuda NKTw NK_HighestDans NTV_FMeijin NTV_NihonSeries OShinei ShineiS ShusaiCup Wakatake YsCup
Nakano Discovery Hoensha jastec Asahi_Top8 Champions Kirin Phoenix ProPairgo""".split())

# ---------- events ----------
def series(ev):
    e = re.sub(r"\s+", " ", ev or "").strip()
    e = re.sub(r"^(the )?\d+(st|nd|rd|th)\s+", "", e, flags=re.I)
    e = re.sub(r"\s+(19|20)\d\d(/\d+)?$", "", e)
    e = re.sub(r"^(19|20)\d\d\s+", "", e)
    e = re.sub(r"\s+(Title|title match|League|Challenger.*|Preliminar.*|Final.*)$", "", e)
    e = re.sub(r"^Ryusei [A-H]$", "Ryusei", e)
    return e[:60]


EVTAG = [  # (tag, pattern): the first that fits
    ("ai", r"AlphaGo|DeepZen|Master|computer|Future of Go"),
    ("old", r"Castle Game|Hoensha|Oshirogo|Jubango|10-game match|Kiseisha|Hiseikai"),
    ("f", r"Women|Female|Senko|Tachiaoi|Bingsheng|Wu Qingyuan Cup|Go Seigen Cup|Queen|Kakusei.*F|Saikyo.*W"),
    ("intl", r"Samsung|LG Cup|Fujitsu|Ing Cup|Chunlan|Mlily|Bailing|SGW|Nongshim|Nong Shim|Asian TV|Japan-China|China-Japan|Toyota|BC Card|Globis|Xinao|Limin|"
             r"Zhonghuan|Tianfu|Nie Weiping|World|International|Jinlong|Kuksu Mountains|Tong Yang|Tongyang|Japan-Korea|Korea-|China-Korea|Shinhan|Okage|Ibero"),
    ("ama", r"Prime Minister|Amateur|Pro-Ama|Student"),
    ("big", r"^(Honinbo|Judan|Kisei|Oza|Meijin|Tengen|Gosei|Old Meijin)$"),
    ("tv", r"NHK|Ryusei|Hayago|NEC|JAL|Agon|Lightning|Daiwa|TV"),
]


def evtag(name):
    for t, p in EVTAG:
        if re.search(p, name, flags=re.I): return t
    return ""


# ---------- details ----------
def date_of(dt, gn=""):
    """(yyyymmdd int with zeros for unknown parts, text shown)"""
    m = re.search(r"(\d{3,4})(?:-(\d\d))?(?:-(\d\d))?", dt or "")
    if not m:
        m = re.search(r"(\d{4})-(\d\d)-(\d\d)", gn or "")
        if not m: return 0
    y, mo, d = int(m.group(1)), int(m.group(2) or 0), int(m.group(3) or 0)
    if mo > 12: mo = 0
    if d > 31: d = 0
    if not 100 <= y <= 2100: return 0
    return y * 10000 + mo * 100 + d


def rank_of(r):
    """0 unknown, 1-9 pro dan, 10 title holder with no dan given, 20+dan amateur (20 = amateur, dan unknown), 30 insei"""
    r = (r or "").strip()
    if not r: return 0
    low = r.lower()
    m = re.search(r"(\d)\s*([pd])", low)
    if "ama" in low or re.search(r"\dk", low): return 20 + (int(m.group(1)) if m else 0)
    if "insei" in low: return 30
    if m and 1 <= int(m.group(1)) <= 9: return int(m.group(1))
    if re.search(r"meijin|honinbo|kisei|judan|tengen|oza|gosei|godokoro", low): return 10
    return 0


def result_of(re_):
    r = (re_ or "").strip()
    m = re.match(r"^([BW])\+\s*([\d.]+|R|T|F|Resign|Time|Forfeit)?", r, flags=re.I)
    if m:
        w, x = m.group(1).upper(), (m.group(2) or "")
        x = {"resign": "R", "time": "T", "forfeit": "F"}.get(x.lower(), x.upper())
        if re.fullmatch(r"[\d.]+", x): x = x.rstrip("0").rstrip(".") if "." in x else x
        return w + "+" + x
    if re.search(r"jigo|draw|^0$", r, flags=re.I): return "0"
    if re.search(r"void|no result", r, flags=re.I): return "V"
    return "?"


def line(mv):
    """the moves two letters each, ".." a pass; a pass is put in where one colour plays twice running"""
    out = []; last = None
    for c, s in mv:
        if c == last: out.append("..")
        out.append(s or ".."); last = c
    return "".join(out)


def main(brdir, y1, y2, outdir):
    games = []  # dicts
    seen = {}
    dups = []; raw = collections.Counter()
    def add(src, path, root, mv):
        if (root.get("SZ") or "19").strip() != "19" or len(mv) < 30: return
        b, w = clean(root.get("PB")), clean(root.get("PW"))
        if not b or not w: return
        k = gkey(mv); raw[b] += 1; raw[w] += 1
        if k in seen:
            o = seen[k]
            if o["b"] != b or o["w"] != w: dups.append((o["b"], o["w"], b, w))
            # the fuller record wins the details it lacks
            if not o["dt"]: o["dt"] = date_of(root.get("DT"), root.get("GN"))
            for f, v in (("br", rank_of(root.get("BR"))), ("wr", rank_of(root.get("WR")))):
                if not o[f]: o[f] = v
            return
        g = {"b": b, "w": w, "dir": path.split("/")[0] if src == "b" else "", "dt": date_of(root.get("DT"), root.get("GN")),
             "br": rank_of(root.get("BR")), "wr": rank_of(root.get("WR")), "re": result_of(root.get("RE")),
             "ev": re.sub(r"\s+", " ", root.get("EV") or "").strip(), "ro": re.sub(r"\s+", " ", root.get("RO") or "").strip()[:60],
             "pc": re.sub(r"\s+", " ", root.get("PC") or "").strip()[:60], "km": (root.get("KM") or "").strip()[:6],
             "ab": "".join(v for v in root.get("AB", []) if re.fullmatch(r"[a-s]{2}", v)), "aw": "".join(v for v in root.get("AW", []) if re.fullmatch(r"[a-s]{2}", v)),
             "mv": line(mv), "first": mv[0][0]}
        seen[k] = g; games.append(g)

    for d, _, fs in sorted(os.walk(brdir)):
        for f in sorted(fs):
            if not f.endswith(".sgf"): continue
            p = os.path.join(d, f); rel = os.path.relpath(p, brdir)
            if rel.split("/")[0] in ("other_sizes", "computer", "9x9", "Minigo", "unusual"): continue
            try: r = parse(open(p, encoding="utf-8", errors="replace").read())
            except Exception: continue
            if r: add("b", rel, r[0], r[1])
    nb = len(games)
    for f in (y1, y2):
        for l in open(f, encoding="utf-8", errors="replace"):
            if l.startswith("(;"):
                r = parse(l)
                if r: add("y", "", r[0], r[1])
    print("games", len(games), "from Brouwer", nb, "added from yenw", len(games) - nb)

    # ---------- who is who ----------
    par = {}
    def find(x):
        while par.setdefault(x, x) != x:
            par[x] = par[par[x]]; x = par[x]
        return x
    norm = lambda n: re.sub(r"[^a-z]", "", n.lower())
    for grp in ALIASES:
        for n in grp[1:]: par[find(n)] = find(grp[0])
    sim = lambda a, b: difflib.SequenceMatcher(None, norm(a), norm(b)).ratio()
    def unions(pairs):
        for (a, b), n in pairs.items():
            if is_group(a) or is_group(b): continue
            # a few shared games between two much-played names are mislabelled records, not one person
            if n < .04 * min(raw[a], raw[b]) or ("Bong" in a + b and "ung" in (a + b).replace("Bong", "")): continue
            if n >= 2 or sim(a, b) >= .6: par[find(a)] = find(b)
    # first the games where one side has the same name in both records: the other side's two names are one person
    pairs = collections.Counter()
    for ob, ow, b, w in dups:
        if ob == b: pairs[(ow, w)] += 1
        elif ow == w: pairs[(ob, b)] += 1
    unions(pairs)
    # then those where both differ, unless the record has the colours the other way round
    pairs = collections.Counter()
    for ob, ow, b, w in dups:
        if ob == b or ow == w: continue
        if find(ob) == find(w) or find(ow) == find(b) or sim(ob, w) >= .8 or sim(ow, b) >= .8: continue
        if find(ob) != find(b): pairs[(ob, b)] += 1
        if find(ow) != find(w): pairs[(ow, w)] += 1
    unions({k: n for k, n in pairs.items() if n >= 2})
    # the same letters with other hyphens, apostrophes or spaces
    byn = collections.defaultdict(list)
    for n in raw:
        if n.isascii() and not is_group(n) and not re.search(r"[\d(){}]|[SJ]r\.?$", n) and len(norm(n)) >= 6: byn[norm(n)].append(n)
    for ns in byn.values():
        for n in ns[1:]: par[find(n)] = find(ns[0])
    cnt = collections.Counter(); cntb = collections.Counter()
    for i, g in enumerate(games):
        for n in (g["b"], g["w"]):
            cnt[n] += 1
            if i < nb: cntb[n] += 1
    clusters = collections.defaultdict(list)
    for n in cnt: clusters[find(n)].append(n)
    first = {grp[0] for grp in ALIASES}
    canon = {}
    for root, ns in clusters.items():
        pick = next((n for n in ns if n in first or n in FAMOUS), None) or max(ns, key=lambda n: (cntb[n] > 0 and "'" not in n and "-" not in n, cntb[n], cnt[n]))
        for n in ns: canon[n] = pick
    # ---------- players ----------
    P = {}  # canon -> record
    for g in games:
        y = g["dt"] // 10000
        for side, rk in (("b", g["br"]), ("w", g["wr"])):
            c = canon[g[side]]
            p = P.setdefault(c, {"n": 0, "y0": 9999, "y1": 0, "rk": 0, "ama": 0, "jp": 0, "br": 0, "grp": is_group(c)})
            p["n"] += 1
            if y: p["y0"] = min(p["y0"], y); p["y1"] = max(p["y1"], y)
            if 1 <= rk <= 10: p["rk"] = max(p["rk"], min(rk, 9) if rk < 10 else 9)
            elif rk >= 20: p["ama"] += 1
            if g["dir"]:
                p["br"] += 1
                if g["dir"] in JP_DIRS: p["jp"] += 1
    for c, p in P.items():
        vs = [n for n in canon if canon[n] == c] if p["n"] >= 1 else [c]
        p["al"] = sorted(set(vs) - {c})
    # (canon -> variants) built once
    var = collections.defaultdict(list)
    for n, c in canon.items(): var[c].append(n)
    for c, p in P.items():
        p["al"] = sorted(set(var[c]) - {c})
        if p["grp"]: p["cc"] = ""; continue
        cc = COUNTRY.get(c)
        if not cc:
            nc = name_country(var[c])
            if p["jp"] >= 5 and p["jp"] >= .5 * p["br"]: cc = "JP"
            elif p["y1"] and p["y1"] < 1900 and nc != "CN": cc = "JP"
            else: cc = nc or ("XX" if c.isascii() else "")
        p["cc"] = cc
        # amateur: mostly amateur ranks and never a pro dan
        p["lvl"] = p["rk"] if p["rk"] else (20 if p["ama"] and p["ama"] >= .5 * p["n"] else 0)
    order = sorted(P, key=lambda c: (-P[c]["n"], c))
    pid = {c: i for i, c in enumerate(order)}

    # ---------- events ----------
    EVN = collections.Counter(); evy = {}
    for g in games:
        s = series(g["ev"]); g["se"] = s
        if s:
            EVN[s] += 1; y = g["dt"] // 10000
            a = evy.setdefault(s, [9999, 0])
            if y: a[0] = min(a[0], y); a[1] = max(a[1], y)
    eorder = [e for e, n in EVN.most_common()]
    eid = {e: i + 1 for i, e in enumerate(eorder)}  # 0 = none

    # ---------- write ----------
    games.sort(key=lambda g: (g["dt"] or 0, g["se"], g["ro"]))
    os.makedirs(os.path.join(outdir, "g"), exist_ok=True)
    for f in os.listdir(os.path.join(outdir, "g")): os.remove(os.path.join(outdir, "g", f))
    dump = lambda o, p: json.dump(o, open(p, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    N = len(games)
    for s in range(0, N, SHARD):
        rows = []
        for g in games[s:s + SHARD]:
            x = {}
            if g["ev"]: x["e"] = g["ev"]
            if g["ro"]: x["r"] = g["ro"]
            if g["pc"]: x["p"] = g["pc"]
            if g["km"]: x["k"] = g["km"]
            if g["ab"]: x["ab"] = g["ab"]
            if g["aw"]: x["aw"] = g["aw"]
            if g["first"] != "B": x["f"] = "W"
            if canon[g["b"]] != g["b"]: x["bn"] = g["b"]
            if canon[g["w"]] != g["w"]: x["wn"] = g["w"]
            rows.append([g["mv"], x] if x else [g["mv"]])
        dump(rows, os.path.join(outdir, "g", "%04d.json" % (s // SHARD)))
    per = -(-N // PARTS)
    for k in range(PARTS):
        gs = games[k * per:(k + 1) * per]
        dump({"d": [g["dt"] for g in gs], "b": [pid[canon[g["b"]]] for g in gs], "w": [pid[canon[g["w"]]] for g in gs],
              "e": [eid.get(g["se"], 0) for g in gs], "r": [g["re"] for g in gs], "q": [g["br"] * 32 + g["wr"] for g in gs],
              "n": [len(g["mv"]) // 2 for g in gs], "h": [len(g["ab"]) // 2 for g in gs]}, os.path.join(outdir, "meta-%d.json" % k))
    players = []
    for c in order:
        p = P[c]
        row = [c, p["cc"], p.get("lvl", 0), p["n"], 0 if p["y0"] == 9999 else p["y0"], p["y1"], "|".join(p["al"]), FAMOUS.get(c, "")]
        if p["grp"]: row.append(1)
        players.append(row)
    events = [[e, EVN[e], 0 if evy[e][0] == 9999 else evy[e][0], evy[e][1], evtag(e)] for e in eorder]
    dump({"v": 1, "n": N, "shard": SHARD, "parts": PARTS, "per": per, "players": players, "events": events}, os.path.join(outdir, "index.json"))
    print("players", len(players), "events", len(events), "shards", -(-N // SHARD))
    return games, P, canon


if __name__ == "__main__":
    main(*sys.argv[1:5])
