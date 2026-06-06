import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AppProvider } from './contexts/AppContext'
import { RequireAuth } from './components/RequireAuth'
import { AppLayout } from './components/AppLayout'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { AuthCallback } from './pages/AuthCallback'
import { Invite } from './pages/Invite'
import { Onboarding } from './pages/Onboarding'
import { Dashboard } from './pages/Dashboard'
import { Operations } from './pages/Operations'
import { Shopping } from './pages/Shopping'
import { ScanReceipt } from './pages/ScanReceipt'
import { Assistant } from './pages/Assistant'
import { Goals } from './pages/Goals'
import { Crypto } from './pages/Crypto'
import { CryptoTax } from './pages/CryptoTax'
import { Debts } from './pages/Debts'
import { Flights } from './pages/Flights'
import { Settings } from './pages/Settings'

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AppProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/invite/:token" element={<Invite />} />

          <Route element={<RequireAuth />}>
            <Route path="/onboarding" element={<Onboarding />} />
            <Route element={<AppLayout />}>
              <Route index element={<Dashboard />} />
              <Route path="operations" element={<Operations />} />
              <Route path="shopping" element={<Shopping />} />
              <Route path="scan" element={<ScanReceipt />} />
              <Route path="assistant" element={<Assistant />} />
              <Route path="goals" element={<Goals />} />
              <Route path="crypto" element={<Crypto />} />
              <Route path="crypto/tax" element={<CryptoTax />} />
              <Route path="debts" element={<Debts />} />
              <Route path="flights" element={<Flights />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Route>
        </Routes>
      </AppProvider>
    </BrowserRouter>
  )
}

export default App
