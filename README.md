# Kâr Görseli Üretici

Hisse + lot + maliyet parametrelerinden **25 hazır şablonla** portföy/pozisyon görselleri üretir
ve tarayıcıdan PNG/JPEG olarak indirir. Görseller tarayıcıda `html-to-image` ile oluşturulur;
sunucu tarafı yalnız Telegram girişi ve kayıt loglarını üstlenir.

```bash
npm install
npm run dev        # http://localhost:3000
npm run build      # üretim derlemesi
npm run sync       # public/templates/ klasörünü tarayıp manifest.json'ı günceller
npm run test:auth  # imza / oturum / log birim testleri
```

Site **Vercel**'de yayınlanıyor: **https://kargorseli-nu.vercel.app/**
`main` dalına her push'ta kendiliğinden deploy olur.

Alt yolda bir yere kurulacaksa `NEXT_PUBLIC_BASE_PATH` verilir (şablonlar ve `/api`
yolları bu öneki kullanır); boş bırakılırsa site kökte çalışır.

---

## Telegram girişi ve kayıt kanalı

Uygulama yalnız yetkili Telegram hesaplarına açık, ve her önemli olay bir Telegram
kanalına düşüyor. Doğrulama tarayıcıda yapılamaz — Telegram'ın döndürdüğü veri bot
token'ıyla HMAC doğrulaması ister, token da herkesin indirebileceği JS'e konulamaz.
Bu yüzden `app/api/` altında şu uçlar var:

| Uç | İş |
|---|---|
| `POST /api/auth/telegram` | Widget verisinin imzasını doğrular, beyaz listeye bakar, oturum çerezini yazar |
| `POST /api/auth/link/start` | Bot yolu için tek kullanımlık anahtar + `t.me` bağlantısı üretir |
| `POST /api/auth/link/claim` | Anahtar bota bağlandı mı diye yoklar; bağlandıysa oturumu açar |
| `GET /api/auth/me` | Çerez hâlâ geçerli mi (süre **ve** beyaz liste her çağrıda yeniden okunur) |
| `POST /api/auth/logout` | Çerezi siler, çıkışı kanala yazar |
| `POST /api/log` | Uygulama olaylarını kanala iletir (geçerli oturum şart) |
| `POST /api/telegram/webhook` | Bot komutları ve onay düğmeleri |
| `GET /api/health` | Hangi ortam değişkeninin eksik olduğunu gösterir |

Oturum, HMAC ile imzalı **httpOnly** bir çerezde taşınır: sayfadaki JS (ve dolayısıyla bir
XSS) okuyamaz. Site ile API aynı origin'de olduğu için üçüncü taraf çerez engelleri de
devrede değil.

### İki giriş yolu

**1. Telegram Login Widget** — tek tık. Ama yalnız BotFather'da `/setdomain` ile kayıtlı
alan adında çalışır; başka her yerde iframe **"Bot domain invalid"** der. Bot başına tek
alan adı kaydedilebiliyor, o yüzden `localhost` ve Vercel'in preview adresleri kapsam dışı.

**2. Bot bağlantısı** — giriş ekranındaki *Telegram uygulamasıyla gir* düğmesi. Sunucu tek
kullanımlık, 5 dakika ömürlü bir anahtar üretip `t.me/<bot>?start=<anahtar>` bağlantısını
açar; **Telegram uygulaması devreye girer**, kullanıcı *Başlat*'a basar, bot anahtarı o
hesaba bağlar (webhook), tarayıcı 2 saniyede bir yoklayıp oturumu alır.

Bu yol **alan adı kaydına hiç bağlı değil** — localhost'ta ve preview adreslerinde de
çalışır. Anahtar tahmin edilemez, tek kullanımlıktır (ilk kullanımda silinir) ve süresi
dolar. Yetki kontrolü iki yolda da aynı yerde (`lib/server/login.ts`) yapılır, yani bot
yolundan gelen yetkisiz biri de aynı şekilde reddedilir ve aynı onay düğmelerini tetikler.

Depo (Upstash) bağlı değilse bot yolu kapalıdır, widget çalışmaya devam eder.

### Bunun koruduğu ve korumadığı şey

