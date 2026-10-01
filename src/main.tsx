import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {watchForAppUpdate} from './utils/appUpdate';

// 要在畫面出來之前就開始監聽，才不會錯過新版接手的那一刻
watchForAppUpdate();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
