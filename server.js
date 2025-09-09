import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { fileURLToPath } from "url";
import Redis from "ioredis";
import nodemailer from "nodemailer";
import twilio from "twilio";

import { v4 as uuidv4 } from "uuid";

import User from "./models/User.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);

// ---------- basic middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ---------- static/public
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// ---------- Mongo connect
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ---------- Redis connect
const redis = new Redis(process.env.REDIS_URL);
redis.on("connect", () => console.log("✅ Redis Connected"));
redis.on("error", (e) => console.error("❌ Redis error:", e));

// ---------- Mailer (for email OTP)
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // true for 465, false for 587
  // auth: {
  //   user: "saurabhsaran474@gmail.com",
  //   pass: "kvmkuiyotpkjsvnl",
  // }
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// helpers
const OTP_TTL_SEC = 5 * 60; // 5 min
const SIGNUP_TTL_SEC = 30 * 60; // 30 min

const genOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
const signupKey = (email) => `signup:${email}`;
const emailOtpKey = (email) => `otp:email:${email}`;
const mobileOtpKey = (mobile) => `otp:mobile:${mobile}`;

function sendOTP(mobileNumber, otp) {
  client.messages
    .create({
      body: `Your OTP is ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER, // yaha env ka use karo
      to: "+91" + mobileNumber, // space hata do
    })
    .then((message) => {
      console.log(`OTP sent! SID: ${message.sid}`);
    })
    .catch((err) => {
      console.error("Error sending OTP:", err);
    });
}

// ---------- ROUTES

// 1) Start signup: store temp data in Redis + issue both OTPs
app.post("/signup", async (req, res) => {
  try {
    const body = req.body;

    // basic uniqueness check in DB
    const existing = await User.findOne({
      $or: [
        { email: body.email },
        { mobile: body.mobile },
        { loginId: body.loginId },
      ],
    });
    if (existing)
      return res.status(400).json({
        message: "User with same email/mobile/loginId already exists",
      });

    // hash password now itself (so we never keep plain in Redis)
    const hashedPassword = await bcrypt.hash(body.password, 10);
    const toSave = {
      ...body,
      password: hashedPassword,
      emailVerified: false,
      mobileVerified: false,
    };

    await redis.setex(
      signupKey(body.email),
      SIGNUP_TTL_SEC,
      JSON.stringify(toSave)
    );

    // OTPs
    const eOTP = genOtp();
    const mOTP = genOtp();

    await redis.setex(emailOtpKey(body.email), OTP_TTL_SEC, eOTP);
    await redis.setex(mobileOtpKey(body.mobile), OTP_TTL_SEC, mOTP);
    sendOTP(body.mobile, mOTP);
    console.log("body.email======== ", body.email);
    // send email OTP
    try {
      const check = await transporter.sendMail({
        from: '"saurabh&company"<saurabh@gmail.com>',
        to: body.email,
        subject: "Your Email OTP",
        text: `Your email OTP is ` + eOTP + `. It will expire in 5 minutes.`,
        html:
          `<b>Your email OTP is ` +
          eOTP +
          ` . It will expire in 5 minutes.</b>`,
      });
      console.log("mail send check === ", check);
    } catch (err) {
      console.warn("⚠️ Email send failed (dev mode continue):", err.message);
    }

    // send mobile OTP => integrate Twilio here; for now console
    // console.log(`📱 Mobile OTP for ${body.mobile} => ${mOTP}`);

    res.json({ message: "OTP sent to email & mobile. Please verify." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// 2) Verify email OTP
app.post("/verify/email", async (req, res) => {
  try {
    const { email, otp } = req.body;
    const saved = await redis.get(signupKey(email));
    if (!saved)
      return res
        .status(400)
        .json({ message: "Signup session expired. Please sign up again." });

    const real = await redis.get(emailOtpKey(email));
    if (!real) return res.status(400).json({ message: "Email OTP expired" });
    if (otp !== real)
      return res.status(400).json({ message: "Invalid Email OTP" });

    const obj = JSON.parse(saved);
    obj.emailVerified = true;

    await redis
      .multi()
      .setex(signupKey(email), SIGNUP_TTL_SEC, JSON.stringify(obj))
      .del(emailOtpKey(email))
      .exec();

    res.json({ message: "Email verified ✅" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// 3) Verify mobile OTP
app.post("/verify/mobile", async (req, res) => {
  try {
    const { mobile, email, otp } = req.body;
    // we receive email to update the same signup stub
    const saved = await redis.get(signupKey(email));
    if (!saved)
      return res
        .status(400)
        .json({ message: "Signup session expired. Please sign up again." });

    const real = await redis.get(mobileOtpKey(mobile));
    if (!real) return res.status(400).json({ message: "Mobile OTP expired" });
    if (otp !== real)
      return res.status(400).json({ message: "Invalid Mobile OTP" });

    const obj = JSON.parse(saved);
    obj.mobileVerified = true;

    await redis
      .multi()
      .setex(signupKey(email), SIGNUP_TTL_SEC, JSON.stringify(obj))
      .del(mobileOtpKey(mobile))
      .exec();

    res.json({ message: "Mobile verified ✅" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// 4) Finalize registration (both verified needed) => move to Mongo, delete redis
app.post("/register/finalize", async (req, res) => {
  try {
    const { email } = req.body;

    const saved = await redis.get(signupKey(email));
    if (!saved)
      return res.status(400).json({ message: "No pending signup found" });

    const obj = JSON.parse(saved);
    if (!obj.emailVerified || !obj.mobileVerified) {
      return res
        .status(400)
        .json({ message: "Please verify both email & mobile first" });
    }

    // store into Mongo
    const newUser = await User.create(obj);

    // cleanup redis
    await redis.del(signupKey(email));

    res.status(201).json({
      message: "Registration completed 🎉",
      user: {
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        email: newUser.email,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// 5) Login (unchanged mostly)
app.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "User not found" });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ message: "Invalid credentials" });
    res.json({
      message: "✅ Login successful",
      user: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: "Server error" });
  }
});

// 6) Get one user
app.get("/user/:email", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.params.email }).select(
      "-password"
    );
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

// 7) All users for Admin panel
app.get("/users", async (_req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (e) {
    res.status(500).json({ message: "Server error" });
  }
});

// ---------- Socket.io: live users room + tracking
const liveUsers = {}; // { socketId: { socketId, email, name } }

io.on("connection", (socket) => {
  console.log("🔌 New connection:", socket.id);

  socket.on("joinRoom", (user) => {
    socket.join("live_users");
    liveUsers[socket.id] = {
      socketId: socket.id,
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
    };
    io.to("live_users").emit("updateUsers", Object.values(liveUsers));
  });

  socket.on("disconnect", () => {
    delete liveUsers[socket.id];
    io.to("live_users").emit("updateUsers", Object.values(liveUsers));
  });
});

// ---------- Start
const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () =>
  console.log(`🚀 Server on http://localhost:${PORT}`)
);
