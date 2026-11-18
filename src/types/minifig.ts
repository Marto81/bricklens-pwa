export type MarketplaceId = 'bricklink' | 'brickowl' | 'ebay' | 'wallapop' | 'vinted';

export type MinifigCondition = 'new' | 'used_complete' | 'used_incomplete';

export type ScannerMode = 'single' | 'part' | 'bulk' | 'cmf';

export type PreferredPriceSource =
  | 'weighted'
  | 'bricklink_sold'
  | 'bricklink_stock'
  | 'ebay'
  | 'c2c_eu';

export type PortfolioTimeRange = '1D' | '1W' | '1M' | '1Y';

export type QuoteDataSource = 'live_api' | 'user_observed' | 'catalog_estimate';

export interface MinifigPartBreakdown {
  partNum: string;
  rebrickablePartNum?: string;
  name: string;
  category: 'headgear' | 'head' | 'torso' | 'legs' | 'accessory';
  avgPriceEur: number;
  colorName?: string;
  quantity?: number;
  imageUrl?: string;
}

export interface MinifigSetAppearance {
  setNum: string;
  name: string;
  year: number;
  imageUrl?: string;
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
  sets?: MinifigSetAppearance[];
  distinguishingFeatures: string[];
  parts: MinifigPartBreakdown[];
  partsSource?: 'catalog' | 'rebrickable_live' | 'template';
  baseMarketPriceEur: {
    new: number;
    used_complete: number;
    used_incomplete: number;
  };
  isEstimatedFallbackPrice?: boolean;
}

export type RecognitionApiSource =
  | 'brickognize_live'
  | 'demo_preset'
  | 'no_match'
  | 'error'
  | 'hybrid_fallback';

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
  apiSource: RecognitionApiSource;
  errorMessage?: string;
  detectedBoxScore?: number;
  candidates: RecognitionCandidate[];
}

export interface PartRecognitionCandidate {
  partNum: string;
  name: string;
  category: 'headgear' | 'head' | 'torso' | 'legs' | 'accessory';
  confidence: number;
  imageUrl: string;
  bricklinkUrl: string;
}

export interface PartRecognitionResult {
  scanId: string;
  capturedAtIso: string;
  processedImageDataUrl: string;
  latencyMs: number;
  apiSource: RecognitionApiSource;
  errorMessage?: string;
  detectedBoxScore?: number;
  candidates: PartRecognitionCandidate[];
}

export interface ScannedPartChip {
  partNum: string;
  name: string;
  category: 'headgear' | 'head' | 'torso' | 'legs' | 'accessory';
  imageUrl?: string;
}

export interface PartMatchedMinifig {
  minifig: MinifigureMetadata;
  matchedPartNums: string[];
  totalQueriedParts: number;
  matchScore: number; // 0..1
  source: 'rebrickable_live' | 'local_catalog';
}

export interface NormalizedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BulkScanDetectedItem {
  boxId?: string;
  slotIndex: number;
  boundingBox: NormalizedBoundingBox;
  cropDataUrl?: string;
  selectedMinifig: MinifigureMetadata;
  candidates: RecognitionCandidate[];
  condition: MinifigCondition;
  quantity: number;
  included: boolean;
  status?: 'matched' | 'scanning' | 'no_match' | 'error';
  errorMessage?: string;
}

export interface BulkScanSession {
  sessionId: string;
  capturedAtIso: string;
  sourceImageDataUrl: string;
  aspectRatio?: number;
  latencyMs: number;
  apiSource: RecognitionApiSource;
  errorMessage?: string;
  items: BulkScanDetectedItem[];
}

export type LotDealVerdict = 'ganga' | 'buen_precio' | 'justo' | 'caro';

export interface LotDealEvaluation {
  totalMarketValueEur: number;
  askingPriceEur: number;
  shippingEur: number;
  totalCostEur: number;
  targetMarginPct: number;
  maxRecommendedBidEur: number;
  estimatedResaleFeesEur: number;
  estimatedNetProfitEur: number;
  discountVsMarketPct: number;
  roiPct: number;
  verdict: LotDealVerdict;
  verdictLabel: string;
  verdictSummary: string;
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
  dataSource: QuoteDataSource;
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
  livePortalsCount: number;
  observedPortalsCount: number;
}

export interface ObservedPriceRecord {
  key: string; // `${figId.toLowerCase()}:${condition}:${portal}`
  figId: string;
  condition: MinifigCondition;
  portal: MarketplaceId;
  priceEur: number;
  updatedAtIso: string;
}

export interface LivePortalQuoteSnapshot {
  minPriceEur: number;
  avgPriceEur: number;
  maxPriceEur: number;
  soldAvg6mEur: number;
  activeListingsCount: number;
}

export interface CatalogCacheRecord {
  figId: string;
  rebrickableData?: {
    rebrickableId: string;
    name: string;
    numParts: number;
    imageUrl?: string;
    yearReleased?: number;
    appearsInSets?: number;
    sampleSetCode?: string;
    sets?: MinifigSetAppearance[];
    parts: MinifigPartBreakdown[];
    fetchedAtIso: string;
  };
  livePricesByCondition?: Partial<
    Record<
      MinifigCondition,
      {
        liveQuotes: Partial<Record<MarketplaceId, LivePortalQuoteSnapshot>>;
        fetchedAtIso: string;
      }
    >
  >;
  updatedAtIso: string;
}

export interface ApiProvidersStatus {
  reachable: boolean;
  runtime: string;
  brickognize: boolean;
  rebrickable: boolean;
  brickowl: boolean;
  ebay: boolean;
  checkedAtIso: string;
  endpointUsed?: string;
}

export interface AppSettings {
  proxyBaseUrl: string;
  defaultTargetMarginPct: number;
  preferredPriceSource: PreferredPriceSource;
}

export interface UserCollection {
  id: string;
  name: string;
  isDemo?: boolean;
  createdAtIso: string;
  updatedAtIso: string;
}

export interface CollectionItem {
  id: string;
  collectionId: string;
  minifig: MinifigureMetadata;
  condition: MinifigCondition;
  quantity: number;
  purchasePriceEur: number;
  estimatedUnitValueEur: number;
  baseCompleteUnitValueEur?: number;
  missingPartNums?: string[];
  lastValuationIso: string;
  missingPartsNotes?: string;
  addedAtIso: string;
}

export interface MissingPartsValuationSummary {
  totalParts: number;
  missingCount: number;
  ownedCount: number;
  completionPct: number;
  missingCostEur: number;
  baseCompleteValueEur: number;
  adjustedValueEur: number;
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
  missingPartNums?: string[];
  notes?: string;
}

export interface BrickLensBackupPayload {
  schemaVersion: 2;
  exportedAtIso: string;
  app: 'BrickLens PWA';
  settings: AppSettings;
  activeCollectionId: string | null;
  collections: UserCollection[];
  collectionItems: CollectionItem[];
  observedPrices: ObservedPriceRecord[];
}
