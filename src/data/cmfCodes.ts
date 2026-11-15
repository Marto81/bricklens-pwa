import type { CmfBoxCodeEntry, CmfLookupResult, MinifigureMetadata } from '../types/minifig';
import { findMinifigById, makeMinimalFigAvatar } from './catalogPresets';

export const CMF_CODE_DATABASE: CmfBoxCodeEntry[] = [
  // === Series 26 Space (71046) (2024) — EU (S) & NA (R) ===
  {
    seriesCode: '71046',
    seriesName: 'Series 26 Space',
    releaseYear: 2024,
    figNumInSeries: 8,
    totalInSeries: 12,
    figId: 'col2608',
    characterName: 'Ice Planet Explorer + Pingüino Trans-Neon',
    elementIdsEu: ['6484686'],
    elementIdsNa: ['6484905'],
    estNewEur: 6.9,
    estUsedEur: 5.4,
    rarityNote: 'Homenaje clásico Ice Planet 2002'
  },
  {
    seriesCode: '71046',
    seriesName: 'Series 26 Space',
    releaseYear: 2024,
    figNumInSeries: 12,
    totalInSeries: 12,
    figId: 'col2612',
    characterName: 'Blacktron Mutant',
    elementIdsEu: ['6484685'],
    elementIdsNa: ['6484904'],
    estNewEur: 5.8,
    estUsedEur: 4.5
  },
  {
    seriesCode: '71046',
    seriesName: 'Series 26 Space',
    releaseYear: 2024,
    figNumInSeries: 9,
    totalInSeries: 12,
    figId: 'col2609',
    characterName: 'Robot Butler (Mayordomo Espacial)',
    elementIdsEu: ['6484688'],
    elementIdsNa: [],
    estNewEur: 5.1,
    estUsedEur: 3.9
  },
  {
    seriesCode: '71046',
    seriesName: 'Series 26 Space',
    releaseYear: 2024,
    figNumInSeries: 5,
    totalInSeries: 12,
    figId: 'col2605',
    characterName: 'Nurse Android + Micro-Bebé Espacial Rosa',
    elementIdsEu: ['6484691'],
    elementIdsNa: [],
    estNewEur: 8.5,
    estUsedEur: 6.8,
    rarityNote: 'Incluye micro-bebé espacial rosa'
  },
  {
    seriesCode: '71046',
    seriesName: 'Series 26 Space',
    releaseYear: 2024,
    figNumInSeries: 7,
    totalInSeries: 12,
    figId: 'col2607',
    characterName: 'M-Tron Powerlifter',
    elementIdsEu: ['6484693'],
    elementIdsNa: [],
    estNewEur: 6.4,
    estUsedEur: 5.1
  },
  {
    seriesCode: '71046',
    seriesName: 'Series 26 Space',
    releaseYear: 2024,
    figNumInSeries: 10,
    totalInSeries: 12,
    figId: 'col2610',
    characterName: 'Orion (Constelación Translúcida)',
    elementIdsEu: ['6484695'],
    elementIdsNa: [],
    estNewEur: 6.2,
    estUsedEur: 4.9
  },
  {
    seriesCode: '71046',
    seriesName: 'Series 26 Space',
    releaseYear: 2024,
    figNumInSeries: 11,
    totalInSeries: 12,
    figId: 'col2611',
    characterName: 'Spacewalking Astronaut',
    elementIdsEu: ['6484696'],
    elementIdsNa: [],
    estNewEur: 5.5,
    estUsedEur: 4.3
  },

  // === Dungeons & Dragons Series 71047 (2024) — EU (S) & NA (R) ===
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 1,
    totalInSeries: 12,
    figId: 'dnd001',
    characterName: 'Dwarf Barbarian (Bárbara Enana)',
    elementIdsEu: ['6502839', '6506740'],
    elementIdsNa: ['6506754'],
    estNewEur: 5.4,
    estUsedEur: 4.1
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 2,
    totalInSeries: 12,
    figId: 'dnd002',
    characterName: 'Gith Warlock (Brujo Gith)',
    elementIdsEu: ['6502842', '6506743'],
    elementIdsNa: ['6506757'],
    estNewEur: 5.9,
    estUsedEur: 4.6
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 3,
    totalInSeries: 12,
    figId: 'dnd003',
    characterName: 'Tiefling Sorcerer (Hechicera Tiefling)',
    elementIdsEu: ['6502836', '6506737'],
    elementIdsNa: ['6506751'],
    estNewEur: 7.4,
    estUsedEur: 5.8,
    rarityNote: 'Incluye cría de dragón exclusivo'
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 4,
    totalInSeries: 12,
    figId: 'dnd005',
    characterName: 'Dragonborn Paladin (Paladín Dracónido)',
    elementIdsEu: ['6502840', '6506741'],
    elementIdsNa: ['6506755'],
    estNewEur: 14.5,
    estUsedEur: 11.9,
    rarityNote: 'Pieza más buscada de la serie'
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 5,
    totalInSeries: 12,
    figId: 'dnd004',
    characterName: 'Halfling Druid (Druida Mediano)',
    elementIdsEu: ['6502838', '6506739'],
    elementIdsNa: ['6506753'],
    estNewEur: 5.6,
    estUsedEur: 4.3
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 6,
    totalInSeries: 12,
    figId: 'dnd006',
    characterName: 'Aarakocra Ranger (Explorador Aarakocra)',
    elementIdsEu: ['6502841', '6506742'],
    elementIdsNa: ['6506756'],
    estNewEur: 6.2,
    estUsedEur: 4.9
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 7,
    totalInSeries: 12,
    figId: 'dnd007',
    characterName: 'Mind Flayer (Azotamentes)',
    elementIdsEu: ['6502843', '6506744'],
    elementIdsNa: ['6506758'],
    estNewEur: 8.2,
    estUsedEur: 6.7,
    rarityNote: 'Con Intellect Devourer'
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 8,
    totalInSeries: 12,
    figId: 'dnd008',
    characterName: 'Strahd von Zarovich',
    elementIdsEu: ['6502845', '6506746'],
    elementIdsNa: ['6506760'],
    estNewEur: 6.5,
    estUsedEur: 5.1
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 9,
    totalInSeries: 12,
    figId: 'dnd009',
    characterName: 'Elf Bard (Bardo Elfo)',
    elementIdsEu: ['6502837', '6506738'],
    elementIdsNa: ['6506752'],
    estNewEur: 5.9,
    estUsedEur: 4.6
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 10,
    totalInSeries: 12,
    figId: 'dnd010',
    characterName: 'The Lady of Pain (La Dama del Dolor)',
    elementIdsEu: ['6502844', '6506745'],
    elementIdsNa: ['6506759'],
    estNewEur: 6.8,
    estUsedEur: 5.4
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 11,
    totalInSeries: 12,
    figId: 'dnd011',
    characterName: 'Szass Tam (Nigromante de Thay)',
    elementIdsEu: ['6502847', '6506748'],
    elementIdsNa: ['6506762'],
    estNewEur: 6.1,
    estUsedEur: 4.8
  },
  {
    seriesCode: '71047',
    seriesName: 'Dungeons & Dragons',
    releaseYear: 2024,
    figNumInSeries: 12,
    totalInSeries: 12,
    figId: 'dnd012',
    characterName: 'Tasha the Witch Queen (Reina Bruja)',
    elementIdsEu: ['6502846', '6506747'],
    elementIdsNa: ['6506761'],
    estNewEur: 6.4,
    estUsedEur: 5.0
  },

  // === Series 27 (71048) (2025) ===
  {
    seriesCode: '71048',
    seriesName: 'Series 27',
    releaseYear: 2025,
    figNumInSeries: 1,
    totalInSeries: 12,
    figId: 'col2701',
    characterName: 'Wolfpack Beastmaster + Lobo Gris',
    elementIdsEu: ['6522981'],
    elementIdsNa: ['6522666'],
    estNewEur: 14.9,
    estUsedEur: 12.2,
    rarityNote: 'Figura estrella (Wolfpack + Lobo)'
  },
  {
    seriesCode: '71048',
    seriesName: 'Series 27',
    releaseYear: 2025,
    figNumInSeries: 10,
    totalInSeries: 12,
    figId: 'col2710',
    characterName: 'Pirate Quartermaster + Cacatúa',
    elementIdsEu: ['6522987'],
    elementIdsNa: ['6522672'],
    estNewEur: 7.1,
    estUsedEur: 5.6
  },
  {
    seriesCode: '71048',
    seriesName: 'Series 27',
    releaseYear: 2025,
    figNumInSeries: 12,
    totalInSeries: 12,
    figId: 'col2712',
    characterName: 'Steampunk Inventor',
    elementIdsEu: ['6522984'],
    elementIdsNa: ['6522669'],
    estNewEur: 5.5,
    estUsedEur: 4.2
  },
  {
    seriesCode: '71048',
    seriesName: 'Series 27',
    releaseYear: 2025,
    figNumInSeries: 6,
    totalInSeries: 12,
    figId: 'col2706',
    characterName: 'Hamster Costume Fan',
    elementIdsEu: ['6522982'],
    elementIdsNa: ['6522667'],
    estNewEur: 4.9,
    estUsedEur: 3.8
  },

  // === Series 25 (71045) (2024) ===
  {
    seriesCode: '71045',
    seriesName: 'Series 25',
    releaseYear: 2024,
    figNumInSeries: 3,
    totalInSeries: 12,
    figId: 'col445',
    characterName: 'Vampire Knight (Basil the Bat Lord)',
    elementIdsEu: ['6470834'],
    elementIdsNa: ['6471962'],
    estNewEur: 11.8,
    estUsedEur: 9.2,
    rarityNote: 'Homenaje clásico Fright Knights'
  },
  {
    seriesCode: '71045',
    seriesName: 'Series 25',
    releaseYear: 2024,
    figNumInSeries: 8,
    totalInSeries: 12,
    figId: 'col448',
    characterName: 'Goatherd (Pastor con Cabra LEGO)',
    elementIdsEu: ['6470838'],
    elementIdsNa: ['6471965'],
    estNewEur: 10.9,
    estUsedEur: 8.6,
    rarityNote: 'Incluye cabra clásica'
  },
  {
    seriesCode: '71045',
    seriesName: 'Series 25',
    releaseYear: 2024,
    figNumInSeries: 12,
    totalInSeries: 12,
    figId: 'col452',
    characterName: 'Triceratops Costume Fan',
    elementIdsEu: ['6470841'],
    elementIdsNa: ['6471968'],
    estNewEur: 6.1,
    estUsedEur: 4.8
  },

  // === Spider-Verse (71050) (2025) ===
  {
    seriesCode: '71050',
    seriesName: 'Spider-Verse',
    releaseYear: 2025,
    figNumInSeries: 2,
    totalInSeries: 12,
    figId: 'colsv02',
    characterName: 'Hobie Brown / Spider-Punk',
    elementIdsEu: ['6568964', '6615995'],
    elementIdsNa: ['6568952', '6564843'],
    estNewEur: 6.1,
    estUsedEur: 4.9
  },
  {
    seriesCode: '71050',
    seriesName: 'Spider-Verse',
    releaseYear: 2025,
    figNumInSeries: 5,
    totalInSeries: 12,
    figId: 'colsv05',
    characterName: 'Miguel O\'Hara / Spider-Man 2099',
    elementIdsEu: ['6568960', '6615991'],
    elementIdsNa: ['6568948', '6564839'],
    estNewEur: 6.9,
    estUsedEur: 5.5
  }
];

