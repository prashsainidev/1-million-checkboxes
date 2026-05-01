import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";
import {
  buildDiscoveryDocument,
  buildJwks,
  createAuthorizationCode,
  exchangeAuthorizationCode,
  getOidcClientConfig,
  getOidcPublicKey,
  getUserInfoFromAccessToken,
  verifyOidcAccessToken,
} from "../services/oidc.service.js";

const sendOidcError = (res, error) => {
  const statusCode = error.statusCode || 500;
  res
    .status(statusCode)
    .json({ error: error.message || "OIDC request failed" });
};

const getBaseUrl = (req) => {
  return process.env.OIDC_ISSUER || `${req.protocol}://${req.get("host")}`;
};

const getLoggedInUser = async (req) => {
  const token = req.cookies?.token;

  if (!token) {
    const error = new Error("Login required before OIDC authorization");
    error.statusCode = 401;
    throw error;
  }

  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  const user = await User.findById(decoded.sub);

  if (!user) {
    const error = new Error("Logged-in user no longer exists");
    error.statusCode = 401;
    throw error;
  }

  return user;
};

export const getDiscoveryDocument = (req, res) => {
  res.status(200).json(buildDiscoveryDocument());
};

export const getJwks = (req, res) => {
  res.status(200).json(buildJwks());
};

export const getPublicKey = (req, res) => {
  res.status(200).json(getOidcPublicKey());
};

export const startAuthorization = (req, res) => {
  const config = getOidcClientConfig();
  const authorizeUrl = new URL("/oidc/authorize", getBaseUrl(req));

  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", config.clientId);
  authorizeUrl.searchParams.set("redirect_uri", config.redirectUri);
  authorizeUrl.searchParams.set("scope", "openid profile email");
  authorizeUrl.searchParams.set(
    "state",
    crypto.randomBytes(16).toString("hex"),
  );
  authorizeUrl.searchParams.set(
    "nonce",
    crypto.randomBytes(16).toString("hex"),
  );

  res.redirect(authorizeUrl.toString());
};

export const authorize = async (req, res) => {
  try {
    const {
      client_id,
      redirect_uri,
      response_type = "code",
      scope,
      state,
      nonce,
    } = req.query;

    if (!client_id || !redirect_uri) {
      const error = new Error("client_id and redirect_uri are required");
      error.statusCode = 400;
      throw error;
    }

    if (response_type !== "code") {
      const error = new Error("Only authorization code flow is supported");
      error.statusCode = 400;
      throw error;
    }

    const user = await getLoggedInUser(req);
    const code = await createAuthorizationCode({
      userId: user._id,
      requestedClientId: client_id,
      requestedRedirectUri: redirect_uri,
      scope,
      nonce,
    });

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);

    if (state) {
      redirectUrl.searchParams.set("state", state);
    }

    res.redirect(redirectUrl.toString());
  } catch (error) {
    if (error.statusCode === 401) {
      const loginUrl = new URL("/", getBaseUrl(req));
      const continueUrl = new URL(req.originalUrl, getBaseUrl(req));

      loginUrl.searchParams.set("oidc_continue", continueUrl.toString());
      loginUrl.searchParams.set("auth_mode", "login");

      return res.redirect(loginUrl.toString());
    }

    sendOidcError(res, error);
  }
};

export const token = async (req, res) => {
  try {
    const { grant_type, code, client_id, client_secret, redirect_uri } =
      req.body;

    if (!code || !client_id || !client_secret || !redirect_uri) {
      const error = new Error(
        "code, client_id, client_secret and redirect_uri are required",
      );
      error.statusCode = 400;
      throw error;
    }

    if (grant_type !== "authorization_code") {
      const error = new Error("Only authorization_code grant is supported");
      error.statusCode = 400;
      throw error;
    }

    const tokenResponse = await exchangeAuthorizationCode({
      code,
      requestedClientId: client_id,
      requestedClientSecret: client_secret,
      requestedRedirectUri: redirect_uri,
    });

    res.status(200).json(tokenResponse);
  } catch (error) {
    sendOidcError(res, error);
  }
};

export const callback = async (req, res) => {
  try {
    const { code } = req.query;

    if (!code) {
      const error = new Error("OIDC authorization code is required");
      error.statusCode = 400;
      throw error;
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing");
    }

    const config = getOidcClientConfig();
    const tokenResponse = await exchangeAuthorizationCode({
      code,
      requestedClientId: config.clientId,
      requestedClientSecret: config.clientSecret,
      requestedRedirectUri: config.redirectUri,
    });

    const decoded = verifyOidcAccessToken(tokenResponse.id_token);
    const appToken = jwt.sign({ sub: decoded.sub }, process.env.JWT_SECRET, {
      expiresIn: "1d",
    });

    res.cookie("token", appToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.redirect("/");
  } catch (error) {
    sendOidcError(res, error);
  }
};

export const userInfo = async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      const error = new Error("Bearer token is required");
      error.statusCode = 401;
      throw error;
    }

    const accessToken = authHeader.split(" ")[1];
    const user = await getUserInfoFromAccessToken(accessToken);

    res.status(200).json(user);
  } catch (error) {
    sendOidcError(res, error);
  }
};
