import "dotenv/config";
import express from "express";
import { ExpressAuth, getSession } from "@auth/express";
import Credentials from "@auth/express/providers/credentials";
import Google from "@auth/express/providers/google";
import Apple from "@auth/express/providers/apple";
import Facebook from "@auth/express/providers/facebook";
import GitHub from "@auth/express/providers/github";
import { compare, hash } from "bcryptjs";
import { randomUUID, createHash, randomBytes } from "node:crypto";
import { createClient } from "@insforge/sdk";
import { encode } from "@auth/core/jwt";
import {
  ensureStorage,
  limited,
  getUser,
  getUserByEmail,
  insertUser,
  updateUser,
  deleteUser,
  addEvent,
  userEvents,
  adapter,
  configured,
  isInsforge,
} from "./store.mjs";

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
const oauth = [
  ["google", Google],
  ["apple", Apple],
  ["facebook", Facebook],
  ["github", GitHub],
];
let ready;
let auth;
const dummyHash = await hash(randomBytes(32).toString("hex"), 12);
const nativeProviders = () =>
  isInsforge() && process.env.INSFORGE_ANON_KEY ? ["google", "github"] : [];
function config() {
  if (auth) return auth;
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32)
    throw new Error("AUTH_SECRET no configurado.");
  auth = {
    secret: process.env.AUTH_SECRET,
    trustHost: true,
    basePath: "/api/auth",
    adapter: adapter(),
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 90 },
    pages: { signIn: "/?account=login", error: "/?account=login" },
    providers: [
      Credentials({
        credentials: {
          email: { type: "email" },
          password: { type: "password" },
        },
        async authorize(credentials, req) {
          const email = String(credentials.email || "")
            .trim()
            .toLowerCase();
          const ip =
            req.headers.get("x-forwarded-for")?.split(",")[0] || "local";
          const key = createHash("sha256")
            .update(email + "|" + ip)
            .digest("hex");
          if (await limited("login:" + key, 10)) return null;
          const row = await getUserByEmail(email);
          const valid = await compare(
            String(credentials.password || "").slice(0, 72),
            row?.passwordHash || dummyHash,
          );
          if (!valid || !row?.passwordHash) return null;
          return { id: row.id, name: row.name, email: row.email };
        },
      }),
      ...oauth
        .filter(
          ([id]) =>
            process.env["AUTH_" + id.toUpperCase() + "_ID"] &&
            process.env["AUTH_" + id.toUpperCase() + "_SECRET"],
        )
        .map(([id, Provider]) =>
          Provider({
            clientId: process.env["AUTH_" + id.toUpperCase() + "_ID"],
            clientSecret: process.env["AUTH_" + id.toUpperCase() + "_SECRET"],
          }),
        ),
    ],
    callbacks: {
      async jwt({ token, user }) {
        if (user) token.id = user.id;
        return token;
      },
      async session({ session, token }) {
        session.user.id = token.id || token.sub;
        return session;
      },
    },
  };
  return auth;
}
app.use("/api", async (req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (req.path === "/health")
    return res.json({
      app: "UCORCI",
      databaseConfigured: configured(),
      database: isInsforge() ? "PostgreSQL / InsForge" : "SQLite",
      nativeOAuth: nativeProviders(),
      oauth: [
        ...new Set([
          ...nativeProviders(),
          ...oauth
            .filter(
              ([id]) =>
                process.env["AUTH_" + id.toUpperCase() + "_ID"] &&
                process.env["AUTH_" + id.toUpperCase() + "_SECRET"],
            )
            .map(([id]) => id),
        ]),
      ],
    });
  try {
    ready ??= ensureStorage().catch((e) => {
      ready = null;
      throw e;
    });
    await ready;
    config();
    next();
  } catch {
    res
      .status(503)
      .json({
        error:
          "El registro está esperando la conexión a la base de datos. Intentá nuevamente en un momento.",
      });
  }
});
app.use("/api/auth/*", (req, res, next) =>
  ExpressAuth(config())(req, res, next),
);
app.use(express.json({ limit: "32kb" }));
function sameOrigin(req, res, next) {
  const expected =
    process.env.APP_URL || `${req.protocol}://${req.get("host")}`;
  if (req.get("origin") !== expected)
    return res
      .status(403)
      .json({ error: "Solicitud de otro origen bloqueada." });
  next();
}
async function identify(req, res, next) {
  try {
    const session = await getSession(req, config());
    if (!session?.user?.id)
      return res
        .status(401)
        .json({
          error:
            "Registrate o iniciá sesión gratis para usar esta herramienta.",
        });
    const user = await getUser(session.user.id);
    if (!user)
      return res
        .status(401)
        .json({ error: "La sesión ya no está disponible." });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}
function nativeClient() {
  return createClient({
    baseUrl: process.env.INSFORGE_URL,
    anonKey: process.env.INSFORGE_ANON_KEY,
    isServerMode: true,
  });
}
const secure = () => process.env.APP_URL?.startsWith("https://");
const pkceCookie = () => (secure() ? "__Secure-ucorci.oauth" : "ucorci.oauth");
app.post("/api/oauth/start", sameOrigin, async (req, res, next) => {
  try {
    if (!nativeProviders().includes(req.body.provider))
      return res.status(400).json({ error: "Proveedor no disponible." });
    const key = createHash("sha256")
      .update(req.ip || "local")
      .digest("hex");
    if (await limited("oauth:" + key, 20))
      return res
        .status(429)
        .json({ error: "Demasiados intentos. Esperá un momento." });
    const { data, error } = await nativeClient().auth.signInWithOAuth(
      req.body.provider,
      {
        redirectTo: process.env.APP_URL + "/api/oauth/callback",
        skipBrowserRedirect: true,
      },
    );
    if (error || !data.url || !data.codeVerifier)
      return res
        .status(503)
        .json({ error: "El proveedor de acceso no respondió." });
    res.cookie(pkceCookie(), data.codeVerifier, {
      httpOnly: true,
      secure: secure(),
      sameSite: "lax",
      maxAge: 600000,
      path: "/",
    });
    res.json({ url: data.url });
  } catch (e) {
    next(e);
  }
});
app.get("/api/oauth/callback", async (req, res) => {
  try {
    const name = pkceCookie();
    const part = (req.headers.cookie || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(name + "="));
    const verifier = part
      ? decodeURIComponent(part.slice(name.length + 1))
      : "";
    res.clearCookie(name, {
      httpOnly: true,
      secure: secure(),
      sameSite: "lax",
      path: "/",
    });
    if (!verifier || typeof req.query.insforge_code !== "string")
      throw Error("Invalid OAuth callback");
    const { data, error } = await nativeClient().auth.exchangeOAuthCode(
      req.query.insforge_code,
      verifier,
    );
    if (error || !data?.user?.id || !data.user.email)
      throw Error("Invalid OAuth identity");
    const nativeUser = data.user;
    let user = await adapter().getUserByAccount({
      provider: "insforge",
      providerAccountId: nativeUser.id,
    });
    if (!user) {
      if (await getUserByEmail(nativeUser.email))
        return res.redirect("/?account=login&error=OAuthAccountNotLinked");
      user = await insertUser({
        name: nativeUser.profile?.name || nativeUser.email,
        email: nativeUser.email,
        emailVerified: new Date(),
      });
      await adapter().linkAccount({
        userId: user.id,
        type: "oauth",
        provider: "insforge",
        providerAccountId: nativeUser.id,
      });
    }
    const cookieName = secure()
      ? "__Secure-authjs.session-token"
      : "authjs.session-token";
    const token = await encode({
      token: { id: user.id, sub: user.id, name: user.name, email: user.email },
      secret: process.env.AUTH_SECRET,
      salt: cookieName,
      maxAge: 90 * 86400,
    });
    res.cookie(cookieName, token, {
      httpOnly: true,
      secure: secure(),
      sameSite: "lax",
      path: "/",
      maxAge: 90 * 86400 * 1000,
    });
    res.redirect(user.firstName && user.lastName ? "/" : "/?account=profile");
  } catch {
    res.redirect("/?account=login&error=OAuthCallback");
  }
});
app.post("/api/register", sameOrigin, async (req, res, next) => {
  try {
    const { firstName, lastName, password, consent } = req.body;
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const name = String(firstName || "").trim(),
      surname = String(lastName || "").trim();
    if (
      !name ||
      !surname ||
      name.length > 80 ||
      surname.length > 80 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      email.length > 254 ||
      typeof password !== "string" ||
      password.length < 12 ||
      Buffer.byteLength(password) > 72 ||
      consent !== true
    )
      return res
        .status(400)
        .json({
          error:
            "Completá nombre, apellido y correo válido. La contraseña debe tener al menos 12 caracteres y como máximo 72 bytes. Aceptá el uso de datos para registro y métricas.",
        });
    const ip = createHash("sha256")
      .update(req.ip || "local")
      .digest("hex");
    if (await limited("register:" + ip, 5))
      return res
        .status(429)
        .json({ error: "Demasiados intentos. Esperá 15 minutos." });
    const passwordHash = await hash(password, 12);
    try {
      await insertUser({
        name: name + " " + surname,
        email,
        firstName: name,
        lastName: surname,
        passwordHash,
      });
    } catch (e) {
      if (e.code?.includes("CONSTRAINT") || e.code === "23505")
        return res
          .status(409)
          .json({
            error:
              "No se pudo registrar ese correo. Si ya tenés cuenta, iniciá sesión.",
          });
      throw e;
    }
    res.status(201).json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/me", identify, (req, res) => res.json({ user: req.user }));
app.get("/api/tts-permit", identify, async (req, res, next) => {
  try {
    if (await limited("tts:" + req.user.id, 12, 60000))
      return res
        .status(429)
        .json({
          error: "Podés generar hasta 12 audios por minuto. Esperá un momento.",
        });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/profile", sameOrigin, identify, async (req, res, next) => {
  try {
    const firstName = String(req.body.firstName || "").trim(),
      lastName = String(req.body.lastName || "").trim();
    if (
      !firstName ||
      !lastName ||
      firstName.length > 80 ||
      lastName.length > 80
    )
      return res.status(400).json({ error: "Completá nombre y apellido." });
    await updateUser(req.user.id, {
      firstName,
      lastName,
      name: firstName + " " + lastName,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/events", sameOrigin, identify, async (req, res, next) => {
  try {
    const { tool, durationMs, result } = req.body;
    if (
      !["tts", "stt", "dyslexia"].includes(tool) ||
      !["success", "error"].includes(result) ||
      !Number.isFinite(durationMs) ||
      durationMs < 0 ||
      durationMs > 86400000
    )
      return res.status(400).json({ error: "Métrica inválida." });
    if (await limited("events:" + req.user.id, 100, 60000))
      return res.status(429).json({ error: "Demasiados eventos." });
    await addEvent(req.user.id, tool, durationMs, result);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/account/export", identify, async (req, res, next) => {
  try {
    const events = await userEvents(req.user.id);
    res.json({ user: req.user, usage: events });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/account", sameOrigin, identify, async (req, res, next) => {
  try {
    await deleteUser(req.user.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.use((error, req, res, next) => {
  console.error("UCORCI request failed:", error.code || error.name);
  res
    .status(500)
    .json({ error: "No pudimos completar la operación. Intentá nuevamente." });
});
export default app;
