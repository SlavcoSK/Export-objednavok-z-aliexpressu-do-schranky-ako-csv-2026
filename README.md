# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na získanie histórie objednávok z AliExpressu. Projekt je rozdelený na samostatné fázy:

1. načítanie čo najkompletnejšieho zoznamu **Orders**,
2. postupné čítanie presných údajov zo stránky **Details**,
3. obrázky budú riešené až v ďalšom kroku.

Skript je zámerne konzervatívny. Ak nedokáže bezpečne oddeliť názov a variant alebo priradiť produktový URL, údaj radšej nechá prázdny a zachová bezpečný text položky na kontrolu.

## Hlavný userscript

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objednavok-z-aliexpressu-do-schranky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.10**

## Čo je nové vo v0.9.10

Verzia 0.9.10 opravuje parser stránky **Details** po prvom reálnom teste v0.9.9.

Hlavné zmeny:

- položky sa už nehľadajú iba podľa jedného konkrétneho DOM kontajnera,
- parser najprv vyhľadá textové bloky položiek medzi detailmi objednávky a `Subtotal`,
- za hranicu jednej položky považuje väzbu **cena + `xN`**,
- množstvo sa číta iba z hodnoty bezprostredne za cenou, napr. `US $14.41 x1`,
- čísla ako `100X`, `20X`, `100:1` alebo podobné údaje v názve produktu sa už nesmú zameniť za množstvo,
- podporované sú aj zrušené objednávky, ktoré nemajú riadok `Estimated delivery date`,
- pri každej položke sa zachováva `productLineText` – celý text názvu + variantu pred cenou,
- ak DOM dovolí jednoznačne určiť názov produktu, zvyšok `productLineText` sa uloží ako variant,
- ak hranicu názov/variant nemožno bezpečne určiť, skript ju nehádá,
- `rawOrderDetailText` už neobsahuje celý text stránky,
- meno/adresa príjemcu, telefón a platobná metóda sa do detailového exportu neukladajú,
- staré Details údaje vytvorené parserom 0.9.9 sa pri prvom spustení 0.9.10 automaticky odstránia; **Orders údaje zostávajú zachované**,
- pribudlo tlačidlo **Vymazať iba Details**.

## Dôležitá zmena oproti 0.9.9

Parser 0.9.9 síce správne otváral jednotlivé stránky Details a čítal dátumy, subtotal a total, ale pri väčšine objednávok nevedel rozpoznať produktové bloky. Navyše pôvodný spôsob čítania množstva mohol napríklad `100X` v názve produktu považovať za 100 kusov.

Verzia 0.9.10 preto oddelila:

- rozpoznanie položiek z textu,
- presné čítanie ceny a množstva,
- rozdelenie názvu a variantu,
- priradenie produktového URL.

Ak je istá iba prvá časť, ostatné polia zostanú prázdne namiesto odhadu.

## Fáza 1 – zoznam Orders

AliExpress nemusí po opakovanom klikaní na **View orders** pri každom načítaní zobraziť rovnakú množinu historických objednávok. Preto skript používa viac priechodov.

Aktuálne nastavenie:

- maximálne **12 priechodov**,
- koniec po **2 po sebe idúcich priechodoch bez novej objednávky**,
- približne **3 s** na ustálenie po pribudnutí objednávok,
- približne **3 s** po reloadnutí stránky,
- približne **3 s** medzi priechodmi,
- maximálne **9 s** na reakciu po kliknutí na `View orders`; ide iba o horný timeout, nie vždy pevné čakanie.

Už zachytené `orderId` sa naprieč priechodmi zlučujú a nestratia sa, ak ich AliExpress v ďalšom priechode nezobrazí.

## Fáza 2 – presné údaje z Details

Po dokončení fázy 1 kliknite na:

**2. Načítať presné údaje z Details**

Skript vytvorí front známych `orderId` a postupne otvára stránky:

`https://www.aliexpress.com/p/order/detail.html?...&orderId=...`

Používa existujúcu prihlásenú session AliExpressu. Meno ani heslo sa do userscriptu neukladajú.

Pri každej objednávke sa skript snaží získať:

- `orderId`,
- predajcu,
- dátum vytvorenia objednávky,
- dátum zaplatenia,
- dátum dokončenia zásielky,
- dátum dokončenia objednávky,
- `Subtotal`,
- `Total`,
- menu,
- počet jednotlivých položiek.

Pri každej detailnej položke sa ukladajú najmä:

- `itemIndex`,
- `productLineText` – celý text produktu pred cenou,
- `productTitle` – iba ak sa dá jednoznačne určiť,
- `productVariant` – zvyšok za jednoznačným názvom,
- `estimatedDeliveryDate`, ak existuje,
- `productQuantity` z presného `xN` pri cene,
- `itemPrice`,
- `currency`,
- `productUrl`, iba ak ho možno bezpečne priradiť,
- `rawItemText` – bezpečný text konkrétnej položky,
- `parserNote`.

### Príklad pravidla pre množstvo

Text:

`... Oscilloscope Probe 100:1 100X ... US $14.41x1`

sa musí interpretovať ako:

