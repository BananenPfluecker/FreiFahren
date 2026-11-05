import { CITY_DATABASES } from './databases'
import type { CityConfig } from './types'

const promptExamples = `Message: "U41 Kontrolle Kampstraße Richtung Hörde"
{"stationName":"Kampstraße","directionName":"Hörde"}`

export const DORTMUND: CityConfig = {
    slug: 'dortmund',
    subdomain: 'dortmund',
    displayName: 'Dortmund',
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
        // TODO: host a style in the fork's own tile service before deployment.
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
            train: String.raw`^S\s?\d+$`,
            bus: String.raw`^\d{3}$`,
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
            [String.raw`str\.?(?=\s|$|/|,|\)|-)`, 'strasse'],
            [String.raw`\bhbf\.?\b`, 'hauptbahnhof'],
            [String.raw`\bbhf\.?\b`, 'bahnhof'],
        ],
        promptExamples,
    },
    community: {},
}
