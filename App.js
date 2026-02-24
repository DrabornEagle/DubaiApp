// App.js — Dubai Journey PRO v5.8 (Single-file • No external dependencies)
// ✅ NEW: Save/Load system (NO deps)
// - SaveApp: creates a snapshot (multi-save) in Local Storage (when available) + app’s main storage key
// - LoadApp: loads any snapshot from local saves list
// - Export/Import: Backup Code (JSON) for manual copy/paste (works everywhere)
// - Web-only bonus (no deps): Save to .json file (Downloads) + Load from .json file picker
// NOTE (honest): Native APK cihaz klasörüne yazma / dosya picker “dependency olmadan” mümkün değil.
// Bu yüzden APK tarafında en sağlam yöntem: Backup Code Export/Import.

import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  SafeAreaView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView,
  Dimensions,
} from "react-native";
// Device metrics
const { width: DEVICE_W, height: DEVICE_H } = Dimensions.get("window");


/* =========================
   Storage (KV) — LocalStorage (web) / RAM fallback
========================= */
const STORAGE_KEY = "draborneagle_dubai_journey_PRO_v4_8";
const SAVE_INDEX_KEY = STORAGE_KEY + "__save_index";
const SAVE_PREFIX = STORAGE_KEY + "__save__";

function hasLocalStorage() {
  try {
    return typeof globalThis !== "undefined" && !!globalThis.localStorage;
  } catch {
    return false;
  }
}

// Web helper (for optional download/export flows)
const IS_WEB =
  typeof window !== "undefined" &&
  typeof document !== "undefined" &&
  typeof Blob !== "undefined" &&
  typeof URL !== "undefined";

function canUseLocalStorage() {
  // In Expo Snack/React Native, localStorage may exist but is quota-limited/volatile.
  // We only trust localStorage on Web; on native we prefer FileSystem.
  return IS_WEB && hasLocalStorage();
}

// ✅ AsyncStorage (best persistence on native / Snack)
let __AS_CACHE = undefined; // undefined = not checked yet
function getAsyncStorage() {
  if (__AS_CACHE !== undefined) return __AS_CACHE;
  try {
    const mod = require("@react-native-async-storage/async-storage");
    __AS_CACHE = mod?.default || mod;
  } catch {
    __AS_CACHE = null;
  }
  return __AS_CACHE;
}


// ✅ Persistent storage on device (Snack/Expo) WITHOUT extra npm deps:
// We try expo-file-system (built-in in Expo). If unavailable, fallback to RAM.
let __FS_CACHE = undefined; // undefined = not checked yet
function getFileSystem() {
  if (__FS_CACHE !== undefined) return __FS_CACHE;
  try {
    // Expo Snack usually has this available
    __FS_CACHE = require("expo-file-system");
  } catch {
    __FS_CACHE = null;
  }
  return __FS_CACHE;
}

const KV_DIR_NAME = "dubai_journey_kv_v48/";
let __kvDirReady = false;

async function ensureKvDir() {
  if (__kvDirReady) return true;
  const FS = getFileSystem();
  if (!FS?.documentDirectory) return false;
  const dir = FS.documentDirectory + KV_DIR_NAME;
  try {
    await FS.makeDirectoryAsync(dir, { intermediates: true });
  } catch {
    // ignore; directory might already exist
  }
  // Verify the directory exists when possible
  try {
    if (FS?.getInfoAsync) {
      const info = await FS.getInfoAsync(dir);
      if (!info?.exists) return false;
    }
  } catch {
    // if we can't verify, we'll still try to use it
  }
  __kvDirReady = true;
  return true;
}

function kvFilePath(key) {
  const FS = getFileSystem();
  if (!FS?.documentDirectory) return null;
  // encode key safely for filename
  const safe = encodeURIComponent(String(key));
  return FS.documentDirectory + KV_DIR_NAME + safe + ".txt";
}

let RAM_STORE = {}; // fallback when nothing else exists

async function kvGet(key) {
  try {
    if (canUseLocalStorage()) return globalThis.localStorage.getItem(key);

    // Prefer AsyncStorage on native (Expo/React Native)
    const AS = getAsyncStorage();
    if (AS?.getItem) {
      try {
        return await AS.getItem(key);
      } catch {
        // fall through
      }
    }

    // Fallback to FileSystem if available
    const FS = getFileSystem();
    if (FS?.readAsStringAsync) {
      const ok = await ensureKvDir();
      if (!ok) return RAM_STORE[key] ?? null;
      const p = kvFilePath(key);
      if (!p) return RAM_STORE[key] ?? null;
      try {
        return await FS.readAsStringAsync(p);
      } catch {
        return null;
      }
    }

    return RAM_STORE[key] ?? null;
  } catch {
    return null;
  }
}

async function kvSet(key, val) {
  try {
    const s = typeof val === "string" ? val : JSON.stringify(val);

    if (canUseLocalStorage()) {
      globalThis.localStorage.setItem(key, s);
      return;
    }

    // Prefer AsyncStorage on native (Expo/React Native)
    const AS = getAsyncStorage();
    if (AS?.setItem) {
      try {
        await AS.setItem(key, s);
        return;
      } catch {
        // fall through
      }
    }

    // Fallback to FileSystem if available
    const FS = getFileSystem();
    if (FS?.writeAsStringAsync) {
      const ok = await ensureKvDir();
      if (!ok) {
        RAM_STORE[key] = s;
        return;
      }
      const p = kvFilePath(key);
      if (!p) {
        RAM_STORE[key] = s;
        return;
      }
      try {
        await FS.writeAsStringAsync(p, s);
        return;
      } catch {
        RAM_STORE[key] = s;
        return;
      }
    }

    RAM_STORE[key] = s;
  } catch {}
}

async function kvRemove(key) {
  try {
    if (canUseLocalStorage()) {
      globalThis.localStorage.removeItem(key);
      return;
    }

    const AS = getAsyncStorage();
    if (AS?.removeItem) {
      try {
        await AS.removeItem(key);
        return;
      } catch {
        // fall through
      }
    }

    const FS = getFileSystem();
    if (FS?.deleteAsync) {
      const ok = await ensureKvDir();
      if (!ok) {
        delete RAM_STORE[key];
        return;
      }
      const p = kvFilePath(key);
      if (p) {
        try {
          await FS.deleteAsync(p, { idempotent: true });
        } catch {}
      }
      return;
    }

    delete RAM_STORE[key];
  } catch {}
}

async function loadState() {
  try {
    const raw = await kvGet(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
async function saveState(state) {
  try {
    await kvSet(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}
async function clearState() {
  try {
    await kvRemove(STORAGE_KEY);
  } catch {}
}

/* =========================
   Save Slots (multi-save snapshots)
========================= */
function safeParseJson(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}


/* =========================
   Backup Code (Compact JSON)
   - No deps, works everywhere
   - Still accepts old (full) JSON exports on import
========================= */
const BACKUP_CODE_VERSION = 1;

function _curToN(cur) {
  if (cur === "USD") return 0;
  if (cur === "AED") return 1;
  return 2; // TL default
}
function _nToCur(n) {
  if (n === 0) return "USD";
  if (n === 1) return "AED";
  return "TL";
}
function _assetToN(a) {
  if (a === "USD") return 0;
  if (a === "GOLD") return 1;
  return 2; // other/unknown
}
function _nToAsset(n) {
  if (n === 0) return "USD";
  if (n === 1) return "GOLD";
  return "OTHER";
}

function packBackupCode(state) {
  const s = state || {};
  const catIncome = Array.isArray(s.categories?.income) ? s.categories.income : [];
  const catExpense = Array.isArray(s.categories?.expense) ? s.categories.expense : [];

  const txns = (s.txns || []).map((t) => [
    (t.at || "").slice(0, 19),                // 0 at (short)
    t.type === "income" ? 0 : 1,              // 1 type
    Number(t.amount || 0) | 0,                // 2 amount
    _curToN(t.currency),                      // 3 currency
    (t.category || "").slice(0, 48),          // 4 category (trim)
    (t.note || "").slice(0, 120),             // 5 note (trim)
    t.asset === "GOLD" ? 1 : 0,               // 6 gold flag
    t.asset === "GOLD" ? Number(t.grams || 0) : 0, // 7 grams
  ]);

  const buys = (s.buys || []).map((b) => [
    (b.at || "").slice(0, 19),                // 0 at
    _assetToN(b.asset),                       // 1 asset
    Number(b.tlSpent || 0) | 0,               // 2 tlSpent
    Number(b.qty || 0) | 0,                   // 3 qty
  ]);

  const todos = (s.todos || []).map((x) => [
    (x.text || "").slice(0, 120),
    (x.tag || "").slice(0, 32),
    x.done ? 1 : 0,
    (x.at || "").slice(0, 19),
  ]);

  const notes = (s.notes || []).map((n) => [
    (n.title || "").slice(0, 120),            // 0
    (n.tag || "").slice(0, 32),               // 1
    (n.body || "").slice(0, 4000),            // 2
    (n.at || "").slice(0, 19),                // 3
    (Array.isArray(n.checklist) ? n.checklist : []).map((c) => [(c.text || "").slice(0, 120), c.done ? 1 : 0]), // 4
    Array.isArray(n.photos) ? n.photos.slice(0, 12) : [], // 5
  ]);

  // Only store what matters for "kayıt" (rest will use DEFAULT_STATE)
  const packed = {
    v: BACKUP_CODE_VERSION,
    // core numbers
    u: Number(s.usd || 0),
    g: Number(s.goalUsd || 0),
    gg: Number(s.goldHoldGrams || 0),
    // optional planning
    td: s.travelDateISO || "",
    // categories + logs
    c: [catIncome, catExpense],
    x: txns,
    b: buys,
    o: todos,
    n: notes,
  };

  // Drop empties to shorten further
  if (!packed.td) delete packed.td;
  if (!packed.gg) delete packed.gg;
  if (!packed.g) delete packed.g;
  if (!packed.u) delete packed.u;
  if (!packed.x?.length) delete packed.x;
  if (!packed.b?.length) delete packed.b;
  if (!packed.o?.length) delete packed.o;
  if (!packed.n?.length) delete packed.n;
  if (!packed.c?.[0]?.length && !packed.c?.[1]?.length) delete packed.c;

  return packed;
}

function unpackBackupCode(obj) {
  // Accept:
  // 1) New compact format: {v:1, ...}
  // 2) Old snapshot: { state: {...} }
  // 3) Raw state: {...}
  if (!obj) return null;

  // Old snapshot export
  if (obj.state && typeof obj.state === "object") return obj.state;

  // New compact export
  if (Number(obj.v) === BACKUP_CODE_VERSION || obj.x || obj.b || obj.c) {
    const out = {};
    if (Number.isFinite(obj.u)) out.usd = Number(obj.u) || 0;
    if (Number.isFinite(obj.g)) out.goalUsd = Number(obj.g) || 0;
    if (Number.isFinite(obj.gg)) out.goldHoldGrams = Number(obj.gg) || 0;
    if (typeof obj.td === "string" && obj.td) out.travelDateISO = obj.td;

    // categories
    if (Array.isArray(obj.c)) {
      out.categories = {
        income: Array.isArray(obj.c[0]) ? obj.c[0] : [],
        expense: Array.isArray(obj.c[1]) ? obj.c[1] : [],
      };
    }

    // txns
    if (Array.isArray(obj.x)) {
      out.txns = obj.x.map((r) => {
        const at = String(r?.[0] || "");
        const ty = r?.[1] === 0 ? "income" : "expense";
        const amount = Number(r?.[2] || 0) | 0;
        const currency = _nToCur(Number(r?.[3]));
        const category = String(r?.[4] || "") || "Diğer";
        const note = String(r?.[5] || "");
        const isGold = Number(r?.[6] || 0) === 1;
        const grams = Number(r?.[7] || 0);

        const base = { id: uid(), type: ty, currency, amount, category, note, at: at ? (at.length >= 19 ? at : at) : nowISO() };
        if (isGold) return { ...base, asset: "GOLD", grams, goldGramTlAt: 0 };
        return base;
      });
    }

    // buys
    if (Array.isArray(obj.b)) {
      out.buys = obj.b.map((r) => {
        const at = String(r?.[0] || "");
        const assetN = Number(r?.[1]);
        const asset = assetN === 0 ? "USD" : "GOLD";
        return {
          id: uid(),
          asset,
          tlSpent: Number(r?.[2] || 0) | 0,
          qty: Number(r?.[3] || 0) | 0,
          at: at ? (at.length >= 19 ? at : at) : nowISO(),
          rateUsdTlAt: 0,
          goldGramTlAt: 0,
        };
      });
    }

    // todos
    if (Array.isArray(obj.o)) {
      out.todos = obj.o.map((r) => ({
        id: uid(),
        text: String(r?.[0] || ""),
        tag: String(r?.[1] || ""),
        done: Number(r?.[2] || 0) === 1,
        at: String(r?.[3] || "") || nowISO(),
      }));
    }

    // notes
    if (Array.isArray(obj.n)) {
      out.notes = obj.n.map((r) => ({
        id: uid(),
        title: String(r?.[0] || ""),
        tag: String(r?.[1] || "Genel"),
        body: String(r?.[2] || ""),
        at: String(r?.[3] || "") || nowISO(),
        checklist: (Array.isArray(r?.[4]) ? r[4] : []).map((c) => ({ id: uid(), text: String(c?.[0] || ""), done: Number(c?.[1] || 0) === 1 })),
        photos: Array.isArray(r?.[5]) ? r[5] : [],
      }));
    }

    return out;
  }

  // Fallback: assume it's a raw state
  return typeof obj === "object" ? obj : null;
}

async function loadSaveIndex() {
  const raw = await kvGet(SAVE_INDEX_KEY);
  const arr = safeParseJson(raw);
  return Array.isArray(arr) ? arr : [];
}
async function writeSaveIndex(indexArr) {
  await kvSet(SAVE_INDEX_KEY, JSON.stringify(indexArr));
}

async function createSnapshot(name, state) {
  const id = uid();
  const snap = {
    id,
    name: (name || "SaveApp").trim().slice(0, 40) || "SaveApp",
    at: nowISO(),
    version: "v4.8",
    state,
  };
  await kvSet(SAVE_PREFIX + id, JSON.stringify(snap));

  const index = await loadSaveIndex();
  const next = [{ id: snap.id, name: snap.name, at: snap.at, version: snap.version }, ...index].slice(0, 50);
  await writeSaveIndex(next);
  return snap;
}

async function listSnapshots() {
  const index = await loadSaveIndex();
  const out = [];
  for (const meta of index) {
    const raw = await kvGet(SAVE_PREFIX + meta.id);
    const snap = safeParseJson(raw);
    if (snap && snap.id && snap.state) out.push({ ...meta, state: snap.state });
  }
  return out;
}

async function loadSnapshotById(id) {
  const raw = await kvGet(SAVE_PREFIX + id);
  const snap = safeParseJson(raw);
  return snap && snap.state ? snap : null;
}

async function deleteSnapshotById(id) {
  await kvRemove(SAVE_PREFIX + id);
  const index = await loadSaveIndex();
  const next = index.filter((x) => x.id !== id);
  await writeSaveIndex(next);
}


/* =========================
   File Saves (Expo FileSystem) — works on APK without extra deps
   - Stored in app sandbox (documentDirectory)
   - Listed & loaded inside app (no file picker needed)
========================= */
const SAVE_FILE_DIR_NAME = "dubai_journey_saves_v48/";

async function ensureSaveFileDir() {
  const FS = getFileSystem();
  if (!FS?.documentDirectory) return null;
  const dir = FS.documentDirectory + SAVE_FILE_DIR_NAME;
  try {
    await FS.makeDirectoryAsync(dir, { intermediates: true });
  } catch {}
  return dir;
}

function buildSaveFileName(name, atISO) {
  const ts = String(atISO || nowISO()).slice(0, 19).replace(/[:T]/g, "-");
  return `${ts}__${safeFileName(name)}.json`;
}

async function saveSnapshotToFile(name, state) {
  const FS = getFileSystem();
  if (!FS?.writeAsStringAsync) return null;
  const dir = await ensureSaveFileDir();
  if (!dir) return null;

  const at = nowISO();
  const filename = buildSaveFileName(name || "SaveApp", at);
  const path = dir + filename;

  const payload = {
    id: uid(),
    name: (name || "SaveApp").trim().slice(0, 40) || "SaveApp",
    at,
    version: "v4.8",
    state,
  };

  try {
    await FS.writeAsStringAsync(path, JSON.stringify(payload));
    return { id: "file:" + filename, name: payload.name, at: payload.at, version: payload.version };
  } catch {
    return null;
  }
}

async function listFileSnapshots() {
  const FS = getFileSystem();
  if (!FS?.readDirectoryAsync) return [];
  const dir = await ensureSaveFileDir();
  if (!dir) return [];
  try {
    const files = await FS.readDirectoryAsync(dir);
    const jsons = (files || []).filter((f) => String(f).toLowerCase().endsWith(".json"));
    // Newest first (filename starts with timestamp)
    jsons.sort((a, b) => String(b).localeCompare(String(a)));
    return jsons.slice(0, 50).map((fn) => {
      const parts = String(fn).split("__");
      const at = parts?.[0] ? parts[0].replace(/-/g, ":").replace(":", "-") : ""; // best-effort display
      const name = (parts?.[1] || "FileSave").replace(/\.json$/i, "").replace(/_/g, " ");
      return { id: "file:" + fn, name: name.slice(0, 40), at: "", version: "v4.8" };
    });
  } catch {
    return [];
  }
}

async function loadFileSnapshotById(fileId) {
  const FS = getFileSystem();
  if (!FS?.readAsStringAsync) return null;
  const dir = await ensureSaveFileDir();
  if (!dir) return null;
  const fn = String(fileId || "").replace(/^file:/, "");
  if (!fn) return null;
  try {
    const raw = await FS.readAsStringAsync(dir + fn);
    const obj = safeParseJson(raw);
    return obj && obj.state ? obj : null;
  } catch {
    return null;
  }
}

async function deleteFileSnapshotById(fileId) {
  const FS = getFileSystem();
  if (!FS?.deleteAsync) return;
  const dir = await ensureSaveFileDir();
  if (!dir) return;
  const fn = String(fileId || "").replace(/^file:/, "");
  if (!fn) return;
  try {
    await FS.deleteAsync(dir + fn, { idempotent: true });
  } catch {}
}

function downloadJsonFile(filename, obj) {
  if (!IS_WEB) return false;
  try {
    const text = typeof obj === "string" ? obj : JSON.stringify(obj, null, 2);
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    return true;
  } catch {
    return false;
  }
}

function pickJsonFileWeb(onText) {
  if (!IS_WEB) return false;
  try {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const txt = String(reader.result || "");
        onText(txt);
      };
      reader.readAsText(file);
    };
    input.click();
    return true;
  } catch {
    return false;
  }
}

/* =========================
   Utils
========================= */
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const nowISO = () => new Date().toISOString();
const pad2 = (n) => String(n).toString().padStart(2, "0");
const startOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const daysBetween = (a, b) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / (1000 * 60 * 60 * 24));
const fmtMoney = (n, d = 0) =>
  (Number.isFinite(n) ? n : 0).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });

const digitsOnly = (s) => String(s ?? "").replace(/[^\d]/g, "");
// Money input: allow decimals (comma or dot). Keep at most one dot.
const moneyOnly = (s) => {
  const raw = String(s ?? "").replace(/\s/g, "").replace(/,/g, ".");
  const cleaned = raw.replace(/[^\d.]/g, "");
  const parts = cleaned.split(".");
  if (parts.length <= 1) return parts[0];
  return parts[0] + "." + parts.slice(1).join("");
};
const toNum = (s) => {
  const v = parseFloat(String(s ?? "").replace(/,/g, "."));
  return Number.isFinite(v) ? v : 0;
};
const toInt = (s) => {
  const v = Number(digitsOnly(s));
  return Number.isFinite(v) ? v : 0;
};

const toYMD = (iso) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};


// ✅ Date input (no deps): accepts "YYYY-MM-DD" or "YYYY-MM-DD HH:MM"
function parseUserDateToISO(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  // normalize separators
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/);
  if (!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const hh = m[4] !== undefined ? Number(m[4]) : 12;
  const mm = m[5] !== undefined ? Number(m[5]) : 0;
  const dt = new Date(y, mo, d, hh, mm, 0, 0);
  if (Number.isNaN(dt.getTime())) return null;
  // validate same date (avoid overflow like 2026-02-31)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
  return dt.toISOString();
}

function safeFileName(s) {
  return String(s || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_\-]/g, "")
    .slice(0, 40) || "Save";
}
function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1);
}
function daysInMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}
function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/* =========================
   i18n
========================= */
const I18N = {
  TR: {
    title: "Dubai Yolculuğum",
    daysLeft: "Hedefe Kalan",
    day: "Gün",
    quick: "Hızlı İşlem",
    addIncome: "+ Gelir Ekle",
    addExpense: "+ Gider Ekle",
    buyProfit: "Altın/Dolar kazancım",
    buyNow: "Bugün alırsam",
    bought: "Aldım",
    usdMy: "USD Dolarım",
    aedMy: "AED Dirhemim",
    edit: "Düzenle",
    goal: "Hedefim",
    remaining: "Kalan",
    hud: "Dubai HUD Progress",
    settings: "Ayarlar",
    themes: "Temalar",
    targetPlan: "Hedef Planı",
    openTargetPlan: "⚙ Hedef Planını Düzenle",
    autoAvg1m: "Auto (son 30 gün gelir ort.)",
    monthlyTarget: "Aylık hedef (TL)",
    dailyTarget: "Günlük hedef (TL)",
    successRates: "Başarı Oranları",
    today: "Bugün",
    thisMonth: "Bu Ay",
    notes: "Notlar",
    addNote: "➕ NOT EKLE",
    reports: "Raporlar",
    ledger: "Gelir/Gider",
    home: "Ana Sayfa",
    news: "Haberler",
    weather: "Dubai Hava Durumu",
    refresh: "Yenile",
    updated: "Güncellendi",
    cancel: "Vazgeç",
    save: "Kaydet",
    amount: "Tutar",
    grams: "Gram",
    category: "Kategori (etiket)",
    search: "Ara",
    ok: "OK",
    diffToday: "Bugün fark",
    diffMonth: "Bu ay fark",
    usdTry: "USD/TL",
    goldGram: "Gram Altın (TL)",
    all: "Hepsi",
    saved: "Kaydedilenler",
    tips: "Tasarruf Önerisi",
    aiOnly: "Yapay Zeka",
    gaming: "Oyun",
    mobile: "Mobil",
    hardware: "Donanım",
    science: "Bilim",
    menu: "Menü",
    todo: "Yapılacaklar",
    todoTitle: "Yapılacaklar Listesi",
    addTask: "Görev Ekle",
    taskPlaceholder: "Örn: Emirates ID randevusu al",
    tag: "Etiket",
    tagPlaceholder: "Evrak / Okul / Araç / Şirket / Vize",
    done: "Bitti",
    pending: "Bekleyen",
    goldHold: "Altın Varlığım",
    portfolio: "Portföy",
    invested: "Yatırım",
    valueNow: "Şu an değeri",
    profit: "Kâr/Zarar",
    tlInput: "TL gir",
    usdQty: "USD miktarı",
    goldQty: "Altın (gram)",
    goldBuy: "Altın Al (gram)",
    leftover: "Kalan TL",
    saveLoad: "Save / Load",
    saveApp: "SaveApp",
    loadApp: "LoadApp",
    exportCode: "Backup Code (Export)",
    importCode: "Backup Code (Import)",
    saveToFile: "Save to File (.json)",
    loadFromFile: "Load from File (.json)",
    noWebFile: "Dosya Save/Load sadece web/preview’de çalışır. APK için Backup Code kullan.",
  },
  EN: {
    title: "My Dubai Journey",
    daysLeft: "Days Left",
    day: "Days",
    quick: "Quick Actions",
    addIncome: "+ Add Income",
    addExpense: "+ Add Expense",
    buyProfit: "My Gold/USD profit",
    buyNow: "If I buy today",
    bought: "Bought",
    usdMy: "My USD",
    aedMy: "My AED",
    edit: "Edit",
    goal: "My Goal",
    remaining: "Remaining",
    hud: "Dubai HUD Progress",
    settings: "Settings",
    themes: "Themes",
    targetPlan: "Target Plan",
    openTargetPlan: "⚙ Edit Target Plan",
    autoAvg1m: "Auto (last 30d income avg)",
    monthlyTarget: "Monthly target (TL)",
    dailyTarget: "Daily target (TL)",
    successRates: "Success Rates",
    today: "Today",
    thisMonth: "This month",
    notes: "Notes",
    addNote: "➕ ADD NOTE",
    reports: "Reports",
    ledger: "Income/Expense",
    home: "Home",
    news: "News",
    weather: "Dubai Weather",
    refresh: "Refresh",
    updated: "Updated",
    cancel: "Cancel",
    save: "Save",
    amount: "Amount",
    grams: "Grams",
    category: "Category (tag)",
    search: "Search",
    ok: "OK",
    diffToday: "Today delta",
    diffMonth: "Month delta",
    usdTry: "USD/TL",
    goldGram: "Gold (gram, TL)",
    all: "All",
    saved: "Saved",
    tips: "Savings Tip",
    aiOnly: "AI",
    gaming: "Gaming",
    mobile: "Mobile",
    hardware: "Hardware",
    science: "Science",
    menu: "Menu",
    todo: "To-Do",
    todoTitle: "To-Do List",
    addTask: "Add Task",
    taskPlaceholder: "e.g., Book Emirates ID appointment",
    tag: "Tag",
    tagPlaceholder: "Docs / School / Car / Company / Visa",
    done: "Done",
    pending: "Pending",
    goldHold: "My Gold",
    portfolio: "Portfolio",
    invested: "Invested",
    valueNow: "Value now",
    profit: "P/L",
    tlInput: "Enter TL",
    usdQty: "USD amount",
    goldQty: "Gold (gram)",
    goldBuy: "Buy Gold (gram)",
    leftover: "Leftover TL",
    saveLoad: "Save / Load",
    saveApp: "SaveApp",
    loadApp: "LoadApp",
    exportCode: "Backup Code (Export)",
    importCode: "Backup Code (Import)",
    saveToFile: "Save to File (.json)",
    loadFromFile: "Load from File (.json)",
    noWebFile: "File Save/Load works only on web/preview. For APK use Backup Code.",
  },
};

