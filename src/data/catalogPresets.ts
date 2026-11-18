import type { MinifigureMetadata } from '../types/minifig';

export function makeMinimalFigAvatar(code: string, bg: string, fg: string, accent: string): string {
  const safeCode = code.toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <rect width="120" height="120" rx="18" fill="${bg}"/>
    <rect x="47" y="16" width="26" height="8" rx="2" fill="${accent}"/>
    <rect x="36" y="23" width="48" height="36" rx="10" fill="${accent}"/>
    <circle cx="50" cy="39" r="3.4" fill="#111317"/>
    <circle cx="70" cy="39" r="3.4" fill="#111317"/>
    <path d="M51 48c4 4 14 4 18 0" stroke="#111317" stroke-width="2.6" stroke-linecap="round" fill="none"/>
    <path d="M29 63h62l7 33H22l7-33z" fill="${fg}" opacity="0.92"/>
    <rect x="26" y="96" width="68" height="18" rx="4" fill="#111317" opacity="0.65"/>
    <text x="60" y="109" font-family="ui-monospace, monospace" font-size="11" font-weight="700" text-anchor="middle" fill="#ffffff">${safeCode}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/**
 * 6 muestras principales de estudio con fotografía real (/samples/*.jpg).
 */
export const MINIFIG_CATALOG: MinifigureMetadata[] = [
  {
    figId: 'sw0002',
    rebrickableId: 'fig-003681',
    name: 'Boba Fett — Cloud City (Brazos y Piernas Impresas)',
    theme: 'Star Wars',
    subtheme: 'Original Trilogy / Cloud City',
    yearReleased: 2003,
    numParts: 4,
    rarity: 'grail',
    imageUrl: '/samples/sw0002.jpg',
    appearsInSets: 1,
    sampleSetCode: '10123-1 (Cloud City)',
    distinguishingFeatures: [
      'Serigrafía táctica en ambos brazos y piernas (exclusivo set 10123)',
      'Casco molde clásico verde arena integrado con jetpack',
      'Cinturón impreso en cadera negra'
    ],
    parts: [
      { partNum: '30124pb01', name: 'Casco + Jetpack Integrado Sand Green', category: 'headgear', avgPriceEur: 285.0 },
      { partNum: '3626bpx46', name: 'Cabeza Clásica Balaclava Negra', category: 'head', avgPriceEur: 14.5 },
      { partNum: '973pb0308c01', name: 'Torso Armadura Mandaloriana con Brazos Impresos', category: 'torso', avgPriceEur: 920.0 },
      { partNum: '970c00pb024', name: 'Piernas Impresas Cloud City con Cinturón', category: 'legs', avgPriceEur: 610.0 }
    ],
    baseMarketPriceEur: {
      new: 1980.0,
      used_complete: 1490.0,
      used_incomplete: 820.0
    }
  },
  {
    figId: 'sw0585',
    rebrickableId: 'fig-003942',
    name: 'Stormtrooper Imperial (Piernas Impresas, Rejillas Azules)',
    theme: 'Star Wars',
    subtheme: 'Star Wars Rebels / Original Trilogy',
    yearReleased: 2014,
    numParts: 4,
    rarity: 'common',
    imageUrl: '/samples/sw0585.jpg',
    appearsInSets: 11,
    sampleSetCode: '75055-1 (Imperial Star Destroyer)',
    distinguishingFeatures: [
      'Rejillas de respiración en azul oscuro en el casco',
      'Impresión detallada de rodilleras asimétricas en piernas blancas',
      'Torso con cinturón térmico de 7 cartuchos'
    ],
    parts: [
      { partNum: '30408pb09', name: 'Casco Stormtrooper Rejillas Dark Blue', category: 'headgear', avgPriceEur: 3.1 },
      { partNum: '3626cpb0817', name: 'Cabeza Clone/Trooper Ceño Fruncido', category: 'head', avgPriceEur: 1.2 },
      { partNum: '973pb1795c01', name: 'Torso Armadura Imperial 2014', category: 'torso', avgPriceEur: 2.8 },
      { partNum: '970c00pb0358', name: 'Piernas Blancas con Rodilleras', category: 'legs', avgPriceEur: 2.6 }
    ],
    baseMarketPriceEur: {
      new: 11.4,
      used_complete: 7.9,
      used_incomplete: 4.5
    }
  },
  {
    figId: 'sh0232',
    rebrickableId: 'fig-004118',
    name: 'Iron Man — Silver Centurion (Armadura Mark 33 Exclusiva)',
    theme: 'Marvel Super Heroes',
    subtheme: 'Avengers Promotional',
    yearReleased: 2016,
    numParts: 6,
    rarity: 'rare',
    imageUrl: '/samples/sh0232.jpg',
    distinguishingFeatures: [
      'Reactor Arc triangular luminoso impreso en peto desmontable',
      'Impresión perimetral 360° en brazos, laterales de piernas y pies',
      'Casco Dark Red con máscara abatible Silver Metallic'
    ],
    appearsInSets: 1,
    sampleSetCode: '5002946-1 (Silver Centurion Polybag)',
    parts: [
      { partNum: '24087pb01', name: 'Casco Iron Man Dark Red + Visor', category: 'headgear', avgPriceEur: 19.5 },
      { partNum: '24093pb01', name: 'Armadura Pectoral Mark 33', category: 'accessory', avgPriceEur: 28.0 },
      { partNum: '973pb2214c01', name: 'Torso Mark 33 con Brazos Impresos', category: 'torso', avgPriceEur: 22.0 },
      { partNum: '970c00pb0498', name: 'Piernas Dark Red con Impresión Lateral', category: 'legs', avgPriceEur: 18.0 }
    ],
    baseMarketPriceEur: {
      new: 78.5,
      used_complete: 54.0,
      used_incomplete: 31.0
    }
  },
  {
    figId: 'njo0070',
    rebrickableId: 'fig-001805',
    name: 'Lloyd ZX — El Ninja Dorado (Armadura Suprema)',
    theme: 'Ninjago',
    subtheme: 'The Final Battle',
    yearReleased: 2013,
    numParts: 6,
    rarity: 'rare',
    imageUrl: '/samples/njo0070.jpg',
    appearsInSets: 2,
    sampleSetCode: '70505-1 (Temple of Light)',
    distinguishingFeatures: [
      'Hombreras y máscara ninja en color Pearl Gold con emblema del dragón',
      'Torso verde oscuro con túnica dorada y cinturón "N"',
      'Katana dorada incluida como accesorio principal'
    ],
    parts: [
      { partNum: '98130pb04', name: 'Máscara Ninja ZX Pearl Gold', category: 'headgear', avgPriceEur: 6.4 },
      { partNum: '11438', name: 'Armadura Hombreras Doble Katana Gold', category: 'accessory', avgPriceEur: 4.8 },
      { partNum: '973pb1309c01', name: 'Torso Túnica Ninja Dorada/Verde', category: 'torso', avgPriceEur: 8.5 },
      { partNum: '970c00pb0215', name: 'Piernas Pearl Gold con Rodilleras Verdes', category: 'legs', avgPriceEur: 7.2 }
    ],
    baseMarketPriceEur: {
      new: 28.9,
      used_complete: 19.5,
      used_incomplete: 11.2
    }
  },
  {
    figId: 'sw0795',
    rebrickableId: 'fig-004891',
    name: 'Imperial Death Trooper (Especialista con Hombrera y Capa)',
    theme: 'Star Wars',
    subtheme: 'Rogue One',
    yearReleased: 2016,
    numParts: 5,
    rarity: 'uncommon',
    imageUrl: '/samples/sw0795.jpg',
    appearsInSets: 2,
    sampleSetCode: '75156-1 (Krennic\'s Imperial Shuttle)',
    distinguishingFeatures: [
      'Casco molde exclusivo negro brillante con visor verde/rojo táctico',
      'Pauldron/capa de tela negra y panel pectoral iluminado',
      'Cinturón con granadas de fragmentación impresas'
    ],
    parts: [
      { partNum: '26912pb01', name: 'Casco Death Trooper Especialista', category: 'headgear', avgPriceEur: 9.2 },
      { partNum: '27263', name: 'Hombrera/Capa Táctica de Tela Negra', category: 'accessory', avgPriceEur: 6.5 },
      { partNum: '973pb2510c01', name: 'Torso Blindaje Imperial Negro', category: 'torso', avgPriceEur: 5.8 },
      { partNum: '970c00pb0592', name: 'Piernas Negras con Placas Rodilleras', category: 'legs', avgPriceEur: 4.9 }
    ],
    baseMarketPriceEur: {
      new: 26.5,
      used_complete: 18.2,
      used_incomplete: 10.4
    }
  },
  {
    figId: 'sp0002',
    rebrickableId: 'fig-000088',
    name: 'Astronauta Classic Space Azul (Emblema Dorado Original)',
    theme: 'Classic Space',
    subtheme: '1980s Vintage Space',
    yearReleased: 1979,
    numParts: 4,
    rarity: 'rare',
    imageUrl: '/samples/sp0002.jpg',
    appearsInSets: 24,
    sampleSetCode: '928-1 (Galaxy Explorer)',
    distinguishingFeatures: [
      'Casco antiguo con barbuquejo fino (propenso a fisuras históricas)',
      'Logo planetario Classic Space serigrafiado con oro real de época',
      'Tanques de oxígeno gemelos azules'
    ],
    parts: [
      { partNum: '3842a', name: 'Casco Classic Space Barbuquejo Fino Azul', category: 'headgear', avgPriceEur: 14.0 },
      { partNum: '3846p42', name: 'Torso Classic Space Logo Dorado', category: 'torso', avgPriceEur: 16.5 },
      { partNum: '3842b', name: 'Tanques de Aire Dobles Azules', category: 'accessory', avgPriceEur: 3.8 },
      { partNum: '970c00', name: 'Piernas Azules Clásicas', category: 'legs', avgPriceEur: 2.5 }
    ],
    baseMarketPriceEur: {
      new: 64.0,
      used_complete: 24.8,
      used_incomplete: 12.5
    }
  }
];

/**
 * Catálogo ampliado para desambiguación Top-12, escaneo en lote, CMF e importación XML/CSV/.bsx.
 */
export const EXTENDED_CATALOG: MinifigureMetadata[] = [
  {
    figId: 'sw1236',
    rebrickableId: 'fig-012360',
    name: 'Clone Trooper Gunner (Phase 2, 212th Battalion)',
    theme: 'Star Wars',
    subtheme: 'The Clone Wars',
    yearReleased: 2022,
    numParts: 4,
    rarity: 'uncommon',
    imageUrl: makeMinimalFigAvatar('sw1236', '#1e2430', '#d97706', '#f3f4f6'),
    appearsInSets: 1,
    sampleSetCode: '75337-1 (AT-TE Walker)',
    distinguishingFeatures: [
      'Casco Fase 2 con visor gris y marcas naranjas 212th',
      'Torso armadura Clone 2020 con cinturón utilitario',
      'Frecuente en lotes de Clone Troopers'
    ],
    parts: [
      { partNum: '91178pb12', name: 'Casco Clone Phase 2 212th Gunner', category: 'headgear', avgPriceEur: 4.9 },
      { partNum: '973pb4912c01', name: 'Torso Clone Gunner Phase 2', category: 'torso', avgPriceEur: 3.8 },
      { partNum: '970c00pb1401', name: 'Piernas Blancas Rodilleras Clone', category: 'legs', avgPriceEur: 2.4 }
    ],
    baseMarketPriceEur: { new: 11.4, used_complete: 9.8, used_incomplete: 5.5 }
  },
  {
    figId: 'sw1235',
    rebrickableId: 'fig-012350',
    name: 'Clone Trooper, 212th Attack Battalion (Phase 2)',
    theme: 'Star Wars',
    subtheme: 'The Clone Wars',
    yearReleased: 2022,
    numParts: 4,
    rarity: 'common',
    imageUrl: makeMinimalFigAvatar('sw1235', '#1d222c', '#ea580c', '#f8fafc'),
    appearsInSets: 2,
    sampleSetCode: '75337-1 (AT-TE Walker)',
    distinguishingFeatures: [
      'Franja central naranja sobre el casco Fase 2',
      'Impresión frontal con rasguños tácticos naranjas'
    ],
    parts: [
      { partNum: '91178pb11', name: 'Casco Clone 212th Naranja', category: 'headgear', avgPriceEur: 3.9 },
      { partNum: '973pb4910c01', name: 'Torso 212th Trooper', category: 'torso', avgPriceEur: 2.9 },
      { partNum: '970c00pb1400', name: 'Piernas 212th Impresas', category: 'legs', avgPriceEur: 2.1 }
    ],
    baseMarketPriceEur: { new: 8.1, used_complete: 6.9, used_incomplete: 4.0 }
  },
  {
    figId: 'sw0183',
    rebrickableId: 'fig-001830',
    name: 'Anakin Skywalker (The Clone Wars, Armadura Azul)',
    theme: 'Star Wars',
    subtheme: 'The Clone Wars',
    yearReleased: 2008,
    numParts: 4,
    rarity: 'common',
    imageUrl: makeMinimalFigAvatar('sw0183', '#192231', '#1d4ed8', '#eab308'),
    appearsInSets: 7,
    sampleSetCode: '7675-1 (AT-TE Walker)',
    distinguishingFeatures: [
      'Ojos grandes estilo animación Clone Wars (2008)',
      'Hombreras y torso granate/azul marino'
    ],
    parts: [
      { partNum: '64798', name: 'Pelo Marrón Despeinado Anakin', category: 'headgear', avgPriceEur: 1.5 },
      { partNum: '3626bpb0308', name: 'Cabeza Anakin Clone Wars', category: 'head', avgPriceEur: 1.6 },
      { partNum: '973pb0498c01', name: 'Torso Armadura Jedi', category: 'torso', avgPriceEur: 2.3 },
      { partNum: '970c00pb0085', name: 'Piernas Oscuras con Botas', category: 'legs', avgPriceEur: 1.4 }
    ],
    baseMarketPriceEur: { new: 10.2, used_complete: 5.1, used_incomplete: 2.9 }
  },
  {
    figId: 'sw1277',
    rebrickableId: 'fig-012770',
    name: 'Clone Captain Vaughn (501st / 332nd Company)',
    theme: 'Star Wars',
    subtheme: 'The Clone Wars',
    yearReleased: 2023,
    numParts: 4,
    rarity: 'common',
    imageUrl: makeMinimalFigAvatar('sw1277', '#1a2333', '#2563eb', '#f97316'),
    appearsInSets: 1,
    sampleSetCode: '75359-1 (332nd Ahsoka\'s Clone Battle Pack)',
    distinguishingFeatures: [
      'Casco 332nd con emblema de Ahsoka naranja y visor oscuro',
      'Insignia de rango azul/rojo impresa en pecho izquierdo'
    ],
    parts: [
      { partNum: '91178pb19', name: 'Casco 332nd Clone Vaughn', category: 'headgear', avgPriceEur: 2.4 },
      { partNum: '973pb5182c01', name: 'Torso Captain Vaughn', category: 'torso', avgPriceEur: 1.9 },
      { partNum: '970c00pb1501', name: 'Piernas 501st Azul', category: 'legs', avgPriceEur: 1.4 }
    ],
    baseMarketPriceEur: { new: 4.5, used_complete: 3.6, used_incomplete: 2.1 }
  },
  {
    figId: 'sw0522',
    rebrickableId: 'fig-005220',
    name: 'Clone Trooper, 212th Attack Battalion (Original Phase 2)',
    theme: 'Star Wars',
    subtheme: 'Revenge of the Sith',
    yearReleased: 2014,
    numParts: 4,
    rarity: 'uncommon',
    imageUrl: makeMinimalFigAvatar('sw0522', '#22262e', '#f97316', '#f1f5f9'),
    appearsInSets: 2,
    sampleSetCode: '75036-1 (Utapau Troopers)',
    distinguishingFeatures: [
      'Molde casco Phase 2 realista 2014 (boca angular)',
      'Desgaste naranja en placas abdominales'
    ],
    parts: [
      { partNum: '91178pb04', name: 'Casco Utapau 212th 2014', category: 'headgear', avgPriceEur: 5.2 },
      { partNum: '973pb1615c01', name: 'Torso 212th 2014', category: 'torso', avgPriceEur: 3.1 },
      { partNum: '970c00pb0301', name: 'Piernas Blancas Armadura', category: 'legs', avgPriceEur: 2.4 }
    ],
    baseMarketPriceEur: { new: 14.5, used_complete: 9.6, used_incomplete: 5.2 }
  },
  {
    figId: 'sw0001c',
    rebrickableId: 'fig-00001c',
    name: 'Battle Droid — Tan, Brazos Rectos (Star Wars)',
    theme: 'Star Wars',
    subtheme: 'Clone Wars / Phantom Menace',
    yearReleased: 2007,
    numParts: 5,
    rarity: 'common',
    imageUrl: makeMinimalFigAvatar('sw0001c', '#23201b', '#d6b47e', '#e5cba0'),
    appearsInSets: 45,
    sampleSetCode: '7654-1 (Droids Battle Pack)',
    distinguishingFeatures: [
      'Color Tan completo con un brazo recto y un brazo curvo',
      'Cabeza clásica molde B1'
    ],
    parts: [
      { partNum: '30378', name: 'Cabeza Battle Droid Tan', category: 'head', avgPriceEur: 0.5 },
      { partNum: '30375', name: 'Torso Battle Droid Tan', category: 'torso', avgPriceEur: 0.6 },
      { partNum: '30376', name: 'Piernas Battle Droid Tan', category: 'legs', avgPriceEur: 0.5 }
    ],
    baseMarketPriceEur: { new: 2.4, used_complete: 1.6, used_incomplete: 0.9 }
  },
  {
    figId: 'sh0036',
    rebrickableId: 'fig-003600',
    name: 'Batman — Black Suit (Cinturón Amarillo Clásico)',
    theme: 'Marvel Super Heroes',
    subtheme: 'DC Comics Super Heroes',
    yearReleased: 2012,
    numParts: 5,
    rarity: 'common',
    imageUrl: makeMinimalFigAvatar('sh0036', '#16181e', '#1e293b', '#facc15'),
    appearsInSets: 8,
    sampleSetCode: '6863-1 (Batwing Battle)',
    distinguishingFeatures: [
      'Capucha Tipo 1 orejas altas con capa negra lisa',
      'Logo murciélago negro sobre óvalo amarillo'
    ],
    parts: [
      { partNum: '10113', name: 'Capucha Batman Negra Tipo 1', category: 'headgear', avgPriceEur: 1.8 },
      { partNum: '973pb1072c01', name: 'Torso Traje Negro Cinturón Amarillo', category: 'torso', avgPriceEur: 2.9 },
      { partNum: '970c00', name: 'Piernas Negras Lisas', category: 'legs', avgPriceEur: 1.2 }
    ],
    baseMarketPriceEur: { new: 8.4, used_complete: 5.9, used_incomplete: 3.1 }
  },
  {
    figId: 'col258',
    rebrickableId: 'fig-025800',
    name: 'Chicken Suit Guy (Serie 9 / Edición Pascua)',
    theme: 'Collectible Minifigures',
    subtheme: 'CMF Series 9',
    yearReleased: 2013,
    numParts: 5,
    rarity: 'uncommon',
    imageUrl: makeMinimalFigAvatar('col258', '#252119', '#f8fafc', '#fbbf24'),
    appearsInSets: 2,
    sampleSetCode: '71000-4 (CMF Series 9)',
    distinguishingFeatures: [
      'Máscara de pollo blanca con cresta roja y pico naranja',
      'Alas laterales moldeadas en brazos blancos'
    ],
    parts: [
      { partNum: '11288pb01', name: 'Máscara Pollo Blanca Cresta Roja', category: 'headgear', avgPriceEur: 4.5 },
      { partNum: '973pb1296c01', name: 'Torso Plumas Blancas Alas', category: 'torso', avgPriceEur: 3.2 },
      { partNum: '970c00', name: 'Piernas Bright Light Orange', category: 'legs', avgPriceEur: 1.5 }
    ],
    baseMarketPriceEur: { new: 12.2, used_complete: 8.1, used_incomplete: 4.6 }
  },
  {
    figId: 'col445',
    rebrickableId: 'fig-044501',
    name: 'Vampire Knight (Basil the Bat Lord — Serie 25)',
    theme: 'Collectible Minifigures',
    subtheme: 'Series 25 (71045)',
    yearReleased: 2024,
    numParts: 6,
    rarity: 'rare',
    imageUrl: makeMinimalFigAvatar('col445', '#25171c', '#18181b', '#dc2626'),
    appearsInSets: 1,
    sampleSetCode: '71045-3 (CMF Series 25)',
    distinguishingFeatures: [
      'Yelmo con alas de murciélago rojas y escudo Fright Knights',
      'Hacha halberd perlada + capa negra dentada'
    ],
    parts: [
      { partNum: '104129', name: 'Casco Alas Murciélago Dark Red', category: 'headgear', avgPriceEur: 4.8 },
      { partNum: '973pb5401c01', name: 'Torso Armadura Vampiro Gótica', category: 'torso', avgPriceEur: 3.9 },
      { partNum: '970c00pb1590', name: 'Piernas Grises Placas Negras', category: 'legs', avgPriceEur: 2.8 }
    ],
    baseMarketPriceEur: { new: 11.8, used_complete: 9.2, used_incomplete: 5.5 }
  },
  {
    figId: 'col448',
    rebrickableId: 'fig-044801',
    name: 'Goatherd / Pastor de Cabra (CMF Serie 25)',
    theme: 'Collectible Minifigures',
    subtheme: 'Series 25 (71045)',
    yearReleased: 2024,
    numParts: 6,
    rarity: 'rare',
    imageUrl: makeMinimalFigAvatar('col448', '#1c241d', '#78350f', '#fbbf24'),
    appearsInSets: 1,
    sampleSetCode: '71045-8 (CMF Series 25)',
    distinguishingFeatures: [
      'Incluye cabra blanca LEGO (re-edición icónica Medieval)',
      'Túnica marrón rústica con cuerno y queso'
    ],
    parts: [
      { partNum: '95341pb01', name: 'Animal Cabra Blanca Ojos Negros', category: 'accessory', avgPriceEur: 6.4 },
      { partNum: '973pb5412c01', name: 'Torso Pastor Medieval', category: 'torso', avgPriceEur: 2.4 },
      { partNum: '970c00pb1596', name: 'Piernas Marrón con Botas', category: 'legs', avgPriceEur: 1.9 }
    ],
    baseMarketPriceEur: { new: 10.9, used_complete: 8.6, used_incomplete: 3.4 }
  },
  {
    figId: 'col452',
    rebrickableId: 'fig-045201',
    name: 'Triceratops Costume Fan (CMF Serie 25)',
    theme: 'Collectible Minifigures',
    subtheme: 'Series 25 (71045)',
    yearReleased: 2024,
    numParts: 5,
    rarity: 'common',
    imageUrl: makeMinimalFigAvatar('col452', '#17261f', '#15803d', '#86efac'),
    appearsInSets: 1,
    sampleSetCode: '71045-12 (CMF Series 25)',
    distinguishingFeatures: [
      'Capucha de Triceratops verde oscuro con tres cuernos blancos',
      'Cola dinosaurio desmontable y placas dorsales'
    ],
    parts: [
      { partNum: '104132', name: 'Capucha Disfraz Triceratops Verde', category: 'headgear', avgPriceEur: 2.9 },
      { partNum: '973pb5418c01', name: 'Torso Escamas Verdes', category: 'torso', avgPriceEur: 1.9 },
      { partNum: '970c00pb1599', name: 'Piernas Escamas Verde', category: 'legs', avgPriceEur: 1.4 }
    ],
    baseMarketPriceEur: { new: 6.1, used_complete: 4.8, used_incomplete: 2.7 }
  },
  {
    figId: 'dnd005',
    rebrickableId: 'fig-0710475',
    name: 'Dragonborn Paladin (CMF Dungeons & Dragons 71047)',
    theme: 'Collectible Minifigures',
    subtheme: 'Dungeons & Dragons (71047)',
    yearReleased: 2024,
    numParts: 6,
    rarity: 'rare',
    imageUrl: makeMinimalFigAvatar('dnd005', '#262118', '#eab308', '#fef08a'),
    appearsInSets: 1,
    sampleSetCode: '71047-5 (CMF Dungeons & Dragons)',
    distinguishingFeatures: [
      'Cabeza dracónida dorada con peto de armadura con hombreras plateadas',
      'Escudo de Bahamut y maza con cristal translúcido'
    ],
    parts: [
      { partNum: '106501pb01', name: 'Cabeza Dracónido Pearl Gold', category: 'head', avgPriceEur: 4.9 },
      { partNum: '106508pb01', name: 'Armadura Pectoral Paladín Plata', category: 'accessory', avgPriceEur: 5.5 },
      { partNum: '973pb5705c01', name: 'Torso Paladín Impreso', category: 'torso', avgPriceEur: 2.9 },
      { partNum: '970c00pb1705', name: 'Piernas Armadura Plateada', category: 'legs', avgPriceEur: 2.4 }
    ],
    baseMarketPriceEur: { new: 14.5, used_complete: 11.9, used_incomplete: 6.8 }
  },
  {
    figId: 'dnd007',
    rebrickableId: 'fig-0710477',
    name: 'Mind Flayer (Azotamentes — CMF D&D 71047)',
    theme: 'Collectible Minifigures',
    subtheme: 'Dungeons & Dragons (71047)',
    yearReleased: 2024,
    numParts: 5,
    rarity: 'uncommon',
    imageUrl: makeMinimalFigAvatar('dnd007', '#1f1829', '#7e22ce', '#d8b4fe'),
    appearsInSets: 1,
    sampleSetCode: '71047-7 (CMF Dungeons & Dragons)',
    distinguishingFeatures: [
      'Cabeza cefalópoda lavanda con tentáculos y mascota Intellect Devourer',
      'Túnica ceremonial púrpura oscura y magenta'
    ],
    parts: [
      { partNum: '106512pb01', name: 'Cabeza Mind Flayer Lavanda', category: 'head', avgPriceEur: 3.4 },
      { partNum: '106515', name: 'Criatura Intellect Devourer', category: 'accessory', avgPriceEur: 2.5 },
      { partNum: '973pb5707c01', name: 'Torso Hechicero Púrpura', category: 'torso', avgPriceEur: 2.1 }
    ],
    baseMarketPriceEur: { new: 8.2, used_complete: 6.7, used_incomplete: 3.8 }
  },
  {
    figId: 'col2701',
    rebrickableId: 'fig-0710481',
    name: 'Wolfpack Beastmaster (Señor de las Bestias — Serie 27)',
    theme: 'Collectible Minifigures',
    subtheme: 'Series 27 (71048)',
    yearReleased: 2025,
    numParts: 6,
    rarity: 'rare',
    imageUrl: makeMinimalFigAvatar('col2701', '#211d1a', '#7c2d12', '#d6d3d1'),
    appearsInSets: 1,
    sampleSetCode: '71048-1 (CMF Series 27)',
    distinguishingFeatures: [
      'Escudo heráldico clásico Wolfpack con capa peluda y espada',
      'Incluye nuevo lobo gris moldeado exclusivo de la Serie 27'
    ],
    parts: [
      { partNum: '108201pb01', name: 'Figura Animal Lobo Gris Serie 27', category: 'accessory', avgPriceEur: 7.5 },
      { partNum: '973pb5901c01', name: 'Torso Túnica Wolfpack Marrón', category: 'torso', avgPriceEur: 3.9 },
      { partNum: '970c00pb1801', name: 'Piernas Botas Medievales', category: 'legs', avgPriceEur: 2.1 }
    ],
    baseMarketPriceEur: { new: 14.9, used_complete: 12.2, used_incomplete: 6.5 }
  }
];

export const ALL_MINIFIG_CATALOG: MinifigureMetadata[] = [
  ...MINIFIG_CATALOG,
  ...EXTENDED_CATALOG
];

export interface DemoBulkSlot {
  slotIndex: number;
  figId: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}

export const DEMO_BULK_LOT_IMAGE = '/samples/bulk_lot.jpg';

export const DEMO_BULK_LOT_SLOTS: DemoBulkSlot[] = [
  { slotIndex: 1, figId: 'sw0002', boundingBox: { x: 0.0375, y: 0.05, width: 0.2917, height: 0.4313 } },
  { slotIndex: 2, figId: 'sw0585', boundingBox: { x: 0.3542, y: 0.05, width: 0.2917, height: 0.4313 } },
  { slotIndex: 3, figId: 'sh0232', boundingBox: { x: 0.6708, y: 0.05, width: 0.2917, height: 0.4313 } },
  { slotIndex: 4, figId: 'njo0070', boundingBox: { x: 0.0375, y: 0.5188, width: 0.2917, height: 0.4313 } },
  { slotIndex: 5, figId: 'sw0795', boundingBox: { x: 0.3542, y: 0.5188, width: 0.2917, height: 0.4313 } },
  { slotIndex: 6, figId: 'sp0002', boundingBox: { x: 0.6708, y: 0.5188, width: 0.2917, height: 0.4313 } }
];

export function guessThemeFromFigId(figId: string): string {
  const clean = figId.trim().toLowerCase();
  if (clean.startsWith('sw')) return 'Star Wars';
  if (clean.startsWith('sh')) return 'Marvel / DC Super Heroes';
  if (clean.startsWith('hp')) return 'Harry Potter';
  if (clean.startsWith('njo')) return 'Ninjago';
  if (clean.startsWith('cas')) return 'Castle';
  if (clean.startsWith('sp')) return 'Classic Space';
  if (clean.startsWith('cty')) return 'City';
  if (clean.startsWith('col') || clean.startsWith('dnd')) return 'Collectible Minifigures';
  if (clean.startsWith('lotr') || clean.startsWith('lor')) return 'Lord of the Rings';
  if (clean.startsWith('pir')) return 'Pirates';
  return 'LEGO System';
}

export function createCustomMinifigMetadata(params: {
  figId: string;
  name?: string;
  theme?: string;
  imageUrl?: string;
  usedEur?: number;
  newEur?: number;
  incompleteEur?: number;
  notes?: string;
}): MinifigureMetadata {
  const existing = findMinifigById(params.figId);
  if (existing) return existing;

  const cleanId = params.figId.trim().toLowerCase() || 'custom';
  const estUsed = Math.max(
    0.5,
    Math.round((params.usedEur ?? 9.5) * 100) / 100
  );
  const estNew = Math.max(
    estUsed,
    Math.round((params.newEur ?? estUsed * 1.42) * 100) / 100
  );
  const estIncomplete = Math.max(
    0.5,
    Math.round((params.incompleteEur ?? estUsed * 0.56) * 100) / 100
  );
  const resolvedTheme = params.theme?.trim() || guessThemeFromFigId(cleanId);

  return {
    figId: cleanId,
    rebrickableId: `fig-${cleanId}`,
    name: params.name?.trim() || `Minifigura LEGO ${cleanId.toUpperCase()}`,
    theme: resolvedTheme,
    yearReleased: 2020,
    numParts: 4,
    rarity: estUsed >= 35 ? 'rare' : estUsed >= 12 ? 'uncommon' : 'common',
    imageUrl: params.imageUrl || makeMinimalFigAvatar(cleanId, '#1b1f29', '#475569', '#fbbf24'),
    appearsInSets: 1,
    sampleSetCode: 'Catálogo BrickLink',
    distinguishingFeatures: [
      params.notes || `Referencia BrickLink ${cleanId.toUpperCase()}`,
      'Cotización orientativa modificable según mercado real'
    ],
    parts: [
      {
        partNum: `${cleanId}-hg`,
        name: 'Casco / Pelo / Sombrero',
        category: 'headgear',
        avgPriceEur: Math.round(estUsed * 0.2 * 100) / 100
      },
      {
        partNum: `${cleanId}-hd`,
        name: 'Cabeza Impresa',
        category: 'head',
        avgPriceEur: Math.round(estUsed * 0.15 * 100) / 100
      },
      {
        partNum: `${cleanId}-tr`,
        name: 'Torso Impreso',
        category: 'torso',
        avgPriceEur: Math.round(estUsed * 0.4 * 100) / 100
      },
      {
        partNum: `${cleanId}-lg`,
        name: 'Piernas / Cadera',
        category: 'legs',
        avgPriceEur: Math.round(estUsed * 0.25 * 100) / 100
      }
    ],
    partsSource: 'template',
    baseMarketPriceEur: {
      new: estNew,
      used_complete: estUsed,
      used_incomplete: estIncomplete
    },
    isEstimatedFallbackPrice: params.usedEur === undefined
  };
}

export function findMinifigById(figId: string): MinifigureMetadata | undefined {
  const normalized = figId.trim().toLowerCase();
  return ALL_MINIFIG_CATALOG.find(
    (m) => m.figId.toLowerCase() === normalized || m.rebrickableId.toLowerCase() === normalized
  );
}

export function searchMinifigCatalog(query: string): MinifigureMetadata[] {
  const q = query.trim().toLowerCase();
  if (!q) return ALL_MINIFIG_CATALOG;
  return ALL_MINIFIG_CATALOG.filter(
    (m) =>
      m.figId.toLowerCase().includes(q) ||
      m.name.toLowerCase().includes(q) ||
      m.theme.toLowerCase().includes(q) ||
      m.sampleSetCode.toLowerCase().includes(q)
  );
}