export const SAMPLE_CMF_PRESETS = [
  { label: '71048 · Wolfpack (EU)', code: '6522981 114S4 13914011 004122' },
  { label: '71047 · Paladín D&D (EU)', code: '6506741 225S4 13914020 008110' },
  { label: '71046 · Ice Planet (EU)', code: '6484686 218S4 13911022 001409' },
  { label: '71045 · Pastor Cabra (EU)', code: '6470838 540S3 000773' },
  { label: '71047 · Paladín D&D (US)', code: '6506755 146R4 13896418 011398' },
  { label: '71050 · Spider-Man 2099 (EU)', code: '6568960 318S5 14021902' }
];

function buildMetadataFromCmfEntry(entry: CmfBoxCodeEntry): MinifigureMetadata {
  const existing = findMinifigById(entry.figId);
  if (existing) return existing;

  return {
    figId: entry.figId,
    rebrickableId: `fig-${entry.figId}`,
    name: `${entry.characterName} (${entry.seriesName})`,
    theme: 'Collectible Minifigures',
    subtheme: `${entry.seriesName} (${entry.seriesCode})`,
    yearReleased: entry.releaseYear,
    numParts: 5,
    rarity: entry.estNewEur >= 10 ? 'rare' : entry.estNewEur >= 6.8 ? 'uncommon' : 'common',
    imageUrl: makeMinimalFigAvatar(entry.figId, '#1b1f29', '#3b82f6', '#fbbf24'),
    appearsInSets: 1,
    sampleSetCode: `${entry.seriesCode}-${entry.figNumInSeries} (CMF ${entry.seriesName})`,
    distinguishingFeatures: [
      `Caja sorpresa Serie ${entry.seriesCode} (#${entry.figNumInSeries}/${entry.totalInSeries})`,
      entry.rarityNote || 'Identificado por código Data Matrix oficial LEGO'
    ],
    parts: [
      {
        partNum: `${entry.figId}-h`,
        name: 'Cabeza / Tocado / Peana Serie CMF',
        category: 'headgear',
        avgPriceEur: Math.round(entry.estUsedEur * 0.35 * 100) / 100
      },
      {
        partNum: `${entry.figId}-t`,
        name: 'Torso Impreso Serie Coleccionable',
        category: 'torso',
        avgPriceEur: Math.round(entry.estUsedEur * 0.4 * 100) / 100
      },
      {
        partNum: `${entry.figId}-l`,
        name: 'Piernas / Accesorio Temático',
        category: 'legs',
        avgPriceEur: Math.round(entry.estUsedEur * 0.35 * 100) / 100
      }
    ],
    baseMarketPriceEur: {
      new: entry.estNewEur,
      used_complete: entry.estUsedEur,
      used_incomplete: Math.round(entry.estUsedEur * 0.56 * 100) / 100
    }
  };
}

