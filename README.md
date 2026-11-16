# Gulf Road Walk

A walkable 3D model of Kuwait's Arabian Gulf Road in the browser: about 17 km of coast from the Kuwait Towers, through Salmiya, down to Jumeirah Messilah Beach. Built with three.js from OpenStreetMap data, with satellite imagery streamed onto the ground.

## Run it

```bash
node serve.js
```

Then open http://localhost:8090/. It needs an internet connection for the satellite ground; without one it falls back to a plain map.

## Controls

| Key | Action |
|---|---|
| W A S D | Walk |
| Mouse / arrow keys | Look around |
| Shift | Run |
| Space | Jump (rise, when flying) |
| F | Toggle fly mode (fast, passes through buildings); C descends |
| G | Switch the ground between satellite photo and plain map |
| H | Shadows on / off |
| 1 – 7 | Jump to a landmark |

Landmarks: Kuwait Towers, Green Island, Al-Shaab Park, Marina Mall, The Scientific Center, Palms Beach, Jumeirah Messilah Beach.

## What is real and what is not

- **From OpenStreetMap:** building footprints, roads and footpaths, coastline, beaches, parks, piers and place names within roughly 650 m of the road.
- **Estimated:** most building heights. Only a few percent of buildings carry a height or floor count, so the rest are guessed from footprint size and type.
- **Hand-modelled from references:** the Kuwait Towers, Marina Mall's roof, dome and footbridge, and the Scientific Center's sails, solar roof and dhow. These were placed by eye from satellite imagery and reference photos.
- **Decorative:** palms, street lights, moored boats and the window patterns on buildings.
- **Missing:** terrain height (the ground is flat) and photographic building textures.

## How it is put together

- `index.html` — the whole viewer.
- `scene.json` — the compact scene the viewer loads.
- `data/process.js` — rebuilds `scene.json` from the raw OpenStreetMap downloads in `data/` (`node data/process.js`).
- `data/t*.txt`, `data/q4.txt` — the Overpass API queries the raw data came from.
- `three.module.min.js` — three.js r160, vendored.

## Credits and licences

- Map data © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors, available under the Open Database License (ODbL). `scene.json` and the files in `data/` are derived from it and carry the same licence.
- Ground imagery is streamed at runtime from Esri World Imagery (© Esri, Maxar, Earthstar Geographics) and is not stored in this repository.
- [three.js](https://threejs.org/) is MIT licensed.
