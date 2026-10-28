// Mikä tää o? – käyttöliittymä. Logiikka on peli.js:ssä (PELI), kuvat data/kuvat.js:ssä (KUVAT).
(() => {
  const app = document.getElementById("app");
  const P = PELI, S = PELI.S;

  // ---------- Tallennus (selaimeen; yksityisessä ikkunassa voi puuttua, peli toimii silti) ----------
  const muisti = {};
  function lue(k, oletus) {
    try { const v = localStorage.getItem("mto." + k); return v == null ? oletus : JSON.parse(v); }
    catch (e) { return k in muisti ? muisti[k] : oletus; }
  }
  function kirjoita(k, v) {
    muisti[k] = v;
    try { localStorage.setItem("mto." + k, JSON.stringify(v)); } catch (e) {}
  }

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const luku = n => Math.round(n).toLocaleString("fi-FI");
  const kerroinTxt = k => "×" + String(k).replace(".", ",");

  function toast(t) {
    const el = document.getElementById("toast");
    el.textContent = t; el.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2200);
  }

  // ---------- Äänet ----------
  // Ammattimaiset CC0-äänet (Kenney: Interface Sounds ja Music Jingles; sydämenlyönti syntetisoidaan), upotettu data/aanet.js:ään
  // base64:nä, jotta ne toimivat myös tiedostona avatussa pelissä. Jos ääntä ei ole vielä ladattu, soi syntetisoitu varaääni.
  let ac = null, master = null;
  const puskurit = {};
  function base64Puskuri(url) {
    const b = atob(url.slice(url.indexOf(",") + 1)), u = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i);
    return u.buffer;
  }
  // Selaimet, erityisesti Safari, sallivat äänen vasta käyttäjän eleestä. Moottori käynnistetään ensimmäisestä kosketuksesta
  // tai näppäimestä (Mikko 2026-10-27: äänet katosivat, kun ensimmäinen ääni tuli ajastimesta eikä napautuksesta).
  function kaynnistaAani() {
    try {
      if (!ac) {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.6; master.connect(ac.destination);
        if (typeof AANET !== "undefined") Object.keys(AANET).forEach(nimi => {
          const valmis = b => { puskurit[nimi] = b; };
          const lupaus = ac.decodeAudioData(base64Puskuri(AANET[nimi]), valmis, () => {});
          if (lupaus && lupaus.catch) lupaus.catch(() => {});
        });
      }
      if (ac.state !== "running") { const r = ac.resume(); if (r && r.catch) r.catch(() => {}); }
      // iOS avaa äänen lopullisesti vasta, kun eleen aikana soitetaan jotain: lyhyt hiljainen puskuri
      const h = ac.createBufferSource(); h.buffer = ac.createBuffer(1, 1, 22050); h.connect(ac.destination); h.start(0);
    } catch (e) {}
  }
  ["pointerdown", "touchend", "keydown"].forEach(tapahtuma => document.addEventListener(tapahtuma, kaynnistaAani, { capture: true, passive: true }));
  document.addEventListener("visibilitychange", () => { if (!document.hidden && ac && ac.state !== "running") { try { ac.resume(); } catch (e) {} } });
  window.__aani = () => ({ tila: ac ? ac.state : "ei käynnistetty", ladatut: Object.keys(puskurit).length });

  function soita(nimi, voima, nopeus, viive) {
    if (!lue("aani", true) || !ac || !puskurit[nimi]) return false;
    try {
      const lahde = ac.createBufferSource(), g = ac.createGain();
      lahde.buffer = puskurit[nimi]; lahde.playbackRate.value = nopeus || 1;
      g.gain.value = voima == null ? 1 : voima;
      lahde.connect(g).connect(master); lahde.start(ac.currentTime + (viive || 0));
      return true;
    } catch (e) { return false; }
  }
  // Syntetisoitu varaääni (ei koskaan luo moottoria itse, koska se onnistuu vain käyttäjän eleestä)
  function aani(taajuudet, kesto, tyyppi, voima) {
    if (!lue("aani", true) || !ac) return;
    try {
      const t0 = ac.currentTime;
      taajuudet.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = t0 + i * kesto * 0.8;
        o.type = tyyppi || "triangle"; o.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(voima || 0.18, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + kesto);
        o.connect(g).connect(master); o.start(t); o.stop(t + kesto + 0.02);
      });
    } catch (e) {}
  }
  // Yksi sydämenlyönti: sini, jonka sävel putoaa 160 → 70 Hz, ja yläsävelet (×2, ×3), jotta lyönti kuuluu myös läppärin ja
  // puhelimen pienestä kaiuttimesta (Mikko 2026-10-27: 95 → 48 Hz oli liian hiljaa). Ei kohinaa, ettei huohotus palaa.
  // Syke menee suoraan ulos eikä kokonaisvoimakkuuden (0,6) kautta.
  function lyonti(voima, viive) {
    if (!lue("aani", true) || !ac) return;
    try {
      const t = ac.currentTime + viive;
      [[1, 1], [2, 0.45], [3, 0.18]].forEach(([kerroin, osuus]) => {
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = "sine";
        o.frequency.setValueAtTime(160 * kerroin, t); o.frequency.exponentialRampToValueAtTime(70 * kerroin, t + 0.1);
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, voima * osuus), t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.22);
      });
    } catch (e) {}
  }
  const AANI = {
    ruutu: () => soita("ruutu", 0.8, 0.94 + Math.random() * 0.12) || aani([520, 380], 0.07, "square", 0.06),
    tiedan: () => soita("tiedan", 0.9) || aani([440, 660], 0.08, "triangle", 0.15),
    oikein: (iso) => soita(iso ? "oikein_iso" : "oikein", 0.9) || aani([523, 659, 784, 1047], 0.12, "triangle", 0.2),
    vaarin: () => soita("vaarin", 0.85) || aani([180, 140], 0.18, "sawtooth", 0.1),
    aika: () => soita("aika", 0.85) || aani([300, 200, 140], 0.15, "sawtooth", 0.1),
    loppu: () => soita("loppu", 0.95) || aani([392, 523, 659, 784, 1047, 1319], 0.13, "triangle", 0.18),
    nappi: () => soita("nappi", 0.5),
    // Kiire (Mikko 2026-10-27): syntetisoitu kaksoislyönti, puhdas "tum-tum" ilman kohinaa (nauhoite kuulosti huohotukselta).
    // Alussa 35 %, viimeiset 10 s nousee täyteen; väli lyhenee kiireAani()ssa (p 0–1)
    syke: (p) => {
      const voima = p < 2 / 3 ? 0.35 + 0.15 * p * 1.5 : 0.5 + 0.5 * (p - 2 / 3) * 3;
      lyonti(voima, 0); lyonti(voima * 0.7, 0.26 - 0.1 * p);
    }
  };
  const varise = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };

  // ---------- Ruudut ----------
  function nimi() { return lue("nimi", ""); }

  function koti() {
    VERKKO.tyhjenna(nimi()).catch(() => {});   // aiemmin lähettämättä jääneet tulokset
    pysayta();
    if (!nimi()) return kysyNimi(koti);
    const nyt = new Date(), vk = P.viikko(nyt), liiga = liigaNyt(), paiva = lue("paiva", {}), tanaan = paiva[P.pvm(nyt)];
    const putki = P.putkiPaivina(paiva, nyt), sija = liigaTaulu().findIndex(r => r.mina) + 1;
    app.innerHTML = `
      <header class="mb-5 mt-4 text-center">
        <h1 class="logo text-5xl">Mikä<br><b>tää o?</b></h1>
        <p class="mt-3 text-sm text-slate-400">Avaa ruutuja, arvaa kuva. Mitä vähemmän näet, sitä enemmän saat.</p>
      </header>
      <div class="grid gap-3">
        <button class="nappi paa" data-go="liiga">Viikkoliiga<small>${vk.replace("-V", " · viikko ")} · sija ${sija}/${P.HAAMUT.length + 1} · paras ${luku(liiga.paras)} p</small></button>
        <button class="nappi syaani" data-go="paiva">Päivän haaste<small>${tanaan ? "Pelattu tänään: " + luku(tanaan.pisteet) + " p ✓" : "5 kuvaa, kaikille samat"} · putki ${putki} pv 🔥</small></button>
        <button class="nappi kelta" data-go="kaveri">Kaverihaaste<small>Oma setti 5, 10 tai 15 kuvaa, koodi kavereille</small></button>
        <button class="nappi haamu" data-go="tulos">🏆 Tulostaulut<small>Koko maailman parhaat: viikkoliiga ja päivän haaste</small></button>
      </div>
      <div class="paneeli mt-4 grid gap-2 p-4 text-sm">
        <div class="flex items-center justify-between"><span>Pelaaja: <b>${esc(nimi())}</b></span><button class="siru" data-go="nimi">Vaihda</button></div>
        <div class="flex items-center justify-between"><span>Äänet</span><button class="siru" data-go="aani">${lue("aani", true) ? "Päällä 🔊" : "Pois 🔇"}</button></div>
        <details class="text-slate-400"><summary class="cursor-pointer">Säännöt</summary>
          <p class="mt-2">Kuva on piilossa ${S.RUUDUT} ruudun alla. Potti alkaa ${luku(S.POTTI)} pisteestä ja sulaa kiihtyvästi niin, että se on tyhjä, kun ${S.AIKA} sekuntia on kulunut. Katso rauhassa, mutta älä jää jahkailemaan. Ruutu maksaa osuuden jäljellä olevasta potista: ensimmäinen 8 %, toinen 10 %, kolmas 12 % ja aina 2 % enemmän. Kulmaruutu maksaa 0,6-kertaisesti ja keskiruutu 1,5-kertaisesti. Pottia jää aina jotain, vaikka avaisit paljon; vain aika vie sen nollaan. Ruudussa näkyy hinta pisteinä juuri nyt.</p>
          <p class="mt-2">Vaikeus nousee ottelun aikana: ensin koko kuvia, sitten lähikuvia (potti ${luku(S.TASOT[2].potti)}) ja lopuksi tiukkoja lähikuvia (potti ${luku(S.TASOT[3].potti)}). Koko kuva näytetään vastauksen jälkeen.</p>
          <p class="mt-2">Kun luulet tietäväsi, paina <b>Tiedän!</b> Näet neljä samannäköistä vaihtoehtoa, ja sinulla on ${S.VASTAUSAIKA} s (tai vähemmän, jos kokonaisaikaa on vähemmän jäljellä) ja yksi vastaus. Väärä vastaus on nolla pistettä. Lisäruutu maksaa nyt kaksinkertaisesti.</p>
          <p class="mt-2">Näppäimistöllä: Enter tai välilyönti on Tiedän! ja jatka, A–D valitsee.</p>
        </details>
        <p class="krediitti">Kuvat: Wikimedia Commons, tekijät ja lisenssit tiedostossa CREDITS.md ja jokaisen kuvan jälkeen.</p>
      </div>`;
    app.querySelectorAll("[data-go]").forEach(b => b.onclick = () => ({
      liiga: aloitaLiiga, paiva: () => tanaan ? paivaLoppu(tanaan) : aloitaPaiva(), kaveri: kaveri, tulos: () => tulostaulut("liiga"),
      nimi: () => kysyNimi(koti), aani: () => { kirjoita("aani", !lue("aani", true)); koti(); }
    })[b.dataset.go]());
  }

  function kysyNimi(jatko) {
    pysayta();
    app.innerHTML = `
      <header class="mb-6 mt-8 text-center"><h1 class="logo text-4xl">Mikä <b>tää o?</b></h1></header>
      <form class="paneeli grid gap-3 p-5" id="f">
        <label for="n" class="font-semibold">Mikä sun nimi on?</label>
        <input id="n" class="syote" maxlength="20" autocomplete="nickname" value="${esc(nimi())}" placeholder="esim. Mikko">
        <button class="nappi paa">Valmis</button>
      </form>`;
    const inp = document.getElementById("n");
    setTimeout(() => inp.focus(), 50);
    document.getElementById("f").onsubmit = e => {
      e.preventDefault();
      const n = P.puhdasNimi(inp.value);
      if (!inp.value.trim() || n === "Nimetön") return toast("Kirjoita nimi");
      kirjoita("nimi", n); jatko();
    };
  }

  // ---------- Viikkoliiga ----------
  function liigaNyt() {
    const vk = P.viikko(new Date());
    let l = lue("liiga", null);
    if (!l || l.vk !== vk) { l = { vk, pisteet: 0, ottelut: 0, paras: 0, edellinen: l ? { vk: l.vk, paras: l.paras } : null }; kirjoita("liiga", l); }
    return l;
  }
  function liigaTaulu() {
    const nyt = new Date(), l = liigaNyt();
    return P.haamut(l.vk, P.viikonOsuus(nyt)).concat([{ nimi: nimi() || "Sinä", pisteet: l.paras, mina: true }])
      .sort((a, b) => b.pisteet - a.pisteet || (a.mina ? -1 : 1));
  }
  function aloitaLiiga() {
    const siemen = "liiga:" + Date.now() + ":" + Math.random();
    const kr = P.valitse(KUVAT, S.LIIGA_KUVIA, siemen, lue("nahdyt", []));
    pelaa({ tyyppi: "liiga", otsikko: "Viikkoliiga", siemen }, kr);
  }

  // ---------- Päivän haaste ----------
  function aloitaPaiva() {
    const pv = P.pvm(new Date());
    pelaa({ tyyppi: "paiva", otsikko: "Päivän haaste", pv }, P.valitse(KUVAT, S.PAIVA_KUVIA, "paiva:" + pv));
  }

  // ---------- Kaverihaaste ----------
  function kaveri() {
    pysayta();
    let n = 10;
    const omat = lue("haasteet", {});
    const vanhat = Object.entries(omat).sort((a, b) => (b[1].aika || 0) - (a[1].aika || 0)).slice(0, 10);
    app.innerHTML = `
      ${ylapalkki("Kaverihaaste")}
      <section class="paneeli grid gap-3 p-4">
        <h2 class="text-lg font-extrabold">Luo uusi haaste</h2>
        <div class="valinta" role="group" aria-label="Kuvien määrä">
          ${[5, 10, 15].map(x => `<button data-n="${x}" class="${x === n ? "on" : ""}">${x}</button>`).join("")}
        </div>
        <button class="nappi paa" id="luo">Luo ja pelaa</button>
        <p class="text-sm text-slate-400">Pelaa ensin itse. Lopussa saat koodin ja linkin, joilla kaverit pelaavat täsmälleen samat kuvat.</p>
      </section>
      <form class="paneeli mt-3 grid gap-3 p-4" id="f">
        <label class="text-lg font-extrabold" for="k">Onko sulla koodi?</label>
        <input id="k" class="syote uppercase tracking-widest" placeholder="esim. K7F3Q-10" autocomplete="off" autocapitalize="characters">
        <button class="nappi syaani">Pelaa haaste</button>
      </form>
      ${vanhat.length ? `<section class="paneeli mt-3 grid gap-2 p-4"><h2 class="font-extrabold">Omat haasteet</h2><p class="text-xs text-slate-400">Avaa haaste nähdäksesi, miten kaverit pärjäsivät.</p>${vanhat.map(([k, h]) =>
        `<button class="nappi" data-k="${esc(k)}">${esc(k)}<small>${Object.keys(h.tulokset || {}).length} pelaajaa${h.oma != null ? " · sinä " + luku(h.oma) + " p" : ""}</small></button>`).join("")}</section>` : ""}`;
    kotiNappi();
    app.querySelectorAll("[data-n]").forEach(b => b.onclick = () => {
      n = Number(b.dataset.n);
      app.querySelectorAll("[data-n]").forEach(x => x.classList.toggle("on", x === b));
    });
    document.getElementById("luo").onclick = () => avaaHaaste(P.lueKoodi(P.uusiKoodi(P.rng(Date.now() ^ Math.floor(Math.random() * 1e9)), n)), {});
    document.getElementById("f").onsubmit = e => {
      e.preventDefault();
      const h = P.lueKoodi(document.getElementById("k").value);
      if (!h) return toast("Koodi on muotoa ABCDE-10");
      avaaHaaste(h, {});
    };
    app.querySelectorAll("[data-k]").forEach(b => b.onclick = () => haasteTaulu(P.lueKoodi(b.dataset.k)));
  }
  function haaste(koodi) {
    const kaikki = lue("haasteet", {});
    return kaikki[koodi] || { tulokset: {}, oma: null, aika: Date.now() };
  }
  function tallennaHaaste(koodi, h) {
    const kaikki = lue("haasteet", {});
    kaikki[koodi] = Object.assign(h, { aika: Date.now() });
    kirjoita("haasteet", kaikki);
  }
  // Linkin mukana tulleet tulokset yhdistetään omiin; kunkin nimen paras jää
  function yhdista(h, uudet) {
    Object.entries(uudet).forEach(([n, p]) => { if (!(n in h.tulokset) || p > h.tulokset[n]) h.tulokset[n] = p; });
  }
  function avaaHaaste(h, linkista) {
    const tila = haaste(h.koodi);
    yhdista(tila, linkista);
    tallennaHaaste(h.koodi, tila);
    if (tila.oma != null) return haasteTaulu(h);
    pelaa({ tyyppi: "haaste", otsikko: "Kaverihaaste " + h.koodi, h }, P.valitse(KUVAT, h.n, h.siemen));
  }

  // ---------- Peli ----------
  let t = null, meta = null, ajastin = 0, viimeksi = 0, kuvaValmis = false, seuraavaTikki = 0;
  const el = {};
  function pysayta() { clearInterval(ajastin); ajastin = 0; t = null; document.onkeydown = null; suljeTieto(); app.scrollTop = 0; }

  function ylapalkki(otsikko, oikea) {
    return `<div class="mb-3 flex items-center justify-between gap-2">
      <button class="siru" id="koti" aria-label="Takaisin alkuun">← Alkuun</button>
      <span class="truncate text-sm font-semibold text-slate-300">${esc(otsikko)}</span>${oikea || "<span></span>"}</div>`;
  }
  function kotiNappi(vahvista) {
    const b = document.getElementById("koti");
    const varmistus = meta && meta.tunnus
      ? "Jos lopetat nyt, tämä kuva on 0 p ja jatkat seuraavasta kuvasta, kun palaat. Lopetetaanko?"
      : "Keskeytetäänkö peli? Pisteet eivät tallennu.";
    // Viikkoliiga (Mikko 2026-10-28): keskeytys päättää ottelun, tähänastiset pisteet kirjataan ja kesken jäänyt kuva on 0 p
    const liigaKesken = () => meta && meta.tyyppi === "liiga" && t && t.kierrokset && !(t.i >= t.kierrokset.length - 1 && t.k && t.k.valmis);
    if (b) b.onclick = () => {
      if (liigaKesken()) {
        if (confirm("Jos lopetat nyt, ottelu päättyy: tämä kuva on 0 p ja tähänastiset pisteet kirjataan viikkoliigaan. Lopetetaanko?")) keskeytaLiiga();
        return;
      }
      if (!vahvista || confirm(varmistus)) koti();
    };
  }
  function keskeytaLiiga() {
    clearInterval(ajastin); ajastin = 0;
    if (t.k && !t.k.valmis) t.tulokset.push({ id: t.kierrokset[t.i].kuva.id, oikein: false, ansio: 0, aika: 0, avatut: 0, tiedan: false, keskeytetty: true });
    liigaLoppu();
  }

  // Keskeytys ei aloita alusta (Mikko 2026-10-27: päivän haasteessa ja kaverihaasteessa kuvat ovat samat, joten alusta
  // aloittamalla voisi huijata). Peli tallentuu kuva kuvalta; palatessa jatketaan, ja kesken jäänyt kuva on 0 p.
  // Viikkoliigassa jokainen ottelu arvotaan uudestaan ja vain paras lasketaan, joten sitä ei tarvitse.
  const keskenTunnus = m => m.tyyppi === "paiva" ? "paiva:" + m.pv : m.tyyppi === "haaste" ? "haaste:" + m.h.koodi : null;
  function tallennaKesken(kuvaAuki) {
    if (!meta || !meta.tunnus || !t) return;
    const kaikki = lue("kesken", {});
    kaikki[meta.tunnus] = { i: kuvaAuki ? t.i : t.i + 1, kuvaAuki, pisteet: t.pisteet, tulokset: t.tulokset };
    kirjoita("kesken", kaikki);
  }
  function poistaKesken() {
    if (!meta || !meta.tunnus) return;
    const kaikki = lue("kesken", {}); delete kaikki[meta.tunnus]; kirjoita("kesken", kaikki);
  }
  function pelaa(m, kierrokset) {
    pysayta();
    meta = m; meta.tunnus = keskenTunnus(m); t = P.uusi(kierrokset);
    const tila = meta.tunnus && lue("kesken", {})[meta.tunnus];
    if (tila) {
      t.i = tila.i; t.pisteet = tila.pisteet; t.tulokset = tila.tulokset.slice();
      if (tila.kuvaAuki && t.i < kierrokset.length) {
        t.tulokset.push({ id: kierrokset[t.i].kuva.id, oikein: false, ansio: 0, aika: 0, avatut: 0, tiedan: false, keskeytetty: true });
        tallennaKesken(false);   // tallentaa seuraavan kuvan indeksin (i + 1)
        t.i++;
        toast("Kesken jäänyt kuva on 0 p.");
      }
      if (t.i >= kierrokset.length) return loppu();
    }
    kuva();
  }

  const TASO_NIMI = [, "Koko kuva", "Lähikuva " + kerroinTxt(S.TASOT[2].zoom) + " · potti " + luku(S.TASOT[2].potti), "Tiukka lähikuva " + kerroinTxt(S.TASOT[3].zoom) + " · potti " + luku(S.TASOT[3].potti)];
  // Lähikuva: kuva suurennetaan ja siirretään niin, että näkyvän alueen keskipiste on (kx, ky)
  function lahikuvaTyyli(kr) {
    if (kr.zoom <= 1) return "";
    const z = kr.zoom, pct = v => (v * 100).toFixed(2) + "%";
    return `width:${pct(z)};height:${pct(z)};left:${pct(0.5 - kr.kx * z)};top:${pct(0.5 - kr.ky * z)}`;
  }

  function kuva() {
    app.scrollTop = 0;
    const kr = t.kierrokset[t.i];
    P.aloita(t);
    // Viikkoliigassa kuva merkitään nähdyksi heti, ettei keskeytetyn ottelun kuva tule pian uudestaan (vastaus tiedossa)
    if (meta.tyyppi === "liiga") {
      const n = lue("nahdyt", []);
      if (!n.includes(kr.kuva.id)) { n.push(kr.kuva.id); kirjoita("nahdyt", n.slice(-Math.floor(KUVAT.length * 0.8))); }
    }
    kuvaValmis = false; seuraavaTikki = 0;
    app.innerHTML = `
      ${ylapalkki(meta.otsikko, `<span class="siru">${t.i + 1}/${t.kierrokset.length}</span>`)}
      <div class="mb-2 flex items-end justify-between">
        <div><div class="text-xs uppercase tracking-widest text-slate-400">Potti</div><div class="potti" id="potti">${luku(kr.potti)}</div></div>
        <div class="text-right"><div class="text-xs uppercase tracking-widest text-slate-400">Pisteet</div>
          <b class="potti neon" style="font-size:1.6rem" id="pisteet">${luku(t.pisteet)}</b></div>
      </div>
      <div class="aikapalkki mb-3" id="aika"><i style="width:100%"></i></div>
      <div class="kuvalaatikko mx-auto" id="laatikko">
        <img id="img" alt="Arvattava kuva" draggable="false" style="${lahikuvaTyyli(kr)}">
        <div class="ruudukko" id="ruudukko">${t.k.auki.map((a, i) => `<button class="ruutu paikka-${P.paikka(i)}" style="--n:${i}" data-r="${i}">${i + 1}</button>`).join("")}</div>
      </div>
      <div id="peliala">
      <div class="my-2 flex items-center justify-between text-sm text-slate-400"><span class="taso taso-${kr.taso}" id="taso">${TASO_NIMI[kr.taso]}</span><span id="sulaa"></span></div>
      <div id="ala">
        <button class="nappi paa" id="tiedan">Tiedän! <small>näytä vaihtoehdot · ${S.VASTAUSAIKA} s aikaa · yksi vastaus</small></button>
      </div>
      </div>`;
    kotiNappi(true);
    tallennaKesken(true);
    ["potti", "pisteet", "aika", "laatikko", "ruudukko", "ala", "sulaa", "img"].forEach(k => el[k] = document.getElementById(k));
    // Tailwind luo tyylit hetken viiveellä, joten mitoitus myös seuraavalla piirtokerralla ja kuvan latauduttua
    sovita(); requestAnimationFrame(sovita); setTimeout(sovita, 150);
    el.img.onload = () => { kuvaValmis = true; viimeksi = performance.now(); sovita(); };
    el.img.onerror = () => { kuvaValmis = true; viimeksi = performance.now(); toast("Kuva ei latautunut"); };
    el.img.src = "kuvat/" + kr.kuva.id + ".webp";
    paivitaHinnat();
    // Esilataa seuraava
    const seur = t.kierrokset[t.i + 1];
    if (seur) { const i = new Image(); i.src = "kuvat/" + seur.kuva.id + ".webp"; }
    el.ruudukko.querySelectorAll("[data-r]").forEach(b => b.onclick = () => avaaRuutu(Number(b.dataset.r)));
    document.getElementById("tiedan").onclick = tiedan;
    document.onkeydown = e => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (t && t.k && !t.k.valmis) {
        if (!t.k.tiedan && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); tiedan(); return; }
        const v = "abcd".indexOf(e.key.toLowerCase());
        if (t.k.tiedan && v >= 0 && e.key.length === 1) valitse(v);
      } else if (document.getElementById("tieto")) {
        if (e.key === "Enter" || e.key === " " || e.key === "Escape" || e.key.toLowerCase() === "i") { e.preventDefault(); suljeTieto(); }
      } else if (e.key === "Enter" || e.key === " ") {
        const b = document.getElementById("seuraava"); if (b) { e.preventDefault(); b.click(); }
      } else if (e.key.toLowerCase() === "i") {
        const b = document.getElementById("info"); if (b) { e.preventDefault(); b.click(); }
      }
    };
    paivita();
    viimeksi = performance.now();
    clearInterval(ajastin); ajastin = setInterval(silmukka, 100);
  }

  // Seinäkello: aika kuluu myös, kun sovellus on taustalla (muuten kuvaa voisi googlata kellon seistessä)
  function silmukka() {
    if (!t || !t.k) return;
    const nyt = performance.now(), dt = (nyt - viimeksi) / 1000; viimeksi = nyt;
    if (kuvaValmis && !t.k.valmis) {
      const loppui = P.kulu(t, dt);
      if (loppui) { AANI.aika(); varise(200); return paljasta(); }
      kiireAani();
    }
    paivita();
  }

  function paivita() {
    if (!t || !t.k) return;
    el.potti.textContent = luku(P.potti(t));
    if (!t.k.valmis) paivitaHinnat();  // hinta on osuus potista, joten se pienenee ajan kuluessa
    const j = P.jaljella(t);
    el.aika.firstElementChild.style.width = (100 * j / S.AIKA) + "%";
    const vaihe = kiireVaihe();
    el.aika.classList.toggle("kiire", vaihe >= 1);
    el.aika.classList.toggle("hata", vaihe >= 2);
    if (kuvaValmis && !t.k.valmis) el.sulaa.textContent = "sulaa " + P.sulamisvauhti(t) + " p/s";
  }
  // Kiire jäljellä olevan ajan mukaan: alle 9 s punainen ja vilkkuva, alle 3,6 s hätä (vilkunta kiihtyy, palkki tärisee)
  function kiireVaihe() {
    if (!t || !t.k || t.k.valmis) return 0;
    const j = P.jaljella(t);
    return j <= S.AIKA * 0.12 ? 2 : j <= S.AIKA * 0.3 ? 1 : 0;
  }
  // Syke kuvan alusta: 60 lyönnistä minuutissa (väli 1 s) 180:een (0,33 s) sitä mukaa kuin aika vähenee; hädässä värinä
  function kiireAani() {
    const kulunut = t.k.aika;
    if (kulunut < seuraavaTikki) return;
    const p = 1 - P.jaljella(t) / S.AIKA;
    AANI.syke(p);
    if (kiireVaihe() === 2) varise([25, 120, 15]);
    seuraavaTikki = kulunut + 1 - 0.67 * p * p;
  }
  function napsauta(elm) { elm.classList.remove("miinus"); void elm.offsetWidth; elm.classList.add("miinus"); }

  function avaaRuutu(r) {
    if (!t || !kuvaValmis || !P.avaa(t, r)) return;
    el.ruudukko.children[r].classList.add("auki");
    paivitaHinnat();
    AANI.ruutu(); napsauta(el.potti); paivita();
  }
  // Kiinni olevien ruutujen hinnat pisteinä: osuus nykyisestä potista, osuus kasvaa jokaisen avauksen jälkeen
  function paivitaHinnat() {
    el.ruudukko.querySelectorAll(".ruutu:not(.auki)").forEach(b => {
      const r = Number(b.dataset.r), h = P.hinta(t, r);
      b.dataset.hinta = "−" + h;
      b.setAttribute("aria-label", "Avaa ruutu " + (r + 1) + ", hinta " + h + " pistettä");
    });
  }

  // "Tiedän!": vaihtoehdot näkyviin, vastausaika alkaa ja loput ruudut kallistuvat
  function tiedan() {
    if (!t || !kuvaValmis || !P.tiedan(t)) return;
    const kr = t.kierrokset[t.i];
    seuraavaTikki = 0;
    el.ruudukko.classList.add("kallis");
    paivitaHinnat();
    el.ala.innerHTML = `<div class="vaihdot ponnahdus">${kr.vaihtoehdot.map((v, i) => `<button class="vaihto" data-v="${i}"><span class="opacity-60">${"ABCD"[i]}</span> ${esc(v)}</button>`).join("")}</div>`;
    el.ala.querySelectorAll("[data-v]").forEach(b => b.onclick = () => valitse(Number(b.dataset.v)));
    AANI.tiedan(); paivita();
  }

  function valitse(i) {
    if (!t || !kuvaValmis || t.k.valmis || !t.k.tiedan) return;
    const kr = t.kierrokset[t.i];
    const tulos = P.vastaa(t, kr.vaihtoehdot[i]);
    if (!tulos) return;
    if (tulos === "vaarin") { el.ala.querySelector(`[data-v="${i}"]`).classList.add("vaarin"); AANI.vaarin(); varise(150); }
    else { AANI.oikein(t.kierrokset[t.i].taso === 3); varise(40); }
    paljasta();
  }

  function paljasta() {
    clearInterval(ajastin); ajastin = 0;
    const kr = t.kierrokset[t.i], r = t.k.tulos;
    paivita();
    el.aika.classList.remove("kiire", "hata");
    el.laatikko.classList.add("paljastus");
    el.img.removeAttribute("style");
    const leima = r.oikein ? "Oikein!" : r.valinta ? "Väärin!" : "Aika loppui";
    // Saadut pisteet suoraan kuvan päälle (Mikko 2026-10-27)
    el.laatikko.insertAdjacentHTML("beforeend", `<div class="leima ${r.oikein ? "oikein" : "vaarin"}">${leima}<span class="leimapisteet">${r.oikein ? "+" + luku(r.ansio) : "0"} p</span></div>`);
    const tiedanNappi = document.getElementById("tiedan");
    if (tiedanNappi) tiedanNappi.remove();
    // Paljastus (Mikko 2026-10-27: neljästä värikkäästä napista ei erottanut oikeaa): oikea vihreäksi ✓, oma väärä punaiseksi ✗, muut harmaiksi
    el.ala.querySelectorAll(".vaihto").forEach((b, i) => { b.disabled = true; b.classList.add(kr.vaihtoehdot[i] === kr.oikea ? "oikea" : b.classList.contains("vaarin") ? "valittu" : "pois"); });
    el.pisteet.textContent = luku(t.pisteet);
    el.sulaa.textContent = "";
    const viim = t.i === t.kierrokset.length - 1;
    const selitys = r.oikein
      ? `<span class="text-slate-400">${esc(kr.oikea)} · ${r.avatut} ${r.avatut === 1 ? "ruutu" : "ruutua"} · ${String(r.aika).replace(".", ",")} s</span>`
      : `<span class="text-slate-300">Oikea vastaus: <b>${esc(kr.oikea)}</b></span>`;
    // Seuraava-nappi kuvan päälle, jotta se näkyy aina kuvan kanssa (Mikko 2026-10-27: Macin ikkunassa nappi jäi alas)
    el.laatikko.insertAdjacentHTML("beforeend", `<button class="nappi paa kuvanappi ponnahdus" id="seuraava">${viim ? "Tulokset" : "Seuraava kuva →"}</button>`);
    // Infonappi (Mikko 2026-10-27): pelatessa voi oppia, mutta lukeminen on vapaaehtoista. Näkyy vasta vastauksen jälkeen.
    if (kr.kuva.m) {
      el.laatikko.insertAdjacentHTML("beforeend", `<button class="infonappi ponnahdus" id="info" aria-label="Tietoa: ${esc(kr.oikea)}">i</button>`);
      document.getElementById("info").onclick = () => naytaTieto(kr.kuva);
    }
    el.ala.insertAdjacentHTML("beforeend", `
      <div class="ponnahdus mt-2 grid gap-1" id="jalki">
        <div class="flex flex-wrap items-baseline gap-x-2 text-sm">${selitys}</div>
        <p class="krediitti">Kuva: ${esc(kr.kuva.t)} · <a href="${esc(kr.kuva.u)}" target="_blank" rel="noopener">${esc(kr.kuva.l)}, Wikimedia Commons</a></p>
      </div>`);
    tallennaKesken(false);
    kotiNappi();
    document.getElementById("seuraava").onclick = () => { AANI.nappi(); if (P.seuraava(t)) kuva(); else loppu(); };
  }

  // Tietoisku Wikipedian johdannosta: mikä se on, tiesitkö ja lähdelinkki (tekstin lisenssi CC BY-SA 4.0)
  function naytaTieto(k) {
    suljeTieto(); AANI.nappi();
    document.body.insertAdjacentHTML("beforeend", `
      <div class="tietoikkuna" id="tieto" role="dialog" aria-modal="true" aria-labelledby="tietootsikko">
        <div class="tietokortti ponnahdus">
          <h2 id="tietootsikko" class="tietootsikko">${esc(k.a)}</h2>
          <p>${esc(k.m)}</p>
          ${k.k ? `<p class="tiesitko"><b>Tiesitkö?</b> ${esc(k.k)}</p>` : ""}
          <p class="krediitti">Lähde: <a href="${esc(k.w)}" target="_blank" rel="noopener">Wikipedia, lue lisää</a> · teksti CC BY-SA 4.0</p>
          <button class="nappi paa" id="tiedosulje">Selvä</button>
        </div>
      </div>`);
    const ikkuna = document.getElementById("tieto");
    ikkuna.onclick = e => { if (e.target === ikkuna) suljeTieto(); };
    document.getElementById("tiedosulje").onclick = suljeTieto;
    document.getElementById("tiedosulje").focus();
  }
  function suljeTieto() { const w = document.getElementById("tieto"); if (w) w.remove(); }

  // Kuvan koko näkyvän alueen mukaan: kaikki muu pelinäkymässä mitataan, ja kuva saa loput korkeudesta (enintään leveyden).
  // Vastausalueen korkeus on varattu valmiiksi (Tiedän!-nappi = vaihtoehdot), joten kuva ei hyppää pelin aikana.
  function sovita() {
    const laatikko = document.getElementById("laatikko");
    if (!laatikko) return;
    const korkeus = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const jalki = document.getElementById("jalki"), ala = document.getElementById("peliala");
    const ylla = laatikko.getBoundingClientRect().top + app.scrollTop;   // sivu vierii #app-alueen sisällä
    const alla = (ala ? ala.offsetHeight : 0) - (jalki ? jalki.offsetHeight + 8 : 0) + 20;
    const leveys = app.clientWidth - 32;
    const koko = Math.max(200, Math.min(leveys, Math.floor(korkeus - ylla - alla)));
    laatikko.style.width = koko + "px";
  }
  window.addEventListener("resize", sovita);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", sovita);

  // ---------- Lopputulokset ----------
  function yhteenveto() {
    const oikein = t.tulokset.filter(x => x.oikein).length;
    return `<div class="paneeli ponnahdus grid gap-1 p-5 text-center">
      <div class="text-xs uppercase tracking-widest text-slate-400">${esc(meta.otsikko)}</div>
      <div class="potti" style="font-size:3.2rem">${luku(t.pisteet)} p</div>
      <div class="text-2xl">${P.ruudukko(t.tulokset)}</div>
      <div class="text-sm text-slate-400">${oikein}/${t.tulokset.length} oikein · avattuja ruutuja ${t.tulokset.reduce((s, x) => s + x.avatut, 0)}</div>
    </div>`;
  }
  function taulu(rivit) {
    return `<ol class="taulu">${rivit.map((r, i) => `<li class="${r.mina ? "mina" : ""}${r.haamu ? " haamu" : ""}"><span class="sija">${i + 1}.</span><span class="nimi">${esc(r.nimi)}</span><span class="p">${luku(r.pisteet)}</span></li>`).join("")}</ol>`;
  }
  function jakoNapit(teksti) {
    return `<a class="nappi wa" href="https://wa.me/?text=${encodeURIComponent(teksti)}" target="_blank" rel="noopener">Jaa WhatsAppiin</a>
      <button class="nappi haamu" id="kopioi">Kopioi teksti</button>`;
  }
  function kytkeKopio(teksti) {
    const b = document.getElementById("kopioi");
    if (!b) return;
    b.onclick = async () => {
      try { await navigator.clipboard.writeText(teksti); toast("Kopioitu"); }
      catch (e) { prompt("Kopioi tästä:", teksti); }
    };
  }
  const alkuunNappi = () => `<button class="nappi haamu" id="alkuun">← Alkuun</button>`;
  function kytkeAlkuun() { const b = document.getElementById("alkuun"); if (b) b.onclick = koti; }
  // Jakolinkki (Mikko 2026-10-27): itch.io-sivu. Itchissä peli pyörii iframessa (*.itch.zone), jonka osoitetta ei voi jakaa,
  // eikä itch-sivun #-osa välity iframeen; siksi kaverihaasteessa jaetaan koodi. Omalla palvelimella (esim. GitHub Pages)
  // käytetään sivun omaa osoitetta ja #haaste-linkkiä.
  const PELIN_SIVU = "https://komentorivi.itch.io/whatisthis";
  // Itse julkaistu versio (GitHub Pages, Mikko 2026-10-28): siellä #haaste-linkki kuljettaa koodin, joten kaverihaasteen
  // linkki osoittaa aina sinne, myös itchistä jaettuna
  const PAGES = "https://komentorivi.github.io/mika-taa-o-peli/";
  const omaPalvelin = () => /^https?:/.test(location.protocol) && !/(itch\.zone|itch\.io|hwcdn\.net)$/.test(location.hostname);
  function osoite() { return omaPalvelin() ? location.origin + location.pathname : PELIN_SIVU; }

  function loppu() {
    AANI.loppu();
    poistaKesken();
    const tulos = { pisteet: t.pisteet, ruudukko: P.ruudukko(t.tulokset), oikein: t.tulokset.filter(x => x.oikein).length, kuvia: t.tulokset.length };
    if (meta.tyyppi === "liiga") return liigaLoppu();
    if (meta.tyyppi === "paiva") {
      const paiva = lue("paiva", {});
      if (!paiva[meta.pv]) { paiva[meta.pv] = tulos; kirjoita("paiva", paiva); VERKKO.laheta("paiva", t.pisteet, "paiva:" + meta.pv, "paiva:" + meta.pv, nimi()).then(() => maailma("paiva")); }
      return paivaLoppu(paiva[meta.pv], yhteenveto());
    }
    const h = haaste(meta.h.koodi);
    h.oma = t.pisteet;
    yhdista(h, { [nimi()]: t.pisteet });
    tallennaHaaste(meta.h.koodi, h);
    const hh = meta.h;
    VERKKO.laheta("kaveri", t.pisteet, "haaste:" + hh.koodi, hh.siemen, nimi(), hh.koodi).then(() => haasteVerkosta(hh));
    haasteTaulu(meta.h, yhteenveto());
  }

  // Globaali tulostaulu (verkko.js, LootLocker). Näkyy vain, jos pelin avain on asetettu; ilman verkkoa peli toimii kuten ennen.
  function maailmaPaikka() { return VERKKO.kaytossa ? `<section class="mt-5" id="maailma"><h2 class="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">Koko maailma</h2><p class="text-sm text-slate-400">Ladataan…</p></section>` : ""; }
  function maailma(taulu, maara) {
    const paikka = document.getElementById("maailma");
    if (!paikka || !VERKKO.kaytossa) return;
    VERKKO.lista(taulu, maara || 10).then(rivit => {
      const p = document.getElementById("maailma"); if (!p) return;
      p.innerHTML = `<h2 class="mb-2 text-sm font-bold uppercase tracking-widest text-slate-400">Koko maailma · ${taulu === "liiga" ? "viikon parhaat" : "tämän päivän parhaat"}</h2>` + (rivit && rivit.length
        ? `<ol class="taulu">${rivit.map(r => `<li class="${r.mina ? "mina" : ""}"><span class="sija">${r.sija}.</span><span class="nimi">${esc(r.nimi)}</span><span class="p">${luku(r.pisteet)}</span></li>`).join("")}</ol>`
        : `<p class="text-sm text-slate-400">Ei vielä tuloksia. Ole ensimmäinen!</p>`);
    }, () => { const p = document.getElementById("maailma"); if (p) p.innerHTML = `<p class="text-sm text-slate-400">Globaalia tulostaulua ei saatu (ei yhteyttä). Tuloksesi lähtee myöhemmin.</p>`; });
  }

  // Tulostaulut etusivulta (Mikko 2026-10-28): globaalit listat selattavissa ilman pelaamista
  function tulostaulut(valittu) {
    pysayta();
    const omat = valittu === "liiga"
      ? `<h2 class="mb-2 mt-5 text-sm font-bold uppercase tracking-widest text-slate-400">Oma liiga (haamut)</h2>${taulu(liigaTaulu())}`
      : "";
    app.innerHTML = `
      ${ylapalkki("Tulostaulut")}
      <div class="valinta valilehdet mb-3" role="tablist">
        <button data-t="liiga" class="${valittu === "liiga" ? "on" : ""}">Viikkoliiga</button>
        <button data-t="paiva" class="${valittu === "paiva" ? "on" : ""}">Päivän haaste</button>
      </div>
      ${VERKKO.kaytossa ? `<section id="maailma"><p class="text-sm text-slate-400">Ladataan…</p></section>` : `<p class="text-sm text-slate-400">Globaali tulostaulu ei ole käytössä tässä versiossa.</p>`}
      ${omat}
      <div class="mt-4">${alkuunNappi()}</div>`;
    kotiNappi(); kytkeAlkuun();
    app.querySelectorAll("[data-t]").forEach(b => b.onclick = () => tulostaulut(b.dataset.t));
    if (VERKKO.kaytossa) maailma(valittu, 20);
  }

  function liigaLoppu() {
    const l = liigaNyt();
    const ennen = liigaTaulu().findIndex(r => r.mina) + 1;
    const ennatys = l.ottelut > 0 && t.pisteet > l.paras;
    l.pisteet += t.pisteet; l.ottelut++; l.paras = Math.max(l.paras, t.pisteet);
    kirjoita("liiga", l);
    VERKKO.laheta("liiga", t.pisteet, meta.siemen, meta.siemen, nimi()).then(() => maailma("liiga"));
    const nahdyt = [...new Set(lue("nahdyt", []).concat(t.tulokset.map(x => x.id)))];
    kirjoita("nahdyt", nahdyt.slice(-Math.floor(KUVAT.length * 0.8)));
    const rivit = liigaTaulu(), sija = rivit.findIndex(r => r.mina) + 1;
    const nousu = ennen - sija;
    const yht = yhteenveto();
    pysayta();
    app.innerHTML = `
      ${ylapalkki("Viikkoliiga")}
      ${yht}
      <div class="my-4 text-center text-lg font-extrabold">${nousu > 0 ? `Nousit ${nousu} sijaa! Nyt ${sija}.` : `Sijasi: ${sija}.`} <span class="text-sm font-normal text-slate-400">Viikon paras ${luku(l.paras)} p · ${l.ottelut} ${l.ottelut === 1 ? "ottelu" : "ottelua"}${ennatys ? " · uusi ennätys!" : ""}</span></div>
      <div class="mb-4 grid grid-cols-2 gap-2"><button class="nappi paa" id="uusi">Uusi ottelu</button>${alkuunNappi()}</div>
      ${taulu(rivit)}
      ${maailmaPaikka()}`;
    kotiNappi(); kytkeAlkuun(); maailma("liiga");
    document.getElementById("uusi").onclick = aloitaLiiga;
  }

  function paivaLoppu(tulos, yht) {
    pysayta();
    const putki = P.putkiPaivina(lue("paiva", {}), new Date());
    const rivi = String(tulos.ruudukko).replace(/🟩/g, "✅").replace(/🟥/g, "❌");   // vanhat tallennetut tulokset
    const teksti = P.jakoPaiva(luku(tulos.pisteet).replace(/\s/g, " "), putki) + "\n" + rivi + (osoite() ? "\n" + osoite() : "");
    app.innerHTML = `
      ${ylapalkki("Päivän haaste")}
      ${yht || `<div class="paneeli grid gap-1 p-5 text-center"><div class="text-xs uppercase tracking-widest text-slate-400">Tänään pelattu</div><div class="potti" style="font-size:3.2rem">${luku(tulos.pisteet)} p</div><div class="text-2xl">${rivi}</div></div>`}
      <div class="my-4 text-center text-2xl font-extrabold">🔥 ${putki} ${putki === 1 ? "päivä" : "päivää"} putkeen!</div>
      <p class="mb-4 text-center text-sm text-slate-400">Uusi haaste huomenna. Kaikki pelaavat tänään samat viisi kuvaa.</p>
      <div class="grid gap-2">${jakoNapit(teksti)}<button class="nappi syaani" id="liigaan">Pelaa viikkoliigaa</button>${alkuunNappi()}</div>
      ${maailmaPaikka()}`;
    kotiNappi(); kytkeKopio(teksti); kytkeAlkuun(); maailma("paiva");
    document.getElementById("liigaan").onclick = aloitaLiiga;
  }

  // Kaverihaasteen tulokset LootLockerista (Mikko 2026-10-28: itchissä kaverin tulos ei kulkenut linkissä ja katosi)
  function haasteVerkosta(h) {
    if (!VERKKO.kaytossa) return;
    VERKKO.haasteTulokset(h.koodi).then(rivit => {
      const tila = haaste(h.koodi), ennen = JSON.stringify(tila.tulokset);
      yhdista(tila, Object.fromEntries((rivit || []).map(r => [r.nimi, r.pisteet])));
      if (JSON.stringify(tila.tulokset) !== ennen) tallennaHaaste(h.koodi, tila);
      const paikka = document.getElementById("haastetaulu");
      if (!paikka || paikka.dataset.koodi !== h.koodi) return;
      const rr = Object.entries(tila.tulokset).map(([n, p]) => ({ nimi: n, pisteet: p, mina: n === nimi() })).sort((a, b) => b.pisteet - a.pisteet);
      paikka.innerHTML = rr.length ? taulu(rr) : `<p class="text-slate-400">Ei vielä tuloksia.</p>`;
      const tilaRivi = document.getElementById("haastetila"); if (tilaRivi) tilaRivi.textContent = "Mukana kaikki, jotka ovat pelanneet koodilla " + h.koodi + ".";
    }, () => { const tilaRivi = document.getElementById("haastetila"); if (tilaRivi) tilaRivi.textContent = "Kavereiden tuloksia ei saatu (ei yhteyttä)."; });
  }

  function haasteTaulu(h, yht) {
    pysayta();
    const tila = haaste(h.koodi);
    const rivit = Object.entries(tila.tulokset).map(([n, p]) => ({ nimi: n, pisteet: p, mina: n === nimi() })).sort((a, b) => b.pisteet - a.pisteet);
    // Tulokset kulkevat LootLockerissa, joten linkissä riittää koodi; ilman verkkoa tulokset kulkevat linkissä kuten ennen
    const linkki = (omaPalvelin() ? osoite() : PAGES) + "#haaste=" + h.koodi + (VERKKO.kaytossa ? "" : "&t=" + encodeURIComponent(P.tuloksetLinkkiin(tila.tulokset)));
    const karki = rivit[0];
    const teksti = `Mikä tää o? -kaverihaaste ${h.koodi}\n` + (tila.oma != null ? `Sain ${luku(tila.oma).replace(/\s/g, " ")} p. ` : "") + `Pystytkö parempaan?\n` +
      `Pelaa samat kuvat tästä:\n${linkki}` + (karki ? `\nKärjessä: ${karki.nimi} ${luku(karki.pisteet).replace(/\s/g, " ")} p` : "");
    app.innerHTML = `
      ${ylapalkki("Kaverihaaste " + h.koodi)}
      ${yht || ""}
      <div class="paneeli my-4 grid gap-1 p-4 text-center">
        <div class="text-xs uppercase tracking-widest text-slate-400">Haastekoodi</div>
        <div class="logo kelta text-4xl tracking-widest">${esc(h.koodi)}</div>
        <div class="text-sm text-slate-400">${h.n} kuvaa · kaikki pelaavat samat kuvat</div>
      </div>
      <h2 class="mb-2 font-extrabold">Ryhmän tulostaulu</h2>
      <div id="haastetaulu" data-koodi="${esc(h.koodi)}">${rivit.length ? taulu(rivit) : `<p class="text-slate-400">Ei vielä tuloksia.</p>`}</div>
      ${VERKKO.kaytossa ? `<p class="mt-1 text-xs text-slate-400" id="haastetila">Haetaan kavereiden tuloksia…</p>` : ""}
      <p class="my-3 text-xs text-slate-400">Kaverit avaavat linkin ja pelaavat samat kuvat. Kaikkien tulokset näkyvät tässä taulussa.</p>
      <div class="grid gap-2">
        ${tila.oma == null ? `<button class="nappi paa" id="pelaa">Pelaa haaste</button>` : ""}
        ${jakoNapit(teksti)}
        ${alkuunNappi()}
      </div>`;
    kotiNappi(); kytkeKopio(teksti); kytkeAlkuun();
    haasteVerkosta(h);
    const p = document.getElementById("pelaa");
    if (p) p.onclick = () => avaaHaaste(h, {});
  }

  // ---------- Käynnistys: linkin haaste ensin ----------
  function kaynnista() {
    const q = P.lueHash(location.hash);
    const h = q.haaste && P.lueKoodi(q.haaste);
    if (h) {
      history.replaceState(null, "", location.pathname + location.search);
      const jatka = () => {
        const tila = haaste(h.koodi);
        yhdista(tila, P.tuloksetLinkista(q.t));
        tallennaHaaste(h.koodi, tila);
        haasteTaulu(h);
      };
      return nimi() ? jatka() : kysyNimi(jatka);
    }
    koti();
  }
  if (typeof KUVAT === "undefined" || !KUVAT.length) { app.innerHTML = "<p class='p-6'>Kuvadata puuttuu (data/kuvat.js).</p>"; return; }
  kaynnista();
})();