/* =========================
   Themes (Dubai)
========================= */
const THEME_CATEGORIES = [
  { key: "signature", title: "Dubai Signature" },
  { key: "gold", title: "Desert Gold • Premium" },
  { key: "neon", title: "Marina Neon • Cyber" },
  { key: "noir", title: "Noir Luxe • Executive" },
  { key: "minimal", title: "Minimal • Clean" },
];

const THEME_PRESETS = {
  dxbSkylineSignature: {
    key: "dxbSkylineSignature",
    cat: "signature",
    name: "Skyline Signature",
    skyline:
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(6,10,16,0.70)",
    glass: "rgba(255,255,255,0.12)",
    glass2: "rgba(255,255,255,0.08)",
    stroke: "rgba(255,255,255,0.20)",
    text: "rgba(255,255,255,0.97)",
    sub: "rgba(255,255,255,0.78)",
    neon: "rgba(255,209,112,0.62)",
    neon2: "rgba(76,190,255,0.40)",
    gold: "#ffd170",
    green: "#7bffb2",
    orange: "#ffb35c",
    red: "#ff6b6b",
    haze: "rgba(255,255,255,0.10)",
    star: "rgba(255,255,255,0.24)",
    hud: "rgba(255,209,112,0.14)",
    orb: "rgba(255,209,112,0.18)",
    orb2: "rgba(76,190,255,0.14)",
  },
  dxbSkylineMidnight: {
    key: "dxbSkylineMidnight",
    cat: "signature",
    name: "Skyline Midnight",
    skyline:
      "https://images.unsplash.com/photo-1526481280695-3c687fd643ed?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(3,6,14,0.76)",
    glass: "rgba(255,255,255,0.10)",
    glass2: "rgba(255,255,255,0.07)",
    stroke: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.98)",
    sub: "rgba(255,255,255,0.74)",
    neon: "rgba(76,190,255,0.55)",
    neon2: "rgba(255,209,112,0.28)",
    gold: "#ffd170",
    green: "#6dffc0",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.09)",
    star: "rgba(255,255,255,0.22)",
    hud: "rgba(76,190,255,0.12)",
    orb: "rgba(76,190,255,0.18)",
    orb2: "rgba(255,209,112,0.12)",
  },
  desertGoldElite: {
    key: "desertGoldElite",
    cat: "gold",
    name: "Desert Gold Elite",
    skyline:
      "https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(16,10,6,0.68)",
    glass: "rgba(255,255,255,0.12)",
    glass2: "rgba(255,255,255,0.08)",
    stroke: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.97)",
    sub: "rgba(255,255,255,0.75)",
    neon: "rgba(255,209,112,0.68)",
    neon2: "rgba(255,110,90,0.34)",
    gold: "#ffd170",
    green: "#7bffb2",
    orange: "#ffb35c",
    red: "#ff6b6b",
    haze: "rgba(255,255,255,0.10)",
    star: "rgba(255,255,255,0.22)",
    hud: "rgba(255,209,112,0.16)",
    orb: "rgba(255,209,112,0.20)",
    orb2: "rgba(255,110,90,0.12)",
  },
  desertRoseGold: {
    key: "desertRoseGold",
    cat: "gold",
    name: "Rose Gold Mirage",
    skyline:
      "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(18,8,10,0.70)",
    glass: "rgba(255,255,255,0.12)",
    glass2: "rgba(255,255,255,0.08)",
    stroke: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.97)",
    sub: "rgba(255,255,255,0.76)",
    neon: "rgba(255,160,190,0.55)",
    neon2: "rgba(255,209,112,0.30)",
    gold: "#ffd170",
    green: "#7bffb2",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.10)",
    star: "rgba(255,255,255,0.22)",
    hud: "rgba(255,160,190,0.14)",
    orb: "rgba(255,160,190,0.18)",
    orb2: "rgba(255,209,112,0.12)",
  },
  marinaNeonWave: {
    key: "marinaNeonWave",
    cat: "neon",
    name: "Marina Neon Wave",
    skyline:
      "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(4,10,16,0.72)",
    glass: "rgba(255,255,255,0.11)",
    glass2: "rgba(255,255,255,0.07)",
    stroke: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.97)",
    sub: "rgba(255,255,255,0.74)",
    neon: "rgba(76,190,255,0.62)",
    neon2: "rgba(255,107,220,0.38)",
    gold: "#ffd170",
    green: "#6dffc0",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.09)",
    star: "rgba(255,255,255,0.22)",
    hud: "rgba(76,190,255,0.14)",
    orb: "rgba(76,190,255,0.20)",
    orb2: "rgba(255,107,220,0.14)",
  },
  cyberAquaPulse: {
    key: "cyberAquaPulse",
    cat: "neon",
    name: "Cyber Aqua Pulse",
    skyline:
      "https://images.unsplash.com/photo-1496307653780-42ee777d4833?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(4,10,18,0.74)",
    glass: "rgba(255,255,255,0.10)",
    glass2: "rgba(255,255,255,0.07)",
    stroke: "rgba(255,255,255,0.18)",
    text: "rgba(255,255,255,0.97)",
    sub: "rgba(255,255,255,0.73)",
    neon: "rgba(77,255,245,0.55)",
    neon2: "rgba(76,190,255,0.30)",
    gold: "#ffd170",
    green: "#6dffc0",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.09)",
    star: "rgba(255,255,255,0.22)",
    hud: "rgba(77,255,245,0.12)",
    orb: "rgba(77,255,245,0.18)",
    orb2: "rgba(76,190,255,0.12)",
  },
  noirLuxe: {
    key: "noirLuxe",
    cat: "noir",
    name: "Noir Luxe",
    skyline:
      "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(0,0,0,0.78)",
    glass: "rgba(255,255,255,0.10)",
    glass2: "rgba(255,255,255,0.06)",
    stroke: "rgba(255,255,255,0.16)",
    text: "rgba(255,255,255,0.96)",
    sub: "rgba(255,255,255,0.70)",
    neon: "rgba(255,209,112,0.52)",
    neon2: "rgba(255,255,255,0.22)",
    gold: "#ffd170",
    green: "#7bffb2",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.08)",
    star: "rgba(255,255,255,0.18)",
    hud: "rgba(255,209,112,0.12)",
    orb: "rgba(255,209,112,0.16)",
    orb2: "rgba(255,255,255,0.10)",
  },
  executiveSteel: {
    key: "executiveSteel",
    cat: "noir",
    name: "Executive Steel",
    skyline:
      "https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(3,5,8,0.78)",
    glass: "rgba(255,255,255,0.10)",
    glass2: "rgba(255,255,255,0.06)",
    stroke: "rgba(255,255,255,0.16)",
    text: "rgba(255,255,255,0.96)",
    sub: "rgba(255,255,255,0.70)",
    neon: "rgba(180,210,255,0.40)",
    neon2: "rgba(255,209,112,0.22)",
    gold: "#ffd170",
    green: "#7bffb2",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.08)",
    star: "rgba(255,255,255,0.18)",
    hud: "rgba(180,210,255,0.10)",
    orb: "rgba(180,210,255,0.14)",
    orb2: "rgba(255,209,112,0.10)",
  },
  minimalPearl: {
    key: "minimalPearl",
    cat: "minimal",
    name: "Minimal Pearl",
    skyline:
      "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(9,12,18,0.70)",
    glass: "rgba(255,255,255,0.10)",
    glass2: "rgba(255,255,255,0.06)",
    stroke: "rgba(255,255,255,0.16)",
    text: "rgba(255,255,255,0.95)",
    sub: "rgba(255,255,255,0.70)",
    neon: "rgba(255,209,112,0.38)",
    neon2: "rgba(76,190,255,0.18)",
    gold: "#ffd170",
    green: "#7bffb2",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.07)",
    star: "rgba(255,255,255,0.16)",
    hud: "rgba(255,209,112,0.10)",
    orb: "rgba(255,209,112,0.14)",
    orb2: "rgba(76,190,255,0.08)",
  },
  minimalEmerald: {
    key: "minimalEmerald",
    cat: "minimal",
    name: "Minimal Emerald",
    skyline:
      "https://images.unsplash.com/photo-1496307653780-42ee777d4833?auto=format&fit=crop&w=1800&q=70",
    overlay: "rgba(6,10,10,0.72)",
    glass: "rgba(255,255,255,0.10)",
    glass2: "rgba(255,255,255,0.06)",
    stroke: "rgba(255,255,255,0.16)",
    text: "rgba(255,255,255,0.95)",
    sub: "rgba(255,255,255,0.70)",
    neon: "rgba(123,255,178,0.36)",
    neon2: "rgba(255,209,112,0.18)",
    gold: "#ffd170",
    green: "#7bffb2",
    orange: "#ffb35c",
    red: "#ff5d73",
    haze: "rgba(255,255,255,0.07)",
    star: "rgba(255,255,255,0.16)",
    hud: "rgba(123,255,178,0.10)",
    orb: "rgba(123,255,178,0.14)",
    orb2: "rgba(255,209,112,0.08)",
  },
};


