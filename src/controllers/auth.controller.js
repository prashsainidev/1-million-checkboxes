// src/controllers/auth.controller.js
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

const generateToken = (userId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  return jwt.sign({ sub: userId }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });
};

const setAuthCookie = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 24 * 60 * 60 * 1000,
  });
};

const getSafeErrorMessage = (error) => {
  if (process.env.NODE_ENV === "production") {
    return "Internal server error";
  }

  return error.message;
};

export const registerUser = async (req, res) => {
  try {
    const firstName = req.body.firstName?.trim();
    const lastName = req.body.lastName?.trim();
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!firstName || !email || !password) {
      return res.status(400).json({ error: "Required fields are missing" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET is missing");
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ error: "Email already exists" });
    }

    const user = await User.create({ firstName, lastName, email, password });
    const token = generateToken(user._id);

    // Remove password from response
    const createdUser = user.toObject();
    delete createdUser.password;

    setAuthCookie(res, token);

    res.status(201).json({
      message: "User registered successfully",
      user: createdUser,
      token,
    });
  } catch (error) {
    console.error("[Auth] Register error:", error);

    if (error.code === 11000) {
      return res.status(409).json({ error: "Email already exists" });
    }

    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
};

export const loginUser = async (req, res) => {
  try {
    const email = req.body.email?.trim().toLowerCase();
    const password = req.body.password;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required" });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isPasswordValid = await user.isPasswordCorrect(password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken(user._id);

    setAuthCookie(res, token);

    res.status(200).json({
      message: "Login successful",
      token,
    });
  } catch (error) {
    console.error("[Auth] Login error:", error);
    res.status(500).json({ error: getSafeErrorMessage(error) });
  }
};

export const getCurrentUser = async (req, res) => {
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

    res.status(200).json({ user });
  } catch (error) {
    console.error("[Auth] Current user error:", error);
    res.status(401).json({ error: "Not authenticated" });
  }
};

export const logoutUser = (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
  });

  res.status(200).json({ message: "Logout successful" });
};
