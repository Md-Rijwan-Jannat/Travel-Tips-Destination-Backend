import { OAuth2Client } from 'google-auth-library';
import config from '../../config';

export interface TGoogleIdentity {
  /** Stable Google subject identifier — the only safe external id. */
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

let client: OAuth2Client | null = null;

const getClient = (): OAuth2Client => {
  if (!config.google_client_id) {
    throw new Error(
      'Google OAuth is not configured: set GOOGLE_CLIENT_ID on the server'
    );
  }
  if (!client) {
    client = new OAuth2Client(config.google_client_id);
  }
  return client;
};

/**
 * Verify a Google ID token server-side using Google's official library.
 * Validates signature, issuer, audience (client id) and expiry. Never trust
 * a browser-supplied profile payload — only tokens that pass this check
 * may be used for authentication.
 */
export const verifyGoogleIdToken = async (
  idToken: string
): Promise<TGoogleIdentity> => {
  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: config.google_client_id,
  });
  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email) {
    throw new Error('Google token missing required claims');
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name,
    picture: payload.picture,
  };
};
