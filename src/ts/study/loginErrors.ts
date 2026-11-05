/** Translate Firebase and local-login failures into safe, readable user messages.
 * Firebase's email-enumeration protection intentionally uses the same error for
 * unknown usernames and incorrect passwords; never reveal account existence.
 */
export function friendlyLoginError(reason: unknown): string {
  const code = reason && typeof reason === 'object' && 'code' in reason &&
    typeof (reason as { code?: unknown }).code === 'string'
    ? (reason as { code: string }).code : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-email':
      return 'Invalid username or password.';
    case 'auth/user-disabled':
      return 'Account disabled by admin.';
    case 'auth/too-many-requests':
      return 'Too many login attempts. Please try again later.';
    case 'auth/network-request-failed':
    case 'functions/unavailable':
    case 'functions/deadline-exceeded':
      return 'Unable to connect. Check your internet connection and try again.';
    case 'auth/operation-not-allowed':
      return 'Login is not enabled. Please contact an administrator.';
    case 'auth/invalid-api-key':
    case 'auth/app-not-authorized':
    case 'auth/unauthorized-domain':
      return 'This website is not configured for login. Please contact an administrator.';
    case 'auth/user-token-expired':
    case 'auth/id-token-expired':
    case 'auth/requires-recent-login':
    case 'functions/unauthenticated':
      return 'Your login session expired. Please sign in again.';
    case 'functions/permission-denied':
      return 'You do not have access to this study. Please contact a researcher.';
    case 'functions/not-found':
      return 'Your account or study could not be found. Please contact a researcher.';
    case 'functions/resource-exhausted':
    case 'auth/quota-exceeded':
      return 'The login service is temporarily busy. Please try again later.';
  }

  const message = reason instanceof Error ? reason.message :
    typeof reason === 'string' ? reason : '';
  if (message === 'Invalid offline account') return 'Invalid username or password.';
  if (message.startsWith('Firebase is not configured'))
    return 'Login is not configured. Please contact an administrator.';

  // Keep application-specific validation messages (e.g. username format), but
  // never show raw Firebase error codes or the SDK's technical error strings.
  if (code.startsWith('auth/') || code.startsWith('functions/') ||
      /(?:FirebaseError|Firebase: Error|auth\/[a-z-]+)/i.test(message))
    return 'Could not sign in. Please try again or contact a researcher.';
  return message || 'Could not sign in. Please try again.';
}