- vlastnosť produktu: `100:1`, `100X`,
- cena: `14.41`,
- objednané množstvo: **1**.

Množstvo sa teda nečíta z názvu, ale iba z `x1` bezprostredne za cenou.

## Zrušené objednávky

Niektoré zrušené objednávky nemajú `Estimated delivery date`. V takom prípade parser začne produktovú časť až za známym názvom predajcu z vrstvy Orders a skončí pred `Subtotal`.

Ak ani tak nemožno bezpečne určiť produktovú časť, skript nič nedohaduje.

## Súkromie

Fáza Details zámerne neukladá:

- meno príjemcu,
- doručovaciu adresu,
- telefónne číslo,
- platobnú metódu,
- prihlasovacie údaje.

`rawOrderDetailText` vo v0.9.10 už nie je celý text stránky. Je zostavený iba z bezpečných údajov potrebných pre databázu objednávok: číslo objednávky, dátumy, predajca, text položiek, subtotal a total.

Pri aktualizácii z 0.9.9 sa staré detailové dáta automaticky odstránia práve preto, že starý formát mohol obsahovať celý text stránky. **Vrstva Orders sa pritom nemaže.**

## Odkazy Details

Skript preferuje presný `href` tlačidla **Details** z DOM stránky Orders.

Ak je dostupný napríklad:

`https://www.aliexpress.com/p/order/detail.html?spm=...&orderId=3073820008318237`

použije sa celý odkaz.

Ak presný odkaz pre staršiu objednávku nie je momentálne v DOM, skript môže použiť uložený detailový URL alebo fallback podľa `orderId`. Pri takom zázname sa zdroj odkazu uvedie v `detailUrlSource` a prípadne v `parserNote`.

## Obnova po prerušení

Stav fázy 2 sa priebežne ukladá do `localStorage`.

Ak sa počítač vypne alebo Chrome zavrie, rozpracovaný beh v0.9.10 je možné po návrate obnoviť od poslednej nespracovanej objednávky.

Medzi jednotlivými detailmi je približne **3 s** pauza a na načítanie jednej detailovej stránky sa čaká maximálne približne **15 s**.

## Ako spustiť nový test v0.9.10

1. Aktualizujte userscript cez **Raw**.
2. Overte v paneli verziu **0.9.10**.
3. Vypnite Google Translator.
4. Otvorte hlavnú stránku **Account → Orders**.
5. Ak už máte dokončenú fázu 1, **nespúšťajte ju znovu iba kvôli 0.9.10**.
6. Staré Details z 0.9.9 sa po aktualizácii odstránia automaticky; Orders zostanú.
7. Kliknite **2. Načítať presné údaje z Details**.
8. Na prvý test nechajte spracovať približne 5–10 objednávok.
9. Kliknite **Zastaviť Details**.
10. Použite **Export JSON (Orders + Details)** a skontrolujte výsledok.
11. Až po overení malej vzorky nechajte skript prejsť celý zoznam objednávok.

## Ovládacie tlačidlá

- **1. Viacnásobne načítať + naskenovať** – fáza 1.
- **Zastaviť fázu 1** – zastaví ďalšie priechody Orders.
- **2. Načítať presné údaje z Details** – fáza 2.
- **Zastaviť Details** – zastaví fázu 2 bez vymazania už správne načítaných detailov.
- **Vymazať iba Details** – zmaže iba detailovú vrstvu a jej stav; Orders zostanú zachované.
- **3. Export CSV (Orders)** – export vrstvy Orders.
- **Export JSON (Orders + Details)** – odporúčaný kontrolný export.
- **Kopírovať CSV** – skopíruje CSV do schránky.
- **Vymazať všetky uložené dáta** – zmaže Orders aj Details; používajte len zámerne.

## Obrázky

Obrázky zatiaľ nie sú cieľom fázy 2. Najprv sa overuje správnosť:

- počtu položiek,
- názvu/produktového riadku,
- variantu,
- množstva,
- ceny,
- dátumov a subtotal/total.

Až po stabilizovaní týchto údajov bude nasledovať samostatný krok na obrázky zakúpených dielov a súčiastok.

## Google Translator

Pri skenovaní odporúčame Google Translator vypnúť. Preklad môže meniť text a DOM stránky počas čítania a tým zhoršiť presnosť parsera.

## Inštalácia / aktualizácia

1. Otvorte `aliexpress_orders_export.user.js` v GitHub repozitári.
2. Kliknite **Raw**.
3. Tampermonkey ponúkne aktualizáciu existujúceho skriptu.
4. Uložte skript.
5. Obnovte AliExpress cez `Ctrl+F5`.
6. Skontrolujte, že panel ukazuje **v0.9.10 – Details text parser v2**.

## Poznámka k presnosti

AliExpress často mení HTML a správanie stránky. Preto parser používa kombináciu textových údajov, údajov z DOM a už bezpečne uložených údajov z vrstvy Orders.

Ak si nie je istý hranicou názov/variant alebo URL produktu, hodnotu nemá domýšľať. Celý text položky zostane v `productLineText` a neistota sa uvedie v `parserNote`.