export function lookupCmfCode(rawInput: string): CmfLookupResult {
  const trimmed = rawInput.trim();
  const tokens = trimmed.split(/[\s,;-]+/).filter(Boolean);

  // Detectar Element ID de 7 dígitos
  const elementId = tokens.find((t) => /^\d{7}$/.test(t)) ?? trimmed.replace(/\D/g, '').slice(0, 7);

  // Detectar token de fábrica (ej. "146R3" -> Norteamérica, "225S4" -> Europa)
  const batchToken = tokens.find((t) => /^\d{2,3}[RS]\d$/i.test(t));
  let factoryCode: 'S' | 'R' | 'UNKNOWN' = 'UNKNOWN';
  if (batchToken) {
    if (batchToken.toUpperCase().includes('S')) factoryCode = 'S';
    else if (batchToken.toUpperCase().includes('R')) factoryCode = 'R';
  }

  const entry = CMF_CODE_DATABASE.find(
    (item) => item.elementIdsEu.includes(elementId) || item.elementIdsNa.includes(elementId)
  );

  if (entry && factoryCode === 'UNKNOWN') {
    if (entry.elementIdsEu.includes(elementId)) factoryCode = 'S';
    else if (entry.elementIdsNa.includes(elementId)) factoryCode = 'R';
  }

  const factoryLabel =
    factoryCode === 'S'
      ? 'Europa (Kladno, Rep. Checa · Código S)'
      : factoryCode === 'R'
      ? 'Norteamérica (Monterrey, México · Código R)'
      : 'Región estándar';

  if (!entry) {
    return {
      matched: false,
      scannedElementId: elementId || trimmed,
      factoryCode,
      factoryLabel,
      rawCode: trimmed
    };
  }

  return {
    matched: true,
    entry,
    minifig: buildMetadataFromCmfEntry(entry),
    scannedElementId: elementId,
    factoryCode,
    factoryLabel,
    rawCode: trimmed
  };
}