Beyaz listede olmayan kimse giriş yapamaz, log atamaz. Ama uygulama bir istemci
uygulaması: sayfanın JS'i herkesin indirebileceği yerde duruyor. Yani giriş ekranı
**arayüzü kapatır, kodu kapatmaz** — kararlı biri bundle'ı indirip kendi makinesinde
çalıştırabilir. Şablonların da yalnız yetkiliye servis edilmesi gerekiyorsa bu ayrı bir iş.

### Yetkili listesini bot yönetir

Liste iki parçadan oluşur:

1. **`ALLOWED_USER_IDS`** — çekirdek liste, ortam değişkeninde. Buradakiler bot ile
   silinemez; kendinizi dışarıda bırakmanın yolu yok. Depo çökse bile bunlar girebilir.
2. **Upstash Redis'teki kayıtlar** — bot üzerinden eklenip silinenler.

Yetkisiz biri giriş denediğinde kanala düşen mesajın altında **✅ Onayla / ✖️ Yoksay**
düğmeleri çıkar. Onayla'ya basınca kişi listeye eklenir, sayfayı yenileyip girer.
Düğmeler yalnız `TG_ADMIN_IDS` (tanımlı değilse `ALLOWED_USER_IDS`) içindeki hesaplarda
çalışır; başkası bastığında uyarı alır ve hiçbir şey değişmez.

Bota yazılabilen komutlar:

| Komut | İş |
|---|---|
| `/liste` | Yetkili kullanıcılar (çekirdek + bot ile eklenenler) |
| `/ekle 123456789` | Kullanıcıyı yetkilendir |
| `/sil 123456789` | Yetkiyi kaldır — **açık oturumu da anında düşer** |
| `/id` | Kendi Telegram id'ni söyler (herkese açık) |
| `/yardim` | Komut listesi |

Depo (Upstash) yapılandırılmamışsa uygulama çalışmaya devam eder, sadece bot ile
ekleme/silme kapalı kalır ve `/liste` bunu söyler.

### Kurulum

**1. Bot ve kanal**

