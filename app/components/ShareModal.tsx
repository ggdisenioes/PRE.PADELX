"use client";

import { useRef, useState } from 'react';
import html2canvas from 'html2canvas';

interface ShareModalProps {
  match: any;
  onClose: () => void;
}

export default function ShareModal({ match, onClose }: ShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!cardRef.current) return;
    setLoading(true);
    
    try {
      // Convertir el HTML a Imagen
      const canvas = await html2canvas(cardRef.current, {
        scale: 2, // Doble resolución para que se vea nítido en Retina/Móvil
        backgroundColor: '#111827', // Fondo oscuro asegurado
        useCORS: true // Para cargar imágenes externas si las hubiera
      });

      const image = canvas.toDataURL("image/jpeg", 1.0);
      
      // Truco para descargar el archivo
      const link = document.createElement('a');
      link.href = image;
      link.download = `Partido-Demo-${match.id}.jpg`;
      link.click();
    } catch (err) {
      console.error("Error generando imagen", err);
      alert("Hubo un error creando la imagen.");
    }
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl p-6 max-w-lg w-full shadow-2xl animate-in fade-in zoom-in duration-300">
        
        <h3 className="text-2xl font-bold text-gray-800 mb-4 text-center">¡Comparte el Resultado! 🚀</h3>
        
        {/* --- ESTA ES LA TARJETA QUE SE VA A FOTOGRAFIAR --- */}
        <div className="flex justify-center mb-6">
            <div 
                ref={cardRef} 
                className="w-[400px] h-[500px] bg-gray-900 text-white flex flex-col relative overflow-hidden shadow-2xl"
                style={{ fontFamily: 'sans-serif' }}
            >
                {/* Fondo Decorativo */}
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#ccff00] opacity-10 rounded-full blur-3xl transform translate-x-1/2 -translate-y-1/2"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-600 opacity-10 rounded-full blur-3xl transform -translate-x-1/2 translate-y-1/2"></div>

                {/* Header */}
                <div className="p-6 text-center border-b border-gray-800 z-10">
                    <h1 className="text-3xl font-black italic tracking-tighter mb-1">DEMO</h1>
                    <p className="text-[#ccff00] text-[10px] font-bold tracking-[0.3em] uppercase">PÁDEL MANAGER</p>
                </div>

                {/* Torneo */}
                <div className="text-center py-4 z-10">
                    <span className="bg-gray-800 px-3 py-1 rounded-full text-xs font-medium text-gray-400 uppercase">
                        {match.tournaments?.name || 'Torneo'}
                    </span>
                    <p className="text-gray-500 text-xs mt-2 uppercase tracking-widest">{match.round_name}</p>
                </div>

                {/* Marcador Central */}
                <div className="flex-1 flex flex-col justify-center items-center z-10 gap-6">
                    {/* Pareja A */}
                    <div className={`text-center ${match.winner === 'A' ? 'scale-110 transition-transform' : 'opacity-60'}`}>
                        <p className={`text-xl font-bold ${match.winner === 'A' ? 'text-[#ccff00]' : 'text-white'}`}>
                            {match.player_1_a} / {match.player_1_b}
                        </p>
                        {match.winner === 'A' && <span className="text-[10px] bg-[#ccff00] text-black px-2 py-0.5 rounded font-bold uppercase">Ganadores</span>}
                    </div>

                    {/* Resultado Grande */}
                    <div className="bg-white text-black px-6 py-3 rounded-xl font-mono text-3xl font-black tracking-widest shadow-lg transform -skew-x-12">
                        {match.score_set1}  {match.score_set2}  {match.score_set3}
                    </div>

                    {/* Pareja B */}
                    <div className={`text-center ${match.winner === 'B' ? 'scale-110 transition-transform' : 'opacity-60'}`}>
                        <p className={`text-xl font-bold ${match.winner === 'B' ? 'text-[#ccff00]' : 'text-white'}`}>
                            {match.player_2_a} / {match.player_2_b}
                        </p>
                        {match.winner === 'B' && <span className="text-[10px] bg-[#ccff00] text-black px-2 py-0.5 rounded font-bold uppercase">Ganadores</span>}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 text-center border-t border-gray-800 z-10">
                    <p className="text-gray-600 text-[10px]">Resultado oficial gestionado por PadelX Demo</p>
                </div>
            </div>
        </div>
        {/* -------------------------------------------------- */}

        <div className="flex gap-3">
            <button 
                onClick={onClose}
                className="flex-1 py-3 bg-gray-100 text-gray-700 font-bold rounded-lg hover:bg-gray-200 transition"
            >
                Cerrar
            </button>
            <button 
                onClick={handleDownload}
                disabled={loading}
                className="flex-1 py-3 bg-[#ccff00] text-black font-bold rounded-lg hover:bg-[#b3e600] transition shadow-lg flex justify-center items-center gap-2"
            >
                {loading ? 'Generando...' : (
                    <>
                        <span>📸 Descargar Imagen</span>
                    </>
                )}
            </button>
        </div>

      </div>
    </div>
  );
}