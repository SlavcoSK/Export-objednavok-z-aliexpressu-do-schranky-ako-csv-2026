# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na export objednávok z AliExpressu po jednotlivých produktových riadkoch. Skript sa snaží zachytiť názov produktu, variant, množstvo, cenu, obchod, číslo objednávky, priamy odkaz na produkt a URL obrázka.

Skript je navrhnutý konzervatívne: ak si nie je istý variantom, názvom alebo obrázkom, radšej nechá hodnotu prázdnu a zachová surový text na neskoršiu kontrolu.

## Súbor

Hlavný userscript:

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objedn-vok-z-aliexpressu-do-schr-nky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.7**

Hlavné zmeny vo v0.9.7:

- skript už nerobí iba jeden priechod zoznamom objednávok,
- vykoná viac samostatných priechodov stránkou **Orders**,
- medzi priechodmi stránku automaticky obnoví,
- objednávky nájdené v rôznych priechodoch sa zlučujú podľa čísla objednávky,
- už raz zachytená objednávka sa nestratí, ak ju AliExpress v ďalšom priechode nezobrazí,
- skript skončí po **2 po sebe idúcich priechodoch bez novej objednávky** alebo najneskôr po **6 priechodoch**,
- po kliknutí na **View orders** čaká až približne **9 sekúnd** na ďalšie objednávky,
- po náraste počtu objednávok čaká ešte približne **1,8 sekundy**, aby sa DOM ustálil,
- medzi jednotlivými kliknutiami na **View orders** je približne **1,6 sekundy** pauza,
- pred začiatkom každého nového priechodu po obnovení stránky čaká približne **3,5 sekundy**,
- medzi priechodmi je približne **9 sekúnd** pauza pred automatickým obnovením stránky,
- obrázková logika zostala v tejto verzii zámerne bez ďalších zmien,
- opravené bolo aj čítanie dátumov s mesiacmi ako `Mar` a `Apr`.

## Prečo viacnásobné čítanie

Pri porovnaní viacerých úplných výberov stránky **Orders** sa ukázalo, že AliExpress nemusí pri jednom načítaní po opakovanom stláčaní **View orders** vrátiť vždy rovnaký kompletný zoznam objednávok.

To znamená, že stav „tlačidlo View orders už zmizlo“ neznamená s istotou, že boli načítané všetky historické objednávky.

Verzia 0.9.7 preto používa viac priechodov. Každý priechod:

1. nechá stránku chvíľu načítať,
2. opakovane kliká na **View orders**,
3. medzi kliknutiami zámerne čaká dlhšie,
4. naskenuje všetky objednávky, ktoré sú v danom priechode dostupné,
5. uloží ich do spoločného lokálneho zoznamu,
6. porovná čísla objednávok s predchádzajúcimi priechodmi,
7. ak treba, po pauze obnoví stránku a pokračuje ďalším priechodom.

Panel priebežne zobrazuje napríklad:

- číslo priechodu,
- počet objednávok na aktuálnej stránke,
- koľko nových objednávok daný priechod našiel,
- celkový počet unikátnych objednávok zachytených naprieč priechodmi,
- počet produktových riadkov.

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

JSON export vo verzii 0.9.7 navyše obsahuje objekt `multiPass` s históriou jednotlivých priechodov.

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
- pred spustením sa zobrazí potvrdenie s odporúčaním Translator vypnúť,
- proces je možné zrušiť bez zmeny uložených údajov.

## Automatické načítanie cez View orders

AliExpress často zobrazí iba prvých približne 10 objednávok a ďalšie pridáva po kliknutí na tlačidlo **View orders**.

Vo verzii 0.9.7 skript zámerne nekliká veľmi rýchlo. Po kliknutí necháva AliExpressu viac času na:

- sieťové načítanie,
- doplnenie ďalších objednávok,
- prekreslenie DOM,
- ustálenie počtu objednávok pred ďalším kliknutím.

Aktuálne časovanie je nastavené približne takto:

- až **9 s** čakanie na reakciu po `View orders`,
- **1,8 s** čakanie po poslednom náraste počtu objednávok,
- **1,6 s** pauza pred ďalším kliknutím,
- **3,5 s** čakanie po načítaní/obnovení stránky pred začatím ďalšieho priechodu,
- **9 s** pauza medzi priechodmi pred automatickým reloadom.