- [@BotFather](https://t.me/BotFather) → `/newbot` → token'ı saklayın.
- `/setdomain` → botu seçin → `kargorseli-nu.vercel.app`.
  Bu yalnız **widget** için gerekli; bot bağlantısı yolu bu kayda bakmaz. Domain'i yanlış
  girerseniz widget "Bot domain invalid" der ama site yine kullanılabilir kalır.
- Log için özel bir kanal açın, botu **yönetici** olarak ekleyin. Kanalın `chat_id`'si
  `-100…` ile başlar; kanala bir mesaj atıp
  `https://api.telegram.org/bot<TOKEN>/getUpdates` adresinden okuyabilirsiniz.

**2. Upstash Redis**

Vercel panelinde **Storage → Marketplace → Upstash Redis** ile bağlayın; `KV_REST_API_URL`
ve `KV_REST_API_TOKEN` ortam değişkenlerini kendisi ekler. (Upstash'in kendi panelini
kullanırsanız `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` adları da kabul edilir.)

**3. Vercel ortam değişkenleri**

**Settings → Environment Variables**:

| Değişken | Değer |
|---|---|
| `NEXT_PUBLIC_TG_BOT` | Bot kullanıcı adı, `@` olmadan. **Boş bırakılırsa giriş kapısı devre dışı kalır.** |
| `TG_BOT_TOKEN` | BotFather token'ı |
| `TG_LOG_CHAT_ID` | Log kanalının `-100…` id'si |
| `SESSION_SECRET` | Uzun rastgele dize |
| `ALLOWED_USER_IDS` | Çekirdek liste — en az kendi Telegram id'niz |
| `TG_ADMIN_IDS` | Onay/komut yetkisi. Boşsa `ALLOWED_USER_IDS` geçerli olur |
| `TG_WEBHOOK_SECRET` | Uzun rastgele dize (bot webhook'unun gizli başlığı) |

Rastgele dize üretmek için:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Kendi Telegram id'nizi bilmiyorsanız: `ALLOWED_USER_IDS`'i boş bırakıp bir kez giriş
deneyin, giriş ekranı id'nizi söyler.

**4. Webhook'u kur**

Deploy bittikten sonra, `.env.local` dosyanızda `TG_BOT_TOKEN` ve `TG_WEBHOOK_SECRET`
üretimdekiyle aynıysa:

```bash
npm run webhook -- https://kargorseli-nu.vercel.app
npm run webhook -- --durum     # kuruldu mu
npm run webhook -- --sil       # kaldır
```

Sonra `https://kargorseli-nu.vercel.app/api/health` adresini açın; her alan `true`
olmalı. Bota `/yardim` yazarak da doğrulayabilirsiniz.

### Kanala düşen loglar

Her satırda kullanıcı (ad, @kullanıcı, ID), İstanbul saati, IP + ülke/şehir ve tarayıcı
bilgisi olur; bunları sunucu isteğin kendisinden okur. Uygulamaya özel ayrıntılar:

| Olay | Ek bilgi |
|---|---|
| Giriş / reddedildi / geçersiz imza | oturum süresi; reddedilende onay düğmeleri |
| Uygulama açıldı | şablon, hisseler + fiyatları, lot/maliyet ayarları, ekran çözünürlüğü |
| Görsel indirildi | dosya adı, pozisyon, çözünürlük, tüm portföy ayarları |
| Toplu indirme | adet, ZIP mi, biçim, ilk 8 dosya adı |
| Panoya kopyalandı | pozisyon + ayarlar |
| Hata | nerede olduğu ve hata mesajı |
| Çıkış | — |

Log gönderimi ateşle-unut: kanala ulaşmazsa kullanıcının işi durmaz.

### Testler

```bash
npm run test:auth    # imza doğrulama, oturum, beyaz liste, log biçimi (30 test)
```

Bot akışının uçtan uca testi çalışan bir sunucu ister — gerçek bot/kanal/Upstash
gerekmez, hepsi taklit edilir:

```bash
cp .env.test.example .env.local
npm run fake             # ayrı terminal: sahte Telegram + Upstash
npm run dev -- -p 3111   # ayrı terminal
npm run test:bot         # 35 test
```

---

## Akış

1. **Hisseler** — kod, ad, güncel fiyat ve (opsiyonel) o hisseye özel base maliyet girilir.
   - **Logolar otomatik gelir.** Kod yazıldığı anda Matriks logo servisinden çekilip data URI
     olarak saklanır; ayrıca butona basmak gerekmez. "Logoları çek / temizle" butonları
     yeniden denemek veya kaldırmak için vardır.
   - Fiyatlar elle girilebilir ya da "Fiyatları API'den çek" ile
     `{base}/api/sorgu/bist/{KOD}` uç noktasından alınabilir.
   - Hisseye özel maliyet boş bırakılırsa genel base maliyet kullanılır. Fiyat seviyeleri
     çok farklı hisselerde (örn. 172 TL ve 298 TL) tek bir base maliyet anlamsız sonuç
     ürettiği için bu alan eklendi.
2. **Varyasyonlar** — base lot / lot adım ve base maliyet / maliyet adım.
   - **Eşleşmeli**: lot ve maliyet birlikte ilerler. `100/150 → 150/152,5 → 200/155 …`
   - **Çapraz**: tüm lot × maliyet kombinasyonları.
   - Maliyet adımı tutar (`₺`) veya yüzde (`%`) olabilir.
3. **Şablon** — 25 tasarımdan biri seçilir, önizleme anında güncellenir.
4. **İndirme** — kart başına *İndir* / *Kopyala*, ya da üst bardan *Seçilenleri indir*
   (birden fazlaysa ZIP). Çözünürlük 1x / 2x / 3x.

Ayarlar `localStorage`'a yazılır. **Eski bir ayar kaydı yeni varsayılanları gölgeleyebilir**;
beklenmedik bir durumda tarayıcı konsolundan `localStorage.removeItem('kg-config-v1')`
çalıştırıp sayfayı yenileyin.

### Kaç görsel üretilir?

| Şablon tipi | Üretilen görsel |
|---|---|
| `single` | Her pozisyon için bir görsel (hisse × varyasyon adımı) |
| `list` | **Her varyasyon adımı için bir portföy ekranı**, içinde o adımdaki tüm hisseler |

Yani 2 hisse × 4 adım → `single` şablonda 8 görsel, `list` şablonda 4 portföy ekranı
(her birinde 2 satır).

---

## Şablonlar

Hepsi gerçek uygulama arayüzü diliyle yazıldı: telefon iskeleti (durum çubuğu, başlık barı,
alt sekme çubuğu), bilgi yoğun satırlar, ölçülü renk (yeşil/kırmızı yalnızca K/Z'de),
sistem tipografisi ve hizalı rakamlar. Hiçbiri gerçek bir kurumun markasını taşımaz —
başlık `{{brand}}` alanından gelir.

| # | Ad | Tip | Boyut |
|---|---|---|---|
| 01 | Koyu · Yatırım Hesabı | list | 430×932 |
| 02 | Koyu · Pozisyon Detayı | single | 430×932 |
| 03 | Koyu · Portföy Tablosu | list | 430×932 |
| 04 | Koyu · Pozisyon Kartı | single | 760×420 |
| 05 | Açık · Mavi Hero | list | 430×932 |
| 06 | Açık · Pozisyon Detayı | single | 430×932 |
| 07 | Açık · Pozisyon Kartı | single | 760×420 |
| 08–10 | Bant · Yeşil / Lacivert / Bordo | list | 430×932 |
| 11 | Bant · Geniş Özet | list | 780×340 |
| 12 | Tablo · Renkli Rozet | list | 430×932 |
| 13 | Masaüstü · Geniş Tablo | list | 1000×auto |
| 14 | Donut · Pozisyon Blokları | list | 430×auto |
| 15 | Donut · Yatay Özet | list | 820×480 |
| 16 | Dağılım · Çubuk | list | 430×932 |
| 17 | Pozisyon Özeti | single | 430×932 |
| 18 | Şerit · Tek Satır | single | 780×230 |
| 19 | Hesap Özeti | list | 430×932 |
| 20 | Masaüstü · Terminal | list | 1100×auto |
| 21–22 | Kare · Koyu / Açık | single | 1080×1080 |
| 23 | Özet Kart | list | 900×auto |
| 24 | Koyu · Donut | list | 430×932 |
| 25 | Açık · Portföy Listesi | list | 430×932 |

---

## Logo servisi

`lib/logos.ts` — [Matriks Analist logo API'si](https://analistdocs.matriksdata.com/meta-veriler/logolar):

```
GET https://apitest.matriksdata.com/dumrul/v2/mtx-cdn/images/{type}/{name}?png=true&size=200
     type: symbols | foreign-symbols | flags | sectors
```

Kimlik doğrulama gerektirmiyor ve CORS başlığı döndüğü için tarayıcıdan doğrudan çekilebiliyor.
Logo indirilip **data URI**'ye çevrilerek saklanır; böylece PNG'ye dönüştürme sırasında ağa
çıkılmaz — export hem hızlı hem de çevrimdışı çalışır. Base URL `MATRIKS_BASE` sabitinden
değiştirilebilir.

---

## Kendi tasarımını eklemek

1. `public/templates/` altına bir `.html` dosyası koy.
2. `npm run sync` çalıştır — `manifest.json`'a eklenir, boyut ve tip otomatik tahmin edilir
   (`{{#rows}}` içeren dosyalar `list` sayılır).
3. `manifest.json` içinden `name`, `width`, `height`, `description` alanlarını düzenle.
   `height` yerine `"auto"` yazarsan yükseklik içeriğe göre hesaplanır.

### Kurallar

- Dosya **kendi `<style>` bloğunu içeren tek parça HTML** olmalı; `<html>`/`<body>` yazma.
- Kök elemana **sabit `width`** ver, manifest'teki değerle aynı olsun.
- **Sınıf adlarını ön ekle** (`.t26-…`). Şablonlar izole iframe'de render edilir.
- **Dış kaynak kullanma** — sistem font yığını kullan, görselleri data URI olarak göm.
- **Sayı biçimi tuzağı:** `{{share}}` gibi görüntü token'ları Türkçe ondalık ayracı içerir
  (`36,6`). CSS genişliği veya SVG koordinatı olarak kullanma — `width:36,6%` geçersizdir.
  Bunun için nokta ondalıklı `{{shareCss}}` ve `{{donutDash}}` / `{{donutOffset}}` var.
- Açıklama yazarken `{{ }}` kullanma (yorumlar temizlenir ama yine de kaçın).

### Token'lar

`{{token}}` HTML-escape edilir, `{{{token}}}` ham basılır.

**Kimlik / başlık**
`brand` `subtitle` `accountNo` `date` `time` `datetime` `txId` `step` `index`

**Enstrüman**
`code` `name` `shortName` `initial` `logo` `rowColor` `price` `priceMoney`

**Pozisyon**
`lot` `lotRaw` `cost` `costMoney` `investment` `investmentNum` `investmentCompact`
`value` `valueNum` `valueCompact` `valueInt` `valueDec` `cash` `cashNum`

**Kâr / zarar**
`pnl` (işaretli + para birimi) `pnlSigned` (işaretli, birimsiz) `pnlNum` `pnlAbs` `pnlCompact`
`pnlInt` `pnlDec` `pnlPercent` `pnlPercentNum` `dailyPnl` `dailyPercent` `dailyColor`

**Görünüm**
`trend` `trendTr` `trendSign` `trendArrow` `trendColor` `trendColorDark` `trendColorSoft`
`trendBorder` `currency` `symbol` `sparkPath` `sparkArea`

**Dağılım** — `share` (görüntü, virgüllü) `sharePercent` `shareCss` (CSS için, noktalı)
`donutDash` `donutOffset` `rowIndex`

**Liste (`kind: "list"`) toplamları** — blok dışında `pnl` `value` `investment` `pnlPercent`
toplam verir; ayrıca `rowCount` `totalAssets` `totalAssetsInt` `totalAssetsDec`
`topCode` `topShare`

**Koşullu bloklar**
```html
{{#profit}}…kârda gösterilir…{{/profit}}
{{^profit}}…kârda GİZLENİR…{{/profit}}
{{#hasLogo}}<img src="{{{logo}}}">{{/hasLogo}}
{{^hasLogo}}<div>{{initial}}</div>{{/hasLogo}}
{{#rows}}<tr><td>{{code}}</td><td>{{pnl}}</td></tr>{{/rows}}
```
Bayraklar: `profit` `loss` `hasLogo` `hasSubtitle` `hasAccountNo` `hasCash`
`hasPriceChange` `multiRow`

**Donut çizmek** — `pathLength="100"` sayesinde dash değerleri doğrudan yüzdedir:
```html
{{#rows}}
<circle cx="60" cy="60" r="45" fill="none" stroke="{{rowColor}}" stroke-width="16"
  pathLength="100" stroke-dasharray="{{donutDash}}" stroke-dashoffset="{{donutOffset}}"
  transform="rotate(-90 60 60)"/>
{{/rows}}
```

---

## Görsellerdeki veri hakkında

Tüm rakamlar girilen adet, maliyet ve güncel fiyattan hesaplanır — uydurma veri üretilmez.
`sparkPath` grafiği de rastgele değil, maliyetten güncel fiyata giden deterministik bir
eğridir; fiyatın gerçek geçmişi değil, giriş → güncel hareketinin şematik gösterimidir.

---

## Dosya düzeni

```
app/                  arayüz (tek sayfa)
components/           InputPanel, PreviewCard, LoginGate
lib/
  auth.ts             Telegram oturumu (istemci tarafı)
  logger.ts           olay loglarını /api/log'a gönderir
  server/auth.ts      imza doğrulama, oturum imzası, kanala log
  server/login.ts     iki giriş yolunun ortak son adımı (yetki + çerez + log)
  server/store.ts     yetkili listesi ve bağlantı anahtarları (Upstash Redis)
  types.ts            veri modeli
  variants.ts         lot/maliyet varyasyonu + adıma göre gruplama
  template.ts         {{token}} motoru + token seti
  format.ts           tr-TR sayı/para/tarih biçimleme
  export.ts           html-to-image + JSZip
  stage.ts            iframe render + görsele çevirme
  quotes.ts           BIST fiyat API istemcisi
  logos.ts            Matriks logo servisi
public/templates/     25 şablon + manifest.json
app/api/              giriş, log ve bot webhook uçları
scripts/
  sync-templates.mjs  şablonları tarar, manifest + gömülü kopya üretir
  auth.test.mjs       imza / oturum / log birim testleri
  bot-flow.test.mjs   bot ile yetkilendirme uçtan uca testi
  fake-services.mjs   test için sahte Telegram + Upstash
  set-webhook.mjs     bot webhook'unu kurar
```