/* =========================
   Weather (Dubai) — open-meteo
========================= */
async function fetchDubaiWeather() {
  const lat = 25.2048;
  const lon = 55.2708;
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${lat}&longitude=${lon}` +
    "&hourly=temperature_2m,weathercode,windspeed_10m" +
    "&current_weather=true" +
    "&timezone=Asia%2FDubai";
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather failed");
  const json = await res.json();
  const cur = json.current_weather || {};
  const hourly = json.hourly || {};
  const times = hourly.time || [];
  const temps = hourly.temperature_2m || [];
  const winds = hourly.windspeed_10m || [];
  const codes = hourly.weathercode || [];

  const nowIso = cur.time;
  let startIdx = 0;
  if (nowIso) {
    const idx = times.indexOf(nowIso);
    startIdx = idx >= 0 ? idx : 0;
  }
  const next = [];
  for (let i = startIdx; i < Math.min(startIdx + 8, times.length); i++) {
    next.push({ t: times[i], temp: temps[i], wind: winds[i], code: codes[i] });
  }
  return {
    updatedAt: new Date().toISOString(),
    current: { temp: cur.temperature, wind: cur.windspeed, code: cur.weathercode, time: cur.time },
    next,
  };
}
function codeToEmoji(code) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "🌤️";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "🌧️";
  if ([95, 96, 99].includes(code)) return "⛈️";
  return "🌡️";
}

/* =========================
   FX: USD->TRY (open.er-api)
========================= */
async function fetchUsdTl() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD");
  if (!res.ok) throw new Error("fx failed");
  const json = await res.json();
  const r = json?.rates?.TRY;
  if (!r) throw new Error("TRY missing");
  return Number(r);
}

/* =========================
   Gold price (no key)
========================= */
async function fetchGoldGramTL(usdToTl) {
  const res = await fetch("https://data-asg.goldprice.org/dbXRates/USD");
  if (!res.ok) throw new Error("gold failed");
  const json = await res.json();
  const item = json?.items?.[0];
  const ozUsd = Number(item?.xauPrice);
  if (!Number.isFinite(ozUsd) || ozUsd <= 0) throw new Error("xau missing");
  const gramUsd = ozUsd / 31.1035;
  const gramTl = gramUsd * (usdToTl || 0);
  return gramTl;
}

/* =========================
   Finance helpers
========================= */
function txnToUsd(t, usdToAed, usdToTl) {
  const amt = Number(t.amount || 0);
  if (!Number.isFinite(amt)) return 0;
  if (t.currency === "USD") return amt;
  if (t.currency === "AED") return (usdToAed ? amt / usdToAed : amt / 3.6725);
  if (t.currency === "TL") return usdToTl ? amt / usdToTl : 0;
  return amt;
}
function sumUsd(txns, type, from, to, usdToAed, usdToTl) {
  const A = from.getTime(),
    B = to.getTime();
  let s = 0;
  for (const t of txns) {
    if (t.type !== type) continue;
    const tm = new Date(t.at).getTime();
    if (tm >= A && tm < B) s += txnToUsd(t, usdToAed, usdToTl);
  }
  return s;
}

// USD buys counted as progress (value in TL at current USD/TL)
function sumUsdBuysTl(buys, from, to, usdToTl) {
  const A = from.getTime(), B = to.getTime();
  let s = 0;
  for (const b of buys || []) {
    if (b.asset !== "USD") continue;
    const tm = new Date(b.at).getTime();
    if (tm >= A && tm < B) s += (Number(b.qty) || 0) * (Number(usdToTl) || 0);
  }
  return s;
}
function topExpenseCategory(txns, usdToAed, usdToTl) {
  const m = new Map();
  for (const t of txns) {
    if (t.type !== "expense") continue;
    const k = t.category || "Diğer";
    m.set(k, (m.get(k) || 0) + txnToUsd(t, usdToAed, usdToTl));
  }
  const list = Array.from(m.entries()).map(([k, v]) => ({ k, v }));
  list.sort((a, b) => b.v - a.v);
  return list[0] || { k: "", v: 0 };
}
function estimateSavingsTip(txns, usdToAed, usdToTl) {
  const top = topExpenseCategory(txns, usdToAed, usdToTl);
  if (!top.k) return "Giderlerinin %5’ini kesmek bile hedef hızını artırır.";
  const cut = Math.max(10, top.v * 0.07);
  return `En büyük giderin **${top.k}**. Buradan %7 kesersen yaklaşık **$${fmtMoney(cut, 0)}** kurtarırsın.`;
}
function avgIncomeLast30dUsd(txns, usdToAed, usdToTl) {
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  return sumUsd(txns, "income", from, to, usdToAed, usdToTl);
}

/* =========================
   Particles
========================= */
function makeParticles(n) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    arr.push({
      id: "p" + i,
      x: Math.random(),
      y: Math.random(),
      s: 1 + Math.random() * 2.6,
      o: 0.10 + Math.random() * 0.28,
    });
  }
  return arr;
}

/* =========================
   RSS (DonanımHaber)
========================= */
function stripCdata(s) {
  return String(s || "").replace("<![CDATA[", "").replace("]]>", "").trim();
}
function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}
function findTag(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = String(xml).match(re);
  return m ? m[1] : "";
}
function parseRssItems(xml) {
  const items = [];
  const blocks = String(xml).match(/<item[\s\S]*?<\/item>/gi) || [];
  for (const b of blocks) {
    const title = decodeEntities(stripCdata(findTag(b, "title")));
    let link = decodeEntities(stripCdata(findTag(b, "link")));
    if (link) link = link.trim();
    const pubDate = decodeEntities(stripCdata(findTag(b, "pubDate")));
    const guid = decodeEntities(stripCdata(findTag(b, "guid"))) || link || title || uid();
    const content =
      decodeEntities(stripCdata(findTag(b, "content:encoded"))) ||
      decodeEntities(stripCdata(findTag(b, "description"))) ||
      "";
    items.push({ id: guid, title, link, pubDate, content });
  }
  return items;
}
async function fetchDonanimHaberRss() {
  const urls = [
    "https://www.donanimhaber.com/rss/tum/",
    "https://www.donanimhaber.com/rss/",
    "https://www.donanimhaber.com/rss/haberler/",
  ];
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("rss http " + res.status);
      const xml = await res.text();
      const items = parseRssItems(xml);
      if (items.length > 0) return items;
      lastErr = new Error("rss empty " + url);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("rss failed");
}
function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* =========================
   News classification
========================= */
function classifyNews(it) {
  const text = `${it.title} ${it.content}`.toLowerCase();
  const ai =
    text.includes("yapay zeka") ||
    text.includes("openai") ||
    text.includes("chatgpt") ||
    text.includes("gpt") ||
    text.includes("gemini") ||
    text.includes("claude") ||
    text.includes("llm") ||
    text.includes("machine learning") ||
    text.includes("makine öğren");

  const gaming =
    text.includes("oyun") ||
    text.includes("ps5") ||
    text.includes("xbox") ||
    text.includes("nintendo") ||
    text.includes("steam") ||
    text.includes("playstation");

  const mobile =
    text.includes("android") ||
    text.includes("ios") ||
    text.includes("iphone") ||
    text.includes("galaxy") ||
    text.includes("xiaomi") ||
    text.includes("telefon") ||
    text.includes("tablet") ||
    text.includes("mobil");

  const hardware =
    text.includes("ekran kart") ||
    text.includes("gpu") ||
    text.includes("rtx") ||
    text.includes("amd") ||
    text.includes("intel") ||
    text.includes("işlemci") ||
    text.includes("cpu") ||
    text.includes("donanım") ||
    text.includes("laptop") ||
    text.includes("pc");

  const science =
    text.includes("bilim") ||
    text.includes("space") ||
    text.includes("nasa") ||
    text.includes("spacex") ||
    text.includes("mars") ||
    text.includes("kuantum") ||
    text.includes("araştırma");

  if (ai) return "AI";
  if (gaming) return "GAMING";
  if (mobile) return "MOBILE";
  if (hardware) return "HARDWARE";
  if (science) return "SCIENCE";
  return "ALL";
}

/* =========================
   Smart Tag Suggestion for Notes
========================= */
function suggestNoteTags(text) {
  const s = String(text || "").toLowerCase();
  const out = [];
  const rules = [
    { tag: "Evrak", keys: ["pasaport", "kimlik", "evrak", "noter", "sözleş", "imza", "belge", "vize", "oturum"] },
    { tag: "Okul", keys: ["okul", "kayıt", "ödev", "öğretmen", "sınıf", "çocuk", "tuition"] },
    { tag: "Araç", keys: ["araç", "araba", "lexus", "sigorta", "yakıt", "bakım", "uber", "limuzin", "plaka"] },
    { tag: "Şirket", keys: ["şirket", "lisans", "sanal ofis", "fatura", "vergi", "ticaret", "freezone"] },
    { tag: "Vize", keys: ["vize", "emirates id", "oturum", "medical", "biometr", "entry permit"] },
  ];
  for (const r of rules) if (r.keys.some((k) => s.includes(k))) out.push(r.tag);
  return Array.from(new Set(out));
}

/* =========================
   Success color bands
========================= */
function successColor(theme, pct0to100) {
  const p = clamp(pct0to100, 0, 100);
  if (p < 35) return theme.red;
  if (p < 65) return "#ffd166";
  if (p < 80) return "#4ea8ff";
  return theme.green;
}

/* =========================
   Default State
========================= */
function defaultExpenseSeed() {
  // Hepsi 0 başlar; kullanıcı kendi rakamlarını girecek.
  // phase: "PRE" (Dubai'ye kadar) | "MONTH1" (Dubai ilk ay)
  // status: "PLANNED" | "PAID"
  const nowISO = new Date().toISOString();
  const base = [
    // PRE (Türkiye + hazırlık)
    { title: "Pasaport / Evrak", phase: "PRE", cat: "Evrak", currency: "TL", amount: 0 },
    { title: "Uçak Bileti", phase: "PRE", cat: "Ulaşım", currency: "USD", amount: 0 },
    { title: "İlk Airbnb (1 ay)", phase: "PRE", cat: "Konaklama", currency: "AED", amount: 0 },
    { title: "Yeme-İçme (1 ay)", phase: "PRE", cat: "Yaşam", currency: "AED", amount: 0 },
    { title: "Oturum/Vize/ID Süreç", phase: "PRE", cat: "Vize", currency: "AED", amount: 0 },
    { title: "Ehliyet Dönüşümü + Sınavlar", phase: "PRE", cat: "Araç", currency: "AED", amount: 0 },
    { title: "Şirket Kurulum / Lisans (opsiyonel)", phase: "PRE", cat: "Şirket", currency: "AED", amount: 0 },
    { title: "Telefon/İnternet İlk Kurulum", phase: "PRE", cat: "İletişim", currency: "AED", amount: 0 },
    // MONTH1 (Dubai'de ilk ay)
    { title: "Ev Depozito / Çek / İlk Ödeme", phase: "MONTH1", cat: "Kira", currency: "AED", amount: 0 },
    { title: "Okul (ilk kayıt/ay)", phase: "MONTH1", cat: "Okul", currency: "AED", amount: 0 },
    { title: "Ulaşım (metro/taksi/salik)", phase: "MONTH1", cat: "Ulaşım", currency: "AED", amount: 0 },
    { title: "Market + Ev ihtiyaçları", phase: "MONTH1", cat: "Yaşam", currency: "AED", amount: 0 },
    { title: "Araç kiralama / peşinat", phase: "MONTH1", cat: "Araç", currency: "AED", amount: 0 },
    { title: "Sigorta / Sağlık", phase: "MONTH1", cat: "Sağlık", currency: "AED", amount: 0 },
  ];
  return base.map((x, i) => ({
    id: String(1000 + i),
    createdISO: nowISO,
    updatedISO: nowISO,
    status: "PLANNED",
    note: "",
    dueISO: "",
    ...x,
  }));
}

const DEFAULT_STATE = {
  lang: "TR",
  themeKey: "dxbSkylineSignature",

  usd: 0,
  usdToAed: 3.6725,
  usdToTl: 32,

  goalUsd: 35000,
  travelDateISO: new Date(2026, 11, 10).toISOString(),

  manualMonthlyTargetTl: 120000,
  manualDailyTargetTl: 5000,

  goldHoldGrams: 0,
  buys: [],

  categories: {
    income: ["Maaş", "Freelance / Proje", "Satış", "Komisyon", "Diğer"],
    expense: [
      "Airbnb / Konaklama",
      "Kira",
      "Yemek",
      "Market",
      "Ulaşım (Metro/Taxi)",
      "Salik / RTA / Otopark",
      "Araç (Yakıt/Bakım)",
      "Okul",
      "Vize / Harç",
      "Şirket (Lisans/Kurulum)",
      "Telefon/İnternet",
      "Alışveriş",
      "Eğlence",
      "Sağlık",
      "Diğer",
    ],
  },

  txns: [],
  notes: [],
  todos: [],

  // ✅ Masraflar Listesi (Dubai'ye kadar + Dubai ilk ay)
  expenses: defaultExpenseSeed(),
  expenseLastId: 0,

  // ✅ Borsalar (varsayılan takip listesi)
  stockWatchlist: ["SPY", "QQQ", "DIA", "AAPL", "MSFT", "NVDA", "TSLA"],
  weather: null,
  lastWeatherISO: "",
  goldGramTl: null,
  lastGoldISO: "",

  news: [],
  newsFilter: "ALL",
  lastNewsCheckISO: "",
  lastNewsIdSeen: "",
  savedNews: [],
  lastNewsNotifyISO: "",

  lastDailyAchievedISO: "",
  lastMonthlyAchievedKey: "",
};


// -------------------- Ultra Premium Dubai Intro (NO dependencies) --------------------
function DubaiIntro({ onDone, durationMs = 4500 }) {
  const W = Dimensions.get("window").width;
  const H = Dimensions.get("window").height;

  const shimmerX = React.useRef(new Animated.Value(-W)).current;
  const pulse = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    // Shimmer sweep
    Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: W,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(shimmerX, {
          toValue: -W,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Soft neon pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();

    const t = setTimeout(() => onDone?.(), Math.max(1200, durationMs));
    return () => clearTimeout(t);
  }, [W, durationMs, onDone, shimmerX, pulse]);

  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.7] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  // Simple skyline bars (Dubai vibe) + a "Burj" needle
  const bars = [
    { x: 0.08, w: 0.06, h: 0.18 },
    { x: 0.16, w: 0.07, h: 0.26 },
    { x: 0.26, w: 0.05, h: 0.15 },
    { x: 0.34, w: 0.08, h: 0.32 },
    { x: 0.46, w: 0.07, h: 0.20 },
    { x: 0.58, w: 0.05, h: 0.16 },
    { x: 0.66, w: 0.09, h: 0.30 },
    { x: 0.79, w: 0.06, h: 0.22 },
  ];

  return (
    <Pressable onPress={() => onDone?.()} style={{ flex: 1, backgroundColor: "#05070B" }}>
      <StatusBar hidden />
      {/* Background */}
      <View style={{ position: "absolute", left: 0, top: 0, right: 0, bottom: 0 }}>
        {/* Soft radial-ish glows */}
        <Animated.View
          style={{
            position: "absolute",
            width: W * 1.2,
            height: W * 1.2,
            borderRadius: W,
            left: -W * 0.1,
            top: -W * 0.35,
            backgroundColor: "#0B1730",
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          }}
        />
        <Animated.View
          style={{
            position: "absolute",
            width: W * 1.1,
            height: W * 1.1,
            borderRadius: W,
            left: -W * 0.15,
            top: H * 0.35,
            backgroundColor: "#2A0A28",
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          }}
        />
      </View>

      {/* Center brand */}
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 18 }}>
        <Animated.View
          style={{
            width: Math.min(260, W * 0.72),
            borderRadius: 22,
            paddingVertical: 18,
            paddingHorizontal: 18,
            backgroundColor: "rgba(255,255,255,0.04)",
            borderWidth: 1,
            borderColor: "rgba(255,255,255,0.10)",
            transform: [{ scale: glowScale }],
          }}
        >
          <Text style={{ color: "#F4D07A", fontSize: 30, fontWeight: "800", textAlign: "center", marginTop: 10 }}>
            DrabornEagle
          </Text>

          <Text style={{ color: "rgba(255,255,255,0.70)", fontSize: 13, textAlign: "center", marginTop: 8 }}>
            Ultra Premium • Neon Skyline • Secure Save
          </Text>

          {/* Loading bar */}
          <View style={{ height: 10, borderRadius: 99, backgroundColor: "rgba(255,255,255,0.08)", marginTop: 16, overflow: "hidden" }}>
            <Animated.View
              style={{
                height: 10,
                width: W,
                backgroundColor: "rgba(244,208,122,0.55)",
                transform: [{ translateX: shimmerX }],
              }}
            />
          </View>

          <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 11, textAlign: "center", marginTop: 12 }}>
            Tap to skip
          </Text>
        </Animated.View>
      </View>

      {/* Skyline bottom */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: Math.max(140, H * 0.22) }}>
        {/* Haze */}
        <View style={{ position: "absolute", left: 0, right: 0, top: 0, height: 60, backgroundColor: "rgba(0,0,0,0.25)" }} />
        {/* Ground */}
        <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 70, backgroundColor: "#03040A" }} />

        {/* Buildings */}
        {bars.map((b, i) => (
          <View
            key={i}
            style={{
              position: "absolute",
              bottom: 70,
              left: W * b.x,
              width: W * b.w,
              height: (H * b.h) + 40,
              borderTopLeftRadius: 10,
              borderTopRightRadius: 10,
              backgroundColor: "rgba(255,255,255,0.06)",
              borderWidth: 1,
              borderColor: "rgba(244,208,122,0.10)",
            }}
          />
        ))}

        {/* Burj needle */}
        <View
          style={{
            position: "absolute",
            bottom: 70,
            left: W * 0.49,
            width: 8,
            height: H * 0.38,
            borderTopLeftRadius: 8,
            borderTopRightRadius: 8,
            backgroundColor: "rgba(244,208,122,0.25)",
            borderWidth: 1,
            borderColor: "rgba(244,208,122,0.20)",
          }}
        />
        <View
          style={{
            position: "absolute",
            bottom: 70 + H * 0.38,
            left: W * 0.49 + 3,
            width: 2,
            height: 30,
            backgroundColor: "rgba(244,208,122,0.55)",
          }}
        />
      </View>
    </Pressable>
  );
}
// -------------------------------------------------------------------------------

export default function App() {
  const [boot, setBoot] = useState(true);
  const [introDone, setIntroDone] = useState(false);
const [tab, setTab] = useState("home");
  const [S, setS] = useState({ ...DEFAULT_STATE });

  const stateRef = useRef(S);
  // Intro shows after app data is ready (prevents getting stuck on splash in standalone)
  useEffect(() => {
    if (boot) return;
    if (introDone) return;
    const t = setTimeout(() => setIntroDone(true), 4500);
    return () => clearTimeout(t);
  }, [boot, introDone]);

  useEffect(() => {
    stateRef.current = S;
  }, [S]);

  const [menuOpen, setMenuOpen] = useState(false);
  const [range, setRange] = useState(7);

  // Modals
  const [editUsdOpen, setEditUsdOpen] = useState(false);
  const [editGoalOpen, setEditGoalOpen] = useState(false);
  const [targetsOpen, setTargetsOpen] = useState(false);

  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState("income");
  const [txnAmount, setTxnAmount] = useState("");
  const [txnCurrency, setTxnCurrency] = useState("USD"); // USD/AED/TL only
  const [txnCategory, setTxnCategory] = useState("");
  const [txnNote, setTxnNote] = useState("");

  // ✅ Opsiyonel: istenilen tarihe ekle (Ledger)
  const [txnUseCustomDate, setTxnUseCustomDate] = useState(false);
  const [txnDateText, setTxnDateText] = useState(""); // YYYY-MM-DD or YYYY-MM-DD HH:MM

  // ✅ Kategori etiket sıralama (Ledger)

  const [catOpen, setCatOpen] = useState(false);
  const [catKind, setCatKind] = useState("expense");
  const [catNew, setCatNew] = useState("");

  // Notes modal
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteEditId, setNoteEditId] = useState(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteTag, setNoteTag] = useState("Genel");
  const [noteBody, setNoteBody] = useState("");
  const [noteChecklistText, setNoteChecklistText] = useState("");
  const [noteChecklist, setNoteChecklist] = useState([]);
  const [notePhotos, setNotePhotos] = useState([]);

  const [notesQuery, setNotesQuery] = useState("");
  const [notesTagFilter, setNotesTagFilter] = useState("Hepsi");

  // Photo URL modal (no picker dependency)
  const [photoUrlModal, setPhotoUrlModal] = useState(false);
  const [photoUrlText, setPhotoUrlText] = useState("");

  // News detail modal
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsItem, setNewsItem] = useState(null);

  // Persistent Toast Modal
  const [toastModal, setToastModal] = useState({ open: false, title: "", msg: "" });

  // TODO UI state
  const [todoText, setTodoText] = useState("");
  const [todoTag, setTodoTag] = useState("");
  const [todoFilter, setTodoFilter] = useState("all");
  const [todoQuery, setTodoQuery] = useState("");

  // BUY/PROFIT screen state (NO decimals)
  const [buyAsset, setBuyAsset] = useState("USD"); // USD | GOLD
  const [buyTL, setBuyTL] = useState("");
  const [buyQty, setBuyQty] = useState(""); // integer qty or grams
  const [buyLastEdited, setBuyLastEdited] = useState("TL"); // TL | QTY
  const [buyFilter, setBuyFilter] = useState("ALL"); // ALL | USD | GOLD

  // GOLD ADD (Gram) modal for Ledger (income only)
  const [goldModalOpen, setGoldModalOpen] = useState(false);
  const [goldGramsInput, setGoldGramsInput] = useState("");

  // ✅ Opsiyonel: istenilen tarihe ekle (Altın gram)
  const [goldUseCustomDate, setGoldUseCustomDate] = useState(false);
  const [goldDateText, setGoldDateText] = useState(""); // YYYY-MM-DD or YYYY-MM-DD HH:MM

  // ✅ Save/Load UI
  const [saveLoadOpen, setSaveLoadOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveList, setSaveList] = useState([]);
  const [backupModal, setBackupModal] = useState({ open: false, mode: "export", text: "" }); // export|import

  // Animations (durations extended)
  const scanAnim = useRef(new Animated.Value(0)).current;
  const stripeAnim = useRef(new Animated.Value(0)).current;
  const hazeAnim = useRef(new Animated.Value(0)).current;
  const orbAnim = useRef(new Animated.Value(0)).current;
  const orbAnim2 = useRef(new Animated.Value(0)).current;

  // Coin shine animation for Gold card (5–6s)
  const goldShine = useRef(new Animated.Value(0)).current;

  const particles = useMemo(() => makeParticles(92), []);
  const theme = useMemo(() => THEME_PRESETS[S.themeKey] || THEME_PRESETS.dxbSkylineSignature, [S.themeKey]);
  const t = useMemo(() => I18N[S.lang] || I18N.TR, [S.lang]);

  const scanY = scanAnim.interpolate({ inputRange: [0, 1], outputRange: [-40, 520] });
  const moveStripe = stripeAnim.interpolate({ inputRange: [0, 1], outputRange: [-240, 300] });
  const hazeScale = hazeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.16] });
  const hazeOpacity = hazeAnim.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.20] });

  const orbX = orbAnim.interpolate({ inputRange: [0, 1], outputRange: [-60, 360] });
  const orbY = orbAnim.interpolate({ inputRange: [0, 1], outputRange: [30, 280] });
  const orbX2 = orbAnim2.interpolate({ inputRange: [0, 1], outputRange: [360, -90] });
  const orbY2 = orbAnim2.interpolate({ inputRange: [0, 1], outputRange: [110, 340] });

  const setPatch = (patch) => setS((p) => ({ ...p, ...patch }));

  // Derived balances
  const aed = useMemo(() => S.usd * (S.usdToAed || 3.6725), [S.usd, S.usdToAed]);
  const daysLeftToTravel = useMemo(
    () => Math.max(0, daysBetween(new Date(), new Date(S.travelDateISO))),
    [S.travelDateISO]
  );

  // Gold USD value (for card)
  const goldValueUsd = useMemo(() => {
    const gramTl = S.goldGramTl || 0;
    if (!S.usdToTl || !gramTl) return 0;
    const goldTl = (S.goldHoldGrams || 0) * gramTl;
    return goldTl / S.usdToTl;
  }, [S.goldHoldGrams, S.goldGramTl, S.usdToTl]);

  const totalUsdWorth = useMemo(() => (S.usd || 0) + goldValueUsd, [S.usd, goldValueUsd]);
  const remainingGoal = useMemo(
    () => Math.max(0, (S.goalUsd || 0) - totalUsdWorth),
    [S.goalUsd, totalUsdWorth]
  );
  const progress = useMemo(
    () => (S.goalUsd > 0 ? clamp(totalUsdWorth / S.goalUsd, 0, 1) : 0),
    [totalUsdWorth, S.goalUsd]
  );

  // Targets
  const dim = useMemo(() => daysInMonth(new Date()), []);
  const dom = useMemo(() => new Date().getDate(), []);
  const daysLeftThisMonth = useMemo(() => Math.max(1, dim - dom + 1), [dim, dom]);

  const autoIncome30dUsd = useMemo(
    () => avgIncomeLast30dUsd(S.txns, S.usdToAed, S.usdToTl),
    [S.txns, S.usdToAed, S.usdToTl]
  );
  const autoIncome30dTl = useMemo(
    () => autoIncome30dUsd * (S.usdToTl || 0),
    [autoIncome30dUsd, S.usdToTl]
  );

  const monthlyTargetTl = useMemo(() => {
    const m = Number(S.manualMonthlyTargetTl || 0);
    return m > 0 ? m : 120000;
  }, [S.manualMonthlyTargetTl]);

  const dailyTargetTl = useMemo(() => {
    const d = Number(S.manualDailyTargetTl || 0);
    return d > 0 ? d : Math.round(monthlyTargetTl / daysLeftThisMonth);
  }, [S.manualDailyTargetTl, monthlyTargetTl, daysLeftThisMonth]);

  const todayNetUsd = useMemo(() => {
    const from = startOfDay(new Date());
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    const inc = sumUsd(S.txns, "income", from, to, S.usdToAed, S.usdToTl);
    const exp = sumUsd(S.txns, "expense", from, to, S.usdToAed, S.usdToTl);
    return inc - exp;
  }, [S.txns, S.usdToAed, S.usdToTl]);

  const monthNetUsd = useMemo(() => {
    const from = startOfMonth(new Date());
    const to = endOfMonth(new Date());
    const inc = sumUsd(S.txns, "income", from, to, S.usdToAed, S.usdToTl);
    const exp = sumUsd(S.txns, "expense", from, to, S.usdToAed, S.usdToTl);
    return inc - exp;
  }, [S.txns, S.usdToAed, S.usdToTl]);

  const todayUsdBuysTl = useMemo(() => {
    const from = startOfDay(new Date());
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000);
    return sumUsdBuysTl(S.buys || [], from, to, S.usdToTl);
  }, [S.buys, S.usdToTl]);

  const monthUsdBuysTl = useMemo(() => {
    const from = startOfMonth(new Date());
    const to = endOfMonth(new Date());
    return sumUsdBuysTl(S.buys || [], from, to, S.usdToTl);
  }, [S.buys, S.usdToTl]);

  const todayNetTl = useMemo(() => todayNetUsd * (S.usdToTl || 0) + todayUsdBuysTl, [todayNetUsd, S.usdToTl, todayUsdBuysTl]);
  const monthNetTl = useMemo(() => monthNetUsd * (S.usdToTl || 0) + monthUsdBuysTl, [monthNetUsd, S.usdToTl, monthUsdBuysTl]);

  const dailySuccessPct = useMemo(
    () => (dailyTargetTl > 0 ? clamp((todayNetTl / dailyTargetTl) * 100, 0, 100) : 0),
    [todayNetTl, dailyTargetTl]
  );
  const monthlySuccessPct = useMemo(
    () => (monthlyTargetTl > 0 ? clamp((monthNetTl / monthlyTargetTl) * 100, 0, 100) : 0),
    [monthNetTl, monthlyTargetTl]
  );

  const dailyColor = useMemo(() => successColor(theme, dailySuccessPct), [theme, dailySuccessPct]);
  const monthlyColor = useMemo(() => successColor(theme, monthlySuccessPct), [theme, monthlySuccessPct]);

  const todayDeltaTl = useMemo(() => todayNetTl - dailyTargetTl, [todayNetTl, dailyTargetTl]);
  const monthDeltaTl = useMemo(() => monthNetTl - monthlyTargetTl, [monthNetTl, monthlyTargetTl]);
  const todayDeltaUsd = useMemo(() => (S.usdToTl ? todayDeltaTl / S.usdToTl : 0), [todayDeltaTl, S.usdToTl]);
  const monthDeltaUsd = useMemo(() => (S.usdToTl ? monthDeltaTl / S.usdToTl : 0), [monthDeltaTl, S.usdToTl]);

  // Tip (Ledger)
  const smartTip = useMemo(() => estimateSavingsTip(S.txns, S.usdToAed, S.usdToTl), [S.txns, S.usdToAed, S.usdToTl]);
  const topExp = useMemo(() => topExpenseCategory(S.txns, S.usdToAed, S.usdToTl), [S.txns, S.usdToAed, S.usdToTl]);

  // Notes filtering
  const allNoteTags = useMemo(() => {
    const set = new Set(["Hepsi"]);
    (S.notes || []).forEach((n) => set.add(n.tag || "Genel"));
    return Array.from(set);
  }, [S.notes]);

  const filteredNotes = useMemo(() => {
    const q = notesQuery.trim().toLowerCase();
    return (S.notes || []).filter((n) => {
      if (notesTagFilter !== "Hepsi" && (n.tag || "Genel") !== notesTagFilter) return false;
      if (!q) return true;
      return (
        (n.title || "").toLowerCase().includes(q) ||
        (n.body || "").toLowerCase().includes(q) ||
        (n.tag || "").toLowerCase().includes(q)
      );
    });
  }, [S.notes, notesQuery, notesTagFilter]);

  const tagSuggestions = useMemo(() => suggestNoteTags(`${noteTitle}\n${noteBody}`), [noteTitle, noteBody]);

  // Reports: trend bars
  const bars = useMemo(() => makeTrendBars(S.txns, range, S.usdToAed, S.usdToTl), [S.txns, range, S.usdToAed, S.usdToTl]);

  // To-Do filtered
  const filteredTodos = useMemo(() => {
    const q = todoQuery.trim().toLowerCase();
    return (S.todos || []).filter((x) => {
      if (todoFilter === "pending" && x.done) return false;
      if (todoFilter === "done" && !x.done) return false;
      if (!q) return true;
      return (x.text || "").toLowerCase().includes(q) || (x.tag || "").toLowerCase().includes(q);
    });
  }, [S.todos, todoFilter, todoQuery]);

  // BUY calculations (decimals supported)
  const usdTl = S.usdToTl || 0;
  const goldGramTl = S.goldGramTl || 0;
  const buyRate = buyAsset === "USD" ? usdTl : goldGramTl;

  const calcBuy = useMemo(() => {
    const tl = toNum(buyTL);
    const qty = toNum(buyQty);
    if (!buyRate || buyRate <= 0) return { valid: false, tl, qty, tlUsed: 0, qtyUsed: 0, leftover: 0, rate: 0 };
    if (buyLastEdited === "TL") {
      const tlUsed = tl;
      const qtyUsed = tlUsed / buyRate;
      return { valid: tlUsed > 0 && qtyUsed > 0, tl, qty, tlUsed, qtyUsed, leftover: 0, rate: buyRate };
    } else {
      const qtyUsed = qty;
      const tlUsed = qtyUsed * buyRate;
      return { valid: qtyUsed > 0 && tlUsed > 0, tl: tlUsed, qty, tlUsed, qtyUsed, leftover: 0, rate: buyRate };
    }
  }, [buyTL, buyQty, buyLastEdited, buyRate]);

  // buys list filter + portfolio
  const filteredBuys = useMemo(() => {
    const list = S.buys || [];
    if (buyFilter === "USD") return list.filter((x) => x.asset === "USD");
    if (buyFilter === "GOLD") return list.filter((x) => x.asset === "GOLD");
    return list;
  }, [S.buys, buyFilter]);

  const buySummary = useMemo(() => {
    const list = S.buys || [];
    let invested = 0;
    let valueNow = 0;
    for (const b of list) {
      invested += Number(b.tlSpent || 0);
      if (b.asset === "USD") valueNow += (Number(b.qty || 0) * (usdTl || 0));
      if (b.asset === "GOLD") valueNow += (Number(b.qty || 0) * (goldGramTl || 0));
    }
    const profit = valueNow - invested;
    const pct = invested > 0 ? (profit / invested) * 100 : 0;
    return { invested, valueNow, profit, pct };
  }, [S.buys, usdTl, goldGramTl]);

  /* =========================
     Animation loops (extended)
  ========================= */
  useEffect(() => {
    const a = Animated.loop(
      Animated.timing(scanAnim, { toValue: 1, duration: 32000, easing: Easing.linear, useNativeDriver: true })
    );
    const b = Animated.loop(
      Animated.timing(stripeAnim, { toValue: 1, duration: 36000, easing: Easing.linear, useNativeDriver: true })
    );
    const c = Animated.loop(
      Animated.sequence([
        Animated.timing(hazeAnim, { toValue: 1, duration: 24000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(hazeAnim, { toValue: 0, duration: 24000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const d = Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim, { toValue: 1, duration: 42000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(orbAnim, { toValue: 0, duration: 42000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    const e = Animated.loop(
      Animated.sequence([
        Animated.timing(orbAnim2, { toValue: 1, duration: 46000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(orbAnim2, { toValue: 0, duration: 46000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );

    // Coin shine
    const shine = Animated.loop(
      Animated.sequence([
        Animated.delay(5600),
        Animated.timing(goldShine, { toValue: 1, duration: 1150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(goldShine, { toValue: 0, duration: 0, useNativeDriver: true }),
      ])
    );

    a.start(); b.start(); c.start(); d.start(); e.start(); shine.start();
    return () => { a.stop(); b.stop(); c.stop(); d.stop(); e.stop(); shine.stop(); };
  }, []);

  // Load saved state once
  useEffect(() => {
    let alive = true;
    (async () => {
      const saved = await loadState();
      if (!alive) return;
      const merged = saved ? { ...DEFAULT_STATE, ...saved } : { ...DEFAULT_STATE };
      if (!merged.travelDateISO) merged.travelDateISO = new Date(2026, 11, 10).toISOString();
      if (!merged.newsFilter) merged.newsFilter = "ALL";
      if (!THEME_PRESETS[merged.themeKey]) merged.themeKey = DEFAULT_STATE.themeKey;
      if (!Array.isArray(merged.todos)) merged.todos = DEFAULT_STATE.todos;
      if (!Array.isArray(merged.buys)) merged.buys = [];
      if (!Number.isFinite(merged.goldHoldGrams)) merged.goldHoldGrams = 0;
      if (!Array.isArray(merged.txns)) merged.txns = [];
      if (!Array.isArray(merged.notes)) merged.notes = [];
      setS(merged);
      // Delay boot-off one tick so the first persist doesn't overwrite saved state
      setTimeout(() => { if (alive) setBoot(false); }, 0);
})();
    return () => { alive = false; };
  }, []);

  // Persist (main state)
  useEffect(() => {
    if (boot) return;
    saveState(S);
  }, [S, boot]);

  // In-flight guards for 3s updates
  const fxInFlight = useRef(false);
  const goldInFlight = useRef(false);

  async function refreshFx() {
    if (fxInFlight.current) return;
    fxInFlight.current = true;
    try {
      const r = await fetchUsdTl();
      if (Number.isFinite(r)) setS((p) => ({ ...p, usdToTl: r }));
    } catch {}
    fxInFlight.current = false;
  }

  async function refreshGold() {
    if (goldInFlight.current) return;
    goldInFlight.current = true;
    try {
      const usdToTlNow = stateRef.current?.usdToTl || 0;
      if (!usdToTlNow) throw new Error("no usdtry yet");
      const gram = await fetchGoldGramTL(usdToTlNow);
      if (Number.isFinite(gram)) setS((p) => ({ ...p, goldGramTl: gram, lastGoldISO: nowISO() }));
    } catch {}
    goldInFlight.current = false;
  }

  async function refreshWeather(force) {
    try {
      const last = S.lastWeatherISO ? new Date(S.lastWeatherISO).getTime() : 0;
      if (!force && Date.now() - last < 25 * 60 * 1000) return;
      const w = await fetchDubaiWeather();
      setS((p) => ({ ...p, weather: w, lastWeatherISO: nowISO() }));
    } catch {}
  }

  // Auto refresh rates every 3 seconds
  useEffect(() => {
    let alive = true;
    (async () => {
      await refreshFx();
      await refreshGold();
    })();
    const timer = setInterval(() => {
      if (!alive) return;
      refreshFx();
      refreshGold();
    }, 3000);

    return () => {
      alive = false;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Weather hourly
  useEffect(() => {
    let timer = null;
    (async () => {
      await refreshWeather(true);
      timer = setInterval(() => refreshWeather(false), 60 * 60 * 1000);
    })();
    return () => { if (timer) clearInterval(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // News refresh timer
  useEffect(() => {
    let nTimer = null;
    (async () => {
      await refreshNews(true);
      nTimer = setInterval(() => refreshNews(false), 15 * 60 * 1000);
    })();
    return () => { if (nTimer) clearInterval(nTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [S.lastNewsIdSeen]);

  async function refreshNews(force) {
    try {
      const last = S.lastNewsCheckISO ? new Date(S.lastNewsCheckISO).getTime() : 0;
      if (!force && Date.now() - last < 10 * 60 * 1000) return;

      const items = await fetchDonanimHaberRss();
      const enriched = items.slice(0, 80).map((x) => ({ ...x, kind: classifyNews(x) }));

      const newestId = enriched?.[0]?.id || "";
      const prevSeen = S.lastNewsIdSeen || "";

      setS((p) => ({
        ...p,
        news: enriched,
        lastNewsCheckISO: nowISO(),
        lastNewsIdSeen: p.lastNewsIdSeen || newestId,
      }));

      if (prevSeen && newestId && newestId !== prevSeen) {
        openToast("📰 Yeni Haber", "Yeni içerik geldi!");
        setS((p) => ({ ...p, lastNewsIdSeen: newestId, lastNewsNotifyISO: nowISO() }));
      }
    } catch {}
  }

  // Achievement notifications
  useEffect(() => {
    if (boot) return;
    const todayKey = toYMD(nowISO());
    if (dailySuccessPct >= 100 && S.lastDailyAchievedISO !== todayKey) {
      setS((p) => ({ ...p, lastDailyAchievedISO: todayKey }));
      openToast("🎉", "Habibi Come to the Dubai");
    }
    const mk = monthKey(new Date());
    if (monthlySuccessPct >= 100 && S.lastMonthlyAchievedKey !== mk) {
      setS((p) => ({ ...p, lastMonthlyAchievedKey: mk }));
      openToast("🏆", "Habibi Come to the Dubai");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dailySuccessPct, monthlySuccessPct, boot]);

  // Toast modal helpers
  function openToast(title, msg) {
    setToastModal({ open: true, title: title || "", msg: msg || "" });
  }
  function closeToast() {
    setToastModal({ open: false, title: "", msg: "" });
  }

  // ✅ Save/Load helpers (UI)
  const refreshSaveList = useCallback(async () => {
    const snaps = await listSnapshots();
    const fileSnaps = await listFileSnapshots();
    const merged = [
      ...fileSnaps.map((x) => ({ ...x, source: "file" })),
      ...snaps.map((x) => ({ id: x.id, name: x.name, at: x.at, version: x.version, source: "local" })),
    ];
    setSaveList(merged);
  }, []);

  useEffect(() => {
    if (!saveLoadOpen) return;
    refreshSaveList();
  }, [saveLoadOpen, refreshSaveList]);

  async function handleSaveApp(localOnly) {
    const nm = saveName.trim() || "SaveApp";
    const snap = await createSnapshot(nm, stateRef.current);

    // Also try file-save on native when requested
    if (!localOnly && !IS_WEB) {
      const meta = await saveSnapshotToFile(snap.name, stateRef.current);
      if (meta) openToast("✅", "File save oluşturuldu (APK)");
      else openToast("⚠️", "File save oluşturulamadı (FS yok). Backup Code kullan.");
    }

    await refreshSaveList();
    openToast("✅", `Saved: ${snap.name}`);

    // Web download
    if (!localOnly && IS_WEB) {
      const fn = `DubaiLedger_${snap.name.replace(/\s+/g, "_")}_${snap.at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
      downloadJsonFile(fn, snap);
    }
  }


  async function handleLoadApp(id) {
    const isFile = String(id || "").startsWith("file:");
    const snap = isFile ? await loadFileSnapshotById(id) : await loadSnapshotById(id);
    if (!snap) return Alert.alert("Load başarısız", "Save dosyası bulunamadı.");
    const merged = { ...DEFAULT_STATE, ...snap.state };
    if (!THEME_PRESETS[merged.themeKey]) merged.themeKey = DEFAULT_STATE.themeKey;
    if (!Array.isArray(merged.todos)) merged.todos = [];
    if (!Array.isArray(merged.buys)) merged.buys = [];
    if (!Array.isArray(merged.txns)) merged.txns = [];
    if (!Array.isArray(merged.notes)) merged.notes = [];
    setS(merged);
    openToast("✅", `Loaded: ${snap.name || "Save"}`);
    setSaveLoadOpen(false);
  }

  async function handleDeleteSave(id) {
    const isFile = String(id || "").startsWith("file:");
    if (isFile) await deleteFileSnapshotById(id);
    else await deleteSnapshotById(id);
    await refreshSaveList();
    openToast("🗑️", "Save silindi");
  }

  function openExportCode() {
    const payload = packBackupCode(stateRef.current);
    setBackupModal({ open: true, mode: "export", text: JSON.stringify(payload) });
  }

  function openImportCode() {
    setBackupModal({ open: true, mode: "import", text: "" });
  }

  async function applyImportedText(txt) {
    const parsed = safeParseJson(txt);
    if (!parsed) return Alert.alert("Hatalı", "JSON okunamadı.");

    const st = unpackBackupCode(parsed);
    if (!st) return Alert.alert("Hatalı", "Backup Code çözülemedi.");

    const merged = { ...DEFAULT_STATE, ...st };
    if (!THEME_PRESETS[merged.themeKey]) merged.themeKey = DEFAULT_STATE.themeKey;
    if (!Array.isArray(merged.todos)) merged.todos = [];
    if (!Array.isArray(merged.buys)) merged.buys = [];
    if (!Array.isArray(merged.txns)) merged.txns = [];
    if (!Array.isArray(merged.notes)) merged.notes = [];
    if (!merged.categories || typeof merged.categories !== "object") merged.categories = DEFAULT_STATE.categories;
    if (!Array.isArray(merged.categories.income)) merged.categories.income = DEFAULT_STATE.categories.income;
    if (!Array.isArray(merged.categories.expense)) merged.categories.expense = DEFAULT_STATE.categories.expense;

    setS(merged);
    openToast("✅", "Import başarılı (state yüklendi)");
    setBackupModal({ open: false, mode: "import", text: "" });
  }

  function loadFromFileWeb() {
    if (!IS_WEB) return openToast("ℹ️", t.noWebFile);
    pickJsonFileWeb(async (txt) => {
      await applyImportedText(txt);
    });
  }

  function saveToFileWeb() {
    if (!IS_WEB) return openToast("ℹ️", t.noWebFile);
    const payload = {
      id: uid(),
      name: "FileSave",
      at: atISO || nowISO(),
      version: "v4.8",
      state: stateRef.current,
    };
    const fn = `DubaiLedger_FileSave_${payload.at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
    downloadJsonFile(fn, payload);
    openToast("✅", "Dosya indirildi (.json)");
  }

  function openAddTxn(type, preset = {}) {
    setTxnType(type);
    setTxnAmount("");
    setTxnCurrency(preset.currency || "USD"); // NO GOLD here
    const first = (S.categories?.[type] || [])[0] || "Diğer";
    setTxnCategory(preset.category || first);
    setTxnNote(preset.note || "");
    setTxnUseCustomDate(false);
    setTxnDateText("");
    setTxnOpen(true);
  }

  // GOLD add from ledger (INCOME, tag is Gram, no currency choices)
  function openGoldGramModal() {
    setGoldGramsInput("");
    setGoldUseCustomDate(false);
    setGoldDateText("");
    setGoldModalOpen(true);
  }
  function saveGoldGramIncome() {
    const grams = toInt(goldGramsInput);
    if (!grams || grams <= 0) return Alert.alert("Hatalı", "Gram gir.");
    if (!S.goldGramTl || !Number.isFinite(S.goldGramTl)) return Alert.alert("Altın fiyatı yok", "Altın fiyatını bekle/yenile.");

    const tlValue = Math.round(grams * S.goldGramTl);
    const atISO = goldUseCustomDate ? parseUserDateToISO(goldDateText) : null;
    if (goldUseCustomDate && !atISO) return Alert.alert("Hatalı tarih", "Tarih formatı: YYYY-MM-DD veya YYYY-MM-DD HH:MM");
    const txn = {
      id: uid(),
      type: "income",
      currency: "TL",
      amount: tlValue,
      category: "Gram",
      note: `ALTIN ${grams} g`,
      at: atISO || nowISO(),
      asset: "GOLD",
      grams,
      goldGramTlAt: S.goldGramTl,
    };

    setS((p) => ({
      ...p,
      goldHoldGrams: (p.goldHoldGrams || 0) + grams,
      txns: [txn, ...(p.txns || [])],
    }));
    setGoldModalOpen(false);
    openToast("✅", `Altın eklendi: ${grams} g`);
  }

  // BUY input handlers (allow decimals)
  const onBuyTLChange = useCallback(
    (v) => {
      const clean = moneyOnly(v);
      setBuyLastEdited("TL");
      setBuyTL(clean);
      const tl = toNum(clean);
      const rate = buyAsset === "USD" ? (S.usdToTl || 0) : (S.goldGramTl || 0);
      if (!rate || rate <= 0 || tl <= 0) {
        setBuyQty("");
        return;
      }
      const qty = Math.floor(tl / rate);
      setBuyQty(qty > 0 ? String(qty) : "");
    },
    [buyAsset, S.usdToTl, S.goldGramTl]
  );

  const onBuyQtyChange = useCallback(
    (v) => {
      const clean = moneyOnly(v);
      setBuyLastEdited("QTY");
      setBuyQty(clean);
      const qty = toNum(clean);
      const rate = buyAsset === "USD" ? (S.usdToTl || 0) : (S.goldGramTl || 0);
      if (!rate || rate <= 0 || qty <= 0) {
        setBuyTL("");
        return;
      }
      const tl = qty * rate;
      setBuyTL(String(Math.round(tl)));
    },
    [buyAsset, S.usdToTl, S.goldGramTl]
  );

  useEffect(() => {
    if (buyLastEdited === "TL") onBuyTLChange(buyTL);
    else onBuyQtyChange(buyQty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyAsset]);

  // Ledger add txn (no decimals)
  function addTxn() {
    const rawInt = toNum(txnAmount);
    if (!Number.isFinite(rawInt) || rawInt <= 0) return Alert.alert("Hatalı tutar", "Geçerli tutar gir.");

    const atISO = txnUseCustomDate ? parseUserDateToISO(txnDateText) : null;
    if (txnUseCustomDate && !atISO) return Alert.alert("Hatalı tarih", "Tarih formatı: YYYY-MM-DD veya YYYY-MM-DD HH:MM");

    const tnx = {
      id: uid(),
      type: txnType,
      currency: txnCurrency,
      amount: rawInt,
      category: txnCategory || "Diğer",
      note: txnNote || "",
      at: atISO || nowISO(),
    };

    const usdEq = txnToUsd(tnx, S.usdToAed, S.usdToTl);

    setS((p) => {
      let usd = p.usd || 0;
      if (tnx.type === "income") usd += usdEq;
      else usd = Math.max(0, usd - usdEq);
      return { ...p, usd, txns: [tnx, ...(p.txns || [])] };
    });

    setTxnOpen(false);
    openToast("✅", "İşlem tamamlandı");
  }

  function deleteTxn(id) {
    const tx = (S.txns || []).find((x) => x.id === id);
    if (!tx) return;

    Alert.alert("Silinsin mi?", "Silmek istediğine emin misin?", [
      { text: t.cancel, style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () => {
          const usdEq = txnToUsd(tx, S.usdToAed, S.usdToTl);

          setS((p) => {
            let usd = p.usd || 0;
            let goldHoldGrams = p.goldHoldGrams || 0;

            const isGold = tx.asset === "GOLD" && Number.isFinite(tx.grams);

            if (!isGold) {
              if (tx.type === "income") usd = Math.max(0, usd - usdEq);
              else usd = usd + usdEq;
            }
            if (isGold) {
              if (tx.type === "income") goldHoldGrams = Math.max(0, goldHoldGrams - tx.grams);
              else goldHoldGrams = goldHoldGrams + tx.grams;
            }

            return { ...p, usd, goldHoldGrams, txns: (p.txns || []).filter((x) => x.id !== id) };
          });

          openToast("🗑️", "Silindi");
        },
      },
    ]);
  }

  function addCategory() {
    const txt = catNew.trim();
    if (!txt) return;
    setS((p) => {
      const list = p.categories?.[catKind] || [];
      if (list.includes(txt)) return p;
      return { ...p, categories: { ...p.categories, [catKind]: [txt, ...list] } };
    });
    setCatNew("");
  }
  function removeCategory(name) {
    setS((p) => ({ ...p, categories: { ...p.categories, [catKind]: (p.categories?.[catKind] || []).filter((x) => x !== name) } }));
  }

  // Notes
  function openNewNote() {
    setNoteEditId(null);
    setNoteTitle("");
    setNoteTag("Genel");
    setNoteBody("");
    setNoteChecklist([]);
    setNoteChecklistText("");
    setNotePhotos([]);
    setNoteOpen(true);
  }
  function openEditNote(n) {
    setNoteEditId(n.id);
    setNoteTitle(n.title || "");
    setNoteTag(n.tag || "Genel");
    setNoteBody(n.body || "");
    setNoteChecklist(Array.isArray(n.checklist) ? n.checklist : []);
    setNoteChecklistText("");
    setNotePhotos(Array.isArray(n.photos) ? n.photos : []);
    setNoteOpen(true);
  }
  function saveNote() {
    const tt = noteTitle.trim();
    if (!tt) return Alert.alert("Başlık gerekli", "Not başlığı yaz.");
    const payload = {
      id: noteEditId || uid(),
      title: tt,
      tag: (noteTag || "Genel").trim(),
      body: noteBody || "",
      checklist: noteChecklist,
      photos: notePhotos,
      at: atISO || nowISO(),
    };
    setS((p) => {
      const arr = p.notes || [];
      if (noteEditId) return { ...p, notes: arr.map((x) => (x.id === noteEditId ? payload : x)) };
      return { ...p, notes: [payload, ...arr] };
    });
    setNoteOpen(false);
    openToast("✅", "Not kaydedildi");
  }
  function deleteNote(id) {
    Alert.alert("Not silinsin mi?", "Silmek istediğine emin misin?", [
      { text: t.cancel, style: "cancel" },
      { text: "Sil", style: "destructive", onPress: () => setS((p) => ({ ...p, notes: (p.notes || []).filter((x) => x.id !== id) })) },
    ]);
  }
  function addChecklistItem() {
    const txt = noteChecklistText.trim();
    if (!txt) return;
    setNoteChecklist((p) => [{ id: uid(), text: txt, done: false }, ...p]);
    setNoteChecklistText("");
  }
  function toggleChecklist(id) {
    setNoteChecklist((p) => p.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  }
  function removeChecklist(id) {
    setNoteChecklist((p) => p.filter((x) => x.id !== id));
  }

  // No picker dependency: open URL modal
  function pickPhoto() {
    setPhotoUrlModal(true);
  }

  // News actions
  function openNewsDetail(it) {
    setNewsItem(it);
    setNewsOpen(true);
  }
  function toggleSaveNews(id) {
    setS((p) => {
      const set = new Set(p.savedNews || []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...p, savedNews: Array.from(set) };
    });
  }

  // To-Do actions
  function addTodo() {
    const text = todoText.trim();
    if (!text) return;
    const payload = { id: uid(), text, tag: (todoTag || "").trim(), done: false, at: nowISO() };
    setS((p) => ({ ...p, todos: [payload, ...(p.todos || [])] }));
    setTodoText("");
    setTodoTag("");
    openToast("✅", "Görev eklendi");
  }
  function toggleTodo(id) {
    setS((p) => ({ ...p, todos: (p.todos || []).map((x) => (x.id === id ? { ...x, done: !x.done } : x)) }));
  }
  function deleteTodo(id) {
    Alert.alert("Görev silinsin mi?", "Silmek istediğine emin misin?", [
      { text: t.cancel, style: "cancel" },
      { text: "Sil", style: "destructive", onPress: () => setS((p) => ({ ...p, todos: (p.todos || []).filter((x) => x.id !== id) })) },
    ]);
  }

  // BUY/PROFIT actions (decimals supported)
  function recordBuy() {
    if (!calcBuy.valid) return Alert.alert("Geçersiz", "TL veya miktar gir ve fiyatların gelmesini bekle.");

    // ✅ Decimal-safe buy record:
    // - tlSpent: 2 decimals
    // - qty: up to 4 decimals (USD / gram can be fractional)
    const tlSpent = Number((calcBuy.tlUsed || 0).toFixed(2));
    const qty = Number((calcBuy.qtyUsed || 0).toFixed(4));

    const entry = {
      id: uid(),
      asset: buyAsset,
      tlSpent,
      qty,
      at: atISO || nowISO(),
      rateUsdTlAt: usdTl,
      goldGramTlAt: goldGramTl,
    };

    setS((p) => {
      let usd = p.usd || 0;
      let goldHoldGrams = p.goldHoldGrams || 0;

      // Portfolio holdings increase by purchased quantity
      if (entry.asset === "USD") usd += entry.qty;
      if (entry.asset === "GOLD") goldHoldGrams += entry.qty;

      return { ...p, usd, goldHoldGrams, buys: [entry, ...(p.buys || [])] };
    });

    const qtyLabel = buyAsset === "USD" ? `${fmtMoney(entry.qty, 4)} USD` : `${fmtMoney(entry.qty, 4)} g`;
    openToast("✅", `🪙 Alım kaydedildi: ${qtyLabel}`);
  }

  function deleteBuy(id) {
    const b = (S.buys || []).find((x) => x.id === id);
    if (!b) return;

    Alert.alert("Kayıt silinsin mi?", "Silmek istediğine emin misin?", [
      { text: t.cancel, style: "cancel" },
      {
        text: "Sil",
        style: "destructive",
        onPress: () => {
          setS((p) => {
            let usd = p.usd || 0;
            let goldHoldGrams = p.goldHoldGrams || 0;
            if (b.asset === "USD") usd = Math.max(0, usd - (b.qty || 0));
            if (b.asset === "GOLD") goldHoldGrams = Math.max(0, goldHoldGrams - (b.qty || 0));
            return { ...p, usd, goldHoldGrams, buys: (p.buys || []).filter((x) => x.id !== id) };
          });
          openToast("🗑️", "Kayıt silindi");
        },
      },
    ]);
  }

	// -------------------- Masraflar Listesi CRUD --------------------
	function upsertExpense(item) {
		setS((p) => {
			const nowISO = new Date().toISOString();
			const list = p.expenses || [];
			if (item.id) {
				return {
					...p,
					expenses: list.map((x) =>
						x.id === item.id
							? {
								...x,
								...item,
								amount: Math.max(0, Math.round(Number(item.amount || 0) || 0)),
								updatedISO: nowISO,
							}
							: x
					)
				};
			}
			const maxId = Math.max(
				Number(p.expenseLastId || 0),
				...list.map((x) => (isFinite(Number(x.id)) ? Number(x.id) : 0))
			);
			const nextId = String(maxId + 1);
			const created = {
				...item,
				id: nextId,
				amount: Math.max(0, Math.round(Number(item.amount || 0) || 0)),
				createdISO: nowISO,
				updatedISO: nowISO,
			};
			return { ...p, expenseLastId: maxId + 1, expenses: [created, ...list] };
		});
		openToast("🧾", "Masraf kaydedildi");
	}

	function deleteExpense(id) {
		setS((p) => ({ ...p, expenses: (p.expenses || []).filter((x) => x.id !== id) }));
		openToast("🗑️", "Masraf silindi");
	}

	function toggleExpensePaid(id) {
		setS((p) => {
			const nowISO = new Date().toISOString();
			return {
				...p,
				expenses: (p.expenses || []).map((x) =>
					x.id === id ? { ...x, status: x.status === "PAID" ? "PLANNED" : "PAID", updatedISO: nowISO } : x
				),
			};
		});
	}

  const newsFiltered = useMemo(() => {
    const list = S.news || [];
    if (S.newsFilter === "SAVED") {
      const set = new Set(S.savedNews || []);
      return list.filter((x) => set.has(x.id));
    }
    if (S.newsFilter === "AI") return list.filter((x) => x.kind === "AI");
    if (S.newsFilter === "GAMING") return list.filter((x) => x.kind === "GAMING");
    if (S.newsFilter === "MOBILE") return list.filter((x) => x.kind === "MOBILE");
    if (S.newsFilter === "HARDWARE") return list.filter((x) => x.kind === "HARDWARE");
    if (S.newsFilter === "SCIENCE") return list.filter((x) => x.kind === "SCIENCE");
    return list;
  }, [S.news, S.newsFilter, S.savedNews]);

  
  if (!boot && !introDone) {
    return <DubaiIntro onDone={() => setIntroDone(true)} durationMs={4500} />;
  }

return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={{ uri: theme.skyline }} style={{ flex: 1 }} resizeMode="cover">
        <View style={{ flex: 1, backgroundColor: theme.overlay }}>
	          <DubaiIconicBackdrop theme={theme} />
          <ParticlesOverlay particles={particles} theme={theme} />
          <NeonStripes theme={theme} moveStripe={moveStripe} />
          <Scanline theme={theme} scanY={scanY} />

          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 240,
              height: 240,
              borderRadius: 240,
              backgroundColor: theme.orb,
              transform: [{ translateX: orbX }, { translateY: orbY }, { scale: hazeScale }],
              opacity: 0.52,
              top: 0,
              left: 0,
            }}
          />
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              width: 280,
              height: 280,
              borderRadius: 280,
              backgroundColor: theme.orb2,
              transform: [{ translateX: orbX2 }, { translateY: orbY2 }, { scale: hazeScale }],
              opacity: 0.48,
              top: 0,
              left: 0,
            }}
          />

          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: -60,
              right: -60,
              bottom: 118,
              height: 270,
              backgroundColor: theme.haze,
              borderRadius: 44,
              transform: [{ scale: hazeScale }],
              opacity: hazeOpacity,
            }}
          />

          {boot && (
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.60)", zIndex: 999 }}>
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "900" }}>DUBAI • DRABORNEAGLE</Text>
              <Text style={{ color: "rgba(255,255,255,0.7)", marginTop: 8 }}>Sistem yükleniyor…</Text>
            </View>
          )}

          <View style={{ flex: 1, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 92, opacity: boot ? 0.5 : 1 }}>
            {tab === "home" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <TouchableOpacity onPress={() => setMenuOpen(true)}>
  <View
    style={{
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      backgroundColor: theme.glass2,
      borderWidth: 1,
      borderColor: theme.stroke,
      shadowColor: "#000",
      shadowOpacity: 0.22,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    }}
  >
    <MenuIcon theme={theme} size={20} />
  </View>
</TouchableOpacity>

                  <View style={{ alignItems: "center", flex: 1 }}>
                    <LangToggle theme={theme} lang={S.lang} onSet={(lang) => setPatch({ lang })} />
                  </View>

                  <View style={{ width: 46 }} />
                </View>

                <View style={{ alignItems: "center", marginBottom: 12 }}>
                  <Text style={{ marginTop: 6, color: theme.text, fontSize: 30, fontWeight: "900" }}>{t.title}</Text>
                  <Text style={{ marginTop: 6, color: theme.sub, fontSize: 14, fontWeight: "900" }}>
                    {t.daysLeft}: <Text style={{ color: theme.gold }}>{daysLeftToTravel} {t.day}</Text>
                  </Text>

                  <Text style={{ marginTop: 8, color: theme.sub, fontWeight: "800", textAlign: "center" }}>
                    {t.thisMonth}: <Text style={{ color: theme.gold, fontWeight: "900" }}>{fmtMoney(monthlyTargetTl, 0)} TL</Text>{" "}
                    • {t.today}: <Text style={{ color: theme.gold, fontWeight: "900" }}>{fmtMoney(dailyTargetTl, 0)} TL</Text>
                  </Text>
                </View>

                <View style={{ flexDirection: "row", gap: 12 }}>
                  <GlassCard theme={theme} style={{ flex: 1, padding: 14, minHeight: 132 }}>
                    <Text style={{ position: "absolute", top: 4, left: 6, fontSize: 34 }}>🇺🇸</Text>
                    <TouchableOpacity onPress={() => setEditUsdOpen(true)} style={{ position: "absolute", top: 8, right: 8 }}>
                      <Chip theme={theme} text={t.edit} />
                    </TouchableOpacity>
                    <Text style={{ marginTop: 44, color: theme.text, fontSize: 18, fontWeight: "900" }}>{t.usdMy}</Text>
                    <Text style={{ marginTop: 6, color: theme.text, fontSize: 30, fontWeight: "900" }}>${fmtMoney(S.usd, 0)}</Text>
                  </GlassCard>

                  <GlassCard theme={theme} style={{ flex: 1, padding: 14, minHeight: 132 }}>
                    <Text style={{ position: "absolute", top: 4, left: 6, fontSize: 34 }}>🇦🇪</Text>
                    <Text style={{ marginTop: 46, color: theme.text, fontSize: 14, fontWeight: "900" }}>{t.aedMy}</Text>
                    <Text style={{ marginTop: 6, color: theme.text, fontSize: 28, fontWeight: "900" }}>
                      {fmtMoney(aed, 0)} <Text style={{ color: theme.sub, fontSize: 14 }}>AED</Text>
                    </Text>
                  </GlassCard>
                </View>

                <GlassCard theme={theme} style={{ marginTop: 12, padding: 14, overflow: "hidden" }}>
                  <CoinShine theme={theme} shine={goldShine} />
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <GoldBadgeIcon theme={theme} />
                      <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.goldHold}</Text>
                    </View>
                    <Text style={{ color: theme.sub, fontWeight: "900" }}>
                      {fmtMoney(S.goldHoldGrams || 0, 0)} g
                    </Text>
                  </View>

                  <Text style={{ color: theme.sub, marginTop: 8, fontWeight: "800" }}>
                    Değeri (TL):{" "}
                    <Text style={{ color: theme.gold, fontWeight: "900" }}>
                      {S.goldGramTl ? fmtMoney((S.goldHoldGrams || 0) * S.goldGramTl, 0) : "—"}
                    </Text>
                    {"  "}•{"  "}
                    Değeri (USD):{" "}
                    <Text style={{ color: theme.gold, fontWeight: "900" }}>
                      {S.goldGramTl && S.usdToTl ? `$${fmtMoney(goldValueUsd, 0)}` : "—"}
                    </Text>
                  </Text>
                </GlassCard>

                <GlassCard theme={theme} style={{ marginTop: 12, padding: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.hud}</Text>
                    <TouchableOpacity onPress={() => setEditGoalOpen(true)}>
                      <Text style={{ color: theme.gold, fontWeight: "900" }}>{t.goal}: ${fmtMoney(S.goalUsd, 0)}</Text>
                    </TouchableOpacity>
                  </View>

                  <DubaiHudProgress theme={theme} progress={progress} moveStripe={moveStripe} />

                  <Text style={{ marginTop: 10, color: theme.sub, fontWeight: "800" }}>
                    {Math.round(progress * 100)}% • {t.remaining}:{" "}
                    <Text style={{ color: theme.gold, fontWeight: "900" }}>${fmtMoney(remainingGoal, 0)}</Text>
                    {"  "}• Toplam: <Text style={{ color: theme.gold, fontWeight: "900" }}>${fmtMoney(totalUsdWorth, 0)}</Text>
                  </Text>

                  <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
                    <Text style={{ color: theme.text, fontWeight: "900" }}>{t.successRates}</Text>
                    <Text style={{ color: theme.sub, marginTop: 6 }}>
                      {t.today}: <Text style={{ color: dailyColor, fontWeight: "900" }}>{Math.round(dailySuccessPct)}%</Text>{" "}
                      • {t.thisMonth}: <Text style={{ color: monthlyColor, fontWeight: "900" }}>{Math.round(monthlySuccessPct)}%</Text>
                    </Text>

                    <Text style={{ color: theme.sub, marginTop: 10, fontWeight: "900" }}>
                      {t.diffToday}:{" "}
                      <Text style={{ color: todayDeltaTl >= 0 ? theme.green : theme.red, fontWeight: "900" }}>
                        {todayDeltaTl >= 0 ? "+" : "-"}{fmtMoney(Math.abs(todayDeltaTl), 0)} TL
                      </Text>{" "}
                      (<Text style={{ color: todayDeltaUsd >= 0 ? theme.green : theme.red, fontWeight: "900" }}>
                        {todayDeltaUsd >= 0 ? "+" : "-"}{fmtMoney(Math.abs(todayDeltaUsd), 0)} USD
                      </Text>)
                    </Text>

                    <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "900" }}>
                      {t.diffMonth}:{" "}
                      <Text style={{ color: monthDeltaTl >= 0 ? theme.green : theme.red, fontWeight: "900" }}>
                        {monthDeltaTl >= 0 ? "+" : "-"}{fmtMoney(Math.abs(monthDeltaTl), 0)} TL
                      </Text>{" "}
                      (<Text style={{ color: monthDeltaUsd >= 0 ? theme.green : theme.red, fontWeight: "900" }}>
                        {monthDeltaUsd >= 0 ? "+" : "-"}{fmtMoney(Math.abs(monthDeltaUsd), 0)} USD
                      </Text>)
                    </Text>
                  </View>
                </GlassCard>

                <Text style={{ marginTop: 14, color: theme.text, fontSize: 16, fontWeight: "900" }}>{t.quick}</Text>
                <View style={{ flexDirection: "row", gap: 12, marginTop: 10 }}>
                  <GlowButtonDubaiShimmer theme={theme} text={t.addIncome} kind="green" onPress={() => openAddTxn("income")} shimmer={stripeAnim} />
                  <GlowButtonDubaiShimmer theme={theme} text={t.addExpense} kind="orange" onPress={() => openAddTxn("expense")} shimmer={stripeAnim} />
                </View>

                <TouchableOpacity onPress={() => setTab("settings")} style={{ marginTop: 12 }}>
                  <GlassCard theme={theme} style={{ padding: 12 }}>
                    <Text style={{ color: theme.sub, fontWeight: "900" }}>
                      {t.openTargetPlan} • {t.autoAvg1m}: <Text style={{ color: theme.gold }}>{fmtMoney(autoIncome30dTl, 0)} TL</Text>
                    </Text>
                  </GlassCard>
                </TouchableOpacity>
              </ScrollView>
            )}

            {tab === "ledger" && (
              <LedgerDubaiFuturistic
                theme={theme}
                t={t}
                S={S}
                shimmer={stripeAnim}
                openCats={() => setCatOpen(true)}
                onAddIncome={() => openAddTxn("income")}
                onAddExpense={() => openAddTxn("expense")}
                onAddGold={openGoldGramModal}
                onDelete={deleteTxn}
                smartTip={smartTip}
                topExp={topExp}
              />
            )}

            {tab === "reports" && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
                <GlassCard theme={theme} style={{ marginTop: 0, padding: 14 }}>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Kurlar</Text>
                  <Text style={{ color: theme.sub, marginTop: 8, fontWeight: "900" }}>
                    {t.usdTry}: <Text style={{ color: theme.gold }}>{fmtMoney(S.usdToTl || 0, 2)} TL</Text>
                  </Text>
                  <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "900" }}>
                    {t.goldGram}:{" "}
                    <Text style={{ color: theme.gold }}>
                      {S.goldGramTl ? `${fmtMoney(S.goldGramTl, 0)} TL` : "Yükleniyor…"}
                    </Text>
                  </Text>
                  <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 8, fontWeight: "800", fontSize: 12 }}>
                    Otomatik yenileme: 3 sn
                  </Text>
                </GlassCard>

                <View style={{ marginTop: 10 }}>
                  <WeatherCard theme={theme} t={t} weather={S.weather} lastISO={S.lastWeatherISO} onRefresh={() => refreshWeather(true)} />
                </View>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
                  <ToggleChip theme={theme} active={range === 7} text="Son 7 gün" onPress={() => setRange(7)} />
                  <ToggleChip theme={theme} active={range === 30} text="Son 30 gün" onPress={() => setRange(30)} />
                </View>

                <GlassCard theme={theme} style={{ marginTop: 12, padding: 14 }}>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Gelir / Gider Trend</Text>
                  <Text style={{ color: theme.sub, marginTop: 6 }}>Barlar USD eşdeğeri.</Text>
                  <TrendBars theme={theme} bars={bars} />
                </GlassCard>
              </ScrollView>
            )}

	            {tab === "stocks" && (
	              <StocksScreen
	                theme={theme}
	                S={S}
	                onSetWatchlist={(list) => setPatch({ stockWatchlist: list })}
	              />
	            )}

            {tab === "news" && (
              <NewsScreen
                theme={theme}
                t={t}
                S={S}
                setPatch={setPatch}
                onRefresh={() => refreshNews(true)}
                list={newsFiltered}
                onOpen={openNewsDetail}
              />
            )}

            {tab === "notes" && (
              <NotesPro
                theme={theme}
                t={t}
                notes={filteredNotes}
                allTags={allNoteTags}
                query={notesQuery}
                setQuery={setNotesQuery}
                tagFilter={notesTagFilter}
                setTagFilter={setNotesTagFilter}
                onAdd={openNewNote}
                onEdit={openEditNote}
                onDelete={deleteNote}
              />
            )}

	            {tab === "expenses" && (
	              <ExpensesListScreen theme={theme} S={S} onUpsert={upsertExpense} onDelete={deleteExpense} onTogglePaid={toggleExpensePaid} />
	            )}

            {tab === "todo" && (
              <TodoPro
                theme={theme}
                t={t}
                query={todoQuery}
                setQuery={setTodoQuery}
                filter={todoFilter}
                setFilter={setTodoFilter}
                text={todoText}
                setText={setTodoText}
                tag={todoTag}
                setTag={setTodoTag}
                list={filteredTodos}
                onAdd={addTodo}
                onToggle={toggleTodo}
                onDelete={deleteTodo}
              />
            )}

            {tab === "buy" && (
              <BuyProfitScreen
                theme={theme}
                t={t}
                S={S}
                buyAsset={buyAsset}
                setBuyAsset={setBuyAsset}
                buyTL={buyTL}
                onBuyTLChange={onBuyTLChange}
                buyQty={buyQty}
                onBuyQtyChange={onBuyQtyChange}
                calcBuy={calcBuy}
                onRecordBuy={recordBuy}
                onRefreshPrices={async () => { await refreshFx(); await refreshGold(); }}
                buyFilter={buyFilter}
                setBuyFilter={setBuyFilter}
                list={filteredBuys}
                summary={buySummary}
                onDeleteBuy={deleteBuy}
                shimmer={stripeAnim}
              />
            )}

            {tab === "settings" && (
              <SettingsPro
                theme={theme}
                t={t}
                S={S}
                setPatch={setPatch}
                onPickTheme={(k) => setPatch({ themeKey: k })}
                onOpenTargets={() => setTargetsOpen(true)}
                onRefreshFx={() => refreshFx()}
                onRefreshWeather={() => refreshWeather(true)}
                onRefreshGold={() => refreshGold()}
                onReset={async () => {
                  const keepGoal = stateRef.current?.goalUsd ?? DEFAULT_STATE.goalUsd;
                  await clearState();
                  setS({ ...DEFAULT_STATE, goalUsd: keepGoal });
                  openToast("♻️", "Hedef hariç tüm veriler sıfırlandı.");
                }}
                onOpenSaveLoad={() => {
                  setSaveName("");
                  setSaveLoadOpen(true);
                }}
              />
            )}
          </View>

          <BottomNavDubai theme={theme} tab={tab} setTab={setTab} t={t} />
        </View>
      </ImageBackground>

      <MenuModal
        open={menuOpen}
        theme={theme}
        t={t}
        tab={tab}
        onClose={() => setMenuOpen(false)}
        onGo={(k) => {
          setTab(k);
          setMenuOpen(false);
        }}
      />

      <MoneyModal
        open={editUsdOpen}
        theme={theme}
        title={t.usdMy}
        value={S.usd}
        onClose={() => setEditUsdOpen(false)}
        onSave={(v) => setPatch({ usd: v })}
      />
      <MoneyModal
        open={editGoalOpen}
        theme={theme}
        title={`${t.goal} (USD)`}
        value={S.goalUsd}
        onClose={() => setEditGoalOpen(false)}
        onSave={(v) => setPatch({ goalUsd: v })}
      />

      <TargetsModalTL
        open={targetsOpen}
        theme={theme}
        t={t}
        autoIncome30dTl={autoIncome30dTl}
        manualMonthlyTl={S.manualMonthlyTargetTl}
        manualDailyTl={S.manualDailyTargetTl}
        dailySuccessPct={dailySuccessPct}
        monthlySuccessPct={monthlySuccessPct}
        dailyColor={dailyColor}
        monthlyColor={monthlyColor}
        onClose={() => setTargetsOpen(false)}
        onSave={(mTl, dTl) => setPatch({ manualMonthlyTargetTl: mTl, manualDailyTargetTl: dTl })}
      />

      <TxnModal
        open={txnOpen}
        theme={theme}
        t={t}
        type={txnType}
        categories={S.categories?.[txnType] || ["Diğer"]}
        amount={txnAmount}
        setAmount={(v) => setTxnAmount(moneyOnly(v))}
        currency={txnCurrency}
        setCurrency={setTxnCurrency}
        category={txnCategory}
        setCategory={setTxnCategory}
        note={txnNote}
        setNote={setTxnNote}
        useCustomDate={txnUseCustomDate}
        setUseCustomDate={setTxnUseCustomDate}
        dateText={txnDateText}
        setDateText={setTxnDateText}
        onClose={() => setTxnOpen(false)}
        onSave={addTxn}
      />

      <GoldGramModal
        open={goldModalOpen}
        theme={theme}
        t={t}
        grams={goldGramsInput}
        setGrams={(v) => setGoldGramsInput(digitsOnly(v))}
        goldGramTl={S.goldGramTl}
        usdToTl={S.usdToTl}
        useCustomDate={goldUseCustomDate}
        setUseCustomDate={setGoldUseCustomDate}
        dateText={goldDateText}
        setDateText={setGoldDateText}
        onClose={() => setGoldModalOpen(false)}
        onSave={saveGoldGramIncome}
      />

      <CategoryModal
        open={catOpen}
        theme={theme}
        kind={catKind}
        setKind={setCatKind}
        categories={S.categories?.[catKind] || []}
        newCat={catNew}
        setNewCat={setCatNew}
        onAdd={addCategory}
        onRemove={removeCategory}
        onClose={() => setCatOpen(false)}
      />

      <NoteModal
        open={noteOpen}
        theme={theme}
        t={t}
        title={noteTitle}
        setTitle={setNoteTitle}
        tag={noteTag}
        setTag={setNoteTag}
        body={noteBody}
        setBody={setNoteBody}
        tagSuggestions={tagSuggestions}
        onApplyTag={(tg) => setNoteTag(tg)}
        checklistText={noteChecklistText}
        setChecklistText={setNoteChecklistText}
        checklist={noteChecklist}
        onAddChecklist={addChecklistItem}
        onToggleChecklist={toggleChecklist}
        onRemoveChecklist={removeChecklist}
        photos={notePhotos}
        onPickPhoto={pickPhoto}
        onRemovePhoto={(uri) => setNotePhotos((p) => p.filter((x) => x !== uri))}
        onClose={() => setNoteOpen(false)}
        onSave={saveNote}
      />

      {/* Photo URL modal */}
      <Modal transparent visible={photoUrlModal} animationType="fade" onRequestClose={() => setPhotoUrlModal(false)}>
        <Pressable onPress={() => setPhotoUrlModal(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Foto URL Ekle</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>Örn: https://...</Text>
            <TextInput
              value={photoUrlText}
              onChangeText={setPhotoUrlText}
              placeholder="https://..."
              placeholderTextColor={theme.sub}
              style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
            />
            <RowButtons
              theme={theme}
              left={t.cancel}
              right="Ekle"
              onLeft={() => setPhotoUrlModal(false)}
              onRight={() => {
                const u = photoUrlText.trim();
                if (!u) return;
                setNotePhotos((p) => [u, ...p]);
                setPhotoUrlText("");
                setPhotoUrlModal(false);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* News Detail Modal */}
      <Modal transparent visible={newsOpen} animationType="fade" onRequestClose={() => setNewsOpen(false)}>
        <Pressable onPress={() => setNewsOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
          <Pressable onPress={() => {}} style={{ maxHeight: "92%", backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }} numberOfLines={2}>
              {newsItem?.title || ""}
            </Text>
            <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800", fontSize: 12 }}>{newsItem?.pubDate || ""}</Text>

            <ScrollView style={{ marginTop: 12 }}>
              <Text style={{ color: theme.sub, lineHeight: 20 }}>
                {stripHtml(newsItem?.content || "").slice(0, 4000)}
              </Text>
              {!!newsItem?.link && (
                <Text style={{ marginTop: 12, color: theme.gold, fontWeight: "900" }}>
                  Link: {newsItem.link}
                </Text>
              )}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
              <TouchableOpacity onPress={() => setNewsOpen(false)} style={{ flex: 1 }}>
                <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>{t.ok}</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  if (!newsItem?.id) return;
                  toggleSaveNews(newsItem.id);
                  openToast("💾", "Haber kaydedildi / kaldırıldı");
                }}
                style={{ flex: 1 }}
              >
                <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.20)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>{t.save}</Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Toast Modal */}
      <Modal transparent visible={toastModal.open} animationType="fade" onRequestClose={() => closeToast()}>
        <Pressable onPress={() => closeToast()} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18, textAlign: "center" }}>{toastModal.title || "Bildirim"}</Text>
            <Text style={{ color: theme.sub, marginTop: 10, fontWeight: "800", textAlign: "center", lineHeight: 20 }}>{toastModal.msg || ""}</Text>
            <TouchableOpacity onPress={() => closeToast()} style={{ marginTop: 14 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.20)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.ok}</Text>
              </View>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ✅ Save/Load Modal */}
      <SaveLoadModal
        open={saveLoadOpen}
        theme={theme}
        t={t}
        isWeb={IS_WEB}
        saveName={saveName}
        setSaveName={setSaveName}
        saves={saveList}
        onClose={() => setSaveLoadOpen(false)}
        onSaveLocal={() => handleSaveApp(true)}
        onSaveFile={() => handleSaveApp(false)}
        onLoad={handleLoadApp}
        onDelete={handleDeleteSave}
        onExportCode={openExportCode}
        onImportCode={openImportCode}
        onLoadFile={loadFromFileWeb}
        onSaveFileOnly={saveToFileWeb}
      />

      {/* ✅ Backup Code Modal */}
      <BackupCodeModal
        open={backupModal.open}
        theme={theme}
        t={t}
        mode={backupModal.mode}
        text={backupModal.text}
        setText={(x) => setBackupModal((p) => ({ ...p, text: x }))}
        onClose={() => setBackupModal({ open: false, mode: "export", text: "" })}
        onApply={async () => applyImportedText(backupModal.text)}
      />
    </SafeAreaView>
  );
}

/* =========================
   Reports helpers
========================= */
function makeTrendBars(txns, days, usdToAed, usdToTl) {
  const now = new Date();
  const keys = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    keys.push(startOfDay(d).toISOString().slice(0, 10));
  }
  const income = new Map(keys.map((k) => [k, 0]));
  const expense = new Map(keys.map((k) => [k, 0]));
  for (const t of txns) {
    const k = startOfDay(new Date(t.at)).toISOString().slice(0, 10);
    if (!income.has(k)) continue;
    const usd = txnToUsd(t, usdToAed, usdToTl);
    if (t.type === "income") income.set(k, income.get(k) + usd);
    else expense.set(k, expense.get(k) + usd);
  }
  const out = [];
  for (const k of keys) {
    out.push({ k: k + "_i", day: k.slice(5), v: income.get(k), kind: "income" });
    out.push({ k: k + "_e", day: "", v: expense.get(k), kind: "expense" });
  }
  return out;
}

/* =========================
   UI Components
========================= */

function inp(theme) {
  return {
    marginTop: 8,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.stroke,
    color: theme.text,
    backgroundColor: "rgba(0,0,0,0.18)",
    fontWeight: "800",
  };
}


function CoinShine({ theme, shine }) {
  const translateX = shine.interpolate({ inputRange: [0, 1], outputRange: [-260, 320] });
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: -30,
        left: -240,
        width: 220,
        height: 160,
        backgroundColor: "rgba(255,255,255,0.14)",
        transform: [{ translateX }, { rotate: "-18deg" }],
        borderRadius: 40,
        opacity: 0.65,
      }}
    />
  );
}

function GoldBadgeIcon({ theme, size = 18 }) {
  return (
    <View
      style={{
        width: size + 8,
        height: size + 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.gold,
        backgroundColor: "rgba(255,209,112,0.14)",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 8,
      }}
    >
      <Text style={{ color: theme.gold, fontWeight: "900", fontSize: size }}>🪙</Text>
    </View>
  );
}

function LangToggle({ theme, lang, onSet }) {
  return (
    <View style={{ flexDirection: "row", borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(0,0,0,0.18)" }}>
      <TouchableOpacity onPress={() => onSet("TR")} style={{ paddingVertical: 8, paddingHorizontal: 18, backgroundColor: lang === "TR" ? "rgba(255,209,112,0.22)" : "transparent" }}>
        <Text style={{ color: theme.text, fontWeight: "900" }}>TR</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => onSet("EN")} style={{ paddingVertical: 8, paddingHorizontal: 18, backgroundColor: lang === "EN" ? "rgba(255,209,112,0.22)" : "transparent" }}>
        <Text style={{ color: theme.text, fontWeight: "900" }}>EN</Text>
      </TouchableOpacity>
    </View>
  );
}

function GlassCard({ theme, style, children }) {
  return (
    <View
      style={[
        {
          backgroundColor: theme.glass,
          borderWidth: 1,
          borderColor: theme.stroke,
          borderRadius: 18,
          overflow: "hidden",
        },
        style,
      ]}
    >
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: -70, right: -70, height: 18, backgroundColor: "rgba(255,255,255,0.06)", transform: [{ rotate: "-10deg" }] }} />
      <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, backgroundColor: theme.neon, opacity: 0.55 }} />
      {children}
    </View>
  );
}

function Chip({ theme, text }) {
  return (
    <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke }}>
      <Text style={{ color: theme.text, fontWeight: "900", fontSize: 13 }}>{text}</Text>
    </View>
  );
}

function ToggleChip({ theme, active, text, onPress }) {
  return (
    <TouchableOpacity onPress={onPress}>
      <View
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: active ? theme.gold : theme.stroke,
          backgroundColor: active ? "rgba(255,209,112,0.18)" : theme.glass2,
        }}
      >
        <Text style={{ color: theme.text, fontWeight: "900" }}>{text}</Text>
      </View>
    </TouchableOpacity>
  );
}

function GlowButtonDubaiShimmer({ theme, kind, text, onPress, shimmer, textSize }) {
  const scale = useRef(new Animated.Value(1)).current;
  const border = kind === "green" ? theme.green : kind === "gold" ? theme.gold : theme.orange;
  const bg =
    kind === "green" ? "rgba(87,227,137,0.20)" :
    kind === "gold" ? "rgba(255,209,112,0.20)" :
    "rgba(255,180,81,0.20)";
  const glow =
    kind === "green" ? "rgba(87,227,137,0.45)" :
    kind === "gold" ? "rgba(255,209,112,0.45)" :
    "rgba(255,180,81,0.45)";
  const move = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-260, 320] });

  const pressIn = () => Animated.spring(scale, { toValue: 0.965, useNativeDriver: true, speed: 24, bounciness: 8 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }).start();

  return (
    <TouchableOpacity onPress={onPress} onPressIn={pressIn} onPressOut={pressOut} style={{ flex: 1 }}>
      <Animated.View
        style={{
          transform: [{ scale }],
          paddingVertical: 14,
          borderRadius: 16,
          backgroundColor: bg,
          borderWidth: 1,
          borderColor: border,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: glow,
          shadowOpacity: 0.85,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
          elevation: 12,
          overflow: "hidden",
        }}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -22,
            left: -260,
            width: 420,
            height: 140,
            backgroundColor: "rgba(255,255,255,0.16)",
            transform: [{ translateX: move }, { rotate: "-18deg" }],
          }}
        />
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: -26,
            left: -280,
            width: 460,
            height: 160,
            backgroundColor: theme.neon2,
            opacity: 0.14,
            transform: [{ translateX: move }, { rotate: "-18deg" }],
          }}
        />
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{text}</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

function DubaiHudProgress({ theme, progress, moveStripe }) {
  const pct = Math.round(clamp(progress, 0, 1) * 100);
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ height: 22, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: theme.stroke, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: "100%", backgroundColor: theme.neon }}>
          <Animated.View
            style={{
              position: "absolute",
              top: -18,
              left: -200,
              width: 460,
              height: 120,
              backgroundColor: "rgba(255,255,255,0.12)",
              transform: [{ translateX: moveStripe }, { rotate: "-18deg" }],
            }}
          />
          <Animated.View
            style={{
              position: "absolute",
              top: -18,
              left: 10,
              width: 460,
              height: 120,
              backgroundColor: theme.neon2,
              transform: [{ translateX: moveStripe }, { rotate: "-18deg" }],
              opacity: 0.48,
            }}
          />
        </View>
        <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, flexDirection: "row" }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={{ flex: 1, borderRightWidth: i === 9 ? 0 : 1, borderRightColor: "rgba(255,255,255,0.06)" }} />
          ))}
        </View>
      </View>
    </View>
  );
}

/* Modern To-Do Icon */

function MenuIcon({ theme, size = 20 }) {
  const s = size;
  const off = Math.max(3, Math.round(s * 0.16)); // lower the icon a bit more
  const line = (y) => ({
    position: "absolute",
    left: s * 0.22,
    right: s * 0.22,
    height: Math.max(3, Math.round(s * 0.14)),
    borderRadius: 999,
    backgroundColor: theme.text,
    top: y + off,
    opacity: 0.92,
  });
  const dot = (y) => ({
    position: "absolute",
    width: Math.max(4, Math.round(s * 0.18)),
    height: Math.max(4, Math.round(s * 0.18)),
    borderRadius: 999,
    backgroundColor: theme.gold,
    top: y + off - Math.round(s * 0.02),
    left: Math.round(s * 0.10),
    opacity: 0.95,
  });
  return (
    <View style={{ width: s, height: s }}>
      <View style={dot(Math.round(s * 0.18))} />
      <View style={dot(Math.round(s * 0.46))} />
      <View style={dot(Math.round(s * 0.74))} />
      <View style={line(Math.round(s * 0.18))} />
      <View style={line(Math.round(s * 0.46))} />
      <View style={line(Math.round(s * 0.74))} />
    </View>
  );
}


function TodoIcon({ theme, size = 22 }) {
  const s = size;
  const line = (h, wPct, op = 1) => (
    <View style={{ height: h, width: `${wPct}%`, borderRadius: 2, backgroundColor: theme.text, opacity: op }} />
  );
  return (
    <View
      style={{
        width: s,
        height: s,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.stroke,
        backgroundColor: "rgba(255,255,255,0.06)",
        padding: 4,
      }}
    >
      {line(2, 100, 0.85)}
      <View style={{ height: 3 }} />
      {line(2, 78, 0.65)}
      <View style={{ height: 3 }} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <View style={{ width: 6, height: 6, borderRadius: 2, backgroundColor: theme.gold, opacity: 0.95 }} />
        <View style={{ flex: 1, height: 2, borderRadius: 2, backgroundColor: theme.text, opacity: 0.55 }} />
      </View>
    </View>
  );
}

/* Ledger */
function LedgerDubaiFuturistic({ theme, t, S, shimmer, openCats, onAddIncome, onAddExpense, onAddGold, onDelete, smartTip, topExp }) {
  const [filterType, setFilterType] = useState("all");
  const [q, setQ] = useState("");

  // ✅ Month + Date categories (accordion)
  const [openMonthMap, setOpenMonthMap] = useState({});
  const [openDayMap, setOpenDayMap] = useState({});

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (S.txns || []).filter((tx) => {
      if (filterType !== "all" && tx.type !== filterType) return false;
      if (!qq) return true;
      return (
        (tx.category || "").toLowerCase().includes(qq) ||
        (tx.note || "").toLowerCase().includes(qq) ||
        (tx.currency || "").toLowerCase().includes(qq) ||
        (tx.asset || "").toLowerCase().includes(qq)
      );
    });
  }, [S.txns, filterType, q]);

  const monthGroups = useMemo(() => {
    const sorted = [...(list || [])].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    const monthMap = new Map(); // ym -> Map(ymd -> items)
    for (const tx of sorted) {
      const ymd = String(tx.at || "").slice(0, 10) || "unknown";
      const ym = ymd !== "unknown" ? ymd.slice(0, 7) : "unknown";
      if (!monthMap.has(ym)) monthMap.set(ym, new Map());
      const dayMap = monthMap.get(ym);
      if (!dayMap.has(ymd)) dayMap.set(ymd, []);
      dayMap.get(ymd).push(tx);
    }

    return Array.from(monthMap.entries()).map(([ym, dayMap]) => ({
      ym,
      days: Array.from(dayMap.entries()).map(([ymd, items]) => ({ ymd, items })),
    }));
  }, [list]);

  useEffect(() => {
    if (!monthGroups.length) return;

    const anyMonthOpen = Object.values(openMonthMap || {}).some(Boolean);
    if (!anyMonthOpen) {
      const firstMonth = monthGroups[0]?.ym;
      if (firstMonth) setOpenMonthMap((p) => ({ ...(p || {}), [firstMonth]: true }));
    }

    const anyDayOpen = Object.values(openDayMap || {}).some(Boolean);
    if (!anyDayOpen) {
      const firstDay = monthGroups[0]?.days?.[0]?.ymd;
      if (firstDay) setOpenDayMap((p) => ({ ...(p || {}), [firstDay]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthGroups.length]);

  function toggleMonth(ym) {
    setOpenMonthMap((p) => ({ ...(p || {}), [ym]: !p?.[ym] }));
  }
  function toggleDay(ymd) {
    setOpenDayMap((p) => ({ ...(p || {}), [ymd]: !p?.[ymd] }));
  }

  function monthLabel(ym) {
    if (ym === "unknown") return "Bilinmeyen Ay";
    const loc = S.lang === "EN" ? "en-US" : "tr-TR";
    try {
      return new Date(ym + "-01T00:00:00").toLocaleDateString(loc, { year: "numeric", month: "long" });
    } catch {
      return ym;
    }
  }

  function dayLabel(ymd) {
    const loc = S.lang === "EN" ? "en-US" : "tr-TR";
    try {
      return new Date(ymd + "T00:00:00").toLocaleDateString(loc, { weekday: "long", year: "numeric", month: "short", day: "numeric" });
    } catch {
      return ymd;
    }
  }

  const monthCount = useCallback((mg) => mg.days.reduce((a, d) => a + (d.items?.length || 0), 0), []);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ marginBottom: 10 }}>
        <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.stroke, overflow: "hidden" }}>
          <View style={{ padding: 14, backgroundColor: "rgba(255,255,255,0.10)" }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View>
                <Text style={{ color: theme.sub, marginTop: 2, fontWeight: "900", letterSpacing: 0.2 }}>Month • Day • Smart Search</Text>
              </View>
              <TouchableOpacity onPress={openCats}>
                <Text style={{ color: theme.gold, fontWeight: "900" }}>⚙ Kategoriler</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
              <GlowButtonDubaiShimmer theme={theme} kind="green" text="+ Gelir" onPress={onAddIncome} shimmer={shimmer} />
              <GlowButtonDubaiShimmer theme={theme} kind="orange" text="+ Gider" onPress={onAddExpense} shimmer={shimmer} />
            </View>

            <View style={{ marginTop: 10 }}>
              <TouchableOpacity onPress={onAddGold}>
                <View style={{ paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.16)", alignItems: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>🪙 {t.goldBuy}</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(0,0,0,0.18)" }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>{t.tips}</Text>
              <Text style={{ color: theme.sub, marginTop: 6 }}>
                En büyük gider: <Text style={{ color: theme.gold, fontWeight: "900" }}>{topExp?.k || "—"}</Text>
              </Text>
              <Text style={{ marginTop: 6, color: theme.sub }}>{smartTip}</Text>
            </View>

            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={`${t.search}: kategori / not / para / altın`}
              placeholderTextColor={theme.sub}
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: theme.stroke,
                color: theme.text,
                backgroundColor: "rgba(0,0,0,0.18)",
                fontWeight: "800",
              }}
            />

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <ToggleChip theme={theme} active={filterType === "all"} text="Hepsi" onPress={() => setFilterType("all")} />
              <ToggleChip theme={theme} active={filterType === "income"} text="Gelir" onPress={() => setFilterType("income")} />
              <ToggleChip theme={theme} active={filterType === "expense"} text="Gider" onPress={() => setFilterType("expense")} />
            </View>

            <View style={{ marginTop: 16, height: 2, backgroundColor: theme.neon, opacity: 0.35 }} />
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 10, paddingBottom: 20 }}>
        {monthGroups.map((mg) => {
          const mOpen = !!openMonthMap?.[mg.ym];
          const mTotal = monthCount(mg);
          return (
            <View key={mg.ym} style={{ marginBottom: 14 }}>
              <TouchableOpacity onPress={() => toggleMonth(mg.ym)} activeOpacity={0.85}>
                <View
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: mOpen ? theme.neon : theme.stroke,
                    backgroundColor: mOpen ? "rgba(70,217,255,0.10)" : "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: "900" }}>{monthLabel(mg.ym)}</Text>
                  <Text style={{ color: mOpen ? theme.neon : theme.sub, fontWeight: "900" }}>
                    {mTotal} {mOpen ? "▾" : "▸"}
                  </Text>
                </View>
              </TouchableOpacity>

              {mOpen && (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {mg.days.map((g) => {
                    const open = !!openDayMap?.[g.ymd];
                    return (
                      <View key={g.ymd} style={{ marginBottom: 4 }}>
                        <TouchableOpacity onPress={() => toggleDay(g.ymd)} activeOpacity={0.85}>
                          <View
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: open ? theme.gold : theme.stroke,
                              backgroundColor: open ? "rgba(255,209,112,0.10)" : "rgba(255,255,255,0.06)",
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: theme.text, fontWeight: "900" }}>{dayLabel(g.ymd)}</Text>
                            <Text style={{ color: open ? theme.gold : theme.sub, fontWeight: "900" }}>
                              {g.items.length} {open ? "▾" : "▸"}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {open && (
                          <View style={{ marginTop: 10, gap: 10 }}>
                            {g.items.map((item) => (
                              <DubaiTxnCard key={item.id} theme={theme} item={item} onDelete={() => onDelete(item.id)} />
                            ))}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {!monthGroups.length && (
          <GlassCard theme={theme} style={{ padding: 14 }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>Kayıt yok.</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>Gelir/Gider ekleyerek başlayabilirsin.</Text>
          </GlassCard>
        )}
      </ScrollView>
    </View>
  );
}

function DubaiTxnCard({ theme, item, onDelete }) {
  const isIncome = item.type === "income";
  const tint = isIncome ? theme.green : theme.orange;
  const sign = isIncome ? "+" : "-";
  const labelRight =
    item.asset === "GOLD" && Number.isFinite(item.grams)
      ? ` • ${fmtMoney(item.grams, 0)} g`
      : "";
  return (
    <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: theme.stroke }}>
      <View style={{ padding: 12, backgroundColor: "rgba(255,255,255,0.10)" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 15 }}>
              {isIncome ? "Gelir" : "Gider"} • {item.category || "Diğer"}{labelRight}
            </Text>
            <Text style={{ color: theme.sub, marginTop: 4, fontWeight: "800" }}>{new Date(item.at).toLocaleString()}</Text>
            {!!item.note && (
              <Text style={{ color: theme.sub, marginTop: 6 }} numberOfLines={2}>
                {item.note}
              </Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: tint, fontWeight: "900", fontSize: 18 }}>
              {sign}{fmtMoney(item.amount, 0)} {item.currency}
            </Text>
            <TouchableOpacity onPress={onDelete} style={{ marginTop: 10, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>Sil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <View style={{ height: 2, backgroundColor: tint, opacity: 0.7 }} />
    </View>
  );
}

/* Txn Modal: no GOLD currency */
function TxnModal({ open, theme, t, type, categories, amount, setAmount, currency, setCurrency, category, setCategory, note, setNote, useCustomDate, setUseCustomDate, dateText, setDateText, onClose, onSave }) {
  useEffect(() => { if (open && !category) setCategory(categories?.[0] || "Diğer"); }, [open]);

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{type === "income" ? "Gelir Ekle" : "Gider Ekle"}</Text>

          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder={t.amount}
            placeholderTextColor={theme.sub}
            style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900", fontSize: 18 }}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
            {["USD", "AED", "TL"].map((c) => (
              <ToggleChip key={c} theme={theme} active={currency === c} text={c} onPress={() => setCurrency(c)} />
            ))}
          </View>

          <Text style={{ marginTop: 12, color: theme.sub, fontWeight: "900" }}>{t.category}</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
            <View style={{ flexDirection: "row", gap: 10 }}>
              {((Array.isArray(categories) ? categories : [])).map((c) => (
                <ToggleChip key={c} theme={theme} active={category === c} text={c} onPress={() => setCategory(c)} />
              ))}
            </View>
          </ScrollView>

          <TextInput value={note} onChangeText={setNote} placeholder="Not (opsiyonel)" placeholderTextColor={theme.sub}
            style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
          />


          <View style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(255,255,255,0.05)" }}>
            <TouchableOpacity onPress={() => setUseCustomDate(!useCustomDate)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>📅 İstenilen tarihe ekle</Text>
              <Text style={{ color: theme.sub, fontWeight: "900" }}>{useCustomDate ? "Açık" : "Kapalı"}</Text>
            </TouchableOpacity>
            {useCustomDate && (
              <TextInput
                value={dateText}
                onChangeText={setDateText}
                placeholder="YYYY-MM-DD  (opsiyonel: HH:MM)"
                placeholderTextColor={theme.sub}
                style={{ marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
              />
            )}
          </View>

          <RowButtons theme={theme} left={t.cancel} right={t.save} onLeft={onClose} onRight={onSave} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* Gold gram modal */
function GoldGramModal({ open, theme, t, grams, setGrams, goldGramTl, usdToTl, useCustomDate, setUseCustomDate, dateText, setDateText, onClose, onSave }) {
  const g = toInt(grams);
  const tlValue = goldGramTl && g > 0 ? Math.round(g * goldGramTl) : 0;
  const usdValue = usdToTl && tlValue > 0 ? Math.round(tlValue / usdToTl) : 0;

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>🪙 {t.goldBuy}</Text>
          <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "900" }}>Etiket: <Text style={{ color: theme.gold }}>Gram</Text></Text>

          <TextInput
            value={grams}
            onChangeText={setGrams}
            keyboardType="numeric"
            placeholder="Örn: 5"
            placeholderTextColor={theme.sub}
            style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900", fontSize: 18 }}
          />

          <View style={{ marginTop: 10, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(0,0,0,0.18)" }}>
            <Text style={{ color: theme.sub, fontWeight: "900" }}>
              TL değeri: <Text style={{ color: theme.gold, fontWeight: "900" }}>{tlValue ? fmtMoney(tlValue, 0) : "—"} TL</Text>
              {"  "}•{"  "}
              USD değeri: <Text style={{ color: theme.gold, fontWeight: "900" }}>{usdValue ? `$${fmtMoney(usdValue, 0)}` : "—"}</Text>
            </Text>
          </View>

          
          <View style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(255,255,255,0.05)" }}>
            <TouchableOpacity onPress={() => setUseCustomDate(!useCustomDate)} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>📅 İstenilen tarihe ekle</Text>
              <Text style={{ color: theme.sub, fontWeight: "900" }}>{useCustomDate ? "Açık" : "Kapalı"}</Text>
            </TouchableOpacity>
            {useCustomDate && (
              <TextInput
                value={dateText}
                onChangeText={setDateText}
                placeholder="YYYY-MM-DD  (opsiyonel: HH:MM)"
                placeholderTextColor={theme.sub}
                style={{ marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
              />
            )}
          </View>

<RowButtons theme={theme} left={t.cancel} right={t.save} onLeft={onClose} onRight={onSave} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NotesPro({ theme, t, notes, allTags, query, setQuery, tagFilter, setTagFilter, onAdd, onEdit, onDelete }) {
  return (
    <View style={{ flex: 1 }}>
      <GlassCard theme={theme} style={{ padding: 14, marginBottom: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Notlar • PRO</Text>
          <TouchableOpacity onPress={onAdd}>
            <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.18)" }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>{t.addNote}</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`${t.search}: başlık / içerik / etiket`}
          placeholderTextColor={theme.sub}
          style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {allTags.map((tg) => (
              <ToggleChip key={tg} theme={theme} active={tagFilter === tg} text={tg} onPress={() => setTagFilter(tg)} />
            ))}
          </View>
        </ScrollView>
      </GlassCard>

      <FlatList
        data={notes}
        keyExtractor={(it) => it.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 10 }}>
            <GlassCard theme={theme} style={{ padding: 12 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View style={{ flex: 1, paddingRight: 10 }}>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <Text style={{ color: theme.sub, marginTop: 4, fontWeight: "900" }}>
                    #{item.tag || "Genel"} • {new Date(item.at).toLocaleString()}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => onEdit(item)}>
                  <Chip theme={theme} text={t.edit} />
                </TouchableOpacity>
              </View>

              {!!item.body && (
                <Text style={{ color: theme.sub, marginTop: 10 }} numberOfLines={3}>
                  {item.body}
                </Text>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 12, alignItems: "center" }}>
                <Text style={{ color: theme.sub, fontWeight: "900" }}>
                  ✅ {((item.checklist || []).filter((x) => x.done).length)}/{(item.checklist || []).length}
                </Text>
                <Text style={{ color: theme.sub, fontWeight: "900" }}>🖼 {(item.photos || []).length}</Text>
                <View style={{ flex: 1 }} />
                <TouchableOpacity onPress={() => onDelete(item.id)}>
                  <Text style={{ color: theme.red, fontWeight: "900" }}>Sil</Text>
                </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        )}
        ListEmptyComponent={
          <GlassCard theme={theme} style={{ padding: 14 }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>Not bulunamadı.</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>Yeni not eklemek için “NOT EKLE”.</Text>
          </GlassCard>
        }
      />
    </View>
  );
}

function TodoPro({ theme, t, query, setQuery, filter, setFilter, text, setText, tag, setTag, list, onAdd, onToggle, onDelete }) {
  const stats = useMemo(() => {
    const total = list.length;
    const done = list.filter((x) => x.done).length;
    const pending = total - done;
    return { total, done, pending };
  }, [list]);

  return (
    <View style={{ flex: 1 }}>
      <GlassCard theme={theme} style={{ padding: 14, marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <TodoIcon theme={theme} size={22} />
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.todoTitle}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <ToggleChip theme={theme} active={filter === "all"} text={`${t.all} • ${stats.total}`} onPress={() => setFilter("all")} />
          <ToggleChip theme={theme} active={filter === "pending"} text={`${t.pending} • ${stats.pending}`} onPress={() => setFilter("pending")} />
          <ToggleChip theme={theme} active={filter === "done"} text={`${t.done} • ${stats.done}`} onPress={() => setFilter("done")} />
        </View>

        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={`${t.search}: görev / etiket`}
          placeholderTextColor={theme.sub}
          style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
        />

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t.taskPlaceholder}
          placeholderTextColor={theme.sub}
          style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "900" }}
        />
        <TextInput
          value={tag}
          onChangeText={setTag}
          placeholder={t.tagPlaceholder}
          placeholderTextColor={theme.sub}
          style={{ marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
        />

        <TouchableOpacity onPress={onAdd} style={{ marginTop: 12 }}>
          <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.20)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>➕ {t.addTask}</Text>
          </View>
        </TouchableOpacity>
      </GlassCard>

      <FlatList
        data={list}
        keyExtractor={(it) => it.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <View style={{ marginBottom: 10 }}>
            <View style={{ borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: theme.stroke }}>
              <View style={{ padding: 12, backgroundColor: "rgba(255,255,255,0.10)" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <TouchableOpacity onPress={() => onToggle(item.id)} style={{ marginRight: 10 }}>
                    <Text style={{ fontSize: 18 }}>{item.done ? "✅" : "⬜️"}</Text>
                  </TouchableOpacity>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: item.done ? theme.green : theme.text, fontWeight: "900" }} numberOfLines={2}>
                      {item.text}
                    </Text>
                    {!!item.tag && (
                      <Text style={{ marginTop: 4, color: theme.sub, fontWeight: "900" }}>#{item.tag}</Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => onDelete(item.id)}>
                    <Text style={{ color: theme.red, fontWeight: "900" }}>Sil</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ height: 2, backgroundColor: item.done ? theme.green : theme.orange, opacity: 0.7 }} />
            </View>
          </View>
        )}
        ListEmptyComponent={
          <GlassCard theme={theme} style={{ padding: 14 }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>Liste boş.</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>Yeni görev ekleyebilirsin.</Text>
          </GlassCard>
        }
      />
    </View>
  );
}

function BuyProfitScreen({
  theme,
  t,
  S,
  buyAsset,
  setBuyAsset,
  buyTL,
  onBuyTLChange,
  buyQty,
  onBuyQtyChange,
  calcBuy,
  onRecordBuy,
  onRefreshPrices,
  buyFilter,
  setBuyFilter,
  list,
  summary,
  onDeleteBuy,
  shimmer,
}) {
  const canPrices = (S.usdToTl || 0) > 0 && (buyAsset === "USD" || (S.goldGramTl || 0) > 0);

  const filtered = useMemo(() => {
    const base = [...(list || [])];
    const f = buyFilter === "ALL" ? base : base.filter((x) => x.asset === buyFilter);
    return f.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [list, buyFilter]);

  // ✅ Monthly -> Daily categories (accordion)
  const [openMonthMap, setOpenMonthMap] = useState({});
  const [openDayMap, setOpenDayMap] = useState({});

  const monthGroups = useMemo(() => {
    const byMonth = new Map(); // ym -> Map(ymd -> items)
    for (const it of filtered) {
      const at = String(it.at || "");
      const ymd = at.slice(0, 10) || "unknown";
      const ym = ymd.slice(0, 7) || "unknown";
      if (!byMonth.has(ym)) byMonth.set(ym, new Map());
      const byDay = byMonth.get(ym);
      if (!byDay.has(ymd)) byDay.set(ymd, []);
      byDay.get(ymd).push(it);
    }
    const months = Array.from(byMonth.entries())
      .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
      .map(([ym, dayMap]) => {
        const days = Array.from(dayMap.entries())
          .sort((a, b) => String(b[0]).localeCompare(String(a[0])))
          .map(([ymd, items]) => ({ ymd, items }));
        return { ym, days };
      });
    return months;
  }, [filtered]);

  useEffect(() => {
    if (!monthGroups.length) return;
    const anyOpen = Object.values(openMonthMap || {}).some(Boolean);
    if (!anyOpen) {
      setOpenMonthMap((p) => ({ ...(p || {}), [monthGroups[0].ym]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthGroups.length]);

  const toggleMonth = useCallback((ym) => {
    setOpenMonthMap((p) => ({ ...(p || {}), [ym]: !p?.[ym] }));
  }, []);

  const toggleDay = useCallback((ymd) => {
    setOpenDayMap((p) => ({ ...(p || {}), [ymd]: !p?.[ymd] }));
  }, []);

  function monthLabel(ym) {
    const loc = S.lang === "EN" ? "en-US" : "tr-TR";
    try {
      return new Date(ym + "-01T00:00:00").toLocaleDateString(loc, { year: "numeric", month: "long" });
    } catch {
      return ym;
    }
  }

  function dayLabel(ymd) {
    const loc = S.lang === "EN" ? "en-US" : "tr-TR";
    try {
      return new Date(ymd + "T00:00:00").toLocaleDateString(loc, { weekday: "long", year: "numeric", month: "short", day: "numeric" });
    } catch {
      return ymd;
    }
  }

  const monthCount = useCallback((mg) => mg.days.reduce((a, d) => a + (d.items?.length || 0), 0), []);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
      <GlassCard theme={theme} style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.buyProfit}</Text>
          <TouchableOpacity onPress={onRefreshPrices}>
            <Text style={{ color: theme.gold, fontWeight: "900" }}>↻ Fiyatları Yenile</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: theme.sub, marginTop: 8, fontWeight: "900" }}>
          USD/TL: <Text style={{ color: theme.gold }}>{fmtMoney(S.usdToTl || 0, 2)} TL</Text> • Gram:{" "}
          <Text style={{ color: theme.gold }}>{fmtMoney(S.goldGramTl || 0, 2)} TL</Text>
        </Text>

        <View style={{ marginTop: 12, height: 1, backgroundColor: theme.stroke, opacity: 0.65 }} />

        <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>Alım Türü</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
          <ToggleChip theme={theme} active={buyAsset === "USD"} text="USD" onPress={() => setBuyAsset("USD")} />
          <ToggleChip theme={theme} active={buyAsset === "GOLD"} text="ALTIN" onPress={() => setBuyAsset("GOLD")} />
        </View>

        <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>TL (Harcanan)</Text>
        <TextInput value={buyTL} onChangeText={onBuyTLChange} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.sub} style={inp(theme)} />

        <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>{buyAsset === "USD" ? "USD Miktar" : "Gram"}</Text>
        <TextInput value={buyQty} onChangeText={onBuyQtyChange} keyboardType="numeric" placeholder="0" placeholderTextColor={theme.sub} style={inp(theme)} />

        <View style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(0,0,0,0.18)" }}>
          <Text style={{ color: theme.text, fontWeight: "900" }}>Hesap</Text>
          <Text style={{ color: theme.sub, marginTop: 6 }}>
            Kur: <Text style={{ color: theme.gold, fontWeight: "900" }}>{fmtMoney(calcBuy.rate || 0, 2)} TL</Text>
          </Text>
          <Text style={{ color: theme.sub, marginTop: 6 }}>
            Sonuç:{" "}
            <Text style={{ color: theme.gold, fontWeight: "900" }}>
              {fmtMoney(calcBuy.tlUsed || 0, 2)} TL → {fmtMoney(calcBuy.qtyUsed || 0, 2)} {buyAsset === "USD" ? "USD" : "g"}
            </Text>
          </Text>


          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <GlowButtonDubaiShimmer theme={theme} kind={canPrices && calcBuy.valid ? "green" : "gray"} text="🪙  Alım Kaydet" textSize={18} onPress={onRecordBuy} shimmer={shimmer} />
          </View>

          <Text style={{ color: theme.sub, marginTop: 10 }}>
            Filtre:{" "}
            <Text style={{ color: theme.gold, fontWeight: "900" }}>
              {buyFilter === "ALL" ? "HEPSİ" : buyFilter === "USD" ? "USD" : "ALTIN"}
            </Text>
          </Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            <ToggleChip theme={theme} active={buyFilter === "ALL"} text="HEPSİ" onPress={() => setBuyFilter("ALL")} />
            <ToggleChip theme={theme} active={buyFilter === "USD"} text="USD" onPress={() => setBuyFilter("USD")} />
            <ToggleChip theme={theme} active={buyFilter === "GOLD"} text="ALTIN" onPress={() => setBuyFilter("GOLD")} />
          </View>
        </View>
      </GlassCard>

      <View style={{ marginTop: 12 }}>
        {monthGroups.map((mg) => {
          const mOpen = !!openMonthMap?.[mg.ym];
          const mTotal = monthCount(mg);
          return (
            <View key={mg.ym} style={{ marginBottom: 14 }}>
              <TouchableOpacity onPress={() => toggleMonth(mg.ym)} activeOpacity={0.85}>
                <View
                  style={{
                    paddingVertical: 12,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: mOpen ? theme.neon : theme.stroke,
                    backgroundColor: mOpen ? "rgba(70,217,255,0.10)" : "rgba(255,255,255,0.06)",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: "900" }}>{monthLabel(mg.ym)}</Text>
                  <Text style={{ color: mOpen ? theme.neon : theme.sub, fontWeight: "900" }}>
                    {mTotal} {mOpen ? "▾" : "▸"}
                  </Text>
                </View>
              </TouchableOpacity>

              {mOpen && (
                <View style={{ marginTop: 10, gap: 10 }}>
                  {mg.days.map((g) => {
                    const open = !!openDayMap?.[g.ymd];
                    return (
                      <View key={g.ymd} style={{ marginBottom: 4 }}>
                        <TouchableOpacity onPress={() => toggleDay(g.ymd)} activeOpacity={0.85}>
                          <View
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 16,
                              borderWidth: 1,
                              borderColor: open ? theme.gold : theme.stroke,
                              backgroundColor: open ? "rgba(255,209,112,0.10)" : "rgba(255,255,255,0.06)",
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "center",
                            }}
                          >
                            <Text style={{ color: theme.text, fontWeight: "900" }}>{dayLabel(g.ymd)}</Text>
                            <Text style={{ color: open ? theme.gold : theme.sub, fontWeight: "900" }}>
                              {g.items.length} {open ? "▾" : "▸"}
                            </Text>
                          </View>
                        </TouchableOpacity>

                        {open && (
                          <View style={{ marginTop: 10, gap: 10 }}>
                            {g.items.map((item) => {
                              const valueNow =
                                item.asset === "USD"
                                  ? Number(item.qty || 0) * (S.usdToTl || 0)
                                  : Number(item.qty || 0) * (S.goldGramTl || 0);
                              const profit = valueNow - Number(item.tlSpent || 0);
                              return (
                                <GlassCard key={item.id} theme={theme} style={{ padding: 12 }}>
                                  <Text style={{ color: theme.text, fontWeight: "900" }}>
                                    {item.asset === "USD" ? "USD Alımı" : "Altın Alımı"} • {new Date(item.at).toLocaleString()}
                                  </Text>
                                  <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "900" }}>
                                    TL: {fmtMoney(item.tlSpent, 0)} • Miktar: {item.asset === "USD" ? `${fmtMoney(item.qty, 0)} USD` : `${fmtMoney(item.qty, 0)} g`}
                                  </Text>
                                  <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "900" }}>
                                    Şu an değeri: <Text style={{ color: theme.gold, fontWeight: "900" }}>{fmtMoney(valueNow, 0)} TL</Text>
                                  </Text>
                                  <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "900" }}>
                                    Kâr/Zarar:{" "}
                                    <Text style={{ color: profit >= 0 ? theme.green : theme.red, fontWeight: "900" }}>
                                      {profit >= 0 ? "+" : "-"}
                                      {fmtMoney(Math.abs(profit), 0)} TL
                                    </Text>
                                  </Text>

                                  <TouchableOpacity onPress={() => onDeleteBuy(item.id)} style={{ marginTop: 10 }}>
                                    <Text style={{ color: theme.red, fontWeight: "900" }}>Sil</Text>
                                  </TouchableOpacity>
                                </GlassCard>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        {!monthGroups.length && (
          <GlassCard theme={theme} style={{ padding: 14 }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>Henüz kayıt yok.</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>TL gir → USD/Altın seç → “Aldım”.</Text>
          </GlassCard>
        )}
      </View>
    </ScrollView>
  );
}

function NewsScreen({ theme, t, S, setPatch, onRefresh, list, onOpen }) {
  const chips = [
    { key: "ALL", label: t.all },
    { key: "AI", label: t.aiOnly },
    { key: "GAMING", label: t.gaming },
    { key: "MOBILE", label: t.mobile },
    { key: "HARDWARE", label: t.hardware },
    { key: "SCIENCE", label: t.science },
    { key: "SAVED", label: t.saved },
  ];
  return (
    <View style={{ flex: 1 }}>
      <GlassCard theme={theme} style={{ padding: 14, marginBottom: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.news}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={{ color: theme.gold, fontWeight: "900" }}>{t.refresh}</Text>
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          <View style={{ flexDirection: "row", gap: 10 }}>
            {chips.map((c) => (
              <ToggleChip
                key={c.key}
                theme={theme}
                active={S.newsFilter === c.key}
                text={c.label}
                onPress={() => setPatch({ newsFilter: c.key })}
              />
            ))}
          </View>
        </ScrollView>
      </GlassCard>

      <FlatList
        data={list}
        keyExtractor={(it) => it.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 20 }}
        renderItem={({ item }) => (
          <TouchableOpacity onPress={() => onOpen(item)} style={{ marginBottom: 10 }}>
            <GlassCard theme={theme} style={{ padding: 12 }}>
              <Text style={{ color: theme.text, fontWeight: "900" }} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
                {item.pubDate} • {item.kind || "ALL"}
              </Text>
              <Text style={{ color: theme.sub, marginTop: 8 }} numberOfLines={2}>
                {stripHtml(item.content).slice(0, 180)}
              </Text>
              <Text style={{ color: theme.gold, marginTop: 10, fontWeight: "900" }}>Detay</Text>
            </GlassCard>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <GlassCard theme={theme} style={{ padding: 14 }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>Haber yok / yükleniyor…</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>Yenile’ye bas.</Text>
          </GlassCard>
        }
      />
    </View>
  );
}

function WeatherCard({ theme, t, weather, lastISO, onRefresh }) {
  return (
    <View style={{ borderRadius: 18, borderWidth: 1, borderColor: theme.stroke, overflow: "hidden" }}>
      <View style={{ padding: 14, backgroundColor: theme.hud }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.weather}</Text>
          <TouchableOpacity onPress={onRefresh}>
            <Text style={{ color: theme.gold, fontWeight: "900" }}>{t.refresh}</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800", fontSize: 12 }}>
          {lastISO ? `${t.updated}: ${new Date(lastISO).toLocaleTimeString()}` : "Saatlik otomatik yenilenir"}
        </Text>

        {!weather && <Text style={{ marginTop: 10, color: theme.sub }}>Yükleniyor…</Text>}

        {!!weather && (
          <View style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ fontSize: 28, marginRight: 10 }}>{codeToEmoji(weather.current?.code)}</Text>
                <View>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 22 }}>{fmtMoney(weather.current?.temp, 0)}°C</Text>
                  <Text style={{ color: theme.sub, fontWeight: "800", marginTop: 4 }}>
                    Rüzgar: {fmtMoney(weather.current?.wind, 0)} km/h
                  </Text>
                </View>
              </View>
              <Text style={{ color: theme.sub, fontWeight: "800" }}>Saatlik</Text>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
              {(weather.next || []).map((h) => (
                <View key={h.t} style={{ width: 86, padding: 10, marginRight: 10, borderRadius: 16, backgroundColor: theme.glass, borderWidth: 1, borderColor: theme.stroke }}>
                  <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>{String(h.t).slice(11, 16)}</Text>
                  <Text style={{ fontSize: 18, marginTop: 6 }}>{codeToEmoji(h.code)}</Text>
                  <Text style={{ color: theme.text, fontWeight: "900", marginTop: 6 }}>{fmtMoney(h.temp, 0)}°C</Text>
                  <Text style={{ color: theme.sub, marginTop: 4, fontSize: 11 }}>💨 {fmtMoney(h.wind, 0)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}
      </View>
    </View>
  );
}

function TrendBars({ theme, bars }) {
  const max = Math.max(...bars.map((b) => b.v), 1);
  return (
    <View style={{ marginTop: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 110, gap: 4 }}>
        {bars.map((b) => {
          const h = (b.v / max) * 110;
          return (
            <View key={b.k} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
              <View
                style={{
                  width: "100%",
                  height: h,
                  borderRadius: 8,
                  backgroundColor: b.kind === "income" ? "rgba(123,255,178,0.55)" : "rgba(255,179,92,0.55)",
                  borderWidth: 1,
                  borderColor: theme.stroke,
                }}
              />
              <Text style={{ color: theme.sub, fontSize: 10, marginTop: 6 }} numberOfLines={1}>
                {b.day}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function SettingsPro({ theme, t, S, setPatch, onPickTheme, onOpenTargets, onRefreshFx, onRefreshWeather, onRefreshGold, onReset, onOpenSaveLoad }) {
  const themesByCat = useMemo(() => {
    const map = {};
    for (const k of Object.keys(THEME_PRESETS)) {
      const th = THEME_PRESETS[k];
      map[th.cat] = map[th.cat] || [];
      map[th.cat].push(th);
    }
    return map;
  }, []);

  // Minimal accordion for theme categories
  const [openThemeCats, setOpenThemeCats] = useState({});
  useEffect(() => {
    if (!THEME_CATEGORIES?.length) return;
    const any = Object.values(openThemeCats || {}).some(Boolean);
    if (!any) setOpenThemeCats({ [THEME_CATEGORIES[0].key]: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [THEME_CATEGORIES.length]);

  const toggleThemeCat = useCallback((key) => {
    setOpenThemeCats((p) => ({ ...(p || {}), [key]: !p?.[key] }));
  }, []);

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
      <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>{t.settings}</Text>

      <GlassCard theme={theme} style={{ padding: 14, marginTop: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.targetPlan}</Text>
        <TouchableOpacity onPress={onOpenTargets} style={{ marginTop: 10 }}>
          <Text style={{ color: theme.gold, fontWeight: "900" }}>{t.openTargetPlan}</Text>
        </TouchableOpacity>
      </GlassCard>

      {/* ✅ Save/Load card */}
      <GlassCard theme={theme} style={{ padding: 14, marginTop: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.saveLoad}</Text>
        <Text style={{ color: theme.sub, marginTop: 6 }}>
          Local Storage + Çoklu Save slot + Backup Code.
        </Text>
        <TouchableOpacity onPress={onOpenSaveLoad} style={{ marginTop: 10 }}>
          <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.20)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>⚡ {t.saveLoad}</Text>
          </View>
        </TouchableOpacity>
        {!IS_WEB && (
          <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontWeight: "800", fontSize: 12 }}>
            {t.noWebFile}
          </Text>
        )}
      </GlassCard>

      <GlassCard theme={theme} style={{ padding: 14, marginTop: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.themes}</Text>
          <Text style={{ color: "rgba(255,255,255,0.55)", fontWeight: "900", fontSize: 12 }}>10</Text>
        </View>
        <Text style={{ color: theme.sub, marginTop: 6 }}>Minimal kategori • Aç/Kapat.</Text>

        {THEME_CATEGORIES.map((c) => {
          const arr = themesByCat[c.key] || [];
          if (arr.length === 0) return null;
          const open = !!openThemeCats?.[c.key];
          return (
            <View key={c.key} style={{ marginTop: 10 }}>
              <TouchableOpacity onPress={() => toggleThemeCat(c.key)} activeOpacity={0.85}>
                <View
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: open ? theme.gold : theme.stroke,
                    backgroundColor: open ? "rgba(255,209,112,0.10)" : "rgba(255,255,255,0.05)",
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: theme.text, fontWeight: "900" }}>{c.title}</Text>
                  <Text style={{ color: open ? theme.gold : theme.sub, fontWeight: "900" }}>
                    {arr.length} {open ? "▾" : "▸"}
                  </Text>
                </View>
              </TouchableOpacity>

              {open && (
                <View style={{ marginTop: 8, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
                  {arr.map((th, idx) => {
                    const selected = th.key === S.themeKey;
                    return (
                      <TouchableOpacity
                        key={th.key}
                        onPress={() => onPickTheme(th.key)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          backgroundColor: selected ? "rgba(255,209,112,0.14)" : "transparent",
                          borderTopWidth: idx === 0 ? 0 : 1,
                          borderTopColor: theme.stroke,
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                          <View
                            style={{
                              width: 34,
                              height: 34,
                              borderRadius: 14,
                              backgroundColor: th.orb,
                              borderWidth: 1,
                              borderColor: selected ? theme.gold : theme.stroke,
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: th.gold }} />
                          </View>

                          <View>
                            <Text style={{ color: theme.text, fontWeight: "900" }}>{th.name}</Text>
                            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: th.gold }} />
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: th.neon }} />
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: th.green }} />
                              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: th.orange }} />
                            </View>
                          </View>
                        </View>

                        <Text style={{ color: selected ? theme.gold : theme.sub, fontWeight: "900", fontSize: 16 }}>
                          {selected ? "✓" : "›"}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}
      </GlassCard>

      <GlassCard theme={theme} style={{ padding: 14, marginTop: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Yenile</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <ToggleChip theme={theme} active={false} text="Kur (USD→TL)" onPress={onRefreshFx} />
          <ToggleChip theme={theme} active={false} text="Hava" onPress={onRefreshWeather} />
          <ToggleChip theme={theme} active={false} text="Altın" onPress={onRefreshGold} />
        </View>
        <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontWeight: "800", fontSize: 12 }}>
          Otomatik kur yenileme: 3 sn
        </Text>
      </GlassCard>

      <GlassCard theme={theme} style={{ padding: 14, marginTop: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 20 }}>Veri</Text>
        <Text style={{ color: theme.sub, marginTop: 6 }}>
          Bu sürümde ekstra paket yok (tamamen tek dosya).
        </Text>
        <TouchableOpacity onPress={onReset} style={{ marginTop: 10 }}>
          <Text style={{ color: theme.red, fontWeight: "900" }}>Tüm verileri sıfırla (hedef hariç)</Text>
        </TouchableOpacity>
      </GlassCard>
    </ScrollView>
  );
}

// -------------------- Masraflar Listesi --------------------
function usdEq(amount, currency, usdToAed, usdToTl) {
  const a = Number(amount || 0);
  if (!isFinite(a) || a <= 0) return 0;
  if (currency === "USD") return a;
  if (currency === "AED") return usdToAed ? a / usdToAed : 0;
  if (currency === "TL") return usdToTl ? a / usdToTl : 0;
  return 0;
}

function ExpensesListScreen({ theme, S, onUpsert, onDelete, onTogglePaid }) {
  const [phase, setPhase] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [q, setQ] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const list = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return (S.expenses || [])
      .filter((x) => (phase === "ALL" ? true : x.phase === phase))
      .filter((x) => (status === "ALL" ? true : x.status === status))
      .filter((x) => {
        if (!qq) return true;
        return (
          (x.title || "").toLowerCase().includes(qq) ||
          (x.cat || "").toLowerCase().includes(qq) ||
          (x.note || "").toLowerCase().includes(qq)
        );
      })
      .sort((a, b) => {
        const ad = a.dueISO ? new Date(a.dueISO).getTime() : 9e15;
        const bd = b.dueISO ? new Date(b.dueISO).getTime() : 9e15;
        if (ad !== bd) return ad - bd;
        return new Date(b.updatedISO || b.createdISO || 0).getTime() - new Date(a.updatedISO || a.createdISO || 0).getTime();
      });
  }, [S.expenses, phase, status, q]);

  const totals = useMemo(() => {
    const all = (S.expenses || []).filter((x) => (x.amount || 0) > 0);
    const pre = all.filter((x) => x.phase === "PRE");
    const m1 = all.filter((x) => x.phase === "MONTH1");
    const sum = (arr) => arr.reduce((a, x) => a + usdEq(x.amount, x.currency, S.usdToAed, S.usdToTl), 0);
    return { all: sum(all), pre: sum(pre), m1: sum(m1) };
  }, [S.expenses, S.usdToAed, S.usdToTl]);

  const PhaseChip = ({ k, label }) => <ToggleChip theme={theme} active={phase === k} text={label} onPress={() => setPhase(k)} />;
  const StatusChip = ({ k, label }) => <ToggleChip theme={theme} active={status === k} text={label} onPress={() => setStatus(k)} />;

  const openNew = () => {
    setEditItem({ id: null, title: "", phase: "PRE", cat: "Genel", currency: "AED", amount: "", dueISO: "", note: "", status: "PLANNED" });
    setEditOpen(true);
  };
  const openEdit = (it) => {
    setEditItem({ ...it, amount: String(it.amount ?? "") });
    setEditOpen(true);
  };
  const save = () => {
    if (!editItem) return;
    if (!String(editItem.title || "").trim()) {
      Alert.alert("Eksik bilgi", "Başlık boş olamaz.");
      return;
    }
    const amt = Math.max(0, Math.round(Number(String(editItem.amount || "0").replace(/[^0-9]/g, "")) || 0));
    onUpsert({ ...editItem, amount: amt });
    setEditOpen(false);
  };

  const fmtPhase = (p) => (p === "PRE" ? "Dubai'ye Kadar" : "Dubai İlk Ay");

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
      <GlassCard theme={theme} style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>🧾 Masraflar Listesi</Text>
            <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800" }}>Dubai'ye kadar + Dubai ilk ay bütçe kontrolü.</Text>
          </View>
          <TouchableOpacity onPress={openNew}>
            <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.14)" }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>+ Ekle</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
          <Text style={{ color: theme.sub, fontWeight: "900" }}>Toplam (USD eşdeğeri)</Text>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 22, marginTop: 6 }}>${fmtMoney(totals.all, 0)}</Text>
          <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "900" }}>
            Dubai'ye kadar: <Text style={{ color: theme.gold }}>${fmtMoney(totals.pre, 0)}</Text> • İlk ay: <Text style={{ color: theme.gold }}>${fmtMoney(totals.m1, 0)}</Text>
          </Text>
        </View>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Ara: başlık / kategori / not"
          placeholderTextColor={theme.sub}
          style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
        />

        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <PhaseChip k="ALL" label="Hepsi" />
          <PhaseChip k="PRE" label="Dubai'ye Kadar" />
          <PhaseChip k="MONTH1" label="İlk Ay" />
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <StatusChip k="ALL" label="Tümü" />
          <StatusChip k="PLANNED" label="Plan" />
          <StatusChip k="PAID" label="Ödendi" />
        </View>
      </GlassCard>

      {(list || []).map((it) => (
        <TouchableOpacity key={it.id} onPress={() => openEdit(it)} style={{ marginTop: 10 }}>
          <GlassCard theme={theme} style={{ padding: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontWeight: "900", fontSize: 15 }}>{it.title}</Text>
                <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800" }}>
                  {fmtPhase(it.phase)} • {it.cat || "Genel"}{it.dueISO ? ` • ${String(it.dueISO).slice(0, 10)}` : ""}
                </Text>
                {!!it.note && (
                  <Text numberOfLines={2} style={{ color: "rgba(255,255,255,0.62)", marginTop: 6, fontWeight: "800" }}>{it.note}</Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{it.amount ? `${fmtMoney(it.amount, 0)} ${it.currency}` : "—"}</Text>
                <TouchableOpacity
                  onPress={() => onTogglePaid(it.id)}
                  style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 14, borderWidth: 1, borderColor: it.status === "PAID" ? theme.green : theme.stroke, backgroundColor: it.status === "PAID" ? "rgba(34,197,94,0.16)" : theme.glass2 }}
                >
                  <Text style={{ color: it.status === "PAID" ? theme.green : theme.sub, fontWeight: "900" }}>{it.status === "PAID" ? "✅ Ödendi" : "🕒 Plan"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassCard>
        </TouchableOpacity>
      ))}

      <Modal transparent visible={editOpen} animationType="fade" onRequestClose={() => setEditOpen(false)}>
        <Pressable onPress={() => setEditOpen(false)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", padding: 14, justifyContent: "center" }}>
          <Pressable onPress={() => {}} style={{ borderRadius: 22, borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(10,16,24,0.97)", padding: 14 }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{editItem?.id ? "Masrafı Düzenle" : "Yeni Masraf"}</Text>
            <View style={{ height: 10 }} />

            <TextInput
              value={editItem?.title || ""}
              onChangeText={(v) => setEditItem((p) => ({ ...p, title: v }))}
              placeholder="Başlık"
              placeholderTextColor={theme.sub}
              style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
            />
            <View style={{ height: 10 }} />

            <View style={{ flexDirection: "row", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <TextInput
                  value={editItem?.cat || ""}
                  onChangeText={(v) => setEditItem((p) => ({ ...p, cat: v }))}
                  placeholder="Kategori"
                  placeholderTextColor={theme.sub}
                  style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
                />
              </View>
              <View style={{ width: 110 }}>
                <TextInput
                  value={String(editItem?.amount ?? "")}
                  onChangeText={(v) => setEditItem((p) => ({ ...p, amount: v.replace(/[^0-9]/g, "") }))}
                  placeholder="Tutar"
                  keyboardType="numeric"
                  placeholderTextColor={theme.sub}
                  style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
                />
              </View>
            </View>

            <View style={{ height: 10 }} />
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <ToggleChip theme={theme} active={editItem?.phase === "PRE"} text="Dubai'ye Kadar" onPress={() => setEditItem((p) => ({ ...p, phase: "PRE" }))} />
              <ToggleChip theme={theme} active={editItem?.phase === "MONTH1"} text="Dubai İlk Ay" onPress={() => setEditItem((p) => ({ ...p, phase: "MONTH1" }))} />
            </View>
            <View style={{ height: 10 }} />
            <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
              <ToggleChip theme={theme} active={editItem?.currency === "AED"} text="AED" onPress={() => setEditItem((p) => ({ ...p, currency: "AED" }))} />
              <ToggleChip theme={theme} active={editItem?.currency === "USD"} text="USD" onPress={() => setEditItem((p) => ({ ...p, currency: "USD" }))} />
              <ToggleChip theme={theme} active={editItem?.currency === "TL"} text="TL" onPress={() => setEditItem((p) => ({ ...p, currency: "TL" }))} />
            </View>
            <View style={{ height: 10 }} />

            <TextInput
              value={editItem?.dueISO || ""}
              onChangeText={(v) => setEditItem((p) => ({ ...p, dueISO: v }))}
              placeholder="Tarih (opsiyonel): YYYY-MM-DD"
              placeholderTextColor={theme.sub}
              style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
            />
            <View style={{ height: 10 }} />

            <TextInput
              value={editItem?.note || ""}
              onChangeText={(v) => setEditItem((p) => ({ ...p, note: v }))}
              placeholder="Not (opsiyonel)"
              placeholderTextColor={theme.sub}
              multiline
              style={{ minHeight: 70, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
            />

            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 12, gap: 10 }}>
              <TouchableOpacity onPress={() => setEditOpen(false)} style={{ flex: 1 }}>
                <View style={{ paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2, alignItems: "center" }}>
                  <Text style={{ color: theme.sub, fontWeight: "900" }}>Kapat</Text>
                </View>
              </TouchableOpacity>
              {!!editItem?.id && (
                <TouchableOpacity
                  onPress={() => {
                    Alert.alert("Silinsin mi?", "Bu masraf kaydı silinecek.", [
                      { text: "İptal", style: "cancel" },
                      {
                        text: "Sil",
                        style: "destructive",
                        onPress: () => {
                          onDelete(editItem.id);
                          setEditOpen(false);
                        },
                      },
                    ]);
                  }}
                  style={{ width: 110 }}
                >
                  <View style={{ paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.red, backgroundColor: "rgba(239,68,68,0.12)", alignItems: "center" }}>
                    <Text style={{ color: theme.red, fontWeight: "900" }}>Sil</Text>
                  </View>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={save} style={{ width: 130 }}>
                <View style={{ paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.18)", alignItems: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>Kaydet</Text>
                </View>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

// -------------------- Borsalar (Stooq - anahtarsız) --------------------
async function fetchStooqQuotes(symbols) {
  const uniq = Array.from(new Set((symbols || []).map((s) => String(s || "").trim().toUpperCase()).filter(Boolean)));
  const mapped = uniq.map((s) => (s.includes(".") ? s : `${s}.US`).toLowerCase());
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(mapped.join(","))}&f=sd2t2ohlcv&h&e=csv`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Borsa verisi alınamadı");
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const rows = lines.slice(1).map((ln) => ln.split(","));
  return rows
    .map((r) => {
      const symRaw = (r[0] || "").toUpperCase();
      const sym = symRaw.replace(".US", "");
      const date = r[1] || "";
      const time = r[2] || "";
      const o = Number(r[3] || 0);
      const h = Number(r[4] || 0);
      const l = Number(r[5] || 0);
      const c = Number(r[6] || 0);
      const v = Number(r[7] || 0);
      const chg = isFinite(o) && o > 0 ? c - o : 0;
      const pct = isFinite(o) && o > 0 ? (chg / o) * 100 : 0;
      return { sym, date, time, o, h, l, c, v, chg, pct };
    })
    .filter((x) => x.sym && isFinite(x.c) && x.c > 0);
}

