import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// Bootstrap completo (CSS + iconos) y encima nuestra capa de tema.
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.css';
// Solo se usa el JS de Bootstrap para el menu desplegable del usuario;
// el resto de componentes interactivos los controla React.
import 'bootstrap/js/dist/dropdown';
import './styles.css';

import { App } from './App';

const contenedor = document.getElementById('root');
if (!contenedor) throw new Error('falta #root en index.html');

// createRoot: API de cliente de React 18/19 con renderizado concurrente, que es
// lo que hace que las transiciones del tablero no bloqueen la interfaz.
createRoot(contenedor).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
