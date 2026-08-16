# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na export objednávok z AliExpressu po jednotlivých produktových riadkoch. Skript je navrhnutý konzervatívne: ak si nie je istý názvom, variantom alebo obrázkom, radšej nechá hodnotu prázdnu a zachová surový text na neskoršiu kontrolu.

## Hlavný userscript

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objednavok-z-aliexpressu-do-schranky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.8**

Hlavné zmeny oproti 0.9.7:

- maximálny počet viacnásobných priechodov zvýšený zo **6 na 12**,
- skript sa stále ukončí skôr, ak **2 po sebe idúce priechody nepridajú žiadnu novú objednávku**,
- čakanie na ustálenie po náraste počtu objednávok je **3 sekundy**,
- čakanie po obnovení stránky pred ďalším priechodom je **3 sekundy**,
- pauza medzi dokončeným priechodom a automatickým reloadom je **3 sekundy**,
- maximálny timeout po kliknutí na **View orders** zostáva **9 sekúnd**; nejde o pevné 9-sekundové čakanie, ale o hornú hranicu pre prípad pomalej odpovede AliExpressu,
- obrázková logika zostala zámerne bez ďalších zmien.

Dôvod zvýšenia počtu priechodov: pri reálnom teste verzie 0.9.7 našiel aj **6. priechod ešte jednu novú objednávku**, takže limit šiestich priechodov bol príliš nízky.

## Prečo viacnásobné čítanie

AliExpress nemusí po opakovanom klikaní na **View orders** pri každom načítaní stránky zobraziť rovnaký kompletný zoznam histórie. Preto skript nerobí iba jeden priechod.

Každý priechod:

1. nechá stránku krátko načítať,
2. opakovane kliká na **View orders**,
3. čaká na pribudnutie objednávok a na ustálenie DOM,
4. naskenuje všetky objednávky dostupné v danom priechode,
5. uloží ich do `localStorage`,
6. porovná `orderId` s objednávkami zachytenými v predchádzajúcich priechodoch,
7. nové objednávky pridá, už nájdené objednávky nezahodí,
8. stránku automaticky obnoví a pokračuje ďalším priechodom.

Panel priebežne zobrazuje počet spracovaných objednávok a počet unikátnych objednávok zachytených naprieč priechodmi.

## Deduplikácia

Objednávka sa medzi priechodmi sleduje podľa unikátneho `orderId`.

Produktové riadky sa pri ukladaní zlučujú podľa kombinácie:

`orderId + productUrl`

To znamená, že jedna objednávka môže mať viac riadkov, ak obsahuje viac rôznych produktov. Takéto riadky nie sú považované za duplicitu.

## Časovanie View orders

Aktuálne nastavenie v 0.9.8:

- po kliknutí na **View orders**: maximálne **9 s** na to, aby AliExpress začal/priebežne pridal ďalšie objednávky,
- po poslednom náraste počtu objednávok: **3 s** na ustálenie,
- medzi jednotlivými kliknutiami na **View orders**: približne **1,6 s**,
- po automatickom reloadnutí stránky pred začiatkom priechodu: **3 s**,
- medzi koncom priechodu a reloadom pre ďalší priechod: **3 s**.

Timeout 9 s je zámerne ponechaný ako ochrana proti pomalému načítaniu. Ak objednávky pribudnú skôr a následne sa 3 s nič nemení, skript pokračuje bez čakania do plných 9 s.

## Google Translator

Počas skenovania vypnite automatický Google Translator / „Preložiť túto stránku“ v Chrome.

Translator môže meniť DOM a textové uzly AliExpressu, čo môže spôsobiť:

- nesprávny názov alebo variant,
- miešanie jazykov v `rawOrderText`,
- vyššiu záťaž stránky,
- zamŕzanie alebo hlášku **Stránka nereaguje**.

Skript sa pokúša aktívny Translator rozpoznať a zobrazí upozornenie.

## Čo skript exportuje

Každý produkt je uložený ako samostatný riadok. Export obsahuje najmä:

- `orderId`
- `orderDate`
- `status`
- `seller`
- `productTitle`
- `productVariant`
- `productQuantity`
- `itemPrice`
- `currency`
- `orderTotal`
- `productUrl`
- `imageUrl`
- `detailUrl`
- `sourceUrl`
- `rawProductText`
- `rawOrderText`
- `parserNote`

JSON obsahuje navyše objekt `multiPass` s históriou priechodov (`ordersOnPage`, `newOrders`, `totalKnown`, `productRows`, čas dokončenia).

## Pravidlá pre obrázky

Obrázky sa zatiaľ spracúvajú rovnako ako vo verzii 0.9.7.

**Tvrdé pravidlo:** ak pri produkte nie je nájdený jednoznačný riadok s názvom produktu, `imageUrl` zostane prázdne.

Ďalšia fáza projektu bude riešiť podrobnosti objednávok cez `Details` a až potom samostatné presnejšie spracovanie obrázkov.

## Inštalácia

1. Nainštalujte Tampermonkey.
2. Otvorte `aliexpress_orders_export.user.js` v repozitári.
3. Kliknite **Raw**.
4. Potvrďte inštaláciu/aktualizáciu v Tampermonkey.
5. Na AliExpress stránke **Account → Orders** vypnite Translator a obnovte stránku cez `Ctrl+F5`.
6. Skontrolujte, že panel zobrazuje **v0.9.8**.

Ak sa panel nezobrazí, v Chrome skontrolujte `chrome://extensions/` → Tampermonkey → **Allow User Scripts** a prístup k `aliexpress.com`.

## Odporúčaný test

1. Aktualizovať userscript na **0.9.8**.
2. `Ctrl+F5` na stránke Orders.
3. Vypnúť Translator.
4. Kliknúť **Vymazať uložené dáta**.
5. Spustiť **Viacnásobne načítať + naskenovať**.
6. Počas automatických reloadov kartu nechať otvorenú a ručne neklikať na `View orders`.
7. Nechať skript skončiť po dvoch stabilných priechodoch alebo po maximálne 12 priechodoch.
8. Exportovať **JSON**.

## Súkromie

Skript beží lokálne v prehliadači. Údaje sa ukladajú do `localStorage` pod kľúčmi:

- `AE_EXPORT_SK_2026`
- `AE_EXPORT_SK_2026_MULTI`

Skript sám neposiela export objednávok na externý server.