function StocksScreen({ theme, S, onSetWatchlist }) {
  const [q, setQ] = useState("");
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [lastISO, setLastISO] = useState("");

  const refresh = useCallback(async () => {
    setErr("");
    setLoading(true);
    try {
      const data = await fetchStooqQuotes(S.stockWatchlist || []);
      setQuotes(data);
      setLastISO(new Date().toISOString());
    } catch (e) {
      setErr(String(e?.message || "Hata"));
    } finally {
      setLoading(false);
    }
  }, [S.stockWatchlist]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 30000);
    return () => clearInterval(t);
  }, [refresh]);

  const addTicker = () => {
    const sym = q.trim().toUpperCase().replace(/[^A-Z0-9\.\^\-]/g, "");
    if (!sym) return;
    const next = Array.from(new Set([...(S.stockWatchlist || []), sym]));
    onSetWatchlist(next);
    setQ("");
  };
  const removeTicker = (sym) => {
    onSetWatchlist((S.stockWatchlist || []).filter((x) => String(x).toUpperCase() !== String(sym).toUpperCase()));
  };

  const Card = ({ it }) => {
    const up = it.chg >= 0;
    return (
      <GlassCard theme={theme} style={{ padding: 14, marginTop: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>{it.sym}</Text>
            <Text style={{ color: theme.sub, marginTop: 4, fontWeight: "800" }}>{it.date} {it.time}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 22 }}>${fmtMoney(it.c, 2)}</Text>
            <Text style={{ color: up ? theme.green : theme.red, marginTop: 4, fontWeight: "900" }}>
              {up ? "+" : "-"}{fmtMoney(Math.abs(it.chg), 2)} ({up ? "+" : "-"}{fmtMoney(Math.abs(it.pct), 2)}%)
            </Text>
          </View>
        </View>
        <View style={{ height: 10 }} />
        <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <Chip theme={theme} text={`O: ${fmtMoney(it.o, 2)}`} />
          <Chip theme={theme} text={`H: ${fmtMoney(it.h, 2)}`} />
          <Chip theme={theme} text={`L: ${fmtMoney(it.l, 2)}`} />
          <Chip theme={theme} text={`V: ${fmtMoney(it.v, 0)}`} />
        </View>
        <TouchableOpacity onPress={() => removeTicker(it.sym)} style={{ marginTop: 12, alignSelf: "flex-end" }}>
          <Text style={{ color: theme.red, fontWeight: "900" }}>Listeden kaldır</Text>
        </TouchableOpacity>
      </GlassCard>
    );
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
      <GlassCard theme={theme} style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <View>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>📈 Borsalar</Text>
            <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800" }}>ABD hisseleri/ETF takip listesi (30 sn otomatik yenileme).</Text>
          </View>
          <TouchableOpacity onPress={refresh}>
            <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
              <Text style={{ color: theme.sub, fontWeight: "900" }}>{loading ? "…" : "Yenile"}</Text>
            </View>
          </TouchableOpacity>
        </View>
        {!!lastISO && (
          <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontWeight: "800", fontSize: 12 }}>
            Son güncelleme: {String(lastISO).replace("T", " ").slice(0, 19)}
          </Text>
        )}
        {!!err && <Text style={{ color: theme.red, marginTop: 10, fontWeight: "900" }}>⚠ {err}</Text>}
        <View style={{ height: 12 }} />
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Sembol ekle: AAPL / NVDA / SPY"
              placeholderTextColor={theme.sub}
              autoCapitalize="characters"
              style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
            />
          </View>
          <TouchableOpacity onPress={addTicker}>
            <View style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.18)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>Ekle</Text>
            </View>
          </TouchableOpacity>
        </View>
      </GlassCard>

      {(quotes || []).length === 0 && !loading ? (
        <GlassCard theme={theme} style={{ marginTop: 10, padding: 14 }}>
          <Text style={{ color: theme.sub, fontWeight: "900" }}>Veri yok. Takip listeni kontrol et veya Yenile'ye bas.</Text>
        </GlassCard>
      ) : (
        (quotes || []).map((it) => <Card key={it.sym} it={it} />)
      )}
    </ScrollView>
  );
}

