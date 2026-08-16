# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na export objednávok z AliExpressu. Projekt je rozdelený do samostatných fáz, aby sa najprv získal čo najkompletnejší zoznam objednávok a až potom sa čítali presné údaje zo stránky **Details**.

Skript je zámerne konzervatívny: ak si nie je istý názvom, variantom alebo iným údajom, radšej nechá hodnotu prázdnu a uloží surový text na neskoršiu kontrolu.

## Hlavný userscript

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objednavok-z-aliexpressu-do-schranky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.9**

## Čo je nové vo v0.9.9

Verzia 0.9.9 pridáva samostatnú **fázu 2 – čítanie presných údajov zo stránky Details**.

Nové správanie:

- fáza 1 zostáva zachovaná: viacnásobné načítanie zoznamu Orders cez `View orders`,
- fáza 2 postupne otvára detail každej objednávky,
- používa existujúcu prihlásenú session AliExpressu v prehliadači,
- prihlasovacie meno ani heslo sa do skriptu neukladajú,
- skript sa snaží použiť presný `href` tlačidla **Details** z aktuálnej stránky,
- ak pri starších uložených údajoch presný `href` nie je dostupný, použije aktuálny `spm` z funkčného odkazu ako fallback,
- medzi detailmi je približne **3 sekundy** pauza,
- na vykreslenie jednej detailovej stránky čaká maximálne približne **15 sekúnd**,
- stav fázy 2 sa ukladá do `localStorage`, takže po prerušení je možné pokračovať,
- JSON export teraz obsahuje aj `detailState` a `details`,
- obrázky sa v tejto fáze ešte zámerne neriešia; budú samostatná ďalšia fáza.

## Fáza 1 – kompletný zoznam objednávok

AliExpress nemusí po opakovanom klikaní na **View orders** pri každom načítaní zobraziť rovnakú množinu historických objednávok. Preto skript používa viac priechodov.

Aktuálne nastavenie:

- maximálne **12 priechodov**,
- skript skončí skôr po **2 po sebe idúcich priechodoch bez novej objednávky**,
- po náraste počtu objednávok čaká približne **3 sekundy na ustálenie**,
- po reloadnutí stránky čaká približne **3 sekundy**,
- medzi priechodmi je približne **3 sekundy** pauza,
- maximálny timeout po kliknutí na `View orders` zostáva 9 sekúnd, ale nejde o pevné čakanie; pri skoršom ustálení pokračuje skôr.

Objednávky z jednotlivých priechodov sa zlučujú podľa `orderId`. Už nájdená objednávka sa nestratí iba preto, že ju AliExpress v ďalšom priechode nezobrazí.

## Fáza 2 – presné údaje z Details

Po dokončení fázy 1 kliknite na:

**2. Načítať presné údaje z Details**

Skript vytvorí front všetkých známych `orderId` a potom postupne otvára stránky typu:

`https://www.aliexpress.com/p/order/detail.html?...&orderId=...`

Pri každej objednávke čaká na vykreslenie obsahu a snaží sa uložiť:

- číslo objednávky,
- názov predajcu,
- dátum vytvorenia objednávky,
- dátum zaplatenia,
- dátum dokončenia zásielky,
- dátum dokončenia objednávky,
- subtotal,
- výsledný total,
- menu,
- jednotlivé produktové riadky,
- názov konkrétnej položky,
- variant/model,
- množstvo `xN`,
- cenu položky,
- priamy odkaz na produkt,
- surový text detailu na kontrolu.

### Dôležité súkromie

Fáza 2 **neukladá prihlasovacie údaje**. Skript používa session, v ktorej je používateľ už prihlásený na AliExpress.

Zámerne sa tiež neukladajú údaje, ktoré pre databázu zakúpených dielov nepotrebujeme:

- meno a doručovacia adresa,
- telefónne číslo,
- platobná metóda.

## Ako fungujú odkazy Details

Pri novom skenovaní skript preferuje presný `href` tlačidla **Details** z DOM stránky Orders.

Ak je napríklad odkaz v prehliadači v tvare:

`https://www.aliexpress.com/p/order/detail.html?spm=...&orderId=3073820008318237`

uloží sa celý odkaz vrátane `spm`.

Pri už existujúcich dátach z verzie 0.9.8 môžu byť niektoré uložené odkazy zjednodušené iba na `?orderId=...`. Preto fáza 2 pri spustení prečíta aktuálne funkčné odkazy z otvorenej stránky Orders a ich `spm` použije ako fallback aj pre objednávky, ktoré práve nie sú v DOM.

