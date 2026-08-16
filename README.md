# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na export objednávok z AliExpressu po jednotlivých produktových riadkoch. Skript sa snaží zachytiť názov produktu, variant, množstvo, cenu, obchod, číslo objednávky, priamy odkaz na produkt a URL obrázka.

Skript je navrhnutý konzervatívne: ak si nie je istý variantom, názvom alebo obrázkom, radšej nechá hodnotu prázdnu a zachová surový text na neskoršiu kontrolu.

## Súbor

Hlavný userscript:

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objedn-vok-z-aliexpressu-do-schr-nky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.6**

Hlavné zmeny vo v0.9.6:

- pred skenovaním sa skript pokúsi automaticky načítať ďalšie objednávky opakovaným kliknutím na **View orders**,
- po každom kliknutí čaká, či počet objednávok na stránke narastie,
- po načítaní všetkých dostupných objednávok pokračuje dávkovým skenovaním,
- obrázok sa hľadá iba vtedy, ak bol nájdený jednoznačný riadok s názvom produktu,
- ak riadok s názvom produktu chýba, `imageUrl` zostane zámerne prázdne,
- obrázok sa hľadá len v blízkom DOM okolí konkrétneho názvu produktu a nie v celej objednávke,
- ak obrázok obsahuje `alt`/`title`, skript vykoná jednoduchú textovú kontrolu zhody s názvom produktu,
- ak je obrázok nejednoznačný alebo podozrivý, nechá ho prázdny,
- zostáva zachované dávkové skenovanie a upozornenie na Google Translator.

## Čo skript exportuje

Každý produkt je uložený ako samostatný riadok. Export obsahuje najmä:

- číslo objednávky (`orderId`)
- dátum objednávky (`orderDate`)
- stav objednávky (`status`)
- názov predajcu (`seller`)
- názov produktu (`productTitle`)
- variant/model (`productVariant`)
- množstvo (`productQuantity`)
- cenu položky (`itemPrice`)
- menu (`currency`)
- celkovú cenu objednávky (`orderTotal`)
- priamy odkaz na produkt (`productUrl`)
- URL obrázka produktu (`imageUrl`)
- odkaz na detail objednávky (`detailUrl`)
- zdrojovú URL (`sourceUrl`)
- surový text produktu (`rawProductText`)
- surový text objednávky (`rawOrderText`)
- poznámku parsera (`parserNote`)

## Inštalácia

1. Nainštalujte rozšírenie **Tampermonkey** do Chrome, Edge alebo Firefoxu.
2. Otvorte súbor `aliexpress_orders_export.user.js` v tomto repozitári.
3. Kliknite na **Raw**.
4. Tampermonkey by mal ponúknuť inštaláciu alebo aktualizáciu userscriptu.
5. Uložte skript a skontrolujte, že je v Tampermonkey zapnutý.

## Dôležité pre Chrome / Edge

Ak sa panel skriptu na AliExpress stránke nezobrazí:

1. Otvorte `chrome://extensions/`.
2. Nájdite **Tampermonkey** a kliknite na **Details / Podrobnosti**.
3. Zapnite **Allow User Scripts / Povoliť používateľské skripty**.
4. Skontrolujte **Site access / Prístup k stránkam** a povoľte aspoň `aliexpress.com`, prípadne **On all sites**.
5. Ak prepínač **Allow User Scripts** nie je dostupný, skúste zapnúť **Developer mode / Režim pre vývojárov**.
6. Potom stránku AliExpressu obnovte cez `Ctrl+F5`.

Ak skript beží správne, vpravo hore sa zobrazí panel **AliExpress export SK 2026**.

### Vzhľad panela

![Panel AliExpress export SK 2026](docs/aliexpress-export-panel.png)

## Google Translator / automatický preklad stránky

**Pri skenovaní odporúčame Google Translator vypnúť.**

Automatický preklad stránky môže meniť DOM a textové uzly AliExpressu počas skenovania. To môže spôsobiť:

- nesprávne priradenie názvu alebo variantu,
- miešanie jazykov v `rawOrderText`,
- duplicitné záznamy,
- výrazne vyššiu záťaž stránky,
- hlášku Chrome **Stránka nereaguje**.

Skript sa pokúsi zapnutý Translator rozpoznať. Ak ho zistí:

- v paneli sa zobrazí červené upozornenie,
- pred skenovaním sa zobrazí potvrdenie s odporúčaním Translator vypnúť,
- skenovanie je možné zrušiť bez zmeny uložených údajov.

## Automatické načítanie cez View orders

AliExpress často zobrazí iba prvých približne 10 objednávok a ďalšie pridáva po kliknutí na tlačidlo **View orders**.

