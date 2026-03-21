import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Layout } from './components/Layout'
import { PopulacePage } from './pages/PopulacePage'
import { DotaznikyPage } from './pages/DotaznikyPage'
import { SimulacePage } from './pages/SimulacePage'
import { VysledkyPage } from './pages/VysledkyPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/populace" replace />} />
          <Route path="populace" element={<PopulacePage />} />
          <Route path="dotazniky" element={<DotaznikyPage />} />
          <Route path="simulace" element={<SimulacePage />} />
          <Route path="vysledky" element={<VysledkyPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

export default App
