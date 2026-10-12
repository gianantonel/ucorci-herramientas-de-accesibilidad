import { randomUUID } from "node:crypto";
import { createAdminClient } from "@insforge/sdk";
import { database, migrate, limited as sqliteLimited } from "./db.mjs";
export const isInsforge = () =>
  Boolean(process.env.INSFORGE_URL && process.env.INSFORGE_API_KEY);
let admin;
function remote() {
  return (admin ??= createAdminClient({
    baseUrl: process.env.INSFORGE_URL,
    apiKey: process.env.INSFORGE_API_KEY,
  }).database);
}
async function checked(query) {
  const { data, error } = await query;
  if (error) {
    const e = new Error("La base no pudo completar la operación.");
    e.code = String(error.code || error.statusCode || "DATABASE_ERROR");
    if (
      error.message?.includes("duplicate") ||
      error.message?.includes("unique")
    )
      e.code = "CONSTRAINT";
    throw e;
  }
  return data;
}
const from = (table) => remote().from("ucorci_" + table);
const localUserColumns = "id,name,email,firstName,lastName";
export const configured = () =>
  isInsforge() ||
  (Boolean(process.env.DATABASE_URL) &&
    (!process.env.VERCEL || !process.env.DATABASE_URL.startsWith("file:")));
export async function ensureStorage() {
  if (isInsforge()) await checked(from("users").select("id").limit(1));
  else await migrate();
}
export async function getUser(id, privateFields = false) {
  const columns = privateFields ? "*" : localUserColumns;
  if (isInsforge())
    return checked(from("users").select(columns).eq("id", id).maybeSingle());
  return (
    (
      await database().client.execute({
        sql: `SELECT ${columns} FROM users WHERE id=?`,
        args: [id],
      })
    ).rows[0] || null
  );
}
export async function getUserByEmail(email) {
  if (isInsforge())
    return checked(from("users").select("*").eq("email", email).maybeSingle());
  return (
    (
      await database().client.execute({
        sql: "SELECT * FROM users WHERE email=?",
        args: [email],
      })
    ).rows[0] || null
  );
}
const normalize = (user) =>
  user
    ? {
        ...user,
        emailVerified: user.emailVerified ? new Date(user.emailVerified) : null,
      }
    : null;
export async function insertUser(data) {
  const user = {
    id: data.id || randomUUID(),
    name: data.name || null,
    email: data.email?.toLowerCase() || null,
    firstName: data.firstName || null,
    lastName: data.lastName || null,
    passwordHash: data.passwordHash || null,
    createdAt: Date.now(),
    image: data.image || null,
    emailVerified: data.emailVerified
      ? new Date(data.emailVerified).toISOString()
      : null,
  };
  if (isInsforge())
    return normalize(
      await checked(from("users").insert([user]).select().single()),
    );
  await database().client.execute({
    sql: "INSERT INTO users(id,name,email,firstName,lastName,passwordHash,createdAt,image,emailVerified) VALUES(?,?,?,?,?,?,?,?,?)",
    args: [
      user.id,
      user.name,
      user.email,
      user.firstName,
      user.lastName,
      user.passwordHash,
      user.createdAt,
      user.image,
      data.emailVerified ? new Date(data.emailVerified).getTime() : null,
    ],
  });
  return normalize(await getUser(user.id, true));
}
export async function updateUser(id, changes) {
  const allowed = {};
  for (const key of [
    "name",
    "email",
    "firstName",
    "lastName",
    "image",
    "emailVerified",
  ])
    if (changes[key] !== undefined)
      allowed[key] =
        key === "emailVerified" && changes[key]
          ? new Date(changes[key]).toISOString()
          : changes[key];
  if (isInsforge())
    return normalize(
      await checked(
        from("users").update(allowed).eq("id", id).select().single(),
      ),
    );
  const keys = Object.keys(allowed);
  if (keys.length)
    await database().client.execute({
      sql: `UPDATE users SET ${keys.map((key) => key + "=?").join(",")} WHERE id=?`,
      args: [
        ...keys.map((key) =>
          key === "emailVerified" && allowed[key]
            ? new Date(allowed[key]).getTime()
            : allowed[key],
        ),
        id,
      ],
    });
  return normalize(await getUser(id, true));
}
export async function deleteUser(id) {
  if (isInsforge()) {
    await checked(from("users").delete().eq("id", id));
    return;
  }
  await database().client.batch(
    [
      { sql: "DELETE FROM usage_events WHERE user_id=?", args: [id] },
      { sql: "DELETE FROM accounts WHERE userId=?", args: [id] },
      { sql: "DELETE FROM sessions WHERE userId=?", args: [id] },
      { sql: "DELETE FROM users WHERE id=?", args: [id] },
    ],
    "write",
  );
}
export async function addEvent(userId, tool, durationMs, result) {
  const event = {
    id: randomUUID(),
    user_id: userId,
    tool,
    duration_ms: Math.round(durationMs),
    result,
    created_at: Date.now(),
  };
  if (isInsforge()) {
    await checked(from("usage_events").insert([event]));
    return;
  }
  await database().client.execute({
    sql: "INSERT INTO usage_events(id,user_id,tool,duration_ms,result,created_at) VALUES(?,?,?,?,?,?)",
    args: Object.values(event),
  });
}
export async function userEvents(userId) {
  if (isInsforge())
    return checked(
      from("usage_events")
        .select("tool,duration_ms,result,created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10000),
    );
  return (
    await database().client.execute({
      sql: "SELECT tool,duration_ms,result,created_at FROM usage_events WHERE user_id=? ORDER BY created_at DESC LIMIT 10000",
      args: [userId],
    })
  ).rows;
}
export async function limited(key, max = 10, window = 900000) {
  if (!isInsforge()) return sqliteLimited(key, max, window);
  return Boolean(
    await checked(
      remote().rpc("ucorci_rate_limit", {
        p_key: key,
        p_max: max,
        p_window: window,
      }),
    ),
  );
}
export function adapter() {
  return {
    createUser: insertUser,
    getUser: async (id) => normalize(await getUser(id, true)),
    getUserByEmail: async (email) => normalize(await getUserByEmail(email)),
    updateUser: async ({ id, ...changes }) => updateUser(id, changes),
    deleteUser,
    async getUserByAccount({ provider, providerAccountId }) {
      let account;
      if (isInsforge())
        account = await checked(
          from("accounts")
            .select("userId")
            .eq("provider", provider)
            .eq("providerAccountId", providerAccountId)
            .maybeSingle(),
        );
      else
        account = (
          await database().client.execute({
            sql: "SELECT userId FROM accounts WHERE provider=? AND providerAccountId=?",
            args: [provider, providerAccountId],
          })
        ).rows[0];
      return account ? normalize(await getUser(account.userId, true)) : null;
    },
    async linkAccount(data) {
      const account = {
        userId: data.userId,
        type: data.type,
        provider: data.provider,
        providerAccountId: data.providerAccountId,
      };
      if (isInsforge()) await checked(from("accounts").insert([account]));
      else
        await database().client.execute({
          sql: "INSERT INTO accounts(userId,type,provider,providerAccountId) VALUES(?,?,?,?)",
          args: Object.values(account),
        });
      return data;
    },
    async unlinkAccount({ provider, providerAccountId }) {
      if (isInsforge())
        await checked(
          from("accounts")
            .delete()
            .eq("provider", provider)
            .eq("providerAccountId", providerAccountId),
        );
      else
        await database().client.execute({
          sql: "DELETE FROM accounts WHERE provider=? AND providerAccountId=?",
          args: [provider, providerAccountId],
        });
    },
  };
}
