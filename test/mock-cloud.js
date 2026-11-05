// 内存版 wx-server-sdk，只实现云函数用到的数据库子集，用于本地跑通业务流程
const Module = require('module')

const store = new Map()
let autoId = 0
const ctx = { openid: '' }

const clone = v => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

class Cmd {
  constructor(op, val) { this.op = op; this.val = val }
  and(other) { return new Cmd('and', [this, other]) }
}

const command = {
  gt: v => new Cmd('gt', v), gte: v => new Cmd('gte', v),
  lt: v => new Cmd('lt', v), lte: v => new Cmd('lte', v),
  neq: v => new Cmd('neq', v), in: v => new Cmd('in', v),
  inc: v => ({ __inc: v })
}

function matchValue(actual, cond) {
  if (cond instanceof Cmd) {
    switch (cond.op) {
      case 'gt': return actual > cond.val
      case 'gte': return actual >= cond.val
      case 'lt': return actual < cond.val
      case 'lte': return actual <= cond.val
      case 'neq': return actual !== cond.val
      case 'in': return cond.val.includes(actual)
      case 'and': return cond.val.every(c => matchValue(actual, c))
    }
  }
  if (cond && cond.__regexp !== undefined) return new RegExp(cond.__regexp, cond.options).test(actual || '')
  return actual === cond
}

const matches = (doc, where) => Object.keys(where).every(k => matchValue(doc[k], where[k]))

function applyPatch(doc, patch) {
  for (const k of Object.keys(patch)) {
    const v = patch[k]
    if (v && typeof v === 'object' && '__inc' in v) doc[k] = (doc[k] || 0) + v.__inc
    else doc[k] = clone(v)
  }
}

function coll(name) {
  if (!store.has(name)) throw new Error('collection ' + name + ' not exists')
  return store.get(name)
}

class Query {
  constructor(name, where, order, lim, skp) {
    this.name = name; this.w = where || {}; this.o = order || []; this.l = lim || 1000; this.s = skp || 0
  }
  where(w) { return new Query(this.name, Object.assign({}, this.w, w), this.o, this.l, this.s) }
  orderBy(f, dir) { return new Query(this.name, this.w, this.o.concat([[f, dir]]), this.l, this.s) }
  limit(n) { return new Query(this.name, this.w, this.o, n, this.s) }
  skip(n) { return new Query(this.name, this.w, this.o, this.l, n) }
  rows() {
    const list = [...coll(this.name).values()].filter(d => matches(d, this.w))
    for (const [f, dir] of [...this.o].reverse()) {
      list.sort((a, b) => (a[f] < b[f] ? -1 : a[f] > b[f] ? 1 : 0) * (dir === 'desc' ? -1 : 1))
    }
    return list
  }
  async get() { return { data: clone(this.rows().slice(this.s, this.s + this.l)) } }
  async count() { return { total: this.rows().length } }
  async update({ data }) {
    const rows = this.rows()
    rows.forEach(d => applyPatch(d, data))
    return { stats: { updated: rows.length } }
  }
}

class DocRef {
  constructor(name, id) { this.name = name; this.id = id }
  async get() {
    const d = coll(this.name).get(this.id)
    if (!d) throw new Error('document ' + this.id + ' does not exist')
    return { data: clone(d) }
  }
  async set({ data }) {
    coll(this.name).set(this.id, Object.assign(clone(data), { _id: this.id }))
    return { stats: { updated: 1 } }
  }
  async update({ data }) {
    const d = coll(this.name).get(this.id)
    if (!d) return { stats: { updated: 0 } }
    applyPatch(d, data)
    return { stats: { updated: 1 } }
  }
  async remove() { coll(this.name).delete(this.id); return { stats: { removed: 1 } } }
}

class Collection extends Query {
  doc(id) { return new DocRef(this.name, id) }
  async add({ data }) {
    const c = coll(this.name)
    const id = data._id || 'id' + (++autoId)
    if (c.has(id)) throw new Error('duplicate key ' + id)
    c.set(id, Object.assign(clone(data), { _id: id }))
    return { _id: id }
  }
}

const db = {
  command,
  collection: name => new Collection(name),
  RegExp: ({ regexp, options }) => ({ __regexp: regexp, options }),
  async createCollection(name) {
    if (store.has(name)) throw new Error('collection exists')
    store.set(name, new Map())
  },
  async runTransaction(fn) {
    const snapshot = new Map([...store].map(([k, v]) => [k, new Map([...v].map(([id, d]) => [id, clone(d)]))]))
    try {
      return await fn({ collection: name => ({ doc: id => new DocRef(name, id) }) })
    } catch (e) {
      store.clear()
      snapshot.forEach((v, k) => store.set(k, v))
      throw e
    }
  }
}

// 记录发出的订阅消息；unsubscribed 里的用户模拟「未授权」发送失败
const sent = []
const unsubscribed = new Set()

const sdk = {
  DYNAMIC_CURRENT_ENV: 'test',
  init() {},
  database: () => db,
  getWXContext: () => ({ OPENID: ctx.openid }),
  openapi: {
    subscribeMessage: {
      async send(msg) {
        if (unsubscribed.has(msg.touser)) {
          const e = new Error('user refuse to accept the msg')
          e.errCode = 43101
          throw e
        }
        sent.push(clone(msg))
        return { errCode: 0 }
      }
    }
  }
}

const qrcode = { toDataURL: async text => 'data:image/png;base64,' + Buffer.from(text).toString('base64') }

const origLoad = Module._load
Module._load = function (request, parent, isMain) {
  if (request === 'wx-server-sdk') return sdk
  if (request === 'qrcode') return qrcode
  return origLoad.call(this, request, parent, isMain)
}

module.exports = { store, ctx, sent, unsubscribed }
