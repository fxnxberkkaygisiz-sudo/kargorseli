"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  TG_BOT,
  authEnabled,
  claimLink,
  fetchSession,
  loginWithTelegram,
  logout as endSession,
  startLinkLogin,
  type SessionUser,
  type TelegramAuthData,
} from "@/lib/auth";
import { IconAlert, IconLayers, IconRefresh } from "@/components/Icons";

interface SessionValue {
  user: SessionUser | null;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({ user: null, signOut: async () => {} });

/** Oturum bilgisi - giris kapali ise user null doner. */
export const useSession = () => useContext(SessionContext);

declare global {
  interface Window {
    __kgTelegramAuth?: (user: TelegramAuthData) => void;
  }
}

/**
 * Telegram Login Widget'i bir <script> etiketi olarak eklenir ve kendi
 * yerine bir iframe cizer; React ile dogrudan render edilemez. Geri cagri
 * global bir fonksiyon uzerinden geldigi icin window'a bagliyoruz.
 *
 * Widget yalniz BotFather'da `/setdomain` ile kayitli alan adinda calisir;
 * baska yerlerde "Bot domain invalid" der. Alttaki bot baglantisi yolu o
 * durumda da calisiyor.
 */
function TelegramButton({ onAuth }: { onAuth: (user: TelegramAuthData) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(onAuth);
  latest.current = onAuth;

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const node = host.current;
    if (!node) return;

    window.__kgTelegramAuth = (user) => latest.current(user);

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", TG_BOT);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-userpic", "false");
    script.setAttribute("data-onauth", "__kgTelegramAuth(user)");
    script.onerror = () => setFailed(true);
    node.appendChild(script);

    return () => {
      node.innerHTML = "";
      delete window.__kgTelegramAuth;
    };
  }, []);

  return (
    <>
      <div ref={host} className="min-h-[46px] flex items-center justify-center" />
      {failed && (
        <p className="text-[11.5px] text-[var(--text-3)] text-center leading-relaxed">
          Widget yüklenemedi — aşağıdaki yoldan girebilirsiniz.
        </p>
      )}
    </>
  );
}

/** Yoklama araligi ve toplam bekleme suresi (sunucudaki anahtar 5 dk yasiyor). */
const POLL_MS = 2000;
const POLL_LIMIT = 150;

