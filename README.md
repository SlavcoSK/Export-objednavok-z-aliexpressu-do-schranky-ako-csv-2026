# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na získanie histórie objednávok z AliExpressu. Projekt je rozdelený na samostatné fázy:

1. načítanie čo najkompletnejšieho zoznamu **Orders**,
2. postupné čítanie presných údajov zo stránky **Details**,
3. obrázky budú riešené až v ďalšom kroku.

Skript je zámerne konzervatívny. Ak nedokáže bezpečne oddeliť názov, variant alebo produktový URL, hodnotu radšej nechá prázdnu a zachová text položky na kontrolu.

## Hlavný userscript

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objednavok-z-aliexpressu-do-schranky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.11**

Parser Details:

`0.9.11-dom-variant-v3`

## Čo je nové vo v0.9.11

Verzia 0.9.11 dopĺňa presnejšie čítanie **variantu každej položky priamo z DOM stránky Details**.

Na AliExpress Details je pri mnohých produktoch zobrazenie v tvare:

`názov produktu`

`variant / model / konfigurácia`

`cena xN`

Nový parser preto dáva najvyššiu prioritu samostatnému textovému riadku medzi názvom produktu a cenou.

Príklady, ktoré má správne zachytiť:

- KSD9700: `Metal 10A, Normally closed, 135C`, `130C`, `110C`, `105C`, `100C`, `95C` atď.,
- NTC MF58: `10K`,
- FPC konektor: `32P, Bottom Contact, 0.5MM`,
- SW420: `20PCS`,
- tlakový snímač: `12V 0.5-4.5V 1/8N, 750psi gauge`,
- iný tlakový snímač: `12V in 0.5 4.5V 1/8N, 16bar G with cable`.

Ak taký samostatný variantový riadok v DOM existuje, uloží sa do `productVariant` a zdroj do `productVariantSource`.

Nové pomocné polia pri detailnej položke:

- `productTitleSource`,
- `productVariantSource`.

Typický zdroj presného variantu bude:

`details-dom-row` alebo `dom-row-between-title-price`.

Ak samostatný riadok neexistuje, parser sa môže oprieť o už známu hranicu názvu v `productLineText`. Ak ani tá nie je jednoznačná, variant zostane prázdny.

## Dôležité pravidlo pre množstvo

Množstvo objednaných balení sa naďalej číta **iba z `xN` priamo pri cene**.

Napríklad:

`20PCS Thermal Resistor ... 10K US $5.02 x1`

znamená:

- názov produktu obsahuje `20PCS` – obsah balenia,
- variant je `10K`,
- cena položky je `5.02 USD`,
- `productQuantity = 1` – objednané jedno balenie.

Rovnako čísla ako `100X`, `100:1`, `20PCS`, `750psi`, `16bar` alebo teplota `135C` sa nesmú zameniť za objednané množstvo.

## Fáza 1 – zoznam Orders

AliExpress nemusí po opakovanom klikaní na **View orders** pri každom načítaní zobraziť rovnakú množinu historických objednávok. Preto skript používa viac priechodov.

Aktuálne nastavenie:

- maximálne **12 priechodov**,
- koniec po **2 po sebe idúcich priechodoch bez novej objednávky**,
- približne **3 s** na ustálenie po pribudnutí objednávok,
- približne **3 s** po reloadnutí stránky,
- približne **3 s** medzi priechodmi,
- maximálne **9 s** na reakciu po kliknutí na `View orders`; ide iba o horný timeout.

Už zachytené `orderId` sa naprieč priechodmi zlučujú.

## Fáza 2 – presné údaje z Details

Po dokončení fázy 1 kliknite na:

**2. Načítať presné údaje z Details**

Skript postupne otvára stránky:

`https://www.aliexpress.com/p/order/detail.html?...&orderId=...`

Používa existujúcu prihlásenú session AliExpressu. Prihlasovacie meno ani heslo sa do userscriptu neukladajú.

Pri každej objednávke sa ukladajú napríklad:

- `orderId`,
- predajca,
- dátum vytvorenia objednávky,
- dátum zaplatenia,
- dátum dokončenia zásielky,
- dátum dokončenia objednávky,
- `Subtotal`,
- `Total`,
- menu,
- jednotlivé produktové položky.

Pri každej detailnej položke sa ukladajú:

- `itemIndex`,
- `productLineText`,
- `productTitle`,
- `productTitleSource`,
- `productVariant`,
- `productVariantSource`,
- `estimatedDeliveryDate`,
- `productQuantity`,
- `itemPrice`,
- `currency`,
- `productUrl`,
- `rawItemText`,
- `parserNote`.

## Ako parser v0.9.11 hľadá variant

Parser kombinuje dve vrstvy:

