export type MarketplaceId = 'bricklink' | 'brickowl' | 'ebay' | 'wallapop' | 'vinted';

export type MinifigCondition = 'new' | 'used_complete' | 'used_incomplete';

export type ScannerMode = 'single' | 'bulk' | 'cmf';

export type PreferredPriceSource =
  | 'weighted'
  | 'bricklink_sold'
  | 'bricklink_stock'
  | 'ebay'
  | 'c2c_eu';

export type PortfolioTimeRange = '1D' | '1W' | '1M' | '1Y';

export interface MinifigPartBreakdown {
  partNum: string;
  name: string;
  category: 'headgear' | 'head' | 'torso' | 'legs' | 'accessory';
  avgPriceEur: number;
}

export interface MinifigureMetadata {
  figId: string;           // Código estándar BrickLink (ej. "sw0002", "sw0585")
  rebrickableId: string;   // Código Rebrickable (ej. "fig-000002")
  name: string;
  theme: string;
  subtheme?: string;
  yearReleased: number;
  numParts: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'grail';
  imageUrl: string;
  appearsInSets: number;
  sampleSetCode: string;
  distinguishingFeatures: string[];
  parts: MinifigPartBreakdown[];
  baseMarketPriceEur: {
    new: number;
    used_complete: number;
    used_incomplete: number;
  };
}

export interface RecognitionCandidate {
  minifig: MinifigureMetadata;
  confidence: number;      // 0.0 - 1.0
  matchedFeatures: string[];
  source: 'brickognize_api' | 'local_vision_hybrid';
  boundingBox?: { x: number; y: number; width: number; height: number };
}

export interface RecognitionResult {
  scanId: string;
  capturedAtIso: string;
  processedImageDataUrl: string;
  latencyMs: number;
  apiSource: 'brickognize_live' | 'hybrid_fallback';
  candidates: RecognitionCandidate[];
}

export interface BulkScanDetectedItem {
  slotIndex: number;
  boundingBox: { x: number; y: number; width: number; height: number };
  cropDataUrl?: string;
  selectedMinifig: MinifigureMetadata;
  candidates: RecognitionCandidate[];
  condition: MinifigCondition;
  quantity: number;
  included: boolean;
}

export interface BulkScanSession {
  sessionId: string;
  capturedAtIso: string;
  sourceImageDataUrl: string;
  aspectRatio?: number;
  latencyMs: number;
  apiSource: 'brickognize_live' | 'hybrid_fallback';
  items: BulkScanDetectedItem[];
}

export interface CmfBoxCodeEntry {
  seriesCode: string;
  seriesName: string;
  releaseYear: number;
  figNumInSeries: number;
  totalInSeries: number;
  figId: string;
  characterName: string;
  elementIdsEu: string[];
  elementIdsNa: string[];
  estNewEur: number;
  estUsedEur: number;
  rarityNote?: string;
}

export interface CmfLookupResult {
  matched: boolean;
  entry?: CmfBoxCodeEntry;
  minifig?: MinifigureMetadata;
  scannedElementId: string;
  factoryCode?: 'S' | 'R' | 'UNKNOWN';
  factoryLabel: string;
  rawCode: string;
}

export interface MarketplaceQuote {
  portal: MarketplaceId;
  portalName: string;
  regionLabel: string;
  condition: MinifigCondition;
  minPriceEur: number;
  avgPriceEur: number;
  maxPriceEur: number;
  soldAvg6mEur: number;
  activeListingsCount: number;
  shippingEstimateEur: number;
  deepLinkUrl: string;
  lastUpdatedIso: string;
  isOfficialApi: boolean;
  reliabilityWeight: number;
}

export interface PriceComparisonReport {
  figId: string;
  condition: MinifigCondition;
  estimatedMarketValueEur: number;
  bestDealPortal: MarketplaceId;
  bestSalePortal: MarketplaceId;
  priceRangeEur: { low: number; high: number };
  quotes: MarketplaceQuote[];
  trendPercentage30d: number;
  calculatedAtIso: string;
}

export interface CollectionItem {
  id: string;
  minifig: MinifigureMetadata;
  condition: MinifigCondition;
  quantity: number;
  purchasePriceEur: number;
  estimatedUnitValueEur: number;
  lastValuationIso: string;
  missingPartsNotes?: string;
  addedAtIso: string;
}

export interface ThemeAllocation {
  theme: string;
  count: number;
  totalValueEur: number;
  sharePercentage: number;
}

export interface CollectionStats {
  totalUniqueFigs: number;
  totalUnits: number;
  totalMarketValueEur: number;
  totalInvestedEur: number;
  netProfitEur: number;
  roiPercentage: number;
  topGrailItem: CollectionItem | null;
  byTheme: ThemeAllocation[];
}

export interface PortfolioHistoryPoint {
  label: string;
  valueEur: number;
  investedEur: number;
}

export interface BulkImportParsedLine {
  figId: string;
  minifig: MinifigureMetadata;
  condition: MinifigCondition;
  quantity: number;
  purchasePriceEur: number;
  estimatedUnitValueEur: number;
  notes?: string;
}