Ak sa niektorý detail nepodarí načítať do časového limitu, skript ho zapíše do zoznamu `errors` a pokračuje ďalšou objednávkou.

## Obnova po prerušení

Stav čítania Details sa ukladá do:

`AE_EXPORT_SK_2026_DETAIL_STATE`

Samotné načítané detaily sa ukladajú do:

`AE_EXPORT_SK_2026_DETAILS`

Ak sa prehliadač zavrie alebo sa počítač vypne, stav zostáva v `localStorage`. Pri ďalšom spustení je možné pokračovať od poslednej nespracovanej objednávky.

## Export JSON

Tlačidlo:

**Export JSON (Orders + Details)**

exportuje naraz:

- `multiPass` – stav a históriu fázy 1,
- `detailState` – stav a históriu fázy 2,
- `details` – presné údaje načítané z jednotlivých detailov objednávok,
- `rows` – pôvodné produktové riadky získané zo stránky Orders.

Tým sa pôvodné údaje z Orders neprepisujú detailovými údajmi. Obe vrstvy zostávajú oddelené, aby sa dali porovnať.

## Obrázky

Obrázková logika z hlavnej stránky Orders zostáva zatiaľ bez ďalších zmien.

V **0.9.9 sa obrázky zo stránky Details ešte neukladajú do finálneho výsledku**. Najprv overíme správnosť čítania názvov, variantov, množstiev, cien a počtu položiek. Až potom bude nasledovať samostatná fáza pre obrázky zakúpených dielov a súčiastok.

## Google Translator

Pri práci skriptu odporúčame Google Translator vypnúť.

Preklad stránky môže meniť DOM a textové uzly počas čítania, čo môže spôsobiť nesprávne priradenie názvov, variantov alebo stavov.

Ak skript Translator rozpozná, zobrazí upozornenie.

## Použitie

1. Prihláste sa na AliExpress.
2. Otvorte **Account → Orders**.
3. Vypnite Google Translator.
4. Aktualizujte userscript na **0.9.9**.
5. Ak už máte úspešne dokončenú fázu 1 a uložených 437 objednávok, nemusíte ju povinne spúšťať znova.
6. Kliknite **2. Načítať presné údaje z Details**.
7. Nechajte kartu otvorenú. Skript bude postupne prechádzať medzi detailmi jednotlivých objednávok.
8. Panel ukazuje počet načítaných detailov a celkový počet detailných položiek.
9. Po skončení použite **Export JSON (Orders + Details)**.
10. Výsledný JSON je vhodný poslať na kontrolu pred ďalšou fázou s obrázkami.

## Ovládacie tlačidlá

- **1. Viacnásobne načítať + naskenovať** – fáza 1, načítanie čo najkompletnejšieho zoznamu Orders.
- **Zastaviť fázu 1** – zastaví ďalšie priechody fázy 1.
- **2. Načítať presné údaje z Details** – fáza 2, otvorí a číta jednotlivé detaily objednávok.
- **Zastaviť Details** – zastaví fázu 2 bez vymazania už načítaných detailov.
- **3. Export CSV (Orders)** – exportuje pôvodné riadky zo stránky Orders.
- **Export JSON (Orders + Details)** – odporúčaný export s oboma vrstvami dát.
- **Kopírovať CSV** – skopíruje CSV do schránky.
- **Vymazať všetky uložené dáta** – zmaže Orders, multi-pass stav aj všetky Details údaje.

## Inštalácia / aktualizácia

1. Otvorte `aliexpress_orders_export.user.js` v GitHub repozitári.
2. Kliknite **Raw**.
3. Tampermonkey ponúkne inštaláciu alebo aktualizáciu.
4. Uložte skript.
5. Obnovte stránku AliExpress cez `Ctrl+F5`.
6. V paneli skontrolujte verziu **0.9.9**.

## Chrome / Edge

Ak sa panel nezobrazí:

1. otvorte `chrome://extensions/`,
2. otvorte podrobnosti Tampermonkey,
3. povoľte používateľské skripty,
4. povoľte prístup k `aliexpress.com`,
5. podľa potreby zapnite Developer mode,
6. obnovte AliExpress cez `Ctrl+F5`.

## Poznámka k presnosti

AliExpress často mení HTML štruktúru. Verzia 0.9.9 je prvá testovacia verzia parsera stránky Details. Preto je dôležité po prvom behu skontrolovať exportovaný JSON a porovnať niekoľko objednávok s tým, čo je viditeľné priamo na stránke Details.

Neisté údaje sa nemajú domýšľať. Ak parser údaj nedokáže jednoznačne priradiť, má ho nechať prázdny alebo uviesť poznámku v `parserNote`.
