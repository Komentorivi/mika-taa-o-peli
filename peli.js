// Mikä tää o? – pelilogiikka ilman DOMia. app.js piirtää, tämä laskee. Testit: testit/aja.sh (JavaScriptCore).
const PELI = (() => {
  // Säännöt (Mikko 2026-10-27): ei kirjoittamista. Avaat ruutuja, painat "Tiedän!", näet neljä samannäköistä vaihtoehtoa
  // ja vastaat kerran. Keskiruudut kertovat eniten ja maksavat eniten.
  const S = {
    POTTI: 1000,        // kuvan pistepotti alussa tasolla 1
    // Vaikeus nousee ottelun aikana (Mikko 2026-10-27): koko kuva → lähikuva → tiukka lähikuva, isompi potti.
    // Zoom 1,5 / 2 meni eläimissä liian lähelle (pelkkää turkkia), joten 1,25 / 1,5.
    TASOT: [null, { zoom: 1, potti: 1000 }, { zoom: 1.25, potti: 1250 }, { zoom: 1.5, potti: 1500 }],
    SIIRTO: 0.4,        // lähikuvan keskipiste siirtyy sivuun enintään tämän osuuden sallitusta
    // Potti sulaa kiihtyvästi ja on tyhjä täsmälleen, kun kokonaisaika loppuu (Mikko 2026-10-27: pisteet olivat nollassa
    // ennen kiireen tuntua). Sulanut osuus = A·x + B·x², x = kulunut osa kokonaisajasta (10 s: 19 %, 20 s: 52 %, 30 s: 100 %).
    SULAA_A: 0.35, SULAA_B: 0.65,
    AIKA: 30,           // kokonaisaika sekunteina; "Tiedän!" ei pidennä sitä
    RUUDUT: 16,         // 4×4, kaikki kiinni alussa
    // Ruutu maksaa osuuden jäljellä olevasta potista (Mikko 2026-10-27: kiinteät hinnat veivät potin nollaan): 1. ruutu 8 %,
    // 2. 10 %, 3. 12 % ja +2 % joka avauksella, kerrottuna sijainnilla (kulma 0,6, reuna 1, keskusta 1,5) ja "Tiedän!"-
    // painalluksen jälkeen kahdella, enintään 60 %. Pottia jää aina jotain; vain aika vie sen nollaan.
    OSUUS_ALKU: 0.08, OSUUS_ASKEL: 0.02, OSUUS_MAX: 0.6,
    PAIKKA: { kulma: 0.6, reuna: 1, keski: 1.5 },
    JALKEEN: 2,
    VASTAUSAIKA: 10,    // enintään näin monta sekuntia vastata "Tiedän!"-painalluksen jälkeen (tai vähemmän, jos kokonaisaika loppuu)
    LIIGA_KUVIA: 10, PAIVA_KUVIA: 5
  };

  // Siemenellinen satunnaisuus: sama siemen antaa kaikille saman kuvasetin ja vaihtoehdot
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = typeof seed === "number" ? seed >>> 0 : hash(String(seed));
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function sekoita(arr, r) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  // Kuvasetti: n kuvaa siemenestä. Liigassa jo nähdyt siirtyvät jonon perälle, haasteissa ei (kaikille sama setti).
  function valitse(kuvat, n, siemen, nahdyt) {
    const r = rng("setti:" + siemen);
    let jono = sekoita(kuvat, r);
    if (nahdyt && nahdyt.length) {
      const s = new Set(nahdyt);
      jono = jono.filter(k => !s.has(k.id)).concat(jono.filter(k => s.has(k.id)));
    }
    // Sama kategoria vain kerran pelissä (Mikko 2026-10-27: eläimiä tuli peräkkäin). Jos kuvia pyydetään enemmän kuin
    // kategorioita on, aloitetaan uusi kierros, mutta edellisen kuvan kategoria ei tule heti perään.
    const valitut = [], kaytetyt = new Set();
    while (valitut.length < Math.min(n, kuvat.length)) {
      let i = jono.findIndex(k => !kaytetyt.has(k.c));
      if (i < 0) {
        kaytetyt.clear(); kaytetyt.add(valitut[valitut.length - 1].c);
        i = jono.findIndex(k => !kaytetyt.has(k.c));
        if (i < 0) i = 0;
      }
      const k = jono.splice(i, 1)[0];
      valitut.push(k); kaytetyt.add(k.c);
    }
    return valitut.map((k, i) => {
      const tasoN = taso(i, valitut.length);
      return Object.assign(kierros(k, kuvat, rng("kierros:" + siemen + ":" + i), tasoN), lahikuva(tasoN, rng("zoom:" + siemen + ":" + i)));
    });
  }
  // Taso kuvan paikan mukaan: ensimmäiset 30 % koko kuvia, seuraavat 40 % lähikuvia, loput tiukkoja lähikuvia
  function taso(i, n) { return i < Math.round(n * 0.3) ? 1 : i < Math.round(n * 0.7) ? 2 : 3; }
  // Lähikuvan keskipiste (0–1) siirretään vähän sivuun, mutta vain 40 % sallitusta, jottei kohde rajaudu pois
  function lahikuva(tasoN, r) {
    const T = S.TASOT[tasoN], vara = (1 - 1 / T.zoom) / 2 * S.SIIRTO;
    return { taso: tasoN, zoom: T.zoom, potti: T.potti, kx: 0.5 + (r() * 2 - 1) * vara, ky: 0.5 + (r() * 2 - 1) * vara };
  }
  // Harhautukset: samannäköisten ryhmästä (pöllöt, sienet, linnat…) taso − 1 kappaletta, loput samasta aiheesta muista ryhmistä.
  // Mikko 2026-10-27: neljä petolintua samassa kysymyksessä oli lintutentti, ei peli. Jos aiheessa ei ole muita ryhmiä
  // (esim. taide), täytetään omasta ryhmästä ja viimeisenä muista aiheista.
  // Mikko 2026-10-27: harhautukset kuvan mukaan, ei sanalistan. Jokaisella kuvalla on käsin katsotut kuusi tuttua vaihtoehtoa
  // vaikeimmasta helpoimpaan (h). Kaikki ovat samasta aihepiiristä, mutta alussa helpompia: taso 1 = kolme viimeistä,
  // taso 2 = 2.–4., taso 3 = kolme lähintä. Ilman h-listaa vanha ryhmäpohjainen tapa.
  const HARHA_ALKU = [null, 3, 1, 0];
  function harhat(kuva, tasoN) {
    const alku = kuva.h.length >= 6 ? HARHA_ALKU[tasoN || 3] : 0;
    return kuva.h.slice(alku, alku + 3);
  }
  function kierros(kuva, kuvat, r, tasoN) {
    if (kuva.h && kuva.h.length >= 3) return { kuva, oikea: kuva.a, vaihtoehdot: sekoita([kuva.a].concat(harhat(kuva, tasoN)), r) };
    const ryhma = sekoita(kuvat.filter(k => k.r === kuva.r && k.a !== kuva.a), r);
    const kat = sekoita(kuvat.filter(k => k.c === kuva.c && k.r !== kuva.r), r);
    const muu = sekoita(kuvat.filter(k => k.c !== kuva.c && k.r !== kuva.r), r);
    const omasta = Math.max(0, (tasoN || 3) - 1);
    const jono = ryhma.slice(0, omasta).concat(kat, ryhma.slice(omasta), muu);
    const muut = jono.slice(0, 3).map(k => k.a);
    return { kuva, oikea: kuva.a, vaihtoehdot: sekoita([kuva.a].concat(muut), r) };
  }

  // Ruudun hinta: osuus potista; monesko avattava ruutu (kiihtyy) × sijainti (kulmat halvimpia, keskusta kallein) × Tiedän!-kerroin
  function paikka(r) {
    const x = r % 4, y = Math.floor(r / 4), reunaX = x === 0 || x === 3, reunaY = y === 0 || y === 3;
    return reunaX && reunaY ? "kulma" : reunaX || reunaY ? "reuna" : "keski";
  }
  function perusosuus(monesko) { return S.OSUUS_ALKU + S.OSUUS_ASKEL * monesko; }
  function osuus(t, r) {
    const k = t.k;
    return Math.min(S.OSUUS_MAX, perusosuus(k.avatut) * S.PAIKKA[paikka(r)] * (k.tiedan ? S.JALKEEN : 1));
  }
  // Hinta pisteinä juuri nyt (näytetään ruudussa)
  function hinta(t, r) { return Math.round(pottiTarkka(t) * osuus(t, r)); }

  function uusi(kierrokset) {
    return { kierrokset, i: 0, pisteet: 0, tulokset: [], k: null };
  }
  function aloita(t) {
    t.k = { auki: Array(S.RUUDUT).fill(false), avatut: 0, sailyy: 1, aika: 0, tiedan: false, tiedanAika: 0, valmis: false, tulos: null };
    return t.k;
  }
  // Potti = (alkupotti − ajan sulattama) × avattujen ruutujen jättämä osuus
  function pottiTarkka(t) {
    const k = t.k, alku = t.kierrokset[t.i].potti || S.POTTI;
    return Math.max(0, alku - sulanut(k.aika, alku)) * k.sailyy;
  }
  function potti(t) { return Math.round(pottiTarkka(t)); }
  function sulanut(s, alku) { const x = Math.min(1, s / S.AIKA); return (alku || S.POTTI) * (S.SULAA_A * x + S.SULAA_B * x * x); }
  // Sulamisnopeus pisteinä sekunnissa juuri nyt (näytetään pelaajalle)
  function sulamisvauhti(t) {
    const alku = t.kierrokset[t.i].potti || S.POTTI, x = Math.min(1, t.k.aika / S.AIKA);
    return Math.round(alku * (S.SULAA_A + 2 * S.SULAA_B * x) / S.AIKA);
  }
  // Jäljellä oleva aika: kokonaisaika, "Tiedän!"-painalluksen jälkeen enintään vastausaika (Mikko 2026-10-27: ei lisäaikaa)
  function jaljella(t) {
    const k = t.k, kokonais = S.AIKA - k.aika;
    return Math.max(0, k.tiedan ? Math.min(kokonais, S.VASTAUSAIKA - (k.aika - k.tiedanAika)) : kokonais);
  }
  function avaa(t, ruutu) {
    const k = t.k;
    if (k.valmis || !(ruutu >= 0 && ruutu < S.RUUDUT) || k.auki[ruutu]) return false;
    k.sailyy *= 1 - osuus(t, ruutu);
    k.auki[ruutu] = true; k.avatut++;
    return true;
  }
  // Kello etenee kuvan latauduttua; app.js syöttää seinäkellon ajan
  function kulu(t, dt) {
    const k = t.k;
    if (k.valmis) return false;
    k.aika += dt;
    if (jaljella(t) <= 0) { lopeta(t, false, 0); return true; }
    return false;
  }
  function tiedan(t) {
    const k = t.k;
    if (k.valmis || k.tiedan) return false;
    k.tiedan = true; k.tiedanAika = k.aika;
    return true;
  }
  // Yksi vastaus: väärä lopettaa kuvan nollaan, muuten neljästä vaihtoehdosta voisi arvata läpi
  function vastaa(t, valinta) {
    const k = t.k, kr = t.kierrokset[t.i];
    if (k.valmis || !k.tiedan || !kr.vaihtoehdot.includes(valinta)) return null;
    if (valinta !== kr.oikea) { lopeta(t, false, 0, { valinta }); return "vaarin"; }
    // Pelin aikainen putki ja kerroin poistettiin (Mikko 2026-10-27: kukaan ei ehdi seurata niitä)
    const ansio = potti(t);
    t.pisteet += ansio;
    lopeta(t, true, ansio, { valinta });
    return "oikein";
  }
  function lopeta(t, oikein, ansio, lisa) {
    const k = t.k;
    k.valmis = true;
    k.tulos = Object.assign({ id: t.kierrokset[t.i].kuva.id, oikein, ansio, aika: Math.round(k.aika * 10) / 10, avatut: k.avatut, tiedan: k.tiedan }, lisa || {});
    t.tulokset.push(k.tulos);
  }
  function seuraava(t) { t.i++; t.k = null; return t.i < t.kierrokset.length; }

  // Päivämäärät paikallisessa ajassa
  function pvm(d) { const p = n => String(n).padStart(2, "0"); return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()); }
  function viikko(d) {
    const x = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const pv = x.getUTCDay() || 7; x.setUTCDate(x.getUTCDate() + 4 - pv);
    const v1 = new Date(Date.UTC(x.getUTCFullYear(), 0, 1));
    return x.getUTCFullYear() + "-V" + String(Math.ceil(((x - v1) / 86400000 + 1) / 7)).padStart(2, "0");
  }
  // Kuinka suuri osa viikosta (ma 00:00 – su 24:00) on kulunut
  function viikonOsuus(d) {
    const pv = (d.getDay() || 7) - 1;
    return Math.min(1, (pv * 24 + d.getHours() + d.getMinutes() / 60) / 168);
  }
  // Putki: peräkkäiset päivät taaksepäin tänään tai eilen päättyen
  function putkiPaivina(pelatut, tanaan) {
    const d = new Date(tanaan.getFullYear(), tanaan.getMonth(), tanaan.getDate());
    if (!pelatut[pvm(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (pelatut[pvm(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  // Haamuvastustajat: tulos kasvaa viikon edetessä, ja jokaisella on oma tasonsa. Sama viikko antaa samat luvut.
  const HAAMUT = [
    ["Mika_92", 1.25], ["Helsinki_King", 1.45], ["Sirkka", 0.8], ["Pertti63", 0.95], ["Mökki-Maija", 1.1],
    ["Kuopion_Kone", 1.6], ["Saunavaari", 0.6], ["Oulu_Ace", 1.3], ["Lettu-Leena", 0.7], ["Rovaniemen_Rambo", 1.0],
    ["Jaana_K", 0.9], ["Tampereen_Tähti", 1.2]
  ];
  // Viikkoliiga on viikon paras ottelu (Mikko 2026-10-27: yhteenlasketut 20 000–40 000 olivat epätodellisia; hyvä ottelu on
  // 6 000–8 000). Haamun paras tulos paranee viikon mittaan, kun se "pelaa" lisää; viikon lopussa noin 1 900–8 500.
  const HAAMU_PERUS = 4250;
  function haamut(vk, osuus) {
    return HAAMUT.map(([nimi, taso]) => {
      const r = rng("haamu:" + vk + ":" + nimi);
      const vauhti = 0.75 + 0.5 * r(), alku = 0.05 * r();
      const f = Math.max(0, osuus - alku) / (1 - alku);
      return { nimi, pisteet: f > 0 ? Math.round(taso * vauhti * HAAMU_PERUS * (0.75 + 0.25 * Math.pow(f, 0.7)) / 10) * 10 : 0, haamu: true };
    });
  }

  // Kaverihaaste: koodi on viisi merkkiä ja kuvamäärä, esim. "K7F3Q-10". Ei sekoittuvia merkkejä (0/O, 1/I/L).
  const MERKIT = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function uusiKoodi(r, n) {
    let s = "";
    for (let i = 0; i < 5; i++) s += MERKIT[Math.floor(r() * MERKIT.length)];
    return s + "-" + n;
  }
  function lueKoodi(s) {
    const m = String(s || "").trim().toUpperCase().replace(/\s+/g, "").match(/^([A-Z2-9]{5})-?(5|10|15)$/);
    if (!m || [...m[1]].some(c => !MERKIT.includes(c))) return null;
    return { koodi: m[1] + "-" + m[2], n: Number(m[2]), siemen: "haaste:" + m[1] };
  }
  // Tulokset kulkevat linkissä: #haaste=K7F3Q-10&t=Mikko:3400,Liisa:2800
  function puhdasNimi(s) { return String(s || "").replace(/[,:#&=]/g, " ").replace(/\s+/g, " ").trim().slice(0, 20) || "Nimetön"; }
  function tuloksetLinkkiin(tulokset) {
    return Object.entries(tulokset).map(([n, p]) => puhdasNimi(n) + ":" + Math.round(p)).join(",");
  }
  function tuloksetLinkista(s) {
    const out = {};
    String(s || "").split(",").forEach(x => {
      const i = x.lastIndexOf(":");
      if (i < 1) return;
      const p = Number(x.slice(i + 1));
      if (Number.isFinite(p) && p >= 0 && p < 1e7) out[puhdasNimi(x.slice(0, i))] = Math.round(p);
    });
    return out;
  }
  function lueHash(h) {
    const q = {};
    String(h || "").replace(/^#/, "").split("&").forEach(x => {
      const i = x.indexOf("=");
      if (i < 1) return;
      // Osa sovelluksista koodaa linkin uudelleen jakaessaan, joten puretaan enintään kahdesti
      let v = x.slice(i + 1);
      for (let k = 0; k < 2 && /%[0-9A-Fa-f]{2}/.test(v); k++) { try { v = decodeURIComponent(v); } catch (e) { break; } }
      q[x.slice(0, i)] = v;
    });
    return q;
  }

  function jakoPaiva(pisteet, putki) {
    return "Päivän Mikä tää o? " + pisteet + " p! Streak " + putki + " pv.";
  }
  // Jaettava rivi ilman vastauksia: ✅ oikein, ❌ väärin tai aika loppui. Mikko 2026-10-28: värilliset neliöt (2019)
  // näkyivät WhatsAppissa kysymysmerkkeinä vanhemmilla laitteilla; ✅ ja ❌ (2010) toimivat kaikkialla.
  function ruudukko(tulokset) {
    return tulokset.map(x => x.oikein ? "✅" : "❌").join("");
  }

  return { S, hash, rng, sekoita, valitse, kierros, harhat, taso, lahikuva, paikka, perusosuus, osuus, hinta, sulanut, sulamisvauhti, uusi, aloita, potti, jaljella, avaa, tiedan, kulu, vastaa, seuraava,
    pvm, viikko, viikonOsuus, putkiPaivina, haamut, HAAMUT, uusiKoodi, lueKoodi, puhdasNimi, tuloksetLinkkiin, tuloksetLinkista, lueHash, jakoPaiva, ruudukko };
})();
if (typeof module !== "undefined") module.exports = PELI;
