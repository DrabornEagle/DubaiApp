// App.js — Dubai Journey PRO v6.0 (Single-file • No external dependencies)
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


// ✅ DocumentPicker + Sharing (for SaveApp File / LoadApp File)
let __DP_CACHE = undefined; // undefined = not checked yet
function getDocumentPicker() {
  if (__DP_CACHE !== undefined) return __DP_CACHE;
  try {
    __DP_CACHE = require("expo-document-picker");
  } catch {
    __DP_CACHE = null;
  }
  return __DP_CACHE;
}

let __SHARE_CACHE = undefined; // undefined = not checked yet
function getSharing() {
  if (__SHARE_CACHE !== undefined) return __SHARE_CACHE;
  try {
    __SHARE_CACHE = require("expo-sharing");
  } catch {
    __SHARE_CACHE = null;
  }
  return __SHARE_CACHE;
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
    version: "v6",
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

// ✅ Preferred Native File Save/Load (Android): user picks a folder once (Storage Access Framework)
// - SaveApp (file): saves into chosen folder
// - LoadApp: lists saved files from that folder inside the app and lets you pick
const USER_SAVE_DIR_URI_KEY = STORAGE_KEY + "__user_save_dir_uri";
const USER_SAVE_INDEX_KEY = STORAGE_KEY + "__user_save_index";

async function loadUserSaveIndex() {
  try {
    const raw = await kvGet(USER_SAVE_INDEX_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeUserSaveIndex(list) {
  try {
    const arr = Array.isArray(list) ? list : [];
    await kvSet(USER_SAVE_INDEX_KEY, JSON.stringify(arr));
  } catch {}
}

async function getOrPickUserSaveDirUri(forcePick = false) {
  const FS = getFileSystem();
  const SAF = FS?.StorageAccessFramework;
  if (!SAF?.requestDirectoryPermissionsAsync) return null;

  try {
    const cached = !forcePick ? await kvGet(USER_SAVE_DIR_URI_KEY) : null;
    if (cached && !forcePick) return cached;

    const perm = await SAF.requestDirectoryPermissionsAsync();
    if (perm?.granted && perm?.directoryUri) {
      await kvSet(USER_SAVE_DIR_URI_KEY, perm.directoryUri);
      return perm.directoryUri;
    }
    return cached || null;
  } catch {
    return null;
  }
}

/* ---------- Sandbox fallback (always works) ---------- */
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

  const Sharing = getSharing();

  const at = nowISO();
  const filename = buildSaveFileName(name || "SaveApp", at);

  const payload = {
    id: uid(),
    name: (name || "SaveApp").trim().slice(0, 40) || "SaveApp",
    at,
    version: "v6",
    state,
  };

  const json = JSON.stringify(payload);
  const enc = FS?.EncodingType?.UTF8 ? { encoding: FS.EncodingType.UTF8 } : undefined;

  const candidates = [];
  if (FS.cacheDirectory) candidates.push(FS.cacheDirectory + filename);
  if (FS.documentDirectory) candidates.push(FS.documentDirectory + filename);

  // sandbox folder fallback (still app-private but always writable)
  try {
    const dir = await ensureSaveFileDir();
    if (dir) candidates.push(dir + filename);
  } catch {}

  let savedUri = null;
  for (const uri of candidates) {
    try {
      await FS.writeAsStringAsync(uri, json, enc);
      savedUri = uri;
      break;
    } catch {}
  }

  if (!savedUri) return null;

  // ✅ No permission prompts here. We write in app cache/documents, then open the OS share sheet.
  let shared = false;
  try {
    if (Sharing?.isAvailableAsync && Sharing?.shareAsync) {
      const ok = await Sharing.isAvailableAsync();
      if (ok) {
        await Sharing.shareAsync(savedUri, {
          mimeType: "application/json",
          dialogTitle: "DubaiApp Yedek Dosyası",
          UTI: "public.json",
        });
        shared = true;
      }
    }
  } catch {
    // ignore; file is still created
  }

  return { id: "share:" + savedUri, name: payload.name, at: payload.at, version: payload.version, shared };
}

async function listSandboxSnapshots() {
  const FS = getFileSystem();
  if (!FS?.readDirectoryAsync) return [];
  const dir = await ensureSaveFileDir();
  if (!dir) return [];
  try {
    const files = await FS.readDirectoryAsync(dir);
    const jsons = (files || []).filter((f) => String(f).toLowerCase().endsWith(".json"));
    jsons.sort((a, b) => String(b).localeCompare(String(a)));
    return jsons.slice(0, 50).map((fn) => {
      const parts = String(fn).split("__");
      const name = (parts?.[1] || "FileSave").replace(/\.json$/i, "").replace(/_/g, " ");
      return { id: "file:" + fn, name: name.slice(0, 40), at: "", version: "v6" };
    });
  } catch {
    return [];
  }
}

async function listFileSnapshots() {
  const idx = await loadUserSaveIndex();
  const safSnaps = (Array.isArray(idx) ? idx : []).filter((x) => String(x?.id || "").startsWith("saf:"));
  const sandbox = await listSandboxSnapshots();
  const merged = [...safSnaps, ...sandbox];
  // sort best-effort by at (if present)
  merged.sort((a, b) => String(b?.at || "").localeCompare(String(a?.at || "")));
  return merged.slice(0, 80);
}

async function loadFileSnapshotById(fileId) {
  const FS = getFileSystem();
  if (!FS?.readAsStringAsync) return null;

  const id = String(fileId || "");
  // SAF fileUri
  if (id.startsWith("saf:")) {
    const uri = id.replace(/^saf:/, "");
    if (!uri) return null;
    try {
      const raw = await FS.readAsStringAsync(uri);
      const obj = safeParseJson(raw);
      return obj && obj.state ? obj : null;
    } catch {
      return null;
    }
  }

  // Sandbox file
  const dir = await ensureSaveFileDir();
  if (!dir) return null;
  const fn = id.replace(/^file:/, "");
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

  const id = String(fileId || "");

  // SAF file
  if (id.startsWith("saf:")) {
    try { await FS.deleteAsync(id.replace(/^saf:/, ""), { idempotent: true }); } catch {}
    try {
      const idx = await loadUserSaveIndex();
      const next = (idx || []).filter((x) => x?.id !== id);
      await writeUserSaveIndex(next);
    } catch {}
    return;
  }

  // Sandbox file
  const dir = await ensureSaveFileDir();
  if (!dir) return;
  const fn = id.replace(/^file:/, "");
  if (!fn) return;
  try { await FS.deleteAsync(dir + fn, { idempotent: true }); } catch {}
}


// ✅ Native: pick a .json save file from device and return parsed snapshot
async function pickSnapshotFromDevice() {
  const FS = getFileSystem();
  const DP = getDocumentPicker();
  if (!FS?.readAsStringAsync || !DP?.getDocumentAsync) return null;

  try {
    const res = await DP.getDocumentAsync({
      type: ["application/json", "text/json", "*/*"],
      copyToCacheDirectory: true,
      multiple: false,
    });

    if (res?.canceled) return null;

    const asset = (Array.isArray(res?.assets) && res.assets[0]) ? res.assets[0] : res;
    const uri = asset?.uri;
    if (!uri) return null;

    const raw = await FS.readAsStringAsync(uri);
    const obj = safeParseJson(raw);
    return obj && obj.state ? obj : null;
  } catch {
    return null;
  }
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
    expenseList: "Masraflar Listesi",
    stocks: "Borsalar",
    games: "Oyunlar",
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
    expenseList: "Expense Planner",
    stocks: "Stocks",
    games: "Games",
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
   Expense Planner helpers
========================= */
function plannerExpenseToUsd(item, usdToAed, usdToTl) {
  const amt = Number(item?.amount || 0);
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  const cur = String(item?.currency || "USD").toUpperCase();
  if (cur === "USD") return amt;
  if (cur === "AED") return (usdToAed ? amt / usdToAed : amt / 3.6725);
  if (cur === "TL" || cur === "TRY") return usdToTl ? amt / usdToTl : 0;
  return amt;
}

function normalizeStockSymbols(symbols) {
  const arr = Array.isArray(symbols) ? symbols : [];
  const cleaned = arr
    .map((x) => String(x || "").trim().toUpperCase())
    .map((x) => x.replace(/[^A-Z0-9.^\-]/g, ""))
    .filter(Boolean);
  return Array.from(new Set(cleaned)).slice(0, 20);
}

const US_TOP_COMPANIES = [
  { symbol: "AAPL", name: "Apple", sector: "Consumer Tech" },
  { symbol: "MSFT", name: "Microsoft", sector: "Software / Cloud" },
  { symbol: "NVDA", name: "NVIDIA", sector: "AI / Semiconductors" },
  { symbol: "AMZN", name: "Amazon", sector: "E-commerce / Cloud" },
  { symbol: "GOOGL", name: "Alphabet", sector: "Internet / Ads" },
  { symbol: "META", name: "Meta Platforms", sector: "Social / Ads" },
  { symbol: "TSLA", name: "Tesla", sector: "EV / Energy" },
  { symbol: "AVGO", name: "Broadcom", sector: "Semiconductors" },
  { symbol: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors" },
  { symbol: "NFLX", name: "Netflix", sector: "Streaming" },
  { symbol: "JPM", name: "JPMorgan Chase", sector: "Banking" },
  { symbol: "V", name: "Visa", sector: "Payments" },
  { symbol: "MA", name: "Mastercard", sector: "Payments" },
  { symbol: "BRK-B", name: "Berkshire Hathaway", sector: "Conglomerate" },
  { symbol: "WMT", name: "Walmart", sector: "Retail" },
  { symbol: "COST", name: "Costco", sector: "Retail" },
  { symbol: "XOM", name: "Exxon Mobil", sector: "Energy" },
  { symbol: "LLY", name: "Eli Lilly", sector: "Pharma" },
  { symbol: "UNH", name: "UnitedHealth", sector: "Healthcare" },
  { symbol: "PLTR", name: "Palantir", sector: "Data / Defense AI" },
];


const STOCK_LOGO_DOMAIN_MAP = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  NVDA: "nvidia.com",
  AMZN: "amazon.com",
  GOOGL: "google.com",
  META: "meta.com",
  TSLA: "tesla.com",
  AVGO: "broadcom.com",
  AMD: "amd.com",
  NFLX: "netflix.com",
  JPM: "jpmorganchase.com",
  V: "visa.com",
  MA: "mastercard.com",
  "BRK-B": "berkshirehathaway.com",
  WMT: "walmart.com",
  COST: "costco.com",
  XOM: "exxonmobil.com",
  LLY: "lilly.com",
  UNH: "unitedhealthgroup.com",
  PLTR: "palantir.com",
};

function stockLogoUri(symbol) {
  const sym = String(symbol || "").toUpperCase();
  const domain = STOCK_LOGO_DOMAIN_MAP[sym];
  return domain ? `https://logo.clearbit.com/${domain}` : null;
}

const STOCK_NAME_FALLBACK_MAP = US_TOP_COMPANIES.reduce((acc, x) => {
  acc[String(x.symbol || "").toUpperCase()] = x.name;
  return acc;
}, {});

function isFiniteNum(v) {
  return Number.isFinite(Number(v));
}
function lastFiniteFromArray(arr, fallbackValue) {
  if (Array.isArray(arr)) {
    for (let i = arr.length - 1; i >= 0; i--) {
      const v = Number(arr[i]);
      if (Number.isFinite(v)) return v;
    }
  }
  return fallbackValue;
}
function mapYahooQuoteRow(q) {
  return {
    symbol: String(q?.symbol || "").toUpperCase(),
    name: String(q?.shortName || q?.longName || q?.displayName || q?.symbol || "").trim(),
    price: Number(q?.regularMarketPrice),
    change: Number(q?.regularMarketChange),
    changePct: Number(q?.regularMarketChangePercent),
    dayHigh: Number(q?.regularMarketDayHigh),
    dayLow: Number(q?.regularMarketDayLow),
    open: Number(q?.regularMarketOpen),
    prevClose: Number(q?.regularMarketPreviousClose),
    volume: Number(q?.regularMarketVolume),
    marketCap: Number(q?.marketCap),
    currency: String(q?.currency || "USD"),
    exchange: String(q?.fullExchangeName || q?.exchange || ""),
    marketState: String(q?.marketState || ""),
    atISO: q?.regularMarketTime ? new Date(Number(q.regularMarketTime) * 1000).toISOString() : nowISO(),
  };
}

async function fetchJsonWithTimeout(url, timeoutMs = 12000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  try {
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json,text/plain,*/*",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) throw new Error("http " + res.status);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchTextWithTimeout(url, timeoutMs = 12000) {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  let timer = null;
  try {
    if (controller) timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "text/plain,application/json,*/*",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: controller ? controller.signal : undefined,
    });
    if (!res.ok) throw new Error("http " + res.status);
    return await res.text();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseCsvRow(line) {
  return String(line || "")
    .trim()
    .split(",")
    .map((x) => String(x || "").replace(/^"|"$/g, "").trim());
}

// Extra fallback (when Yahoo blocks): stooq.com CSV (delayed but reliable for previews)
async function fetchStooqQuote(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("no symbol");
  const st = sym.toLowerCase(); // AAPL -> aapl
  const url = `https://stooq.com/q/l/?s=${encodeURIComponent(st)}.us&f=sd2t2ohlcv&h&e=csv`;
  const txt = await fetchTextWithTimeout(url, 14000);
  const lines = String(txt || "").trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error("no data");
  const row = parseCsvRow(lines[1]);
  // Symbol,Date,Time,Open,High,Low,Close,Volume
  const open = Number(row[3]);
  const high = Number(row[4]);
  const low = Number(row[5]);
  const close = Number(row[6]);
  const volume = Number(row[7]);
  if (!Number.isFinite(close)) throw new Error("bad close");

  const change = (Number.isFinite(open)) ? (close - open) : NaN;
  const changePct = (Number.isFinite(change) && Number.isFinite(open) && open !== 0) ? (change / open) * 100 : NaN;

  return {
    symbol: sym,
    name: String(STOCK_NAME_FALLBACK_MAP[sym] || sym),
    price: close,
    change,
    changePct,
    dayHigh: Number.isFinite(high) ? high : NaN,
    dayLow: Number.isFinite(low) ? low : NaN,
    open: Number.isFinite(open) ? open : NaN,
    prevClose: NaN,
    volume: Number.isFinite(volume) ? volume : NaN,
    marketCap: NaN,
    currency: "USD",
    exchange: "US Market",
    marketState: "",
    atISO: nowISO(),
  };
}


async function fetchYahooChartQuote(symbol) {
  const sym = String(symbol || "").trim().toUpperCase();
  if (!sym) throw new Error("no symbol");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d&includePrePost=false`;
  const json = await fetchJsonWithTimeout(url, 14000);
  const r = json?.chart?.result?.[0];
  const meta = r?.meta || {};
  const q = r?.indicators?.quote?.[0] || {};
  const closes = q?.close || r?.indicators?.adjclose?.[0]?.adjclose || [];
  const price = isFiniteNum(meta?.regularMarketPrice) ? Number(meta.regularMarketPrice) : lastFiniteFromArray(closes, NaN);
  const prevClose = isFiniteNum(meta?.chartPreviousClose)
    ? Number(meta.chartPreviousClose)
    : (isFiniteNum(meta?.previousClose) ? Number(meta.previousClose) : lastFiniteFromArray(q?.open, NaN));
  const change = (Number.isFinite(price) && Number.isFinite(prevClose)) ? (price - prevClose) : NaN;
  const changePct = (Number.isFinite(change) && Number.isFinite(prevClose) && prevClose !== 0) ? (change / prevClose) * 100 : NaN;
  const dayHigh = isFiniteNum(meta?.regularMarketDayHigh) ? Number(meta.regularMarketDayHigh) : lastFiniteFromArray(q?.high, NaN);
  const dayLow = isFiniteNum(meta?.regularMarketDayLow) ? Number(meta.regularMarketDayLow) : lastFiniteFromArray(q?.low, NaN);
  const open = isFiniteNum(meta?.regularMarketOpen) ? Number(meta.regularMarketOpen) : lastFiniteFromArray(q?.open, NaN);
  const volume = isFiniteNum(meta?.regularMarketVolume) ? Number(meta.regularMarketVolume) : lastFiniteFromArray(q?.volume, NaN);

  return {
    symbol: sym,
    name: String(meta?.shortName || meta?.longName || STOCK_NAME_FALLBACK_MAP[sym] || sym).trim(),
    price,
    change,
    changePct,
    dayHigh,
    dayLow,
    open,
    prevClose,
    volume,
    marketCap: NaN,
    currency: String(meta?.currency || "USD"),
    exchange: String(meta?.exchangeName || meta?.fullExchangeName || meta?.exchange || "US Market"),
    marketState: String(meta?.marketState || ""),
    atISO: meta?.regularMarketTime ? new Date(Number(meta.regularMarketTime) * 1000).toISOString() : nowISO(),
  };
}

function formatCompactNum(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return fmtMoney(v, 0);
}

async function fetchYahooQuotes(symbols) {
  const list = normalizeStockSymbols(symbols);
  if (!list.length) return [];

  const bySymbol = new Map();
  const missing = new Set(list);

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(list.join(","))}`;
    const json = await fetchJsonWithTimeout(url, 12000);
    const rows = json?.quoteResponse?.result || [];
    for (const row of rows) {
      const mapped = mapYahooQuoteRow(row);
      const sym = String(mapped.symbol || "").toUpperCase();
      if (!sym) continue;
      bySymbol.set(sym, mapped);
      if (Number.isFinite(mapped.price)) missing.delete(sym);
    }
  } catch {}

  if (missing.size) {
    await Promise.all(Array.from(missing).map(async (sym) => {
      let q = null;
      try { q = await fetchYahooChartQuote(sym); } catch {}
      if (!q || !Number.isFinite(q.price)) {
        try { q = await fetchStooqQuote(sym); } catch {}
      }
      if (q && Number.isFinite(q.price)) bySymbol.set(sym, q);
    }));
  }

  const out = list.map((sym) => bySymbol.get(sym)).filter(Boolean);
  out.sort((a, b) => list.indexOf(a.symbol) - list.indexOf(b.symbol));
  return out;
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
const DEFAULT_STATE = {
  lang: "TR",
  themeKey: "dxbSkylineMidnight",

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

  expensePlanner: [],
  stockSymbols: ["AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AVGO", "AMD", "NFLX", "JPM", "V", "MA", "BRK-B", "WMT", "COST", "XOM", "LLY", "UNH", "PLTR"],
  stockQuotes: [],
  lastStocksISO: "",

  gameScores: {},

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
      if (!Array.isArray(merged.expensePlanner)) merged.expensePlanner = [];
      if (!Array.isArray(merged.stockSymbols) || merged.stockSymbols.length === 0) merged.stockSymbols = DEFAULT_STATE.stockSymbols;
      if (!Array.isArray(merged.stockQuotes)) merged.stockQuotes = [];
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
  const stocksInFlight = useRef(false);
  const stocksLastFetchMsRef = useRef(0);

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

  async function refreshStocks(opts) {
    const o = (opts && typeof opts === "object") ? opts : { force: !!opts };
    const force = !!o.force;
    const ignoreCache = !!o.ignoreCache;
    const symbolsOverride = o.symbolsOverride || null;

    const nowMs = Date.now();
    if (stocksInFlight.current) return;
    if (ignoreCache && nowMs - (stocksLastFetchMsRef.current || 0) < 2500) return;

    stocksInFlight.current = true;
    if (ignoreCache) stocksLastFetchMsRef.current = nowMs;

    try {
      const last = stateRef.current?.lastStocksISO ? new Date(stateRef.current.lastStocksISO).getTime() : 0;
      if (!force && !ignoreCache && Date.now() - last < 5 * 60 * 1000) return;

      const symbols = normalizeStockSymbols(symbolsOverride || stateRef.current?.stockSymbols || DEFAULT_STATE.stockSymbols);
      if (!symbols.length) throw new Error("no symbols");

      const quotes = await fetchYahooQuotes(symbols);
      if (Array.isArray(quotes) && quotes.length) {
        setS((p) => ({ ...p, stockQuotes: quotes, stockSymbols: symbols, lastStocksISO: nowISO() }));
      } else if (force || ignoreCache) {
        setS((p) => ({ ...p, stockQuotes: [], stockSymbols: symbols, lastStocksISO: nowISO() }));
      }
    } catch {} 
    finally { 
      stocksInFlight.current = false; 
    }
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

  // US Stocks (manual + periodic refresh)
  useEffect(() => {
    let timer = null;
    (async () => {
      await refreshStocks({ force: true });
      timer = setInterval(() => refreshStocks({ force: false }), 5 * 60 * 1000);
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
      else openToast("⚠️", "Dosya yazılamadı. Çözüm: Termux'ta npm i çalıştır, uygulamayı yeniden başlat; expo-sharing kurulu olduğundan emin ol.");
    }

    await refreshSaveList();
    openToast("✅", `Saved: ${snap.name}`);

    // Web download
    if (!localOnly && IS_WEB) {
      const fn = `DubaiLedger_${snap.name.replace(/\s+/g, "_")}_${snap.at.slice(0, 19).replace(/[:T]/g, "-")}.json`;
      downloadJsonFile(fn, snap);
    }
  }


  

// ✅ File Save/Load (no folder selection): SaveApp File opens system Save/Share UI, LoadApp File opens file picker
async function handleSaveAppFile() {
  const nm = saveName.trim() || "SaveApp";
  const meta = await saveSnapshotToFile(nm, stateRef.current);
  if (meta) openToast("✅", "Yedek dosyası hazırlandı. Açılan ekrandan konumu seçip kaydedebilirsin.");
  else openToast("⚠️", "Dosya yazılamadı. Çözüm: Termux'ta npm i çalıştır, uygulamayı yeniden başlat; expo-sharing kurulu olduğundan emin ol.");
}

async function handleLoadAppFile() {
  const snap = await pickSnapshotFromDevice();
  if (!snap) return;

  const merged = { ...DEFAULT_STATE, ...snap.state };
  if (!THEME_PRESETS[merged.themeKey]) merged.themeKey = DEFAULT_STATE.themeKey;
  if (!Array.isArray(merged.todos)) merged.todos = [];
  if (!Array.isArray(merged.buys)) merged.buys = [];
  if (!Array.isArray(merged.txns)) merged.txns = [];
  if (!Array.isArray(merged.notes)) merged.notes = [];
  if (!Array.isArray(merged.expensePlanner)) merged.expensePlanner = [];
  if (!Array.isArray(merged.stockSymbols) || merged.stockSymbols.length === 0) merged.stockSymbols = DEFAULT_STATE.stockSymbols;
  if (!Array.isArray(merged.stockQuotes)) merged.stockQuotes = [];
  if (!merged.categories || typeof merged.categories !== "object") merged.categories = DEFAULT_STATE.categories;
  if (!Array.isArray(merged.categories.income)) merged.categories.income = DEFAULT_STATE.categories.income;
  if (!Array.isArray(merged.categories.expense)) merged.categories.expense = DEFAULT_STATE.categories.expense;
  if (!merged.gameScores || typeof merged.gameScores !== "object") merged.gameScores = {};

  setS(merged);
  openToast("✅", `Loaded: ${snap.name || "Save"}`);
  setSaveLoadOpen(false);
}
async function handleLoadApp(id) {
    const isFile = String(id || "").startsWith("file:") || String(id || "").startsWith("saf:");
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
    const isFile = String(id || "").startsWith("file:") || String(id || "").startsWith("saf:");
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
    if (!Array.isArray(merged.expensePlanner)) merged.expensePlanner = [];
    if (!Array.isArray(merged.stockSymbols) || merged.stockSymbols.length === 0) merged.stockSymbols = DEFAULT_STATE.stockSymbols;
    if (!Array.isArray(merged.stockQuotes)) merged.stockQuotes = [];
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
      version: "v6",
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

  
  if (boot) return <BootSplashHold />;
  if (!boot && !introDone) {
    return <DubaiIntro onDone={() => setIntroDone(true)} durationMs={4500} />;
  }

return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar barStyle="light-content" />
      <ImageBackground source={{ uri: theme.skyline }} style={{ flex: 1 }} resizeMode="cover">
        <View style={{ flex: 1, backgroundColor: theme.overlay }}>
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

          {tab === "home" && <DubaiHomeBackdrop theme={theme} />}

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

                <DubaiSkylineHero theme={theme} S={S} />
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

            {tab === "expensesPlan" && (
              <ExpensePlannerPro
                theme={theme}
                t={t}
                S={S}
                setPatch={setPatch}
                onToast={openToast}
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
              <StocksProScreen
                theme={theme}
                t={t}
                S={S}
                setPatch={setPatch}
                onRefresh={refreshStocks}
                isActive={tab === "stocks"}
                onToast={openToast}
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

            {tab === "games" && (
              <GamesHub
                theme={theme}
                t={t}
                S={S}
                setPatch={setPatch}
                onToast={openToast}
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
        travelDateISO={S.travelDateISO}
        dailySuccessPct={dailySuccessPct}
        monthlySuccessPct={monthlySuccessPct}
        dailyColor={dailyColor}
        monthlyColor={monthlyColor}
        onClose={() => setTargetsOpen(false)}
        onSave={(mTl, dTl, tdIso) => setPatch({ manualMonthlyTargetTl: mTl, manualDailyTargetTl: dTl, travelDateISO: tdIso || S.travelDateISO })}
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
  saveName={saveName}
  setSaveName={setSaveName}
  onClose={() => setSaveLoadOpen(false)}
  onSaveFile={handleSaveAppFile}
  onLoadFile={handleLoadAppFile}
  onExportCode={openExportCode}
  onImportCode={openImportCode}
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
                <Text style={{ color: theme.text, fontWeight: "900", fontSize: 17 }}>Dubai Ledger</Text>
                <Text style={{ color: theme.sub, marginTop: 4, fontWeight: "800" }}>Month • Day • Smart Search</Text>
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

function BootSplashHold() {
  return (
    <ImageBackground source={require("./assets/splash.png")} resizeMode="cover" style={{ flex: 1, backgroundColor: "#070A12" }}>
      <StatusBar hidden />
      <View style={{ flex: 1, backgroundColor: "rgba(5,7,11,0.22)" }} />
    </ImageBackground>
  );
}

function DubaiHomeBackdrop({ theme }) {
  const beam = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const a = Animated.loop(Animated.timing(beam, { toValue: 1, duration: 18000, easing: Easing.linear, useNativeDriver: true }));
    const b = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 5200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 5200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    a.start();
    b.start();
    return () => { a.stop(); b.stop(); };
  }, [beam, glow]);

  const beamX = beam.interpolate({ inputRange: [0, 1], outputRange: [-180, DEVICE_W + 140] });
  const beamX2 = beam.interpolate({ inputRange: [0, 1], outputRange: [DEVICE_W + 120, -180] });
  const skylineLift = glow.interpolate({ inputRange: [0, 1], outputRange: [0, -8] });
  const skylineOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.20] });

  const bars = [
    [0.00, 0.10, 84], [0.10, 0.07, 120], [0.17, 0.05, 66], [0.22, 0.08, 140],
    [0.30, 0.06, 90], [0.36, 0.09, 180], [0.45, 0.05, 112], [0.50, 0.07, 74],
    [0.57, 0.06, 118], [0.63, 0.09, 152], [0.72, 0.07, 98], [0.79, 0.05, 170], [0.84, 0.08, 110],
  ];

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}>
      <Animated.View style={{ position: "absolute", left: -40, right: -40, bottom: 95, height: 220, backgroundColor: theme.haze, opacity: skylineOpacity, borderRadius: 26, transform: [{ translateY: skylineLift }] }} />
      <Animated.View style={{ position: "absolute", width: 150, height: 320, bottom: 90, backgroundColor: "rgba(120,210,255,0.08)", borderRadius: 26, transform: [{ translateX: beamX }, { rotate: "12deg" }] }} />
      <Animated.View style={{ position: "absolute", width: 150, height: 320, bottom: 86, backgroundColor: "rgba(255,209,112,0.07)", borderRadius: 26, transform: [{ translateX: beamX2 }, { rotate: "-14deg" }] }} />
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 86, height: 190 }}>
        {bars.map(([x, w, h], idx) => (
          <View key={idx} style={{ position: "absolute", left: Math.round(x * DEVICE_W), width: Math.max(12, Math.round(w * DEVICE_W)), bottom: 0, height: h, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: idx === 11 ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: "rgba(255,255,255,0.05)" }} />
        ))}
        <View style={{ position: "absolute", left: Math.round(0.79 * DEVICE_W) + 8, bottom: 170, width: 3, height: 52, borderRadius: 2, backgroundColor: "rgba(255,209,112,0.22)" }} />
      </View>
    </View>
  );
}

function DubaiSkylineHero({ theme, S }) {
  const versionLabel = "v6 Final";
  const buildCode = "6";
  const lastStocks = S?.lastStocksISO ? new Date(S.lastStocksISO).toLocaleString() : "—";
  const lastNewsNotify = S?.lastNewsNotifyISO ? new Date(S.lastNewsNotifyISO).toLocaleString() : "—";
  const lastWeather = S?.lastWeatherISO ? new Date(S.lastWeatherISO).toLocaleTimeString() : "—";

  return (
    <GlassCard theme={theme} style={{ marginBottom: 12, padding: 14 }}>
      <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>Sistem Bilgi Paneli</Text>
      <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800" }}>
        Uygulama sürümü, senkron zamanları ve son bildirim durumu burada gösterilir.
      </Text>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        <View style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
          <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Versiyon</Text>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16, marginTop: 4 }}>{versionLabel}</Text>
          <Text style={{ color: theme.sub, fontWeight: "800", marginTop: 4, fontSize: 12 }}>Build: {buildCode}</Text>
        </View>
        <View style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
          <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Son Bildirim</Text>
          <Text style={{ color: theme.text, fontWeight: "900", marginTop: 4 }} numberOfLines={1}>Haber bildirimi</Text>
          <Text style={{ color: theme.sub, fontWeight: "800", marginTop: 4, fontSize: 12 }} numberOfLines={1}>{lastNewsNotify}</Text>
        </View>
      </View>

      <View style={{ marginTop: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
        <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Son Senkron Durumları</Text>
        <Text style={{ color: theme.text, marginTop: 6, fontWeight: "800" }}>• Borsalar: <Text style={{ color: theme.gold, fontWeight: "900" }}>{lastStocks}</Text></Text>
        <Text style={{ color: theme.text, marginTop: 4, fontWeight: "800" }}>• Hava durumu: <Text style={{ color: theme.gold, fontWeight: "900" }}>{lastWeather}</Text></Text>
      </View>
    </GlassCard>
  );
}

function ExpensePlannerPro({ theme, t, S, setPatch, onToast }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Vize / Evrak");
  const [phase, setPhase] = useState("PRE_DXB");
  const [currency, setCurrency] = useState("AED");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const phaseOptions = [
    { k: "PRE_DXB", label: "Dubai Öncesi" },
    { k: "FIRST_MONTH", label: "Dubai İlk Ay" },
    { k: "OPTIONAL", label: "Opsiyonel / Sonra" },
  ];
  const categories = ["Vize / Evrak", "Uçuş", "Airbnb / Konaklama", "Kira / Depozito", "Okul", "Araç / Peşinat", "Uber / Evrak", "Ehliyet / Dönüşüm", "Şirket Kurulum", "Yeme-İçme", "Market", "Ulaşım", "Telefon/İnternet", "Diğer"];
  const list = Array.isArray(S.expensePlanner) ? S.expensePlanner : [];

  const sorted = useMemo(() => {
    const arr = [...list];
    arr.sort((a, b) => {
      if (!!a.paid !== !!b.paid) return a.paid ? 1 : -1;
      return new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime();
    });
    return arr;
  }, [list]);

  const stats = useMemo(() => {
    let plannedUsd = 0, paidUsd = 0, preUsd = 0, firstUsd = 0;
    for (const item of list) {
      const usd = plannerExpenseToUsd(item, S.usdToAed, S.usdToTl);
      plannedUsd += usd;
      if (item.paid) paidUsd += usd;
      if (item.phase === "PRE_DXB") preUsd += usd;
      if (item.phase === "FIRST_MONTH") firstUsd += usd;
    }
    return { plannedUsd, paidUsd, leftUsd: Math.max(0, plannedUsd - paidUsd), preUsd, firstUsd, count: list.length, unpaidCount: list.filter((x) => !x.paid).length };
  }, [list, S.usdToAed, S.usdToTl]);

  const grouped = useMemo(() => ({ PRE_DXB: sorted.filter((x) => x.phase === "PRE_DXB"), FIRST_MONTH: sorted.filter((x) => x.phase === "FIRST_MONTH"), OPTIONAL: sorted.filter((x) => x.phase === "OPTIONAL") }), [sorted]);

  const addItem = () => {
    const amt = toInt(amount);
    if (!String(title || "").trim()) return onToast?.("⚠️", "Masraf adı gir.");
    if (!(amt > 0)) return onToast?.("⚠️", "Geçerli tutar gir.");
    setPatch({ expensePlanner: [{ id: uid(), title: String(title).trim(), category, phase, currency, amount: amt, note: String(note || "").trim(), paid: false, paidAt: "", at: nowISO() }, ...list] });
    setTitle(""); setAmount("");  setNote("");
    onToast?.("✅", "Masraf eklendi");
  };

  const togglePaid = (id) => setPatch({ expensePlanner: list.map((x) => x.id === id ? { ...x, paid: !x.paid, paidAt: !x.paid ? nowISO() : "" } : x) });
  const removeItem = (id) => setPatch({ expensePlanner: list.filter((x) => x.id !== id) });

  const addStarterTemplate = () => {
    const template = [
      ["Vize / Evrak", "Vize / Evrak", "PRE_DXB", "AED", 0],
      ["Uçak Bileti (aile)", "Uçuş", "PRE_DXB", "USD", 0],
      ["İlk 1 Ay Airbnb", "Airbnb / Konaklama", "FIRST_MONTH", "AED", 0],
      ["Ev Kirası İlk Ödeme", "Kira / Depozito", "FIRST_MONTH", "AED", 0],
      ["Okul Kayıt / İlk Taksit", "Okul", "FIRST_MONTH", "AED", 0],
      ["Ehliyet Dönüşüm", "Ehliyet / Dönüşüm", "FIRST_MONTH", "AED", 0],
      ["Araç Peşinatı", "Araç / Peşinat", "FIRST_MONTH", "AED", 0],
      ["Şirket Kurulum / Sanal Ofis", "Şirket Kurulum", "FIRST_MONTH", "AED", 0],
      ["İlk Ay Market & Yemek", "Market", "FIRST_MONTH", "AED", 0],
      ["Telefon / İnternet Kurulum", "Telefon/İnternet", "FIRST_MONTH", "AED", 0],
    ];
    const existing = new Set(list.map((x) => `${x.title}|${x.phase}`));
    const additions = template
      .filter((r) => !existing.has(`${r[0]}|${r[2]}`))
      .map((r) => ({ id: uid(), title: r[0], category: r[1], phase: r[2], currency: r[3], amount: r[4], note: "", paid: false, paidAt: "", at: nowISO() }));
    if (!additions.length) return onToast?.("ℹ️", "Şablon zaten ekli.");
    setPatch({ expensePlanner: [...additions, ...list] });
    onToast?.("📦", `${additions.length} şablon masraf eklendi`);
  };

  const phaseBadge = (k) => (k === "PRE_DXB" ? "Dubai Öncesi" : k === "FIRST_MONTH" ? "Dubai İlk Ay" : "Opsiyonel");
  const phaseColor = (k) => (k === "PRE_DXB" ? "rgba(78,168,255,0.18)" : k === "FIRST_MONTH" ? "rgba(255,209,112,0.18)" : "rgba(255,255,255,0.08)");
  const phaseBorder = (k) => (k === "PRE_DXB" ? "rgba(78,168,255,0.35)" : k === "FIRST_MONTH" ? "rgba(255,209,112,0.35)" : theme.stroke);

  const renderItem = (item) => {
    const usd = plannerExpenseToUsd(item, S.usdToAed, S.usdToTl);
    const tl = (S.usdToTl || 0) * usd;
    return (
      <GlassCard key={item.id} theme={theme} style={{ padding: 12, marginTop: 10, opacity: item.paid ? 0.82 : 1 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
          <TouchableOpacity onPress={() => togglePaid(item.id)} style={{ marginTop: 1 }}>
            <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 1, borderColor: item.paid ? theme.green : theme.stroke, backgroundColor: item.paid ? "rgba(123,255,178,0.16)" : "rgba(255,255,255,0.04)", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: item.paid ? theme.green : theme.sub, fontWeight: "900" }}>{item.paid ? "✓" : ""}</Text>
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text style={{ color: theme.text, fontWeight: "900", fontSize: 15, flexShrink: 1 }}>{item.title}</Text>
              <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, backgroundColor: phaseColor(item.phase), borderWidth: 1, borderColor: phaseBorder(item.phase) }}>
                <Text style={{ color: theme.text, fontWeight: "900", fontSize: 11 }}>{phaseBadge(item.phase)}</Text>
              </View>
            </View>
            <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800" }}>{item.category} • {fmtMoney(item.amount || 0, 0)} {item.currency}</Text>
            <Text style={{ color: theme.sub, marginTop: 4, fontWeight: "800" }}>≈ ${fmtMoney(usd, 0)} • {Number.isFinite(tl) ? fmtMoney(tl, 0) : "—"} TL</Text>
            {!!item.note && <Text style={{ color: theme.sub, marginTop: 6 }}>{item.note}</Text>}
          </View>
          <TouchableOpacity onPress={() => removeItem(item.id)}><Text style={{ color: theme.red, fontWeight: "900" }}>Sil</Text></TouchableOpacity>
        </View>
      </GlassCard>
    );
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
      <GlassCard theme={theme} style={{ padding: 14 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>{t.expenseList || "Masraflar Listesi"}</Text>
        <Text style={{ color: theme.sub, marginTop: 6 }}>Dubai’ye gidene kadar + Dubai’de ilk ay için tüm masrafları planla ve ödendi takibi yap.</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
            <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Toplam Plan</Text><Text style={{ color: theme.text, fontWeight: "900", fontSize: 16, marginTop: 4 }}>${fmtMoney(stats.plannedUsd, 0)}</Text>
          </View>
          <View style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
            <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Kalan</Text><Text style={{ color: theme.gold, fontWeight: "900", fontSize: 16, marginTop: 4 }}>${fmtMoney(stats.leftUsd, 0)}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(78,168,255,0.30)", backgroundColor: "rgba(78,168,255,0.08)" }}>
            <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Dubai Öncesi</Text><Text style={{ color: theme.text, fontWeight: "900", marginTop: 4 }}>${fmtMoney(stats.preUsd, 0)}</Text>
          </View>
          <View style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: "rgba(255,209,112,0.30)", backgroundColor: "rgba(255,209,112,0.08)" }}>
            <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>İlk Ay</Text><Text style={{ color: theme.text, fontWeight: "900", marginTop: 4 }}>${fmtMoney(stats.firstUsd, 0)}</Text>
          </View>
        </View>
        <View style={{ marginTop: 12, flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
          <ToggleChip theme={theme} active={false} text="📦 Şablon Ekle" onPress={addStarterTemplate} />
          <ToggleChip theme={theme} active={false} text={`Bekleyen ${stats.unpaidCount}`} onPress={() => {}} />
          <ToggleChip theme={theme} active={false} text={`Kayıt ${stats.count}`} onPress={() => {}} />
        </View>
      </GlassCard>

      <GlassCard theme={theme} style={{ padding: 14, marginTop: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>➕ Masraf Ekle</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Masraf adı (örn: İlk 1 ay Airbnb)" placeholderTextColor={theme.sub} style={{ marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}><View style={{ flexDirection: "row", gap: 10 }}>{phaseOptions.map((p) => (<ToggleChip key={p.k} theme={theme} active={phase === p.k} text={p.label} onPress={() => setPhase(p.k)} />))}</View></ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}><View style={{ flexDirection: "row", gap: 10 }}>{categories.map((c) => (<ToggleChip key={c} theme={theme} active={category === c} text={c} onPress={() => setCategory(c)} />))}</View></ScrollView>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
          <View style={{ flex: 1 }}><TextInput value={amount} onChangeText={(v) => setAmount(moneyOnly(v))} keyboardType="numeric" placeholder="Tutar" placeholderTextColor={theme.sub} style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900" }} /></View>
          <View style={{ flexDirection: "row", gap: 8 }}>{["USD", "AED", "TL"].map((c) => (<ToggleChip key={c} theme={theme} active={currency === c} text={c} onPress={() => setCurrency(c)} />))}</View>
        </View>
        <TextInput value={note} onChangeText={setNote} placeholder="Not (opsiyonel)" placeholderTextColor={theme.sub} style={{ marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "800" }} />
        <TouchableOpacity onPress={addItem} style={{ marginTop: 12 }}><View style={{ paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.18)", alignItems: "center" }}><Text style={{ color: theme.text, fontWeight: "900" }}>Kayda Ekle</Text></View></TouchableOpacity>
      </GlassCard>

      {(["PRE_DXB", "FIRST_MONTH", "OPTIONAL"]).map((ph) => (
        <View key={ph} style={{ marginTop: 12 }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 15 }}>{phaseBadge(ph)} ({(grouped[ph] || []).length})</Text>
          {(grouped[ph] || []).length ? (grouped[ph] || []).map(renderItem) : (<GlassCard theme={theme} style={{ padding: 12, marginTop: 10 }}><Text style={{ color: theme.sub, fontWeight: "800" }}>Bu bölüm için henüz kayıt yok.</Text></GlassCard>)}
        </View>
      ))}
    </ScrollView>
  );
}

function StocksProScreen({ theme, t, S, setPatch, onRefresh, onToast, isActive }) {
  const [sortKey, setSortKey] = useState("rank");
  const [refreshing, setRefreshing] = useState(false);

  // Auto refresh (3 sn) — only when screen is active
  const refreshRef = useRef(onRefresh);
  useEffect(() => { refreshRef.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!isActive) return;
    let alive = true;
    const tick = async () => {
      if (!alive) return;
      try { 
        await refreshRef.current?.({ ignoreCache: true }); 
      } catch {}
    };
    tick();
    const timer = setInterval(tick, 3000);
    return () => { alive = false; clearInterval(timer); };
  }, [isActive]);

  const symbols = normalizeStockSymbols(S.stockSymbols || []);
  const quotes = Array.isArray(S.stockQuotes) ? S.stockQuotes : [];

  const quoteMap = useMemo(() => {
    const m = new Map();
    for (const q of quotes) m.set(String(q.symbol || "").toUpperCase(), q);
    return m;
  }, [quotes]);

  const topSymbols = useMemo(() => US_TOP_COMPANIES.map((x) => x.symbol), []);
  const topMerged = useMemo(() => {
    return US_TOP_COMPANIES.map((c, idx) => {
      const q = quoteMap.get(c.symbol) || null;
      return { rank: idx + 1, symbol: c.symbol, labelName: c.name, sector: c.sector, q };
    });
  }, [quoteMap]);

  const sortedRows = useMemo(() => {
    const arr = [...topMerged];
    if (sortKey === "price") arr.sort((a, b) => (Number(b.q?.price) || -1) - (Number(a.q?.price) || -1));
    else if (sortKey === "change") arr.sort((a, b) => (Number(b.q?.changePct) || -999) - (Number(a.q?.changePct) || -999));
    else if (sortKey === "mcap") arr.sort((a, b) => (Number(b.q?.marketCap) || -1) - (Number(a.q?.marketCap) || -1));
    else arr.sort((a, b) => a.rank - b.rank);
    return arr;
  }, [topMerged, sortKey]);

  const loadedCount = topMerged.filter((x) => x.q && Number.isFinite(Number(x.q.price))).length;
  const lastTxt = S.lastStocksISO ? new Date(S.lastStocksISO).toLocaleString() : "—";

  const loadTopList = async () => {
    const next = normalizeStockSymbols(topSymbols);
    setPatch({ stockSymbols: next, stockQuotes: (S.stockQuotes || []).filter((q) => next.includes(String(q.symbol || "").toUpperCase())) });
    setRefreshing(true);
    try {
      await new Promise((r) => setTimeout(r, 120));
      await onRefresh?.({ force: true, ignoreCache: true, symbolsOverride: next });
      onToast?.("📈", "ABD lider şirket listesi güncellendi");
    } catch {
      onToast?.("⚠️", "Borsa verisi yenilemede sorun oluştu");
    }
    setTimeout(() => setRefreshing(false), 500);
  };

  const manualRefresh = async () => {
    setRefreshing(true);
    try { await onRefresh?.({ force: true, ignoreCache: true }); onToast?.("📈", "Borsa verileri güncellendi"); } catch {}
    setTimeout(() => setRefreshing(false), 500);
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
      <GlassCard theme={theme} style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>{t.stocks || "Borsalar"}</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>ABD’nin en çok bilinen şirketleri • güncel fiyat • değişim • market cap • hacim</Text>
          </View>
          <TouchableOpacity onPress={manualRefresh}><View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.gold, backgroundColor: "rgba(255,209,112,0.16)" }}><Text style={{ color: theme.text, fontWeight: "900" }}>{refreshing ? "..." : "Yenile"}</Text></View></TouchableOpacity>
        </View>
        <Text style={{ color: theme.sub, marginTop: 10, fontWeight: "800" }}>Son güncelleme: {lastTxt}</Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <View style={{ flex: 1, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}>
            <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Liste</Text>
            <Text style={{ color: theme.text, fontWeight: "900", marginTop: 5 }}>ABD Lider Şirketler (Top 20)</Text>
            <Text style={{ color: theme.sub, marginTop: 4, fontWeight: "800", fontSize: 12 }}>Yüklü fiyat: {loadedCount}/20</Text>
          </View>
          <TouchableOpacity onPress={loadTopList} style={{ justifyContent: "center" }}><View style={{ paddingHorizontal: 12, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}><Text style={{ color: theme.text, fontWeight: "900", textAlign: "center" }}>{loadedCount < 20 ? "Top 20'yi Yükle" : "Listeyi Yenile"}</Text></View></TouchableOpacity>
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <ToggleChip theme={theme} active={sortKey === "rank"} text="Sıralı Liste" onPress={() => setSortKey("rank")} />
          <ToggleChip theme={theme} active={sortKey === "price"} text="Fiyat" onPress={() => setSortKey("price")} />
          <ToggleChip theme={theme} active={sortKey === "change"} text="Değişim %" onPress={() => setSortKey("change")} />
          <ToggleChip theme={theme} active={sortKey === "mcap"} text="M.Cap" onPress={() => setSortKey("mcap")} />
        </View>
      </GlassCard>

      <GlassCard theme={theme} style={{ padding: 14, marginTop: 12 }}>
        <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>🇺🇸 En Çok Bilinen Amerikan Şirketleri</Text>
        <Text style={{ color: theme.sub, marginTop: 6 }}>Fiyatlar uygulama içinden canlı olarak çekilir. İlk açılışta “Top 20'yi Yükle” ile listeyi güncelle.</Text>
      </GlassCard>

      {sortedRows.map((row) => {
        const q = row.q;
        const up = Number(q?.changePct || 0) >= 0;
        const hasData = !!q && Number.isFinite(Number(q.price));
        return (
          <GlassCard key={row.symbol} theme={theme} style={{ padding: 14, marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {(() => {
                  const uri = stockLogoUri(row.symbol);
                  if (!uri) {
                    return <Text style={{ color: theme.text, fontWeight: "900" }}>{String(row.symbol || "").slice(0, 2)}</Text>;
                  }
                  return (
                    <Image
                      source={{ uri }}
                      style={{ width: 40, height: 40, borderRadius: 14 }}
                      resizeMode="contain"
                      onError={() => {}}
                    />
                  );
                })()}
                <View style={{ position: "absolute", right: -6, bottom: -6, width: 26, height: 26, borderRadius: 10, backgroundColor: "rgba(255,209,112,0.18)", borderWidth: 1, borderColor: theme.gold, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 12 }}>{row.rank}</Text>
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{row.symbol}</Text>
                  <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2 }}><Text style={{ color: theme.sub, fontWeight: "900", fontSize: 11 }}>{row.sector}</Text></View>
                  {hasData && <View style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, borderWidth: 1, borderColor: up ? "rgba(123,255,178,0.35)" : "rgba(255,99,132,0.35)", backgroundColor: up ? "rgba(123,255,178,0.12)" : "rgba(255,99,132,0.10)" }}><Text style={{ color: up ? theme.green : theme.red, fontWeight: "900", fontSize: 11 }}>{up ? "+" : ""}{Number.isFinite(q?.changePct) ? fmtMoney(q.changePct, 2) : "—"}%</Text></View>}
                </View>
                <Text style={{ color: theme.sub, marginTop: 5 }} numberOfLines={1}>{q?.name || row.labelName}</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 10 }}>
                  <Text style={{ color: theme.text, fontWeight: "900", fontSize: 24 }}>{hasData ? `${q?.currency === "USD" ? "$" : ""}${fmtMoney(q.price, 2)}` : "Veri bekleniyor"}</Text>
                  {hasData ? <Text style={{ color: up ? theme.green : theme.red, fontWeight: "900" }}>{up ? "+" : ""}{Number.isFinite(q?.change) ? fmtMoney(q.change, 2) : "—"}</Text> : <Text style={{ color: theme.sub, fontWeight: "800" }}>Yenile</Text>}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                  <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke }}><Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>M.Cap: {hasData ? formatCompactNum(q?.marketCap) : "—"}</Text></View>
                  <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke }}><Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Hacim: {hasData ? formatCompactNum(q?.volume) : "—"}</Text></View>
                  <View style={{ paddingHorizontal: 9, paddingVertical: 6, borderRadius: 10, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke }}><Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>{q?.exchange || "US Market"}</Text></View>
                </View>
              </View>
            </View>
          </GlassCard>
        );
      })}
    </ScrollView>
  );
}


