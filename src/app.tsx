import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'
import { LandingPage } from './features/landing/components/landing-page'
import { Spinner } from './components/ui/spinner'

const ReadingRoutes = lazy(() => import('./pages/reading-routes'))

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        path="*"
        element={
          <Suspense
            fallback={
              <div className="flex min-h-svh items-center justify-center">
                <Spinner aria-label="화면 불러오는 중" />
              </div>
            }
          >
            <ReadingRoutes />
          </Suspense>
        }
      />
    </Routes>
  )
}

export default App
