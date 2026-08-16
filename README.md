# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na export objednávok z AliExpressu po jednotlivých produktových riadkoch. Skript sa snaží zachytiť názov produktu, variant, množstvo, cenu, obchod, číslo objednávky, priamy odkaz na produkt a URL obrázka.

Skript je navrhnutý konzervatívne: ak si nie je istý variantom, názvom alebo iným údajom, radšej nechá hodnotu prázdnu a zachová surový text na neskoršiu kontrolu.

## Súbor

Hlavný userscript:

`aliexpress_orders_export.user.js`

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
4. Tampermonkey by mal ponúknuť inštaláciu userscriptu.
5. Ak sa inštalačné okno neotvorí automaticky, vytvorte v Tampermonkey nový skript a vložte doň celý obsah súboru.
6. Uložte skript a skontrolujte, že je v Tampermonkey zapnutý.

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objedn-vok-z-aliexpressu-do-schr-nky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Dôležité pre Chrome / Edge

Pri novších verziách Chromium prehliadačov môže byť potrebné výslovne povoliť spúšťanie používateľských skriptov.

Ak sa panel skriptu na AliExpress stránke nezobrazí:

1. Otvorte `chrome://extensions/`.
2. Nájdite **Tampermonkey** a kliknite na **Details / Podrobnosti**.
3. Zapnite **Allow User Scripts / Povoliť používateľské skripty**.
4. Skontrolujte **Site access / Prístup k stránkam** a povoľte aspoň `aliexpress.com`, prípadne **On all sites**.
5. Ak prepínač **Allow User Scripts** nie je dostupný, skúste na stránke rozšírení zapnúť **Developer mode / Režim pre vývojárov**.
6. Potom stránku AliExpressu obnovte cez `Ctrl+F5`.

Ak skript beží správne, vpravo hore sa zobrazí panel **AliExpress export SK 2026** s tlačidlami na skenovanie a export.

### Vzhľad panela

![Panel AliExpress export SK 2026](docs/aliexpress-export-panel.png)

## Použitie

1. Prihláste sa do svojho účtu na AliExpress.
2. Otvorte **Účet → Objednávky**.
3. Na pravej strane stránky sa zobrazí panel **AliExpress export SK 2026**.
4. Kliknite na **Naskenovať túto stránku**.
5. Pri nejasnej alebo viacpoložkovej objednávke môžete otvoriť jej **Detaily** a vykonať sken ešte raz.
6. Údaje sa priebežne ukladajú do lokálneho úložiska prehliadača.

Panel obsahuje tieto možnosti:

- **Naskenovať túto stránku** – pridá alebo aktualizuje zachytené produkty.
- **Export CSV (Excel)** – vytvorí CSV so stredníkom ako oddeľovačom a UTF-8 BOM.
- **Export JSON (odporúčané)** – vytvorí JSON bez straty informácií.
- **Kopírovať CSV** – skopíruje CSV do schránky.
- **Vymazať uložené dáta** – zmaže doteraz nazbierané údaje z lokálneho úložiska.

## Odporúčaný postup

Najprv skript otestujte na jednej objednávke, ideálne cez stránku **Detaily**. Skontrolujte, či správne zachytil:

- číslo objednávky,
- názov produktu,
- variant,
- množstvo,
- cenu,
- produktový odkaz,
- URL obrázka.

Až potom pokračujte cez väčšiu časť histórie objednávok.

Pre ďalšie spracovanie je vhodnejší **JSON export**, pretože zachová aj surové textové údaje a poznámky parsera.

## Dôležité upozornenia

AliExpress často mení HTML štruktúru stránky. Skript preto nepoužíva iba jeden pevný CSS selektor, ale snaží sa hľadať objednávky a produkty podľa odkazov a okolitého obsahu.

Verzia **0.9.2** používa širšie pravidlá spúšťania pre doménu AliExpress, aby sa panel zobrazil aj pri zmenených URL objednávok.

Napriek tomu sa môže stať, že po zmene stránky AliExpress bude potrebné parser upraviť.

Niektoré staršie produktové odkazy môžu:

- smerovať na už neexistujúci produkt,
- smerovať na zmenený listing,
- patriť predajcovi, ktorý už neexistuje,
- mať iný aktuálny obrázok než v čase objednávky.

Preto skript zámerne **nedohaduje neisté údaje**. Ak údaj nie je jednoznačný, má zostať prázdny alebo označený v `parserNote` na ručnú kontrolu.

## Súkromie

Skript beží lokálne vo vašom prehliadači na stránke AliExpressu. Nazbierané údaje sa ukladajú do `localStorage` prehliadača pod kľúčom:

`AE_EXPORT_SK_2026`

Skript sám neposiela objednávky na externý server.

## Verzia

Aktuálna verzia userscriptu: **0.9.2**

Projekt je určený hlavne na osobný export a následné spracovanie objednávok v Exceli.
