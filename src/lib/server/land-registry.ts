import "server-only";

export type LandRegistryStatus = "verified" | "pending" | "rejected" | "unavailable";

export interface LandRegistryCheckInput {
  location: string;
  title: string;
  description: string;
  externalRefs: string[];
}

export interface LandRegistryCheckResult {
  countryCode: string;
  provider: string;
  status: LandRegistryStatus;
  score: number;
  message: string;
  checkedAt: string;
  referenceId: string | null;
}

type CountryCode = "AR" | "CO" | "MX" | "VE" | "BO" | "UNKNOWN";

const requestTimeoutMs = 7_000;

const countryHints: Array<{ code: CountryCode; terms: string[] }> = [
  { code: "AR", terms: ["argentina", "buenos aires", "cordoba", "santa fe", "mendoza", "entre rios"] },
  { code: "CO", terms: ["colombia", "bogota", "medellin", "cali", "antioquia", "cundinamarca"] },
  { code: "MX", terms: ["mexico", "cdmx", "ciudad de mexico", "jalisco", "nuevo leon", "guanajuato"] },
  { code: "VE", terms: ["venezuela", "caracas", "maracaibo", "valencia", "barquisimeto"] },
  { code: "BO", terms: ["bolivia", "la paz", "santa cruz", "cochabamba", "sucre"] },
];

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function inferCountry(location: string): CountryCode {
  const text = normalizeText(location);
  for (const row of countryHints) {
    if (row.terms.some((term) => text.includes(term))) return row.code;
  }
  return "UNKNOWN";
}

async function inferCountryWithGeocoding(location: string): Promise<CountryCode> {
  const hinted = inferCountry(location);
  if (hinted !== "UNKNOWN") return hinted;
  const query = location.trim();
  if (!query) return "UNKNOWN";

  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
      addressdetails: "1",
    });
    const response = await fetchWithTimeout(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      method: "GET",
      headers: {
        "User-Agent": "terra-capital-oracle/1.0",
      },
    });
    if (!response.ok) return "UNKNOWN";
    const rows = (await response.json().catch(() => null)) as Array<{
      address?: { country_code?: string };
    }> | null;
    const code = rows?.[0]?.address?.country_code?.trim().toUpperCase();
    if (code === "AR" || code === "CO" || code === "MX" || code === "VE" || code === "BO") return code;
    return code ? "UNKNOWN" : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}

