(function () {
  const E = GoEngine(null);
  const F = GoFeatures(E);
  const { Board, PASS, EMPTY, BLACK, WHITE } = E;
  const LETTERS = "ABCDEFGHJKLMNOPQRST";
  const $ = id => document.getElementById(id);
  const cv = $("board"), g = cv.getContext("2d");
  const MODEL = window.GO_MODEL || "b10";

  function load(k, d) { try { const v = localStorage.getItem("gonn." + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem("gonn." + k, JSON.stringify(v)); } catch (e) {} }

  const STYLE = {
    balance: { label: "สมดุล", opts: {} },
    attack: { label: "บุกสุดๆ", opts: { pda: 1.5, scoreWeight: 0.5 } },
    defend: { label: "ตั้งรับสุดๆ", opts: { pda: -1.25 } }
  };
  // Strength comes from how much the network reads ahead; ranks are estimates, not measured against people.
  const CHARS = [
    // not an opponent: opens the step-by-step lessons for people who have never played
    { id: "tutorial", en: "TUTORIAL", name: "คัมภีร์สอนเล่น", country: "", rank: "มือใหม่เริ่มที่นี่", style: "balance", tutorial: true, search: {},
      bio: "ไม่เคยเล่นโกะมาก่อน? เริ่มที่นี่ ลุงวินสอนกติกาทีละขั้นบนกระดาน 9×9 ตั้งแต่วางหมาก การกิน โค ตา ไปจนถึงการนับแต้ม พร้อมแบบฝึกให้ลองแตะเล่นเอง",
      say: { hello: "มาๆ หลาน ลุงสอนเอง เดี๋ยวก็เป็น" } },
    { id: "mek", en: "MEK", name: "เมฆ", country: "ไทย", rank: "15 คิว", style: "balance", search: { temperature: 2.0, blunder: 0.3, local: 3, keepTerritory: true },
      bio: "เด็ก ม.6 เพิ่งหัดเล่นโกะ เดินตามความรู้สึก",
      say: { hello: "เพิ่งหัดเล่นนะครับ เบามือหน่อย", ahead: "เอ๊ะ ผมนำอยู่เหรอ", behind: "โห พี่เล่นเก่งจัง", win: "ชนะแล้ว! ไม่อยากเชื่อเลย", lose: "สอนผมบ้างได้ไหมครับ" } },
    { id: "win", en: "UNCLE WIN", name: "ลุงวิน", country: "ไทย", rank: "8 คิว", style: "balance", opening: "corners", search: { temperature: 1.6, blunder: 0.15, local: 3, noFloat: true, keepTerritory: true },
      bio: "เซียนหมากฮอสประจำวินมอเตอร์ไซค์ เพิ่งมาลองเล่นโกะ",
      say: { hello: "หมากฮอสลุงไม่เคยแพ้ใครนะ มาลองโกะกันหน่อย", ahead: "กินได้กินเลย เหมือนหมากฮอสนั่นแหละ", behind: "เดี๋ยวๆ ขอคิดแป๊บ", win: "เห็นไหม เซียนก็คือเซียน", lose: "เก่งนี่หว่า เดี๋ยวลุงไปฝึกมาใหม่" } },
    { id: "yuto", en: "YUTO", name: "ยูโตะ", country: "ญี่ปุ่น", rank: "3 คิว", style: "balance", search: { temperature: 1.0, blunder: 0.03, local: 3, keepTerritory: true }, early: { temperature: 0.25, local: 3, keepTerritory: true },
      bio: "นักเรียนชมรมโกะจากญี่ปุ่น เล่นตามตำราที่ชมรมสอน",
      say: { hello: "โอเนไงชิมัส! ขอคำชี้แนะด้วยครับ", ahead: "ตามที่รุ่นพี่ชมรมสอนเป๊ะเลย", behind: "ต้องตั้งใจกว่านี้แล้ว", win: "ขอบคุณสำหรับเกมครับ", lose: "อาริงาโตะ จะกลับไปซ้อมที่ชมรมครับ" } },
    { id: "joker", en: "JOKER", name: "โจ๊กเกอร์", country: "ไม่ทราบ", rank: "3 คิว", style: "attack", opening: "raid",
      search: { temperature: 0.6, blunder: 0.02, keepTerritory: true }, early: { temperature: 1.2, keepTerritory: true },
      bio: "นักเล่นนอกตำรา ไม่เคยเปิดมุมของตัวเอง เดินหมากแปลกใหม่ที่ไม่มีใครเดิน แล้วไล่ตีมุมคนอื่นก่อนเสมอ",
      say: { hello: "กฎมีไว้แหก… มาเล่นสนุกกันเถอะ", ahead: "ไม่มีใครอ่านมุกผมออกหรอก", behind: "สนุกขึ้นแล้วสิ", win: "ฮ่าๆ ตำราไม่ได้ช่วยอะไรเลยใช่ไหม", lose: "เก่งนี่… ผมชักชอบคุณแล้วสิ" } },
    { id: "chris", en: "CHRIS", name: "คริส", country: "อังกฤษ", rank: "1 ดั้ง", style: "balance", search: { visits: 12, local: 3 }, early: { temperature: 0.1, local: 3 },
      bio: "นักหมากล้อมจากอังกฤษ ใจเย็น คิดอย่างมีเหตุผล",
      say: { hello: "Good game ahead. เชิญเลยครับ", ahead: "เป็นไปตามแผน", behind: "Interesting... น่าสนใจมาก", win: "Well played, เกมดีครับ", lose: "Brilliant! คุณเล่นได้ยอดเยี่ยม" } },
    { id: "weiqi", en: "WEIQI", name: "เว่ยฉี", country: "จีน", rank: "3 ดั้ง", style: "attack", opening: "tengen", search: { visits: 30 },
      bio: "ดาวรุ่งอายุน้อยจากจีน เปิดเทนเง็นทุกกระดาน บุกหนักทุกตา ไล่ฆ่าทุกกลุ่มที่เห็น",
      say: { hello: "เตรียมตัวไว้ ผมไม่ปล่อยกลุ่มไหนรอดแน่", ahead: "กลุ่มนั้นตายแล้ว", behind: "ยังไม่จบ! เดี๋ยวบุกกลับ", win: "บอกแล้วว่าไม่มีใครหนีพ้น", lose: "แค่ครั้งนี้เท่านั้น ครั้งหน้าไม่รอดแน่" } },
    { id: "tora", en: "TORA", name: "โทระ", country: "ญี่ปุ่น", rank: "4 ดั้ง", style: "defend", opening: "33", search: { visits: 48 },
      bio: "คู่แข่งตลอดกาลของเว่ยฉี ยึด 3-3 ทุกมุมที่ว่าง ตั้งรับแน่นหนา แทบไม่มีช่องโหว่",
      say: { hello: "บุกมาเลย ผมรับได้หมด", ahead: "ป้อมของผมไม่มีวันแตก", behind: "ยังรับไหว", win: "การป้องกันที่ดีที่สุดคือการไม่ให้โอกาส", lose: "ทะลวงป้อมผมได้... ไม่เลว" } },
    { id: "kan", en: "KAN", name: "กัน", country: "ไทย", rank: "5 ดั้ง", style: "balance", search: { visits: 120, timeMs: 10000 },
      bio: "นักหมากล้อมทีมชาติไทย นิ่ง แม่นยำ อ่านเกมขาด",
      say: { hello: "เล่นเต็มที่นะครับ", ahead: "เกมนี้อยู่ในมือแล้ว", behind: "ยังมีทางสู้", win: "ขอบคุณที่เล่นด้วยครับ ฝึกต่อไปนะ", lose: "ฝีมือระดับทีมชาติเลยนะครับ" } },
    { id: "todo", en: "TODO", name: "โทโด", country: "ญี่ปุ่น", rank: "1 ดั้งโปร", style: "balance", search: { visits: 4000, timeMs: 10000 },
      bio: "นักหมากล้อมมืออาชีพจากญี่ปุ่น อ่านเกมจนหมดเวลาทุกตา เก่งที่สุดในสนาม",
      say: { hello: "...เชิญ", ahead: "จบแล้ว", behind: "อืม", win: "ยังต้องฝึกอีกมาก", lose: "เจ้าคือผู้ที่ข้ารอคอยมานาน" } },
    // placement test: reads like Todo but keeps the game close, and grades every move the player makes
    { id: "hikaru", en: "HIKARU", name: "ฮิคารุ", country: "ญี่ปุ่น", rank: "Teaching Game", style: "balance", exam: true, search: { visits: 2500, timeMs: 6500 },
      bio: "ผู้คุมสอบวัดระดับ อ่านหมากได้ระดับโทโด เดินโจเซกิและหมากพื้นฐานแน่นๆ คุมเกมให้สูสี บางตาจะเปิดช่องให้ลองดูว่าคุณตอบโต้ได้ดีแค่ไหน ทุกตาที่คุณเดินจะถูกให้คะแนน จบเกมแล้วบอกระดับฝีมือโดยประมาณ (เกมต้องยาวอย่างน้อย 100 ตา) เวลา 30 นาที + เบียวโยมิ 30 วิ × 3 แนะนำให้เล่นจนจบกระดานและนับแต้ม ผลสอบจะใกล้เคียงที่สุด",
      say: { hello: "มาวัดฝีมือกันหน่อย", ahead: "ลองหาตาที่ดีกว่านี้ดูนะ", behind: "เก่งนี่", win: "จบการสอบ ดูผลด้านล่างได้เลย", lose: "จบการสอบ ดูผลด้านล่างได้เลย" } }
  ];
  // ---------- in-game lines: each kind is "|"-separated variants, {n} is a stone count ----------
  // goodMove/badMove: the player's last move moved their winning chance a lot; caught: the player captured
  // the character's stones; capture: the character captured; comeback: the character turned a lost game around.
  const TALK = {
    mek: {
      hello: "เพิ่งหัดเล่นนะครับ เบามือหน่อย|ครูที่โรงเรียนบอกให้มาลองเล่นกับคนเก่งๆ ครับ|ผมจำกติกาได้แล้วนะ น่าจะได้…มั้ง",
      goodMove: "หา? ตานี้เก่งมากเลยพี่|เดินแบบนี้ก็ได้เหรอ จดไว้ก่อน|ว้าว ผมไม่ได้คิดถึงตรงนั้นเลย",
      badMove: "เอ๊ะ พี่ให้ผมเหรอครับ|ตานี้ผมว่าพี่พลาดนะ… หรือผมดูผิด|ผมก็เดินแบบนั้นบ่อยเหมือนกันครับ ฮ่าๆ",
      caught: "ไม่นะ หมากผมหายไป {n} เม็ด|อ้าว โดนกินแล้ว ผมไม่ทันเห็นเลย|เดี๋ยวๆ มันตายตั้งแต่ตอนไหนครับ",
      capture: "กินได้! กินได้ {n} เม็ด|เย้ ได้หมากเชลยแล้ว|ขอโทษนะพี่ ผมเห็นว่ามันไม่มีลมแล้ว",
      ahead: "เอ๊ะ ผมนำอยู่เหรอ|ถ้าชนะผมจะเอาไปอวดเพื่อนที่ห้อง|ใจเต้นแรงเลยครับตอนนี้",
      behind: "โห พี่เล่นเก่งจัง|กระดานผมเหลือนิดเดียวแล้ว|ไม่เป็นไร ผมมาเพื่อเรียนรู้ครับ",
      comeback: "เดี๋ยวนะ ผมกลับมาได้ไง|ดวงล้วนๆ เลยครับเกมนี้",
      humanPass: "พี่ผ่านเหรอครับ ผมต้องผ่านด้วยไหม|เอ่อ… ผ่านแปลว่าจบแล้วใช่ไหมครับ",
      aiPass: "ผมไม่รู้จะลงตรงไหนแล้ว ขอผ่านครับ|ผมว่าเต็มแล้ว ผ่านครับ",
      ko: "อ๋อ อันนี้ที่เรียกว่าโคใช่ไหมครับ ผมก็งงเหมือนกัน|ต้องไปเดินที่อื่นก่อนนะพี่ ผมเพิ่งอ่านเจอ",
      hint: "พี่แอบดูคำแนะนำ ผมขอบ้างได้ไหม|โกงนิดๆ ไม่เป็นไรครับ ผมก็อยากโกง",
      slow: "พี่คิดนานจัง ผมไปกินข้าวก่อนได้ไหม|ไม่ต้องรีบนะครับ ผมก็คิดไม่ออกเหมือนกัน",
      byoyomi: "เหลือ 30 วิแล้วนะพี่ รีบๆ|นาฬิกาเดินแล้วพี่!",
      lastPeriod: "ครั้งสุดท้ายแล้วนะพี่ ระวังหมดเวลา|อย่าหมดเวลาเพราะผมนะครับ",
      aiByo: "ผมใช้เวลาหมดแล้ว ต้องรีบแล้ว|เวลาเหลือน้อย มือสั่นเลย",
      mid: "ผมเริ่มเข้าใจคำว่าลมหายใจแล้วครับ|เกมนี้ยาวกว่าที่คิดเยอะเลย|ผมชอบเสียงวางหมากตอนลงกระดานมาก",
      win: "ชนะแล้ว! ไม่อยากเชื่อเลย|ขอถ่ายรูปกระดานเก็บไว้ได้ไหมครับ",
      lose: "สอนผมบ้างได้ไหมครับ|แพ้แต่สนุกมากครับ มาเล่นอีกนะ|ผมจะกลับไปดูคลิปสอนเพิ่มครับ",
      resigned: "พี่ยอมเลยเหรอ ผมยังไม่รู้ตัวเลยว่าชนะ|เอ๊ะ จบแล้ว? ขอบคุณที่เล่นด้วยครับ",
      timeoutWin: "พี่หมดเวลา… ผมชนะแบบนี้ได้เหรอครับ|ไม่เป็นไรนะพี่ ผมก็ลืมดูนาฬิกาบ่อย",
      giveUp: "ผมยอมแล้วครับ ไม่เหลืออะไรให้สู้เลย|ยอมครับ พี่เก่งเกินไป"
    },
    win: {
      hello: "หมากฮอสลุงไม่เคยแพ้ใครนะ มาลองโกะกันหน่อย|รอลูกค้าอยู่ ขอตาสองตาก่อนแล้วกัน|มาๆ ลุงให้เดินก่อนก็ได้นะไอ้หนู",
      goodMove: "เฮ้ย ตานี้แสบ|เดินแบบนี้ลุงต้องเกาหัวแล้ว|ไอ้หนูนี่ไม่ธรรมดาแฮะ",
      badMove: "ฮ่าๆ เข้าทางลุงเลย|ตานี้ลุงขอบใจนะ|ไปลงตรงนั้นทำไมล่ะหลาน",
      caught: "เฮ้ย หมากลุงหายไป {n} เม็ด!|โกะนี่กินกันง่ายกว่าหมากฮอสอีก|เดี๋ยว ลุงไม่ได้ตั้งใจให้กินนะ",
      capture: "กินได้กินเลย {n} เม็ด เหมือนหมากฮอสนั่นแหละ|เสร็จลุง!|ฮึ่ย กินซะเลย",
      ahead: "กินได้กินเลย เหมือนหมากฮอสนั่นแหละ|วันนี้ลุงมือขึ้น|ช่วงนี้ไม่มีผู้โดยสาร ลุงเลยมีเวลาเต็มที่",
      behind: "เดี๋ยวๆ ขอคิดแป๊บ|ไม่ได้การละ ลุงต้องเอาจริงแล้ว|ถ้าเป็นหมากฮอสลุงพลิกได้นะ",
      comeback: "เห็นไหม คนแก่ยังไม่ตาย|ลุงบอกแล้วว่าเซียนพลิกได้",
      humanPass: "ผ่าน? ใจป้ำดีนี่|หลานผ่านลุงก็สบาย",
      aiPass: "ลุงว่าพอแล้ว ผ่าน|ไม่มีที่ลงละ ผ่านเลย",
      ko: "ตรงนั้นห้ามนะหลาน ลุงก็โดนมาแล้ว|กติกานี้แปลกดีเนอะ ไปเดินที่อื่นก่อน",
      hint: "ดูโพยเหรอหลาน ลุงเห็นนะ|เปิดโพยก็ได้ ลุงไม่ว่า",
      slow: "ลุงต้องไปรับลูกค้าแล้วนะเนี่ย|คิดนานจริง ลุงสูบยาเสร็จพอดี",
      byoyomi: "นาฬิกาเดินแล้วหลาน!|รีบหน่อย ลูกค้าลุงรออยู่",
      lastPeriod: "เหลือครั้งเดียวแล้ว ระวังนะหลาน|เร็วเข้าๆ เดี๋ยวหมดเวลา",
      aiByo: "เวลาลุงหมดแล้ว ต้องรีบแบบซิ่งมอไซค์|มาเร็วเคลมเร็ว!",
      mid: "สมัยหนุ่มๆ ลุงเล่นหมากฮอสทั้งวิน|โกะนี่กระดานใหญ่จริง ตาลายเลย|ลุงว่าลุงเริ่มติดเกมนี้ละ",
      win: "เห็นไหม เซียนก็คือเซียน|ไปเล่ามาเลยว่าแพ้วินมอไซค์|เดี๋ยวลุงเลี้ยงกาแฟเย็น",
      lose: "เก่งนี่หว่า เดี๋ยวลุงไปฝึกมาใหม่|แพ้แล้วก็แพ้ ไปวิ่งรถต่อดีกว่า|เอาไว้ล้างตาวันหลัง",
      resigned: "ยอมเลยเหรอ ลุงยังไม่ทันได้เกร็งเลย|ไม่เป็นไรหลาน มาเล่นใหม่ได้",
      timeoutWin: "หมดเวลาหลาน ช้ากว่าลุงขับรถอีก|ชนะเพราะนาฬิกา ลุงก็เอานะ",
      giveUp: "พอๆ ลุงยอม ไปขับรถดีกว่า|ลุงยอม หลานเก่งจริง"
    },
    yuto: {
      hello: "โอเนไงชิมัส! ขอคำชี้แนะด้วยครับ|วันนี้ชมรมไม่มีซ้อม เลยมาขอเล่นด้วยครับ|รุ่นพี่บอกว่าให้เล่นกับคนเก่งเยอะๆ ครับ",
      goodMove: "ซุโกย! ตานี้เหมือนในตำราเลย|ตาสวยมากครับ ขอจดไว้ให้รุ่นพี่ดู|ผมไม่ได้คาดไว้เลยครับ",
      badMove: "เอ๊ะ ตานี้ผิดทรงนะครับ|รุ่นพี่บอกว่าหมากแบบนี้เรียกว่าหมากหนักครับ|ขอโทษนะครับ แต่ผมจะลงโทษตานี้ครับ",
      caught: "อ๊ะ หมากผมโดนกิน {n} เม็ด|มัตตะ… ผมอ่านพลาดครับ|โดนจับได้ ต้องตั้งใจกว่านี้",
      capture: "ขออนุญาตกินนะครับ {n} เม็ด|แบบนี้เรียกว่าชิโจใช่ไหมครับ|ตามตำราเลยครับ",
      ahead: "ตามที่รุ่นพี่ชมรมสอนเป๊ะเลย|ต้องเล่นให้หนักแน่นไว้ครับ|อย่าเพิ่งประมาท อย่าเพิ่งประมาท",
      behind: "ต้องตั้งใจกว่านี้แล้ว|กัมบาริมัส!|รุ่นพี่จะว่าผมแน่เลยครับ",
      comeback: "ยังไม่ยอมแพ้ครับ! กลับมาแล้ว|ความพยายามไม่เคยทรยศครับ",
      humanPass: "ผ่านเหรอครับ งั้นผมขอนับดูก่อนนะครับ|เข้าใจแล้วครับ",
      aiPass: "ผมว่าเขตแดนปิดหมดแล้วครับ ขอผ่าน|ขอผ่านครับ",
      ko: "โคครับ ต้องหาที่ขู่ก่อนนะครับ|ห้ามเก็บโคทันทีครับ ตามกติกา",
      hint: "ใช้คำแนะนำไม่ผิดครับ ผมก็ถามรุ่นพี่บ่อย|ดูเฉลยแล้วอย่าลืมจำนะครับ",
      slow: "คิดอย่างรอบคอบดีมากครับ|ผมรอได้ครับ ที่ชมรมเคยคิดกันตาละสิบนาที",
      byoyomi: "เบียวโยมิแล้วครับ ฮาจิเมะ!|เข้าช่วงนับเวลาแล้วนะครับ",
      lastPeriod: "ครั้งสุดท้ายแล้วครับ ระวังนะครับ|อย่าหมดเวลานะครับ เสียดาย",
      aiByo: "ผมก็เข้าเบียวโยมิแล้วครับ ใจเต้นเลย|ต้องเล่นเร็วขึ้นแล้วครับ",
      mid: "ช่วงกลางกระดานนี่ยากที่สุดเลยครับ|ผมชอบความเงียบตอนเล่นโกะครับ|ที่ญี่ปุ่นเราเรียกเกมนี้ว่าอิโกะครับ",
      win: "ขอบคุณสำหรับเกมครับ|อาริงาโตะโกไซมัสตะ! เป็นเกมที่ดีมากครับ",
      lose: "อาริงาโตะ จะกลับไปซ้อมที่ชมรมครับ|มาเกะมาชิตะ… ขอบคุณที่ชี้แนะครับ|ผมได้เรียนรู้เยอะเลยครับ",
      resigned: "ขอบคุณที่เล่นจนจบครับ|ยอมแพ้อย่างสง่างามครับ ขอบคุณครับ",
      timeoutWin: "เสียดายจังครับ หมดเวลาซะแล้ว|นาฬิกาก็เป็นส่วนหนึ่งของเกมครับ",
      giveUp: "มาเกะมาชิตะ ผมยอมแพ้ครับ|ไม่มีทางสู้แล้วครับ ขอบคุณที่ชี้แนะ"
    },
    joker: {
      hello: "กฎมีไว้แหก… มาเล่นสนุกกันเถอะ|มุมของผมเหรอ? ไม่มีหรอก ผมจะไปเอามุมของคุณ|ตำราน่ะ ผมโยนทิ้งไปนานแล้ว",
      goodMove: "โอ้โห ตานี้มีสไตล์นี่|ผมชอบ ตานี้ไม่อยู่ในตำราเหมือนกัน|เอาล่ะ เริ่มสนุกแล้ว",
      badMove: "ฮ่าๆ ตานี้ผมยังไม่กล้าเดินเลย|ขอบคุณสำหรับของขวัญนะ|อ้าว นึกว่าจะเล่นมุกเดียวกับผม",
      caught: "ฮะ! ไปแค่ {n} เม็ด ผมยังมีอีกเยอะ|เสียหมากนิดหน่อย ถือเป็นค่าตั๋วการแสดง|โดนกินแล้ว… แต่นั่นอาจเป็นมุกก็ได้นะ",
      capture: "ตาย {n} เม็ด! เซอร์ไพรส์!|หมากคุณหายไปเหมือนมายากล|ฮ่าๆ ไม่ทันตั้งตัวใช่ไหม",
      ahead: "ไม่มีใครอ่านมุกผมออกหรอก|ตำราสอนไว้แบบนี้ไหม? ไม่สินะ|ยิ่งแปลกยิ่งได้ผล",
      behind: "สนุกขึ้นแล้วสิ|แพ้อยู่ก็ดี มุกใหม่จะได้ออกมา|อย่าเพิ่งดีใจ ไพ่ใบสุดท้ายยังอยู่ในมือผม",
      comeback: "ใครบอกว่าเกมนี้จบแล้ว ฮ่าๆ|เซอร์ไพรส์! กลับมาแล้ว",
      humanPass: "ผ่านเหรอ? น่าเบื่อจัง|จบแล้วเหรอ ผมยังมีมุกเหลืออีกเยอะเลย",
      aiPass: "หมดมุกแล้ว… ผ่านก็ได้|โชว์จบแล้ว ผ่าน",
      ko: "โค! เกมแย่งชิงที่ผมชอบที่สุด|ไปหาขู่ที่อื่นก่อนสิ ผมรอได้",
      hint: "แอบดูโพยเหรอ? ผมไม่มีโพยให้ดูหรอกนะ|คำใบ้ก็ช่วยอ่านใจผมไม่ได้",
      slow: "คิดนานจัง กำลังหาว่าผมจะเล่นมุกอะไรเหรอ|ยิ่งคิดยิ่งงงใช่ไหม ฮ่าๆ",
      byoyomi: "ติ๊กต่อก ติ๊กต่อก…|เวลาเหลือน้อยแล้วนะ ใจเต้นไหม",
      lastPeriod: "ครั้งสุดท้ายแล้ว อย่าพลาดล่ะ|ตาเดียวพลาดก็จบโชว์นะ",
      aiByo: "เวลาน้อยแบบนี้แหละ มุกดีๆ ถึงจะออก|ไม่ต้องคิด เดินตามใจ",
      mid: "มุมของคุณสวยดี ขอยืมหน่อยนะ|ทำไมต้องเดินเหมือนคนอื่นด้วยล่ะ|ไม่มีกฎข้อไหนบอกว่าต้องเปิดมุมก่อน",
      win: "ฮ่าๆ ตำราไม่ได้ช่วยอะไรเลยใช่ไหม|โชว์จบแล้ว ขอบคุณที่มาชมนะ|สนุกดี มาเล่นกันอีกสิ",
      lose: "เก่งนี่… ผมชักชอบคุณแล้วสิ|มุกนี้ไม่ขำ แต่เกมสนุกมาก|ครั้งหน้าผมจะเอามุกใหม่มา",
      resigned: "ยอมแล้วเหรอ? เพิ่งจะสนุกเอง|ฮ่าๆ หนีไปซะแล้ว",
      timeoutWin: "เวลาหมดซะแล้ว มุกตลกร้ายจริงๆ|นาฬิกาก็เป็นตัวตลกได้นะ",
      giveUp: "โอเค โชว์นี้ล่มแล้ว ผมยอม|ยอมก็ได้ แต่ผมจะกลับมาพร้อมมุกใหม่"
    },
    chris: {
      hello: "Good game ahead. เชิญเลยครับ|Shall we? ชาเย็นพร้อมแล้ว|ขอให้เป็นเกมที่มีเหตุผลนะครับ",
      goodMove: "Oh, nice one. ตานี้ดีมาก|Excellent. ผมไม่ได้คาดไว้เลย|ตาที่มีเหตุผลมากครับ",
      badMove: "Hmm, are you sure? ผมว่าตรงนั้นช้าไปหน่อย|That's a pity. ผมจะไม่ปล่อยไปนะ|ตานี้ให้โอกาสผมแล้วครับ",
      caught: "Ah, my stones… {n} เม็ด ราคาแพงเลย|Fair enough. ผมประเมินผิดเอง|Well spotted ครับ",
      capture: "Sorry, ขอเก็บ {n} เม็ดนะครับ|ตามคาด ไม่มีลมหายใจแล้ว|Elementary ครับ",
      ahead: "เป็นไปตามแผน|Steady. ค่อยเป็นค่อยไป|ตัวเลขกำลังเข้าข้างผม",
      behind: "Interesting... น่าสนใจมาก|ผมต้องคำนวณใหม่แล้ว|Quite a pickle ครับ",
      comeback: "Keep calm and carry on ครับ|ความใจเย็นมักได้ผลตอบแทนเสมอ",
      humanPass: "Pass? ผมขอตรวจกระดานก่อนนะครับ|Very well.",
      aiPass: "I think we're done. ผ่านครับ|ผมไม่เห็นตาที่มีค่าเหลือแล้ว ผ่าน",
      ko: "A ko fight! ต้องหาที่ขู่ก่อนนะครับ|ตามกติกา ยังเก็บคืนไม่ได้ครับ",
      hint: "Getting a second opinion? ไม่ว่ากันครับ|ข้อมูลดีๆ ช่วยให้ตัดสินใจได้ดีขึ้น",
      slow: "Take your time ครับ ผมจิบชารอได้|การคิดนานคือการเคารพเกม",
      byoyomi: "Byo-yomi ครับ เหลือ 30 วินาที|Clock's ticking ครับ",
      lastPeriod: "Last period ครับ ระวังด้วย|ครั้งสุดท้ายแล้วนะครับ",
      aiByo: "Time is short. ผมต้องเร่งแล้ว|ขอโทษที่ต้องเล่นเร็วขึ้นครับ",
      mid: "Go เหมือนหมากรุกแต่มีกระดานใหญ่กว่า และใจกว้างกว่า|ที่ลอนดอนผมเล่นที่ผับทุกวันพุธ|ทุกตามีเหตุผลของมันเสมอ",
      win: "Well played, เกมดีครับ|Cheers! ขอบคุณสำหรับเกมครับ",
      lose: "Brilliant! คุณเล่นได้ยอดเยี่ยม|Hats off ครับ ผมแพ้อย่างยอมรับ|Jolly good game ครับ",
      resigned: "A gracious resignation. ขอบคุณครับ|Good game ครับ เกมหน้ามาอีกนะ",
      timeoutWin: "Unlucky. หมดเวลาซะก่อน|เสียดายครับ เกมกำลังสนุก",
      giveUp: "I resign. คุณสมควรชนะครับ|ไม่มีเหตุผลที่จะเล่นต่อแล้ว ผมยอมครับ"
    },
    weiqi: {
      hello: "เตรียมตัวไว้ ผมไม่ปล่อยกลุ่มไหนรอดแน่|เทนเง็นรออยู่ตรงกลางแล้ว|ถ้าเจอโทระบอกเขาด้วยว่าผมมา",
      goodMove: "หึ ตานี้พอใช้ได้|ดิ้นได้ดีนี่|ตานี้ผมจะจำไว้",
      badMove: "เห็นจุดอ่อนแล้ว!|ผิดพลาดตานี้ราคาแพงนะ|นั่นแหละที่ผมรอ",
      caught: "{n} เม็ดเหรอ ไม่เป็นไร ผมจะเอาคืนเป็นกลุ่ม|ฮึ่ม! อย่าคิดว่าจบแค่นี้|แค่เสียหน้าหมากนิดหน่อย",
      capture: "{n} เม็ดลงกล่อง!|บอกแล้วว่าไม่มีใครรอด|ต่อไปกลุ่มไหนดี",
      ahead: "กลุ่มนั้นตายแล้ว|บุกต่อไม่หยุด!|นับกระดานไม่ต้อง นับศพแทน",
      behind: "ยังไม่จบ! เดี๋ยวบุกกลับ|ผมจะไม่ตั้งรับแบบโทระเด็ดขาด|ต้องฆ่าให้ได้สักกลุ่ม",
      comeback: "เห็นไหม! การบุกคือคำตอบ|กลับมาแล้ว ทีนี้ไม่ปล่อยแล้ว",
      humanPass: "ผ่าน? ไม่สู้แล้วเหรอ|หนีไม่พ้นหรอก",
      aiPass: "ไม่มีอะไรให้ฆ่าแล้ว ผ่าน|ผ่าน น่าเบื่อ",
      ko: "โคเหรอ ผมชอบสู้โค!|ห้ามเก็บคืนทันที ไปหาที่ขู่มาก่อน",
      hint: "ขอให้ AI ช่วยก็ไม่รอดหรอก|ดูคำใบ้ไปก็เท่านั้น",
      slow: "คิดนานไปก็ไม่รอดหรอก|เร็วเข้า ผมอยากบุกต่อแล้ว",
      byoyomi: "เวลาเริ่มบีบแล้ว!|30 วิ! รีบตายหรือรีบหนี",
      lastPeriod: "ครั้งสุดท้าย! ไม่มีที่ให้หนีแล้ว|อย่าหมดเวลาก่อนผมได้ฆ่านะ",
      aiByo: "เวลาน้อยไม่เป็นไร การบุกไม่ต้องคิดนาน|บุกเร็วขึ้นอีก!",
      mid: "เทนเง็นคือหัวใจของกระดาน|โทระชอบนั่งเฝ้ามุม ผมชอบยึดกลาง|หมากที่ไม่บุกคือหมากที่ตายแล้ว",
      win: "บอกแล้วว่าไม่มีใครหนีพ้น|อีกหนึ่งชัยชนะของเทนเง็น",
      lose: "แค่ครั้งนี้เท่านั้น ครั้งหน้าไม่รอดแน่|ฮึ่ม! อย่าบอกโทระนะว่าผมแพ้|ผมจะกลับมาแก้แค้น",
      resigned: "หนีไปแล้วเหรอ ฮ่าๆ|ยอมก่อนโดนฆ่า ฉลาดดี",
      timeoutWin: "เวลาก็ฆ่าคุณได้เหมือนกันนะ|หมดเวลาก็ตายเหมือนกัน",
      giveUp: "ฮึ่ม… ผมยอม แต่ไม่ลืมแน่|ครั้งนี้ยอมให้ ครั้งหน้าไม่มีแน่"
    },
    tora: {
      hello: "บุกมาเลย ผมรับได้หมด|มุมทั้งสี่ของผมพร้อมแล้ว|ถ้าคุณบุกเหมือนเว่ยฉี ผมรู้วิธีรับ",
      goodMove: "ตานี้แทงเข้ามาลึก|หึ ลองเจาะป้อมดูสิ|ตาดี แต่ผมยังไม่สะเทือน",
      badMove: "ตรงนั้นมีช่องโหว่นะ|บุกเกินไปแล้ว|ขอบคุณที่ส่งหมากมาให้ผมจับ",
      caught: "เสีย {n} เม็ด แต่ป้อมยังอยู่|แค่รอยขีดข่วน|ผนังร้าวนิดหน่อย ซ่อมได้",
      capture: "เข้ามาในป้อมก็ไม่ได้ออกไป {n} เม็ด|บุกเข้ามาก็ตายในเขตผม|ผมบอกแล้วว่ารับได้",
      ahead: "ป้อมของผมไม่มีวันแตก|ยิ่งบุกยิ่งเสีย|ค่อยๆ เก็บแต้มไปเรื่อยๆ",
      behind: "ยังรับไหว|อดทนไว้ โอกาสต้องมา|ผมต้องรักษาสิ่งที่มีก่อน",
      comeback: "รับไว้ แล้วโต้กลับ นี่แหละวิถีผม|อดทนจนได้ผล",
      humanPass: "ผ่าน? งั้นผมจะปิดประตูให้เรียบร้อย|ได้เลย",
      aiPass: "เขตแดนผมปิดหมดแล้ว ผ่าน|ไม่มีรอยรั่ว ผ่าน",
      ko: "โคก็ต้องรอจังหวะ เหมือนการตั้งรับ|ห้ามเก็บทันที ไปขู่ที่อื่นก่อน",
      hint: "ถามคำใบ้ไปก็ยังหาช่องไม่เจอหรอก|ใช้ทุกทางที่มีเถอะ",
      slow: "ผมรอได้ การรอคือจุดแข็งผม|คิดให้ดี เพราะผมไม่ปล่อยช่องให้",
      byoyomi: "เวลาหมดแล้ว รีบอาจพลาดนะ|ใจเย็นแม้เวลาน้อย",
      lastPeriod: "ครั้งสุดท้ายแล้ว อย่าทิ้งเกมเพราะนาฬิกา|ระวังนะ ครั้งสุดท้าย",
      aiByo: "เวลาน้อย แต่ป้อมไม่ต้องคิดนาน|ตั้งรับไม่ต้องรีบ",
      mid: "สามสามคือบ้านที่ปลอดภัยที่สุด|เว่ยฉีชอบบุกกลาง ผมชอบนับแต้ม|กำแพงที่ดีไม่ต้องสูง แค่ไม่มีรู",
      win: "การป้องกันที่ดีที่สุดคือการไม่ให้โอกาส|ป้อมยังไม่แตก ขอบคุณที่เล่น",
      lose: "ทะลวงป้อมผมได้... ไม่เลว|ต้องกลับไปสร้างกำแพงใหม่|อย่าเล่าให้เว่ยฉีฟังนะ",
      resigned: "ยอมก่อนเจาะป้อมได้ ฉลาดดี|ไว้มาลองใหม่",
      timeoutWin: "เวลาก็เป็นกำแพงอย่างหนึ่ง|หมดเวลาแล้ว น่าเสียดาย",
      giveUp: "ป้อมแตกแล้ว ผมยอม|ไม่มีอะไรให้รักษาแล้ว ยอมครับ"
    },
    kan: {
      hello: "เล่นเต็มที่นะครับ|สวัสดีครับ วันนี้มาเล่นกันสนุกๆ|ถ้าสงสัยตาไหน จบเกมแล้วมาดูย้อนหลังกันได้ครับ",
      goodMove: "ตานี้ดีครับ ตรงจุดเลย|อ่านเกมได้ดีครับ|ตาแบบนี้นักกีฬาทีมชาติยังเดินกันครับ",
      badMove: "ตานี้ช้าไปจังหวะนึงครับ|ลองย้อนดูตานี้หลังจบเกมนะครับ|ผมว่าตานี้มีที่ใหญ่กว่าครับ",
      caught: "เสีย {n} เม็ด ผมประเมินผิดครับ|ตานี้คุณอ่านไกลกว่าผม|เสียหน้าหมาก แต่ยังมีงานต่อครับ",
      capture: "ขอเก็บ {n} เม็ดนะครับ|กลุ่มนั้นลมไม่พอครับ|ตรงนี้ต้องระวังลมหายใจด้วยนะครับ",
      ahead: "เกมนี้อยู่ในมือแล้ว|ผมได้เปรียบอยู่ แต่ยังไม่ประมาทครับ|ค่อยๆ ปิดเกมครับ",
      behind: "ยังมีทางสู้|ต้องหาจุดพลิกเกมแล้ว|คุณเล่นแน่นมากครับ",
      comeback: "เกมพลิกแล้วครับ ห้ามประมาทจนวินาทีสุดท้าย|โกะไม่จบจนกว่าจะนับแต้มครับ",
      humanPass: "ผ่านนะครับ ผมขอตรวจเขตก่อน|รับทราบครับ",
      aiPass: "ผมว่าปิดเขตครบแล้วครับ ผ่าน|ผ่านครับ ถ้าตรงไหนยังไม่จบเล่นต่อได้นะครับ",
      ko: "เป็นโคครับ ต้องเดินที่อื่นก่อนหนึ่งตา|หาที่ขู่ดีๆ แล้วค่อยกลับมาเก็บครับ",
      hint: "ใช้คำแนะนำเพื่อเรียนรู้ดีครับ|ลองคิดเองก่อนด้วยนะครับ จะเก่งเร็วขึ้น",
      slow: "ไม่ต้องรีบครับ คิดให้รอบคอบ|ตาสำคัญควรใช้เวลาครับ",
      byoyomi: "เข้าเบียวโยมิแล้วครับ เดินตามสัญชาตญาณได้เลย|เหลือ 30 วิต่อตาแล้วครับ",
      lastPeriod: "เหลือครั้งสุดท้ายแล้วครับ ระวังนะครับ|อย่าเสียเกมเพราะเวลานะครับ",
      aiByo: "ผมเข้าเบียวโยมิแล้วครับ|เวลาผมเหลือน้อย ต้องเชื่อสัญชาตญาณแล้ว",
      mid: "กลางเกมแบบนี้ต้องดูภาพรวมครับ|ทีมชาติซ้อมอ่านเกมวันละหลายชั่วโมงครับ|ลองนับแต้มคร่าวๆ ระหว่างเกมดูครับ ช่วยได้เยอะ",
      win: "ขอบคุณที่เล่นด้วยครับ ฝึกต่อไปนะ|เกมดีครับ ลองดูย้อนหลังจุดพลิกเกมนะครับ",
      lose: "ฝีมือระดับทีมชาติเลยนะครับ|คุณเก่งมากครับ สนใจลงแข่งไหมครับ|ผมได้เรียนรู้จากเกมนี้เยอะครับ",
      resigned: "ขอบคุณครับ ยอมแพ้ก็เป็นมารยาทที่ดีครับ|เกมนี้มีบทเรียนดีๆ ลองดูย้อนหลังนะครับ",
      timeoutWin: "เสียดายครับ ครั้งหน้าลองแบ่งเวลาดีๆ นะครับ|การบริหารเวลาก็สำคัญครับ",
      giveUp: "ผมยอมครับ คุณเล่นดีมาก|ยอมแพ้ครับ ฝีมือดีจริงๆ"
    },
    todo: {
      hello: "...เชิญ|กระดานรออยู่|ข้าจะดูว่าเจ้ามาไกลแค่ไหน",
      goodMove: "หืม|ดี|ตานี้… น่าสนใจ",
      badMove: "...|ช้าไป|ตานั้นมีราคา",
      caught: "{n} เม็ด… ข้ายอมให้|อืม|ข้ามองข้ามไป",
      capture: "{n} เม็ด|ตามที่เห็น|หมดลมแล้ว",
      ahead: "จบแล้ว|ทางออกไม่มี|ข้าเห็นตอนจบแล้ว",
      behind: "อืม|น่าสนใจ|เจ้าเก่งขึ้น",
      comeback: "เกมยังไม่จบ|ข้ายังอยู่",
      humanPass: "ผ่าน|...",
      aiPass: "ผ่าน|จบแล้ว",
      ko: "โค|อดทน",
      hint: "ถามเครื่องจักรรึ|ตาที่ได้มาง่าย ลืมง่าย",
      slow: "ข้ารอได้|เวลาเป็นของเจ้า",
      byoyomi: "สามสิบวินาที|เวลาหมดแล้ว",
      lastPeriod: "ครั้งสุดท้าย|ระวัง",
      aiByo: "...|เวลาไม่สำคัญ",
      mid: "กระดานพูดได้ ถ้าเจ้าฟังเป็น|ทุกหินมีที่ของมัน|...",
      win: "ยังต้องฝึกอีกมาก|อีกสิบปีค่อยมาใหม่",
      lose: "เจ้าคือผู้ที่ข้ารอคอยมานาน|ข้าแพ้… ดี|ในที่สุด",
      resigned: "รู้จักยอมแพ้ ก็คือรู้จักเกม|ดี",
      timeoutWin: "เวลาไม่รอใคร|...",
      giveUp: "ข้ายอม|...ยอมแพ้"
    },
    hikaru: {
      hello: "มาวัดฝีมือกันหน่อย ทุกตาที่เดินจะถูกให้คะแนนนะ|เล่นให้เต็มที่ ผลสอบจะบอกระดับคร่าวๆ ให้",
      goodMove: "ตานี้ดีมาก|อ่านขาดเลยนี่|นั่นแหละตาที่ผมรออยู่",
      badMove: "ลองคิดอีกทีสิ ตานี้มีทางที่ดีกว่า|อืม จดไว้ก่อน ดูตอนจบนะ|ตานี้เสียไปเยอะเลย",
      caught: "โดนเข้าแล้ว {n} เม็ด|อ่านได้ดี",
      capture: "ขอ {n} เม็ดนะ|ต้องระวังลมหายใจด้วย",
      ahead: "ยังตามทันนะ ลองหาจุดที่ใหญ่ที่สุดดู|อย่าเพิ่งท้อ",
      behind: "เก่งนี่|ผมต้องตั้งใจแล้ว",
      comeback: "กลับมาได้ดี",
      humanPass: "ผ่านแล้วใช่ไหม งั้นจบการสอบ",
      aiPass: "ผมผ่าน",
      ko: "โคแล้ว ต้องหาตาบังคับก่อนนะ",
      hint: "ช่วงสอบใช้คำแนะนำไม่ได้นะ",
      slow: "คิดให้ละเอียด ไม่ต้องรีบ",
      byoyomi: "เบียวโยมิแล้ว ระวังเวลา",
      lastPeriod: "ครั้งสุดท้ายแล้วนะ",
      aiByo: "ขอคิดหน่อย",
      mid: "ตาที่ไม่ใช่ตาที่ดีที่สุด อาจเป็นตาทดสอบนะ|ดูทั้งกระดานก่อนเดิน",
      win: "จบการสอบ ดูผลด้านล่างได้เลย",
      lose: "จบการสอบ ดูผลด้านล่างได้เลย",
      resigned: "จบการสอบ ดูผลด้านล่างได้เลย",
      timeoutWin: "หมดเวลาแล้ว จบการสอบ",
      giveUp: "ผมยอมแพ้ จบการสอบ ดูผลด้านล่างได้เลย"
    }
  };
  // Placement-test calibration: each character's average move score against Hikaru (Best 0, Good 1, Normal 2, Bad 3,
  // divided by the graded moves; lower is stronger), measured 2026-10-29 against Hikaru's even-score play.
  const EXAM_CALIB = [{ id: "mek", avg: 1.39 }, { id: "win", avg: 1.01 }, { id: "yuto", avg: 0.43 }, { id: "chris", avg: 0.27 }, { id: "tora", avg: 0.13 }, { id: "kan", avg: 0.03 }];
  // Rank bands set by the site owner (2026-10-29) on top of those measurements: about two steps easier than the
  // characters' own levels, narrow steps through 13-7 kyu and 3-2 kyu, clear gaps between 1 kyu and
  // 1 dan and between 2 and 3 dan, wider jumps to 3 and 4 dan, and 5 dan hard to reach. Each entry: a score below "under" reads as "rank" (1 kyu = 0, 15 kyu = -14, 1 dan = 1, ...).
  const EXAM_BANDS = [
    [0.10, 5], [0.18, 4], [0.24, 3], [0.30, 2], [0.33, 1], [0.45, 0], [0.49, -1], [0.54, -2], [0.70, -3], [0.88, -4],
    [1.04, -5], [1.08, -6], [1.12, -7], [1.16, -8], [1.20, -9], [1.24, -10], [1.28, -11], [Infinity, -12]
  ];
  const GRADE_LABEL = { best: "Best", good: "Good", normal: "Normal", bad: "Bad" };
  function rankName(v) {
    if (v >= 5) return "5 ดั้งขึ้นไป";
    const r = Math.round(v);
    return r >= 1 ? r + " ดั้ง" : (1 - r) + " คิว";
  }
  function estimateRank(score) { return EXAM_BANDS.find(([under]) => score < under)[1]; }
  function avatarSVG(c, cls) { return cls ? `<img class="${cls}" src="chars/${c.id}.jpg" alt="${c.name}" width="480" height="480">` : `<img class="av" src="chars/${c.id}_face.jpg" alt="" width="160" height="160">`; }
  // a plain silhouette for the human player until real profiles exist
  const YOU_AV = `<img class="av" alt="" width="160" height="160" src="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="#3b6a73"/><circle cx="32" cy="25" r="11" fill="#a9c3c2"/><path d="M11 60c2-12 11-19 21-19s19 7 21 19z" fill="#a9c3c2"/></svg>')}">`;
  const settings = { size: load("size", 19), human: load("human", BLACK), char: load("char8", 4) };
  // the pick is saved by id so adding a character doesn't move anyone's choice
  const savedId = load("charId", null), byId = CHARS.findIndex(c => c.id === savedId);
  // an old index-only save predates Joker (inserted at 3) and the tutorial book (inserted at 0)
  if (byId >= 0) settings.char = byId; else if (savedId === null) settings.char += settings.char >= 3 ? 2 : 1;
  if (!CHARS[settings.char]) settings.char = 5;
  const KOMI = 7.5;
  let n, board, history, human, ai, thinking = false, think = null, hint = null, hover = null, pending = null, lastPtr = "mouse";
  let winBlack = 0.5, leadBlack = 0, over = null, scoring = null, gameChar = 6, hopeless = 0, examBehind = 0;
  let reviewAt = null, reviewBoard = null, exam = null, ponder = null; // after the game: which move the board shows (null = final position)
  let AI = null, gen = 0, engineReady = false;

  // ---------- load network ----------
  // weights as raw float16 (.bin), or base64 text where binary files can't be served
  async function loadWeights() {
    try {
      const r = await fetch(MODEL + ".bin");
      if (r.ok && !(r.headers.get("content-type") || "").includes("text/html")) return await r.arrayBuffer();
    } catch (e) {}
    const r = await fetch(MODEL + ".b64.txt");
    if (!r.ok) throw new Error("model weights " + r.status);
    const bin = atob((await r.text()).trim()), out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  }
  // measured at startup; on a slow device searches send smaller batches so they stop close to their time limit
  let evalMs = 50, checkEngine = null, engineRetries = 0;
  async function initEngine() {
    const el = { set textContent(t) { $("engine").textContent = t; $("engineHome").textContent = t; } };
    try {
      if (typeof tf === "undefined") throw new Error("โหลด TensorFlow.js ไม่สำเร็จ");
      let backend = "cpu";
      try { if (await tf.setBackend("webgl")) backend = "webgl"; } catch (e) {}
      if (backend !== "webgl") await tf.setBackend("cpu");
      await tf.ready();
      el.textContent = "กำลังดาวน์โหลดสมอง AI (6 MB)…";
      const [meta, buf] = await Promise.all([
        fetch(MODEL + ".json").then(r => { if (!r.ok) throw new Error("model json " + r.status); return r.json(); }),
        loadWeights()
      ]);
      let net = GoTFNet(tf).build(meta, buf);
      AI = GoNNAI(E, F, net);
      // some phone GPUs compute the network wrongly; after black D16 the reference answer is a corner (Q4/Q16/D4) at ~49%
      const sane = async () => {
        let ev; try { ev = (await AI.evalMany(19, [[new Board(19).pt(3, 3)]], KOMI))[0]; } catch (e) { return false; }
        let bi = 0; for (let i = 1; i < 361; i++) if (ev.policy[i] > ev.policy[bi]) bi = i;
        return [72, 300, 288].includes(bi) && Math.abs(ev.win / (ev.win + ev.loss) - 0.494) < 0.06;
      };
      // positions never evaluated before, so the evaluation cache cannot answer them
      let benchRow = 4;
      const bench = async () => {
        const pos = () => Array.from({ length: 8 }, (_, i) => [new Board(19).pt(i + 2, benchRow)]);
        await AI.evalMany(19, pos(), KOMI); benchRow++;
        const t = performance.now(); await AI.evalMany(19, pos(), KOMI); benchRow++;
        return (performance.now() - t) / 8;
      };
      // without a working GPU, WebAssembly is many times faster than the plain JavaScript backend
      const useWasm = async () => {
        try {
          if (!tf.wasm) return false;
          tf.wasm.setWasmPaths(new URL("./", location.href).href);
          if (!(await tf.setBackend("wasm"))) return false;
          await tf.ready(); backend = "wasm";
          net = GoTFNet(tf).build(meta, buf); AI = GoNNAI(E, F, net);
          return true;
        } catch (e) { console.warn("wasm backend failed", e); return false; }
      };
      const forced = new URLSearchParams(location.search).get("backend");
      if (backend === "webgl" && (forced === "wasm" || !(await sane()))) {
        console.warn("webgl results look wrong, trying wasm");
        if (!(await useWasm()) || !(await sane())) {
          await tf.setBackend("cpu"); await tf.ready(); backend = "cpu";
          net = GoTFNet(tf).build(meta, buf); AI = GoNNAI(E, F, net);
        }
      } else if (backend === "cpu" && (await useWasm()) && !(await sane())) {
        await tf.setBackend("cpu"); await tf.ready(); backend = "cpu";
        net = GoTFNet(tf).build(meta, buf); AI = GoNNAI(E, F, net);
      }
      else if (forced !== "webgl") {
        // a weak GPU can be slower than WebAssembly: time both and keep the faster
        const glMs = await bench();
        const ok = glMs > 120 && (await useWasm()) && (await sane()), wMs = ok ? await bench() : 0;
        console.log("bench ms per eval: webgl", Math.round(glMs), "wasm", ok ? Math.round(wMs) : "n/a");
        if (ok && wMs < glMs * 0.8) {}
        else if (backend === "wasm") { await tf.setBackend("webgl"); await tf.ready(); backend = "webgl"; net = GoTFNet(tf).build(meta, buf); AI = GoNNAI(E, F, net); }
      }
      // the GPU can stop computing correctly mid-game (a phone app switch can lose the WebGL context);
      // checkEngine re-runs the sanity test, and if it fails rebuilds the network on WebAssembly or the CPU
      checkEngine = async () => {
        AI.clearCache();
        if (await sane()) return "ok";
        console.warn("network output went wrong on", backend);
        if (backend !== "wasm" && (await useWasm()) && (await sane())) { label(); return "rebuilt"; }
        await tf.setBackend("cpu"); await tf.ready(); backend = "cpu";
        net = GoTFNet(tf).build(meta, buf); AI = GoNNAI(E, F, net);
        label();
        return (await sane()) ? "rebuilt" : "broken";
      };
      const label = () => { el.textContent = `สมอง AI พร้อม · KataGo b10 · ${backend === "webgl" ? "ใช้การ์ดจอ" : backend === "wasm" ? "ใช้ CPU (WebAssembly)" : "ใช้ CPU (ช้า)"} · ~${evalMs} ms ต่อการประเมิน`; };
      el.textContent = "กำลังอุ่นเครื่อง AI…";
      const t0 = performance.now();
      await AI.evalMany(19, [[], [E.PASS]], KOMI);
      const t1 = performance.now();
      await AI.evalMany(19, Array.from({ length: 8 }, (_, i) => [new Board(19).pt(i, 3)]), KOMI);
      const ms = Math.round((performance.now() - t1) / 8);
      evalMs = ms;
      engineReady = true;
      label();
      console.log("warmup", Math.round(t1 - t0), "ms; per eval", ms, "ms");
      if (board) { render(); maybeAI(); startPonder(); }
    } catch (e) {
      console.error(e);
      el.textContent = "โหลดสมอง AI ไม่สำเร็จ: " + e.message;
    }
  }

  // ---------- character speech ----------
  // pri: a line about this move only replaces one said on the same move if it matters as much;
  // gap: skip unless the character has been quiet for that many moves; once: a kind is used once a game
  let saidKinds = new Set(), saidLines = new Set(), spokeAt = -99, spokePri = 0;
  function speak(kind, o = {}) {
    const at = history.length, pri = o.pri || 0;
    if (!o.force) {
      if (o.once && saidKinds.has(kind)) return false;
      if (o.gap && at - spokeAt < o.gap) return false;
      if (at === spokeAt && pri < spokePri) return false;
    }
    const c = CHARS[gameChar], all = (TALK[c.id][kind] || c.say[kind] || "").split("|").filter(Boolean);
    if (!all.length) return false;
    const fresh = all.filter(l => !saidLines.has(l)), list = fresh.length ? fresh : all;
    const line = list[(Math.random() * list.length) | 0];
    saidKinds.add(kind); saidLines.add(line); spokeAt = at; spokePri = pri;
    const q = $("quote");
    q.hidden = false;
    q.innerHTML = `${avatarSVG(c)}<span><b>${c.name}</b>${line.replace("{n}", o.n)}</span>`;
    q.classList.remove("say"); void q.offsetWidth; q.classList.add("say");
    return true;
  }
  // how good the player's last move was: their winning chance from the raw network before and after it
  let lowestAI = 1;
  async function judgeHumanMove() {
    const last = history[history.length - 1];
    if (last === PASS || history.length < 8) return;
    let before, after;
    try { [before, after] = await AI.evalMany(n, [history.slice(0, -1), history.slice()], KOMI); } catch (e) { return; }
    const was = before.win / (before.win + before.loss), now = after.loss / (after.win + after.loss);
    if (was < 0.05 || was > 0.95) return;
    if (now - was >= 0.15) speak("goodMove", { pri: 2 });
    else if (now - was <= -0.15) speak("badMove", { pri: 2 });
  }
  function reactTo(res) {
    // res.winrate is for the AI, the player to move when it searched
    const was = lowestAI; lowestAI = Math.min(lowestAI, res.winrate);
    if (history.length < 20) return;
    if (was < 0.25 && res.winrate > 0.75 && speak("comeback", { once: true, pri: 1 })) return;
    if (res.winrate > 0.85) speak("ahead", { gap: 14 });
    else if (res.winrate < 0.2) speak("behind", { gap: 14 });
    else if (history.length >= 40 && Math.random() < 0.08) speak("mid", { gap: 16 });
  }

  // ---------- clocks: 30 min main time, then byo-yomi 30 s x 3, in every mode ----------
  const PERIODS = 3, MAIN_S = 1800, BYO_S = 30;
  let clocks = null, lastTick = 0, humanSince = 0, slowTold = false;
  const freshClock = () => ({ main: MAIN_S, byo: BYO_S, per: PERIODS });
  const clockLive = () => board && engineReady && !over && !scoring;
  function tick() {
    const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
    if (!clocks || !clockLive()) return;
    const c = clocks[board.toPlay];
    let t = dt;
    if (c.main > 0) { const use = Math.min(c.main, t); c.main -= use; t -= use; }
    if (t > 0) {
      if (c.byo === BYO_S && c.per === PERIODS) speak(board.toPlay === human ? "byoyomi" : "aiByo", { once: true, pri: 1 });
      c.byo -= t;
      while (c.byo <= 0 && c.per > 0) { c.per--; if (c.per > 0) c.byo += BYO_S; }
      if (c.per === 0) { c.byo = 0; timeout(board.toPlay); return; }
      if (c.per === 1 && board.toPlay === human) speak("lastPeriod", { once: true, pri: 1 });
    }
    if (board.toPlay === human && !slowTold && now - humanSince > 90000) { slowTold = true; speak("slow", { gap: 20 }); }
    renderClocks();
  }
  // after a move the mover's byo-yomi period starts fresh
  function clockMoved(color) { if (clocks && clocks[color].main <= 0) clocks[color].byo = BYO_S; }
  function timeout(color) {
    cancelAI();
    const name = CHARS[gameChar].name;
    over = color === human ? { text: `คุณหมดเวลา ${name} ชนะ`, detail: "ใช้เบียวโยมิครบ 3 ครั้งแล้ว" }
      : { text: `${name} หมดเวลา คุณชนะ!`, detail: "" };
    speak(color === human ? "timeoutWin" : "lose", { force: true }); reportEnd(color !== human, "timeout"); render();
  }
  // how long the AI may think this move without risking its clock; no character thinks much past 10 s
  // (characters with only a visit count get 9 s as a ceiling, which matters only on slow devices)
  function aiBudget(base) {
    const c = clocks[ai];
    const limit = c.main > 0 ? Math.max(c.main * 1000 / 25, 6000) : (BYO_S - 3.5) * 1000;
    return Math.min(base || 1e9, limit);
  }
  const fmt = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  function renderClocks() {
    if (!clocks) return;
    for (const [col, k] of [[BLACK, "B"], [WHITE, "W"]]) {
      const c = clocks[col], inByo = c.main <= 0;
      $("clk" + k).textContent = inByo ? fmt(c.byo) : fmt(c.main);
      $("by" + k).textContent = c.per === 0 ? "หมดเวลา" : inByo ? `เบียวโยมิ เหลือ ${c.per} ครั้ง` : `+ ${PERIODS}×${BYO_S} วิ`;
      $("p" + k).classList.toggle("low", inByo ? c.byo <= 5 : c.main <= 30);
      $("p" + k).classList.toggle("out", c.per === 0);
    }
  }
  setInterval(tick, 200);

  // ---------- anonymous play statistics, stored by the site's Worker at /api/event ----------
  const host = location.hostname;
  const STATS_URL = /workers\.dev$|^localhost$|^127\.0\.0\.1$/.test(host) ? "/api/event"
    : /github\.io$/.test(host) ? "https://battle-baduk.battlebaduk.workers.dev/api/event" : null;
  const rid = () => (Math.random().toString(36).slice(2, 10) + Date.now().toString(36)).replace(/[^a-z0-9]/g, "");
  let playerId = load("pid", null);
  if (!playerId) { playerId = rid(); save("pid", playerId); }
  let gameId = null, gameReported = false;
  function track(ev) {
    if (!STATS_URL || !gameId) return;
    try {
      const body = JSON.stringify(Object.assign({ player: playerId, game: gameId, char: CHARS[gameChar].id }, ev));
      if (!(navigator.sendBeacon && navigator.sendBeacon(STATS_URL, new Blob([body], { type: "text/plain" }))))
        fetch(STATS_URL, { method: "POST", body, keepalive: true }).catch(() => {});
    } catch (e) {}
  }
  // the site owner can cancel every game in progress from /admin; open games poll the cancel number and stop when it changes
  const CANCEL_URL = STATS_URL && STATS_URL.replace(/event$/, "cancel");
  let cancelSeen = null;
  async function checkCancel() {
    if (!CANCEL_URL) return;
    try {
      const n = (await (await fetch(CANCEL_URL, { cache: "no-store" })).json()).n;
      if (typeof n !== "number") return;
      if (cancelSeen !== null && n > cancelSeen && board && !over && !scoring && history.length) cancelGame();
      cancelSeen = n;
    } catch (e) {}
  }
  function cancelGame() {
    cancelAI(); gameReported = true; // the server has already ended this game
    over = { text: "ยกเลิก ขออภัยด้วยครับ", detail: "ผู้ดูแลยกเลิกเกมนี้ชั่วคราว กด \"เล่นใหม่\" เพื่อเริ่มเกมใหม่ได้เลยครับ" };
    render();
  }
  checkCancel(); setInterval(checkCancel, 30000);
  function reportEnd(humanWon, how) {
    save("game", null);
    if (gameReported) return;
    gameReported = true;
    if (exam) { exam.how = how; exam.won = humanWon; }
    const ev = { type: "end", game: gameId, char: CHARS[gameChar].id, winner: humanWon ? "human" : "ai", how, moves: history.length, state: snapshot() };
    if (!exam) return track(ev);
    // the last move's grade may still be computing; the event keeps this game's id in case a new game starts meanwhile
    const ex = exam, len = history.length;
    grading.then(() => {
      const r = examResult(ex, len);
      track(Object.assign(ev, { exam: { graded: r.graded, notBest: Math.round(r.notBest * 10) / 10, score: Math.round(r.score * 1000) / 1000, rank: r.est === null ? null : Math.round(r.est * 10) / 10 } }));
    });
  }
  // the position as spectators on /watch see it, with the moves so far for stepping back through the game
  function snapshot() {
    let b = "";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = board.color[board.pt(x, y)]; b += c === BLACK ? "b" : c === WHITE ? "w" : "."; }
    const last = history.length ? history[history.length - 1] : PASS;
    const lastIdx = last === PASS ? -1 : (([x, y]) => y * n + x)(board.xy(last));
    const ck = c => [Math.round(c.main), c.per, Math.round(c.byo)];
    return { size: n, board: b, last: lastIdx, moveNo: history.length, toPlay: board.toPlay, human,
      caps: [board.caps[BLACK], board.caps[WHITE]], clocks: clocks ? [ck(clocks[BLACK]), ck(clocks[WHITE])] : null, winB: Math.round(winBlack * 100),
      leadB: Math.round(leadBlack * 10) / 10, moves: history.map(m => m === PASS ? -1 : (([x, y]) => y * n + x)(board.xy(m))) };
  }

  // ---------- game flow ----------
  function cancelAI() { gen++; thinking = false; think = null; }
  function newGame() {
    cancelAI();
    n = boardSize(); human = settings.human; ai = 3 - human; gameChar = settings.char;
    board = new Board(n); history = []; hint = null; pending = null; over = null; scoring = null; winBlack = 0.5; leadBlack = 0; reviewAt = null; reviewBoard = null;
    exam = CHARS[gameChar].exam ? { grades: [] } : null; ponder = null;
    $("sub").textContent = `กระดาน ${n}×${n} · กติกาจีน · โคมิ ${KOMI} · คู่ต่อสู้: ${CHARS[gameChar].name} (${CHARS[gameChar].rank} · ${STYLE[CHARS[gameChar].style].label})`;
    const ch = CHARS[gameChar];
    for (const [col, k] of [[BLACK, "B"], [WHITE, "W"]]) {
      const me = col === human;
      $("n" + k).textContent = me ? "คุณ" : ch.name;
      $("rk" + k).textContent = me ? "ผู้เล่น" : `${ch.rank} · ${ch.country}`;
      $("av" + k).innerHTML = me ? YOU_AV : avatarSVG(ch);
    }
    clocks = { [BLACK]: freshClock(), [WHITE]: freshClock() }; lastTick = performance.now(); renderClocks();
    saidKinds = new Set(); saidLines = new Set(); spokeAt = -99; lowestAI = 1; humanSince = performance.now();
    speak("hello", { force: true }); hopeless = 0; examBehind = 0;
    gameId = rid(); gameReported = false; track({ type: "start", size: n, color: human, state: snapshot() });
    saveGame();
    resize(); render(); maybeAI(); startPonder();
  }
  function replay() { board = new Board(n); for (const m of history) board.play(m); }
  // ---------- sound: a short wooden click, synthesised so no audio file is needed ----------
  let actx = null, soundOn = load("sound", true);
  function unlockAudio() {
    try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch (e) {}
  }
  function clack() {
    if (!actx || !soundOn) return;
    const t = actx.currentTime, len = Math.floor(actx.sampleRate * 0.09), buf = actx.createBuffer(1, len, actx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
    const src = actx.createBufferSource(); src.buffer = buf;
    const bp = actx.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 2200; bp.Q.value = 1.2;
    const ng = actx.createGain(); ng.gain.value = 0.9;
    src.connect(bp).connect(ng).connect(actx.destination);
    const o = actx.createOscillator(), og = actx.createGain();
    o.frequency.setValueAtTime(1100, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.05);
    og.gain.setValueAtTime(0.35, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    o.connect(og).connect(actx.destination);
    src.start(t); o.start(t); o.stop(t + 0.08);
  }
  // examiner reads the player's position while they think; that search grades the move they then make
  // grading the player's move runs after Hikaru has replied, while the player thinks, so it never delays Hikaru's move;
  // the next pondering search waits for it so the two do not share the GPU
  let grading = Promise.resolve();
  function startPonder() {
    if (!exam || !engineReady || over || scoring || board.toPlay !== human) return;
    const at = history.length, my = gen, ex = exam;
    const moves = history.slice(), stop = () => my !== gen || exam !== ex;
    const before = grading;
    ponder = { at, promise: (async () => {
      await before;
      const s = await AI.think(n, moves, KOMI, { visits: 400, timeMs: 10000, batch: 8, shouldStop: stop });
      const bestChild = s.move === PASS || stop() ? null : await AI.think(n, moves.concat([s.move]), KOMI, { visits: 100, timeMs: 5000, batch: 8, shouldStop: stop });
      return { s, bestChild };
    })() };
  }
  // points the player has been losing per move lately; Hikaru gives back about that much while ahead
  function examGive() {
    if (!exam) return 0;
    const gs = exam.grades.filter(Boolean).slice(-30);
    return gs.length < 5 ? 2 : gs.reduce((t, g) => t + Math.min(g.loss, 10), 0) / gs.length;
  }
  // the player is known to be weak: 20 graded moves or more and over 1.2 points lost per move lately (about 6 kyu and below
  // on the test characters; Uncle Win and Mek lose 1.5-4, Yuto and stronger mostly under 1)
  function examWeak() {
    if (!exam) return false;
    const gs = exam.grades.filter(Boolean);
    return gs.length >= 20 && examGive() > 1.2;
  }
  // takes what pondering found for the player's last move; the grade itself is computed by runGrade later
  function gradeJob() {
    const pm = history.length - 1, pre = ponder && ponder.at === pm ? ponder.promise : null;
    ponder = null;
    if (!exam || pm < 0 || history[pm] === PASS) return null;
    return { ex: exam, pm, base: history.slice(0, pm), played: history[pm], pre };
  }
  function runGrade(job) {
    if (!job) return;
    grading = grading.then(async () => {
      const pre = (job.pre && await job.pre) || { s: await AI.think(n, job.base, KOMI, { visits: 200, timeMs: 6000, batch: 8 }) };
      if (exam !== job.ex) return;
      const g = await AI.gradeWith(n, job.base, job.played, KOMI, pre.s, { childVisits: 100, bestChild: pre.bestChild });
      job.ex.grades[job.pm] = { loss: g.loss, best: g.best, cls: AI.gradeOf(g) };
      if (ended()) render();
    }).catch(e => console.error(e));
  }
  function playMove(p) {
    if (p !== PASS) clack();
    const mover = board.toPlay, caps = board.caps[mover];
    clockMoved(mover);
    board.play(p); history.push(p); hint = null; pending = null;
    track({ type: "move", state: snapshot() });
    const took = board.caps[mover] - caps;
    if (board.passes >= 2) startScoring();
    else if (p === PASS) speak(mover === human ? "humanPass" : "aiPass", { pri: 3, gap: 8 });
    else if (took) speak(mover === human ? "caught" : "capture", { n: took, pri: took >= 3 ? 3 : 1 });
    render();
    saveGame();
    if (!over && !scoring) { if (board.toPlay === human) { humanSince = performance.now(); slowTold = false; } maybeAI(); startPonder(); }
  }
  // the game in progress survives a page refresh: it is kept in localStorage until it ends or the player leaves it
  function saveGame() {
    if (!board || over || scoring) { save("game", null); return; }
    save("game", { char: CHARS[gameChar].id, n, human, history, clocks, gameId, grades: exam ? exam.grades : null, at: Date.now() });
  }
  function resumeGame(g) {
    const i = CHARS.findIndex(c => c.id === g.char);
    if (i < 0 || !Array.isArray(g.history) || ![9, 13, 19].includes(g.n)) return false;
    cancelAI();
    n = g.n; human = g.human === WHITE ? WHITE : BLACK; ai = 3 - human; gameChar = settings.char = i;
    board = new Board(n); history = []; hint = null; pending = null; over = null; scoring = null; winBlack = 0.5; leadBlack = 0; reviewAt = null; reviewBoard = null;
    try { for (const m of g.history) { if (m !== PASS && !board.isLegal(m, board.toPlay)) throw 0; board.play(m); history.push(m); } } catch (e) { return false; }
    if (board.passes >= 2) return false;
    exam = CHARS[gameChar].exam ? { grades: Array.isArray(g.grades) ? g.grades : [] } : null; ponder = null;
    const ch = CHARS[gameChar];
    $("sub").textContent = `กระดาน ${n}×${n} · กติกาจีน · โคมิ ${KOMI} · คู่ต่อสู้: ${ch.name} (${ch.rank} · ${STYLE[ch.style].label})`;
    for (const [col, k] of [[BLACK, "B"], [WHITE, "W"]]) {
      const me = col === human;
      $("n" + k).textContent = me ? "คุณ" : ch.name;
      $("rk" + k).textContent = me ? "ผู้เล่น" : `${ch.rank} · ${ch.country}`;
      $("av" + k).innerHTML = me ? YOU_AV : avatarSVG(ch);
    }
    clocks = g.clocks && g.clocks[BLACK] && g.clocks[WHITE] ? g.clocks : { [BLACK]: freshClock(), [WHITE]: freshClock() };
    lastTick = performance.now();
    saidKinds = new Set(); saidLines = new Set(); spokeAt = -99; lowestAI = 1; humanSince = performance.now(); hopeless = 0; examBehind = 0;
    gameId = g.gameId || rid(); gameReported = false;
    $("home").hidden = true; $("game").hidden = false; document.body.classList.remove("arcade"); document.body.classList.add("playing");
    resize(); render(); maybeAI(); startPonder();
    return true;
  }
  function setEval(res) {
    // res values are for the player to move at the searched position
    const forBlack = res.pla === BLACK;
    winBlack = forBlack ? res.winrate : 1 - res.winrate;
    leadBlack = forBlack ? res.lead : -res.lead;
  }
  // signature openings: Weiqi takes tengen (or attaches to it), Tora takes 3-3 in every empty corner
  function openingMove() {
    const ch = CHARS[gameChar];
    if (!ch.opening || history.length >= 80) return null; // an opening book only for the opening, never in the endgame
    for (const p of board.pts) if (board.color[p] === ai && board.libs(board.head[p], 2) === 1) return null; // a group in atari comes first
    const ok = p => board.color[p] === EMPTY && board.isLegal(p, ai);
    if (ch.opening === "tengen") {
      if (history.some((m, i) => (i % 2 === 0 ? BLACK : WHITE) === ai)) return null;
      const c = (n - 1) / 2, t = board.pt(c, c);
      if (ok(t)) return t;
      const near = board.dirs.map(d => t + d).filter(ok);
      return near.length ? near[(Math.random() * near.length) | 0] : null;
    }
    if (ch.opening === "raid") return raidMove();
    if (ch.opening === "33" || ch.opening === "corners") {
      // a corner counts as free while its 6x6 area is empty; "corners" picks 4-4, 3-4 or 3-3 there
      const free = [];
      for (const [cx, cy] of [[0, 0], [n - 6, 0], [0, n - 6], [n - 6, n - 6]]) {
        let empty = true;
        for (let y = cy; y < cy + 6 && empty; y++) for (let x = cx; x < cx + 6; x++) if (board.color[board.pt(x, y)] !== EMPTY) { empty = false; break; }
        const spots = ch.opening === "33" ? [[2, 2]] : [[3, 3], [3, 3], [2, 3], [3, 2], [2, 2]];
        const [a, b] = spots[(Math.random() * spots.length) | 0];
        const p = board.pt(cx ? n - 1 - a : a, cy ? n - 1 - b : b);
        if (empty && ok(p)) free.push(p);
      }
      return free.length ? free[(Math.random() * free.length) | 0] : null;
    }
    return null;
  }
  // Joker never takes an empty corner of his own: early on he approaches or invades each corner the opponent holds,
  // and with nothing to attack yet he opens on the side or in the centre
  function raidMove() {
    if (history.length >= Math.round(n * n / 9) || n < 13) return null;
    const ok = p => board.color[p] === EMPTY && board.isLegal(p, ai) && board.dirs.every(d => board.color[p + d] === EMPTY);
    const at = (cx, cy, a, b) => board.pt(cx ? n - 1 - a : a, cy ? n - 1 - b : b);
    const raids = [];
    for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      // a corner is a target when the opponent has a stone on its 3rd-5th lines and we have nothing within 7 lines of it
      let theirs = null, mine = false;
      for (let a = 0; a < 7; a++) for (let b = 0; b < 7; b++) {
        const c = board.color[at(cx, cy, a, b)];
        if (c === ai) mine = true;
        else if (c === human && a >= 2 && b >= 2 && a <= 4 && b <= 4) theirs = [a, b];
      }
      if (!theirs || mine) continue;
      const [a, b] = theirs, cand = [];
      if (a + b >= 5) cand.push([2, 2]); // 3-3 invasion under a 4-4 or a high stone
      for (const [da, db] of [[2, -1], [-1, 2], [3, -1], [-1, 3], [2, 0], [0, 2], [1, -2], [-2, 1]]) {
        const x = a + da, y = b + db;
        if (x >= 2 && y >= 2 && x <= 5 && y <= 5 && Math.min(x, y) <= 3) cand.push([x, y]);
      }
      for (const [x, y] of cand) { const p = at(cx, cy, x, y); if (ok(p)) raids.push(p); }
    }
    if (raids.length) return raids[(Math.random() * raids.length) | 0];
    if (history.some((m, i) => (i % 2 === 0 ? BLACK : WHITE) === ai)) return null;
    // first stone with nothing to attack: a side star point or near tengen, never a corner
    const c = (n - 1) / 2, odd = [];
    for (const [x, y] of [[3, c], [c, 3], [n - 4, c], [c, n - 4], [c, c], [c - 1, c + 1], [c + 2, c - 1], [4, c - 2], [c + 3, 4]]) {
      const p = board.pt(x, y); if (ok(p)) odd.push(p);
    }
    return odd.length ? odd[(Math.random() * odd.length) | 0] : null;
  }
  // "early" settings cover the opening (about 40 moves on 19x19): the network's first instinct there is standard joseki
  const searchFor = ch => ch.early && history.length < Math.round(n * n / 9) ? ch.early : ch.search;
  async function maybeAI() {
    if (!engineReady || over || scoring || board.toPlay !== ai || thinking) return;
    const my = ++gen; thinking = true; think = null; render();
    const moves = history.slice(), started = Date.now();
    // every character takes at least about a second before playing
    const minThink = async () => { const w = 1000 - (Date.now() - started); if (w > 0) await new Promise(r => setTimeout(r, w)); };
    await new Promise(r => setTimeout(r, 30));
    await judgeHumanMove();
    if (my !== gen) return;
    const job = exam ? gradeJob() : null;
    const book = exam ? null : openingMove();
    if (book !== null) {
      await minThink();
      if (my !== gen) return;
      thinking = false; playMove(book); return;
    }
    let res;
    try {
      res = await AI[exam ? "teach" : "think"](n, moves, KOMI, Object.assign({
        batch: evalMs > 300 ? 2 : 8, earlyStop: !(exam && (ai === BLACK ? leadBlack : -leadBlack) < 4), shouldStop: () => my !== gen,
        onProgress: s => { if (my === gen) { think = s; renderStatus(); drawBoard(); } }
      }, searchFor(CHARS[gameChar]), STYLE[CHARS[gameChar].style].opts, { timeMs: aiBudget(CHARS[gameChar].search.timeMs || 9000), hardMs: exam ? aiBudget(20000) : 0, give: examGive(), weak: examWeak() }));
      engineRetries = 0;
    } catch (e) {
      // the network stopped working (see evalMany): rebuild it and search again rather than play a broken answer,
      // which fills the board row by row from the top-left corner
      console.warn(e);
      const state = checkEngine ? await checkEngine() : "broken";
      if (my !== gen) return;
      thinking = false;
      if (state !== "broken" && ++engineRetries <= 2) return maybeAI();
      flash("สมอง AI ทำงานผิดพลาด กรุณารีเฟรชหน้าเว็บ"); render(); return;
    }
    if (my !== gen) return;
    if (history.length >= 100) {
      const { move: open, ev } = await openBorderMove();
      if (my !== gen) return;
      let m = res.move;
      if (m === PASS && exam && open !== null) m = open;
      else if (open === null && m !== PASS) {
        // every area is sealed: answer a pass with a pass, and never fill in a settled area (its own or the opponent's)
        const [x, y] = board.xy(m);
        if (history[history.length - 1] === PASS || Math.abs(ev.own[y * 19 + x]) > 0.75) m = PASS;
      }
      if (m !== res.move) res = Object.assign({}, res, { move: m });
    }
    await minThink();
    if (my !== gen) return;
    thinking = false; think = null;
    runGrade(job);
    setEval(res);
    reactTo(res);
    // resign once the player's winning chance has been 99% or more for 5 AI moves in a row
    hopeless = res.winrate <= 0.01 ? hopeless + 1 : 0;
    if (hopeless >= 5 && !exam) { // the examiner plays on so the player is graded to the end
      over = { text: `${CHARS[gameChar].name} ยอมแพ้ คุณชนะ!`, detail: "โอกาสชนะของคุณอยู่ที่ 99% ขึ้นไปติดกัน 5 ตา" }; speak("giveUp", { force: true }); reportEnd(true, "resign"); render(); return;
    }
    // the examiner resigns once the player leads by more than 30 points after move 100, twice in a row, and grades them
    const behind = ai === BLACK ? -leadBlack : leadBlack;
    examBehind = exam && history.length >= 100 && behind > 30 ? examBehind + 1 : 0;
    if (examBehind >= 2) {
      exam.margin = Math.round(behind);
      over = { text: `${CHARS[gameChar].name} ยอมแพ้ คุณชนะ!`, detail: `คุณนำอยู่ราว ${Math.round(behind)} แต้ม` }; speak("giveUp", { force: true }); reportEnd(true, "resign"); render(); return;
    }
    playMove(res.move);
  }

  async function startScoring() {
    scoring = { dead: new Set(), loading: true, terr: null };
    render();
    const my = gen;
    const ev = await AI.evaluate(n, history.slice(), KOMI);
    if (my !== gen || !scoring) return;
    const dead = new Set(), seen = new Set();
    const ownBlack = q => { const [x, y] = board.xy(q); const o = ev.own[y * 19 + x]; return ev.pla === BLACK ? o : -o; };
    for (const p of board.pts) {
      const c = board.color[p]; if ((c !== BLACK && c !== WHITE) || seen.has(p)) continue;
      const chain = chainOf(p); let s = 0;
      for (const q of chain) { seen.add(q); s += ownBlack(q); }
      s /= chain.length;
      if ((c === BLACK && s < -0.3) || (c === WHITE && s > 0.3)) chain.forEach(q => dead.add(q));
    }
    scoring.dead = dead; scoring.loading = false; render();
  }
  // An open border is an empty point next to stones that neither side clearly owns yet (a gap in a wall, a neutral point),
  // leaving out self-ataris such as a shared liberty in seki. Hikaru (placement test) plays one instead of passing, even
  // right after the player passes, so the game ends with every area sealed; with none left the game is closed for every character.
  // Returns the open border the network likes best (null when closed) and the evaluation used.
  async function openBorderMove() {
    const ev = await AI.evaluate(n, history.slice(), KOMI), me = board.toPlay;
    let best = null, bp = -1;
    for (const p of board.pts) {
      if (board.color[p] !== EMPTY || !board.isLegal(p, me)) continue;
      const [x, y] = board.xy(p), i = y * 19 + x;
      if (Math.abs(ev.own[i]) > 0.5 || !board.dirs.some(d => board.color[p + d] === BLACK || board.color[p + d] === WHITE)) continue;
      const b = new Board(n); b.copyFrom(board); b.play(p);
      if (libertiesOf(b, p) < 2) continue;
      if (ev.policy[i] > bp) { best = p; bp = ev.policy[i]; }
    }
    return { move: best, ev };
  }
  function libertiesOf(b, p) {
    const c = b.color[p], seen = new Set([p]), libs = new Set(), st = [p];
    while (st.length) {
      const q = st.pop();
      for (const d of b.dirs) { const r = q + d; if (b.color[r] === EMPTY) libs.add(r); else if (b.color[r] === c && !seen.has(r)) { seen.add(r); st.push(r); } }
    }
    return libs.size;
  }
  function chainOf(p) {
    const c = board.color[p], out = [p], seen = new Set([p]);
    for (let i = 0; i < out.length; i++) for (const d of board.dirs) {
      const q = out[i] + d; if (board.color[q] === c && !seen.has(q)) { seen.add(q); out.push(q); }
    }
    return out;
  }
  function areaCount(dead) {
    const terr = new Map(); let b = 0, w = 0; const seen = new Set();
    for (const p of board.pts) {
      const c = board.color[p];
      if ((c === BLACK || c === WHITE) && !dead.has(p)) { if (c === BLACK) b++; else w++; continue; }
      if (seen.has(p)) continue;
      const region = [p]; seen.add(p); let tb = false, tw = false;
      for (let i = 0; i < region.length; i++) for (const d of board.dirs) {
        const q = region[i] + d, cq = board.color[q];
        if (cq === 3) continue;
        if ((cq === BLACK || cq === WHITE) && !dead.has(q)) { if (cq === BLACK) tb = true; else tw = true; }
        else if (!seen.has(q)) { seen.add(q); region.push(q); }
      }
      const owner = tb && !tw ? BLACK : tw && !tb ? WHITE : 0;
      for (const q of region) terr.set(q, owner);
      if (owner === BLACK) b += region.length; else if (owner === WHITE) w += region.length;
    }
    return { b, w, terr };
  }

  // ---------- input ----------
  function pointAt(ev) {
    const r = cv.getBoundingClientRect(); const cell = r.width / (n + 1);
    const x = Math.round((ev.clientX - r.left) / cell) - 1, y = Math.round((ev.clientY - r.top) / cell) - 1;
    if (x < 0 || y < 0 || x >= n || y >= n) return null;
    return board.pt(x, y);
  }
  cv.addEventListener("click", ev => {
    const p = pointAt(ev); if (p === null) return;
    if (reviewAt !== null) return;
    if (scoring && !scoring.loading) {
      const c = board.color[p]; if (c !== BLACK && c !== WHITE) return;
      const ch = chainOf(p); const isDead = scoring.dead.has(p);
      ch.forEach(q => isDead ? scoring.dead.delete(q) : scoring.dead.add(q));
      render(); return;
    }
    unlockAudio();
    if (!engineReady || over || scoring || thinking || board.toPlay !== human) return;
    if (board.color[p] !== EMPTY) return;
    if (!board.isLegal(p, human)) { if (p === board.ko) speak("ko", { gap: 4 }); flash(p === board.ko ? "ห้ามเดินตรงนี้ทันที เพราะเป็นโค ให้เดินที่อื่นก่อนหนึ่งตา" : "จุดนี้วางไม่ได้ (ไม่มีลมหายใจ)"); return; }
    // on a touch screen the first tap only marks the point; the move is made with the confirm button or a second tap on the same point
    if (lastPtr !== "mouse" && p !== pending) { pending = p; blip(700); render(); return; }
    playMove(p);
  });
  cv.addEventListener("pointerdown", ev => { lastPtr = ev.pointerType || "mouse"; });
  cv.addEventListener("pointermove", ev => { if (ev.pointerType !== "mouse" || !board) return; const p = pointAt(ev); if (p !== hover) { hover = p; drawBoard(); } });
  cv.addEventListener("pointerleave", () => { hover = null; drawBoard(); });

  let flashMsg = null, flashT = 0;
  function flash(t) { flashMsg = t; clearTimeout(flashT); flashT = setTimeout(() => { flashMsg = null; renderStatus(); }, 2600); renderStatus(); }

  const pendingOk = () => pending !== null && reviewAt === null && engineReady && !over && !scoring && !thinking && board.toPlay === human && board.isLegal(pending, human);
  // the pass button turns into the confirm button while a stone is waiting to be placed
  function syncPass(myTurn) {
    const b = $("btnPass"), ok = pendingOk();
    b.disabled = !myTurn; b.textContent = ok ? "วางหมาก" : "ผ่าน"; b.classList.toggle("confirm", ok);
  }
  $("btnPass").onclick = () => {
    if (!engineReady || over || scoring || thinking || board.toPlay !== human) return;
    if (pendingOk()) playMove(pending); else playMove(PASS);
  };
  $("btnHint").onclick = async () => {
    if (!engineReady || over || scoring || thinking || board.toPlay !== human) return;
    const my = ++gen; thinking = true; think = null; speak("hint", { gap: 6 }); render();
    let res;
    try {
      res = await AI.think(n, history.slice(), KOMI, { visits: 120, timeMs: Math.min(8000, clocks[human].main > 0 ? 8000 : Math.max(1000, (clocks[human].byo - 2.5) * 1000)), batch: 8, shouldStop: () => my !== gen,
        onProgress: s => { if (my === gen) { think = s; renderStatus(); drawBoard(); } } });
    } catch (e) {
      if (my === gen) { thinking = false; think = null; render(); }
      if (checkEngine) await checkEngine();
      return;
    }
    if (my !== gen) return;
    thinking = false; think = null; hint = res.move; setEval(res); render();
    if (res.move === PASS) flash("AI แนะนำให้ผ่าน");
  };
  $("btnResign").onclick = () => {
    if (over || scoring || !history.length) return;
    cancelAI(); over = { text: `คุณยอมแพ้ ${CHARS[gameChar].name} ชนะ`, detail: "" }; speak("resigned", { force: true }); reportEnd(false, "resign"); render();
  };
  // characters from 3 kyu up (index 3 onwards) only play on the full 19x19 board
  const FREE_SIZE = ["mek", "win", "yuto"]; // everyone else plays 19x19 only
  const only19 = i => !FREE_SIZE.includes(CHARS[i].id);
  const boardSize = () => only19(settings.char) ? 19 : settings.size;
  function seg(id, key) {
    const el = $(id);
    const sync = () => {
      const val = key === "size" ? boardSize() : settings[key];
      el.querySelectorAll("button").forEach(b => {
        b.setAttribute("aria-pressed", String(+b.dataset.v === val));
        if (key === "size") b.disabled = only19(settings.char) && +b.dataset.v !== 19;
      });
      if (key === "size") $("sizeLegend").textContent = only19(settings.char) ? "กระดาน (ตัวนี้เล่น 19×19 เท่านั้น)" : "กระดาน";
    };
    el.addEventListener("click", e => { const b = e.target.closest("button"); if (!b || b.disabled) return; settings[key] = +b.dataset.v; save(key, settings[key]); sync(); });
    sync();
    return sync;
  }

  // ---------- rendering ----------
  function render() { renderPanel(); renderStatus(); renderReview(); drawBoard(); }
  // ---------- game record review ----------
  const ended = () => !!over || !!(scoring && !scoring.loading);
  function reviewTo(k) {
    if (!ended()) return;
    k = Math.max(0, Math.min(history.length, k));
    if (k === history.length) { reviewAt = null; reviewBoard = null; }
    else { reviewAt = k; reviewBoard = new Board(n); for (let i = 0; i < k; i++) reviewBoard.play(history[i]); }
    renderReview(); drawBoard();
  }
  function renderReview() {
    const on = !!board && ended();
    $("review").hidden = !on; $("playActions").hidden = on;
    if (!on) return;
    const k = reviewAt === null ? history.length : reviewAt;
    const g = exam && k ? exam.grades[k - 1] : null;
    const mv = (k ? `${k % 2 ? "ดำ" : "ขาว"} ${moveName(history[k - 1])}` : "เริ่มเกม") + (g ? ` · <span class="g-t g-${g.cls}">${GRADE_LABEL[g.cls]}${g.cls === "best" ? "" : " −" + g.loss.toFixed(1)}</span>` : "");
    $("rvLabel").innerHTML = `ตา ${k}/${history.length}<br>${mv}`;
    $("rvFirst").disabled = $("rvPrev").disabled = k === 0;
    $("rvNext").disabled = $("rvLast").disabled = k === history.length;
  }
  const atNow = () => reviewAt === null ? history.length : reviewAt;
  $("rvFirst").onclick = () => reviewTo(0);
  $("rvPrev").onclick = () => reviewTo(atNow() - 1);
  $("rvNext").onclick = () => reviewTo(atNow() + 1);
  $("rvLast").onclick = () => reviewTo(history.length);
  function renderPanel() {
    $("cB").textContent = "หมากเชลย " + board.caps[BLACK];
    $("cW").textContent = "หมากเชลย " + board.caps[WHITE];
    renderClocks();
    const live = !over && !scoring;
    $("pB").classList.toggle("turn", live && board.toPlay === BLACK);
    $("pW").classList.toggle("turn", live && board.toPlay === WHITE);
    const pct = Math.round(winBlack * 100);
    $("wrFill").style.width = pct + "%"; $("wrB").textContent = "ดำ " + pct + "%"; $("wrW").textContent = "ขาว " + (100 - pct) + "%";
    const lead = Math.abs(leadBlack).toFixed(1);
    $("wrMid").textContent = history.length ? `${leadBlack >= 0 ? "ดำ" : "ขาว"} นำ ~${lead} แต้ม` : "โอกาสชนะ";
    const myTurn = engineReady && live && !thinking && board.toPlay === human;
    syncPass(myTurn); $("btnHint").disabled = !myTurn || !!exam;
    $("btnResign").disabled = !live || !history.length;
    const res = $("result");
    if (over) { res.hidden = false; res.innerHTML = `<h2>${over.text}</h2><div class="nums">${over.detail}</div>` + examReport(); }
    else if (scoring && !scoring.loading) {
      const r = areaCount(scoring.dead); scoring.terr = r.terr;
      const diff = r.b - (r.w + KOMI);
      const winner = diff > 0 ? BLACK : WHITE;
      if (exam) exam.margin = Math.abs(diff);
      res.hidden = false;
      if (!scoring.spoke) { scoring.spoke = true; speak(winner === human ? "lose" : "win", { force: true }); reportEnd(winner === human, "score"); }
      res.innerHTML = `<h2>${winner === human ? "คุณชนะ" : CHARS[gameChar].name + " ชนะ"} (${winner === BLACK ? "ดำ" : "ขาว"} ชนะ ${Math.abs(diff)} แต้ม)</h2>
        <div class="nums">ดำ ${r.b} · ขาว ${r.w} + โคมิ ${KOMI} = ${r.w + KOMI}</div>
        <p class="note" style="margin-top:6px">หมากที่มีกากบาทถูกนับว่าตาย แตะกลุ่มเพื่อแก้</p>` + examReport();
    } else res.hidden = true;
  }
  // the placement result so far: counts per grade, average points lost, share of non-Best moves and the estimated rank
  // a rank is only given once the game reached this many moves (both sides together)
  const EXAM_MIN_MOVES = 100;
  function examResult(ex = exam, len = history.length) {
    if (!ex) return null;
    const gs = ex.grades.filter(Boolean);
    const cnt = { best: 0, good: 0, normal: 0, bad: 0 }; let sum = 0;
    for (const g of gs) { cnt[g.cls]++; sum += Math.min(g.loss, 20); }
    if (!gs.length) return { graded: 0, cnt, avg: 0, notBest: 0, score: 0, est: null };
    const notBest = 100 * (gs.length - cnt.best) / gs.length, score = (cnt.good + 2 * cnt.normal + 3 * cnt.bad) / gs.length;
    // beating Hikaru adds a rank, two when the player won by 10 points or more on the count or when Hikaru resigned 30+
    // behind (site owner's choice, 2026-10-29)
    const bonus = ex.won ? (ex.margin >= 10 ? 2 : 1) : 0;
    const top = EXAM_BANDS[0][1];
    return { graded: gs.length, cnt, avg: sum / gs.length, notBest, score, bonus,
      est: gs.length >= 20 && len >= EXAM_MIN_MOVES ? Math.min(top, estimateRank(score) + bonus) : null };
  }
  function examReport() {
    if (!exam) return "";
    const R = examResult(), gs = exam.grades.filter(Boolean);
    if (R.graded < 20 || history.length < EXAM_MIN_MOVES) return `<div class="exam"><b>ผลสอบ</b><p class="note">เกมนี้เดินไป ${history.length} ตา ยังน้อยเกินไปที่จะประเมินระดับ (ต้องเดินรวมกันอย่างน้อย ${EXAM_MIN_MOVES} ตา) แนะนำให้เล่นจนจบกระดานและนับแต้ม</p></div>`;
    const { cnt, avg, notBest, score, bonus, est } = R;
    const bar = Object.keys(cnt).map(k => `<i class="g-${k}" style="flex:${cnt[k]}"></i>`).join("");
    const legend = Object.keys(cnt).map(k => `<span><i class="dot g-${k}"></i>${GRADE_LABEL[k]} ${cnt[k]} (${Math.round(cnt[k] / gs.length * 100)}%)</span>`).join("");
    const near = EXAM_CALIB.length ? EXAM_CALIB.reduce((a, b) => Math.abs(b.avg - score) < Math.abs(a.avg - score) ? b : a) : null;
    return `<div class="exam"><b>ผลสอบวัดระดับ</b>
      <div class="exam-rank">${est === null ? "ยังไม่มีตารางเทียบ" : "ประมาณ " + rankName(est)}</div><div class="note">${bonus ? `รวมโบนัสชนะฮิคารุ +${bonus} ระดับ · ` : ""}ผลประมาณการ คลาดได้ราว ±2 ระดับ${exam.how && exam.how !== "score" && !exam.won ? " · เกมนี้จบก่อนนับแต้ม ผลอาจคลาดมากกว่าปกติ ครั้งหน้าลองเล่นจนจบกระดานนะ" : ""}</div>
      <div class="gbar">${bar}</div><div class="glegend">${legend}</div>
      <p class="note">คะแนนเฉลี่ย ${score.toFixed(2)} ต่อตา (Best 0 · Good 1 · Normal 2 · Bad 3 ยิ่งน้อยยิ่งดี) · ไม่ใช่ Best ${Math.round(notBest)}% · เสียเฉลี่ย ${avg.toFixed(2)} แต้มต่อตา จาก ${gs.length} ตา${near ? ` · ใกล้เคียง${CHARS.find(c => c.id === near.id).name} (${rankName(estimateRank(near.avg))})` : ""} · กด ◀ ▶ เพื่อดูแต่ละตาและตาที่ดีกว่า</p></div>`;
  }
  function moveName(p) { if (p === PASS) return "ผ่าน"; const [x, y] = board.xy(p); return LETTERS[x] + (n - y); }
  function renderStatus() {
    const el = $("status"); let html;
    if (flashMsg) html = `<b>${flashMsg}</b>`;
    else if (!engineReady) html = "<b>รอสมอง AI โหลดเสร็จ…</b>";
    else if (over) html = "เกมจบแล้ว กด ◀ ▶ เพื่อดูย้อนหมากทีละตา หรือกด \"เล่นใหม่\"";
    else if (scoring) html = scoring.loading ? "ทั้งสองฝ่ายผ่าน กำลังประเมินหมากตาย…" : "<b>นับแต้ม</b> ตรวจหมากตายบนกระดาน";
    else if (thinking) {
      const who = board.toPlay === ai ? "AI กำลังคิด" : "AI กำลังหาตาแนะนำ";
      html = `<b>${who}…</b><span class="meta">${think ? think.visits.toLocaleString() + " รูปแบบ · คิดว่า " + moveName(think.move) + " (" + Math.round(think.winrate * 100) + "%)" : "เริ่มอ่าน"}</span>`;
    } else {
      const last = history.length ? `ตาที่แล้ว: ${history.length % 2 ? "ดำ" : "ขาว"} ${moveName(history[history.length - 1])}` : "เริ่มเกม";
      const mine = board.toPlay === human ? `ตาคุณ (${human === BLACK ? "ดำ" : "ขาว"})` : "ตา AI";
      html = `<b>${mine}</b><span class="meta">ตาที่ ${history.length + 1} · ${last}${hint !== null ? " · แนะนำ " + moveName(hint) : ""}</span>`;
    }
    el.innerHTML = html;
    const live = !over && !scoring, myTurn = engineReady && live && !thinking && board.toPlay === human;
    syncPass(myTurn); $("btnHint").disabled = !myTurn || !!exam;
  }

  let dpr = 1, S = 800;
  function resize() {
    const w = cv.getBoundingClientRect().width || 600;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    S = w; cv.width = Math.round(w * dpr); cv.height = Math.round(w * dpr);
    drawBoard();
  }
  window.addEventListener("resize", () => { if (board) resize(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (board && !$("game").hidden) resize(); }).observe(cv.parentElement);

  let grain = null, grainKey = "";
  function woodLayer(W) {
    if (grainKey === String(W)) return grain;
    const c = document.createElement("canvas"); c.width = c.height = W; const x = c.getContext("2d");
    const lg = x.createLinearGradient(0, 0, W, W); lg.addColorStop(0, "#e6c07a"); lg.addColorStop(.5, "#ddb267"); lg.addColorStop(1, "#cf9f52");
    x.fillStyle = lg; x.fillRect(0, 0, W, W);
    let s = 7; const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 90; i++) {
      const y0 = r() * W, amp = 3 + r() * 10, f = 0.002 + r() * 0.006;
      x.strokeStyle = `rgba(120,72,20,${0.04 + r() * 0.07})`; x.lineWidth = 0.6 + r() * 2.2 * (W / 800);
      x.beginPath();
      for (let px = 0; px <= W; px += 8) { const py = y0 + Math.sin(px * f + i) * amp; px ? x.lineTo(px, py) : x.moveTo(px, py); }
      x.stroke();
    }
    grain = c; grainKey = String(W); return c;
  }
  function drawStone(cx, cy, r, color, alpha) {
    g.save(); g.globalAlpha = alpha == null ? 1 : alpha;
    if (alpha == null) { g.fillStyle = "rgba(40,22,0,.35)"; g.beginPath(); g.arc(cx + r * .08, cy + r * .12, r, 0, 7); g.fill(); }
    const gr = g.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
    if (color === BLACK) { gr.addColorStop(0, "#6b6b6b"); gr.addColorStop(.45, "#202020"); gr.addColorStop(1, "#050505"); }
    else { gr.addColorStop(0, "#ffffff"); gr.addColorStop(.6, "#ecebe5"); gr.addColorStop(1, "#bdbcb3"); }
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
    g.restore();
  }
  function drawBoard() {
    if (!board) return;
    // while reviewing, draw the position after move reviewAt, without the scoring marks or hints
    if (reviewBoard) drawPosition(reviewBoard, null, history.slice(0, reviewAt), true);
    else drawPosition(board, scoring, history, false);
  }
  function drawPosition(board, scoring, history, reviewing) {
    const W = cv.width; g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(woodLayer(W), 0, 0);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cell = S / (n + 1), P = i => cell * (i + 1);
    g.strokeStyle = "rgba(42,29,12,.85)"; g.lineWidth = Math.max(0.8, cell / 34);
    g.beginPath();
    for (let i = 0; i < n; i++) { g.moveTo(P(0), P(i)); g.lineTo(P(n - 1), P(i)); g.moveTo(P(i), P(0)); g.lineTo(P(i), P(n - 1)); }
    g.stroke();
    g.lineWidth = Math.max(1.4, cell / 18); g.strokeRect(P(0), P(0), P(n - 1) - P(0), P(n - 1) - P(0));
    const stars = n === 19 ? [3, 9, 15] : n === 13 ? [3, 6, 9] : [2, 4, 6];
    g.fillStyle = "#2a1d0c";
    for (const a of stars) for (const b of stars) {
      if (n === 9 && (a === 4) !== (b === 4)) continue;
      g.beginPath(); g.arc(P(a), P(b), Math.max(2, cell * .11), 0, 7); g.fill();
    }
    g.fillStyle = "rgba(42,29,12,.75)"; g.font = `500 ${Math.max(8, cell * .34)}px "IBM Plex Mono", monospace`;
    g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 0; i < n; i++) {
      g.fillText(LETTERS[i], P(i), cell * .42); g.fillText(LETTERS[i], P(i), S - cell * .42);
      g.fillText(String(n - i), cell * .42, P(i)); g.fillText(String(n - i), S - cell * .42, P(i));
    }
    const r = cell * .475, dead = scoring ? scoring.dead : null, terr = scoring && !scoring.loading ? scoring.terr : null;
    for (const p of board.pts) {
      const c = board.color[p]; const [x, y] = board.xy(p);
      if (c === BLACK || c === WHITE) {
        const isDead = dead && dead.has(p);
        drawStone(P(x), P(y), r, c, isDead ? 0.45 : null);
        if (isDead) {
          g.strokeStyle = c === BLACK ? "#f3f3ee" : "#1a1a1a"; g.lineWidth = Math.max(1.2, cell / 14); const k = r * .4;
          g.beginPath(); g.moveTo(P(x) - k, P(y) - k); g.lineTo(P(x) + k, P(y) + k); g.moveTo(P(x) + k, P(y) - k); g.lineTo(P(x) - k, P(y) + k); g.stroke();
        }
      }
      if (terr) {
        const owner = terr.get(p);
        if (owner) { const k = cell * .2; g.fillStyle = owner === BLACK ? "rgba(10,10,10,.85)" : "rgba(255,255,255,.95)";
          g.fillRect(P(x) - k, P(y) - k, 2 * k, 2 * k); if (owner === WHITE) { g.strokeStyle = "rgba(0,0,0,.35)"; g.lineWidth = 1; g.strokeRect(P(x) - k, P(y) - k, 2 * k, 2 * k); } }
      }
    }
    const last = history.length ? history[history.length - 1] : PASS;
    if (last !== PASS && !scoring) {
      const [x, y] = board.xy(last); const c = board.color[last];
      g.strokeStyle = c === BLACK ? "#f5f2e8" : "#222"; g.lineWidth = Math.max(1.4, cell / 14);
      g.beginPath(); g.arc(P(x), P(y), r * .45, 0, 7); g.stroke();
    }
    const graded = reviewing && exam ? exam.grades[history.length - 1] : null;
    if (graded && graded.cls !== "best" && graded.best !== PASS) { // where the examiner would have played instead
      const [x, y] = board.xy(graded.best);
      g.strokeStyle = "#1f6b55"; g.lineWidth = Math.max(2, cell / 10); g.setLineDash([cell * .14, cell * .1]);
      g.beginPath(); g.arc(P(x), P(y), r * .8, 0, 7); g.stroke(); g.setLineDash([]);
    }
    const target = reviewing ? null : thinking && think && board.toPlay !== ai ? think.move : hint;
    if (target !== null && target !== undefined && target !== PASS) {
      const [x, y] = board.xy(target);
      g.strokeStyle = "#1f6b55"; g.lineWidth = Math.max(2, cell / 10); g.setLineDash([cell * .14, cell * .1]);
      g.beginPath(); g.arc(P(x), P(y), r * .8, 0, 7); g.stroke(); g.setLineDash([]);
    }
    if (!reviewing && hover !== null && engineReady && !thinking && !over && !scoring && board.toPlay === human && board.isLegal(hover, human)) {
      const [x, y] = board.xy(hover); drawStone(P(x), P(y), r, human, .45);
    }
    if (!reviewing && pendingOk()) { // stone waiting for confirmation: see-through with a red dot
      const [x, y] = board.xy(pending); drawStone(P(x), P(y), r, human, .7);
      g.fillStyle = "#e0402e"; g.beginPath(); g.arc(P(x), P(y), r * .3, 0, 7); g.fill();
    }
  }

  const syncSize = seg("segSize", "size"); seg("segColor", "human");
  // home screen: arcade-style character select, one featured card with its neighbours either side
  const charsEl = $("chars"), L8 = CHARS.length;
  const pxImg = (c, cls) => `<img class="${cls}" src="chars/${c.id}.jpg" alt="${c.name}" width="480" height="480">`;
  function blip(f) {
    if (!actx || !soundOn) return;
    const t = actx.currentTime, o = actx.createOscillator(), g2 = actx.createGain();
    o.type = "square"; o.frequency.setValueAtTime(f, t); g2.gain.setValueAtTime(0.06, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    o.connect(g2).connect(actx.destination); o.start(t); o.stop(t + 0.09);
  }
  // in-game buttons: short arcade notes in the same voice as the select screen, one tune per button
  function tune(notes) { notes.forEach(([f, ms]) => setTimeout(() => blip(f), ms)); }
  const BUTTON_TUNES = {
    btnPass: [[440, 0]], btnHint: [[660, 0], [990, 70]], btnResign: [[520, 0], [390, 90], [260, 180]],
    btnRestart: [[660, 0], [880, 70]], btnHome: [[880, 0], [660, 70]], btnFull: [[520, 0]],
    rvFirst: [[700, 0]], rvPrev: [[800, 0]], rvNext: [[900, 0]], rvLast: [[1000, 0]]
  };
  $("game").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b || b.disabled) return;
    unlockAudio(); tune(BUTTON_TUNES[b.id] || (b.id === "btnSound" ? [] : [[700, 0]]));
  }, true);
  $("faces").innerHTML = CHARS.map((c, i) => `<button data-i="${i}" aria-label="${c.name}"><img src="chars/${c.id}_face.jpg" alt="" width="160" height="160"></button>`).join("");
  function syncChars(anim) {
    const i = settings.char, c = CHARS[i], prev = CHARS[(i + L8 - 1) % L8], next = CHARS[(i + 1) % L8];
    charsEl.innerHTML = `<button class="ghost left" data-go="-1" aria-label="ตัวก่อนหน้า">${pxImg(prev, "")}</button>
      <button class="arrow left" data-go="-1" aria-label="ตัวก่อนหน้า"></button>
      <div class="card${anim ? " pop" : ""}"><div class="card-in">${c.exam ? '<div class="cexam">สอบวัดระดับ</div>' : c.tutorial ? '<div class="cexam">โหมดสอนเล่น</div>' : ""}<div class="cname">${c.en}</div><div class="cthai">${c.name}</div>${pxImg(c, "pxp")}<div class="crank">${c.rank}</div></div></div>
      <button class="arrow right" data-go="1" aria-label="ตัวถัดไป"></button>
      <button class="ghost right" data-go="1" aria-label="ตัวถัดไป">${pxImg(next, "")}</button>`;
    $("pick").innerHTML = `<div class="cmeta">${c.tutorial ? "กระดาน 9×9 · 6 บท 23 ขั้น" : c.country + " · " + STYLE[c.style].label}</div><p class="cbio">${c.bio}</p><p class="csay">"${c.say.hello}"</p>`;
    $("faces").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(+b.dataset.i === i)));
    syncSize();
    $("home").querySelector(".opts").hidden = !!c.tutorial;
    $("btnNew").textContent = c.tutorial ? "OPEN BOOK" : "GAME START";
  }
  function choose(i) { unlockAudio(); settings.char = (i + L8) % L8; save("charId", CHARS[settings.char].id); syncChars(true); blip(660); }
  charsEl.addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) choose(settings.char + +b.dataset.go); });
  $("faces").addEventListener("click", e => { const b = e.target.closest("button"); if (b) choose(+b.dataset.i); });
  let swipeX = null;
  charsEl.addEventListener("pointerdown", e => { swipeX = e.clientX; });
  charsEl.addEventListener("pointerup", e => { if (swipeX === null) return; const dx = e.clientX - swipeX; swipeX = null; if (Math.abs(dx) > 40) choose(settings.char + (dx < 0 ? 1 : -1)); });
  document.addEventListener("keydown", e => {
    if (!$("tutor").hidden) return; // the tutorial has its own keys
    if ($("home").hidden) {
      if (ended() && (e.key === "ArrowLeft" || e.key === "ArrowRight")) reviewTo(atNow() + (e.key === "ArrowLeft" ? -1 : 1));
      return;
    }
    if (e.key === "ArrowLeft") choose(settings.char - 1); else if (e.key === "ArrowRight") choose(settings.char + 1);
    else if (e.key === "Enter" && !e.target.closest("button")) { unlockAudio(); startGame(); }
  });
  ["segSize", "segColor"].forEach(id => $(id).addEventListener("click", () => { unlockAudio(); blip(520); }));
  syncChars();
  document.body.classList.add("arcade");
  function showHome() { cancelAI(); save("game", null); $("game").hidden = true; $("home").hidden = false; document.body.classList.add("arcade"); document.body.classList.remove("playing"); window.scrollTo(0, 0); syncChars(); }
  function openTutorial() { blip(880); $("home").hidden = true; document.body.classList.remove("arcade"); Tutorial.open(); }
  Tutorial.onHome = showHome;
  Tutorial.onPlay = () => { settings.char = CHARS.findIndex(c => c.id === "mek"); save("charId", "mek"); settings.size = 9; save("size", 9); syncChars(); startGame(); };
  function startGame() { if (CHARS[settings.char].tutorial) return openTutorial(); blip(880); $("home").hidden = true; $("game").hidden = false; document.body.classList.remove("arcade"); document.body.classList.add("playing"); window.scrollTo(0, 0); newGame(); }
  $("btnNew").onclick = () => { unlockAudio(); startGame(); };
  const syncSound = () => { $("btnSound").textContent = soundOn ? "เสียง: เปิด" : "เสียง: ปิด"; $("btnSound").setAttribute("aria-pressed", String(soundOn)); };
  $("btnSound").onclick = () => { soundOn = !soundOn; save("sound", soundOn); unlockAudio(); syncSound(); clack(); };
  syncSound();
  // true fullscreen where the browser allows it (Android, desktop); the layout already fits the screen either way
  const fsEl = document.documentElement, canFs = !!(fsEl.requestFullscreen || fsEl.webkitRequestFullscreen);
  const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  $("btnFull").hidden = !canFs;
  $("btnFull").onclick = () => {
    try {
      if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
      else { const r = (fsEl.requestFullscreen || fsEl.webkitRequestFullscreen).call(fsEl); if (r && r.catch) r.catch(() => {}); }
    } catch (e) {}
  };
  const syncFs = () => { $("btnFull").textContent = isFs() ? "ออกเต็มจอ" : "เต็มจอ"; if (board) resize(); };
  document.addEventListener("fullscreenchange", syncFs); document.addEventListener("webkitfullscreenchange", syncFs);
  $("btnRestart").onclick = () => { settings.char = gameChar; newGame(); };
  $("btnHome").onclick = showHome;
  // clocks keep their time across a refresh too
  window.addEventListener("pagehide", saveGame);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveGame(); });
  const saved = load("game", null);
  if (saved && !(Date.now() - (saved.at || 0) < 6 * 36e5 && resumeGame(saved))) save("game", null);
  initEngine();
})();