Tieto hodnoty sú zámerne konzervatívne, aby sa znížilo riziko, že skript klikne znova skôr, než AliExpress dokončí predchádzajúce načítanie.

## Pravidlá pre obrázky

Obrázky sa spracúvajú zámerne veľmi opatrne.

**Tvrdé pravidlo:** ak pri produkte nie je nájdený riadok s názvom produktu, skript obrázok nehľadá a `imageUrl` nechá prázdne.

To je dôležité najmä pri objednávkach, kde AliExpress ukáže iba napr. `11 items` bez jednotlivého názvu produktu. V takom prípade sa obrázok zatiaľ nedopĺňa.

Obrázková časť zostáva vo verzii **0.9.7** zámerne rovnaká ako v predchádzajúcej verzii. Ďalšie zlepšenie obrázkov sa bude riešiť samostatne.

## Použitie

1. Prihláste sa do svojho účtu na AliExpress.
2. Otvorte **Account → Orders**.
3. Vypnite Google Translator / automatický preklad stránky.
4. Na pravej strane stránky sa zobrazí panel **AliExpress export SK 2026**.
5. Kliknite **Viacnásobne načítať + naskenovať**.
6. Nechajte skript pracovať; stránku počas procesu manuálne neobnovujte a neklikajte na `View orders` ručne.
7. Skript môže stránku niekoľkokrát automaticky obnoviť.
8. Proces sa ukončí po dvoch priechodoch bez novej objednávky alebo po maximálne šiestich priechodoch.
9. Po dokončení exportujte **JSON**.

Panel obsahuje tieto možnosti:

- **Viacnásobne načítať + naskenovať** – spustí viacpriechodové načítanie a zlučovanie objednávok.
- **Zastaviť viacnásobné čítanie** – preruší ďalšie automatické priechody.
- **Export CSV (Excel)** – exportuje aktuálne nazbierané údaje.
- **Export JSON (odporúčané)** – exportuje údaje aj históriu viacnásobných priechodov.
- **Kopírovať CSV** – skopíruje aktuálne nazbierané CSV do schránky.
- **Vymazať uložené dáta** – zmaže údaje aj stav viacnásobného čítania.

## Odporúčaný postup testovania

Pri novej verzii skriptu:

1. aktualizujte userscript,
2. obnovte AliExpress cez `Ctrl+F5`,
3. overte verziu **0.9.7** v paneli,
4. vypnite Translator,
5. kliknite **Vymazať uložené dáta**,
6. spustite **Viacnásobne načítať + naskenovať**,
7. počas automatických reloadov nechajte kartu otvorenú,
8. po skončení exportujte **JSON**,
9. pri kontrole JSON sledujte najmä `multiPass.history`, `knownOrderIds` a celkový počet unikátnych objednávok.

## Dôležité upozornenia

AliExpress často mení HTML štruktúru stránky. Niektoré staršie produktové odkazy môžu:

- smerovať na už neexistujúci produkt,
- smerovať na zmenený listing,
- patriť predajcovi, ktorý už neexistuje,
- mať iný aktuálny obrázok než v čase objednávky.

Ani viacnásobné čítanie nedáva matematickú záruku, že AliExpress vráti úplne všetky historické objednávky. Cieľom je výrazne znížiť riziko, že sa pri jednom náhodnom načítaní časť objednávok nezobrazí.

Preto skript zámerne **nedohaduje neisté údaje**. Ak údaj nie je jednoznačný, má zostať prázdny alebo označený v `parserNote` na ručnú kontrolu.

## Výkon

Skript spracúva objednávky po dávkach po 20 kusoch a medzi dávkami krátko uvoľní hlavné vlákno prehliadača.

Načítanie 0.9.7 bude zámerne trvať dlhšie než 0.9.6, pretože medzi kliknutiami a priechodmi čaká. Toto je očakávané správanie a má dať AliExpressu dostatok času na načítanie ďalších objednávok.

## Súkromie

Skript beží lokálne vo vašom prehliadači na stránke AliExpressu. Nazbierané údaje sa ukladajú do `localStorage` prehliadača pod kľúčmi:

`AE_EXPORT_SK_2026`

`AE_EXPORT_SK_2026_MULTI`

Skript sám neposiela objednávky na externý server.

Projekt je určený hlavne na osobný export a následné spracovanie objednávok v Exceli.