/* =========================
   Games Hub (Mini Arcade)
   Premium v2 — polished UI + more games
========================= */
function GamesHub({ theme, t, S, setPatch, onToast }) {
  const [open, setOpen] = useState(false);
  const [gameKey, setGameKey] = useState(null);

  const scores = (S && typeof S.gameScores === "object" && S.gameScores) ? S.gameScores : {};

  const setScore = (key, patch) => {
    const prev = scores?.[key] || {};
    const next = { ...scores, [key]: { ...prev, ...patch } };
    setPatch({ gameScores: next });
  };

  const GAMES = [
    { k: "tap", name: "Tap Rush", icon: "⚡", desc: "30 sn • refleks • en yüksek skor", bestType: "score" },
    { k: "react", name: "Reaction", icon: "🟢", desc: "ms ölçümü • false start cezası", bestType: "ms" },
    { k: "aim", name: "Aim Trainer", icon: "🎯", desc: "20 sn • hedef vur • combo", bestType: "score" },
    { k: "stroop", name: "Color Match", icon: "🎨", desc: "Stroop testi • doğruluk %", bestType: "pct" },
    { k: "math", name: "Quick Math", icon: "🧠", desc: "45 sn • doğru seçenek • streak", bestType: "score" },
    { k: "rps", name: "Taş Kağıt Makas", icon: "✊", desc: "AI vs • win streak", bestType: "score" },
    { k: "memory", name: "Memory Match", icon: "🃏", desc: "eşleştir • daha az hamle", bestType: "moves" },
    { k: "ttt", name: "Tic Tac Toe", icon: "❎", desc: "AI vs • daha akıllı", bestType: "wins" },
  ];

  const openGame = (k) => { setGameKey(k); setOpen(true); };
  const closeGame = () => { setOpen(false); setTimeout(() => setGameKey(null), 60); };

  const bestLabelFor = (g) => {
    const sc = scores?.[g.k] || {};
    if (g.bestType === "ms") return sc.bestMs ? `${sc.bestMs} ms` : "—";
    if (g.bestType === "moves") return (Number.isFinite(sc.bestMoves) && sc.bestMoves !== 99999) ? `${sc.bestMoves} hamle` : "—";
    if (g.bestType === "pct") return Number.isFinite(sc.bestPct) ? `${fmtMoney(sc.bestPct, 1)}%` : "—";
    if (g.bestType === "wins") return Number.isFinite(sc.wins) ? String(sc.wins) : (Number.isFinite(sc.best) ? String(sc.best) : "0");
    return Number.isFinite(sc.best) ? String(sc.best) : "—";
  };

  const totalPlayed = useMemo(() => {
    return GAMES.reduce((sum, g) => sum + (Number(scores?.[g.k]?.played || 0) || 0), 0);
  }, [S?.gameScores]);

  const GameBody = () => {
    if (gameKey === "tap") return <GameTapRushPremium theme={theme} onToast={onToast} score={scores.tap} onScore={(p) => setScore("tap", p)} />;
    if (gameKey === "react") return <GameReactionPremium theme={theme} onToast={onToast} score={scores.react} onScore={(p) => setScore("react", p)} />;
    if (gameKey === "aim") return <GameAimTrainer theme={theme} onToast={onToast} score={scores.aim} onScore={(p) => setScore("aim", p)} />;
    if (gameKey === "stroop") return <GameColorMatch theme={theme} onToast={onToast} score={scores.stroop} onScore={(p) => setScore("stroop", p)} />;
    if (gameKey === "math") return <GameQuickMathPremium theme={theme} onToast={onToast} score={scores.math} onScore={(p) => setScore("math", p)} />;
    if (gameKey === "rps") return <GameRPSPremium theme={theme} onToast={onToast} score={scores.rps} onScore={(p) => setScore("rps", p)} />;
    if (gameKey === "memory") return <GameMemoryPremium theme={theme} onToast={onToast} score={scores.memory} onScore={(p) => setScore("memory", p)} />;
    if (gameKey === "ttt") return <GameTicTacToePremium theme={theme} onToast={onToast} score={scores.ttt} onScore={(p) => setScore("ttt", p)} />;
    return null;
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 18 }}>
      <GlassCard theme={theme} style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>{t.games || "Oyunlar"}</Text>
            <Text style={{ color: theme.sub, marginTop: 6 }}>Mini Arcade • premium mini oyunlar • skorlar kaydedilir</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Toplam oynama</Text>
            <Text style={{ color: theme.gold, fontWeight: "900", marginTop: 2 }}>{totalPlayed}</Text>
          </View>
        </View>
      </GlassCard>

      {GAMES.map((g) => {
        const bestLabel = bestLabelFor(g);
        return (
          <TouchableOpacity key={g.k} onPress={() => openGame(g.k)} activeOpacity={0.92} style={{ marginTop: 12 }}>
            <GlassCard theme={theme} style={{ padding: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
                  <View style={{ width: 54, height: 54, borderRadius: 20, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ fontSize: 22 }}>{g.icon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontWeight: "900", fontSize: 16 }}>{g.name}</Text>
                    <Text style={{ color: theme.sub, marginTop: 4 }} numberOfLines={1}>{g.desc}</Text>
                    <View style={{ flexDirection: "row", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke }}>
                        <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Best: <Text style={{ color: theme.gold, fontWeight: "900" }}>{bestLabel}</Text></Text>
                      </View>
                      <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke }}>
                        <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>Oyna</Text>
                      </View>
                    </View>
                  </View>
                </View>
                <Text style={{ color: theme.sub, fontWeight: "900", fontSize: 22 }}>›</Text>
              </View>
            </GlassCard>
          </TouchableOpacity>
        );
      })}

      <Modal transparent visible={open} animationType="fade" onRequestClose={closeGame}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.68)" }}>
          <SafeAreaView style={{ flex: 1, padding: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <View style={{ width: 36, height: 36, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ fontSize: 16 }}>🎮</Text>
                </View>
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 16 }}>{t.games || "Oyunlar"}</Text>
              </View>
              <TouchableOpacity onPress={closeGame} activeOpacity={0.85}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.10)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" }}>
                  <Text style={{ color: "#fff", fontWeight: "900" }}>Kapat</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={{ flex: 1, marginTop: 12 }}>
              <GameBody />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </ScrollView>
  );
}

