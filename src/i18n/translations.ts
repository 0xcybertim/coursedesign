export type AppLanguage = "en" | "nl";

export const APP_LANGUAGE_STORAGE_KEY = "course-design-language";

const DUTCH_TEXT: Readonly<Record<string, string>> = {
  "Course Design": "Course Design",
  "Customize a jump · Course Design": "Sprong aanpassen · Course Design",
  "Course Review · Course Design": "Parcoursbeoordeling · Course Design",
  "Designs · Course Design": "Ontwerpen · Course Design",
  "Courses · Course Design": "Parcoursen · Course Design",
  "Developer Lab · Course Design": "Ontwikkelaarslab · Course Design",
  Home: "Overzicht",
  Designs: "Ontwerpen",
  Courses: "Parcoursen",
  Lab: "Lab",
  "Developer Lab": "Ontwikkelaarslab",
  "Primary navigation": "Hoofdnavigatie",
  Navigation: "Navigatie",
  Menu: "Menu",
  Close: "Sluiten",
  "Skip to page content": "Naar pagina-inhoud",
  "Customize jump": "Sprong aanpassen",
  Customize: "Aanpassen",
  "Customize a jump": "Pas een sprong aan",
  "Local prototype · saved in this browser":
    "Lokaal prototype · opgeslagen in deze browser",
  "Temporary session · browser storage unavailable":
    "Tijdelijke sessie · browseropslag niet beschikbaar",
  "Browser-local work stays on this device and is not backed up.":
    "Werk in deze browser blijft op dit apparaat en heeft geen back-up.",
  Breadcrumb: "Kruimelpad",
  "Date unavailable": "Datum niet beschikbaar",
  "Browser-local design workspace": "Lokale ontwerpwerkruimte",
  "Customize a jump. Build a course.": "Pas een sprong aan. Bouw een parcours.",
  "Customize or create an obstacle, save an exact revision, then place that revision intentionally in Local Course 01.":
    "Pas een hindernis aan of maak er een, sla een exacte revisie op en plaats die revisie bewust in Lokaal Parcours 01.",
  "Exact revisions": "Exacte revisies",
  "Immutable local history": "Onveranderlijke lokale geschiedenis",
  Start: "Begin",
  "One complete jump": "Eén complete sprong",
  "Choose the wing design": "Kies het vleugelontwerp",
  "Use standard panels, describe custom wings, or upload an image.":
    "Gebruik standaardpanelen, beschrijf aangepaste vleugels of upload een afbeelding.",
  "Start customizing": "Begin met aanpassen",
  "Continue standard jump": "Ga verder met standaardsprong",
  "Return directly to its colors, lower element, and artwork.":
    "Ga direct terug naar de kleuren, het onderste element en de illustratie.",
  "Continue standard customization": "Ga verder met de standaardaanpassing",
  "Loading local workspace": "Lokale werkruimte laden",
  "Some local work needs attention.": "Sommig lokaal werk vraagt aandacht.",
  "Open details": "Details openen",
  Resume: "Hervatten",
  "Continue work": "Ga verder met je werk",
  "No work in progress yet.": "Er is nog geen werk in uitvoering.",
  Continue: "Doorgaan",
  "Saved revisions": "Opgeslagen revisies",
  "Recent designs": "Recente ontwerpen",
  "View all designs": "Alle ontwerpen bekijken",
  "Designs appear here after you save an immutable revision.":
    "Ontwerpen verschijnen hier nadat je een onveranderlijke revisie hebt opgeslagen.",
  Configured: "Geconfigureerd",
  "Generated · inferred": "Gegenereerd · afgeleid",
  revision: "revisie",
  revisions: "revisies",
  "View design": "Ontwerp bekijken",
  "Current course": "Huidig parcours",
  placements: "plaatsingen",
  "planning warnings": "planningswaarschuwingen",
  "Not started": "Niet gestart",
  "last local update": "laatste lokale update",
  "Edit course": "Parcours bewerken",
  "Review course": "Parcours beoordelen",
  "Customize a jump first": "Pas eerst een sprong aan",
  "Saved in this browser": "Opgeslagen in deze browser",
  "Every item groups immutable revisions of one exact obstacle design. Existing course placements keep the revision they already pin.":
    "Elk item groepeert onveranderlijke revisies van één exact hindernisontwerp. Bestaande plaatsingen behouden de revisie die al is vastgezet.",
  "Loading design library": "Ontwerpbibliotheek laden",
  "Saved designs are unavailable.":
    "Opgeslagen ontwerpen zijn niet beschikbaar.",
  "No stored value was overwritten.":
    "Er is geen opgeslagen waarde overschreven.",
  "No saved revisions": "Geen opgeslagen revisies",
  "Save a revision to build your design library.":
    "Sla een revisie op om je ontwerpbibliotheek op te bouwen.",
  "A working draft is not an immutable revision and will stay under Continue work until you save it.":
    "Een werkconcept is geen onveranderlijke revisie en blijft onder Ga verder met je werk staan totdat je het opslaat.",
  "Continue SPJ-04 draft": "Ga verder met het SPJ-04-concept",
  "Customize your first jump": "Pas je eerste sprong aan",
  "Latest Revision": "Laatste revisie",
  saved: "opgeslagen",
  "Saved locally · existing placements never auto-update":
    "Lokaal opgeslagen · bestaande plaatsingen worden nooit automatisch bijgewerkt",
  "Add latest revision to course": "Voeg laatste revisie toe aan parcours",
  "Design not found in this browser.": "Ontwerp niet gevonden in deze browser.",
  "The route does not contain a valid local design identifier.":
    "De route bevat geen geldige lokale ontwerpidentificatie.",
  "Return to Designs": "Terug naar Ontwerpen",
  "Loading design": "Ontwerp laden",
  "SPJ-04 has no saved revisions yet.":
    "SPJ-04 heeft nog geen opgeslagen revisies.",
  "The working draft is still available. Save an immutable revision before adding it to a course.":
    "Het werkconcept is nog beschikbaar. Sla een onveranderlijke revisie op voordat je die aan een parcours toevoegt.",
  "No trusted saved revision matches this design identifier.":
    "Geen betrouwbare opgeslagen revisie komt overeen met deze ontwerpidentificatie.",
  "Edit working draft": "Werkconcept bewerken",
  "Create another from a new source":
    "Maak een nieuw ontwerp uit een nieuwe bron",
  "Open saved revision": "Opgeslagen revisie openen",
  "Create new revision from this": "Maak hiervan een nieuwe revisie",
  "Immutable history": "Onveranderlijke geschiedenis",
  "Working draft": "Werkconcept",
  "remains separate from every saved revision.":
    "blijft gescheiden van elke opgeslagen revisie.",
  "Technical evidence": "Technisch bewijs",
  "Exact saved identity": "Exact opgeslagen identiteit",
  "Design ID": "Ontwerp-ID",
  "Revision ID": "Revisie-ID",
  "Configuration identity": "Configuratie-identiteit",
  "One jump customizer": "Configurator voor één sprong",
  "Start with the same four-pole vertical jump, then choose how its wings should look. Colors, wing shape, preview, revision history, and course placement belong to one jump design.":
    "Begin met dezelfde verticale sprong met vier palen en kies daarna hoe de vleugels eruitzien. Kleuren, vleugelvorm, voorvertoning, revisiegeschiedenis en plaatsing horen bij één sprongontwerp.",
  "01 / Jump foundation": "01 / Basis van de sprong",
  "Controlled vertical structure": "Gecontroleerde verticale structuur",
  "One jump. Different wings.": "Eén sprong. Verschillende vleugels.",
  "Every path starts with four poles and the current prototype support system. Choosing custom wings changes the wing profile—not the evidence status of the structure.":
    "Elke route begint met vier palen en het huidige prototype-draagsysteem. Aangepaste vleugels veranderen het vleugelprofiel, niet de bewijsstatus van de structuur.",
  Structure: "Structuur",
  "Four-pole vertical": "Verticaal met vier palen",
  Preview: "Voorvertoning",
  "Matching 2.5D and 3D": "Overeenkomende 2,5D en 3D",
  "Save model": "Opslagmodel",
  "Exact immutable revision": "Exacte onveranderlijke revisie",
  "02 / Wing design": "02 / Vleugelontwerp",
  "Choose how to begin": "Kies hoe je wilt beginnen",
  "How should the wings look?": "Hoe moeten de vleugels eruitzien?",
  "Standard panels go directly to appearance controls. Described and uploaded wings add a silhouette review before returning to the same complete-jump preview and save step.":
    "Standaardpanelen gaan direct naar de vormgevingsopties. Beschreven en geüploade vleugels krijgen eerst een silhouetcontrole en keren daarna terug naar dezelfde complete sprong en opslagstap.",
  "Standard wing panels": "Standaard vleugelpanelen",
  "Customize the existing jump": "Pas de bestaande sprong aan",
  "Choose frame color, lower element, and logo artwork on the known rectangular wing panels.":
    "Kies de framekleur, het onderste element en logo-illustraties op de bekende rechthoekige vleugelpanelen.",
  "Use standard wings": "Gebruik standaardvleugels",
  "Custom silhouette": "Aangepast silhouet",
  "Describe the wings": "Beschrijf de vleugels",
  "Describe a subject, colors, and style. Select one concept, inspect its silhouette, then customize and save the complete jump.":
    "Beschrijf een onderwerp, kleuren en stijl. Kies één concept, controleer het silhouet en pas daarna de complete sprong aan en sla die op.",
  "Describe custom wings": "Beschrijf aangepaste vleugels",
  "Workflow simulator": "Workflowsimulator",
  "Concept generation is not configured in this local environment.":
    "Conceptgeneratie is niet geconfigureerd in deze lokale omgeving.",
  "Upload an image": "Upload een afbeelding",
  "Use one owned PNG or JPEG. Remove the background only after the explicit permission checks, then inspect the inferred profile.":
    "Gebruik één eigen PNG- of JPEG-bestand. Verwijder de achtergrond pas na de expliciete toestemmingscontroles en bekijk daarna het afgeleide profiel.",
  "Upload a wing image": "Upload een vleugelafbeelding",
  "03 / Complete jump": "03 / Complete sprong",
  "Customize, preview, save, then place.": "Pas aan, bekijk, sla op en plaats.",
  "A custom silhouette is not a separate product. Once approved, it becomes the wing design inside one complete jump revision that can be added to your course.":
    "Een aangepast silhouet is geen apart product. Na goedkeuring wordt het het vleugelontwerp binnen één complete sprongrevisie die aan je parcours kan worden toegevoegd.",
  "Browser-local course": "Lokaal parcours",
  "This prototype contains one 60 × 40 m course that pins exact saved design revisions.":
    "Dit prototype bevat één parcours van 60 × 40 m dat exacte opgeslagen ontwerprevisies vastzet.",
  "Loading courses": "Parcoursen laden",
  "Local Course 01 is unavailable.": "Lokaal Parcours 01 is niet beschikbaar.",
  "60 × 40 m prototype arena": "60 × 40 m prototypepiste",
  Placements: "Plaatsingen",
  "Planning warnings": "Planningswaarschuwingen",
  Persistence: "Opslag",
  "Review becomes available after the first placement.":
    "Beoordelen wordt beschikbaar na de eerste plaatsing.",
  "Local prototype": "Lokaal prototype",
  "Saved only in this browser. There is no account, backup, synchronization, or cross-device access.":
    "Alleen opgeslagen in deze browser. Er is geen account, back-up, synchronisatie of toegang op andere apparaten.",
  "Visual concept": "Visueel concept",
  "Concept imagery is not obstacle geometry, supplier truth, or a production specification.":
    "Conceptbeelden zijn geen hindernisgeometrie, leverancierswaarheid of productiespecificatie.",
  "The silhouette, dimensions, supports, and quantities are inferred and not supplier-confirmed.":
    "Het silhouet, de afmetingen, steunen en aantallen zijn afgeleid en niet door een leverancier bevestigd.",
  "Planning prototype": "Planningsprototype",
  "Course geometry is advisory planning information, not safety, federation, venue, or production certification.":
    "Parcoursgeometrie is adviserend planningsmateriaal, geen veiligheids-, federatie-, locatie- of productiecertificering.",
  "External processing": "Externe verwerking",
  "Image processing happens only after the explicit rights, privacy, person, and single-subject confirmations and one user action.":
    "Beeldverwerking gebeurt pas na expliciete bevestiging van rechten, privacy, personen en één onderwerp, gevolgd door één gebruikersactie.",
  "Technical boundary": "Technische grens",
  "Non-sellable prototype": "Niet-verkoopbaar prototype",
  "Jump customizer": "Sprongconfigurator",
  "Four-pole vertical · Custom wings":
    "Verticaal met vier palen · aangepaste vleugels",
  "Working draft · controlled configuration":
    "Werkconcept · gecontroleerde configuratie",
  "5,100 mm prototype envelope": "Prototype-omtrek van 5.100 mm",
  "01 / Wing style": "01 / Vleugelstijl",
  "Wing style": "Vleugelstijl",
  Included: "Inbegrepen",
  "Standard panels": "Standaardpanelen",
  "Rectangular panels with color, lower element, and logo artwork.":
    "Rechthoekige panelen met kleur, onderste element en logo-illustratie.",
  "Advanced customization": "Geavanceerd aanpassen",
  "Create a visual direction, approve its silhouette, and color the complete jump.":
    "Maak een visuele richting, keur het silhouet goed en geef de complete sprong kleur.",
  "Start from one owned image, inspect the inferred profile, and color the complete jump.":
    "Begin met één eigen afbeelding, bekijk het afgeleide profiel en geef de complete sprong kleur.",
  Selected: "Geselecteerd",
  Choose: "Kiezen",
  "02 / Appearance": "02 / Vormgeving",
  "Customize the standard panels": "Pas de standaardpanelen aan",
  "Frame color": "Framekleur",
  "inferred palette": "afgeleid palet",
  White: "Wit",
  Blue: "Blauw",
  Red: "Rood",
  Yellow: "Geel",
  Prototype: "Prototype",
  "Lower element": "Onderste element",
  "one optional slot": "één optionele positie",
  None: "Geen",
  Panel: "Paneel",
  Gate: "Poort",
  Filler: "Vulling",
  "Pole treatment": "Paalafwerking",
  "Blue + white · alternating": "Blauw + wit · afwisselend",
  "Read-only · only evidenced prototype treatment":
    "Alleen-lezen · enige onderbouwde prototype-afwerking",
  Artwork: "Illustratie",
  "Fixed panel slots · browser-local prototype assets":
    "Vaste paneelposities · lokale prototypebestanden",
  "Club Classic · both wing panels": "Club Classic · beide vleugelpanelen",
  "Customize logo artwork": "Logo-illustratie aanpassen",
  "Edit logo artwork": "Logo-illustratie bewerken",
  "Provisional supplier evidence": "Voorlopig leveranciersbewijs",
  "No option surcharge is confirmed.": "Er is geen optietoeslag bevestigd.",
  "Save a revision to add it to a course.":
    "Sla een revisie op om die aan een parcours toe te voegen.",
  "02 / Advanced customization": "02 / Geavanceerd aanpassen",
  "Description generation is unavailable.":
    "Genereren vanuit een beschrijving is niet beschikbaar.",
  "Turn the description into custom wings":
    "Zet de beschrijving om in aangepaste vleugels",
  "Describe the custom wings": "Beschrijf de aangepaste vleugels",
  "Build custom wings from an image":
    "Maak aangepaste vleugels uit een afbeelding",
  "02 / Local design record": "02 / Lokaal ontwerpbestand",
  "Read-only saved revision": "Opgeslagen revisie · alleen-lezen",
  "Mutable draft": "Bewerkbaar concept",
  "Club Classic · working copy": "Club Classic · werkversie",
  Version: "Versie",
  Frame: "Frame",
  Lower: "Onderkant",
  "No saved revisions yet": "Nog geen opgeslagen revisies",
  "03 / Derived evidence": "03 / Afgeleid bewijs",
  "One configuration, six projections.": "Eén configuratie, zes projecties.",
  Compatibility: "Compatibiliteit",
  "2 wing assemblies": "2 vleugelassemblages",
  "4 poles remain fixed": "4 palen blijven vast",
  "8 cups or adapters": "8 lepels of adapters",
  "Bill of materials": "Materiaallijst",
  "Prototype component": "Prototypeonderdeel",
  Qty: "Aantal",
  "Course footprint": "Parcoursvoetafdruk",
  "Anchor · midpoint of primary pole centerline":
    "Anker · middelpunt van de hartlijn van de hoofdpalen",
  "Production-spec preview": "Voorvertoning productiespecificatie",
  "Machine-readable preview": "Machineleesbare voorvertoning",
  "Local Course 01": "Lokaal Parcours 01",
  "60 × 40 m · prototype arena": "60 × 40 m · prototypepiste",
  "Browser-local · clearing storage removes this course":
    "Lokaal in browser · opslag wissen verwijdert dit parcours",
  "Saved designs": "Opgeslagen ontwerpen",
  "Place a revision": "Plaats een revisie",
  "Each placement pins this exact immutable revision.":
    "Elke plaatsing zet deze exacte onveranderlijke revisie vast.",
  "Loading saved revisions…": "Opgeslagen revisies laden…",
  "No example or fake placement has been inserted.":
    "Er is geen voorbeeld- of nepplaatsing toegevoegd.",
  "Course workspace": "Parcourswerkruimte",
  "Prototype arena": "Prototypepiste",
  "Arena view": "Pisteweergave",
  "3D arena": "3D-piste",
  "Loading 3D…": "3D laden…",
  "Place at least one obstacle to preview the course.":
    "Plaats minimaal één hindernis om het parcours te bekijken.",
  "The arena is ready.": "De piste is gereed.",
  "Arrow keys move": "Pijltjestoetsen verplaatsen",
  "Drag rotates · scroll zooms": "Slepen roteert · scrollen zoomt",
  "Horse POV · inferred route": "Paardenperspectief · afgeleide route",
  "Horse POV playback": "Afspelen paardenperspectief",
  "Course preview": "Parcoursvoorvertoning",
  Pause: "Pauzeren",
  Play: "Afspelen",
  "Preview speed": "Voorvertoningssnelheid",
  "Selected placement": "Geselecteerde plaatsing",
  "Select an obstacle": "Selecteer een hindernis",
  "Selected obstacle controls": "Bediening geselecteerde hindernis",
  "Visible movement step": "Zichtbare verplaatsingsstap",
  "Rotate left 15 degrees": "15 graden naar links draaien",
  "Rotate right 15 degrees": "15 graden naar rechts draaien",
  "Course notes": "Parcoursnotities",
  "Purchase-planning geometry": "Geometrie voor aankoopplanning",
  "Equipment summary": "Materiaalsamenvatting",
  "Pinned quantities": "Vastgezette aantallen",
  "Aggregated only from the exact saved snapshots used here.":
    "Alleen opgeteld uit de exacte opgeslagen momentopnamen die hier zijn gebruikt.",
  "Obstacle instances": "Hindernisinstanties",
  "Wing assemblies / silhouette plates": "Vleugelassemblages / silhouetplaten",
  Poles: "Palen",
  "Cups / release adapters": "Lepels / veiligheidsadapters",
  "Track assemblies": "Railassemblages",
  "Foot / ballast assemblies": "Voet- / ballastassemblages",
  Flags: "Vlaggen",
  "Pole end caps": "Paaldoppen",
  "Course Review": "Parcoursbeoordeling",
  "Local Course 01 · exact pinned revisions":
    "Lokaal Parcours 01 · exact vastgezette revisies",
  "Return to editable course": "Terug naar bewerkbaar parcours",
  "Browser-local inspection artifact": "Lokaal beoordelingsdocument",
  "Complete local review": "Volledige lokale beoordeling",
  "Incomplete · unsuitable for production":
    "Onvolledig · ongeschikt voor productie",
  "Course review hash": "Hash van parcoursbeoordeling",
  "Stable course-review hash · SHA-256":
    "Stabiele hash van parcoursbeoordeling · SHA-256",
  "Course draft": "Parcoursconcept",
  "Arena contract": "Pistecontract",
  "01 · Arena overview": "01 · Piste-overzicht",
  "Top-down placement plan": "Plaatsingsplan van bovenaf",
  "Read-only · coordinates from upper-left":
    "Alleen-lezen · coördinaten vanaf linksboven",
  "02 · Placement register": "02 · Plaatsingsregister",
  "Pinned revision evidence": "Bewijs van vastgezette revisies",
  "Sorted by display number": "Gesorteerd op volgnummer",
  Position: "Positie",
  Rotation: "Rotatie",
  "Pinned revision": "Vastgezette revisie",
  "Configuration hash": "Configuratiehash",
  "Product evidence": "Productbewijs",
  "Update this placement": "Werk deze plaatsing bij",
  "Replace all using this revision": "Vervang alles met deze revisie",
  "No placement rows to review.": "Geen plaatsingsregels om te beoordelen.",
  "03 · Geometry warnings": "03 · Geometriewaarschuwingen",
  "Planning checks": "Planningscontroles",
  "04 · Equipment quantities": "04 · Materiaalaantallen",
  "Exact pinned roll-up": "Exacte optelling van vastgezette revisies",
  "05 · Human-readable specification": "05 · Leesbare specificatie",
  "Course production-spec preview":
    "Voorvertoning parcoursproductiespecificatie",
  "Prototype preview · not for production":
    "Prototypevoorvertoning · niet voor productie",
  "Placement instructions": "Plaatsingsinstructies",
  "No placement instructions.": "Geen plaatsingsinstructies.",
  "Prototype quantity statement": "Overzicht prototypeaantallen",
  "06 · Machine-readable specification": "06 · Machineleesbare specificatie",
  "Deterministic JSON preview": "Deterministische JSON-voorvertoning",
  "Copy JSON": "JSON kopiëren",
  "JSON copied": "JSON gekopieerd",
  "Copy unavailable": "Kopiëren niet beschikbaar",
  "Prototype boundary": "Prototypegrens",
  "Not suitable for production": "Niet geschikt voor productie",
  Source: "Bron",
  Destination: "Doel",
  "Equipment quantities": "Materiaalaantallen",
  "Exact pinned bill-of-materials derivation":
    "Exacte afleiding uit de vastgezette materiaallijst",
  Equipment: "Materiaal",
  Before: "Voor",
  After: "Na",
  Delta: "Verschil",
  "Geometry warnings": "Geometriewaarschuwingen",
  "No overlap or boundary warnings.": "Geen overlap- of grenswaarschuwingen.",
  "Course-review identity": "Identiteit van parcoursbeoordeling",
  "Current course-review hash": "Huidige hash van parcoursbeoordeling",
  "Proposed course-review hash": "Voorgestelde hash van parcoursbeoordeling",
  "Preview validation": "Voorvertoning valideren",
  "Confirm placement update": "Bevestig bijgewerkte plaatsing",
  "Confirm exact replace-all": "Bevestig exact alles vervangen",
  "Close update preview": "Voorvertoning sluiten",
  "Revision route": "Revisieroute",
  "Before update": "Voor bijwerken",
  "After update": "Na bijwerken",
  Unavailable: "Niet beschikbaar",
  "Unavailable on this device": "Niet beschikbaar op dit apparaat",
  "Your jump.": "Jouw sprong.",
  "Your wings.": "Jouw vleugels.",
  "Choose the wing style, customize its appearance, preview the complete four-pole jump, then save one exact revision.":
    "Kies de vleugelstijl, pas de vormgeving aan, bekijk de complete sprong met vier palen en sla daarna één exacte revisie op.",
  "Interactive 3D is unavailable on this device. The accurate 2.5D view remains active.":
    "Interactieve 3D is niet beschikbaar op dit apparaat. De nauwkeurige 2,5D-weergave blijft actief.",
  "2.5D ready · checking 3D capability":
    "2,5D gereed · 3D-mogelijkheid controleren",
  "2.5D ready · loading interactive 3D": "2,5D gereed · interactieve 3D laden",
  "2.5D ready · interactive 3D ready": "2,5D gereed · interactieve 3D gereed",
  "Standard is included. Description and image are advanced customizations · quote impact unknown.":
    "Standaard is inbegrepen. Beschrijving en afbeelding zijn geavanceerde aanpassingen · invloed op offerte onbekend.",
  "Prototype supplier example · CNY 9,000 · excludes tax, freight and retail markup":
    "Voorbeeld van prototypeleverancier · CNY 9.000 · exclusief belasting, transport en winkelmarge",
  "Save immutable revision": "Onveranderlijke revisie opslaan",
  "Add to course": "Aan parcours toevoegen",
  "Draft here. History pinned.": "Concept hier. Geschiedenis vastgezet.",
  "Draft saved on this device": "Concept opgeslagen op dit apparaat",
  "Browser-local on this device · no account or cloud copy":
    "Lokaal op dit apparaat · geen account of cloudkopie",
  "Changes replace this one working copy and restore automatically in this browser.":
    "Wijzigingen vervangen deze ene werkversie en worden automatisch hersteld in deze browser.",
  "New saves append. Existing revisions are never overwritten.":
    "Nieuwe opslagmomenten worden toegevoegd. Bestaande revisies worden nooit overschreven.",
  "saved revisions": "opgeslagen revisies",
  "lower element in one exclusive slot":
    "onderste element in één exclusieve positie",
  "Configure the obstacle, then save an immutable browser-local checkpoint.":
    "Configureer de hindernis en sla daarna een onveranderlijk lokaal controlepunt op.",
  "Every panel below carries the same normalized configuration hash.":
    "Elk paneel hieronder gebruikt dezelfde genormaliseerde configuratiehash.",
  "Compatible within prototype rules": "Compatibel binnen de prototyperegels",
  "Inferred product-design compatibility. Not supplier-confirmed.":
    "Afgeleide compatibiliteit van het productontwerp. Niet door een leverancier bevestigd.",
  "Printed wing assembly": "Bedrukte vleugelassemblage",
  "Aluminum jump pole": "Aluminium springpaal",
  "Cup or release adapter": "Lepel of veiligheidsadapter",
  "Keyhole track assembly": "Sleutelgatrailassemblage",
  "Foot or ballast assembly": "Voet- of ballastassemblage",
  Flag: "Vlag",
  "Pole end cap": "Paaldop",
  "Prototype-only. Not for survey, safety validation or fabrication.":
    "Alleen prototype. Niet voor inmeting, veiligheidsvalidatie of fabricage.",
  "Four poles · blue and white alternating treatment":
    "Vier palen · afwisselend blauw-witte afwerking",
  "No lower element · fixed artwork on both wing panels":
    "Geen onderste element · vaste illustratie op beide vleugelpanelen",
  "Preview only · not supplier-approved · not for production":
    "Alleen voorvertoning · niet goedgekeurd door leverancier · niet voor productie",
  "Drafts, artwork, revisions, and course placements exist only in this browser. No account, server persistence, cross-device sync, sharing, ordering, checkout, delivery promise, supplier approval, production claim, or safety claim is provided.":
    "Concepten, illustraties, revisies en parcoursplaatsingen bestaan alleen in deze browser. Er is geen account, serveropslag, synchronisatie tussen apparaten, delen, bestellen, afrekenen, leverbelofte, leveranciersgoedkeuring, productieclaim of veiligheidsclaim.",
  "Course saved on this device": "Parcours opgeslagen op dit apparaat",
  "Your course starts with a saved obstacle revision.":
    "Je parcours begint met een opgeslagen hindernisrevisie.",
  "Create and save an obstacle": "Maak een hindernis en sla die op",
  "2D plan": "2D-plan",
  "Horse POV": "Paardenperspectief",
  "Choose a saved revision and place it in the center.":
    "Kies een opgeslagen revisie en plaats die in het midden.",
  "Editable 2D plan ready · 3D arena and Horse POV available on request":
    "Bewerkbaar 2D-plan gereed · 3D-piste en paardenperspectief beschikbaar op aanvraag",
  "Editable 2D plan ready · interactive 3D arena ready":
    "Bewerkbaar 2D-plan gereed · interactieve 3D-piste gereed",
  "Editable 2D plan ready · loading interactive 3D arena":
    "Bewerkbaar 2D-plan gereed · interactieve 3D-piste laden",
  "Horse POV ready · inferred route through the saved obstacle order":
    "Paardenperspectief gereed · afgeleide route langs de opgeslagen hindernisvolgorde",
  "Editable 2D plan ready · loading Horse POV preview":
    "Bewerkbaar 2D-plan gereed · paardenperspectief laden",
  "Editable 2D plan ready · 3D arena and Horse POV ready":
    "Bewerkbaar 2D-plan gereed · 3D-piste en paardenperspectief gereed",
  Remove: "Verwijderen",
  "No overlap or boundary warnings in the current arrangement.":
    "Geen overlap- of grenswaarschuwingen in de huidige opstelling.",
  "Advisory only. These are purchase-planning geometry warnings—not safety, federation, regulatory, course-validity, or venue-measurement certification.":
    "Alleen adviserend. Dit zijn geometriewaarschuwingen voor aankoopplanning, geen certificering voor veiligheid, federatie, regelgeving, parcoursgeldigheid of locatiemeting.",
  "No retail total, delivered price, freight, tax, duty, margin, checkout, factory quantity, or production approval.":
    "Geen winkeltotaal, bezorgprijs, transport, belasting, invoerrechten, marge, afrekenen, fabrieksaantal of productiegoedkeuring.",
  "Course workspace loading.": "Parcourswerkruimte laden.",
  "Arena environment": "Pisteomgeving",
  "Surface and scenery": "Ondergrond en aankleding",
  "Visual planning layer · excluded from obstacle warnings and equipment quantities.":
    "Visuele planningslaag · uitgesloten van hinderniswaarschuwingen en materiaalaantallen.",
  Ground: "Ondergrond",
  Sand: "Zand",
  Grass: "Gras",
  "Place scenery": "Plaats aankleding",
  "Palm tree": "Palmboom",
  "Leafy tree": "Loofboom",
  "Flower box": "Bloembak",
  "Add palm tree": "Palmboom toevoegen",
  "Add leafy tree": "Loofboom toevoegen",
  "Add flower box": "Bloembak toevoegen",
  "Selected scenery": "Geselecteerde aankleding",
  "Selected scenery controls": "Bediening geselecteerde aankleding",
  "Move scenery left 2 m": "Verplaats aankleding 2 m naar links",
  "Move scenery up 2 m": "Verplaats aankleding 2 m omhoog",
  "Move scenery down 2 m": "Verplaats aankleding 2 m omlaag",
  "Move scenery right 2 m": "Verplaats aankleding 2 m naar rechts",
  "Remove scenery": "Aankleding verwijderen",
  "Exact pinned revisions, arena placements, planning warnings, and prototype equipment quantities for Local course 01.":
    "Exact vastgezette revisies, pisteplaatsingen, planningswaarschuwingen en prototypeaantallen voor Lokaal Parcours 01.",
  "Browser-local course restored · updates require confirmation":
    "Lokaal parcours hersteld · wijzigingen vereisen bevestiging",
  "No placements in this browser-local course.":
    "Geen plaatsingen in dit lokale parcours.",
  "Exact Phase 1C semantics. Advisory only, not safety, federation, regulatory, course-validity, or venue-measurement certification.":
    "Exacte Phase 1C-semantiek. Alleen adviserend, geen certificering voor veiligheid, federatie, regelgeving, parcoursgeldigheid of locatiemeting.",
  "Browser-local only. Copying does not publish, upload, approve, or order this course.":
    "Alleen lokaal in de browser. Kopiëren publiceert, uploadt, keurt of bestelt dit parcours niet.",
  "Browser-local non-sellable prototype. This review is not supplier-approved, safety-certified, federation-validated, suitable for fabrication, or ready for production or ordering.":
    "Lokaal niet-verkoopbaar prototype. Deze beoordeling is niet goedgekeurd door een leverancier, veiligheid-gecertificeerd, gevalideerd door een federatie, geschikt voor fabricage of gereed voor productie of bestelling.",
  "No accounts, server persistence, cross-device sync, public sharing, or recovery.":
    "Geen accounts, serveropslag, synchronisatie tussen apparaten, openbaar delen of herstel.",
  "No automatic revision upgrades, downgrades, or revision mutation.":
    "Geen automatische revisie-upgrades, downgrades of revisiewijzigingen.",
  "No retail pricing, freight, tax, duty, margin, checkout, payment, or ordering.":
    "Geen winkelprijzen, transport, belasting, invoerrechten, marge, afrekenen, betaling of bestellen.",
  "No supplier approval, production-ready export, fabrication, safety, federation, regulatory, or course-validity certification.":
    "Geen leveranciersgoedkeuring, productiegereed exportbestand of certificering voor fabricage, veiligheid, federatie, regelgeving of parcoursgeldigheid.",
};

