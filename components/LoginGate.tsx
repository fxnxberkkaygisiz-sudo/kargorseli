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
  fetchSession,
  loginWithTelegram,
  logout as endSession,
  type SessionUser,
  type TelegramAuthData,
} from "@/lib/auth";
import { IconAlert, IconLayers } from "@/components/Icons";

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
 * localhost'ta bos kalir.
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
        <p className="text-[11.5px] text-[var(--err)] text-center">
          Telegram widget&apos;i yuklenemedi. Ag engeli olabilir.
        </p>
      )}
    </>
  );
}

export default function LoginGate({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [phase, setPhase] = useState<"checking" | "anon" | "in">(
    authEnabled ? "checking" : "in"
  );
  const [error, setError] = useState("");
  const [deniedId, setDeniedId] = useState("");
  const [busy, setBusy] = useState(false);

  /* Sayfa acilisinda kayitli token hala gecerli mi? */
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

  const handleAuth = useCallback(async (data: TelegramAuthData) => {
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
    setUser(result.user ?? null);
    setPhase("in");
  }, []);

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
            Bu araç yalnızca yetkili Telegram hesaplarına açık. Aşağıdaki düğmeyle giriş
            yapın; her giriş kayıt kanalına düşer.
          </p>

          {busy ? (
            <div className="h-[46px] flex items-center justify-center text-[12px] text-[var(--text-3)]">
              Doğrulanıyor…
            </div>
          ) : (
            <TelegramButton onAuth={handleAuth} />
          )}

          {error && (
            <div className="flex items-start gap-2 text-[11.5px] text-[var(--err)] leading-relaxed">
              <IconAlert size={13} className="shrink-0 mt-px" />
              <span>
                {error}
                {deniedId && (
                  <>
                    {" "}
                    Telegram ID&apos;niz: <code className="text-[var(--text-2)]">
                      {deniedId}
                    </code>{" "}
                    — yöneticiye bildirildi. Onaylandığında bu sayfayı yenileyip
                    girebilirsiniz.
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
