import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

export const requireAuth = async (req, res, next) => {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.sub).select("-password");

    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("[Auth] Middleware error:", error.message);
    res.status(401).json({ error: "Not authenticated" });
  }
};
