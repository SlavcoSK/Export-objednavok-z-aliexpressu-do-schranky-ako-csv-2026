# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na získanie histórie objednávok z AliExpressu. Projekt je rozdelený na tri samostatné fázy:

1. načítanie čo najkompletnejšieho zoznamu **Orders**,
2. postupné čítanie presných údajov zo stránky **Details**,
3. konzervatívne priradenie **obrázkov priamo z produktového bloku v Details**.

Skript je zámerne konzervatívny. Ak nedokáže údaj alebo obrázok bezpečne priradiť, nič nehádá a pole nechá prázdne alebo označí ako nejasné.

## Hlavný userscript

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objednavok-z-aliexpressu-do-schranky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.12**

Parser Details zostáva zámerne nezmenený:

`0.9.11-dom-variant-v3`

Nový parser obrázkov:

`0.9.12-details-image-v1`

## Dôležité pri aktualizácii z 0.9.11

Verzia 0.9.12 **nemaže hotové Details z 0.9.11**. `DETAIL_PARSER_VERSION` zostáva rovnaký, takže už načítaná a overená vrstva Details sa zachová.

Obrázky majú vlastné kľúče v `localStorage`:

- `AE_EXPORT_SK_2026_IMAGES`,
- `AE_EXPORT_SK_2026_IMAGE_STATE`.

Vrstva obrázkov sa preto môže testovať, zastaviť, vymazať a spustiť znova bez zásahu do Orders alebo Details.

## Fáza 1 – Orders

Fáza 1 používa viac priechodov stránky Orders a zlučuje unikátne `orderId`. Aktuálne nastavenie zostáva rovnaké ako v 0.9.11:

- maximálne 12 priechodov,
- koniec po 2 nulových priechodoch za sebou,
- už známe objednávky sa medzi priechodmi nestratia.

## Fáza 2 – presné údaje z Details

Parser Details zostáva vo verzii `0.9.11-dom-variant-v3`.

Množstvo sa číta iba z `xN` bezprostredne pri cene. Samostatný riadok medzi názvom produktu a cenou má prioritu ako `productVariant`.

Tým sa zachovávajú napríklad varianty:

- `Metal 10A, Normally closed, 135C`,
- `10K`,
- `32P, Bottom Contact, 0.5MM`,
- `20PCS`,
- technické varianty tlakových snímačov.

## Fáza 3 – obrázky z Details

Nové tlačidlo:

**3. Načítať obrázky z Details**

Fáza 3 používa iba už hotové objednávky Details, ktoré obsahujú aspoň jednu produktovú položku. Historické objednávky bez detailných položiek sa automaticky preskočia.

Skript znovu otvorí stránku Details a pri každej overenej položke najprv nájde jej konkrétny DOM blok podľa kombinácie:

- poradia položky,
- `productUrl`,
- názvu,
- variantu,
- ceny,
- množstva.

Obrázok sa potom hľadá **iba v tom istom produktovom bloku**. Skript neberie všeobecný obrázok zo stránky a nepriraďuje obrázky podľa podobnosti názvu mimo daného bloku.

### Stavy obrázka

Každá položka vo vrstve `images` môže mať:

- `detailImageStatus = "ok"` – obrázok bol bezpečne priradený,
- `detailImageStatus = "not-found"` – v bloku sa nenašiel použiteľný obrázok,
- `detailImageStatus = "ambiguous"` – existuje viac podobne silných kandidátov alebo je kandidát slabý,
- `detailImageStatus = "unmapped-item-block"` – aktuálny DOM blok položky nebolo možné bezpečne spojiť s uloženou položkou Details.

Pri `ambiguous` sa `detailImageUrl` zámerne nechá prázdny. Pre kontrolu sa môžu uložiť najlepšie kandidátske URL a ich skóre.

### Ukladané polia obrázka

Pri každej položke sa ukladajú najmä:

- `itemIndex`,
- `productUrl`,
- `productTitle`,
- `productVariant`,
- `itemPrice`,
- `productQuantity`,
- `detailImageUrl`,
- `detailImageSource`,
- `detailImageStatus`,
- `detailImageScore`,
- `detailImageWidth`,
- `detailImageHeight`,
- `detailImageUrlSource`,
- `detailImageCandidateCount`,
- `detailImageCandidates`,
- `detailImageNote`.

Ak je obrázok prijatý, typický zdroj je:

`details-same-item-block`

