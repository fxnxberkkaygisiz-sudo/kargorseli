export type Currency = "TRY" | "USD" | "EUR";

/** Kullanicinin girdigi tek bir hisse/enstruman. */
export interface Holding {
  id: string;
  code: string;
  name: string;
  /** Guncel piyasa fiyati. Elle girilir veya API'den cekilir. */
  price: number;
  /** Gunluk degisim yuzdesi (opsiyonel, sadece gosterim icin). */
  dailyChangePercent?: number;
  /**
   * Bu hisseye ozel base maliyet. Bos birakilirsa genel base maliyet kullanilir.
   * Fiyat seviyeleri cok farkli hisselerde tek bir base maliyet anlamsiz kaliyor.
   */
  baseCost?: number;
  logo?: string;
}

/** Lot / maliyet varyasyonlarinin nasil uretilecegi. */
export type VariantMode = "paired" | "cross";
export type StepMode = "absolute" | "percent";

export interface GeneratorConfig {
  holdings: Holding[];
  baseLot: number;
  lotStep: number;
  lotCount: number;
  baseCost: number;
  costStep: number;
  costCount: number;
  /** Maliyet adimi TL mi yoksa yuzde mi ilerlesin. */
  costStepMode: StepMode;
  /** paired: lot ve maliyet birlikte ilerler. cross: tum kombinasyonlar. */
  mode: VariantMode;
  currency: Currency;
  /** Gorselin ust kismindaki baslik / rumuz. */
  brand: string;
  subtitle: string;
  /** Islem tarihi (bos ise bugun). */
  dateISO: string;
  /** Ekstra nakit bakiye - portfoy ekranlarindaki "kullanilabilir bakiye". */
  cashBalance: number;
  /** Hesap numarasi gibi gorunen serbest metin (bos birakilabilir). */
  accountNo: string;
}

/** Tek bir uretilmis pozisyon. */
export interface Variant {
  id: string;
  index: number;
  /** Kacinci lot/maliyet adimi oldugu. Ayni adimdaki hisseler birlikte gruplanir. */
  step: number;
  code: string;
  name: string;
  logo?: string;
  price: number;
  dailyChangePercent?: number;
  lot: number;
  cost: number;
  investment: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

export type TemplateKind = "single" | "list";

export interface TemplateMeta {
  id: string;
  name: string;
  file: string;
  /**
   * single: her pozisyon icin ayri gorsel.
   * list:   her varyasyon adimi icin bir portfoy ekrani (tum hisseler birlikte).
   */
  kind: TemplateKind;
  width: number;
  height: number | "auto";
  description?: string;
}