1. textový parser rozdelí objednávku na samostatné položky podľa väzby **cena + `xN`**,
2. DOM parser nájde najmenší produktový blok, v ktorom je presne jedna väzba cena + `xN`, a prečíta jednotlivé textové riadky pred cenou.

Ak blok obsahuje napríklad:

`KSD9700 250V 5A 10A 16A 40~155 Degree ...`

`Metal 10A, Normally closed, 130C`

`US $1.16 x1`

uloží sa:

- `productTitle = KSD9700 ...`,
- `productVariant = Metal 10A, Normally closed, 130C`,
- `productQuantity = 1`,
- `itemPrice = 1.16`.

Pri objednávke s viacerými variantmi rovnakého produktu sa položky mapujú v poradí DOM. To je dôležité napríklad pri 11 rôznych teplotách KSD9700.

## Súkromie

Fáza Details zámerne neukladá:

- meno príjemcu,
- doručovaciu adresu,
- telefónne číslo,
- platobnú metódu,
- prihlasovacie údaje.

`rawOrderDetailText` sa skladá iba z bezpečných údajov potrebných pre databázu: číslo objednávky, dátumy, predajca, položky, subtotal a total.

## Prechod z 0.9.10 na 0.9.11

Pretože sa zmenil parser variantov, v0.9.11 pri prvom spustení automaticky odstráni starú vrstvu **Details** vytvorenú predchádzajúcim parserom.

**Vrstva Orders a zoznam známych objednávok zostanú zachované.**

Fázu 1 preto netreba spúšťať znova iba kvôli aktualizácii parsera Details.

## Obnova po prerušení

Stav fázy 2 sa priebežne ukladá do `localStorage`.

Ak sa počítač vypne alebo sa Chrome zavrie, rozpracovaný beh rovnakej verzie parsera možno po návrate obnoviť od poslednej nespracovanej objednávky.

Medzi jednotlivými detailmi je približne **3 s** pauza a na načítanie jednej detailovej stránky sa čaká maximálne približne **15 s**.

## Odporúčaný test v0.9.11

1. Aktualizujte userscript cez **Raw**.
2. Obnovte AliExpress cez `Ctrl+F5`.
3. Skontrolujte v paneli **v0.9.11 – Details DOM variant v3**.
4. Vypnite Google Translator.
5. Otvorte **Account → Orders**.
6. Fázu 1 znovu nespúšťajte, ak už máte kompletný zoznam Orders.
7. Spustite **2. Načítať presné údaje z Details**.
8. Nechajte spracovať približne 8–10 objednávok.
9. Skontrolujte najmä objednávku `3073820008378237` s viacerými KSD9700 variantmi a objednávku `3073820008558237` s dvoma tlakovými snímačmi.
10. Kliknite **Zastaviť Details**.
11. Exportujte **JSON (Orders + Details)** a výsledok skontrolujte pred celým behom 437 objednávok.

## Ovládacie tlačidlá

- **1. Viacnásobne načítať + naskenovať** – fáza 1,
- **Zastaviť fázu 1** – zastaví ďalšie priechody Orders,
- **2. Načítať presné údaje z Details** – fáza 2,
- **Zastaviť Details** – zastaví fázu 2 bez zmazania hotových detailov,
- **Vymazať iba Details** – zmaže iba detailovú vrstvu a jej stav,
- **3. Export CSV (Orders)** – export vrstvy Orders,
- **Export JSON (Orders + Details)** – odporúčaný kontrolný export,
- **Kopírovať CSV** – skopíruje CSV do schránky,
- **Vymazať všetky uložené dáta** – zmaže Orders aj Details.

## Obrázky

Obrázky zatiaľ nie sú cieľom fázy 2. Najprv stabilizujeme:

- počet položiek,
- názvy,
- varianty,
- množstvá,
- ceny,
- dátumy,
- subtotal a total.

Až potom bude nasledovať samostatná fáza pre obrázky.

## Google Translator

Pri skenovaní odporúčame Google Translator vypnúť. Preklad môže meniť text a DOM počas čítania a tým zhoršiť presnosť parsera.

## Inštalácia / aktualizácia

1. Otvorte `aliexpress_orders_export.user.js` v GitHub repozitári.
2. Kliknite **Raw**.
3. Tampermonkey ponúkne aktualizáciu existujúceho skriptu.
4. Uložte skript.
5. Obnovte AliExpress cez `Ctrl+F5`.
6. Skontrolujte **v0.9.11 – Details DOM variant v3**.

## Poznámka k presnosti

AliExpress môže meniť HTML štruktúru. Preto parser kombinuje text, DOM a už bezpečne uložené údaje z vrstvy Orders.

Ak si nie je istý, údaj nemá domýšľať. Celý text položky zostáva v `productLineText` a neistota sa uvedie v `parserNote`.
