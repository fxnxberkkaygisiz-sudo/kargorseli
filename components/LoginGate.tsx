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
  authEnabled,
  claimLink,
  fetchSession,
  logout as endSession,
  startLinkLogin,
  type SessionUser,
} from "@/lib/auth";
import { IconAlert, IconLayers, IconRefresh } from "@/components/Icons";

interface SessionValue {
  user: SessionUser | null;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue>({ user: null, signOut: async () => {} });

/** Oturum bilgisi - giris kapali ise user null doner. */
export const useSession = () => useContext(SessionContext);

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
            Bu araç yalnızca yetkili Telegram hesaplarına açık. Aşağıdaki düğme Telegram
            uygulamasını açar; her giriş kayıt kanalına düşer.
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
              <button className="btn btn-primary w-full" onClick={startBotLogin}>
                Telegram ile giriş yap
              </button>
              <p className="text-[11px] text-[var(--text-3)] leading-relaxed -mt-1.5">
                Bot sohbeti açılır, <b>Başlat</b>&apos;a basarsınız, bu sekmeye dönersiniz.
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