function GameShell({ theme, title, subtitle, rightStat, children, footer }) {
  return (
    <View style={{ flex: 1 }}>
      <GlassCard theme={theme} style={{ padding: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.text, fontWeight: "900", fontSize: 18 }}>{title}</Text>
            {!!subtitle && <Text style={{ color: theme.sub, marginTop: 6 }}>{subtitle}</Text>}
          </View>
          {!!rightStat && (
            <View style={{ alignItems: "flex-end" }}>
              {rightStat}
            </View>
          )}
        </View>
      </GlassCard>
      <View style={{ flex: 1, marginTop: 12 }}>{children}</View>
      {!!footer && <View style={{ marginTop: 12 }}>{footer}</View>}
    </View>
  );
}

function GamePrimaryButton({ theme, text, onPress, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  const pressIn = () => Animated.spring(scale, { toValue: 0.98, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  const pressOut = () => Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 6 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }], opacity: disabled ? 0.6 : 1 }}>
      <Pressable
        onPress={disabled ? undefined : onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        style={{ paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(255,209,112,0.18)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}
      >
        <Text style={{ color: theme.text, fontWeight: "900" }}>{text}</Text>
      </Pressable>
    </Animated.View>
  );
}

function StatBox({ theme, label, value }) {
  return (
    <View style={{ paddingVertical: 12, borderRadius: 16, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
      <Text style={{ color: theme.sub, fontWeight: "800", fontSize: 12 }}>{label}</Text>
      <Text style={{ color: theme.gold, fontWeight: "900", marginTop: 2 }}>{value}</Text>
    </View>
  );
}

/* ---------- Tap Rush (premium) ---------- */
function GameTapRushPremium({ theme, onToast, score, onScore }) {
  const [running, setRunning] = useState(false);
  const [tLeft, setTLeft] = useState(30);
  const [taps, setTaps] = useState(0);

  useEffect(() => {
    if (!running) return;
    let alive = true;
    const timer = setInterval(() => {
      if (!alive) return;
      setTLeft((p) => p - 1);
    }, 1000);
    return () => { alive = false; clearInterval(timer); };
  }, [running]);

  useEffect(() => {
    if (!running) return;
    if (tLeft > 0) return;
    setRunning(false);
    const best = Math.max(Number(score?.best || 0), taps);
    onScore?.({ best, last: taps, played: (score?.played || 0) + 1 });
    onToast?.("⚡", `Bitti! Skor: ${taps}`);
  }, [tLeft, running, taps]);

  const start = () => { setTaps(0); setTLeft(30); setRunning(true); };

  return (
    <GameShell
      theme={theme}
      title="Tap Rush"
      subtitle="30 saniyede olabildiğince hızlı dokun."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Best: <Text style={{ color: theme.gold }}>{score?.best ?? 0}</Text></Text>}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><GamePrimaryButton theme={theme} text={running ? "Restart" : "Start"} onPress={start} /></View>
          <View style={{ flex: 1 }}><StatBox theme={theme} label="Kalan" value={tLeft} /></View>
        </View>
      }
    >
      <Pressable onPress={() => running && setTaps((p) => p + 1)} style={{ flex: 1 }}>
        <GlassCard theme={theme} style={{ flex: 1, padding: 18, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.sub, fontWeight: "900" }}>Skor</Text>
          <Text style={{ color: theme.gold, fontWeight: "900", fontSize: 64, marginTop: 6 }}>{taps}</Text>
          <Text style={{ color: theme.sub, marginTop: 14, fontWeight: "800" }}>{running ? "Ekrana dokun!" : "Start ile başlat"}</Text>
        </GlassCard>
      </Pressable>
    </GameShell>
  );
}

