# Bharat Vyapar 3D: Asset Licence Log

| Asset | Source | Licence | Status |
|---|---|---|---|
| Tile / token / landmark glyphs | Unicode emoji rendered by the user's OS font | System font licence | Placeholder. Replace with commissioned landmark art |
| Sound effects | Synthesised at runtime with WebAudio (`src/lib/sfx.ts`) | Original, no external samples | Final for web build |
| Board, dice, boxes, UI | CSS 3D, original (`src/app/globals.css`) | Original | Final for web build |
| City hero images (22 x 1024px) and tile thumbnails (22 x 512px) | **Not created** | Needs commissioned illustrations or licensed photos, with source + licence line per image | OPEN |
| 3D landmark models (5k-15k tris, 3 LODs) | **Not created** | Needs commission (Unity build) | OPEN |
| Music (adaptive Indian + electronic stems) | **Not created** | Needs commission | OPEN |
| Voice announcer | **Not created** | Needs commission | OPEN |

Unity / Android (AAB/APK), Nakama, Firebase, Play Billing and AdMob cannot be built in this environment. This web build implements the rules engine, AI, server-authoritative play and UI. `src/core` has no framework dependencies, so it can be ported to a Unity C# library.