// -------------------- Iconic Dubai Backdrop (home background enhancer) --------------------
function DubaiIconicBackdrop({ theme }) {
  const W = Dimensions.get("window").width;
  const H = Dimensions.get("window").height;
  const beam = useRef(new Animated.Value(0)).current;
  const twinkle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.timing(beam, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.quad), useNativeDriver: true })).start();
    Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [beam, twinkle]);

  const bx = beam.interpolate({ inputRange: [0, 1], outputRange: [-W * 0.8, W * 0.8] });
  const topGlow = twinkle.interpolate({ inputRange: [0, 1], outputRange: [0.06, 0.16] });

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
      <Animated.View style={{ position: "absolute", left: 0, right: 0, top: 0, height: H * 0.45, backgroundColor: theme.neon, opacity: topGlow }} />
      <Animated.View
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: 220,
          backgroundColor: "rgba(255,209,112,0.08)",
          transform: [{ translateX: bx }, { skewX: "-18deg" }],
        }}
      />
      <View style={{ position: "absolute", left: -20, right: -20, bottom: 0, height: Math.max(160, H * 0.22), backgroundColor: "rgba(0,0,0,0.18)" }} />
      <View style={{ position: "absolute", left: W * 0.46, bottom: 0, width: 10, height: H * 0.34, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: "rgba(255,209,112,0.10)" }} />
    </View>
  );
}