/* ---------- Reaction (premium) ---------- */
function GameReactionPremium({ theme, onToast, score, onScore }) {
  const [phase, setPhase] = useState("idle"); // idle | wait | go
  const [msg, setMsg] = useState("Start'e bas. Yeşil olunca dokun!");
  const [ms, setMs] = useState(null);
  const startAtRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => () => { try { if (timerRef.current) clearTimeout(timerRef.current); } catch {} }, []);

  const start = () => {
    if (timerRef.current) { try { clearTimeout(timerRef.current); } catch {} }
    setMs(null);
    setPhase("wait");
    setMsg("Hazır ol…");
    const delay = 900 + Math.floor(Math.random() * 2200);
    timerRef.current = setTimeout(() => {
      startAtRef.current = Date.now();
      setPhase("go");
      setMsg("ŞİMDİ!");
    }, delay);
  };

  const tap = () => {
    if (phase === "wait") {
      // false start
      if (timerRef.current) { try { clearTimeout(timerRef.current); } catch {} }
      setPhase("idle");
      setMsg("Erken bastın 😅 Tekrar dene.");
      onToast?.("⚠️", "False start!");
      return;
    }
    if (phase !== "go") return;
    const v = Math.max(0, Date.now() - startAtRef.current);
    setMs(v);
    setPhase("idle");
    setMsg("Start ile yeniden dene");
    const bestMs = Math.min(Number(score?.bestMs || 999999), v);
    onScore?.({ bestMs, lastMs: v, played: (score?.played || 0) + 1 });
    onToast?.("🟢", `${v} ms`);
  };

  const bg = phase === "go" ? "rgba(123,255,178,0.16)" : theme.glass2;
  const border = phase === "go" ? "rgba(123,255,178,0.35)" : theme.stroke;

  return (
    <GameShell
      theme={theme}
      title="Reaction"
      subtitle="Yeşil olunca dokun. Erken dokunursan ceza."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Best: <Text style={{ color: theme.gold }}>{score?.bestMs ? `${score.bestMs} ms` : "—"}</Text></Text>}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><GamePrimaryButton theme={theme} text="Start" onPress={start} /></View>
          <View style={{ flex: 1 }}><StatBox theme={theme} label="Son" value={ms ? `${ms} ms` : "—"} /></View>
        </View>
      }
    >
      <Pressable onPress={tap} style={{ flex: 1 }}>
        <GlassCard theme={theme} style={{ flex: 1, padding: 18, alignItems: "center", justifyContent: "center", backgroundColor: bg, borderColor: border, borderWidth: 1 }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 22 }}>{msg}</Text>
          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "800" }}>Dokunmak için alanın tamamını kullanabilirsin</Text>
        </GlassCard>
      </Pressable>
    </GameShell>
  );
}

