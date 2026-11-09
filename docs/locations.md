# Delhi NCR location launch plan

Status: researched proposal, 9 November 2026. Documentation only; no app code, Prisma schema, database, Neon branch, or catalogue endpoint has been changed.

## 1. Launch decision

Launch with six city selections: **Delhi, Gurugram, Noida, Greater Noida, Ghaziabad and Faridabad**, and only the locality choices explicitly listed below. This is a deliberate Flatter service area, not a claim to cover all officially notified NCR.

Official NCR includes many districts beyond this connected urban market. That wider statutory definition should not automatically become our launch dropdown. [NCR Planning Board constituent areas](https://ncrpb.nic.in/ncrconstituent.html)

Use **Delhi** for the full NCT launch bucket; “New Delhi” can find that option, but is not a separate duplicate city. Use **Gurugram** as the display name, with Gurgaon as a search alias. Treat **Greater Noida West / Noida Extension as a subarea under Greater Noida**, not as Noida and not a seventh city. Authority records locate Sector 16B in Greater Noida West and Sector 16C in Greater Noida. [UP-RERA project document](https://up-rera.in/ViewDocument?Param=FloorPlanOfAllTypes-15269All+Floor+Plan.pdf), [GNIDA tender on the UP procurement portal](https://etender.up.nic.in/nicgep/app?component=view&page=WebTenderStatusLists&service=direct&sp=S34WuMPLAMLXMpWA14kW8Mw%3D%3D)

## 2. Why these areas

The shortlist combines established student neighborhoods, residential rental areas and employment/transit corridors. This is a product recommendation inferred from the sources, not a measured ranking of Flatter demand, current room availability, safety or affordability.

| City | Selection rationale and evidence |
| --- | --- |
| Delhi | Cover student/coaching clusters plus south, east and west residential catchments. Recent PTI reporting identifies Mukherjee Nagar, Kamla Nagar, Old Rajinder Nagar, Satya Niketan, Moti Bagh and Laxmi Nagar as student accommodation hubs. [PTI report via The Tribune](https://www.tribuneindia.com/news/delhi/delhis-student-housing-nightmare-balcony-bathrooms-rooftop-rooms-and-rs-2000-study-tables/) |
| Gurugram | Cover DLF/Sushant Lok and central residential sectors relevant to working professionals. DLF's own material establishes Cyber City as an employment anchor; rental listings show residential supply in sectors such as 57 and nearby 46. Locality inclusion is our inference, not a guarantee of a particular commute. [DLF Cyber City](https://www.dlf.in/offices/gurugram/dlfcybercity?fc=y), [Housing.com Sector 57 rentals](https://housing.com/rent/apartments-for-rent-in-sector-57-gurgaon-M1P6nh4kvx3pvh24c5) |
| Noida | Cover established central sectors, the 62 corridor, the 70s residential belt and selected expressway sectors. A historical rental report identifies 62, 70, 75, 76, 78 and 137; NMRC verifies operational stations including 50, 51, 76, 137 and 143. [Magicbricks Jul–Sep 2024 research](https://property.magicbricks.com/microsite/research-insights/src/pdf/Rent_Index_JAS_2024_new.pdf), [NMRC station/timing list](https://www.nmrcnoida.com/Passenger-Information/Metro-Rail/Train-Timings) |
| Greater Noida | Cover Alpha/Beta/Gamma/Delta, student-oriented Knowledge Parks and selected West apartment sectors. Sharda's own address confirms Knowledge Park III; the NMRC list confirms Alpha 1, Delta 1 and Knowledge Park II station names. Authority records above anchor the West grouping. [Sharda contact details](https://www.sharda.ac.in/official-contact-details/), [NMRC](https://www.nmrcnoida.com/Passenger-Information/Metro-Rail/Train-Timings) |
| Ghaziabad | Cover Indirapuram, Vaishali, Vasundhara, Kaushambi and the major apartment catchments. GDA's GIS names several core schemes; ANAROCK's market material includes Crossings Republik, Raj Nagar Extension, Indirapuram, Vasundhara, Vaishali and Siddharth Vihar. [GDA GIS](https://gis.gdaghaziabad.in/), [ANAROCK 2025 report](https://websitemedia.anarock.com/media/Indian_Residential_Real_Estate_Sector_Annual_Report_2025_a92bee0199.pdf) |
| Faridabad | Start with established sectors and selected apartment sectors. HSVP records distinguish Sector 21 subdivisions; rental sources include 14, 15, 16, 21C/21D, 28 and 81. Include 86 as a proposed apartment catchment rather than extrapolating the entire district. [HSVP layout list](https://hsvphry.org.in/documents/home/news_updates/newsUpdate_202408141224_638592350625913217.pdf), [Magicbricks rental localities](https://www.magicbricks.com/independent-house-for-rent-in-faridabad-pppfr), [NoBroker locality list](https://www.nobroker.in/2bhk-flats-for-rent-in-faridabad-faridabad), [Sector-wise rental guide](https://rupe.app/blog/flats-for-rent-in-faridabad-sector-wise-guide) |

The 2024 rental report is historical evidence of established catchments, not current pricing or current demand. Station names are location anchors, not evidence of residential supply in every surrounding sector. No proposed metro extension is treated as an operating service.

## 3. Exact proposed selectable catalogue

The following tables are the complete v1 proposal. A place not listed is unsupported even if it is inside a supported city or officially part of NCR. These are named search areas, not legal boundary polygons; some neighborhoods cover multiple blocks/sectors and some labels have overlapping catchments.

Store the city ID and locality ID, not the display label. Every locality ID is city-prefixed so “Sector 15” in Noida cannot be confused with Sector 15 in Gurugram or Faridabad. Display city context in search results and review summaries. IDs remain stable if display names change.

### Delhi

City ID: `delhi` · State/territory: Delhi (NCT).

| Locality ID | Selectable label |
| --- | --- |
| `delhi.kamla-nagar` | Kamla Nagar |
| `delhi.gtb-nagar` | GTB Nagar |
| `delhi.vijay-nagar` | Vijay Nagar |
| `delhi.mukherjee-nagar` | Mukherjee Nagar |
| `delhi.roop-nagar` | Roop Nagar |
| `delhi.old-rajinder-nagar` | Old Rajinder Nagar |
| `delhi.patel-nagar` | Patel Nagar |
| `delhi.karol-bagh` | Karol Bagh |
| `delhi.satya-niketan` | Satya Niketan |
| `delhi.moti-bagh` | Moti Bagh |
| `delhi.lajpat-nagar` | Lajpat Nagar |
| `delhi.kalkaji` | Kalkaji |
| `delhi.greater-kailash` | Greater Kailash |
| `delhi.east-of-kailash` | East of Kailash |
| `delhi.saket` | Saket |
| `delhi.malviya-nagar` | Malviya Nagar |
| `delhi.hauz-khas` | Hauz Khas |
| `delhi.munirka` | Munirka |
| `delhi.vasant-kunj` | Vasant Kunj |
| `delhi.chhatarpur` | Chhatarpur |
| `delhi.laxmi-nagar` | Laxmi Nagar |
| `delhi.shakarpur` | Shakarpur |
| `delhi.mayur-vihar-phase-1` | Mayur Vihar Phase 1 |
| `delhi.preet-vihar` | Preet Vihar |
| `delhi.janakpuri` | Janakpuri |
| `delhi.dwarka` | Dwarka |

### Gurugram

City ID: `gurugram` · State/territory: Haryana.

| Locality ID | Selectable label |
| --- | --- |
| `gurugram.dlf-phase-1` | DLF Phase 1 |
| `gurugram.dlf-phase-2` | DLF Phase 2 |
| `gurugram.dlf-phase-3` | DLF Phase 3 |
| `gurugram.dlf-phase-4` | DLF Phase 4 |
| `gurugram.dlf-phase-5` | DLF Phase 5 |
| `gurugram.sushant-lok-1` | Sushant Lok 1 |
| `gurugram.sector-14` | Sector 14 |
| `gurugram.sector-15` | Sector 15 |
| `gurugram.sector-21` | Sector 21 |
| `gurugram.sector-22` | Sector 22 |
| `gurugram.sector-23` | Sector 23 |
| `gurugram.sector-31` | Sector 31 |
| `gurugram.sector-40` | Sector 40 |
| `gurugram.sector-45` | Sector 45 |
| `gurugram.sector-46` | Sector 46 |
| `gurugram.sector-47` | Sector 47 |
| `gurugram.sector-48` | Sector 48 |
| `gurugram.sector-49` | Sector 49 |
| `gurugram.sector-50` | Sector 50 |
| `gurugram.sector-51` | Sector 51 |
| `gurugram.sector-52` | Sector 52 |
| `gurugram.sector-55` | Sector 55 |
| `gurugram.sector-56` | Sector 56 |
| `gurugram.sector-57` | Sector 57 |

### Noida

City ID: `noida` · State/territory: Uttar Pradesh.

| Locality ID | Selectable label |
| --- | --- |
| `noida.sector-15` | Sector 15 |
| `noida.sector-19` | Sector 19 |
| `noida.sector-22` | Sector 22 |
| `noida.sector-27` | Sector 27 |
| `noida.sector-34` | Sector 34 |
| `noida.sector-37` | Sector 37 |
| `noida.sector-41` | Sector 41 |
| `noida.sector-44` | Sector 44 |
| `noida.sector-45` | Sector 45 |
| `noida.sector-50` | Sector 50 |
| `noida.sector-51` | Sector 51 |
| `noida.sector-52` | Sector 52 |
| `noida.sector-61` | Sector 61 |
| `noida.sector-62` | Sector 62 |
| `noida.sector-70` | Sector 70 |
| `noida.sector-73` | Sector 73 |
| `noida.sector-74` | Sector 74 |
| `noida.sector-75` | Sector 75 |
| `noida.sector-76` | Sector 76 |
| `noida.sector-77` | Sector 77 |
| `noida.sector-78` | Sector 78 |
| `noida.sector-104` | Sector 104 |
| `noida.sector-107` | Sector 107 |
| `noida.sector-110` | Sector 110 |
| `noida.sector-128` | Sector 128 |
| `noida.sector-134` | Sector 134 |
| `noida.sector-135` | Sector 135 |
| `noida.sector-137` | Sector 137 |
| `noida.sector-143` | Sector 143 |
| `noida.sector-150` | Sector 150 |

### Greater Noida

City ID: `greater-noida` · State/territory: Uttar Pradesh.

| Locality ID | Selectable label |
| --- | --- |
| `greater-noida.alpha-1` | Alpha 1 |
| `greater-noida.alpha-2` | Alpha 2 |
| `greater-noida.beta-1` | Beta 1 |
| `greater-noida.beta-2` | Beta 2 |
| `greater-noida.gamma-1` | Gamma 1 |
| `greater-noida.gamma-2` | Gamma 2 |
| `greater-noida.delta-1` | Delta 1 |
| `greater-noida.delta-2` | Delta 2 |
| `greater-noida.knowledge-park-2` | Knowledge Park 2 |
| `greater-noida.knowledge-park-3` | Knowledge Park 3 |
| `greater-noida.west-sector-1` | Greater Noida West — Sector 1 |
| `greater-noida.west-sector-4` | Greater Noida West — Sector 4 |
| `greater-noida.west-sector-16b` | Greater Noida West — Sector 16B |
| `greater-noida.west-sector-16c` | Greater Noida West — Sector 16C |
| `greater-noida.west-techzone-4` | Greater Noida West — Techzone 4 |

### Ghaziabad

City ID: `ghaziabad` · State/territory: Uttar Pradesh.

| Locality ID | Selectable label |
| --- | --- |
| `ghaziabad.indirapuram` | Indirapuram |
| `ghaziabad.vaishali` | Vaishali |
| `ghaziabad.vasundhara` | Vasundhara |
| `ghaziabad.kaushambi` | Kaushambi |
| `ghaziabad.crossings-republik` | Crossings Republik |
| `ghaziabad.raj-nagar-extension` | Raj Nagar Extension |
| `ghaziabad.siddharth-vihar` | Siddharth Vihar |
| `ghaziabad.raj-nagar` | Raj Nagar |

### Faridabad

City ID: `faridabad` · State/territory: Haryana.

| Locality ID | Selectable label |
| --- | --- |
| `faridabad.sector-14` | Sector 14 |
| `faridabad.sector-15` | Sector 15 |
| `faridabad.sector-16` | Sector 16 |
| `faridabad.sector-21a` | Sector 21A |
| `faridabad.sector-21b` | Sector 21B |
| `faridabad.sector-21c` | Sector 21C |
| `faridabad.sector-21d` | Sector 21D |
| `faridabad.sector-28` | Sector 28 |
| `faridabad.sector-81` | Sector 81 |
| `faridabad.sector-86` | Sector 86 |

## 4. Names, aliases and overlap rules

| Typed search text | Result behavior |
| --- | --- |
| Gurgaon / Gurugram | Find city `gurugram`; persist only that ID. |
| New Delhi | Find the single Delhi product bucket; explain that the bucket covers the supported NCT localities. |
| Noida Extension / Greater Noida West | Find Greater Noida and its West locality group. Do not save this broad phrase as a locality. |
| Sector 16C / Sec 16 C, within Greater Noida | Find `greater-noida.west-sector-16c`. |
| Alpha I / Alpha 1 | Find `greater-noida.alpha-1`. |
| Knowledge Park III / Knowledge Park 3 | Find `greater-noida.knowledge-park-3`. |
| Sushant Lok I / Sushant Lok 1 | Find `gurugram.sushant-lok-1`. |
| Chattarpur / Chhatarpur | Find `delhi.chhatarpur`. |
| Siddhartha Vihar / Siddharth Vihar | Find `ghaziabad.siddharth-vihar`. |
| Crossing Republik / Crossings Republik | Find `ghaziabad.crossings-republik`. |

Search aliases help find a canonical option; they are not extra saved values. Handle case, spacing, hyphens and common `Sec`/`Sector` forms. Roman numeral aliases must be explicitly assigned to the right names, not blindly converted in every word. Match specific phrases such as “Noida Extension” before generic “Noida.”

Do not use a university, mall, office or metro station as an automatic alias for a residential locality. “Cyber Hub,” “North Campus,” “Pari Chowk,” “Botanical Garden” and “Golf Course Road” are contextual search hints at most; they do not identify a single home area. No society-level entries in this first catalogue. Parent neighborhoods remain selectable without separately offering their blocks as duplicates.

Some marketed neighborhoods overlap sector boundaries, particularly DLF/Sushant Lok. Do not claim these IDs define mutually exclusive polygons or silently treat two IDs as identical. In v1 they record explicit user-selected search areas. Before location-based matching ships, review overlaps and define a small curated compatibility/containment map if needed; neither text equality nor “same NCR” proves proximity.

## 5. Onboarding selection behavior

1. Show fixed helper copy: **We're starting in Delhi NCR. Choose from our supported locations.**
2. Choose one of the six cities using a searchable, keyboard-accessible combobox. Typing filters options; it cannot create one. No “Other” option.
3. After city selection, show only that city's listed localities, with a “Greater Noida West” visual group where relevant. Group headings are not selectable values.
4. For `NEED_ROOM` and `TEAM_UP`, allow 1–5 distinct localities, or **Any supported area in [city]**. The latter sets `locationsFlexible = true` and saves an empty list. It never means the entire statutory NCR, all six cities, or an unlisted part of that city.
5. For `HAVE_ROOM`, require exactly one supported locality for the actual flat and `locationsFlexible = false`. Do not offer Anywhere for an existing flat.
6. Changing city clears locality selection and resets flexibility to unanswered. Warn that the old location choices will be replaced. Changing intent revalidates the existing housing answer.
7. With no search results, show **This location isn't supported yet. Select a listed area.** Do not turn arbitrary typed text into a saved location or automatically pick the nearest area.
8. A person with an existing flat outside the catalogue cannot complete the housing step by claiming an inaccurate listed area. Keep their authenticated account/draft; do not publish them as supported. Seekers can select supported areas where they genuinely want to live.
9. Review shows canonical labels and city, never bare ambiguous sector numbers. Existing onboarding save/revision/finalization rules still apply.

This controls **selected housing locations**, not where someone signs in from or currently lives. It does not prove the flat's address. No GPS permission, IP geofencing, PIN-code guessing or exact address is needed.

## 6. Data and API plan

Use a small **static, versioned catalogue owned by the backend** for this MVP. A city/locality search does not require a new database table, map provider or external autocomplete service.

Future implementation location: `backend/src/data/locations.json`. Each city has a stable ID/display label/state/search aliases; each locality has a globally unique ID, its parent city, display label, optional display group and explicit aliases. The actual application data file is not created by this research task.

Proposed public `GET /api/locations` returns the allowed cities/localities and catalogue version. Frontend loads it once for the housing form and filters in memory; no database call per keystroke and no separate hand-maintained frontend copy. It contains only public reference data, so ordinary HTTP caching/ETags are suitable. If loading fails, offer retry rather than enabling free text or pretending the catalogue is empty.

The backend's housing validator imports the same catalogue. Validate on the housing PATCH and again at Finish:

- city is exactly a supported canonical city ID;
- every locality ID exists, is supported and belongs to that city;
- locality IDs are distinct and count is within the intent's limits;
- flexibility is explicit and consistent with list cardinality;
- `HAVE_ROOM` cannot use a flexible location;
- display labels, search phrases and aliases are not valid stored IDs.

Return a field-level `422 VALIDATION_ERROR` for unknown cities, unknown/retired localities or mismatched parents. The client refreshes the catalogue and preserves other onboarding answers when a stale selection needs correction. A malicious direct API request cannot bypass the list.

Existing proposed Prisma fields already fit: `HousingPreference.city` stores a city ID and `preferredLocations` stores locality IDs as text arrays. No schema change is needed for this planning decision. Static catalogue membership is application validation, not a database foreign key; all writes must use the backend's validated paths. If admin editing or independent geography queries later become necessary, migrate to City/Locality reference tables then.

## 7. Delivery order and checks

1. Review the exact catalogue and aliases for local naming/overlap ambiguities; keep IDs stable and record release version.
2. Create the one backend catalogue and public read endpoint.
3. Add authoritative backend membership/cardinality checks to housing save and final completion.
4. Implement the city-then-locality selector, explicit supported-area flexibility, city-change clearing and no-result state.
5. Use canonical labels in review and future public housing summaries.
6. Test cross-city tampering, unknown IDs, duplicate IDs, inactive choices, noncanonical aliases, both flexibility modes, the five-choice limit, city changes, catalogue-load failure and stale cached data.
7. Verify known aliases such as Gurgaon and Noida Extension return the intended buckets, and Sector 15 selections remain distinct across cities.
8. Keep the existing health endpoint independent of catalogue/database availability.

Do not remove a published ID just because its display label changes. For future retirement, retain its label for historical display, reject new selection, prompt drafts to choose an active replacement, and exclude unsupported housing from future discovery until corrected. Never silently remap a saved place to another city/locality. No live inventory or commute guarantees are implied by catalogue membership.

## 8. Deferred coverage and research limits

Do not include the remaining NCR districts or automatically add Sohna, Manesar, Bahadurgarh, Sonipat, Panipat, Meerut, Hapur, Bhiwadi, Neemrana or the Yamuna Expressway/Jewar belt in v1. Their wider NCR inclusion, district relationship or future infrastructure does not make them a supported Flatter locality. They can be reviewed in a later coverage release.

This is a curated starting allowlist, not an exhaustive administrative gazetteer or validated rental-supply database. City/locality inclusion is informed by the sources above and product judgment. Some authority pages were inaccessible during browsing; no unavailable page was treated as a completed boundary verification. No rent figures, safety ratings, occupancy volumes or guaranteed transit/commute times are used to justify onboarding claims.

The earlier onboarding plan's unknown launch-city decision is replaced by this proposal. Launch remains Delhi NCR only; additional cities or localities require a deliberate catalogue release, not user-generated free text. No database connection, Neon branch or compute is needed to write/review this plan.

## 9. Final numbered sequence — allowed location selection and validation

```mermaid
sequenceDiagram
    autonumber
    actor Person
    participant UI as Housing onboarding step
    participant Catalogue as Public location catalogue API
    participant API as Express housing validator
    participant DB as Neon through Prisma
    Note over Person,DB: Proposed flow - only the listed Delhi NCR service area is selectable
    UI->>Catalogue: GET /api/locations
    alt Catalogue cannot load
        Catalogue-->>UI: Error
        UI-->>Person: Show retry; do not allow free-text save
    else Catalogue available
        Catalogue-->>UI: Version, six cities, their localities and search aliases
        UI-->>Person: Show supported city selector
        Person->>UI: Search and select a canonical city option
        UI->>UI: Filter localities by selected parent city
        alt Person searches an unsupported place
            UI-->>Person: Not supported yet; select a listed area
        else Person chooses supported housing locations
            alt HAVE_ROOM
                Person->>UI: Select exactly one actual flat locality
                UI->>UI: Set locationsFlexible false
            else NEED_ROOM or TEAM_UP
                Person->>UI: Select 1-5 localities or Any supported area in this city
                UI->>UI: Explicit flexible choice clears the locality list
            end
            opt Person changes city
                UI->>UI: Clear previous localities and reset flexibility
                UI-->>Person: Ask for new supported location choices
            end
            Person->>UI: Continue
            UI->>API: Authenticated housing PATCH with city/locality IDs and revision
            API->>API: Verify Clerk owner and current catalogue membership
            API->>API: Validate parent city, duplicates, intent, count and flexibility
            alt Unknown ID, wrong parent or invalid selection
                API-->>UI: 422 field errors; no database write
                UI-->>Person: Preserve other answers and correct locations
            else Allowed selection and current revision
                API->>DB: Transaction: check/lock User revision and save HousingPreference
                DB-->>API: Commit and new revision
                API-->>UI: Saved canonical IDs
                UI-->>Person: Advance; later review shows locality and city labels
            end
        end
    end
    Note over Person,DB: Finalization independently validates location membership again
    Person->>UI: Review and Finish onboarding
    UI->>API: POST complete with current revision and visibility choice
    API->>DB: Transaction: check/lock revision and load persisted answers
    API->>API: Validate all sections and supported city/locality IDs
    alt Any saved answer is invalid or unsupported
        API->>DB: Roll back
        API-->>UI: Field errors or conflict; edit/reload before retrying
    else All answers are valid
        API->>DB: Commit completion and explicit discovery visibility
        API-->>UI: Completed state
        UI-->>Person: Success then /route
    end
    Note over Catalogue,API: Both use one static catalogue; no DB-backed search or external maps lookup
```
