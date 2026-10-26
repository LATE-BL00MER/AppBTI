import AppLayout from './components/AppLayout';
import Intro from './pages/Intro';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { AppProvider } from './state';
import Survey from './pages/Survey';
import Result from './pages/Result';
import { lazy, Suspense } from 'react';
import { Loading } from './components/Common';
import AboutData from './pages/AboutData';
const Explore = lazy(() => import('./pages/Explore'));

export default function App() {
  return (
    <BrowserRouter><AppProvider><AppLayout><Suspense fallback={<Loading />}><Routes>
      <Route path="/" element={<Intro />} />
      <Route path="/survey" element={<Survey />} />
      <Route path="/result" element={<Result />} />
      <Route path="/explore" element={<Explore />} />
      <Route path="/data" element={<AboutData />} />
      <Route path="*" element={<div className="empty-result"><h1>이 페이지는 찾을 수 없어요.</h1><a className="button primary" href="/">첫 화면으로</a></div>} />
    </Routes></Suspense></AppLayout></AppProvider></BrowserRouter>
  );
}
