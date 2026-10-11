import { useEffect } from 'preact/hooks'
import { useAuth } from '../hooks/useAuth'
import { LoadingState } from '../components/LoadingSpinner'
import { useI18n } from '../i18n'
import { useKeyboardNavigation } from '../hooks'
import { platformBack } from '../platform/service'
import '../styles/auth.css'

interface AuthScreenProps {
  onAuthenticated: () => void
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const { t } = useI18n()
  const { isAuthenticated, isLoading, userCode, verificationUri, error, startAuth } = useAuth()
  useKeyboardNavigation({ onEnter: () => { if (error && !isLoading) startAuth() }, onBack: platformBack })

  useEffect(() => {
    if (!userCode && !isLoading && !isAuthenticated && !error) {
      startAuth()
    }
  }, [userCode, isLoading, isAuthenticated, error, startAuth])

  useEffect(() => {
    if (isAuthenticated) {
      onAuthenticated()
    }
  }, [isAuthenticated, onAuthenticated])

  if (isLoading && !userCode) {
    return (
      <div class="auth-screen">
        <LoadingState message={t.loading} />
      </div>
    )
  }

  return (
    <div class="auth-screen">
      <div class="auth-card">
        <h1 class="auth-title">{t.authTitle}</h1>

        {userCode && (
          <>
            <p class="auth-instruction">{t.authInstructions}</p>
            <p class="auth-url">{verificationUri || t.authVisit}</p>
            <p class="auth-instruction" style={{ marginTop: '32px' }}>
              {t.authEnterCode}
            </p>
            <div class="auth-code">{userCode}</div>
            <div class="auth-code-underline" />

            <div class="auth-polling">
              <div class="auth-polling-dot" />
              <span>{t.authWaiting}</span>
            </div>
          </>
        )}

        {error && <><p class="auth-error">{error}</p><button type="button" class="error-retry-button" onClick={startAuth}>{t.retry} (OK)</button></>}
      </div>
    </div>
  )
}
