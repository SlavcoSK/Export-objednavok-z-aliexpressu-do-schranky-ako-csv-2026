# Export objednávok z AliExpressu do CSV/JSON (2026)

Tampermonkey userscript na export objednávok z AliExpressu po jednotlivých produktových riadkoch. Skript sa snaží zachytiť názov produktu, variant, množstvo, cenu, obchod, číslo objednávky, priamy odkaz na produkt a URL obrázka.

Skript je navrhnutý konzervatívne: ak si nie je istý variantom, názvom alebo iným údajom, radšej nechá hodnotu prázdnu a zachová surový text na neskoršiu kontrolu.

## Súbor

Hlavný userscript:

`aliexpress_orders_export.user.js`

Priamy Raw odkaz:

`https://raw.githubusercontent.com/SlavcoSK/Export-objedn-vok-z-aliexpressu-do-schr-nky-ako-csv-2026/main/aliexpress_orders_export.user.js`

## Aktuálna verzia

**0.9.5**

Hlavné zmeny vo v0.9.5:

- skenovanie objednávok po dávkach, aby sa znížilo riziko hlášky **Stránka nereaguje**,
- priebežné zobrazenie postupu `Spracované X / Y`,
- jednoduchší kľúč deduplikácie `orderId + productUrl`,
- oprava variantu produktu, aby sa za variant nebrali položky ako `Date:`, `Completed`, `Expired`, `Ref. Number`, `Copy` alebo `Details`,
- variant sa vyhodnocuje predovšetkým z textu medzi názvom produktu a cenou,
- obrázok sa prijme iba vtedy, keď je jednoznačne naviazaný na produktový odkaz,
- panel upozorní, ak je zistený Google Translator / preklad stránky.

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
5. Ak sa inštalačné okno neotvorí automaticky, vytvorte v Tampermonkey nový skript a vložte doň celý obsah súboru.
6. Uložte skript a skontrolujte, že je v Tampermonkey zapnutý.

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

Verzia **0.9.5** sa pokúsi zapnutý Translator rozpoznať. Ak ho zistí:

- v paneli sa zobrazí červené upozornenie,
- pred skenovaním sa zobrazí potvrdenie s odporúčaním Translator vypnúť,
- skenovanie je možné zrušiť bez zmeny uložených údajov.

Odporúčaný postup je:

1. vypnúť Google Translator,
2. obnoviť stránku `Ctrl+F5`,
3. kliknúť **Vymazať uložené dáta**, ak ide o nový test,
4. spustiť skenovanie,
5. po dokončení exportovať JSON.

## Použitie

1. Prihláste sa do svojho účtu na AliExpress.
2. Otvorte **Account → Orders**.
3. Vypnite Google Translator / automatický preklad stránky.
4. Na pravej strane stránky sa zobrazí panel **AliExpress export SK 2026**.
5. Kliknite na **Naskenovať túto stránku**.
6. Počas skenovania sa zobrazuje priebeh `Spracované X / Y`.
7. Pri nejasnej alebo viacpoložkovej objednávke môžete otvoriť jej **Details** a vykonať sken ešte raz.
8. Údaje sa priebežne ukladajú do lokálneho úložiska prehliadača.

Panel obsahuje tieto možnosti:

- **Naskenovať túto stránku** – pridá alebo aktualizuje zachytené produkty.
- **Export CSV (Excel)** – vytvorí CSV so stredníkom ako oddeľovačom a UTF-8 BOM.
- **Export JSON (odporúčané)** – vytvorí JSON bez straty informácií.
- **Kopírovať CSV** – skopíruje CSV do schránky.
- **Vymazať uložené dáta** – zmaže doteraz nazbierané údaje z lokálneho úložiska.

## Odporúčaný postup testovania

Pri novej verzii skriptu:

1. aktualizujte userscript,
2. obnovte AliExpress cez `Ctrl+F5`,
3. overte verziu v paneli,
4. vypnite Translator,
5. kliknite **Vymazať uložené dáta**,
6. spustite nový sken,
7. exportujte **JSON** a skontrolujte najmä názov, variant, cenu a počet riadkov.

## Dôležité upozornenia

AliExpress často mení HTML štruktúru stránky. Niektoré staršie produktové odkazy môžu:

- smerovať na už neexistujúci produkt,
- smerovať na zmenený listing,
- patriť predajcovi, ktorý už neexistuje,
- mať iný aktuálny obrázok než v čase objednávky.

Preto skript zámerne **nedohaduje neisté údaje**. Ak údaj nie je jednoznačný, má zostať prázdny alebo označený v `parserNote` na ručnú kontrolu.

## Výkon

Verzia 0.9.5 spracúva objednávky po dávkach po 20 kusoch a medzi dávkami krátko uvoľní hlavné vlákno prehliadača. Tým sa má výrazne znížiť riziko hlášky **Stránka nereaguje**.

Ak sa hláška napriek tomu objaví:

- zvoľte **Čakať**,
- skontrolujte, či je vypnutý Translator,
- zatvorte zbytočné karty alebo náročné rozšírenia,
- po skončení skenu exportujte JSON a porovnajte počet riadkov.

## Súkromie

Skript beží lokálne vo vašom prehliadači na stránke AliExpressu. Nazbierané údaje sa ukladajú do `localStorage` prehliadača pod kľúčom:

`AE_EXPORT_SK_2026`

Skript sám neposiela objednávky na externý server.

Projekt je určený hlavne na osobný export a následné spracovanie objednávok v Exceli.
