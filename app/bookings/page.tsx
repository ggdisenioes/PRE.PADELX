"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useRouter } from "next/navigation";
import Card from "../components/Card";
import toast from "react-hot-toast";

type Court = {
  id: number;
  name: string;
};

type Booking = {
  id: number;
  court_id: number;
  booking_date: string;
  start_time: string;
  end_time: string;
  status: string;
};

export default function BookingsPage() {
  const router = useRouter();
  const [courts, setCourts] = useState<Court[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [selectedCourt, setSelectedCourt] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    court_id: "",
    booking_date: selectedDate,
    start_time: "09:00",
    end_time: "10:00",
    notes: "",
  });

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    setCurrentUserId(user.id);

    // Get courts
    const { data: courtsData } = await supabase
      .from("courts")
      .select("id, name")
      .order("name");

    if (courtsData && courtsData.length > 0) {
      setCourts(courtsData);
      setSelectedCourt(courtsData[0].id.toString());
      setFormData({ ...formData, court_id: courtsData[0].id.toString() });
    }

    fetchBookings();
  };

  const fetchBookings = async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch(
        `/api/bookings?date=${selectedDate}&court_id=${selectedCourt || ""}`,
        { headers }
      );
      const result = await response.json();

      if (response.ok) {
        setBookings(result.bookings || []);
      }
    } catch (error) {
      console.error("Error fetching bookings:", error);
      toast.error("Error cargando reservas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [selectedDate, selectedCourt]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.court_id) {
      toast.error("Selecciona una pista");
      return;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (sessionData?.session?.access_token) {
        headers["Authorization"] = `Bearer ${sessionData.session.access_token}`;
      }

      const response = await fetch("/api/bookings", {
        method: "POST",
        headers,
        body: JSON.stringify({
          court_id: parseInt(formData.court_id),
          booking_date: formData.booking_date,
          start_time: formData.start_time,
          end_time: formData.end_time,
          notes: formData.notes || null,
        }),
      });

      if (response.ok) {
        toast.success("¡Pista reservada!");
        setFormData({
          court_id: formData.court_id,
          booking_date: selectedDate,
          start_time: "09:00",
          end_time: "10:00",
          notes: "",
        });
        setShowForm(false);
        fetchBookings();
      } else {
        const result = await response.json();
        toast.error(result.error || "Error al reservar");
      }
    } catch (error) {
      toast.error("Error");
    }
  };

  const timeSlots = Array.from({ length: 15 }, (_, i) => {
    const hour = Math.floor(i / 2) + 7;
    const minute = (i % 2) * 30;
    return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  });

  const isTimeBooked = (courtId: number, time: string) => {
    return bookings.some((b) => {
      const bookingStart = b.start_time;
      const bookingEnd = b.end_time;
      return b.court_id === courtId && time >= bookingStart && time < bookingEnd;
    });
  };

  if (loading) {
    return <div className="p-8 text-center">Cargando reservas...</div>;
  }

  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">📅 Reservar Pista</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          {showForm ? "Cancelar" : "+ Nueva Reserva"}
        </button>
      </div>

      {showForm && (
        <Card className="p-6">
          <h2 className="text-xl font-bold mb-4">Reservar Pista</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Pista</label>
                <select
                  value={formData.court_id}
                  onChange={(e) =>
                    setFormData({ ...formData, court_id: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                >
                  {courts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fecha</label>
                <input
                  type="date"
                  value={formData.booking_date}
                  onChange={(e) =>
                    setFormData({ ...formData, booking_date: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Hora Inicio</label>
                <input
                  type="time"
                  value={formData.start_time}
                  onChange={(e) =>
                    setFormData({ ...formData, start_time: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Hora Fin</label>
                <input
                  type="time"
                  value={formData.end_time}
                  onChange={(e) =>
                    setFormData({ ...formData, end_time: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Notas (opcional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg h-20"
              />
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Reservar
            </button>
          </form>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Filtrar por pista</label>
            <select
              value={selectedCourt}
              onChange={(e) => setSelectedCourt(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">Todas las pistas</option>
              {courts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Fecha</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg"
            />
          </div>
        </div>

        {bookings.length > 0 ? (
          <Card className="p-6 overflow-x-auto">
            <div className="space-y-3">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="flex justify-between items-center p-3 bg-blue-50 rounded border border-blue-200"
                >
                  <div>
                    <p className="font-semibold">
                      {courts.find((c) => c.id === booking.court_id)?.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      {booking.start_time} - {booking.end_time}
                    </p>
                  </div>
                  <span className="px-3 py-1 bg-green-200 text-green-800 rounded text-sm">
                    {booking.status === "confirmed" ? "Confirmada" : booking.status}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        ) : (
          <Card className="p-6 text-center text-gray-500">
            No hay reservas para esta fecha y pista
          </Card>
        )}
      </div>
    </main>
  );
}
