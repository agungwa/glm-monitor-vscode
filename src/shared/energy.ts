// Energy / cost / CO₂ footprint estimates for LLM token usage.
//
// Per-model factors are calibrated from:
//   - Luccioni et al. 2023, "Power Hungry Processing" / "Counting Carbon"
//     (BLOOM 176B ≈ 11.5 Wh/1K tokens inference, mixed input/output)
//   - H100 SXM5 inference throughput (~700W, ~1-3K tok/s aggregate on 70-200B)
//   - Scaled by approximate parameter count per model tier
//
// All factors expressed as Wh per 1K tokens at the chip. A datacenter PUE
// multiplier and a small network-overhead term are then applied.

export interface ModelEnergyFactors {
  /** Wh per 1K prefill tokens (input). */
  inputWhPer1K: number;
  /** Wh per 1K generated tokens (output). */
  outputWhPer1K: number;
  /** Wh per 1K cache-read tokens. */
  cacheReadWhPer1K: number;
  /** Wh per 1K cache-write tokens (cache_creation — does real compute). */
  cacheCreateWhPer1K: number;
  /** Approximate parameter count for documentation only. */
  approxParamsB: number;
}

/**
 * Best-effort per-model energy factors. Conservative midpoint of plausible
 * ranges — actual figures depend on quantization, batching, and provider PUE.
 */
export const MODEL_FACTORS: Record<string, ModelEnergyFactors> = {
  // Flagship 5.x line (~350B+ MoE, dense-equivalent large)
  'glm-5.2':       { inputWhPer1K: 2.4, outputWhPer1K: 7.2, cacheReadWhPer1K: 0.18, cacheCreateWhPer1K: 0.9, approxParamsB: 355 },
  'glm-5.1':       { inputWhPer1K: 2.4, outputWhPer1K: 7.2, cacheReadWhPer1K: 0.18, cacheCreateWhPer1K: 0.9, approxParamsB: 355 },
  'glm-5':         { inputWhPer1K: 2.2, outputWhPer1K: 6.6, cacheReadWhPer1K: 0.17, cacheCreateWhPer1K: 0.85, approxParamsB: 320 },

  // 4.x flagship line (~200-300B)
  'glm-4.7':       { inputWhPer1K: 1.8, outputWhPer1K: 5.4, cacheReadWhPer1K: 0.14, cacheCreateWhPer1K: 0.7, approxParamsB: 280 },
  'glm-4.7-flash': { inputWhPer1K: 0.6, outputWhPer1K: 1.8, cacheReadWhPer1K: 0.05, cacheCreateWhPer1K: 0.25, approxParamsB: 90 },
  'glm-4.6':       { inputWhPer1K: 1.7, outputWhPer1K: 5.1, cacheReadWhPer1K: 0.13, cacheCreateWhPer1K: 0.65, approxParamsB: 270 },
  'glm-4.5':       { inputWhPer1K: 1.5, outputWhPer1K: 4.5, cacheReadWhPer1K: 0.12, cacheCreateWhPer1K: 0.6, approxParamsB: 110 },
  'glm-4.5-air':   { inputWhPer1K: 0.35, outputWhPer1K: 1.05, cacheReadWhPer1K: 0.028, cacheCreateWhPer1K: 0.14, approxParamsB: 9 },
};

/** Conservative default for unknown models (assume 4.6-class). */
export const DEFAULT_MODEL_FACTORS: ModelEnergyFactors = MODEL_FACTORS['glm-4.6'];

export const ENERGY_FACTORS = {
  /** Power Usage Effectiveness — datacenter cooling/networking overhead. */
  pue: 1.18,
  /** Network transfer energy per 1K tokens (API call overhead, datacenter to user). */
  networkWhPer1K: 0.05,

  /** PLN R1 900VA residential tariff, Sept 2024. */
  electricityCostPerKWhIDR: 1444,
  electricityCostPerKWhUSD: 0.11,

  /** Indonesia grid carbon intensity, kg CO₂ per kWh (2023 MEMR). */
  gridCarbonIntensity: 0.761,

  /** Average Indonesian household monthly electricity consumption. */
  householdMonthlyKWh: 290,
  /** Average petrol car CO₂ emissions in g/km (Euro 6 petrol). */
  carGramsCO2PerKm: 120,
  /** Litres of petrol per 1 kg CO₂ (petrol ≈ 2.3 kg CO₂ per litre). */
  litersPetrolPerKgCO2: 1 / 2.3,
} as const;

export interface ModelEnergyRow {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
  /** Total energy in kWh (PUE + network applied). */
  kWh: number;
  /** Energy per 1M tokens (kWh) — efficiency metric. */
  kWhPer1M: number;
  co2Kg: number;
  costIDR: number;
}