function MenuModal({ open, theme, t, tab, onClose, onGo }) {
  const W = Math.min(340, Math.round(DEVICE_W * 0.82));
  const x = useRef(new Animated.Value(-W)).current;

  const sections = [
    {
      title: "Dubai Dashboard",
      items: [
        { k: "home", label: t.home, icon: "🏠", sub: "Özet • Hedef • Hızlı durum" },
        { k: "ledger", label: t.ledger, icon: "📒", sub: "Kayıt" },
        { k: "buy", label: t.buyProfit, icon: "🪙", sub: "USD & Altın • Kâr/Zarar • Kur" },
      ],
    },
    {
      title: "Analiz & Takip",
      items: [
        { k: "reports", label: t.reports, icon: "📊", sub: "Aylık özet • Grafikler • İstatistik" },
        { k: "stocks", label: "Borsalar", icon: "📈", sub: "ABD piyasası • Endeksler • Takip listesi" },
        { k: "news", label: t.news, icon: "📰", sub: "Güncel akış • Başlıklar" },
      ],
    },
    {
      title: "Araçlar",
      items: [
        { k: "expenses", label: "Masraflar Listesi", icon: "🧾", sub: "Dubai'ye kadar + ilk ay • Plan/Ödeme" },
        { k: "todo", label: t.todoTitle, icon: "todo", sub: "Plan • Checklist • Etiket" },
        { k: "notes", label: t.notes, icon: "🗒️", sub: "Hızlı notlar • Fikirler" },
      ],
    },
    {
      title: "Sistem",
      items: [{ k: "settings", label: t.settings, icon: "⚙️", sub: "Tema • Dil • Sıfırlama" }],
    },
  ];

  useEffect(() => {
    if (open) {
      x.setValue(-W);
      Animated.spring(x, { toValue: 0, useNativeDriver: true, bounciness: 6, speed: 18 }).start();
    }
  }, [open, W]);

  const closeWithAnim = () => {
    Animated.timing(x, { toValue: -W, duration: 160, useNativeDriver: true }).start(() => onClose());
  };

  const Row = ({ it }) => {
    const active = tab === it.k;
    return (
      <TouchableOpacity
        onPress={() => {
          onGo(it.k);
        }}
        style={{ marginBottom: 10 }}
      >
        <View
          style={{
            paddingVertical: 12,
            paddingHorizontal: 12,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: active ? theme.gold : theme.stroke,
            backgroundColor: active ? "rgba(255,209,112,0.16)" : theme.glass2,
            flexDirection: "row",
            alignItems: "center",
          }}
        >
          <View
            style={{
              width: 50,
              height: 50,
              borderRadius: 18,
              backgroundColor: "rgba(0,0,0,0.22)",
              borderWidth: 1,
              borderColor: theme.stroke,
              alignItems: "center",
              justifyContent: "center",
              marginRight: 12,
            }}
          >
            {it.icon === "todo" ? <TodoIcon theme={theme} size={24} /> : <Text style={{ fontSize: 22 }}>{it.icon}</Text>}
          </View>

          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: it.k === "ledger" ? 19 : 15, letterSpacing: it.k === "ledger" ? 0.3 : 0, textShadowColor: it.k === "ledger" ? "rgba(255,209,112,0.25)" : "transparent", textShadowOffset: it.k === "ledger" ? { width: 0, height: 1 } : { width: 0, height: 0 }, textShadowRadius: it.k === "ledger" ? 6 : 0 }}>{it.label}</Text>
            <Text numberOfLines={1} ellipsizeMode="tail" style={{ color: theme.sub, marginTop: 3, fontWeight: it.k === "ledger" ? "800" : "800", fontSize: it.k === "ledger" ? 13 : 12, lineHeight: it.k === "ledger" ? 16 : 14, letterSpacing: it.k === "ledger" ? 0.2 : 0, textAlign: "left" }}>{it.sub}</Text>
          </View>

          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: active ? theme.gold : theme.sub, fontWeight: "900", fontSize: 18 }}>›</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal transparent visible={open} animationType="none" onRequestClose={closeWithAnim}>
      <Pressable onPress={closeWithAnim} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)" }}>
        <Animated.View
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: W,
            transform: [{ translateX: x }],
          }}
        >
          <View style={{ flex: 1, padding: 16, paddingTop: 18, backgroundColor: "rgba(10,16,24,0.96)", borderRightWidth: 1, borderColor: theme.stroke }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 44, height: 44, borderRadius: 16, backgroundColor: "rgba(255,209,112,0.12)", borderWidth: 1, borderColor: "rgba(255,209,112,0.35)", alignItems: "center", justifyContent: "center" }}>
                  <MenuIcon theme={theme} size={18} />
                </View>
                <View>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.menu}</Text>
                  <Text style={{ color: theme.sub, fontWeight: "800", marginTop: 2, fontSize: 12 }}>Hızlı gezinme • Tek dokunuş</Text>
                </View>
              </View>
              <TouchableOpacity onPress={closeWithAnim} style={{ padding: 10, borderRadius: 14, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke }}>
                <Text style={{ color: theme.sub, fontWeight: "900" }}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 14, paddingBottom: 18 }}>
              {sections.map((sec) => (
                <View key={sec.title} style={{ marginTop: 14 }}>
                  <Text style={{ color: theme.sub, fontWeight: "900", fontSize: 12, letterSpacing: 0.8 }}>
                    {sec.title.toUpperCase()}
                  </Text>
                  <View style={{ height: 8 }} />
                  {sec.items.map((it) => (
                    <Row key={it.k} it={it} />
                  ))}
                </View>
              ))}
              <View style={{ height: 10 }} />
              <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 11, opacity: 0.9 }}>
                Tip: Sol üstteki menüden ekranlara hızlı geçiş yapabilirsin.
              </Text>
            </ScrollView>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function BottomNavDubai({ theme, tab, setTab, t }) {
  const items = [
    { k: "home", label: t.home, icon: "⌂" },
    { k: "ledger", label: t.ledger, icon: "≡" },
    { k: "reports", label: t.reports, icon: "▦" },
    { k: "news", label: t.news, icon: "📰" },
    { k: "notes", label: t.notes, icon: "✎" },
    { k: "settings", label: t.settings, icon: "⚙" },
  ];
  return (
    <View style={{ position: "absolute", left: 10, right: 10, bottom: 10, paddingVertical: 10, paddingHorizontal: 10, borderRadius: 22, backgroundColor: theme.glass, borderWidth: 1, borderColor: theme.stroke }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: -2 }}>
        {items.map((it) => {
          const active = tab === it.k;
          const isReports = it.k === "reports";
          const iconSize = isReports ? 26 : 22;
          const iconMB = isReports ? 2 : 5;
          const labelShift = isReports ? -2 : 0;
          return (
            <TouchableOpacity key={it.k} onPress={() => setTab(it.k)} style={{ flex: 1 }}>
              <View style={{ alignItems: "center", justifyContent: "center" }}>
                <Text
                  style={{
                    color: active ? theme.text : theme.sub,
                    fontSize: iconSize,
                    fontWeight: "900",
                    marginBottom: iconMB,
                    lineHeight: iconSize,
                  }}
                >
                  {it.icon}
                </Text>
                <Text
                  style={{
                    color: active ? theme.text : theme.sub,
                    fontWeight: "900",
                    fontSize: 11,
                    textAlign: "center",
                    lineHeight: 13,
                    transform: [{ translateY: labelShift }],
                  }}
                  numberOfLines={1}
                >
                  {it.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function ParticlesOverlay({ particles, theme }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
      {particles.map((p) => (
        <View key={p.id} style={{ position: "absolute", left: `${p.x * 100}%`, top: `${p.y * 55}%`, width: p.s, height: p.s, borderRadius: 999, backgroundColor: theme.star, opacity: p.o }} />
      ))}
    </View>
  );
}
function NeonStripes({ theme, moveStripe }) {
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, opacity: 0.62 }}>
      <Animated.View style={{ position: "absolute", top: 90, left: -250, width: 720, height: 2, backgroundColor: theme.neon, transform: [{ translateX: moveStripe }, { rotate: "8deg" }] }} />
      <Animated.View style={{ position: "absolute", top: 220, left: -270, width: 760, height: 1, backgroundColor: "rgba(255,209,112,0.35)", transform: [{ translateX: moveStripe }, { rotate: "10deg" }] }} />
      <Animated.View style={{ position: "absolute", top: 380, left: -290, width: 820, height: 1, backgroundColor: theme.neon2, transform: [{ translateX: moveStripe }, { rotate: "12deg" }], opacity: 0.38 }} />
    </View>
  );
}
function Scanline({ theme, scanY }) {
  return (
    <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, height: 90, transform: [{ translateY: scanY }], opacity: 0.20 }}>
      <View style={{ flex: 1, backgroundColor: theme.neon }} />
      <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.22)" }} />
      <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.35)" }} />
    </Animated.View>
  );
}

