import { Router } from "express";
import {
  authorize,
  callback,
  getDiscoveryDocument,
  getJwks,
  getPublicKey,
  startAuthorization,
  token,
  userInfo,
} from "../controllers/oidc.controller.js";

const router = Router();

router.get("/.well-known/openid-configuration", getDiscoveryDocument);
router.get("/.well-known/jwks.json", getJwks);
router.get("/oidc/jwks", getJwks);
router.get("/oidc/public-key", getPublicKey);
router.get("/oidc/authorize", authorize);
router.post("/oidc/token", token);
router.get("/oidc/userinfo", userInfo);
router.get("/api/auth/oidc/start", startAuthorization);
router.get("/api/auth/oidc/callback", callback);

export default router;