export interface EnergyImpact {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  totalTokens: number;

  /** Total energy in kWh (PUE + network applied). */
  kWh: number;
  /** Energy per 1M tokens (kWh) — efficiency metric. */
  kWhPer1M: number;
  /** Cost in IDR (Indonesian Rupiah). */
  costIDR: number;
  /** Cost in USD (reference). */
  costUSD: number;
  /** Total CO₂ in kg. */
  co2Kg: number;
  /** Equivalent household electricity usage, in days. */
  householdDays: number;
  /** Equivalent driving distance, in km. */
  carKm: number;
  /** Equivalent petrol consumed, in litres. */
  petrolLiters: number;

  /** Per-model breakdown, sorted by kWh descending. */
  perModel: ModelEnergyRow[];
}

export interface ModelTokenInput {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  totalTokens: number;
}

function factorsFor(model: string): ModelEnergyFactors {
  // Try exact match first, then prefix match (e.g. "glm-4.5-air-20251001" → "glm-4.5-air").
  if (MODEL_FACTORS[model]) return MODEL_FACTORS[model];
  const lower = model.toLowerCase();
  for (const key of Object.keys(MODEL_FACTORS)) {
    if (lower.startsWith(key)) return MODEL_FACTORS[key];
  }
  return DEFAULT_MODEL_FACTORS;
}

/**
 * Compute energy per model from a per-model token list.
 * Use this when you have the LocalSpendResult.perModel breakdown.
 */
export function computeEnergyImpactFromModels(
  models: ModelTokenInput[],
): EnergyImpact {
  const perModel: ModelEnergyRow[] = [];
  let totalKWh = 0;
  let totalTokens = 0;
  let totalInput = 0;
  let totalOutput = 0;
  let totalCacheRead = 0;
  let totalCacheCreate = 0;

  for (const m of models) {
    const f = factorsFor(m.model);
    // Sum raw compute energy in Wh.
    const computeWh =
      (m.inputTokens / 1e3) * f.inputWhPer1K +
      (m.outputTokens / 1e3) * f.outputWhPer1K +
      (m.cacheReadTokens / 1e3) * f.cacheReadWhPer1K +
      (m.cacheCreationTokens / 1e3) * f.cacheCreateWhPer1K;
    // Add PUE overhead and network transfer.
    const totalWh = computeWh * ENERGY_FACTORS.pue +
      (m.totalTokens / 1e3) * ENERGY_FACTORS.networkWhPer1K;
    const kWh = totalWh / 1e3;
    const co2Kg = kWh * ENERGY_FACTORS.gridCarbonIntensity;
    const costIDR = kWh * ENERGY_FACTORS.electricityCostPerKWhIDR;
    const kWhPer1M = m.totalTokens > 0 ? (kWh / m.totalTokens) * 1e6 : 0;

    perModel.push({
      model: m.model,
      inputTokens: m.inputTokens,
      outputTokens: m.outputTokens,
      cacheReadTokens: m.cacheReadTokens,
      cacheCreationTokens: m.cacheCreationTokens,
      totalTokens: m.totalTokens,
      kWh,
      kWhPer1M,
      co2Kg,
      costIDR,
    });

    totalKWh += kWh;
    totalTokens += m.totalTokens;
    totalInput += m.inputTokens;
    totalOutput += m.outputTokens;
    totalCacheRead += m.cacheReadTokens;
    totalCacheCreate += m.cacheCreationTokens;
  }

  const costIDR = totalKWh * ENERGY_FACTORS.electricityCostPerKWhIDR;
  const costUSD = totalKWh * ENERGY_FACTORS.electricityCostPerKWhUSD;
  const co2Kg = totalKWh * ENERGY_FACTORS.gridCarbonIntensity;
  const kWhPer1M = totalTokens > 0 ? (totalKWh / totalTokens) * 1e6 : 0;

  perModel.sort((a, b) => b.kWh - a.kWh);

  return {
    inputTokens: totalInput,
    outputTokens: totalOutput,
    cachedTokens: totalCacheRead + totalCacheCreate,
    totalTokens,
    kWh: totalKWh,
    kWhPer1M,
    costIDR,
    costUSD,
    co2Kg,
    householdDays: (totalKWh / ENERGY_FACTORS.householdMonthlyKWh) * 30,
    carKm: (co2Kg * 1000) / ENERGY_FACTORS.carGramsCO2PerKm,
    petrolLiters: co2Kg * ENERGY_FACTORS.litersPetrolPerKgCO2,
    perModel,
  };
}
