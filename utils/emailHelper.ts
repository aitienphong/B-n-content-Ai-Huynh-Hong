/**
 * Helper to generate direct webmail inbox URL for a specific customer email address.
 * Automatically handles multi-account Gmail switching (authuser), Outlook login_hint,
 * Yahoo, iCloud, and custom domain webmail.
 */
export function getEmailInboxUrl(email: string): string {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return 'https://mail.google.com';
  }

  const cleanEmail = email.trim().toLowerCase();
  const domain = cleanEmail.split('@')[1] || '';

  // Google / Gmail (supports authuser parameter to open the exact Google account)
  if (domain === 'gmail.com' || domain === 'googlemail.com' || domain.includes('gmail')) {
    return `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(cleanEmail)}#inbox`;
  }

  // Microsoft Outlook / Hotmail / Live
  if (
    domain === 'outlook.com' ||
    domain === 'hotmail.com' ||
    domain === 'live.com' ||
    domain === 'msn.com' ||
    domain.includes('outlook') ||
    domain.includes('hotmail')
  ) {
    return `https://outlook.live.com/mail/0/?login_hint=${encodeURIComponent(cleanEmail)}`;
  }

  // Yahoo Mail
  if (domain.includes('yahoo')) {
    return 'https://mail.yahoo.com';
  }

  // Apple iCloud Mail
  if (domain === 'icloud.com' || domain === 'me.com' || domain === 'mac.com') {
    return 'https://www.icloud.com/mail';
  }

  // ProtonMail
  if (domain.includes('proton')) {
    return 'https://mail.proton.me';
  }

  // Zoho Mail
  if (domain.includes('zoho')) {
    return 'https://mail.zoho.com';
  }

  // Fallback to provider domain (e.g. corporate or educational webmail)
  return `https://${domain}`;
}