const DUTCH_PATTERNS: readonly [
  pattern: RegExp,
  replacement: string | ((match: RegExpMatchArray) => string),
][] = [
  [/^Revision (\d+)$/, "Revisie $1"],
  [
    /^Revision (\d+) · saved locally · exact immutable revision$/,
    "Revisie $1 · lokaal opgeslagen · exacte onveranderlijke revisie",
  ],
  [/^Add Revision (\d+) to course$/, "Voeg revisie $1 toe aan parcours"],
  [/^Working draft Version (\d+)$/, "Werkconcept versie $1"],
  [/^(\d+) saved revision$/, "$1 opgeslagen revisie"],
  [/^(\d+) saved revisions$/, "$1 opgeslagen revisies"],
  [
    /^Latest Revision (\d+) · (\d+) saved revision$/,
    "Laatste revisie $1 · $2 opgeslagen revisie",
  ],
  [
    /^Latest Revision (\d+) · (\d+) saved revisions$/,
    "Laatste revisie $1 · $2 opgeslagen revisies",
  ],
  [
    /^Revision (\d+) · (\d+) saved revision · (.+)$/,
    "Revisie $1 · $2 opgeslagen revisie · $3",
  ],
  [
    /^Revision (\d+) · (\d+) saved revisions · (.+)$/,
    "Revisie $1 · $2 opgeslagen revisies · $3",
  ],
  [/^(\d+) placements$/, "$1 plaatsingen"],
  [/^(\d+) planning warnings$/, "$1 planningswaarschuwingen"],
  [/^Version (\d+)$/, "Versie $1"],
  [
    /^(\d+) lower element in one exclusive slot$/,
    "$1 onderste element in één exclusieve positie",
  ],
  [
    /^SPJ-04 · Club Classic · (.+) frame$/,
    (match) => {
      const color =
        {
          white: "wit",
          blue: "blauw",
          red: "rood",
          yellow: "geel",
        }[match[1]?.toLocaleLowerCase("en") ?? ""] ??
        match[1] ??
        "";
      return `SPJ-04 · Club Classic · ${color} frame`;
    },
  ],
  [
    /^Prototype envelope (.+) · inferred, not for fabrication$/,
    "Prototype-omtrek $1 · afgeleid, niet voor fabricage",
  ],
  [
    /^Configuration updated: (.+) frame, (.+) lower element\. Hash (.+)$/,
    (match) =>
      `Configuratie bijgewerkt: ${translateInterfaceText(match[1] ?? "", "nl")} frame, ${translateInterfaceText(match[2] ?? "", "nl").toLocaleLowerCase("nl")} als onderste element. Hash ${match[3] ?? ""}`,
  ],
  [/^(\d+) obstacle instances$/, "$1 hindernisinstanties"],
  [
    /^(\d+) wing assemblies or silhouette plates$/,
    "$1 vleugelassemblages of silhouetplaten",
  ],
  [/^(\d+) poles$/, "$1 palen"],
  [/^(\d+) cups or release adapters$/, "$1 lepels of veiligheidsadapters"],
  [/^(\d+) track assemblies$/, "$1 railassemblages"],
  [/^(\d+) foot or ballast assemblies$/, "$1 voet- of ballastassemblages"],
  [/^(\d+) flags$/, "$1 vlaggen"],
  [/^(\d+) pole end caps$/, "$1 paaldoppen"],
  [/^Approaching jump (\d+) of (\d+)$/, "Nadert sprong $1 van $2"],
  [/^Jumping jump (\d+) of (\d+)$/, "Springt over sprong $1 van $2"],
  [/^Finished at jump (\d+) of (\d+)$/, "Klaar bij sprong $1 van $2"],
  [/^(.+) boundary$/, "$1-grens"],
];

export function isAppLanguage(value: string | null): value is AppLanguage {
  return value === "en" || value === "nl";
}

function preserveWhitespace(source: string, translated: string) {
  const leading = source.match(/^\s*/)?.[0] ?? "";
  const trailing = source.match(/\s*$/)?.[0] ?? "";
  return `${leading}${translated}${trailing}`;
}

export function translateInterfaceText(source: string, language: AppLanguage) {
  if (language === "en" || !source.trim()) return source;
  const trimmed = source.trim();
  const direct = DUTCH_TEXT[trimmed];
  if (direct) return preserveWhitespace(source, direct);
  for (const [pattern, replacement] of DUTCH_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;
    const translated =
      typeof replacement === "string"
        ? trimmed.replace(pattern, replacement)
        : replacement(match);
    return preserveWhitespace(source, translated);
  }
  return source;
}
