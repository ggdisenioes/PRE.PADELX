"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import toast from "react-hot-toast";
import { formatDateMadrid } from "@/lib/dates";
import {
  browserSupportsWebAuthn,
  startRegistration,
} from "@simplewebauthn/browser";
import { useTranslation } from "@/i18n";

type PlayerData = {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  level: number | null;
  avatar_url: string | null;
  notify_email: boolean;
  notify_whatsapp: boolean;
};

type PlayerRef = { id: number; name: string } | null;

type MatchRow = {
  id: number;
  score: string | null;
  winner: string | null;
  start_time: string | null;
  player_1_a: PlayerRef;
  player_2_a: PlayerRef;
  player_1_b: PlayerRef;
  player_2_b: PlayerRef;
};

type HistoryItem = {
  id: number;
  partner: string;
  opponent: string;
  result: "Victoria" | "Derrota" | "Pendiente";
  score: string;
  ts: number;
  dateLabel: string;
};

type PasskeyDevice = {
  id: number;
  device_name: string | null;
  created_at: string | null;
  last_used_at: string | null;
};

export default function MiCuentaPage() {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [stats, setStats] = useState({ wins: 0, losses: 0, total: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notLinked, setNotLinked] = useState(false);
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyDevices, setPasskeyDevices] = useState<PasskeyDevice[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const winRate = useMemo(() => {
    if (!stats.total) return 0;
    return Math.round((stats.wins / stats.total) * 100);
  }, [stats]);

  useEffect(() => {
    let active = true;

    const checkSupport = async () => {
      try {
        const browserSupport = browserSupportsWebAuthn();
        if (!browserSupport) {
          if (active) setPasskeySupported(false);
          return;
        }
        if (active) setPasskeySupported(true);
      } catch {
        if (active) setPasskeySupported(false);
      }
    };

    checkSupport();
    return () => {
      active = false;
    };
  }, []);

  const getAccessToken = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return session?.access_token ?? null;
  };

  const loadPasskeyDevices = async () => {
    const token = await getAccessToken();
    if (!token) return;

    const response = await fetch("/api/auth/passkeys/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return;
    const payload = (await response.json()) as { credentials?: PasskeyDevice[] };
    setPasskeyDevices(payload.credentials || []);
  };

  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        setNotLinked(true);
        return;
      }

      const { data: playerData, error: playerErr } = await supabase
        .from("players")
        .select("id, name, email, phone, level, avatar_url, notify_email, notify_whatsapp")
        .eq("user_id", user.id)
        .maybeSingle();

      if (playerErr || !playerData) {
        setLoading(false);
        setNotLinked(true);
        return;
      }

      setPlayer(playerData as PlayerData);
      setNotifyEmail(playerData.notify_email ?? true);
      setNotifyWhatsapp(playerData.notify_whatsapp ?? false);
      setPhone(playerData.phone || "");
      setEmail(playerData.email || "");
      setName(playerData.name || "");
      setAvatarUrl(playerData.avatar_url || "");

      const playerId = playerData.id;
      const { data: matchesData } = await supabase
        .from("matches")
        .select(
          `id, score, winner, start_time,
          player_1_a (id, name),
          player_2_a (id, name),
          player_1_b (id, name),
          player_2_b (id, name)`
        )
        .or(
          `player_1_a.eq.${playerId},player_2_a.eq.${playerId},player_1_b.eq.${playerId},player_2_b.eq.${playerId}`
        );

      const rows = (matchesData ?? []) as unknown as MatchRow[];

      let wins = 0;
      let losses = 0;
      const historyData: HistoryItem[] = [];

      for (const match of rows) {
        let team: "A" | "B" | null = null;
        if (match.player_1_a?.id === playerId || match.player_2_a?.id === playerId) team = "A";
        else if (match.player_1_b?.id === playerId || match.player_2_b?.id === playerId) team = "B";
        if (!team) continue;

        const w = match.winner ?? "pending";
        const isFinal = w !== "pending";
        const isWin = isFinal ? team === w : false;
        if (isFinal) {
          if (isWin) wins++;
          else losses++;
        }

        const mate =
          team === "A"
            ? (match.player_1_a?.id === playerId ? match.player_2_a?.name : match.player_1_a?.name)
            : (match.player_1_b?.id === playerId ? match.player_2_b?.name : match.player_1_b?.name);

        const opp1 = team === "A" ? match.player_1_b?.name : match.player_1_a?.name;
        const opp2 = team === "A" ? match.player_2_b?.name : match.player_2_a?.name;
        const opponents = [opp1, opp2].filter(Boolean);

        historyData.push({
          id: match.id,
          partner: mate || "(Sin compañero)",
          opponent: opponents.length === 2 ? `${opponents[0]} y ${opponents[1]}` : opponents[0] || "Oponente",
          result: !isFinal ? "Pendiente" : isWin ? "Victoria" : "Derrota",
          score: match.score ?? "-",
          ts: match.start_time ? Date.parse(match.start_time) : 0,
          dateLabel: match.start_time ? formatDateMadrid(match.start_time) : "—",
        });
      }

      setStats({ wins, losses, total: wins + losses });
      historyData.sort((a, b) => b.ts - a.ts);
      setHistory(historyData.slice(0, 20));
      await loadPasskeyDevices();
      setLoading(false);
    };

    load();
  }, []);

  const handleEnablePasskey = async () => {
    if (!passkeySupported) {
      toast.error(t("auth.passkeyUnavailable"));
      return;
    }

    const token = await getAccessToken();
    if (!token) {
      toast.error(t("auth.loginRequired"));
      return;
    }

    setPasskeyBusy(true);

    try {
      const optionsResponse = await fetch("/api/auth/passkeys/register/options", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });

      const optionsPayload = (await optionsResponse.json().catch(() => ({}))) as {
        options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
      };

      if (!optionsResponse.ok || !optionsPayload.options) {
        toast.error(t("auth.passkeySetupError"));
        return;
      }

      const credential = await startRegistration({
        optionsJSON: optionsPayload.options,
      });

      const verifyResponse = await fetch("/api/auth/passkeys/register/verify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          credential,
          deviceName:
            typeof navigator !== "undefined"
              ? navigator.userAgent.slice(0, 120)
              : null,
        }),
      });

      if (!verifyResponse.ok) {
        toast.error(t("auth.passkeySetupError"));
        return;
      }

      toast.success(t("auth.passkeySetupSuccess"));
      await loadPasskeyDevices();
    } catch (error) {
      console.error("passkey setup error", error);
      toast.error(t("auth.passkeySetupError"));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleRemovePasskey = async (id: number) => {
    const token = await getAccessToken();
    if (!token) {
      toast.error(t("auth.loginRequired"));
      return;
    }

    setPasskeyBusy(true);
    try {
      const response = await fetch("/api/auth/passkeys/me", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ id }),
      });

      if (!response.ok) {
        toast.error(t("auth.passkeySetupError"));
        return;
      }

      toast.success(t("auth.passkeyRemoved"));
      await loadPasskeyDevices();
    } catch (error) {
      console.error("passkey remove error", error);
      toast.error(t("auth.passkeySetupError"));
    } finally {
      setPasskeyBusy(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    setUploading(true);
    try {
      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}_${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("avatars").upload(filePath, file);
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("avatars").getPublicUrl(filePath);
      setAvatarUrl(data.publicUrl);
      toast.success("Imagen subida correctamente.");
    } catch (error: any) {
      toast.error("Error subiendo imagen: " + (error?.message || ""));
    } finally {
      setUploading(false);
    }
  };

  const savePreferences = async () => {
    if (!player) return;
    if (!name.trim()) {
      toast.error("El nombre es obligatorio.");
      return;
    }
    setSaving(true);

    const { error } = await supabase
      .from("players")
      .update({
        name: name.trim(),
        avatar_url: avatarUrl || null,
        email: email || null,
        phone: phone || null,
        notify_email: notifyEmail,
        notify_whatsapp: notifyWhatsapp,
      })
      .eq("id", player.id);

    if (error) {
      toast.error("Error al guardar cambios.");
    } else {
      toast.success("Cambios guardados.");
      setPlayer((prev) => prev ? { ...prev, name: name.trim(), avatar_url: avatarUrl || null, email: email || null, phone: phone || null } : prev);
    }
    setSaving(false);
  };

  if (loading) {
    return <p className="p-8 text-gray-500 animate-pulse">Cargando tu perfil…</p>;
  }

  if (notLinked) {
    return (
      <main className="max-w-3xl mx-auto p-6 md:p-10">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto text-3xl">👤</div>
          <h1 className="text-2xl font-bold text-gray-900">Mi Cuenta</h1>
          <p className="text-gray-600">
            Tu cuenta aún no está vinculada a un perfil de jugador.
          </p>
          <p className="text-sm text-gray-500">
            Contactá al administrador de tu club para que vincule tu usuario con tu perfil de jugador.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">
      {/* Profile header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="h-32 bg-gradient-to-r from-[#0b1220] via-[#1a2740] to-[#0e1626] rounded-t-2xl" />
        <div className="px-6 pb-6 pt-3 flex flex-col sm:flex-row sm:items-center gap-4 relative">
          {/* Avatar with upload — overlaps banner */}
          <div className="relative shrink-0 -mt-16">
            <img
              src={avatarUrl || "https://placehold.co/200x200?text=Jugador"}
              alt={`Avatar de ${player!.name}`}
              className="w-24 h-24 rounded-2xl object-cover border-4 border-white shadow-lg bg-white"
              loading="lazy"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 w-8 h-8 bg-gray-900 text-white rounded-full flex items-center justify-center text-sm shadow-lg hover:bg-black transition disabled:opacity-50"
              title="Cambiar foto"
            >
              {uploading ? "…" : "📷"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
            />
          </div>
          <div className="flex-1">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl md:text-3xl font-bold text-gray-900 bg-transparent border-b-2 border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none transition w-full"
              placeholder="Tu nombre"
            />
            <div className="flex items-center gap-3 mt-1.5">
              <span className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-sm font-medium px-3 py-1 rounded-full">
                Nivel {player!.level ?? "—"}
              </span>
              {stats.total > 0 && (
                <span className="text-sm text-gray-500">
                  {stats.total} {stats.total === 1 ? "partido" : "partidos"} jugados
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats grid */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-blue-600 text-lg">🎾</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Partidos</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-green-600 text-lg">✓</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Victorias</p>
          <p className="text-3xl font-bold text-green-600 mt-1">{stats.wins}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-red-500 text-lg">✗</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">Derrotas</p>
          <p className="text-3xl font-bold text-red-600 mt-1">{stats.losses}</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mx-auto mb-2">
            <span className="text-amber-600 text-lg">%</span>
          </div>
          <p className="text-xs text-gray-500 font-medium">% Victorias</p>
          <p className="text-3xl font-bold text-gray-900 mt-1">{winRate}%</p>
          {stats.total > 0 && (
            <div className="w-full h-1.5 bg-gray-100 rounded-full mt-3 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full transition-all"
                style={{ width: `${winRate}%` }}
              />
            </div>
          )}
        </div>
      </section>

      {/* Datos de contacto y preferencias */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Contact info */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Datos de contacto</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Correo electrónico</label>
              <input
                type="email"
                className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 text-gray-900"
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Teléfono / WhatsApp</label>
              <input
                type="tel"
                className="w-full p-2.5 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 text-gray-900"
                placeholder="Ej: +34612345678"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Notification preferences */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">Notificaciones</h2>
          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition">
              <input
                type="checkbox"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Notificaciones por Email</p>
                <p className="text-xs text-gray-500">Recibí avisos de partidos y torneos</p>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl hover:bg-gray-50 transition">
              <input
                type="checkbox"
                checked={notifyWhatsapp}
                onChange={(e) => setNotifyWhatsapp(e.target.checked)}
                className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Notificaciones por WhatsApp</p>
                <p className="text-xs text-gray-500">Recibí mensajes directos al celular</p>
              </div>
            </label>

            {notifyWhatsapp && !phone && (
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                Ingresá un número de teléfono para recibir notificaciones por WhatsApp.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Biometrics / Passkeys */}
      <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{t("auth.passkeySetupTitle")}</h2>
            <p className="text-sm text-gray-500 mt-1">{t("auth.passkeySetupDescription")}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleEnablePasskey()}
            disabled={!passkeySupported || passkeyBusy}
            className="rounded-xl bg-gray-900 text-white px-4 py-2 text-sm font-semibold hover:bg-black transition disabled:opacity-50"
          >
            {passkeyBusy ? t("auth.passkeyVerifying") : t("auth.passkeySetupButton")}
          </button>
        </div>

        {!passkeySupported && (
          <p className="text-xs text-amber-600">{t("auth.passkeyUnavailable")}</p>
        )}

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            {t("auth.passkeyListTitle")}
          </p>
          {passkeyDevices.length === 0 ? (
            <p className="rounded-lg border border-dashed border-gray-200 p-3 text-sm text-gray-500">
              {t("auth.passkeyListEmpty")}
            </p>
          ) : (
            passkeyDevices.map((device) => (
              <div
                key={device.id}
                className="rounded-lg border border-gray-200 p-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {device.device_name || `Device #${device.id}`}
                  </p>
                  <p className="text-xs text-gray-500">
                    {device.last_used_at
                      ? `Último uso: ${formatDateMadrid(device.last_used_at)}`
                      : `Registrado: ${
                          device.created_at ? formatDateMadrid(device.created_at) : "—"
                        }`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemovePasskey(device.id)}
                  disabled={passkeyBusy}
                  className="shrink-0 rounded-md border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
                >
                  {t("auth.passkeyRemove")}
                </button>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={savePreferences}
          disabled={saving}
          className="bg-gray-900 text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-black transition disabled:opacity-50 shadow-sm"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </div>

      {/* Match history */}
      <section>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Historial de partidos</h2>

        {history.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 text-center">
            <p className="text-gray-400">Sin partidos registrados.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm divide-y divide-gray-50 overflow-hidden">
            {history.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-4 px-5 py-4 hover:bg-gray-50/50 transition">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-1 h-10 rounded-full shrink-0 ${
                    m.result === "Victoria"
                      ? "bg-green-500"
                      : m.result === "Derrota"
                      ? "bg-red-500"
                      : "bg-gray-300"
                  }`} />
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">Con {m.partner}</p>
                    <p className="text-sm text-gray-500 truncate">vs {m.opponent}</p>
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0">
                  <div className="text-right">
                    <p className={`text-sm font-bold ${
                      m.result === "Victoria"
                        ? "text-green-600"
                        : m.result === "Derrota"
                        ? "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {m.result}
                    </p>
                    <p className="text-sm font-mono text-gray-700">{m.score}</p>
                  </div>
                  <p className="text-xs text-gray-400 w-20 text-right">{m.dateLabel}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
