/**
 * Holds the property form between "この物件の相場を確認してみる" and the moment
 * the user finishes signing up, so nobody has to retype anything and a page
 * refresh mid-flow is harmless.
 *
 * sessionStorage, not a cookie: the draft never needs to reach the server until
 * the user is authenticated and explicitly asks for the diagnosis.
 */
export const DRAFT_KEY = "onemake.property-draft.v1";

export type PropertyDraft = {
  prefecture: string;
  municipality: string;
  station: string;
  priceMan: string;
  buildingAge: string;
  walkMinutes: string;
  monthlyRentYen: string;
  managementFeeYen: string;
  repairReserveYen: string;
};

export const EMPTY_DRAFT: PropertyDraft = {
  prefecture: "",
  municipality: "",
  station: "",
  priceMan: "",
  buildingAge: "",
  walkMinutes: "",
  monthlyRentYen: "",
  managementFeeYen: "",
  repairReserveYen: "",
};

const DRAFT_EVENT = "onemake:draft-changed";

function readRaw(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(DRAFT_KEY);
  } catch {
    return null;
  }
}

function notify(): void {
  window.dispatchEvent(new Event(DRAFT_EVENT));
}

export function saveDraft(draft: PropertyDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    notify();
  } catch {
    // Private browsing or a full quota: the user simply re-enters the form.
  }
}

export function loadDraft(): PropertyDraft | null {
  const raw = readRaw();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<PropertyDraft>;
    return { ...EMPTY_DRAFT, ...parsed };
  } catch {
    return null;
  }
}

export function clearDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
    notify();
  } catch {
    /* ignore */
  }
}

/*
 * useSyncExternalStore adapters.
 *
 * The draft lives outside React, so components read it through the store API
 * rather than copying it into state inside an effect. `undefined` from the
 * server snapshot means "not known yet" and is deliberately distinct from
 * `null`, which means "checked, and there is no draft".
 */
let cachedRaw: string | null = null;
let cachedDraft: PropertyDraft | null = null;

export function subscribeToDraft(onChange: () => void): () => void {
  window.addEventListener(DRAFT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DRAFT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function getDraftSnapshot(): PropertyDraft | null {
  const raw = readRaw();
  // Cached so repeated renders get a referentially stable object.
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedDraft = loadDraft();
  }
  return cachedDraft;
}

export function getServerDraftSnapshot(): PropertyDraft | undefined {
  return undefined;
}