function parseExternalReference(externalRefs: string[]) {
  const firstHttp = externalRefs.find((row) => /^https?:\/\//i.test(row.trim()));
  return firstHttp ? firstHttp.trim() : null;
}

function buildFallbackResult(countryCode: CountryCode, reason: string): LandRegistryCheckResult {
  return {
    countryCode,
    provider: "manual-evidence",
    status: "pending",
    score: 40,
    message: reason,
    checkedAt: new Date().toISOString(),
    referenceId: null,
  };
}

async function fetchWithTimeout(url: string, init?: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function queryConfiguredRegistry(input: {
  countryCode: CountryCode;
  location: string;
  title: string;
  description: string;
  externalRefs: string[];
}): Promise<LandRegistryCheckResult | null> {
  const baseUrlByCountry: Partial<Record<CountryCode, string>> = {
    AR: process.env.LAND_REGISTRY_AR_API_URL?.trim(),
    CO: process.env.LAND_REGISTRY_CO_API_URL?.trim(),
    MX: process.env.LAND_REGISTRY_MX_API_URL?.trim(),
    VE: process.env.LAND_REGISTRY_VE_API_URL?.trim(),
    BO: process.env.LAND_REGISTRY_BO_API_URL?.trim(),
  };
  const apiKeyByCountry: Partial<Record<CountryCode, string>> = {
    AR: process.env.LAND_REGISTRY_AR_API_KEY?.trim(),
    CO: process.env.LAND_REGISTRY_CO_API_KEY?.trim(),
    MX: process.env.LAND_REGISTRY_MX_API_KEY?.trim(),
    VE: process.env.LAND_REGISTRY_VE_API_KEY?.trim(),
    BO: process.env.LAND_REGISTRY_BO_API_KEY?.trim(),
  };

  const baseUrl = baseUrlByCountry[input.countryCode];
  if (!baseUrl) return null;

  const params = new URLSearchParams({
    location: input.location,
    title: input.title,
    description: input.description.slice(0, 400),
  });
  const ref = parseExternalReference(input.externalRefs);
  if (ref) params.set("reference", ref);

  const response = await fetchWithTimeout(`${baseUrl}?${params.toString()}`, {
    method: "GET",
    headers: apiKeyByCountry[input.countryCode]
      ? { Authorization: `Bearer ${apiKeyByCountry[input.countryCode]}` }
      : undefined,
  });
  if (!response.ok) {
    return {
      countryCode: input.countryCode,
      provider: `registry-api-${input.countryCode.toLowerCase()}`,
      status: "unavailable",
      score: 0,
      message: `Registro catastral no disponible (${response.status}).`,
      checkedAt: new Date().toISOString(),
      referenceId: null,
    };
  }

  const payload = (await response.json().catch(() => null)) as {
    status?: LandRegistryStatus;
    score?: number;
    message?: string;
    referenceId?: string;
    provider?: string;
  } | null;

  const status = payload?.status ?? "pending";
  const score = Number.isFinite(payload?.score) ? Math.max(0, Math.min(100, Number(payload?.score))) : (status === "verified" ? 90 : status === "rejected" ? 10 : 50);
  return {
    countryCode: input.countryCode,
    provider: payload?.provider?.trim() || `registry-api-${input.countryCode.toLowerCase()}`,
    status,
    score,
    message: payload?.message?.trim() || "Respuesta de registro recibida.",
    checkedAt: new Date().toISOString(),
    referenceId: payload?.referenceId?.trim() || null,
  };
}

export async function verifyLandRegistry(input: LandRegistryCheckInput): Promise<LandRegistryCheckResult> {
  const countryCode = await inferCountryWithGeocoding(input.location);
  if (countryCode === "UNKNOWN") {
    const globalUrl = process.env.LAND_REGISTRY_GLOBAL_API_URL?.trim();
    if (!globalUrl) {
      return buildFallbackResult(countryCode, "Pais no identificado automaticamente; se requiere validacion manual.");
    }
    try {
      const params = new URLSearchParams({
        location: input.location,
        title: input.title,
        description: input.description.slice(0, 400),
      });
      const ref = parseExternalReference(input.externalRefs);
      if (ref) params.set("reference", ref);
      const globalResponse = await fetchWithTimeout(`${globalUrl}?${params.toString()}`, {
        method: "GET",
        headers: process.env.LAND_REGISTRY_GLOBAL_API_KEY?.trim()
          ? { Authorization: `Bearer ${process.env.LAND_REGISTRY_GLOBAL_API_KEY?.trim()}` }
          : undefined,
      });
      if (!globalResponse.ok) {
        return {
          countryCode,
          provider: "registry-api-global",
          status: "unavailable",
          score: 0,
          message: `Registro global no disponible (${globalResponse.status}).`,
          checkedAt: new Date().toISOString(),
          referenceId: null,
        };
      }
      const payload = (await globalResponse.json().catch(() => null)) as {
        status?: LandRegistryStatus;
        score?: number;
        message?: string;
        referenceId?: string;
      } | null;
      return {
        countryCode,
        provider: "registry-api-global",
        status: payload?.status ?? "pending",
        score: Number.isFinite(payload?.score) ? Math.max(0, Math.min(100, Number(payload?.score))) : 50,
        message: payload?.message?.trim() || "Respuesta de registro global recibida.",
        checkedAt: new Date().toISOString(),
        referenceId: payload?.referenceId?.trim() || null,
      };
    } catch {
      return buildFallbackResult(countryCode, "No se pudo consultar proveedor global; requiere validacion manual.");
    }
  }

  try {
    const configuredResult = await queryConfiguredRegistry({
      countryCode,
      location: input.location,
      title: input.title,
      description: input.description,
      externalRefs: input.externalRefs,
    });
    if (configuredResult) return configuredResult;
  } catch {
    return {
      countryCode,
      provider: "registry-adapter",
      status: "unavailable",
      score: 0,
      message: "Fallo consultando proveedor catastral configurado.",
      checkedAt: new Date().toISOString(),
      referenceId: null,
    };
  }

  const referenceUrl = parseExternalReference(input.externalRefs);
  if (!referenceUrl) {
    return buildFallbackResult(
      countryCode,
      `No hay URL de expediente para ${countryCode}. Agrega referencia catastral/registro para validar automaticamente.`,
    );
  }

  return {
    countryCode,
    provider: "manual-url-proof",
    status: "pending",
    score: 55,
    message: `Referencia detectada (${referenceUrl}); falta integracion API oficial para verificacion automatica.`,
    checkedAt: new Date().toISOString(),
    referenceId: referenceUrl,
  };
}
