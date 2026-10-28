// Globaali tulostaulu LootLockerin Game API:lla (Mikko 2026-10-27). Pelin avain on tiedostossa lootlocker.js
// (gitignoressa, Mikko luo sen itse: const LOOTLOCKER_AVAIN = "…";). Ilman avainta peli toimii kuten ennenkin.
// Tietoturva: selainpeli ilman omaa palvelinta voi aina lähettää keksityn tuloksen, koska Game API -kirjoitukset on sallittava.
// Siksi tulos tarkistetaan ennen lähetystä (kokonaisluku, mahdollisen ottelun rajoissa), kustakin ottelusta lähtee yksi tulos,
// siemen kulkee metadatassa jälkitarkistusta varten ja nimet esitetään aina escapattuina. Lista pitää viikon/päivän parhaan,
// kun leaderboardin asetus "Overwrite score on submit" on pois päältä.
const VERKKO = (() => {
  const API = "https://api.lootlocker.io/game";
  const TAULUT = { liiga: 37509, paiva: 37510, kaveri: 37514 };   // kaveri on Generic-taulu: jäsen = "KOODI:pelaaja"
  // Suurin mahdollinen tulos: ottelussa potit 3 × 1000 + 4 × 1250 + 3 × 1500, päivän haasteessa 2 × 1000 + 2 × 1250 + 1500
  // kaverihaasteessa enintään 15 kuvaa: 5 × 1000 + 6 × 1250 + 4 × 1500
  const RAJAT = { liiga: 12500, paiva: 6000, kaveri: 18500 };
  // Testiajuri (testit/selain.swift) avaa pelin osoitteella ?ui=n: silloin ei lähetetä mitään oikeaan tulostauluun
  const testi = typeof location !== "undefined" && /[?&]ui=/.test(location.search);
  const avain = !testi && typeof LOOTLOCKER_AVAIN === "string" ? LOOTLOCKER_AVAIN.trim() : "";
  const VERSIO = "1.0.0";
  let istunto = null;

  const lue = (k, oletus) => { try { const v = localStorage.getItem("mto.ll." + k); return v == null ? oletus : JSON.parse(v); } catch (e) { return oletus; } };
  const kirjoita = (k, v) => { try { localStorage.setItem("mto.ll." + k, JSON.stringify(v)); } catch (e) {} };

  function kelpaa(taulu, pisteet) {
    return taulu in TAULUT && Number.isInteger(pisteet) && pisteet > 0 && pisteet <= RAJAT[taulu];
  }

  async function pyynto(polku, asetukset) {
    const ohjain = new AbortController(), ajastin = setTimeout(() => ohjain.abort(), 8000);
    try {
      const otsakkeet = { "Content-Type": "application/json" };
      if (istunto) otsakkeet["x-session-token"] = istunto.token;
      const vastaus = await fetch(API + polku, Object.assign({ headers: otsakkeet, signal: ohjain.signal }, asetukset));
      const data = await vastaus.json().catch(() => ({}));
      if (!vastaus.ok) throw new Error("LootLocker " + vastaus.status + ": " + (data.message || data.error || ""));
      return data;
    } finally { clearTimeout(ajastin); }
  }

  // Vierasistunto: pelaajan tunniste on satunnainen ja pysyy selaimessa, joten sama pelaaja pysyy samana
  async function kirjaudu() {
    if (istunto) return istunto;
    let tunniste = lue("tunniste", "");
    if (!tunniste) { tunniste = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()).replace(/[^\w-]/g, ""); kirjoita("tunniste", tunniste); }
    const d = await pyynto("/v2/session/guest", { method: "POST", body: JSON.stringify({ game_key: avain, game_version: VERSIO, player_identifier: tunniste }) });
    istunto = { token: d.session_token, pelaaja: d.player_id, nimi: d.player_name || "" };
    return istunto;
  }

  // Verrataan palvelimen nimeen eikä selaimen muistiin, ettei tulos jää nimettömäksi, jos nimen asetus on joskus epäonnistunut
  async function asetaNimi(nimi) {
    const siisti = String(nimi || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);
    if (!siisti) throw new Error("nimi puuttuu");
    if (istunto.nimi === siisti) return;
    await pyynto("/player/name", { method: "PATCH", body: JSON.stringify({ name: siisti }) });
    istunto.nimi = siisti;
  }

  // Lähetysjono: jos verkko ei toimi, tulos odottaa selaimessa ja lähtee seuraavalla kerralla. Yksi tulos per ottelu (tunnus).
  async function tyhjenna(nimi) {
    if (!avain) return;
    const jono = lue("jono", []);
    if (!jono.length) return;
    await kirjaudu();
    await asetaNimi(nimi);   // ilman nimeä tulos jää jonoon ja lähtee seuraavalla kerralla
    const lahetetyt = lue("lahetetyt", []);
    for (const r of jono.slice()) {
      if (!lahetetyt.includes(r.tunnus)) {
        const runko = { score: r.pisteet, metadata: r.meta };
        if (r.koodi) runko.member_id = r.koodi + ":" + istunto.pelaaja;   // Generic-taulu: yksi rivi per haaste ja pelaaja
        await pyynto("/leaderboards/" + TAULUT[r.taulu] + "/submit", { method: "POST", body: JSON.stringify(runko) });
        lahetetyt.push(r.tunnus);
        kirjoita("lahetetyt", lahetetyt.slice(-200));
      }
      kirjoita("jono", lue("jono", []).filter(x => x.tunnus !== r.tunnus));
    }
  }

  function laheta(taulu, pisteet, tunnus, siemen, nimi, koodi) {
    if (!avain || !kelpaa(taulu, pisteet)) return Promise.resolve(false);
    const jono = lue("jono", []);
    if (!jono.some(x => x.tunnus === tunnus) && !lue("lahetetyt", []).includes(tunnus)) {
      const siistiNimi = String(nimi || "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 24);
      jono.push({ taulu, pisteet, tunnus, koodi: koodi || null, meta: JSON.stringify({ s: String(siemen).slice(0, 60), v: VERSIO, n: siistiNimi }) });
      kirjoita("jono", jono.slice(-20));
    }
    return tyhjenna(nimi).then(() => true, () => false);
  }

  // Lista: [{ sija, nimi, pisteet, mina }]
  async function lista(taulu, maara) {
    if (!avain) return null;
    await kirjaudu();
    const d = await pyynto("/leaderboards/" + TAULUT[taulu] + "/list?count=" + (maara || 20), { method: "GET" });
    return (d.items || []).map(x => ({
      sija: x.rank, pisteet: x.score,
      nimi: (x.player && x.player.name) || "Pelaaja " + ((x.player && x.player.public_uid) || "").slice(0, 4),
      mina: !!(x.player && istunto && x.player.id === istunto.pelaaja)
    }));
  }

  // Kaverihaasteen tulokset kaikilta, jotka ovat pelanneet saman koodin (itchin kehyksessä linkki ei kuljeta tuloksia).
  // Generic-taulusta haetaan sivuittain ja suodatetaan koodin mukaan; pieneen peliin riittää muutama tuhat riviä.
  async function haasteTulokset(koodi) {
    if (!avain) return null;
    await kirjaudu();
    const alku = koodi + ":", tulos = [];
    let jalkeen = null;
    for (let sivu = 0; sivu < 5; sivu++) {
      const d = await pyynto("/leaderboards/" + TAULUT.kaveri + "/list?count=500" + (jalkeen != null ? "&after=" + jalkeen : ""), { method: "GET" });
      const rivit = d.items || [];
      rivit.forEach(x => {
        if (!String(x.member_id || "").startsWith(alku)) return;
        let nimi = ""; try { nimi = JSON.parse(x.metadata || "{}").n || ""; } catch (e) {}
        tulos.push({ nimi, id: String(x.member_id).slice(alku.length), pisteet: x.score, mina: istunto && String(x.member_id) === alku + istunto.pelaaja });
      });
      if (rivit.length < 500 || !d.pagination || d.pagination.next_cursor == null) break;
      jalkeen = d.pagination.next_cursor;
    }
    // Generic-taulu ei palauta pelaajaa, ja metadata kulkee vain, jos taululla on Metadata-asetus: nimet haetaan pelaajatunnisteista
    const haettavat = [...new Set(tulos.filter(t => !t.nimi && /^\d+$/.test(t.id)).map(t => t.id))].slice(0, 50);
    if (haettavat.length) {
      const d = await pyynto("/player/lookup/name?" + haettavat.map(i => "player_id=" + i).join("&"), { method: "GET" }).catch(() => ({}));
      const nimet = Object.fromEntries((d.players || []).map(p => [String(p.player_id), p.name]));
      tulos.forEach(t => { if (!t.nimi) t.nimi = nimet[t.id] || "Pelaaja " + t.id.slice(-4); });
    }
    return tulos.map(({ nimi, pisteet, mina }) => ({ nimi: nimi || "Nimetön", pisteet, mina }));
  }

  return { kaytossa: !!avain, kelpaa, laheta, lista, haasteTulokset, tyhjenna, TAULUT, RAJAT };
})();
