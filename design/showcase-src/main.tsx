import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './showcase.css';
import { SCREENS } from './screens';
import { StyleGuide } from './StyleGuide';

const params = new URLSearchParams(location.search);
const id = params.get('screen');
const screen = SCREENS.find((s) => s.id === id);
const dark = screen ? screen.theme === 'nuit' : params.get('theme') === 'dark' || (!params.has('theme') && matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark', dark);

createRoot(document.getElementById('root')!).render(
  <StrictMode>{screen ? <screen.Component /> : <StyleGuide />}</StrictMode>,
);