/* ---------- Aim Trainer ---------- */
function GameAimTrainer({ theme, onToast, score, onScore }) {
  const [running, setRunning] = useState(false);
  const [tLeft, setTLeft] = useState(20);
  const [hits, setHits] = useState(0);
  const [combo, setCombo] = useState(0);
  const boxRef = useRef({ w: 260, h: 360 });
  const pos = useRef(new Animated.ValueXY({ x: 90, y: 130 })).current;

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTLeft((p) => p - 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    if (tLeft > 0) return;
    setRunning(false);
    const best = Math.max(Number(score?.best || 0), hits);
    onScore?.({ best, last: hits, played: (score?.played || 0) + 1 });
    onToast?.("🎯", `Bitti! Hit: ${hits}`);
  }, [tLeft, running, hits]);

  const moveTarget = () => {
    const { w, h } = boxRef.current;
    const nx = Math.max(10, Math.floor(Math.random() * (w - 70)));
    const ny = Math.max(10, Math.floor(Math.random() * (h - 70)));
    Animated.spring(pos, { toValue: { x: nx, y: ny }, useNativeDriver: true, speed: 18, bounciness: 8 }).start();
  };

  const start = () => {
    setHits(0);
    setCombo(0);
    setTLeft(20);
    setRunning(true);
    setTimeout(moveTarget, 80);
  };

  const hit = () => {
    if (!running) return;
    setHits((p) => p + 1);
    setCombo((p) => p + 1);
    moveTarget();
  };

  return (
    <GameShell
      theme={theme}
      title="Aim Trainer"
      subtitle="Hedefe dokun. 20 saniyede en çok hit."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Best: <Text style={{ color: theme.gold }}>{score?.best ?? 0}</Text></Text>}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><GamePrimaryButton theme={theme} text={running ? "Restart" : "Start"} onPress={start} /></View>
          <View style={{ flex: 1 }}><StatBox theme={theme} label="Kalan" value={tLeft} /></View>
        </View>
      }
    >
      <GlassCard
        theme={theme}
        style={{ flex: 1, padding: 14, overflow: "hidden" }}
      >
        <View
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            boxRef.current = { w: width, h: height };
          }}
          style={{ flex: 1, borderRadius: 18, borderWidth: 1, borderColor: theme.stroke, backgroundColor: theme.glass2, overflow: "hidden" }}
        >
          <Animated.View style={{ position: "absolute", transform: [{ translateX: pos.x }, { translateY: pos.y }] }}>
            <Pressable onPress={hit} style={{ width: 58, height: 58, borderRadius: 24, backgroundColor: "rgba(255,209,112,0.18)", borderWidth: 1, borderColor: theme.gold, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ fontSize: 18 }}>🎯</Text>
            </Pressable>
          </Animated.View>

          <View style={{ position: "absolute", left: 12, top: 12, flexDirection: "row", gap: 8 }}>
            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke }}>
              <Text style={{ color: theme.sub, fontWeight: "900" }}>Hit: <Text style={{ color: theme.text }}>{hits}</Text></Text>
            </View>
            <View style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke }}>
              <Text style={{ color: theme.sub, fontWeight: "900" }}>Combo: <Text style={{ color: theme.gold }}>{combo}</Text></Text>
            </View>
          </View>

          {!running && (
            <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: theme.sub, fontWeight: "800" }}>Start ile başlat</Text>
            </View>
          )}
        </View>
      </GlassCard>
    </GameShell>
  );
}