export default function LoginGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [phase, setPhase] = useState<"checking" | "anon" | "in">(
    authEnabled ? "checking" : "in"
  );
  const [error, setError] = useState("");
  const [deniedId, setDeniedId] = useState("");
  const [busy, setBusy] = useState(false);
  /** Bot baglantisi bekleniyor - kullanici Telegram'da Baslat'a basacak. */
  const [waiting, setWaiting] = useState<{ url: string } | null>(null);

  const polling = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (polling.current !== null) {
      window.clearInterval(polling.current);
      polling.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  /* Sayfa acilisinda cerezdeki oturum hala gecerli mi? */
  useEffect(() => {
    if (!authEnabled) return;
    let cancelled = false;
    fetchSession().then((found) => {
      if (cancelled) return;
      setUser(found);
      setPhase(found ? "in" : "anon");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const enter = useCallback((found: SessionUser | null) => {
    setUser(found);
    setPhase("in");
  }, []);

  /* ------------------------------------------------------ widget yolu -- */
  const handleAuth = useCallback(
    async (data: TelegramAuthData) => {
      stopPolling();
      setWaiting(null);
      setBusy(true);
      setError("");
      setDeniedId("");

      const result = await loginWithTelegram(data);
      setBusy(false);

      if (!result.ok) {
        setError(result.error || "Giris yapilamadi.");
        if (result.userId) setDeniedId(result.userId);
        return;
      }
      enter(result.user ?? null);
    },
    [enter, stopPolling]
  );

  /* ------------------------------------------------ bot baglantisi ---- */
  const startBotLogin = useCallback(async () => {
    stopPolling();
    setBusy(true);
    setError("");
    setDeniedId("");

    const started = await startLinkLogin();
    setBusy(false);

    if (!started.ok || !started.data) {
      setError(started.error || "Bağlantı oluşturulamadı.");
      return;
    }

    const { nonce, url } = started.data;
    setWaiting({ url });
    // Açılır pencere engellenirse kullanıcı ekrandaki bağlantıya basar.
    window.open(url, "_blank", "noopener");

    let ticks = 0;
    polling.current = window.setInterval(async () => {
      ticks += 1;
      if (ticks > POLL_LIMIT) {
        stopPolling();
        setWaiting(null);
        setError("Süre doldu. Yeniden deneyin.");
        return;
      }

      const state = await claimLink(nonce);
      if (state.state === "pending") return;

      stopPolling();
      setWaiting(null);

      if (state.state === "ok") {
        enter(state.user);
      } else {
        setError(state.error);
        if (state.state === "denied" && state.userId) setDeniedId(state.userId);
      }
    }, POLL_MS);
  }, [enter, stopPolling]);

  const cancelWaiting = useCallback(() => {
    stopPolling();
    setWaiting(null);
  }, [stopPolling]);

  const signOut = useCallback(async () => {
    await endSession();
    setUser(null);
    setPhase("anon");
  }, []);

  if (phase === "checking") {
    return (
      <div className="h-screen flex items-center justify-center text-[12px] text-[var(--text-3)]">
        Oturum kontrol ediliyor…
      </div>
    );
  }

  if (phase === "anon") {
    return (
      <div className="h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-[340px] rounded-[var(--radius-lg)] border border-[var(--line)] bg-[var(--surface)] p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-[var(--radius)] bg-[var(--accent)] flex items-center justify-center text-white">
              <IconLayers size={18} />
            </span>
            <div className="leading-tight">
              <div className="text-[14px] font-semibold">Kâr Görseli</div>
              <div className="text-[11px] text-[var(--text-3)]">Giriş gerekiyor</div>
            </div>
          </div>

          <p className="text-[12px] text-[var(--text-2)] leading-relaxed">
            Bu araç yalnızca yetkili Telegram hesaplarına açık. Aşağıdaki yollardan biriyle
            giriş yapın; her giriş kayıt kanalına düşer.
          </p>

          {waiting ? (
            /* Telegram'da Baslat'a basilmasi bekleniyor. */
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2 text-[12px] text-[var(--text-2)]">
                <IconRefresh size={13} className="shrink-0 animate-spin" />
                <span>Telegram&apos;da <b>Başlat</b>&apos;a basmanız bekleniyor…</span>
              </div>
              <p className="text-[11.5px] text-[var(--text-3)] leading-relaxed">
                Uygulama açılmadıysa{" "}
                <a
                  href={waiting.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[var(--accent)] underline"
                >
                  bu bağlantıya
                </a>{" "}
                dokunun. Onayladıktan sonra bu sekmeye dönün, giriş kendiliğinden tamamlanır.
              </p>
              <button className="btn btn-sm self-start" onClick={cancelWaiting}>
                Vazgeç
              </button>
            </div>
          ) : busy ? (
            <div className="h-[46px] flex items-center justify-center text-[12px] text-[var(--text-3)]">
              Doğrulanıyor…
            </div>
          ) : (
            <>
              <TelegramButton onAuth={handleAuth} />

              <div className="flex items-center gap-2.5">
                <span className="flex-1 h-px bg-[var(--line)]" />
                <span className="text-[10.5px] text-[var(--text-3)]">ya da</span>
                <span className="flex-1 h-px bg-[var(--line)]" />
              </div>

              <button className="btn btn-primary w-full" onClick={startBotLogin}>
                Telegram uygulamasıyla gir
              </button>
              <p className="text-[11px] text-[var(--text-3)] leading-relaxed -mt-1.5">
                Bot sohbeti açılır, <b>Başlat</b>&apos;a basarsınız. Üstteki düğme
                &quot;Bot domain invalid&quot; derse bu yol her yerde çalışır.
              </p>
            </>
          )}

          {error && (
            <div className="flex items-start gap-2 text-[11.5px] text-[var(--err)] leading-relaxed">
              <IconAlert size={13} className="shrink-0 mt-px" />
              <span>
                {error}
                {deniedId && (
                  <>
                    {" "}
                    Telegram ID&apos;niz:{" "}
                    <code className="text-[var(--text-2)]">{deniedId}</code> — yöneticiye
                    bildirildi. Onaylandığında tekrar deneyin.
                  </>
                )}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return <SessionContext.Provider value={{ user, signOut }}>{children}</SessionContext.Provider>;
}