## Ako sa kandidát obrázka hodnotí

Parser používa konzervatívne skóre. Silnými znakmi sú najmä:

- obrázok je vo vnútri odkazu na rovnaký `productUrl`,
- URL vyzerá ako produktové CDN AliExpressu,
- cesta obsahuje `/kf/`,
- obrázok má rozumné rozmery,
- `alt` alebo `title` sa prekrýva s názvom produktu.

Naopak logá, avatary, ikony, vlajky, kupóny, platobné symboly a podobné UI obrázky dostávajú záporné skóre.

Ak dva rozdielne obrázky vyjdú príliš podobne, skript ich označí ako `ambiguous` a nič automaticky nepriradí.

## Lazy-loading obrázkov

Pred čítaním obrázkov skript každý bezpečne priradený produktový blok krátko posunie do viditeľnej časti stránky. Tým dá AliExpressu možnosť načítať lazy-loaded `img`.

Skript kontroluje okrem `src` aj napríklad:

- `data-src`,
- `data-original`,
- `data-lazy-src`,
- `currentSrc`,
- `srcset`.

## Obnova po prerušení

Fáza obrázkov má samostatný stav v `localStorage`.

Ak ju zastavíte tlačidlom **Zastaviť obrázky**, už získané obrázky zostanú uložené. Pri ďalšom spustení skript ponúkne pokračovanie od poslednej nespracovanej objednávky.

## Odporúčaný prvý test v0.9.12

1. Aktualizujte userscript cez Raw.
2. Obnovte AliExpress cez `Ctrl+F5`.
3. Skontrolujte panel **v0.9.12 – Details images v1**.
4. Overte, že v paneli stále vidíte hotovú vrstvu Details – aktualizácia na 0.9.12 ju nemá vymazať.
5. Vypnite Google Translator.
6. Otvorte **Account → Orders**.
7. Kliknite **3. Načítať obrázky z Details**.
8. Na prvý test nechajte prejsť približne 5–10 objednávok.
9. Kliknite **Zastaviť obrázky**.
10. Exportujte **JSON (Orders + Details + Images)**.
11. Skontrolujte hlavne viacpoložkové objednávky a objednávku KSD9700 s viacerými variantmi rovnakého produktu.

Až po overení malej vzorky má zmysel nechať fázu obrázkov prejsť celý zoznam.

## Ovládacie tlačidlá

- **1. Viacnásobne načítať + naskenovať** – fáza Orders,
- **Zastaviť fázu 1**,
- **2. Načítať presné údaje z Details**,
- **Zastaviť Details**,
- **Vymazať iba Details** – zmaže Details a naviazanú vrstvu obrázkov, Orders ponechá,
- **3. Načítať obrázky z Details**,
- **Zastaviť obrázky**,
- **Vymazať iba obrázky** – Orders aj Details zostanú zachované,
- **4. Export CSV (Orders)**,
- **Export JSON (Orders + Details + Images)**,
- **Kopírovať CSV**,
- **Vymazať všetky uložené dáta**.

## JSON export

Kontrolný JSON teraz obsahuje samostatne:

- `multiPass`,
- `detailState`,
- `imageState`,
- `details`,
- `images`,
- `rows`.

Tým sa overené údaje Details nemenia pri pokusoch s obrázkami.

## Súkromie

Fáza obrázkov ukladá iba produktové identifikátory a URL produktových obrázkov. Nepridáva meno príjemcu, adresu, telefón, platobnú metódu ani prihlasovacie údaje.

## Google Translator

Pri všetkých fázach odporúčame Google Translator vypnúť. Preklad môže meniť text aj DOM stránky počas čítania.

## Inštalácia / aktualizácia

1. Otvorte `aliexpress_orders_export.user.js` v GitHub repozitári.
2. Kliknite **Raw**.
3. Tampermonkey ponúkne aktualizáciu existujúceho skriptu.
4. Uložte skript.
5. Obnovte AliExpress cez `Ctrl+F5`.
6. Skontrolujte **v0.9.12 – Details images v1**.

`@name` zostáva nezmenený, aby Tampermonkey aktualizoval existujúcu líniu skriptu.

## Poznámka k presnosti

Fáza obrázkov je zámerne prísnejšia než obyčajné „nájdi prvý obrázok“. Ak nie je väzba obrázka na konkrétnu položku dostatočne silná, výsledok má zostať prázdny a označený na kontrolu.