Vo verzii 0.9.6 tlačidlo **Načítať všetky + naskenovať** najprv:

1. spočíta aktuálne načítané objednávky,
2. vyhľadá viditeľné tlačidlo **View orders**,
3. klikne naň,
4. počká, či počet objednávok narastie,
5. opakuje postup, kým tlačidlo zmizne alebo ďalšie kliknutia už nepridávajú objednávky,
6. až potom spustí samotné dávkové skenovanie.

Počas tejto fázy sa v paneli zobrazuje priebežná informácia o načítavaní.

Ak AliExpress zmení text alebo HTML štruktúru tlačidla **View orders**, môže byť potrebné selektor upraviť.

## Pravidlá pre obrázky

Obrázky sa spracúvajú zámerne veľmi opatrne.

**Tvrdé pravidlo:** ak pri produkte nie je nájdený riadok s názvom produktu, skript obrázok nehľadá a `imageUrl` nechá prázdne.

To je dôležité najmä pri objednávkach, kde AliExpress ukáže iba napr. `11 items` bez jednotlivého názvu produktu. V takom prípade sa obrázok zatiaľ nedopĺňa.

Ak riadok s názvom existuje, skript:

1. vezme konkrétny produktový odkaz a jeho textový názov,
2. hľadá obrázok iba v najbližšom spoločnom DOM okolí tohto názvu,
3. odmieta známe zástupné/generické obrázky,
4. odmieta príliš malé alebo extrémne široké obrázky,
5. ak má obrázok `alt` alebo `title`, porovná jeho text s názvom produktu,
6. pri nejednoznačnosti nechá `imageUrl` prázdne.

Táto kontrola je technická/textová. Nie je to plnohodnotná AI vizuálna analýza obsahu obrázka. Skutočnú kontrolu typu „je na obrázku naozaj SW420 / Hantek HT201 / FPC konektor?“ je vhodné vykonať až pri následnom spracovaní exportu.

## Použitie

1. Prihláste sa do svojho účtu na AliExpress.
2. Otvorte **Account → Orders**.
3. Vypnite Google Translator / automatický preklad stránky.
4. Na pravej strane stránky sa zobrazí panel **AliExpress export SK 2026**.
5. Kliknite **Načítať všetky + naskenovať**.
6. Skript sa najprv pokúsi načítať všetky ďalšie objednávky cez **View orders**.
7. Potom ich spracuje po dávkach a zobrazuje priebeh `Spracované X / Y`.
8. Po dokončení exportujte **JSON**.

Panel obsahuje tieto možnosti:

- **Načítať všetky + naskenovať** – načíta ďalšie objednávky cez View orders a potom ich naskenuje.
- **Export CSV (Excel)** – vytvorí CSV so stredníkom ako oddeľovačom a UTF-8 BOM.
- **Export JSON (odporúčané)** – vytvorí JSON bez straty informácií.
- **Kopírovať CSV** – skopíruje CSV do schránky.
- **Vymazať uložené dáta** – zmaže doteraz nazbierané údaje z lokálneho úložiska.

## Odporúčaný postup testovania

Pri novej verzii skriptu:

1. aktualizujte userscript,
2. obnovte AliExpress cez `Ctrl+F5`,
3. overte verziu **0.9.6** v paneli,
4. vypnite Translator,
5. kliknite **Vymazať uložené dáta**,
6. spustite **Načítať všetky + naskenovať**,
7. sledujte, či skript sám postupne načítava ďalšie objednávky,
8. exportujte **JSON** a skontrolujte názov, variant, cenu, počet riadkov a `imageUrl`.

## Dôležité upozornenia

AliExpress často mení HTML štruktúru stránky. Niektoré staršie produktové odkazy môžu:

- smerovať na už neexistujúci produkt,
- smerovať na zmenený listing,
- patriť predajcovi, ktorý už neexistuje,
- mať iný aktuálny obrázok než v čase objednávky.

Preto skript zámerne **nedohaduje neisté údaje**. Ak údaj nie je jednoznačný, má zostať prázdny alebo označený v `parserNote` na ručnú kontrolu.

## Výkon

Skript spracúva objednávky po dávkach po 20 kusoch a medzi dávkami krátko uvoľní hlavné vlákno prehliadača. Tým sa znižuje riziko hlášky **Stránka nereaguje**.

## Súkromie

Skript beží lokálne vo vašom prehliadači na stránke AliExpressu. Nazbierané údaje sa ukladajú do `localStorage` prehliadača pod kľúčom:

`AE_EXPORT_SK_2026`

Skript sám neposiela objednávky na externý server.

Projekt je určený hlavne na osobný export a následné spracovanie objednávok v Exceli.
