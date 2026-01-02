
import React from 'react';
import TrafficSimulation from './components/TrafficSimulation';

const App: React.FC = () => {
  return (
    <div className="bg-gray-900 text-white min-h-screen flex flex-col items-center font-sans">
      <header className="w-full p-4 bg-gray-800 shadow-md text-center">
        <h1 className="text-2xl md:text-3xl font-bold text-cyan-400">Simulación de Cruce de Tráfico Inteligente</h1>
        <p className="text-sm md:text-base text-gray-300 mt-1">Control de semáforos basado en demanda vehicular en tiempo real</p>
      </header>
      <main className="w-full flex-grow flex items-center justify-center p-4">
        <TrafficSimulation />
      </main>
      <footer className="w-full p-3 bg-gray-800 text-center text-xs text-gray-400">
        <p>Desarrollado con React, TypeScript, Three.js y Tailwind CSS.</p>
      </footer>
    </div>
  );
};

export default App;
