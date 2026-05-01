import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { redis } from "../config/redis.js";
import { User } from "../models/user.model.js";

const AUTH_CODE_TTL_SECONDS = 5 * 60;
const AUTH_CODE_PREFIX = "oidc:auth_code:";

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const publicJwk = publicKey.export({ format: "jwk" });
const jwkKid = crypto
  .createHash("sha256")
  .update(JSON.stringify(publicJwk))
  .digest("hex")
  .slice(0, 16);

const oidcError = (statusCode, message) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const issuer = () =>
  process.env.OIDC_ISSUER || `http://localhost:${process.env.PORT || 8000}`;

const clientId = () => process.env.OIDC_CLIENT_ID || "1m-checkboxes-client";
const clientSecret = () =>
  process.env.OIDC_CLIENT_SECRET || "replace_with_oidc_client_secret";
const redirectUri = () =>
  process.env.OIDC_REDIRECT_URI || `${issuer()}/api/auth/oidc/callback`;

const getPublicKeyPem = () =>
  publicKey.export({ type: "spki", format: "pem" }).toString();

const getPrivateKeyPem = () =>
  privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const getUserClaims = (user) => ({
  sub: user._id.toString(),
  email: user.email,
  email_verified: true,
  given_name: user.firstName,
  family_name: user.lastName || "",
  name: [user.firstName, user.lastName].filter(Boolean).join(" "),
});

export const getOidcClientConfig = () => ({
  clientId: clientId(),
  clientSecret: clientSecret(),
  redirectUri: redirectUri(),
});

export const buildDiscoveryDocument = () => ({
  issuer: issuer(),
  authorization_endpoint: `${issuer()}/oidc/authorize`,
  token_endpoint: `${issuer()}/oidc/token`,
  userinfo_endpoint: `${issuer()}/oidc/userinfo`,
  jwks_uri: `${issuer()}/.well-known/jwks.json`,
  response_types_supported: ["code"],
  grant_types_supported: ["authorization_code"],
  subject_types_supported: ["public"],
  scopes_supported: ["openid", "profile", "email"],
  token_endpoint_auth_methods_supported: ["client_secret_post"],
  id_token_signing_alg_values_supported: ["RS256"],
  claims_supported: [
    "sub",
    "email",
    "email_verified",
    "given_name",
    "family_name",
    "name",
  ],
});

export const buildJwks = () => ({
  keys: [
    {
      ...publicJwk,
      alg: "RS256",
      use: "sig",
      kid: jwkKid,
    },
  ],
});

export const getOidcPublicKey = () => ({
  client_id: clientId(),
  redirect_uri: redirectUri(),
  public_key: getPublicKeyPem(),
});

export const createAuthorizationCode = async ({
  userId,
  requestedClientId,
  requestedRedirectUri,
  scope,
  nonce,
}) => {
  if (requestedClientId !== clientId()) {
    throw oidcError(400, "Invalid client_id");
  }

  if (requestedRedirectUri !== redirectUri()) {
    throw oidcError(400, "Invalid redirect_uri");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw oidcError(401, "User not found for OIDC authorization");
  }

  const code = crypto.randomBytes(32).toString("hex");
  const record = {
    userId: user._id.toString(),
    clientId: requestedClientId,
    redirectUri: requestedRedirectUri,
    scope: scope || "openid profile email",
    nonce: nonce || null,
  };

  await redis.set(
    `${AUTH_CODE_PREFIX}${code}`,
    JSON.stringify(record),
    "EX",
    AUTH_CODE_TTL_SECONDS,
  );

  return code;
};

const consumeAuthorizationCode = async (code) => {
  const key = `${AUTH_CODE_PREFIX}${code}`;
  const rawRecord = await redis.get(key);

  if (!rawRecord) {
    throw oidcError(
      400,
      "Invalid, expired, or already used authorization code",
    );
  }

  await redis.del(key);
  return JSON.parse(rawRecord);
};

const signOidcToken = (claims, expiresIn) => {
  return jwt.sign(claims, getPrivateKeyPem(), {
    algorithm: "RS256",
    keyid: jwkKid,
    expiresIn,
  });
};

export const exchangeAuthorizationCode = async ({
  code,
  requestedClientId,
  requestedClientSecret,
  requestedRedirectUri,
}) => {
  if (requestedClientId !== clientId()) {
    throw oidcError(400, "Invalid client_id");
  }

  if (requestedClientSecret !== clientSecret()) {
    throw oidcError(401, "Invalid client_secret");
  }

  if (requestedRedirectUri !== redirectUri()) {
    throw oidcError(400, "Invalid redirect_uri");
  }

  const record = await consumeAuthorizationCode(code);

  if (record.clientId !== requestedClientId) {
    throw oidcError(400, "Authorization code client mismatch");
  }

  if (record.redirectUri !== requestedRedirectUri) {
    throw oidcError(400, "Authorization code redirect mismatch");
  }

  const user = await User.findById(record.userId);
  if (!user) {
    throw oidcError(401, "User not found");
  }

  const tokenBase = {
    iss: issuer(),
    aud: requestedClientId,
    ...getUserClaims(user),
  };

  const idTokenClaims = record.nonce
    ? { ...tokenBase, nonce: record.nonce }
    : tokenBase;

  return {
    access_token: signOidcToken(tokenBase, "10m"),
    id_token: signOidcToken(idTokenClaims, "10m"),
    token_type: "Bearer",
    expires_in: 600,
    scope: record.scope,
  };
};

export const verifyOidcAccessToken = (token) => {
  try {
    return jwt.verify(token, getPublicKeyPem(), {
      algorithms: ["RS256"],
      issuer: issuer(),
      audience: clientId(),
    });
  } catch {
    throw oidcError(401, "Invalid OIDC access token");
  }
};

export const getUserInfoFromAccessToken = async (token) => {
  const decoded = verifyOidcAccessToken(token);
  const user = await User.findById(decoded.sub);

  if (!user) {
    throw oidcError(401, "User not found");
  }

  return getUserClaims(user);
};
