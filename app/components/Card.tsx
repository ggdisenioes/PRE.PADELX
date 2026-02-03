"use client";

import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export default function Card({ children, title, className = "" }: CardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }} // Empieza invisible y un poco abajo
      animate={{ opacity: 1, y: 0 }}  // Sube y aparece suavemente
      transition={{ duration: 0.4, ease: "easeOut" }} // Duración de la magia
      className={`bg-white rounded-xl shadow-sm border border-gray-100 p-6 ${className}`}
    >
      {/* Si le pasamos un título, lo muestra */}
      {title && (
        <h3 className="text-xl font-bold text-gray-800 mb-4 border-b pb-2">{title}</h3>
      )}
      
      {/* Contenido */}
      <div>{children}</div>
    </motion.div>
  );
}