/* ---------- Color Match (Stroop) ---------- */
function GameColorMatch({ theme, onToast, score, onScore }) {
  const COLORS = [
    { k: "RED", label: "KIRMIZI", color: "#ff4d6d" },
    { k: "GREEN", label: "YEŞİL", color: "#3dfc8a" },
    { k: "BLUE", label: "MAVİ", color: "#4dabff" },
    { k: "YELLOW", label: "SARI", color: "#ffd170" },
  ];

  const [running, setRunning] = useState(false);
  const [tLeft, setTLeft] = useState(25);
  const [q, setQ] = useState(null);
  const [right, setRight] = useState(0);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTLeft((p) => p - 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    if (tLeft > 0) return;
    setRunning(false);
    const pct = total > 0 ? (right / total) * 100 : 0;
    const bestPct = Math.max(Number(score?.bestPct || 0), pct);
    onScore?.({ bestPct, lastPct: pct, played: (score?.played || 0) + 1 });
    onToast?.("🎨", `Doğruluk: ${fmtMoney(pct, 1)}%`);
  }, [tLeft, running, right, total]);

  const newQ = () => {
    // text and ink color may differ
    const text = COLORS[Math.floor(Math.random() * COLORS.length)];
    const ink = COLORS[Math.floor(Math.random() * COLORS.length)];
    setQ({ text, ink });
  };

  const start = () => {
    setRight(0);
    setTotal(0);
    setTLeft(25);
    setRunning(true);
    setTimeout(newQ, 80);
  };

  const pick = (k) => {
    if (!running || !q) return;
    const ok = k === q.ink.k;
    setTotal((p) => p + 1);
    if (ok) setRight((p) => p + 1);
    newQ();
  };

  const pctNow = total > 0 ? (right / total) * 100 : 0;

  return (
    <GameShell
      theme={theme}
      title="Color Match"
      subtitle="Yazının rengine göre seç. Metne değil renge odaklan."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Best: <Text style={{ color: theme.gold }}>{Number.isFinite(score?.bestPct) ? `${fmtMoney(score.bestPct, 1)}%` : "—"}</Text></Text>}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><GamePrimaryButton theme={theme} text={running ? "Restart" : "Start"} onPress={start} /></View>
          <View style={{ flex: 1 }}><StatBox theme={theme} label="Kalan" value={tLeft} /></View>
        </View>
      }
    >
      <GlassCard theme={theme} style={{ flex: 1, padding: 16 }}>
        <View style={{ alignItems: "center", justifyContent: "center", flex: 1 }}>
          <Text style={{ color: theme.sub, fontWeight: "900" }}>Doğruluk</Text>
          <Text style={{ color: theme.gold, fontWeight: "900", fontSize: 34, marginTop: 6 }}>{fmtMoney(pctNow, 1)}%</Text>

          <View style={{ marginTop: 22, paddingVertical: 18, paddingHorizontal: 18, borderRadius: 18, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke, minWidth: "80%", alignItems: "center" }}>
            <Text style={{ fontWeight: "900", fontSize: 34, color: q?.ink?.color || theme.text }}>{q?.text?.label || "Start"}</Text>
            <Text style={{ color: theme.sub, marginTop: 8, fontWeight: "800" }}>{running ? "RENGE göre seç" : "Start ile başlat"}</Text>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center", marginTop: 18 }}>
            {COLORS.map((c) => (
              <Pressable key={c.k} onPress={() => pick(c.k)} style={{ width: "46%" }}>
                <View style={{ paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                  <Text style={{ color: c.color, fontWeight: "900" }}>{c.label}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </GlassCard>
    </GameShell>
  );
}

/* ---------- Quick Math (premium) ---------- */
function GameQuickMathPremium({ theme, onToast, score, onScore }) {
  const [running, setRunning] = useState(false);
  const [tLeft, setTLeft] = useState(45);
  const [q, setQ] = useState(null);
  const [pts, setPts] = useState(0);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setTLeft((p) => p - 1), 1000);
    return () => clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running) return;
    if (tLeft > 0) return;
    setRunning(false);
    const best = Math.max(Number(score?.best || 0), pts);
    onScore?.({ best, last: pts, bestStreak: Math.max(Number(score?.bestStreak || 0), streak), played: (score?.played || 0) + 1 });
    onToast?.("🧠", `Bitti! Puan: ${pts}`);
  }, [tLeft, running, pts, streak]);

  const makeQ = () => {
    const a = 2 + Math.floor(Math.random() * 30);
    const b = 2 + Math.floor(Math.random() * 30);
    const op = ["+", "-", "×"][Math.floor(Math.random() * 3)];
    let ans = a + b;
    if (op === "-") ans = a - b;
    if (op === "×") ans = a * b;

    const choices = new Set([ans]);
    while (choices.size < 4) {
      const delta = (Math.floor(Math.random() * 9) + 1) * (Math.random() < 0.5 ? -1 : 1);
      choices.add(ans + delta);
    }
    const arr = Array.from(choices);
    // shuffle
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    setQ({ a, b, op, ans, options: arr });
  };

  const start = () => {
    setPts(0);
    setStreak(0);
    setTLeft(45);
    setRunning(true);
    setTimeout(makeQ, 80);
  };

  const pick = (v) => {
    if (!running || !q) return;
    const ok = Number(v) === Number(q.ans);
    if (ok) {
      setPts((p) => p + 1 + Math.min(3, Math.floor(streak / 5)));
      setStreak((p) => p + 1);
    } else {
      setStreak(0);
    }
    makeQ();
  };

  return (
    <GameShell
      theme={theme}
      title="Quick Math"
      subtitle="Hızlı çöz, doğru seç. Streak ile bonus puan."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Best: <Text style={{ color: theme.gold }}>{score?.best ?? 0}</Text></Text>}
      footer={
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><GamePrimaryButton theme={theme} text={running ? "Restart" : "Start"} onPress={start} /></View>
          <View style={{ flex: 1 }}><StatBox theme={theme} label="Kalan" value={tLeft} /></View>
        </View>
      }
    >
      <GlassCard theme={theme} style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <View style={{ flex: 1 }}><StatBox theme={theme} label="Puan" value={pts} /></View>
          <View style={{ flex: 1 }}><StatBox theme={theme} label="Streak" value={streak} /></View>
        </View>

        <View style={{ marginTop: 14, flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.text, fontWeight: "900", fontSize: 42 }}>
            {q ? `${q.a} ${q.op} ${q.b}` : "Start"}
          </Text>
          <Text style={{ color: theme.sub, marginTop: 8, fontWeight: "800" }}>{running ? "Doğru cevabı seç" : "Start ile başlat"}</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 18, justifyContent: "center" }}>
            {(q?.options || ["—", "—", "—", "—"]).map((v, idx) => (
              <Pressable key={idx} onPress={() => pick(v)} style={{ width: "46%" }}>
                <View style={{ paddingVertical: 12, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                  <Text style={{ color: theme.text, fontWeight: "900" }}>{v}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </GlassCard>
    </GameShell>
  );
}

/* ---------- RPS (premium) ---------- */
function GameRPSPremium({ theme, onToast, score, onScore }) {
  const [streak, setStreak] = useState(0);
  const [last, setLast] = useState("Seçimini yap");

  const beats = { R: "S", P: "R", S: "P" };
  const label = { R: "Taş", P: "Kağıt", S: "Makas" };
  const icon = { R: "✊", P: "✋", S: "✌️" };

  const play = (me) => {
    const ai = ["R", "P", "S"][Math.floor(Math.random() * 3)];
    if (ai === me) {
      setLast(`Berabere • ${icon[me]} vs ${icon[ai]}`);
      onToast?.("🤝", "Berabere");
      return;
    }
    const win = beats[me] === ai;
    if (win) {
      const ns = streak + 1;
      setStreak(ns);
      const best = Math.max(Number(score?.best || 0), ns);
      onScore?.({ best, last: ns, played: (score?.played || 0) + 1 });
      setLast(`Kazandın • ${icon[me]} ${label[me]} > ${icon[ai]} ${label[ai]}  (Streak ${ns})`);
      onToast?.("🔥", `Streak: ${ns}`);
    } else {
      setStreak(0);
      onScore?.({ best: Math.max(Number(score?.best || 0), streak), last: 0, played: (score?.played || 0) + 1 });
      setLast(`Kaybettin • ${icon[ai]} ${label[ai]} > ${icon[me]} ${label[me]}`);
      onToast?.("😅", "Kaybettin");
    }
  };

  return (
    <GameShell
      theme={theme}
      title="Taş Kağıt Makas"
      subtitle="AI vs • streak kas."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Best: <Text style={{ color: theme.gold }}>{score?.best ?? 0}</Text></Text>}
      footer={<StatBox theme={theme} label="Streak" value={streak} />}
    >
      <GlassCard theme={theme} style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: theme.text, fontWeight: "900" }}>{last}</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          {["R", "P", "S"].map((k) => (
            <Pressable key={k} onPress={() => play(k)} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 14, borderRadius: 16, backgroundColor: "rgba(0,0,0,0.22)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ fontSize: 22 }}>{icon[k]}</Text>
                <Text style={{ color: theme.sub, fontWeight: "900", marginTop: 6 }}>{label[k]}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </GlassCard>
    </GameShell>
  );
}

/* ---------- Memory (premium) ---------- */
function GameMemoryPremium({ theme, onToast, score, onScore }) {
  const icons = ["🐪","🏙️","🧿","🪙","🚗","🌴","🎆","🕌"]; // 8 pairs
  const [deck, setDeck] = useState([]);
  const [openIdx, setOpenIdx] = useState(null);
  const [lock, setLock] = useState(false);
  const [moves, setMoves] = useState(0);

  const reset = () => {
    const cards = listShuffle([...icons, ...icons]).map((v, i) => ({ id: i + "_" + v, v, open: false, done: false }));
    setDeck(cards);
    setOpenIdx(null);
    setLock(false);
    setMoves(0);
  };

  useEffect(() => { if (deck.length === 0) reset(); }, []);

  const tap = (i) => {
    if (lock) return;
    const c = deck[i];
    if (!c || c.done || c.open) return;

    const next = deck.map((x, idx) => idx === i ? { ...x, open: true } : x);
    setDeck(next);

    if (openIdx === null) {
      setOpenIdx(i);
      return;
    }

    setMoves((p) => p + 1);
    const a = next[openIdx];
    const b = next[i];
    if (a.v === b.v) {
      const nn = next.map((x, idx) => (idx === openIdx || idx === i) ? { ...x, done: true, open: true } : x);
      setDeck(nn);
      setOpenIdx(null);
      if (nn.every((x) => x.done)) {
        const bestMoves = Math.min(Number(score?.bestMoves || 99999), moves + 1);
        onScore?.({ bestMoves, lastMoves: moves + 1, played: (score?.played || 0) + 1 });
        onToast?.("🃏", `Bitti! Hamle: ${moves + 1}`);
      }
    } else {
      setLock(true);
      setTimeout(() => {
        setDeck((p) => p.map((x, idx) => (idx === openIdx || idx === i) ? { ...x, open: false } : x));
        setOpenIdx(null);
        setLock(false);
      }, 520);
    }
  };

  const bestLabel = (score?.bestMoves && score.bestMoves !== 99999) ? `${score.bestMoves} hamle` : "—";

  return (
    <GameShell
      theme={theme}
      title="Memory Match"
      subtitle="Eşleşen kartları bul. Daha az hamle = daha iyi."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Best: <Text style={{ color: theme.gold }}>{bestLabel}</Text></Text>}
      footer={<GamePrimaryButton theme={theme} text="Reset" onPress={reset} />}
    >
      <GlassCard theme={theme} style={{ flex: 1, padding: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: theme.sub, fontWeight: "900" }}>Hamle: <Text style={{ color: theme.gold }}>{moves}</Text></Text>
          <Text style={{ color: lock ? theme.red : theme.sub, fontWeight: "900" }}>{lock ? "Bekle" : ""}</Text>
        </View>

        <View style={{ marginTop: 14, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 10 }}>
          {deck.map((c, i) => (
            <Pressable key={c.id} onPress={() => tap(i)} style={{ width: "22%" }}>
              <View style={{ aspectRatio: 1, borderRadius: 16, borderWidth: 1, borderColor: theme.stroke, backgroundColor: c.open || c.done ? "rgba(255,209,112,0.14)" : "rgba(0,0,0,0.22)", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ fontSize: 22 }}>{c.open || c.done ? c.v : "❓"}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </GlassCard>
    </GameShell>
  );
}

/* ---------- TicTacToe (premium + smarter AI) ---------- */
function GameTicTacToePremium({ theme, onToast, score, onScore }) {
  const [b, setB] = useState(Array(9).fill(null));
  const [done, setDone] = useState(false);

  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6],
  ];

  const winner = (bb) => {
    for (const [a,c,d] of lines) {
      if (bb[a] && bb[a] === bb[c] && bb[a] === bb[d]) return bb[a];
    }
    if (bb.every(Boolean)) return "D";
    return null;
  };

  const reset = () => { setB(Array(9).fill(null)); setDone(false); };

  const findWinningMove = (bb, sym) => {
    for (let i = 0; i < 9; i++) {
      if (bb[i]) continue;
      const t = bb.slice();
      t[i] = sym;
      if (winner(t) === sym) return i;
    }
    return null;
  };

  const aiMove = (bb) => {
    // win
    const w = findWinningMove(bb, "O");
    if (w !== null) { const t = bb.slice(); t[w] = "O"; return t; }
    // block
    const blk = findWinningMove(bb, "X");
    if (blk !== null) { const t = bb.slice(); t[blk] = "O"; return t; }
    // center
    if (!bb[4]) { const t = bb.slice(); t[4] = "O"; return t; }
    // corners
    const corners = [0,2,6,8].filter((i) => !bb[i]);
    if (corners.length) { const t = bb.slice(); t[corners[Math.floor(Math.random()*corners.length)]] = "O"; return t; }
    // rest
    const empties = bb.map((v,i) => v ? null : i).filter((x) => x != null);
    if (!empties.length) return bb;
    const i = empties[Math.floor(Math.random() * empties.length)];
    const t = bb.slice(); t[i] = "O"; return t;
  };

  const tap = (i) => {
    if (done) return;
    if (b[i]) return;
    let next = b.slice();
    next[i] = "X";
    const w1 = winner(next);
    if (w1) {
      setB(next);
      setDone(true);
      if (w1 === "X") {
        const wins = (score?.wins || 0) + 1;
        onScore?.({ wins, last: 1, played: (score?.played || 0) + 1 });
        onToast?.("❎", "Kazandın!");
      }
      return;
    }
    next = aiMove(next);
    const w2 = winner(next);
    setB(next);
    if (w2) {
      setDone(true);
      if (w2 === "O") onToast?.("🤖", "AI kazandı");
      else onToast?.("🤝", "Berabere");
    }
  };

  const winsLabel = String(score?.wins ?? 0);

  return (
    <GameShell
      theme={theme}
      title="Tic Tac Toe"
      subtitle="X sensin, O AI. Daha akıllı AI ile hızlı maç."
      rightStat={<Text style={{ color: theme.sub, fontWeight: "900" }}>Wins: <Text style={{ color: theme.gold }}>{winsLabel}</Text></Text>}
      footer={<GamePrimaryButton theme={theme} text="Yeni Oyun" onPress={reset} />}
    >
      <GlassCard theme={theme} style={{ flex: 1, padding: 16, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 300, flexDirection: "row", flexWrap: "wrap" }}>
          {b.map((v, i) => (
            <Pressable key={i} onPress={() => tap(i)} style={{ width: "33.33%" }}>
              <View style={{ aspectRatio: 1, borderWidth: 1, borderColor: theme.stroke, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.22)" }}>
                <Text style={{ color: theme.text, fontWeight: "900", fontSize: 36 }}>{v || ""}</Text>
              </View>
            </Pressable>
          ))}
        </View>
        <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "800" }}>{done ? "Oyun bitti" : "Sıra sende"}</Text>
      </GlassCard>
    </GameShell>
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
        { k: "stocks", label: t.stocks || "Borsalar", icon: "📈", sub: "ABD borsası • Watchlist • Güncel veriler" },
        { k: "news", label: t.news, icon: "📰", sub: "Güncel akış • Başlıklar" },
      ],
    },
    {
      title: "Araçlar",
      items: [
        { k: "expensesPlan", label: t.expenseList || "Masraflar Listesi", icon: "💸", sub: "Dubai öncesi + ilk ay • plan • ödeme takibi" },
        { k: "todo", label: t.todoTitle, icon: "todo", sub: "Plan • Checklist • Etiket" },
        { k: "games", label: t.games || "Oyunlar", icon: "🎮", sub: "Mini arcade • modern mini oyunlar" },
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
  open, theme, t,
  saveName, setSaveName,
  onClose,
  onSaveFile,
  onLoadFile,
  onExportCode,
  onImportCode,
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
            SaveApp(File) ile yedek dosyası oluştur. LoadApp(File) ile telefondan dosyayı seçip geri yükle.
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
            <TouchableOpacity onPress={onSaveFile} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,209,112,0.18)", borderWidth: 1, borderColor: theme.gold, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.saveApp} (File)</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onLoadFile} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(76,190,255,0.14)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.loadApp} (File)</Text>
              </View>
            </TouchableOpacity>
          </View>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
            <TouchableOpacity onPress={onExportCode} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: theme.glass2, borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.exportCode}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={onImportCode} style={{ flex: 1 }}>
              <View style={{ paddingVertical: 12, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: theme.stroke, alignItems: "center" }}>
                <Text style={{ color: theme.text, fontWeight: "900" }}>{t.importCode}</Text>
              </View>
            </TouchableOpacity>
          </View>

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

function TargetsModalTL({ open, theme, t, autoIncome30dTl, manualMonthlyTl, manualDailyTl, travelDateISO, dailySuccessPct, monthlySuccessPct, dailyColor, monthlyColor, onClose, onSave }) {
  const [m, setM] = useState(String(manualMonthlyTl || 120000));
  const [d, setD] = useState(String(manualDailyTl || 5000));
  const [td, setTd] = useState(String(toYMD(travelDateISO || nowISO())));
  useEffect(() => {
    if (open) {
      setM(String(manualMonthlyTl || 120000));
      setD(String(manualDailyTl || 5000));
      setTd(String(toYMD(travelDateISO || nowISO())));
    }
  }, [open, manualMonthlyTl, manualDailyTl, travelDateISO]);

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

          <Text style={{ color: theme.sub, marginTop: 12, fontWeight: "900" }}>Hedef Günü (YYYY-AA-GG)</Text>
          <TextInput
            value={td}
            onChangeText={setTd}
            placeholder="2026-12-31"
            placeholderTextColor={theme.sub}
            style={{ marginTop: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: theme.stroke, color: theme.text, backgroundColor: theme.glass2, fontWeight: "900" }}
          />
          <Text style={{ color: theme.sub, marginTop: 6, fontWeight: "800", fontSize: 12 }}>
            Hedef gününü değiştirince “Dubai’ye kalan gün” hesaplaması güncellenir.
          </Text>


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
              const iso = parseUserDateToISO(td);
              if (!iso) return Alert.alert("Hatalı", "Hedef günü formatı geçersiz. Örn: 2026-12-31");
              onSave(mm, dd, iso);
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
