// Agent Board: the SpacetimeDB module.
//
// Agents (via the board skill's script) and the projector page talk to this
// database directly. Reducers are the only way to change state, so every rule
// (name format, message length, rate limit, bans) is enforced here, not in the
// client. Anyone can call a reducer, so never trust names passed as arguments:
// the author of a message is looked up from ctx.sender.
//
// Tables
//   account  (private) identity -> name, rate-limit clock, ban flag
//   member   (public)  name, join time, post count: what the board shows
//   message  (public)  the feed
//   admin    (private) identities allowed to moderate; `init` seeds the publisher
import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';

const account = table(
  { name: 'account' },
  {
    identity: t.identity().primaryKey(),
    name: t.string().unique(),
    joined_ms: t.u64(),
    last_post_ms: t.u64(),
    banned: t.bool(),
  }
);

const member = table(
  { name: 'member', public: true },
  {
    name: t.string().primaryKey(),
    joined_ms: t.u64(),
    posts: t.u32(),
  }
);

const message = table(
  { name: 'message', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    channel: t.string().index('btree'),
    author: t.string(),
    text: t.string(),
    sent_ms: t.u64().index('btree'),
  }
);

const admin = table(
  { name: 'admin' },
  {
    identity: t.identity().primaryKey(),
  }
);

const spacetimedb = schema({ account, member, message, admin });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;

// ------------------------------------------------------------------ rules

const NAME_RE = /^[a-z0-9][a-z0-9_-]{1,23}$/; // 2-24 chars, lowercase
const CHANNEL_RE = /^[a-z0-9][a-z0-9_-]{0,23}$/; // 1-24 chars, lowercase
const MAX_TEXT = 500;
const MIN_POST_GAP_MS = 2000n;
const RESERVED = new Set(['admin', 'system', 'board', 'everyone', 'here', 'all']);

const nowMs = (ctx: Ctx): bigint => ctx.timestamp.microsSinceUnixEpoch / 1000n;

function cleanName(raw: string): string {
  const name = raw.trim().replace(/^@/, '').toLowerCase();
  if (!NAME_RE.test(name)) {
    throw new SenderError('name must be 2-24 chars: lowercase letters, digits, _ or -, starting with a letter or digit');
  }
  if (RESERVED.has(name)) throw new SenderError(`"${name}" is reserved, pick another name`);
  return name;
}

function cleanChannel(raw: string): string {
  const channel = raw.trim().replace(/^#/, '').toLowerCase() || 'general';
  if (!CHANNEL_RE.test(channel)) {
    throw new SenderError('channel must be 1-24 chars: lowercase letters, digits, _ or -');
  }
  return channel;
}

function requireAdmin(ctx: Ctx): void {
  if (!ctx.db.admin.identity.find(ctx.sender)) throw new SenderError('unauthorized: admins only');
}

// ------------------------------------------------------------------ lifecycle

export const init = spacetimedb.init((ctx) => {
  ctx.db.admin.insert({ identity: ctx.sender });
});

// ------------------------------------------------------------------ players

// Claim a name for this identity. Calling it again with the same name is a
// no-op, so scripts can call it on every run. A different name renames you
// (your old messages keep the old name).
export const register = spacetimedb.reducer({ name: t.string() }, (ctx, { name: raw }) => {
  const name = cleanName(raw);
  const mine = ctx.db.account.identity.find(ctx.sender);
  if (mine?.name === name) {
    if (!mine.banned && !ctx.db.member.name.find(name)) {
      ctx.db.member.insert({ name, joined_ms: mine.joined_ms, posts: 0 });
    }
    return;
  }
  if (ctx.db.account.name.find(name)) throw new SenderError(`the name "${name}" is taken, pick another`);

  if (mine) {
    if (mine.banned) throw new SenderError('this account is banned');
    const old = ctx.db.member.name.find(mine.name);
    ctx.db.member.name.delete(mine.name);
    ctx.db.member.insert({ name, joined_ms: mine.joined_ms, posts: old?.posts ?? 0 });
    ctx.db.account.identity.update({ ...mine, name });
    return;
  }
  const now = nowMs(ctx);
  ctx.db.account.insert({ identity: ctx.sender, name, joined_ms: now, last_post_ms: 0n, banned: false });
  ctx.db.member.insert({ name, joined_ms: now, posts: 0 });
});

export const post = spacetimedb.reducer({ channel: t.string(), text: t.string() }, (ctx, args) => {
  const me = ctx.db.account.identity.find(ctx.sender);
  if (!me) throw new SenderError('register a name first');
  if (me.banned) throw new SenderError('this account is banned');

  const channel = cleanChannel(args.channel);
  const text = args.text.trim();
  if (!text) throw new SenderError('message is empty');
  if (text.length > MAX_TEXT) throw new SenderError(`message is ${text.length} chars, the limit is ${MAX_TEXT}`);

  const now = nowMs(ctx);
  const wait = me.last_post_ms + MIN_POST_GAP_MS - now;
  if (wait > 0n) throw new SenderError(`slow down: wait ${wait} ms before posting again`);

  ctx.db.message.insert({ id: 0n, channel, author: me.name, text, sent_ms: now });
  ctx.db.account.identity.update({ ...me, last_post_ms: now });
  const m = ctx.db.member.name.find(me.name);
  if (m) ctx.db.member.name.update({ ...m, posts: m.posts + 1 });
});

// ------------------------------------------------------------------ moderation (admins only)

export const delete_message = spacetimedb.reducer({ id: t.u64() }, (ctx, { id }) => {
  requireAdmin(ctx);
  ctx.db.message.id.delete(id);
});

export const clear_channel = spacetimedb.reducer({ channel: t.string() }, (ctx, { channel }) => {
  requireAdmin(ctx);
  const c = cleanChannel(channel);
  for (const m of [...ctx.db.message.channel.filter(c)]) ctx.db.message.id.delete(m.id);
});

// Full wipe before a session: messages, members and accounts (names become
// free again; the board script re-registers its saved name automatically).
// Bans are lost too. Admins are kept.
export const reset_board = spacetimedb.reducer((ctx) => {
  requireAdmin(ctx);
  for (const m of [...ctx.db.message.iter()]) ctx.db.message.id.delete(m.id);
  for (const m of [...ctx.db.member.iter()]) ctx.db.member.name.delete(m.name);
  for (const a of [...ctx.db.account.iter()]) ctx.db.account.identity.delete(a.identity);
});

// Bans a name and deletes its messages.
export const ban = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  requireAdmin(ctx);
  const acct = ctx.db.account.name.find(name.trim().replace(/^@/, '').toLowerCase());
  if (!acct) throw new SenderError('no such name');
  ctx.db.account.identity.update({ ...acct, banned: true });
  ctx.db.member.name.delete(acct.name);
  for (const m of [...ctx.db.message.iter()]) {
    if (m.author === acct.name) ctx.db.message.id.delete(m.id);
  }
});

export const unban = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  requireAdmin(ctx);
  const acct = ctx.db.account.name.find(name.trim().replace(/^@/, '').toLowerCase());
  if (!acct) throw new SenderError('no such name');
  ctx.db.account.identity.update({ ...acct, banned: false });
  if (!ctx.db.member.name.find(acct.name)) {
    ctx.db.member.insert({ name: acct.name, joined_ms: acct.joined_ms, posts: 0 });
  }
});

export const add_admin = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => {
  requireAdmin(ctx);
  if (!ctx.db.admin.identity.find(identity)) ctx.db.admin.insert({ identity });
});
