import { CITY_DATABASES } from './databases'
import type { CityConfig } from './types'

/** Dortmund / DSW21 and the surrounding VRR service area. */
export const DORTMUND: CityConfig = {
    slug: 'dortmund',
    subdomain: 'dortmund',
    displayName: 'Dortmund',
    // Replace with an origin under your control before deploying the fork.
    publicAppUrl: 'http://dortmund.localhost:1871',
    listed: true,
    dbName: CITY_DATABASES.dortmund.dbName,
    dbBinding: CITY_DATABASES.dortmund.dbBinding,
    lang: 'de',
    timezone: 'Europe/Berlin',
    reporting: { telegramForwardingEnabled: false },
    map: {
        center: [7.4653, 51.5136],
        zoom: 11,
        bounds: [7.25, 51.36, 7.72, 51.67],
        // Existing tile-server needs a Dortmund style/archive before production.
        styleUrl: 'https://tiles.freifahren.org/styles/dortmund.json',
    },
    tiles: {
        osmUrl: 'https://download.geofabrik.de/europe/germany/nordrhein-westfalen/arnsberg-regbez-latest.osm.pbf',
        clipToMapBounds: true,
    },
    seed: {
        adminLevel: '^6$',
        operators: ['DSW21', 'Dortmunder Stadtwerke AG', 'DB Regio NRW'],
        stationBounds: [7.25, 51.36, 7.72, 51.67],
        routeTypePriority: ['light_rail', 'train', 'bus'],
        osmRouteTypeAliases: { subway: 'light_rail' },
        routeRefPatterns: {
            light_rail: '^U4[1-9]$',
            train: '^S\\s?\\d+$',
            bus: '^\\d{3}$',
        },
        colors: {},
        defaultLineColor: '#000000',
        stationNameOverrides: {
            'Dortmund Hauptbahnhof': 'Hauptbahnhof',
            'Dortmund Hbf': 'Hauptbahnhof',
        },
    },
    telegram: {
        inspectorKeywords: 'Fahrkartenkontrolle, Kontrolleure, Kontrolle, DSW21, VRR, Stadtbahn, Bus, S-Bahn, in Zivil, Uniform',
        untrackedLinesNote: 'Meldungen auf nicht erfassten Linien können anhand der Haltestelle erkannt werden.',
        circularLineAlias: '',
        circularLinePattern: '',
        abbreviations: [
            [String.raw`straße`, 'strasse'],
            [String.raw`str\\.?(?=\\s|$|/|,|\\)|-)`, 'strasse'],
            [String.raw`\\bhbf\\.?\\b`, 'hauptbahnhof'],
            [String.raw`\\bbhf\\.?\\b`, 'bahnhof'],
        ],
        promptExamples: 'Message: "U41 Kontrolle Kampstraße Richtung Hörde"\\n{"stationName":"Kampstraße","directionName":"Hörde"}',
    },
    community: {},
}