/* =========================
   Save/Load Modal + Backup Code Modal
========================= */
function SaveLoadModal({
  open, theme, t, isWeb,
  saveName, setSaveName,
  saves, onClose,
  onSaveLocal, onSaveFile,
  onLoad, onDelete,
  onExportCode, onImportCode,
  onLoadFile, onSaveFileOnly,
}) {
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ maxHeight: "92%", backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.saveLoad}</Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: theme.sub, fontWeight: "900" }}>✕</Text></TouchableOpacity>
          </View>

          <Text style={{ color: theme.sub, marginTop: 8 }}>
            ✅ Multi-save slot + Local Storage. APK için en sağlam: Backup Code Export/Import.
          </Text>

          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>Save adı</Text>
          <TextInput
            value={saveName}
            onChangeText={setSaveName}
            placeholder="Örn: Dubai_Şubat"
            placeholderTextColor={theme.sub}
            style={{
              marginTop: 8, padding: 12, borderRadius: 14,
              borderWidth: 1, borderColor: theme.stroke,
              color: theme.text, backgroundColor: theme.glass2, fontWeight: "800",
            }}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TouchableOpacity onPress={onSaveLocal} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.20)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.saveApp} (Local)</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onExportCode} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.exportCode}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <TouchableOpacity onPress={onImportCode} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(76,190,255,0.14)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.importCode}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                if (!isWeb) return;
                onSaveFileOnly();
              }}
              style={{ flex: 1, opacity: isWeb ? 1 : 0.45 }}
            >
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.14)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.saveToFile}</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <TouchableOpacity onPress={() => (isWeb ? onLoadFile() : null)} style={{ flex: 1, opacity: isWeb ? 1 : 0.45 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.loadFromFile}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onSaveFile} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.10)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.saveApp} (File)</Text>
              </View>
            </TouchableOpacity>
          </View>

          {!isWeb && (
            <Text style={{ color: "rgba(255,255,255,0.55)", marginTop: 10, fontWeight: "800", fontSize: 12 }}>
              {t.noWebFile}
            </Text>
          )}

          <View style={{ marginTop: 14, height: 1, backgroundColor: "rgba(255,255,255,0.10)" }} />

          <Text style={{ color: theme.text, fontWeight: "900", marginTop: 12 }}>{t.loadApp} (Local Saves)</Text>

          <ScrollView style={{ marginTop: 10, maxHeight: 260 }}>
            {(saves || []).length === 0 && (
              <Text style={{ color: theme.sub }}>Henüz save yok. “SaveApp (Local)” ile oluştur.</Text>
            )}
            {(saves || []).map((s) => (
              <View
                key={s.id}
                style={{
                  padding: 12,
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: theme.stroke,
                  backgroundColor: "rgba(255,255,255,0.06)",
                  marginBottom: 10,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: "900" }} numberOfLines={1}>
                  {s.name || "Save"}
                </Text>
                <Text style={{ color: theme.sub, marginTop: 4, fontWeight: "800", fontSize: 12 }}>
                  {s.at ? new Date(s.at).toLocaleString() : ""} • {s.version || ""}
                </Text>

                <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
                  <TouchableOpacity onPress={() => onLoad(s.id)} style={{ flex: 1 }}>
                    <View style={{ paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.18)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
                      <Text style={{ color: theme.text, fontWeight: "900" }}>Load</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onDelete(s.id)} style={{ flex: 1 }}>
                    <View style={{ paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,107,107,0.14)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                      <Text style={{ color: theme.text, fontWeight: "900" }}>Delete</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BackupCodeModal({ open, theme, t, mode, text, setText, onClose, onApply }) {
  const isExport = mode === "export";
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ maxHeight: "92%", backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>
              {isExport ? t.exportCode : t.importCode}
            </Text>
            <TouchableOpacity onPress={onClose}><Text style={{ color: theme.sub, fontWeight: "900" }}>✕</Text></TouchableOpacity>
          </View>

          <Text style={{ color: theme.sub, marginTop: 8 }}>
            {isExport
              ? "Bu JSON’u kopyalayıp sakla. Veriler silinirse Import ile geri yükleyebilirsin."
              : "Export ettiğin JSON’u buraya yapıştır ve Apply’a bas."}
          </Text>

          <TextInput
            value={text}
            onChangeText={setText}
            multiline
            placeholder={isExport ? "" : '{"state":{...}}'}
            placeholderTextColor={theme.sub}
            style={{
              marginTop: 12,
              padding: 12,
              minHeight: 220,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: theme.stroke,
              color: theme.text,
              backgroundColor: "rgba(0,0,0,0.18)",
              fontWeight: "800",
              textAlignVertical: "top",
            }}
          />

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TouchableOpacity onPress={onClose} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.cancel}</Text>
              </View>
            </TouchableOpacity>

            {!isExport && (
              <TouchableOpacity onPress={onApply} style={{ flex: 1 }}>
                <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.20)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>Apply</Text>
                </View>
              </TouchableOpacity>
            )}
            {isExport && (
              <TouchableOpacity onPress={() => { /* no clipboard dep; user can select+copy */ }} style={{ flex: 1, opacity: 0.6 }}>
                <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>Copy (manual)</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* =========================
   Remaining Modals + Helpers
========================= */
function MoneyModal({ open, theme, title, value, onClose, onSave }) {
  const [v, setV] = useState(String(value || 0));
  useEffect(() => { if (open) setV(String(value || 0)); }, [open, value]);
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{title}</Text>
          <TextInput
            value={v}
            onChangeText={(x) => setV(digitsOnly(x))}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.sub}
            style={{ marginTop: 12, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900", fontSize: 18 }}
          />
          <RowButtons
            theme={theme}
            left="Vazgeç"
            right="Kaydet"
            onLeft={onClose}
            onRight={() => {
              const n = toInt(v);
              onSave(n);
              onClose();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function TargetsModalTL({ open, theme, t, autoIncome30dTl, manualMonthlyTl, manualDailyTl, dailySuccessPct, monthlySuccessPct, dailyColor, monthlyColor, onClose, onSave }) {
  const [m, setM] = useState(String(manualMonthlyTl || 120000));
  const [d, setD] = useState(String(manualDailyTl || 5000));
  useEffect(() => {
    if (open) {
      setM(String(manualMonthlyTl || 120000));
      setD(String(manualDailyTl || 5000));
    }
  }, [open, manualMonthlyTl, manualDailyTl]);

  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{t.targetPlan}</Text>

          <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>{t.successRates}</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>
              {t.today}: <Text style={{ color: dailyColor, fontWeight: "900" }}>{Math.round(dailySuccessPct)}%</Text>{" "}
              • {t.thisMonth}: <Text style={{ color: monthlyColor, fontWeight: "900" }}>{Math.round(monthlySuccessPct)}%</Text>
            </Text>
            <Text style={{ color: theme.sub, marginTop: 8, fontWeight: "800" }}>
              {t.autoAvg1m}: <Text style={{ color: theme.gold, fontWeight: "900" }}>{fmtMoney(autoIncome30dTl, 0)} TL</Text>
            </Text>
          </View>

          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>{t.monthlyTarget}</Text>
          <TextInput
            value={m}
            onChangeText={(x) => setM(digitsOnly(x))}
            keyboardType="numeric"
            placeholder="120000"
            placeholderTextColor={theme.sub}
            style={{ marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900" }}
          />

          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>{t.dailyTarget}</Text>
          <TextInput
            value={d}
            onChangeText={(x) => setD(digitsOnly(x))}
            keyboardType="numeric"
            placeholder="5000"
            placeholderTextColor={theme.sub}
            style={{ marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900" }}
          />

          <RowButtons
            theme={theme}
            left={t.cancel}
            right={t.save}
            onLeft={onClose}
            onRight={() => {
              const mm = toInt(m);
              const dd = toInt(d);
              if (mm <= 0) return Alert.alert("Hatalı", "Aylık hedef geçersiz.");
              if (dd <= 0) return Alert.alert("Hatalı", "Günlük hedef geçersiz.");
              onSave(mm, dd);
              onClose();
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function CategoryModal({ open, theme, kind, setKind, categories, newCat, setNewCat, onAdd, onRemove, onClose }) {
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ maxHeight: "92%", backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Kategoriler</Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <ToggleChip theme={theme} active={kind === "expense"} text="Gider" onPress={() => setKind("expense")} />
            <ToggleChip theme={theme} active={kind === "income"} text="Gelir" onPress={() => setKind("income")} />
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <TextInput value={newCat} onChangeText={setNewCat} placeholder="Yeni kategori…" placeholderTextColor={theme.sub}
              style={{ flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
            />
            <TouchableOpacity onPress={onAdd}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.18)" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>Ekle</Text>
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ marginTop: 12 }}>
            {categories.map((c) => (
              <View key={c} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: "rgba(255,255,255,0.06)", marginBottom: 10 }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{c}</Text>
                <TouchableOpacity onPress={() => onRemove(c)}>
                  <Text style={{ color: theme.red, fontWeight: "900" }}>Sil</Text>
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>

          <TouchableOpacity onPress={onClose} style={{ marginTop: 10 }}>
            <Text style={{ color: theme.gold, fontWeight: "900", textAlign: "center" }}>Kapat</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function NoteModal({
  open, theme, t, title, setTitle, tag, setTag, body, setBody,
  tagSuggestions, onApplyTag,
  checklistText, setChecklistText, checklist, onAddChecklist, onToggleChecklist, onRemoveChecklist,
  photos, onPickPhoto, onRemovePhoto, onClose, onSave,
}) {
  return (
    <Modal transparent visible={open} animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", padding: 16, justifyContent: "center" }}>
        <Pressable onPress={() => {}} style={{ maxHeight: "92%", backgroundColor: "rgba(10,16,24,0.94)", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: theme.stroke }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Not Düzenle</Text>

          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>Başlık</Text>
          <TextInput value={title} onChangeText={setTitle} placeholder="Not başlığı" placeholderTextColor={theme.sub}
            style={{ marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900" }}
          />

          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>Etiket</Text>
          <TextInput value={tag} onChangeText={setTag} placeholder="Evrak / Okul / Araç / Şirket / Vize ..." placeholderTextColor={theme.sub}
            style={{ marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900" }}
          />

          {Array.isArray(tagSuggestions) && tagSuggestions.length > 0 && (
            <View style={{ marginTop: 10 }}>
              <Text style={{ color: theme.sub, fontWeight: "900", marginBottom: 8 }}>Öneriler:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 10 }}>
                  {tagSuggestions.map((tg) => (
                    <ToggleChip key={tg} theme={theme} active={false} text={tg} onPress={() => onApplyTag(tg)} />
                  ))}
                </View>
              </ScrollView>
            </View>
          )}

          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>Not</Text>
          <TextInput value={body} onChangeText={setBody} multiline placeholder="Detaylar..." placeholderTextColor={theme.sub}
            style={{ marginTop: 8, padding: 12, minHeight: 80, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }}
          />

          <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>Checklist</Text>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <TextInput value={checklistText} onChangeText={setChecklistText} placeholder="Yeni madde..." placeholderTextColor={theme.sub}
                style={{ flex: 1, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: "rgba(0,0,0,0.18)", fontWeight: "800" }}
              />
              <TouchableOpacity onPress={onAddChecklist}>
                <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.18)" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>Ekle</Text>
                </View>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ marginTop: 10, maxHeight: 140 }}>
              {(checklist || []).map((c) => (
                <View key={c.id} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8 }}>
                  <TouchableOpacity onPress={() => onToggleChecklist(c.id)} style={{ flex: 1, paddingRight: 10 }}>
                    <Text style={{ color: c.done ? theme.green : theme.text, fontWeight: "900" }}>
                      {c.done ? "✅ " : "⬜️ "}
                      {c.text}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => onRemoveChecklist(c.id)}>
                    <Text style={{ color: theme.red, fontWeight: "900" }}>Sil</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {(checklist || []).length === 0 && <Text style={{ color: theme.sub, marginTop: 6 }}>Checklist boş.</Text>}
            </ScrollView>
          </View>

          <View style={{ marginTop: 12, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.text, fontWeight: "900" }}>Fotoğraflar</Text>
              <TouchableOpacity onPress={onPickPhoto}>
                <Text style={{ color: theme.gold, fontWeight: "900" }}>➕ Foto (URL)</Text>
              </TouchableOpacity>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {(photos || []).map((uri) => (
                  <View key={uri} style={{ width: 92 }}>
                    <Image source={{ uri }} style={{ width: 92, height: 92, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke }} />
                    <TouchableOpacity onPress={() => onRemovePhoto(uri)} style={{ marginTop: 6 }}>
                      <Text style={{ color: theme.red, fontWeight: "900", textAlign: "center" }}>Kaldır</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                {(photos || []).length === 0 && <Text style={{ color: theme.sub }}>Henüz foto yok.</Text>}
              </View>
            </ScrollView>
          </View>

          <RowButtons theme={theme} left={t.cancel} right={t.save} onLeft={onClose} onRight={onSave} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function RowButtons({ theme, left, right, onLeft, onRight }) {
  return (
    <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
      <TouchableOpacity onPress={onLeft} style={{ flex: 1 }}>
        <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
          <Text style={{ color: theme.text, fontWeight: "900" }}>{left}</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity onPress={onRight} style={{ flex: 1 }}>
        <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.20)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
          <Text style={{ color: theme.text, fontWeight: "900" }}>{right}</Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}
